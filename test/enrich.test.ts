import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { cacheKey, extractArray, loadCache, parseEntries } from '../src/enrich/index.js';
import type { Card, State } from '../src/types.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtureHome = path.join(dir, 'fixtures', 'home');
const stub = path.join(dir, 'fixtures', 'describer.mjs');
const now = () => new Date('2026-11-16T12:00:00Z');
const exec = async () => ({ code: 127, stdout: '' });

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hs-enrich-'));
}
interface Setup { t: string; out: string; env: NodeJS.ProcessEnv; record: string; cache: string; }
async function scanned(): Promise<Setup> {
  const t = tmp();
  const out = path.join(t, 'state.json');
  const env = { XDG_STATE_HOME: path.join(t, 'xdg') };
  expect(await main(['scan', '--home', fixtureHome, '--out', out, '--rules', path.join(dir, '..', 'rules.example.json')], { exec, now, env })).toBe(0);
  return { t, out, env, record: path.join(t, 'record.ndjson'), cache: path.join(t, 'enrich.json') };
}
const cmd = (s: Setup, mode = 'ok') => `node ${JSON.stringify(stub)} ${JSON.stringify(s.record)} ${mode}`;
const enrich = (s: Setup, mode = 'ok', extra: string[] = []) =>
  main(['enrich', '--home', fixtureHome, '--out', s.out, '--cmd', cmd(s, mode), ...extra], { exec, now, env: s.env });
const readState = (s: Setup) => JSON.parse(fs.readFileSync(s.out, 'utf8')) as State;
const requests = (s: Setup) => fs.existsSync(s.record)
  ? fs.readFileSync(s.record, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { branches: string[]; items: Record<string, unknown>[] })
  : [];

describe('enrich command', () => {
  it('applies branch, title and summary, marks the state enriched and caches by key', async () => {
    const s = await scanned();
    expect(readState(s).enriched).toBe(false);
    expect(await enrich(s)).toBe(0);
    const state = readState(s);
    expect(state.enriched).toBe(true);
    const alpha = state.cards.find((c) => c.id === 'cli:skill:alpha')!;
    expect(alpha.title).toEqual({ en: 'Title alpha', ru: 'Название alpha' });
    expect(alpha.summary!.en).toBe('Does alpha.');
    expect(alpha.branch).toBe('other');
    expect(state.cards.every((c) => typeof c.branch === 'string' && c.pack)).toBe(true);
    const cache = JSON.parse(fs.readFileSync(s.cache, 'utf8'));
    expect(Object.keys(cache.entries)).toContain(cacheKey(alpha));
  });

  it('sends nothing on a rerun and only the changed item after an edit', async () => {
    const s = await scanned();
    await enrich(s);
    const first = requests(s);
    const sent = first.flatMap((r) => r.items.map((i) => i.id as string));
    expect(sent.length).toBeGreaterThan(5);
    expect(new Set(sent).size).toBe(sent.length);

    await enrich(s);
    expect(requests(s)).toHaveLength(first.length);

    const state = readState(s);
    state.cards.find((c) => c.id === 'cli:skill:alpha')!.description = 'Alpha, rewritten';
    fs.writeFileSync(s.out, JSON.stringify(state));
    await enrich(s);
    const after = requests(s);
    expect(after).toHaveLength(first.length + 1);
    expect(after.at(-1)!.items.map((i) => i.id)).toEqual(['cli:skill:alpha']);
  });

  it('batches by --batch', async () => {
    const s = await scanned();
    await enrich(s, 'ok', ['--batch', '4']);
    const reqs = requests(s);
    expect(reqs.length).toBeGreaterThan(1);
    expect(reqs.every((r) => r.items.length <= 4)).toBe(true);
  });

  it('sends only id, kind, name, description and sampleTools; no path or config value', async () => {
    const s = await scanned();
    const before = readState(s);
    await enrich(s);
    const reqs = requests(s);
    for (const r of reqs) {
      expect(Object.keys(r).sort()).toEqual(['branches', 'items']);
      for (const it of r.items) {
        for (const k of Object.keys(it)) expect(['id', 'kind', 'name', 'description', 'sampleTools']).toContain(k);
      }
    }
    const raw = fs.readFileSync(s.record, 'utf8');
    const forbidden = [
      fixtureHome, os.tmpdir(), 'sk-test-123', 'Bearer abc', 'tok-xyz', 'env-value-456', 'pw-in-url',
      'urlkey-999', 'API_KEY', 'Authorization', 'example.com', 'localhost',
      ...before.cards.map((c) => c.path).filter((p): p is string => !!p),
    ];
    for (const f of forbidden) expect(raw).not.toContain(f);
    // connectors do carry their sample tool names
    const conn = reqs.flatMap((r) => r.items).find((i) => String(i.id).startsWith('connector:'));
    expect(Array.isArray(conn?.sampleTools)).toBe(true);
    // kinds with no safe text to describe are never sent
    const kinds = new Set(reqs.flatMap((r) => r.items.map((i) => i.kind)));
    for (const k of ['memory', 'instructions', 'hook']) expect(kinds.has(k)).toBe(false);
  });

  it('survives a describer that fails, returns junk or the wrong shape: warnings, no cache, no abort', async () => {
    for (const mode of ['fail', 'junk', 'badtype']) {
      const s = await scanned();
      expect(await enrich(s, mode)).toBe(0);
      const state = readState(s);
      expect(state.enriched).toBe(false);
      expect(state.warnings.some((w) => w.source === 'enrich')).toBe(true);
      expect(state.cards.some((c) => c.title)).toBe(false);
      expect(state.cards.every((c) => c.branch && c.pack)).toBe(true);
      if (fs.existsSync(s.cache)) expect(Object.keys(JSON.parse(fs.readFileSync(s.cache, 'utf8')).entries)).toHaveLength(0);
    }
  });

  it('keeps valid entries of a partly bad batch, maps unknown branches to other, skips the rest with warnings', async () => {
    const s = await scanned();
    expect(await enrich(s, 'partial', ['--batch', '3'])).toBe(0);
    const state = readState(s);
    const first = requests(s)[0].items.map((i) => i.id as string);
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    expect(byId.get(first[0])!.title).toBeDefined();
    expect(byId.get(first[1])).toMatchObject({ branch: 'other' });
    expect(byId.get(first[1])!.title).toBeDefined();
    expect(byId.get(first[2])!.title).toBeUndefined();
    expect(state.cards.some((c) => c.id === 'cli:skill:nobody-asked')).toBe(false);
    expect(state.warnings.filter((w) => w.source === 'enrich').length).toBeGreaterThan(0);
    // the item that came back invalid is sent again next time
    await enrich(s, 'ok', ['--batch', '3']);
    expect(readState(s).cards.find((c) => c.id === first[2])!.title).toBeDefined();
  });

  it('does not touch a good cache when a later batch is garbage, and replaces an unreadable cache', async () => {
    const s = await scanned();
    await enrich(s);
    const good = fs.readFileSync(s.cache, 'utf8');
    const state = readState(s);
    state.cards.find((c) => c.id === 'cli:skill:alpha')!.description = 'changed';
    fs.writeFileSync(s.out, JSON.stringify(state));
    await enrich(s, 'junk');
    expect(fs.readFileSync(s.cache, 'utf8')).toBe(good);

    fs.writeFileSync(s.cache, '{not json');
    expect(await enrich(s)).toBe(0);
    expect(readState(s).warnings.some((w) => w.source === 'enrich' && /cache/.test(w.message))).toBe(true);
    expect(readState(s).enriched).toBe(true);
  });

  it('scan applies the cache, so a rescan keeps descriptions', async () => {
    const s = await scanned();
    await enrich(s);
    const argv = ['scan', '--home', fixtureHome, '--out', s.out, '--rules', path.join(dir, '..', 'rules.example.json')];
    expect(await main(argv, { exec, now, env: s.env })).toBe(0);
    const state = readState(s);
    expect(state.enriched).toBe(true);
    expect(state.cards.find((c) => c.id === 'cli:skill:alpha')!.title!.en).toBe('Title alpha');
  });

  it('fails clearly without a state file, and rejects a bad --batch', async () => {
    const t = tmp();
    expect(await main(['enrich', '--home', fixtureHome, '--out', path.join(t, 'none.json'), '--cmd', 'true'], { exec, now, env: { XDG_STATE_HOME: t } })).toBe(1);
    const s = await scanned();
    expect(await enrich(s, 'ok', ['--batch', '0'])).toBe(2);
  });
});

