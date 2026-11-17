import type { Card, Warning } from './types.js';
import type { Exec } from './usage/index.js';

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/**
 * Catalog versions by plugin id from `claude plugin list --available --json`.
 * The output shape is not documented, so this accepts a bare array or an
 * object holding an `available` (or `plugins`) array; an entry's id is
 * `pluginId`, `id`, or `name@marketplace`.
 */
function catalogVersions(doc: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const rows = Array.isArray(doc)
    ? doc
    : Array.isArray(rec(doc)?.available) ? (rec(doc)!.available as unknown[])
    : Array.isArray(rec(doc)?.plugins) ? (rec(doc)!.plugins as unknown[])
    : [];
  for (const row of rows) {
    const r = rec(row);
    if (!r || typeof r.version !== 'string') continue;
    const id = typeof r.pluginId === 'string' ? r.pluginId
      : typeof r.id === 'string' ? r.id
      : typeof r.name === 'string' && typeof r.marketplace === 'string' ? `${r.name}@${r.marketplace}`
      : undefined;
    if (id) out.set(id, r.version);
  }
  return out;
}

/** Set `update` on installed plugins whose version differs from the catalog's. */
export async function checkUpdates(
  cards: Card[],
  exec: Exec,
): Promise<{ cards: Card[]; warnings: Warning[] }> {
  let catalog: Map<string, string>;
  try {
    const r = await exec('claude', ['plugin', 'list', '--available', '--json']);
    if (r.code !== 0) throw new Error(`exit code ${r.code}`);
    catalog = catalogVersions(JSON.parse(r.stdout));
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { cards, warnings: [{ source: 'updates', message: `claude plugin list failed: ${why}` }] };
  }
  const out = cards.map((c) => {
    if (c.kind !== 'plugin' || !c.version) return c;
    const latest = catalog.get(c.name);
    if (!latest || latest === c.version) return c;
    return { ...c, update: { installed: c.version, latest } };
  });
  return { cards: out, warnings: [] };
}
