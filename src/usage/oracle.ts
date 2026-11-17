import type { Roots } from '../types.js';
import { iterTranscriptLines, timestampOf, toolUsesOf } from './transcripts.js';

const DAY_MS = 86_400_000;

/**
 * A skill oracle is a command the agent runs to learn which skills fit a task.
 * `command` matches the Bash command, `line` matches one output line and has
 * the named groups `skill` and `fit`.
 */
export interface Oracle { command: string; line: string; minFit: number; }

/** tool_result blocks of one transcript line: tool_use id and its text. */
function toolResultsOf(line: unknown): { id: string; text: string }[] {
  const content = (line as { message?: { content?: unknown } } | null)?.message?.content;
  if (!Array.isArray(content)) return [];
  const out: { id: string; text: string }[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; tool_use_id?: unknown; content?: unknown };
    if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
    let text = '';
    if (typeof b.content === 'string') text = b.content;
    else if (Array.isArray(b.content)) {
      text = b.content
        .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string'
          ? (c as { text: string }).text : ''))
        .join('\n');
    }
    out.push({ id: b.tool_use_id, text });
  }
  return out;
}

/** Skill names are compared without the desktop-app prefix. */
function key(ref: string): string {
  return ref.startsWith('anthropic-skills:') ? ref.slice('anthropic-skills:'.length) : ref;
}

/**
 * Per skill reference (as the oracle printed it): the number of sessions in
 * which the oracle recommended it at `minFit` or better and the session never
 * loaded it through the Skill tool after its latest recommendation. A skill
 * counts once per session however often it was recommended. One transcript
 * file is one session.
 */
export async function missedFromTranscripts(
  roots: Roots,
  oracle: Oracle,
  sinceDays: number,
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const commandRe = new RegExp(oracle.command);
  const lineRe = new RegExp(oracle.line);
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  const missed = new Map<string, number>();

  let file: string | undefined;
  let pending = new Set<string>();          // tool_use ids of oracle runs
  let open = new Map<string, string>();     // recommended and not yet loaded: key -> printed ref
  const flush = (): void => {
    for (const ref of open.values()) missed.set(ref, (missed.get(ref) ?? 0) + 1);
    open = new Map();
    pending = new Set();
  };

  for await (const { file: f, line } of iterTranscriptLines(roots, sinceDays, now)) {
    if (f !== file) { flush(); file = f; }
    const ts = timestampOf(line);
    if (ts && Date.parse(ts) < cutoff) continue;
    for (const tu of toolUsesOf(line)) {
      if (tu.name === 'Skill' && typeof tu.input.skill === 'string') open.delete(key(tu.input.skill));
    }
    // ids of oracle runs; tool_use blocks carry their id, which toolUsesOf drops
    const blocks = (line as { message?: { content?: unknown } } | null)?.message?.content;
    if (Array.isArray(blocks)) {
      for (const b of blocks as { type?: unknown; name?: unknown; id?: unknown; input?: { command?: unknown } }[]) {
        if (b && b.type === 'tool_use' && b.name === 'Bash' && typeof b.id === 'string'
          && typeof b.input?.command === 'string' && commandRe.test(b.input.command)) pending.add(b.id);
      }
    }
    for (const r of toolResultsOf(line)) {
      if (!pending.has(r.id)) continue;
      for (const text of r.text.split('\n')) {
        const g = lineRe.exec(text)?.groups;
        if (!g?.skill || g.fit === undefined) continue;
        const fit = Number(g.fit);
        if (!Number.isFinite(fit) || fit < oracle.minFit) continue;
        const k = key(g.skill);
        if (!open.has(k)) open.set(k, g.skill);
      }
    }
  }
  flush();
  return missed;
}
