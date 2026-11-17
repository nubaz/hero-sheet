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

`scan` reads your Claude Code setup and writes `state.json`, a list of cards with usage, a verdict and an update flag. It also appends one line per run to `journal.ndjson`. Both live in `${XDG_STATE_HOME:-~/.local/state}/hero-sheet/` unless `--out` says otherwise.

- `--home <dir>` scans another home directory, for example a copy. `cclens` is skipped then, because it can only read the real home; usage comes from that home's transcripts. The update check reads files under that home, so it still runs.
- `--rules <file>` loads rule checks. The default is `rules.json` next to the state file. See `rules.example.json`: a rule is a regular expression matched against Bash commands, and the report shows the share of sessions that match.
- `--days` sets the usage window (default 30).

Verdicts: `active` (3 or more uses in the window), `rare` (1 or 2), `disabled`, `unknown` (kinds that leave no usage trace: hooks, memory, instructions, scheduled tasks), `asleep` and `missed`. `asleep` means 0 uses and no evidence the item was ever relevant. It is neutral: an unused skill is usually one the agent never reached for, not a useless one. `missed` means 0 uses, but a skill oracle recommended it in a session that then did not load it; that is the agent's failure, and every card carries `usage.missed30d` so the count is visible even on items that were used.

Usage counts come from `cclens` when it is installed and works, and from a built-in transcript parser otherwise; `state.usageSource` says which. The update check is a file read: for each installed plugin it compares the installed version with the one in the marketplace clone under `~/.claude/plugins/marketplaces/<marketplace>` (the `version` in `marketplace.json`, or the `plugin.json` version at the entry's relative `source`). Plugins with no comparable version, including commit-hash installs, get no update flag and no warning.

The scan is read-only and makes no network calls. MCP server `env`, `headers` and `args` are never read into the output: only the server name, transport and URL host. Token figures are estimates (characters divided by 4).

Nothing leaves your machine. MIT licensed.

## Verified on

One real macOS setup, 2026-11-16, `cclens` 0.4.0 installed. A full scan took about 9 seconds and produced 202 cards: 114 skills (user, plugin-shipped, desktop app, account-synced), 16 plugins, 50 MCP servers (configured, app-provided and inferred claude.ai connectors), 5 hooks, 5 scheduled tasks, 11 memory files. Counts were checked by hand against the files on disk. No value from an MCP `env` or `headers` block appeared in the output.

## Known gaps

- claude.ai connectors show up by id with sample tool names; their display names are not stored locally.
- Run binaries from `./node_modules/.bin/` if the checkout path contains a colon; `npx` and `npm test` break on it.
- The update check compares against the marketplace clones on disk. If a clone has not been refreshed, a newer release will not show up; plugins whose catalog entry carries no version cannot be compared.
