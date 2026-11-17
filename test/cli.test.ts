import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import type { State } from '../src/types.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtureHome = path.join(dir, 'fixtures', 'home');
const now = () => new Date('2026-11-16T12:00:00Z');
const exec = async () => ({ code: 127, stdout: '' });

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hs-cli-'));
}

describe('main scan', () => {
  it('writes state.json and appends one journal line per run', async () => {
    const t = tmp();
    const out = path.join(t, 'state.json');
    const env = { XDG_STATE_HOME: path.join(t, 'xdg') };
    const argv = ['scan', '--home', fixtureHome, '--out', out, '--rules', path.join(dir, '..', 'rules.example.json')];
    expect(await main(argv, { exec, now, env })).toBe(0);

    const state = JSON.parse(fs.readFileSync(out, 'utf8')) as State;
    expect(state.generatedAt).toBe('2026-11-16T12:00:00.000Z');
    expect(state.usageSource).toBe('transcripts');
    expect(state.totals.skill).toBe(state.cards.filter((c) => c.kind === 'skill').length);
    expect(state.totals.skill).toBeGreaterThanOrEqual(5);
    expect(state.totals.mcp_server).toBeGreaterThanOrEqual(3);
    expect(state.rules.map((r) => r.id)).toEqual(['skill-oracle']);
    expect(state.cards.find((c) => c.id === 'cli:skill:alpha')!.usage.lifetimeUses).toBe(7);
    expect(state.cards.every((c) => c.usage && c.verdict)).toBe(true);
    // claude binary stubbed as missing -> one updates warning, scan still completes
    expect(state.warnings.some((w) => w.source === 'updates')).toBe(true);
    // Global constraint: no MCP secret values anywhere in output
    const text = fs.readFileSync(out, 'utf8');
    for (const secret of ['sk-test-123', 'Bearer abc', 'tok-xyz', 'pw-in-url', 'urlkey-999']) {
      expect(text).not.toContain(secret);
    }

    const journal = path.join(env.XDG_STATE_HOME, 'hero-sheet', 'journal.ndjson');
    const lines = () => fs.readFileSync(journal, 'utf8').trim().split('\n');
    expect(lines()).toHaveLength(1);
    const snap = JSON.parse(lines()[0]);
    expect(snap.ts).toBe('2026-11-16T12:00:00.000Z');
    expect(snap.cards[0]).toHaveProperty('id');
    expect(snap.cards[0]).toHaveProperty('uses30d');
    expect(snap.cards[0]).toHaveProperty('verdict');

    expect(await main(argv, { exec, now, env })).toBe(0);
    expect(lines()).toHaveLength(2);
  });

  it('defaults --out to <stateDir>/state.json', async () => {
    const t = tmp();
    const env = { XDG_STATE_HOME: t };
    expect(await main(['scan', '--home', fixtureHome], { exec, now, env })).toBe(0);
    expect(fs.existsSync(path.join(t, 'hero-sheet', 'state.json'))).toBe(true);
  });

  it('turns a broken rules file into a warning, not a failure', async () => {
    const t = tmp();
    const rules = path.join(t, 'rules.json');
    fs.writeFileSync(rules, '{not json');
    const out = path.join(t, 'state.json');
    expect(await main(['scan', '--home', fixtureHome, '--out', out, '--rules', rules], { exec, now, env: { XDG_STATE_HOME: t } })).toBe(0);
    const state = JSON.parse(fs.readFileSync(out, 'utf8')) as State;
    expect(state.warnings.some((w) => w.source === 'rules')).toBe(true);
    expect(state.rules).toEqual([]);
  });

  it('returns 2 for a bad command line', async () => {
    expect(await main(['bogus'], { exec, now })).toBe(2);
    expect(await main(['scan', '--days', 'x'], { exec, now })).toBe(2);
  });
});
