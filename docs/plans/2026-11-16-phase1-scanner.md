# Hero Sheet Phase 1 (Scanner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command, `hero-sheet scan`, that reads a Claude Code setup read-only and writes `state.json` listing every installed item with usage, verdict and update flag.

**Architecture:** Independent scanners each return `Item[]` for one source. A usage layer returns `Usage` keyed by item id. A join step merges them into `Card[]`, adds verdicts, update flags and rule-check results, appends a snapshot to an NDJSON journal and writes `state.json`. Every scanner takes a `Roots` object so tests run against fixture directories.

**Tech Stack:** TypeScript 5, Node 22 (ESM), vitest, `yaml` for frontmatter. No other runtime dependencies. Optional external binaries: `cclens`, `claude`.

**Spec:** `docs/2026-11-16-hero-sheet-design.md`

## Global Constraints

- Read-only. The only files written are `state.json` and the journal under `${XDG_STATE_HOME:-~/.local/state}/hero-sheet/`.
- No network calls. No user data leaves the machine.
- Values of `env`, `headers`, `args` from MCP configs never reach `state.json` or the journal. Only server name, transport type and, for URL servers, the URL host.
- Every token figure is an estimate (`Math.ceil(chars / 4)`) and is stored in a field whose name ends in `TokensEst`.
- A missing or unparsable source file yields zero items from that scanner plus one entry in `state.warnings`; the scan still completes.
- macOS desktop-app paths only; CLI paths on any OS.
- Verdict thresholds: `disabled` when not enabled; `dead_weight` when 0 uses in 30 days; `rare` when 1 or 2; `active` when 3 or more.
- Commit after each task. Initial commit in Task 1 runs `git init`.

## Review Focus

1. Secrets: an MCP server with `env: {API_KEY: "sk-..."}` or `headers: {Authorization: ...}`. Expected: neither key names' values nor header values appear anywhere in output. Test in Task 4.
2. Broken skill: a skill directory with no `SKILL.md`, or frontmatter that is not valid YAML. Expected: a warning, other skills still listed. Test in Task 2.
3. Symlinked skill directory (present on the reference machine: `caveman-stats`). Expected: followed, listed once, `path` is the real path. Test in Task 2.
4. `cclens` not installed or exits non-zero. Expected: fallback parser supplies counts, `state.usageSource` says `transcripts`. Test in Task 7.
5. Same skill name on two surfaces (`caveman` exists as a desktop skill and may exist under `~/.claude/skills`). Expected: two cards with distinct ids; usage attributed by the invocation's prefix. Test in Task 8.

---

## File structure

```
package.json, tsconfig.json, vitest.config.ts
src/types.ts            Item, Usage, Card, State, Roots, Warning
src/roots.ts            resolveRoots
src/frontmatter.ts      readSkillFile
src/scan/skills.ts      scanUserSkills
src/scan/plugins.ts     scanPlugins
src/scan/config.ts      scanMcpServers, scanHooks, scanScheduledTasks, scanMemory
src/scan/desktop.ts     scanSynced, scanDesktopSkills
src/scan/connectors.ts  scanConnectors
src/usage/cclens.ts     usageFromCclens
src/usage/transcripts.ts usageFromTranscripts, iterTranscriptLines
src/usage/native.ts     lifetimeFromClaudeJson
src/usage/index.ts      collectUsage, normalizeSkillRef
src/join.ts             buildCards, verdictFor
src/updates.ts          checkUpdates
src/rules.ts            loadRules, evaluateRules
src/journal.ts          appendSnapshot
src/cli.ts              main
test/fixtures/home/...  a fake home directory
test/*.test.ts
```

### Task 1: Scaffold, types, roots

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/types.ts`, `src/roots.ts`, `test/roots.test.ts`, `test/fixtures/home/.claude/.keep`

**Interfaces — Produces:**

```ts
export type Surface = 'cli' | 'synced' | 'desktop' | 'connector';
export type Kind = 'skill' | 'plugin' | 'mcp_server' | 'agent' | 'hook'
  | 'scheduled_task' | 'memory' | 'instructions';
