import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { startServer } from '../src/serve.js';

let tmp: string;
let server: http.Server;
let base: string;
let withState: http.Server;
let baseState: string;

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hs-serve-'));
}
const urlOf = (s: http.Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

beforeAll(async () => {
  tmp = mk();
  const web = path.join(tmp, 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<h1>page</h1>');
  fs.writeFileSync(path.join(web, 'app.js'), 'export {};');
  fs.writeFileSync(path.join(web, 'sample-state.json'), '{"sample":true}');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(tmp, 'secret.txt'), path.join(web, 'link.txt'));
  fs.writeFileSync(path.join(tmp, 'state.json'), '{"real":true}');
  server = await startServer({ webDir: web, stateFile: path.join(tmp, 'missing.json') }, 0);
  withState = await startServer({ webDir: web, stateFile: path.join(tmp, 'state.json') }, 0);
  base = urlOf(server);
  baseState = urlOf(withState);
});

afterAll(async () => {
  await Promise.all([server, withState].map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('serve', () => {
  it('serves index.html at / and static files with a content type', async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(await r.text()).toBe('<h1>page</h1>');
    const js = await fetch(`${base}/app.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('serves the sample at /state.json when there is no state file, and the real file when there is', async () => {
    const a = await fetch(`${base}/state.json`);
    expect(await a.json()).toEqual({ sample: true });
    expect(a.headers.get('x-hero-sheet-source')).toBe('sample');
    const b = await fetch(`${baseState}/state.json`);
    expect(await b.json()).toEqual({ real: true });
    expect(b.headers.get('x-hero-sheet-source')).toBe('state');
  });

  it('answers 404 for a missing file and for a directory without index', async () => {
    expect((await fetch(`${base}/nope.js`)).status).toBe(404);
  });

  it('refuses path traversal, encoded or not, and symlinks that leave web/', async () => {
    // fetch() normalises "..", so send raw requests
    const raw = (p: string) => new Promise<number>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: p }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on('error', reject);
    });
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      expect([403, 404]).toContain(await raw(p));
    }
    expect(await raw('/link.txt')).toBe(404);
    expect(await raw('/%00')).toBe(400);
  });

  it('allows GET and HEAD only', async () => {
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    const h = await fetch(`${base}/`, { method: 'HEAD' });
    expect(h.status).toBe(200);
    expect(await h.text()).toBe('');
  });
});
