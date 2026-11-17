import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { scanConnectors } from '../src/scan/connectors.js';
import { iterTranscriptLines } from '../src/usage/transcripts.js';

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');
const roots = resolveRoots(home, {});
const now = new Date('2026-11-16T12:00:00Z');

describe('iterTranscriptLines', () => {
  it('streams parsed lines, skips garbage and subagent files', async () => {
    const files = new Set<string>();
    let n = 0;
    for await (const { file, line } of iterTranscriptLines(roots, 30, now)) {
      files.add(path.basename(file));
      expect(typeof line).toBe('object');
      n++;
    }
    expect([...files]).toEqual(['s1.jsonl']);
    expect(n).toBe(8); // 9 lines, one is not JSON
  });
});

describe('scanConnectors', () => {
  it('infers connectors and app servers, skips known ones', async () => {
    const r = await scanConnectors(roots, new Set(['jina']), 30, now);
    const byId = new Map(r.items.map((i) => [i.id, i]));
    const conn = byId.get('connector:mcp_server:90ab26c7-3b7c-4dfc-a3de-75002b2eb5f7')!;
    expect(conn.surface).toBe('connector');
    expect(conn.inferred).toBe(true);
    expect(conn.detail!.sampleTools).toContain('firecrawl_search');
    expect(conn.detail!.sampleTools).toContain('alexandria_library_read');
    const app = byId.get('cli:mcp_server:ccd_turn')!;
    expect(app.origin).toBe('app');
    expect(app.inferred).toBe(true);
    expect(r.items.map((i) => i.name).sort()).toEqual(['90ab26c7-3b7c-4dfc-a3de-75002b2eb5f7', 'ccd_turn']);
  });
});