export interface Item {
  id: string;            // `${surface}:${kind}:${name}`; plugin-shipped: name is `${plugin}:${skill}`
  kind: Kind; surface: Surface; name: string;
  description?: string;  // raw frontmatter/manifest description
  enabled: boolean;
  origin?: string;       // owning plugin id, or 'user'
  path?: string;         // real path of the defining file or directory
  version?: string; installedAt?: string; updatedAt?: string;
  staticTokensEst?: number;   // whole file
  startupTokensEst?: number;  // name + description only
  inferred?: boolean;    // true when not read from a config file
  detail?: Record<string, string | number | boolean>;
}
export interface Usage { uses30d: number; lastUsedAt?: string; lifetimeUses?: number;
  outTokens?: number; ctxGrowth?: number; }
export type Verdict = 'active' | 'rare' | 'dead_weight' | 'disabled' | 'unknown';
export interface Card extends Item { usage: Usage; verdict: Verdict;
  update?: { installed: string; latest: string }; }
export interface Warning { source: string; message: string; }
export interface RuleResult { id: string; title: string; matched: number; total: number; rate: number; target: number; }
export interface State { generatedAt: string; usageSource: 'cclens' | 'transcripts';
  cards: Card[]; rules: RuleResult[]; warnings: Warning[]; totals: Record<Kind, number>; }
export interface Roots { home: string; claudeDir: string; claudeJson: string;
  desktopDir: string; stateDir: string; }
