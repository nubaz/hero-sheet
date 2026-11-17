import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { loadRuleConfig, loadRules } from '../src/rules.js';
import { missedFromTranscripts, type Oracle } from '../src/usage/oracle.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const roots = resolveRoots(path.join(dir, 'fixtures', 'oracle-home'), {});
const now = new Date('2026-11-16T12:00:00Z');
const oracle: Oracle = {
  command: '^jev-skill ',
  line: '^- (?<skill>\\S+) \\(fit (?<fit>[0-9.]+)\\)',
  minFit: 0.5,
};

describe('missedFromTranscripts', () => {
  it('counts recommended skills that the session did not load afterwards, once per session', async () => {
    const m = await missedFromTranscripts(roots, oracle, 30, now);
    expect(Object.fromEntries(m)).toEqual({
      alpha: 2,  // s1 (recommended twice, counted once) and s2; never loaded
      delta: 1,  // loaded only before the recommendation
    });
  });

  it('ignores fits below minFit, loaded skills, other commands and lines outside the window', async () => {
    const m = await missedFromTranscripts(roots, oracle, 30, now);
    for (const k of ['beta', 'gamma', 'anthropic-skills:docx', 'zeta', 'epsilon']) expect(m.has(k)).toBe(false);
  });

  it('honours a lower minFit and a longer window', async () => {
    const m = await missedFromTranscripts(roots, { ...oracle, minFit: 0.2 }, 30, now);
    expect(m.get('gamma')).toBe(1);
    const old = await missedFromTranscripts(roots, oracle, 90, now);
    expect(old.get('epsilon')).toBe(1);
  });

  it('gives an empty map when there are no transcripts', async () => {
    const empty = resolveRoots('/nonexistent-home', {});
    expect((await missedFromTranscripts(empty, oracle, 30, now)).size).toBe(0);
  });
});

describe('loadRuleConfig', () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hs-rc-')), 'rules.json');
  const rule = { id: 'x', title: 't', pattern: 'p', target: 0.5 };

  it('reads the object form with an oracle', () => {
    const f = tmp();
    fs.writeFileSync(f, JSON.stringify({ rules: [rule], oracle }));
    expect(loadRuleConfig(f)).toEqual({ rules: [rule], oracle });
  });

  it('still accepts a bare array, and loadRules returns the rules of either form', () => {
    const f = tmp();
    fs.writeFileSync(f, JSON.stringify([rule]));
    expect(loadRuleConfig(f)).toEqual({ rules: [rule] });
    fs.writeFileSync(f, JSON.stringify({ rules: [rule] }));
    expect(loadRules(f)).toEqual([rule]);
  });

  it('defaults minFit to 0.5 and rejects a bad oracle', () => {
    const f = tmp();
    const { minFit: _drop, ...noFit } = oracle;
    fs.writeFileSync(f, JSON.stringify({ rules: [], oracle: noFit }));
    expect(loadRuleConfig(f).oracle!.minFit).toBe(0.5);
    fs.writeFileSync(f, JSON.stringify({ rules: [], oracle: { ...oracle, command: '(' } }));
    expect(() => loadRuleConfig(f)).toThrow(/oracle/);
    fs.writeFileSync(f, JSON.stringify({ rules: [], oracle: { ...oracle, line: '^- (\\S+)$' } }));
    expect(() => loadRuleConfig(f)).toThrow(/skill.*fit|named group/);
  });

  it('returns no rules and no oracle for a missing file', () => {
    expect(loadRuleConfig('/nonexistent/rules.json')).toEqual({ rules: [] });
  });
});
