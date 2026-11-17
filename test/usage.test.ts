import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { BUILTIN_COMMANDS, collectUsage } from '../src/usage/index.js';
import { usageFromCclens, type Exec } from '../src/usage/cclens.js';
import { usageFromTranscripts } from '../src/usage/transcripts.js';
import { lifetimeFromClaudeJson } from '../src/usage/native.js';

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');
const roots = resolveRoots(home, {});
const now = new Date('2026-11-16T12:00:00Z');

const usageJson = {
  skills: [
    { skill: 'hindsight', invocations: 16, out_tokens: 900, ctx_growth: 120 },
    { skill: 'compact', invocations: 50, out_tokens: 1, ctx_growth: 1 },
  ],
  agents: [{ agent: 'Explore', runs: 4, out_tokens: 300 }],
  sessions: 12,
};
const inventoryJson = {
  surfaces: [
    { kind: 'mcp_server', id: 'fibery', uses: 800 },
    { kind: 'mcp_server', id: 'fibery', uses: 14 },
    { kind: 'skill', id: 'hindsight', uses: 99 },
  ],
};
const stub: Exec = async (_cmd, args) => ({
  code: 0,
  stdout: JSON.stringify(args[0] === 'usage' ? usageJson : inventoryJson),
});

describe('usageFromCclens', () => {
  it('maps skills, agents and summed servers; drops built-in commands', async () => {
    const u = (await usageFromCclens(stub))!;
    expect(u.source).toBe('cclens');
    expect(u.sessions).toBe(12);
    expect(u.skills.get('hindsight')).toMatchObject({ uses30d: 16, outTokens: 900, ctxGrowth: 120 });
    expect(u.skills.has('compact')).toBe(false);
    expect(BUILTIN_COMMANDS.has('compact')).toBe(true);
    expect(u.servers.get('fibery')!.uses30d).toBe(814);
    expect(u.agents.get('Explore')!.uses30d).toBe(4);
  });

  it('returns null when the binary is missing, fails or prints junk', async () => {
    expect(await usageFromCclens(async () => ({ code: 127, stdout: '' }))).toBeNull();
    expect(await usageFromCclens(async () => { throw new Error('ENOENT'); })).toBeNull();
    expect(await usageFromCclens(async () => ({ code: 0, stdout: 'not json' }))).toBeNull();
  });
});

describe('usageFromTranscripts', () => {
  it('counts skills and servers inside the window, drops built-ins', async () => {
    const u = await usageFromTranscripts(roots, 30, now);
    expect(u.source).toBe('transcripts');
    expect(u.skills.get('hindsight')!.uses30d).toBe(2); // the 2025 line is outside 30 days
    expect(u.skills.get('hindsight')!.lastUsedAt).toBe('2026-11-14T08:00:00.000Z');
    expect(u.skills.get('anthropic-skills:caveman')!.uses30d).toBe(1);
    expect(u.skills.has('compact')).toBe(false);
    expect(u.servers.get('jina')!.uses30d).toBe(1);
    expect(u.servers.has('shouldskip')).toBe(false);
    expect(u.sessions).toBe(1);
  });
});

describe('collectUsage', () => {
  it('falls back to transcripts when cclens is missing (Review Focus 4)', async () => {
    const u = await collectUsage(roots, async () => ({ code: 127, stdout: '' }), { now });
    expect(u.source).toBe('transcripts');
    expect(u.skills.get('hindsight')!.uses30d).toBe(2);
  });

  it('uses cclens when it works', async () => {
    const u = await collectUsage(roots, stub, { now });
    expect(u.source).toBe('cclens');
  });
});

describe('lifetimeFromClaudeJson', () => {
  it('reads skillUsage counts and ms timestamps', () => {
    const m = lifetimeFromClaudeJson(roots);
    expect(m.get('alpha')).toEqual({ lifetimeUses: 7, lastUsedAt: new Date(1763000000000).toISOString() });
  });
  it('returns an empty map for a missing file', () => {
    expect(lifetimeFromClaudeJson(resolveRoots('/nonexistent-home', {})).size).toBe(0);
  });
});