export function resolveRoots(home?: string, env?: NodeJS.ProcessEnv): Roots;
```

`claudeDir` is `env.CLAUDE_CONFIG_DIR` or `<home>/.claude`; `claudeJson` is `<home>/.claude.json`; `desktopDir` is `<home>/Library/Application Support/Claude`; `stateDir` is `env.XDG_STATE_HOME` or `<home>/.local/state`, plus `/hero-sheet`.

- [ ] Write `test/roots.test.ts`: `resolveRoots('/h', {})` gives `claudeDir === '/h/.claude'` and `stateDir === '/h/.local/state/hero-sheet'`; with `{CLAUDE_CONFIG_DIR:'/x'}` gives `claudeDir === '/x'`.
- [ ] Run `npx vitest run test/roots.test.ts`, expect FAIL (module missing).
- [ ] Implement `src/types.ts`, `src/roots.ts`; add scripts `test`, `build`, `scan`.
- [ ] Run tests, expect PASS. `git init`, commit `chore: scaffold hero-sheet`.

### Task 2: User skills

**Files:** Create `src/frontmatter.ts`, `src/scan/skills.ts`, `test/skills.test.ts`, fixtures under `test/fixtures/home/.claude/skills/{alpha,broken-yaml,no-skill-file}` and a symlink `linked -> ../../skill-store/linked`.

**Interfaces — Produces:**

```ts
export function readSkillFile(file: string): { name?: string; description?: string; chars: number };
export interface ScanResult { items: Item[]; warnings: Warning[]; }
export function scanUserSkills(roots: Roots): ScanResult;  // surface 'cli', origin 'user'
```

Skips the `synced` subdirectory (Task 5 owns it). `name` falls back to the directory name.

- [ ] Test: fixture yields ids `cli:skill:alpha` and `cli:skill:linked`; `alpha.description === 'Alpha test skill'`; `alpha.startupTokensEst === Math.ceil(('alpha' + 'Alpha test skill').length / 4)`; `linked.path` ends with `skill-store/linked`; warnings contain one entry for `broken-yaml` and one for `no-skill-file`; no item named `synced`.
- [ ] Run, expect FAIL. Implement. Run, expect PASS. Commit `feat: scan user skills`.

### Task 3: Plugins and what they ship

**Files:** Create `src/scan/plugins.ts`, `test/plugins.test.ts`, fixtures `plugins/installed_plugins.json`, `settings.json`, `plugins/cache/mkt/demo/1.2.0/{skills/one/SKILL.md,agents/helper.md,.claude-plugin/plugin.json}`.

**Interfaces — Produces:** `export function scanPlugins(roots: Roots): ScanResult;`

Reads `installed_plugins.json` (`plugins[id]` is an array; take the first entry: `scope, installPath, version, installedAt, lastUpdated`). `enabled` comes from `settings.json` `enabledPlugins[id] === true`. For each plugin emit one `plugin` item named by its id, then one `skill` item per `skills/*/SKILL.md` and one `agent` item per `agents/*.md` under `installPath`, named `${pluginName}:${skillName}` where `pluginName` is the id before `@`, with `origin` set to the plugin id and `enabled` inherited.

- [ ] Test: ids include `cli:plugin:demo@mkt`, `cli:skill:demo:one`, `cli:agent:demo:helper`; plugin `version === '1.2.0'`; with `enabledPlugins: {'demo@mkt': false}` all three have `enabled === false`; an `installPath` that does not exist gives the plugin item plus one warning.
- [ ] Run FAIL, implement, run PASS, commit `feat: scan plugins`.

### Task 4: MCP servers, hooks, scheduled tasks, memory

**Files:** Create `src/scan/config.ts`, `test/config.test.ts`, fixtures `.claude.json`, `scheduled-tasks/weekly/SKILL.md`, `projects/-p/memory/MEMORY.md`, `CLAUDE.md`.

**Interfaces — Produces:**

```ts
export function scanMcpServers(roots: Roots): ScanResult;      // kind 'mcp_server', detail { transport, host? }
export function scanHooks(roots: Roots): ScanResult;           // kind 'hook', name `${event}#${index}`, detail { event, matcher?, type }
export function scanScheduledTasks(roots: Roots): ScanResult;  // kind 'scheduled_task'
export function scanMemory(roots: Roots): ScanResult;          // kind 'memory' per MEMORY.md (detail.entries = line count), kind 'instructions' per CLAUDE.md
```

- [ ] Test (Review Focus 1): fixture server `secret` has `env: {API_KEY:'sk-test-123'}` and `headers: {Authorization:'Bearer abc'}`; assert `JSON.stringify(result)` contains neither `sk-test-123` nor `Bearer abc`, and `detail.host === 'example.com'` for a `url` server.
- [ ] Test: hooks fixture with two `SessionStart` entries and one `PostToolUse` with `matcher: 'Bash'` yields three items; scheduled task `weekly` listed; memory item has `detail.entries === 3`.
- [ ] Run FAIL, implement, run PASS, commit `feat: scan config surfaces`.

### Task 5: Synced and desktop skills

**Files:** Create `src/scan/desktop.ts`, `test/desktop.test.ts`, fixtures `Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/a/b/{manifest.json,skills/humanizer/SKILL.md}` and `.claude/skills/synced/a_b/x/SKILL.md` (observed layout: skills sit directly under the bucket directory).

**Interfaces — Produces:** `scanDesktopSkills(roots): ScanResult` (surface `desktop`), `scanSynced(roots): ScanResult` (surface `synced`).

`manifest.json` shape: `{ lastUpdated: number, skills: [{ skillId, name, description, creatorType, updatedAt, enabled, backingPluginId }] }`. The manifest is the source of truth for name, description, `enabled`, `updatedAt`; `detail.creatorType` is kept; token estimates come from the matching `skills/<name>/SKILL.md` when present. Directories starting with `.` are ignored.

- [ ] Test: `desktop:skill:humanizer` has `enabled` from the manifest and `detail.creatorType`; a manifest skill with no directory still yields an item without token fields; `synced:skill:x` listed; `.bucket-*` ignored.
- [ ] Run FAIL, implement, run PASS, commit `feat: scan desktop and synced skills`.

### Task 6: Connectors and app-provided servers from transcripts

**Files:** Create `src/usage/transcripts.ts` (line iterator only in this task), `src/scan/connectors.ts`, `test/connectors.test.ts`, fixture `projects/-p/s1.jsonl`.

**Interfaces — Produces:**

```ts
export function iterTranscriptLines(roots: Roots, sinceDays: number): AsyncGenerator<{ file: string; line: unknown }>; // streams; skips subagents/ files; skips unparsable lines
export function scanConnectors(roots: Roots, known: Set<string>, sinceDays?: number): Promise<ScanResult>;
```

Collects every server segment from tool names matching `^mcp__(.+?)__(.+)$` found anywhere in transcript lines (tool_use names and deferred tool lists). Servers already in `known` (names from Task 3 and 4, plus `plugin_<p>_<s>` forms) are skipped. A segment matching a UUID pattern becomes surface `connector`, `inferred: true`, `detail.sampleTools` = up to five tool names joined by `, `. Any other unknown segment becomes surface `cli`, `origin: 'app'`, `inferred: true`.

- [ ] Test: fixture with `mcp__90ab26c7-3b7c-4dfc-a3de-75002b2eb5f7__firecrawl_search`, `mcp__ccd_turn__update_plan`, `mcp__jina__read_url` and `known = new Set(['jina'])` yields exactly one connector item with `sampleTools` containing `firecrawl_search`, one app item `ccd_turn`, and nothing for `jina`; a garbage line does not throw.
- [ ] Run FAIL, implement, run PASS, commit `feat: infer connectors from transcripts`.

### Task 7: Usage sources

**Files:** Create `src/usage/cclens.ts`, `src/usage/native.ts`, `src/usage/index.ts`, extend `src/usage/transcripts.ts`, `test/usage.test.ts`.

**Interfaces — Produces:**

```ts
export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string }>;
export interface UsageMap { skills: Map<string, Usage>; servers: Map<string, Usage>; agents: Map<string, Usage>; source: 'cclens' | 'transcripts'; sessions: number; }
export function usageFromCclens(exec: Exec): Promise<UsageMap | null>;      // null when missing or non-zero
export function usageFromTranscripts(roots: Roots, sinceDays: number): Promise<UsageMap>;
export function lifetimeFromClaudeJson(roots: Roots): Map<string, { lifetimeUses: number; lastUsedAt: string }>;
export function collectUsage(roots: Roots, exec: Exec): Promise<UsageMap>;
export const BUILTIN_COMMANDS: ReadonlySet<string>; // compact, rename, model, clear, context, login, doctor, goal, skill-doctor, auto-mode-setup, update-config
```

`usageFromCclens` runs `cclens usage --format json` (`skills[]: {skill, invocations, out_tokens, ctx_growth}`, `agents[]: {agent, runs, out_tokens}`) and `cclens inventory --format json` (`surfaces[]` with `kind === 'mcp_server'`: `{id, uses}`, summed per id). Names in `BUILTIN_COMMANDS` are dropped. `usageFromTranscripts` counts `Skill` tool_use inputs by `skill` and `mcp__server__` calls by server; `lastUsedAt` from the line timestamp. `lifetimeFromClaudeJson` reads `skillUsage[name] = {usageCount, lastUsedAt(ms)}`.

- [ ] Test: exec stub returning the JSON above gives `skills.get('hindsight').uses30d === 16`, no `compact` key, `servers.get('fibery').uses30d === 814` when two rows of 800 and 14 are given.
- [ ] Test (Review Focus 4): exec stub returning `{code: 127, stdout: ''}` makes `collectUsage` return `source === 'transcripts'` with counts from the fixture transcript.
- [ ] Run FAIL, implement, run PASS, commit `feat: usage from cclens with transcript fallback`.

### Task 8: Join, verdicts, updates

**Files:** Create `src/join.ts`, `src/updates.ts`, `test/join.test.ts`, `test/updates.test.ts`.

**Interfaces — Produces:**

```ts
export function normalizeSkillRef(ref: string): { surface?: Surface; name: string }; // 'anthropic-skills:x' -> {surface:'desktop', name:'x'}; 'p:s' -> {name:'p:s'}; 's' -> {name:'s'}
export function verdictFor(item: Item, usage: Usage | undefined): Verdict;
export function buildCards(items: Item[], usage: UsageMap, lifetime: Map<string, {lifetimeUses:number; lastUsedAt:string}>): Card[];
export function checkUpdates(cards: Card[], exec: Exec): Promise<{ cards: Card[]; warnings: Warning[] }>;
```

A bare skill ref matches a `cli` skill first, then `synced`, then `desktop`. Kinds with no usage signal (`hook`, `memory`, `instructions`, `scheduled_task`) get verdict `unknown`. A plugin's usage is the sum of its shipped skills, agents and `plugin_<name>_*` servers. `checkUpdates` runs `claude plugin list --available --json`, compares each installed plugin's `version` with the catalog entry of the same id, and sets `update` when they differ; if the command fails it returns the cards unchanged plus one warning.

- [ ] Test verdicts: disabled item gives `disabled`; 0 uses `dead_weight`; 2 `rare`; 3 `active`; a hook `unknown`.
- [ ] Test (Review Focus 5): items `cli:skill:caveman` and `desktop:skill:caveman`, usage `{'caveman': 1, 'anthropic-skills:caveman': 11}` gives the cli card 1 use and the desktop card 11.
- [ ] Test updates: catalog version `1.3.0` against installed `1.2.0` sets `update.latest === '1.3.0'`; exec failure yields a warning and no `update` fields.
- [ ] Run FAIL, implement, run PASS, commit `feat: join inventory with usage`.

### Task 9: Rule checks

**Files:** Create `src/rules.ts`, `test/rules.test.ts`, `rules.example.json`.

**Interfaces — Produces:**

```ts
export interface Rule { id: string; title: string; pattern: string; target: number; minToolCalls?: number; }
export function loadRules(file: string): Rule[];           // missing file -> []
export function evaluateRules(roots: Roots, rules: Rule[], sinceDays: number): Promise<RuleResult[]>;
```

A session counts toward `total` when it has at least `minToolCalls` tool_use lines (default 5), so trivial sessions do not dilute the rate. It counts toward `matched` when any Bash tool_use `command` matches `pattern` (a regular expression). `rules.example.json` ships one rule: id `skill-oracle`, pattern `^jev-skill `, target `0.8`.

- [ ] Test: three fixture sessions (one with the command, one without and 6 tool calls, one with 2 tool calls) give `total === 2`, `matched === 1`, `rate === 0.5`.
- [ ] Run FAIL, implement, run PASS, commit `feat: rule checks`.

### Task 10: Journal, CLI, reference check

**Files:** Create `src/journal.ts`, `src/cli.ts`, `test/cli.test.ts`, `README.md`.

**Interfaces — Produces:**

```ts
export function appendSnapshot(roots: Roots, state: State): void; // one line per scan: {ts, cards:[{id, uses30d, verdict, version}]}
export function main(argv: string[], deps?: { exec?: Exec; now?: () => Date }): Promise<number>;
```

`hero-sheet scan [--home <dir>] [--out <file>] [--rules <file>] [--days 30]`. Default out is `<stateDir>/state.json`. Scanners run in the order of Tasks 2 to 6; a thrown scanner error becomes a warning.

- [ ] Test: `main(['scan','--home',fixtureHome,'--out',tmp])` returns 0, `tmp` parses as `State`, `totals.skill` equals the fixture count, the journal file has one line, and a second run appends a second line.
- [ ] Run FAIL, implement, run PASS.
- [ ] Reference check on the real machine: run `npm run scan`, then confirm by hand counts that `state.json` shows 16 plugins, 4 configured MCP servers, 24 desktop skills, at least 26 user skills, the `skill-oracle` rule present, and that `grep -c` for any value from `~/.claude.json` `env` blocks in `state.json` is 0. Record the numbers in `README.md` under "Verified on".
- [ ] Commit `feat: scan command and journal`.
