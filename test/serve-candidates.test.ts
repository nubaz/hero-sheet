import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { startServer } from '../src/serve.js';

let tmp: string;
const servers: http.Server[] = [];
const urlOf = (s: http.Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

async function start(opts: { stateFile: string; candidatesFile?: string }) {
  const s = await startServer({ webDir: path.join(tmp, 'web'), ...opts }, 0);
  servers.push(s);
  return urlOf(s);
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-cand-'));
  fs.mkdirSync(path.join(tmp, 'web'));
  fs.writeFileSync(path.join(tmp, 'web', 'sample-candidates.json'), '[{"name":"sample-one"}]');
  fs.writeFileSync(path.join(tmp, 'state.json'), '{}');
  fs.writeFileSync(path.join(tmp, 'mine.json'), '[{"name":"mine"}]');
});
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('/candidates.json', () => {
  it('serves the sample candidates only together with the sample state', async () => {
    const base = await start({ stateFile: path.join(tmp, 'missing.json') });
    const r = await fetch(`${base}/candidates.json`);
    expect(await r.json()).toEqual([{ name: 'sample-one' }]);
    expect(r.headers.get('x-hero-sheet-source')).toBe('sample');
  });

  it('serves an empty array with a real state and no --candidates', async () => {
    const base = await start({ stateFile: path.join(tmp, 'state.json') });
    const r = await fetch(`${base}/candidates.json`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
  });

  it('serves the given file, and an empty array when that file is unreadable', async () => {
    const base = await start({ stateFile: path.join(tmp, 'state.json'), candidatesFile: path.join(tmp, 'mine.json') });
    expect(await (await fetch(`${base}/candidates.json`)).json()).toEqual([{ name: 'mine' }]);
    const bad = await start({ stateFile: path.join(tmp, 'state.json'), candidatesFile: path.join(tmp, 'nope.json') });
    expect(await (await fetch(`${bad}/candidates.json`)).json()).toEqual([]);
  });
});

describe('web dictionary', () => {
  it('has every string in English and Russian', async () => {
    const { DICT } = await import(pathToFileURL(path.join(__dirname, '..', 'web', 'i18n.js')).href) as { DICT: Record<string, Record<string, unknown>> };
    const flat = (o: unknown, pre = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o).flatMap(([k, v]) => flat(v, pre + k + '.')) : [pre.slice(0, -1)]);
    const en = flat(DICT.en).sort();
    const ru = flat(DICT.ru).sort();
    expect(ru).toEqual(en);
  });
});
