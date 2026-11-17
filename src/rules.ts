import fs from 'node:fs';
import type { Roots, RuleResult } from './types.js';
import type { Oracle } from './usage/oracle.js';
import { iterTranscriptLines, timestampOf, toolUsesOf } from './usage/transcripts.js';

export interface Rule { id: string; title: string; pattern: string; target: number; minToolCalls?: number; }

const DEFAULT_MIN_TOOL_CALLS = 5;
const DAY_MS = 86_400_000;

export interface RuleConfig { rules: Rule[]; oracle?: Oracle; }

const DEFAULT_MIN_FIT = 0.5;

function parseRules(doc: unknown[]): Rule[] {
  return doc.map((raw, i): Rule => {
    const r = raw as Partial<Rule> | null;
    if (!r || typeof r.id !== 'string' || typeof r.title !== 'string'
      || typeof r.pattern !== 'string' || typeof r.target !== 'number') {
      throw new Error(`rule ${i}: needs string id, title, pattern and number target`);
    }
    try { new RegExp(r.pattern); } catch { throw new Error(`rule ${r.id}: pattern is not a valid regular expression`); }
    const rule: Rule = { id: r.id, title: r.title, pattern: r.pattern, target: r.target };
    if (typeof r.minToolCalls === 'number') rule.minToolCalls = r.minToolCalls;
    return rule;
  });
}

function parseOracle(raw: unknown): Oracle {
  const o = raw as Partial<Oracle> | null;
  if (!o || typeof o.command !== 'string' || typeof o.line !== 'string') {
    throw new Error('oracle: needs string command and line');
  }
  try { new RegExp(o.command); } catch { throw new Error('oracle: command is not a valid regular expression'); }
  try { new RegExp(o.line); } catch { throw new Error('oracle: line is not a valid regular expression'); }
  if (!/\(\?<skill>/.test(o.line) || !/\(\?<fit>/.test(o.line)) {
    throw new Error('oracle: line needs the named groups skill and fit');
  }
  if (o.minFit !== undefined && typeof o.minFit !== 'number') throw new Error('oracle: minFit must be a number');
  return { command: o.command, line: o.line, minFit: o.minFit ?? DEFAULT_MIN_FIT };
}

/**
 * Rule file: `{ "rules": [...], "oracle": {...} }`, or a bare array of rules.
 * A missing file gives no rules and no oracle; an unreadable or malformed file
 * throws (the CLI turns that into a warning).
 */
export function loadRuleConfig(file: string): RuleConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { rules: [] };
    throw e;
  }
  const doc: unknown = JSON.parse(text);
  if (Array.isArray(doc)) return { rules: parseRules(doc) };
  if (!doc || typeof doc !== 'object' || !Array.isArray((doc as { rules?: unknown }).rules)) {
    throw new Error('rules file must be a JSON array or an object with a "rules" array');
  }
  const { rules, oracle } = doc as { rules: unknown[]; oracle?: unknown };
  const cfg: RuleConfig = { rules: parseRules(rules) };
  if (oracle !== undefined) cfg.oracle = parseOracle(oracle);
  return cfg;
}

/** The rules of a rule file, either form. */
export function loadRules(file: string): Rule[] {
  return loadRuleConfig(file).rules;
}

/**
 * Share of qualifying sessions (one transcript file each, at least
 * `minToolCalls` tool_use lines) in which a Bash command matched the pattern.
 * Streams transcripts once; keeps only counters per session.
 */
export async function evaluateRules(
  roots: Roots,
  rules: Rule[],
  sinceDays: number,
  now: Date = new Date(),
): Promise<RuleResult[]> {
  if (rules.length === 0) return [];
  const regexes = rules.map((r) => new RegExp(r.pattern));
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  const sessions = new Map<string, { calls: number; hit: boolean[] }>();
  for await (const { file, line } of iterTranscriptLines(roots, sinceDays, now)) {
    const ts = timestampOf(line);
    if (ts && Date.parse(ts) < cutoff) continue;
    let s = sessions.get(file);
    if (!s) sessions.set(file, (s = { calls: 0, hit: rules.map(() => false) }));
    for (const tu of toolUsesOf(line)) {
      s.calls++;
      if (tu.name !== 'Bash' || typeof tu.input.command !== 'string') continue;
      regexes.forEach((re, i) => { if (!s.hit[i] && re.test(tu.input.command as string)) s.hit[i] = true; });
    }
  }
  return rules.map((rule, i) => {
    const min = rule.minToolCalls ?? DEFAULT_MIN_TOOL_CALLS;
    let total = 0;
    let matched = 0;
    for (const s of sessions.values()) {
      if (s.calls < min) continue;
      total++;
      if (s.hit[i]) matched++;
    }
    return {
      id: rule.id, title: rule.title, matched, total,
      rate: total === 0 ? 0 : matched / total, target: rule.target,
    };
  });
}
