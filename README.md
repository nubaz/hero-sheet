# Hero Sheet

Your Claude Code setup as an RPG character sheet.

Skills, plugins, MCP servers, connectors, hooks and memory pile up over time. Hero Sheet reads the setup from disk, read-only, and shows each piece as a card: what it does, what it costs in context, how often it actually ran, and whether it still earns its place.

Status: early work in progress. Phase 1 (the scanner that writes `state.json`) is being built.

- Design: [docs/2026-11-16-hero-sheet-design.md](docs/2026-11-16-hero-sheet-design.md)
- Phase 1 plan: [docs/plans/2026-11-16-phase1-scanner.md](docs/plans/2026-11-16-phase1-scanner.md)

## Usage

```
npm install
npm run scan -- [--home <dir>] [--out <file>] [--rules <file>] [--days 30]
```

`scan` reads your Claude Code setup and writes `state.json`, a list of cards with usage, a verdict, a branch, a pack and an update flag, plus `sessions` (sessions the usage source saw in the window) and `enriched`. It also appends one line per run to `journal.ndjson`. Both live in `${XDG_STATE_HOME:-~/.local/state}/hero-sheet/` unless `--out` says otherwise.

- `--home <dir>` scans another home directory, for example a copy. `cclens` is skipped then, because it can only read the real home; usage comes from that home's transcripts. The update check reads files under that home, so it still runs.
- `--rules <file>` loads the rules file. The default is `rules.json` next to the state file. See `rules.example.json`. The file is an object `{ "rules": [...], "oracle": {...} }`; a bare array of rules is still accepted. A rule is a regular expression matched against Bash commands, and the report shows the share of sessions that match. The optional `oracle` describes a command that recommends skills: `command` matches the Bash command, `line` matches one output line and needs the named groups `skill` and `fit`, and `minFit` (default 0.5) is the lowest fit that counts as a recommendation. A skill recommended in a session and not loaded through the Skill tool afterwards is counted once for that session as missed. With no oracle configured there are no `missed` verdicts.
- `--days` sets the usage window (default 30).

Verdicts: `active` (3 or more uses in the window), `rare` (1 or 2), `disabled`, `unknown` (kinds that leave no usage trace: hooks, memory, instructions, scheduled tasks), `asleep` and `missed`. `asleep` means 0 uses and no evidence the item was ever relevant. It is neutral: an unused skill is usually one the agent never reached for, not a useless one. `missed` means 0 uses, but a skill oracle recommended it in a session that then did not load it; that is the agent's failure, and every card carries `usage.missed30d` so the count is visible even on items that were used.

Usage counts come from `cclens` when it is installed and works, and from a built-in transcript parser otherwise; `state.usageSource` says which. The update check is a file read: for each installed plugin it compares the installed version with the one in the marketplace clone under `~/.claude/plugins/marketplaces/<marketplace>` (the `version` in `marketplace.json`, or the `plugin.json` version at the entry's relative `source`). Plugins with no comparable version, including commit-hash installs, get no update flag and no warning.

The scan is read-only and makes no network calls. MCP server `env`, `headers` and `args` are never read into the output: only the server name, transport and URL host. Token figures are estimates (characters divided by 4).

## Enrich

```
npm run enrich -- [--home <dir>] [--out <file>] [--cmd "<shell command>"] [--batch 25]
```

`enrich` reads `state.json`, asks a describer for a branch (`code`, `design`, `research`, `writing`, `data`, `automation`, `memory`, `communication`, `finance`, `system`, `other`), a short title and a one-to-two sentence summary in English and Russian for every card it has not described yet, and writes them back with `enriched: true`. Without enrichment every card still has a `branch` (a default by kind) and a `pack` (owning plugin, `user`, `desktop`, `synced`, `connectors` or `app`).

- The describer is any command. It gets one JSON object on stdin, `{ "branches": [...], "items": [{ "id", "kind", "name", "description", "sampleTools" }] }`, and prints one JSON array `[{ "id", "branch", "title": {"en","ru"}, "summary": {"en","ru"} }]`. Text around the array is ignored. Invalid entries are skipped with a warning, an unknown branch becomes `other`. The default is `claude -p --model haiku` with the instruction in `src/enrich/prompt.ts`; `--cmd` replaces it with a shell command line.
- Only `id`, `kind`, `name`, `description` and, for connectors, `sampleTools` are sent. Paths, config values and MCP settings are not. Hooks, memory and instructions are never sent: they have nothing to describe that is safe to share (memory names are built from project paths). The default describer talks to the Anthropic API; a `--cmd` of your own decides where the data goes.
- Descriptions are cached in `enrich.json` next to the state file, keyed by a hash of kind, name and description. An unchanged item is never sent again; a changed one is. `scan` applies the cache, so a rescan keeps descriptions.
- A describer that fails, times out or returns junk produces warnings (source `enrich`) and leaves those cards un-enriched; the run continues and the cache is only replaced by a complete, valid file.

Nothing leaves your machine during `scan`. `enrich` sends the fields above to the describer you choose. MIT licensed.

## The page

```
hero-sheet serve [--port 4477] [--state <file>] [--candidates <file>]
```

Serves `web/` and the state file. The main view is a radial map: the hero and the core of the setup (instructions, memory, hooks, plugins) in the centre, one sector per branch around it. Distance from the centre is distance from daily use: in use, then asleep, then not yet learned. Pan and zoom with mouse, trackpad or touch; click a sector or a branch chip to fly to it. A list view (the toggle in the toolbar) shows the same nodes as a tree and is the accessible fallback.

- One node per capability. Cards of the same kind with the same name after the last colon merge; the detail panel shows which of the four places hold it (Code tab and terminal, synced from account, desktop app, claude.ai connectors) and flags duplicates. The "Where" filter lights up what is present in, or missing from, one place.
- `--candidates <file>` loads a JSON array of tools you could install: `{ id, name, title?: {en, ru}, summary?: {en, ru}, branch, status: "candidate" | "tested" | "rejected", score?: number, url? }`. They are drawn as dashed ghost nodes in the outer ring of their branch. A candidate whose name matches an installed capability is not drawn as a ghost; the installed node notes it instead. Without the option, `/candidates.json` is `[]` (the sample candidates go with the sample state only).

## Verified on

One real macOS setup, 2026-11-16, `cclens` 0.4.0 installed. A full scan took about 9 seconds and produced 202 cards: 114 skills (user, plugin-shipped, desktop app, account-synced), 16 plugins, 50 MCP servers (configured, app-provided and inferred claude.ai connectors), 5 hooks, 5 scheduled tasks, 11 memory files. Counts were checked by hand against the files on disk. No value from an MCP `env` or `headers` block appeared in the output.

## Known gaps

- claude.ai connectors show up by id with sample tool names; their display names are not stored locally.
- Run binaries from `./node_modules/.bin/` if the checkout path contains a colon; `npx` and `npm test` break on it.
- The update check compares against the marketplace clones on disk. If a clone has not been refreshed, a newer release will not show up; plugins whose catalog entry carries no version cannot be compared.
