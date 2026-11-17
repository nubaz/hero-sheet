# Hero Sheet: design

Working name, open to change. Status: draft for approval. Date: 2026-11-16.

## Intent

A Claude Code setup grows by accretion: skills, plugins, MCP servers, connectors, hooks, memory files, scheduled tasks, personal rules. After a few months the owner cannot say what is installed, what each piece does, whether it is used, or whether a rule they wrote is being followed. Hero Sheet shows the setup as an RPG character sheet so the answer is visible at a glance, and it keeps statistics so the owner knows what to improve or remove.

The RPG framing is the presentation. The product is a truthful audit.

## Goals

1. One local page that lists everything installed, per surface: Code tab and CLI (shared), account-synced items, desktop app skills, claude.ai connectors.
2. Each item is a card: a two-line plain description, what it costs in context, how often it ran, when it last ran, a verdict (active, rare, dead weight, disabled), and an "update available" flag where a version exists.
3. Rule checks ("quests"): for a rule the owner wrote, show how often sessions follow it. First case: the skill oracle `jev-skill` is supposed to run in every working session.
4. Scheduled audits and their latest reports are visible on the sheet instead of sitting in a folder.
5. Installable by anyone with Claude Code. Cheap to run: generation uses the user's own cheap model by default.
6. Open source, MIT.

## Non-goals for the first release

- Live session animation, 3D avatar, physical toy. Planned later; the data layer must not block them.
- Editing the setup from the page. The sheet is read-only.
- Windows and Linux desktop-app paths. CLI paths work everywhere; desktop paths are macOS first.

## Anti-goals

- Numbers that look precise and are not. Every estimate is labelled as an estimate.
- Cosmetic progression unrelated to real use.
- Sending any user data off the machine by default.

## What we measured on a real setup (2026-11-16)

- `cclens` 0.4.0 (MIT, Rust, Homebrew) analysed 223 sessions in 4 seconds. Its usage side is good: 45 invoked skills with invocation counts, output tokens and context growth, including desktop and plugin skills (`anthropic-skills:caveman`, `superpowers:systematic-debugging`); 27 MCP servers with call counts, including claude.ai connectors.
- Its inventory side is not enough for us: it lists only `~/.claude/skills` (26 items), misses plugin-shipped skills and desktop-app skills, lists MCP servers only when they were called, gives no token cost for MCP servers, shows connectors as raw UUIDs, and mixes built-in slash commands (`compact`, `rename`) into skill usage.
- Rule check done by hand: `jev-skill` ran in 35 of 209 sessions over 30 days.
- Weekly hygiene reports exist for four consecutive weeks and are never surfaced.

## Approaches considered

A. Own scanner and own sheet page, reusing existing parts. Chosen.
B. Fork FulAppiOS/Agent-Quest. Rejected: its UI is a Phaser game, it has no static inventory and no progression.
C. A mod inside Claude Code. Rejected for now: CLI only, cannot show the desktop and account sets.

Three candidate forks were read at source level (Agent-Quest, Hin-Nattapat/agent-quest, habblaud). None inventories what is installed. All are MIT. Sprite art from them is not reused.

## Architecture

```
scanners  ->  journal (NDJSON, append-only)  ->  reducer  ->  state.json  ->  sheet page
```

- **Scanners** (ours): read-only, one per source.
  - `cli`: `~/.claude/skills`, `settings.json` (plugins, hooks), `plugins/installed_plugins.json`, plugin caches for shipped skills and agents, `~/.claude.json` MCP servers, `scheduled-tasks`, memory directories, CLAUDE.md files.
  - `synced`: `~/.claude/skills/synced`, `~/.claude/plugins/synced`.
  - `desktop`: `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin`.
  - `connectors`: claude.ai connectors, inferred from tool lists in recent Code-tab transcripts, since no local file or API lists them. Labelled as inferred. Chat-only skills cannot be seen and the sheet says so.
  - `updates`: installed version against the marketplace catalog from `claude plugin list --available --json`. Standalone skills have no version; no flag for them.
- **Usage**: `cclens --format json` as a subprocess when installed. Without it, a built-in transcript parser gives invocation counts only. Parser logic follows Agent-Quest's `session-parser.ts` and `plugin-tool.ts`.
- **Journal**: transcripts are pruned after 30 days, so each scan appends a snapshot. History and progression come from the journal.
- **Reducer**: pure function, replays the journal into `state.json`. Pattern and XP, class and achievement modules adapted from Hin-Nattapat `core/`, with inputs changed from raw tool events to per-item usage.
- **Rule checks**: declared in a small config file as a pattern over transcripts plus an expected rate.
- **Enrichment** (descriptions, card art): separate step, pluggable command, cached by content hash so an unchanged skill is never regenerated.
  - Descriptions default to the user's own Claude Code in headless mode on the cheapest model. Any other command can be configured (for example an Antigravity CLI).
  - Card art default is a generated SVG emblem per item, no model needed. An image provider is optional and configurable.
- **Sheet page**: static page served on localhost by one command. Hero header (level, class, totals), tabs per surface, card grid, quest panel, audit panel.

## Stack (builder's call, stated here)

TypeScript on Node 22, because both borrowed codebases are TypeScript. No game engine. The page is plain components over `state.json`. Tests cover scanners against fixture directories and the reducer against fixture journals.

## Phases

1. Scanners, usage join, `state.json`. Done when the JSON matches a hand count on the reference machine.
2. Sheet page with cards, verdicts, quests, audits.
3. Enrichment: descriptions, then art.
4. Progression: level, class, achievements from the journal.
5. Later: live mode from hooks, avatar, physical device.

## Open to the owner

- Project name and repository location.
- Visual style of the sheet and the cards (decided with mockups in phase 2).
- Which image provider, if any, for his own install.

## Left to the builder

File layout, card schema details, verdict thresholds (proposed: dead weight is zero uses in 30 days, rare is under three), port, CLI flags.
