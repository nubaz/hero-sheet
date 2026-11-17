import fs from 'node:fs';
import path from 'node:path';
import type { Card, Roots, Warning } from './types.js';
import { errMessage, readJson } from './util.js';

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/** Some installs record a git commit hash instead of a version; those are not comparable. */
function isCommitHash(v: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(v);
}

/** `plugin.json` version under a relative `source` inside the clone, if it stays inside. */
function sourceVersion(clone: string, source: string): string | undefined {
  const dir = path.resolve(clone, source);
  const rel = path.relative(clone, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  try {
    return str(rec(readJson(path.join(dir, '.claude-plugin', 'plugin.json')))?.version);
  } catch {
    return undefined;
  }
}

/**
 * Set `update` on installed plugins whose version differs from the one in the
 * marketplace clone under <claudeDir>/plugins/marketplaces/<marketplace>.
 * Pure file read. A missing clone or entry, or a version on only one side,
 * gives no update and no warning; an unparsable catalog gives one warning.
 */
export function checkUpdates(
  cards: Card[],
  roots: Roots,
): { cards: Card[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const catalogs = new Map<string, Map<string, Record<string, unknown>> | undefined>();

  const entryFor = (marketplace: string, name: string): { clone: string; entry: Record<string, unknown> } | undefined => {
    const clone = path.join(roots.claudeDir, 'plugins', 'marketplaces', marketplace);
    if (!catalogs.has(marketplace)) {
      let map: Map<string, Record<string, unknown>> | undefined;
      const file = path.join(clone, '.claude-plugin', 'marketplace.json');
      if (fs.existsSync(file)) {
        try {
          const plugins = rec(readJson(file))?.plugins;
          if (!Array.isArray(plugins)) throw new Error('no "plugins" array');
          map = new Map();
          for (const p of plugins) {
            const r = rec(p);
            const n = str(r?.name);
            if (r && n && !map.has(n)) map.set(n, r);
          }
        } catch (e) {
          warnings.push({ source: 'updates', message: `${marketplace}: marketplace.json: ${errMessage(e)}` });
        }
      }
      catalogs.set(marketplace, map);
    }
    const entry = catalogs.get(marketplace)?.get(name);
    return entry ? { clone, entry } : undefined;
  };

  const out = cards.map((c) => {
    if (c.kind !== 'plugin' || !c.version || isCommitHash(c.version)) return c;
    const at = c.name.indexOf('@');
    if (at < 1) return c;
    const hit = entryFor(c.name.slice(at + 1), c.name.slice(0, at));
    if (!hit) return c;
    const source = str(hit.entry.source);
    const latest = str(hit.entry.version) ?? (source ? sourceVersion(hit.clone, source) : undefined);
    if (!latest || latest === c.version) return c;
    return { ...c, update: { installed: c.version, latest } };
  });
  return { cards: out, warnings };
}
