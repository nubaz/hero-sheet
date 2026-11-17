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

- `--home <dir>` scans another home directory, for example a copy. `cclens` and the update check are skipped then, because they can only read the real home; usage comes from that home's transcripts.
- `--rules <file>` loads rule checks. The default is `rules.json` next to the state file. See `rules.example.json`: a rule is a regular expression matched against Bash commands, and the report shows the share of sessions that match.
- `--days` sets the usage window (default 30).

Usage counts come from `cclens` when it is installed and works, and from a built-in transcript parser otherwise; `state.usageSource` says which. The update check calls `claude plugin list --available --json`. If it fails, you get a warning and no update flags.

The scan is read-only and makes no network calls. MCP server `env`, `headers` and `args` are never read into the output: only the server name, transport and URL host. Token figures are estimates (characters divided by 4).

Nothing leaves your machine. MIT licensed.