describe('helpers', () => {
  const card = { kind: 'skill', name: 'a', description: 'd' } as Card;
  it('cacheKey depends on kind, name and description only', () => {
    expect(cacheKey(card)).toBe(cacheKey({ ...card, path: '/x', surface: 'cli' } as Card));
    expect(cacheKey(card)).not.toBe(cacheKey({ ...card, description: 'e' }));
    expect(cacheKey(card)).not.toBe(cacheKey({ ...card, kind: 'agent' }));
    expect(cacheKey(card)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extractArray takes the outermost array and skips stray brackets', () => {
    expect(extractArray('noise [x] then [{"a":1}] tail')).toEqual([{ a: 1 }]);
    expect(extractArray('no json')).toBeUndefined();
    expect(extractArray('{"a":[1]}')).toEqual([1]);
  });

  it('parseEntries validates, clips and maps unknown branches', () => {
    const { entries, warnings } = parseEntries(
      [
        { id: 'a', branch: 'code', title: { en: 'T' }, summary: { en: 'S' } },
        { id: 'b', branch: 'nope', title: { en: 'T'.repeat(500) }, summary: { en: 'S', ru: 7 } },
        { id: 'c', title: { en: 'T' } },
        { id: 'zzz', title: { en: 'T' }, summary: { en: 'S' } },
        'junk', null,
      ],
      new Set(['a', 'b', 'c']),
    );
    expect([...entries.keys()]).toEqual(['a', 'b']);
    expect(entries.get('b')!.branch).toBe('other');
    expect(entries.get('b')!.title.en.length).toBeLessThanOrEqual(80);
    expect(entries.get('b')!.summary.ru).toBeUndefined();
    expect(warnings.length).toBe(4);
  });

  it('loadCache gives an empty cache and a warning for garbage', () => {
    const f = path.join(tmp(), 'c.json');
    expect(loadCache(f).entries.size).toBe(0);
    fs.writeFileSync(f, '[1,2]');
    const c = loadCache(f);
    expect(c.entries.size).toBe(0);
    expect(c.warnings.length).toBe(1);
  });
});
