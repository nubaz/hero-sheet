import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Roots, Usage } from '../types.js';
import { bump, BUILTIN_COMMANDS, type UsageMap } from './shared.js';
import { isDir } from '../util.js';

const DAY_MS = 86_400_000;

/**
 * Stream parsed lines of recent session transcripts, one line at a time.
 * Transcripts can be hundreds of megabytes, so files are never read whole.
 * Only <claudeDir>/projects/<project>/*.jsonl is read: subagent transcripts
 * (anything under a `subagents` directory) are skipped, unparsable lines too.
 * A file is recent when its modification time is within `sinceDays` of `now`.
 */
export async function* iterTranscriptLines(
  roots: Roots,
  sinceDays: number,
  now: Date = new Date(),
): AsyncGenerator<{ file: string; line: unknown }> {
  const projects = path.join(roots.claudeDir, 'projects');
  if (!isDir(projects)) return;
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  for (const project of fs.readdirSync(projects).sort()) {
    const dir = path.join(projects, project);
    if (!isDir(dir)) continue;
    for (const entry of fs.readdirSync(dir).sort()) {
      if (!entry.endsWith('.jsonl')) continue;
      const file = path.join(dir, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(file); } catch { continue; }
      if (!stat.isFile() || stat.mtimeMs < cutoff) continue;
      const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      try {
        for await (const text of rl) {
          if (!text.trim()) continue;
          let line: unknown;
          try { line = JSON.parse(text); } catch { continue; }
          yield { file, line };
        }
      } catch {
        // unreadable file: skip the rest of it
      } finally {
        rl.close();
      }
    }
  }
}

export interface ToolUse { name: string; input: Record<string, unknown>; }

/** tool_use blocks of one transcript line (assistant messages). */
export function toolUsesOf(line: unknown): ToolUse[] {
  const msg = (line as { message?: { content?: unknown } } | null)?.message;
  const content = msg?.content;
  if (!Array.isArray(content)) return [];
  const out: ToolUse[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; name?: unknown; input?: unknown };
    if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
    const input = b.input && typeof b.input === 'object' && !Array.isArray(b.input)
      ? (b.input as Record<string, unknown>) : {};
    out.push({ name: b.name, input });
  }
  return out;
}

export function timestampOf(line: unknown): string | undefined {
  const t = (line as { timestamp?: unknown } | null)?.timestamp;
  return typeof t === 'string' && !Number.isNaN(Date.parse(t)) ? t : undefined;
}

const MCP_NAME = /^mcp__(.+?)__(.+)$/;

/** Split an MCP tool name into server segment and tool; undefined when not one. */
export function parseMcpTool(name: string): { server: string; tool: string } | undefined {
  const m = MCP_NAME.exec(name);
  return m ? { server: m[1], tool: m[2] } : undefined;
}

/** Every string value anywhere in a parsed JSON value (keys are not visited). */
export function* walkStrings(v: unknown, depth = 0): Generator<string> {
  if (depth > 12) return;
  if (typeof v === 'string') { yield v; return; }
  if (Array.isArray(v)) { for (const x of v) yield* walkStrings(x, depth + 1); return; }
  if (v && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) yield* walkStrings(x, depth + 1);
  }
}

/**
 * Fallback usage counter: Skill tool_use inputs by `skill`, mcp__server__tool
 * calls by server, Task/Agent calls by subagent_type. Counts only lines whose
 * timestamp is inside the window. `lastUsedAt` is the newest such timestamp.
 */
export async function usageFromTranscripts(
  roots: Roots,
  sinceDays: number,
  now: Date = new Date(),
): Promise<UsageMap> {
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  const skills = new Map<string, Usage>();
  const servers = new Map<string, Usage>();
  const agents = new Map<string, Usage>();
  const sessions = new Set<string>();
  for await (const { file, line } of iterTranscriptLines(roots, sinceDays, now)) {
    const ts = timestampOf(line);
    if (ts && Date.parse(ts) < cutoff) continue;
    sessions.add(file);
    for (const tu of toolUsesOf(line)) {
      if (tu.name === 'Skill') {
        const ref = tu.input.skill;
        if (typeof ref === 'string' && ref && !BUILTIN_COMMANDS.has(ref)) bump(skills, ref, 1, ts);
      } else if (tu.name === 'Task' || tu.name === 'Agent') {
        const ref = tu.input.subagent_type;
        if (typeof ref === 'string' && ref) bump(agents, ref, 1, ts);
      } else {
        const mcp = parseMcpTool(tu.name);
        if (mcp) bump(servers, mcp.server, 1, ts);
      }
    }
  }
  return { skills, servers, agents, source: 'transcripts', sessions: sessions.size };
}
