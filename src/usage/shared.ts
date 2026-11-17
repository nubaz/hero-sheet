import type { Usage } from '../types.js';

export type Exec = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string }>;

export interface UsageMap {
  skills: Map<string, Usage>;
  servers: Map<string, Usage>;
  agents: Map<string, Usage>;
  source: 'cclens' | 'transcripts';
  sessions: number;
}

/** Built-in slash commands; they are not skills and never count as skill usage. */
export const BUILTIN_COMMANDS: ReadonlySet<string> = new Set([
  'compact', 'rename', 'model', 'clear', 'context', 'login', 'doctor', 'goal',
  'skill-doctor', 'auto-mode-setup', 'update-config',
]);

export function bump(map: Map<string, Usage>, key: string, uses: number, lastUsedAt?: string): void {
  const cur = map.get(key) ?? { uses30d: 0 };
  cur.uses30d += uses;
  if (lastUsedAt && (!cur.lastUsedAt || lastUsedAt > cur.lastUsedAt)) cur.lastUsedAt = lastUsedAt;
  map.set(key, cur);
}
