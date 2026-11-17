import fs from 'node:fs';
import type { Roots, RuleResult } from './types.js';
import { iterTranscriptLines, timestampOf, toolUsesOf } from './usage/transcripts.js';

export interface Rule { id: string; title: string; pattern: string; target: number; minToolCalls?: number; }

const DEFAULT_MIN_TOOL_CALLS = 5;
const DAY_MS = 86_400_000;

/**
 * Rules from a JSON file: an array of Rule objects. A missing file gives no
 * rules; an unreadable or malformed file throws (the CLI turns that into a warning).
 */
export function loadRules(file: string): Rule[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const doc: unknown = JSON.parse(text);
  if (!Array.isArray(doc)) throw new Error('rules file must be a JSON array');
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
