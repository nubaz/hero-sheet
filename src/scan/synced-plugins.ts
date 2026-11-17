import fs from 'node:fs';
import path from 'node:path';
import type { Item, Roots, ScanResult, Warning } from '../types.js';
import { errMessage, isDir, isFile, readJson } from '../util.js';
import { collectShipped } from './plugins.js';

const MAX_DEPTH = 3;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function subdirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((d) => !d.startsWith('.') && isDir(path.join(dir, d))).sort();
  } catch {
    return [];
  }
}

/**
 * Account-synced plugins under <claudeDir>/plugins/synced/<bucket>/. Any
 * directory with .claude-plugin/plugin.json up to three levels below a bucket
 * is a plugin; its shipped skills and agents follow. Dot names are ignored.
 */
export function scanSyncedPlugins(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const base = path.join(roots.claudeDir, 'plugins', 'synced');
  const seen = new Set<string>();

  const visit = (dir: string, depth: number, bucket: string): void => {
    let real: string;
    try { real = fs.realpathSync(dir); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    const manifestFile = path.join(real, '.claude-plugin', 'plugin.json');
    const label = `${bucket}/${path.relative(path.join(base, bucket), dir) || '.'}`;
    if (isFile(manifestFile)) {
      let manifest: Record<string, unknown>;
      try {
        const doc = readJson(manifestFile);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not an object');
        manifest = doc as Record<string, unknown>;
      } catch (e) {
        warnings.push({ source: 'synced', message: `${label}: plugin.json: ${errMessage(e)}` });
        return;
      }
      const name = str(manifest.name) ?? path.basename(dir);
      items.push({
        id: `synced:plugin:${name}`,
        kind: 'plugin',
        surface: 'synced',
        name,
        description: str(manifest.description),
        enabled: true,
        origin: 'synced',
        path: real,
        version: str(manifest.version),
        detail: { bucket },
      });
      collectShipped(real, { surface: 'synced', source: 'synced', label, pluginName: name, origin: name, enabled: true }, items, warnings);
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const d of subdirs(real)) visit(path.join(dir, d), depth + 1, bucket);
  };

  for (const bucket of subdirs(base)) {
    for (const d of subdirs(path.join(base, bucket))) visit(path.join(base, bucket, d), 1, bucket);
  }
  return { items, warnings };
}
