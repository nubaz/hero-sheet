import type { Item, Roots, ScanResult } from '../types.js';
import { iterTranscriptLines, parseMcpTool, walkStrings } from '../usage/transcripts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STRING = 300; // tool names are short; skip long text blobs

/**
 * Servers that are not in any config file, inferred from tool names seen in
 * recent transcripts: claude.ai connectors (UUID segment) and servers provided
 * by the desktop app. A tool name counts only when a JSON string value equals
 * it exactly (tool_use names, deferred tool lists), never from free text.
 * `known` holds configured server names and plugin names.
 */
export async function scanConnectors(
  roots: Roots,
  known: Set<string>,
  sinceDays = 30,
  now: Date = new Date(),
): Promise<ScanResult> {
  const tools = new Map<string, Set<string>>();
  for await (const { line } of iterTranscriptLines(roots, sinceDays, now)) {
    for (const s of walkStrings(line)) {
      if (s.length > MAX_STRING || !s.startsWith('mcp__')) continue;
      const parsed = parseMcpTool(s);
      if (!parsed) continue;
      let set = tools.get(parsed.server);
      if (!set) tools.set(parsed.server, (set = new Set()));
      set.add(parsed.tool);
    }
  }

  const isKnown = (seg: string): boolean => {
    if (known.has(seg)) return true;
    // plugin-provided servers appear as plugin_<plugin>_<server>
    if (seg.startsWith('plugin_')) {
      for (const k of known) if (seg.startsWith(`plugin_${k}_`)) return true;
    }
    return false;
  };

  const items: Item[] = [];
  for (const server of [...tools.keys()].sort()) {
    if (isKnown(server)) continue;
    if (UUID.test(server)) {
      items.push({
        id: `connector:mcp_server:${server}`,
        kind: 'mcp_server',
        surface: 'connector',
        name: server,
        enabled: true,
        inferred: true,
        detail: { sampleTools: [...tools.get(server)!].sort().slice(0, 5).join(', ') },
      });
    } else {
      items.push({
        id: `cli:mcp_server:${server}`,
        kind: 'mcp_server',
        surface: 'cli',
        name: server,
        enabled: true,
        origin: 'app',
        inferred: true,
      });
    }
  }
  return { items, warnings: [] };
}
