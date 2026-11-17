import fs from 'node:fs';
import path from 'node:path';
import type { Item, Roots, ScanResult, Warning } from '../types.js';
import { readSkillFile } from '../frontmatter.js';
import { errMessage, estTokens, isDir, isFile, readJson } from '../util.js';

export type { ScanResult } from '../types.js';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function hostOf(url: string): string | undefined {
  try { return new URL(url).hostname || undefined; } catch { return undefined; }
}

/**
 * MCP servers from ~/.claude.json (top level and per-project).
 * Only name, transport and the URL host are kept. env, headers, args, command
 * and the rest of the URL (credentials, path, query) are never read into items.
 */
export function scanMcpServers(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  let doc: Record<string, unknown> | undefined;
  try {
    doc = asRecord(readJson(roots.claudeJson));
    if (!doc) throw new Error('not a JSON object');
  } catch (e) {
    warnings.push({ source: 'mcp', message: `.claude.json: ${errMessage(e)}` });
    return { items, warnings };
  }

  const groups: Record<string, unknown>[] = [];
  const top = asRecord(doc.mcpServers);
  if (top) groups.push(top);
  const projects = asRecord(doc.projects);
  if (projects) {
    for (const key of Object.keys(projects).sort()) {
      const scoped = asRecord(asRecord(projects[key])?.mcpServers);
      if (scoped) groups.push(scoped);
    }
  }

  const seen = new Set<string>();
  for (const group of groups) {
    for (const name of Object.keys(group).sort()) {
      if (seen.has(name)) continue;
      seen.add(name);
      const cfg = asRecord(group[name]) ?? {};
      const url = str(cfg.url);
      const transport = str(cfg.type) ?? (str(cfg.command) ? 'stdio' : url ? 'http' : 'unknown');
      const detail: Record<string, string> = { transport };
      const host = url ? hostOf(url) : undefined;
      if (host) detail.host = host;
      items.push({
        id: `cli:mcp_server:${name}`,
        kind: 'mcp_server',
        surface: 'cli',
        name,
        enabled: true,
        path: roots.claudeJson,
        detail,
      });
    }
  }
  return { items, warnings };
}

/** Hooks from settings.json. One item per matcher group; command text is not kept. */
export function scanHooks(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const file = path.join(roots.claudeDir, 'settings.json');
  let hooks: Record<string, unknown> | undefined;
  try {
    const doc = asRecord(readJson(file));
    if (!doc) throw new Error('not a JSON object');
    hooks = asRecord(doc.hooks);
  } catch (e) {
    warnings.push({ source: 'hooks', message: `settings.json: ${errMessage(e)}` });
    return { items, warnings };
  }
  if (!hooks) return { items, warnings };
  for (const event of Object.keys(hooks).sort()) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    groups.forEach((g, index) => {
      const group = asRecord(g);
      if (!group) return;
      const inner = Array.isArray(group.hooks) ? group.hooks : [];
      const first = asRecord(inner[0]);
      const detail: Record<string, string> = { event, type: str(first?.type) ?? 'command' };
      const matcher = str(group.matcher);
      if (matcher) detail.matcher = matcher;
      const name = `${event}#${index}`;
      items.push({
        id: `cli:hook:${name}`,
        kind: 'hook',
        surface: 'cli',
        name,
        enabled: true,
        origin: 'user',
        path: file,
        detail,
      });
    });
  }
  return { items, warnings };
}

/** Scheduled tasks: <claudeDir>/scheduled-tasks/<name>/SKILL.md. */
export function scanScheduledTasks(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const dir = path.join(roots.claudeDir, 'scheduled-tasks');
  if (!isDir(dir)) return { items, warnings };
  for (const entry of fs.readdirSync(dir).sort()) {
    if (entry.startsWith('.')) continue;
    let real: string;
    try { real = fs.realpathSync(path.join(dir, entry)); } catch { continue; }
    if (!isDir(real)) continue;
    const file = path.join(real, 'SKILL.md');
    try {
      const fm = readSkillFile(file);
      const name = fm.name ?? entry;
      items.push({
        id: `cli:scheduled_task:${name}`,
        kind: 'scheduled_task',
        surface: 'cli',
        name,
        description: fm.description,
        enabled: true,
        origin: 'user',
        path: real,
        staticTokensEst: estTokens(fm.chars),
      });
    } catch (e) {
      const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no SKILL.md' : errMessage(e);
      warnings.push({ source: 'scheduled-tasks', message: `${entry}: ${msg}` });
    }
  }
  return { items, warnings };
}

/** Memory indexes (projects/<p>/memory/MEMORY.md) and the user-level CLAUDE.md. */
export function scanMemory(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];

  const projectsDir = path.join(roots.claudeDir, 'projects');
  if (isDir(projectsDir)) {
    for (const project of fs.readdirSync(projectsDir).sort()) {
      const file = path.join(projectsDir, project, 'memory', 'MEMORY.md');
      if (!isFile(file)) continue;
      try {
        const text = fs.readFileSync(file, 'utf8');
        const entries = text.split(/\r?\n/).filter((l) => l.trim() !== '').length;
        items.push({
          id: `cli:memory:${project}`,
          kind: 'memory',
          surface: 'cli',
          name: project,
          enabled: true,
          origin: 'user',
          path: fs.realpathSync(file),
          staticTokensEst: estTokens(text.length),
          detail: { entries },
        });
      } catch (e) {
        warnings.push({ source: 'memory', message: `${project}: ${errMessage(e)}` });
      }
    }
  }

  const claudeMd = path.join(roots.claudeDir, 'CLAUDE.md');
  if (isFile(claudeMd)) {
    try {
      const text = fs.readFileSync(claudeMd, 'utf8');
      items.push({
        id: 'cli:instructions:CLAUDE.md',
        kind: 'instructions',
        surface: 'cli',
        name: 'CLAUDE.md',
        enabled: true,
        origin: 'user',
        path: fs.realpathSync(claudeMd),
        staticTokensEst: estTokens(text.length),
      });
    } catch (e) {
      warnings.push({ source: 'memory', message: `CLAUDE.md: ${errMessage(e)}` });
    }
  }
  return { items, warnings };
}
