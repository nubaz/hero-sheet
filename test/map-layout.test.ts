import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The web layer is plain JS without type declarations; load it untyped.
const webDir = path.join(__dirname, '..', 'web');
const load = async (f: string): Promise<any> => import(pathToFileURL(path.join(webDir, f)).href);
const sample = JSON.parse(fs.readFileSync(path.join(webDir, 'sample-state.json'), 'utf8'));
const sampleCands = JSON.parse(fs.readFileSync(path.join(webDir, 'sample-candidates.json'), 'utf8'));

const norm = (c: any) => ({ ...c, usage: c.usage || { uses30d: 0 }, verdict: c.verdict || 'unknown', branch: c.branch || 'other', pack: c.pack || 'user' });

function card(over: any) {
  return norm({ id: `${over.surface}:${over.kind}:${over.name}`, enabled: true, ...over });
}

describe('mergeCards', () => {
  it('merges same kind and same name after the last colon, keeps places', async () => {
    const { mergeCards } = await load('layout.js');
    const nodes = mergeCards([
      card({ kind: 'skill', surface: 'cli', name: 'impeccable:critique', usage: { uses30d: 2 }, verdict: 'rare' }),
      card({ kind: 'skill', surface: 'synced', name: 'critique', usage: { uses30d: 1 }, verdict: 'rare' }),
      card({ kind: 'plugin', surface: 'cli', name: 'critique' }),
    ]);
    expect(nodes).toHaveLength(2);
    const sk = nodes.find((n: any) => n.kind === 'skill');
    expect(sk.places).toEqual(['cli', 'synced']);
    expect(sk.duplicate).toBe(true);
    expect(sk.usage.uses30d).toBe(3);
    expect(nodes.find((n: any) => n.kind === 'plugin').duplicate).toBe(false);
  });

  it('merges duplicates in the sample state', async () => {
    const { mergeCards, PLACES } = await load('layout.js');
    const cards = sample.cards.map(norm);
    const nodes = mergeCards(cards);
    expect(nodes.length).toBeLessThan(cards.length);
    const dr = nodes.find((n: any) => n.name === 'deep-research');
    expect(dr.places).toEqual(PLACES.filter((p: string) => ['cli', 'synced', 'desktop'].includes(p)));
  });
});

describe('candidates', () => {
  it('drops malformed entries and defaults unknown fields', async () => {
    const { normalizeCandidates } = await load('layout.js');
    const out = normalizeCandidates([{ name: 'a', branch: 'nope', status: 'weird' }, { id: 1 }, null, { name: 'b', url: 'javascript:alert(1)' }]);
    expect(out.map((c: any) => c.name)).toEqual(['a', 'b']);
    expect(out[0].branch).toBe('other');
    expect(out[0].status).toBe('candidate');
    expect(out[1].url).toBeUndefined();
    expect(normalizeCandidates({})).toEqual([]);
  });

  it('a candidate matching an installed node annotates it instead of drawing a ghost', async () => {
    const { mergeCards, attachCandidates, normalizeCandidates } = await load('layout.js');
    const nodes = mergeCards(sample.cards.map(norm));
    const ghosts = attachCandidates(nodes, normalizeCandidates(sampleCands));
    expect(ghosts.find((g: any) => g.name === 'github')).toBeUndefined();
    expect(nodes.find((n: any) => n.name === 'github').catalog.status).toBe('tested');
    expect(ghosts.length).toBe(sampleCands.length - 1);
  });
});

describe('layoutMap', () => {
  async function build(extra = 0) {
    const L = await load('layout.js');
    const cards = sample.cards.map(norm);
    // inflate to a realistic size
    for (let i = 0; i < extra; i++) {
      const base = sample.cards[i % sample.cards.length];
      cards.push(norm({ ...base, id: `x${i}`, name: `bulk-${i}`, kind: 'skill', surface: 'cli', branch: L.BRANCHES[i % 7], pack: `pk${i % 9}`, usage: { uses30d: i % 5 }, verdict: ['active', 'asleep', 'rare', 'missed'][i % 4] }));
    }
    const nodes = L.mergeCards(cards);
    const ghosts = L.attachCandidates(nodes, L.normalizeCandidates(sampleCands));
    return { L, layout: L.layoutMap([...nodes, ...ghosts]), count: nodes.length + ghosts.length };
  }

  for (const extra of [0, 220]) {
    it(`places every node once and never overlaps (${extra ? '200+ nodes' : 'sample'})`, async () => {
      const { L, layout, count } = await build(extra);
      const p = layout.placed;
      expect(p).toHaveLength(count);
      let min = Infinity;
      for (let i = 0; i < p.length; i++) {
        expect(Number.isFinite(p[i].x) && Number.isFinite(p[i].y)).toBe(true);
        for (let j = i + 1; j < p.length; j++) {
          const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
          min = Math.min(min, d - p[i].r - p[j].r);
        }
      }
      expect(min).toBeGreaterThan(14);
      expect(L.TAN).toBeGreaterThan(60);
    });

    it(`keeps depth meaning: core inside, in use before asleep before candidates (${extra ? 'big' : 'sample'})`, async () => {
      const { layout } = await build(extra);
      const byBand = (b: number) => layout.placed.filter((n: any) => n.band === b).map((n: any) => n.d);
      const [b0, b1, b2, b3] = [0, 1, 2, 3].map(byBand);
      expect(Math.max(...b0)).toBeLessThan(Math.min(...b1));
      expect(Math.max(...b1)).toBeLessThan(Math.min(...b2));
      expect(Math.max(...b2)).toBeLessThan(Math.min(...b3));
      for (const n of layout.placed) {
        if (n.band === 0) continue;
        const s = layout.sectors.find((x: any) => x.branch === n.sector);
        expect(n.a).toBeGreaterThanOrEqual(s.a0);
        expect(n.a).toBeLessThanOrEqual(s.a1);
      }
    });
  }
});
