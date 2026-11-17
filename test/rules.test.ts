import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { evaluateRules, loadRules } from '../src/rules.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const roots = resolveRoots(path.join(dir, 'fixtures', 'rules-home'), {});
const now = new Date('2026-11-16T12:00:00Z');
const oracle = { id: 'skill-oracle', title: 'Skill oracle runs', pattern: '^jev-skill ', target: 0.8 };

describe('evaluateRules', () => {
  it('counts sessions with enough tool calls and a matching Bash command', async () => {
    const [r] = await evaluateRules(roots, [oracle], 30, now);
    expect(r).toEqual({ id: 'skill-oracle', title: 'Skill oracle runs', matched: 1, total: 2, rate: 0.5, target: 0.8 });
  });

  it('honours minToolCalls', async () => {
    const [r] = await evaluateRules(roots, [{ ...oracle, minToolCalls: 2 }], 30, now);
    expect(r).toMatchObject({ matched: 2, total: 3 });
  });

  it('gives rate 0 when no session qualifies and handles no rules', async () => {
    const empty = resolveRoots('/nonexistent-home', {});
    expect((await evaluateRules(empty, [oracle], 30, now))[0]).toMatchObject({ matched: 0, total: 0, rate: 0 });
    expect(await evaluateRules(roots, [], 30, now)).toEqual([]);
  });
});

describe('loadRules', () => {
  it('returns [] for a missing file', () => {
    expect(loadRules('/nonexistent/rules.json')).toEqual([]);
  });

  it('loads the shipped example', () => {
    const rules = loadRules(path.join(dir, '..', 'rules.example.json'));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ id: 'skill-oracle', pattern: '^jev-skill ', target: 0.8 });
  });

  it('rejects a malformed rule with a clear error', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hs-rules-')), 'r.json');
    fs.writeFileSync(f, JSON.stringify([{ id: 'x' }]));
    expect(() => loadRules(f)).toThrow(/rule 0/);
    fs.writeFileSync(f, JSON.stringify([{ id: 'x', title: 't', pattern: '(', target: 0.5 }]));
    expect(() => loadRules(f)).toThrow(/pattern/);
  });
});
