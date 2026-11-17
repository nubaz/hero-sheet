import type { BranchId, Item } from './types.js';

/** Branch for an item that has not been enriched. */
export function defaultBranch(item: Item): BranchId {
  switch (item.kind) {
    case 'mcp_server': return 'system';
    case 'memory':
    case 'instructions': return 'memory';
    case 'hook':
    case 'scheduled_task': return 'automation';
    default: return 'other';
  }
}

/**
 * Grouping inside a branch: the owning plugin name (without marketplace),
 * 'user', 'desktop', 'synced', 'connectors' or 'app'.
 */
export function packOf(item: Item): string {
  if (item.surface === 'connector') return 'connectors';
  if (item.origin === 'app') return 'app';
  if (item.origin === 'user') return 'user';
  if (item.origin === 'synced') return 'synced';
  if (item.surface === 'desktop') return 'desktop';
  if (item.kind === 'plugin') return item.name.split('@')[0];
  if (item.origin) return item.origin.split('@')[0];
  return item.surface === 'synced' ? 'synced' : 'user';
}
