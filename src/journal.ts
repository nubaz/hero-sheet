import fs from 'node:fs';
import path from 'node:path';
import type { Roots, State } from './types.js';

/**
 * Append one line per scan to <stateDir>/journal.ndjson. Transcripts are pruned
 * after about 30 days, so this is where history survives.
 * Only ids, counts, verdicts and versions are stored.
 */
export function appendSnapshot(roots: Roots, state: State): void {
  fs.mkdirSync(roots.stateDir, { recursive: true });
  const line = {
    ts: state.generatedAt,
    cards: state.cards.map((c) => ({
      id: c.id, uses30d: c.usage.uses30d, verdict: c.verdict, version: c.version ?? null,
    })),
  };
  fs.appendFileSync(path.join(roots.stateDir, 'journal.ndjson'), JSON.stringify(line) + '\n');
}
