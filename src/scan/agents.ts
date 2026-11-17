import fs from 'node:fs';
import path from 'node:path';
import type { Item, Roots, ScanResult, Warning } from '../types.js';
import { readSkillFile } from '../frontmatter.js';
import { errMessage, estTokens, isDir } from '../util.js';

/** User agents: <claudeDir>/agents/*.md. Dot files are skipped. */
export function scanUserAgents(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const dir = path.join(roots.claudeDir, 'agents');
  if (!isDir(dir)) return { items, warnings };
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).sort();
  } catch (e) {
    warnings.push({ source: 'agents', message: `cannot read ${dir}: ${errMessage(e)}` });
    return { items, warnings };
  }
  for (const f of entries) {
    if (!f.endsWith('.md') || f.startsWith('.')) continue;
    try {
      const real = fs.realpathSync(path.join(dir, f));
      const fm = readSkillFile(real);
      const name = fm.name ?? f.slice(0, -3);
      items.push({
        id: `cli:agent:${name}`,
        kind: 'agent',
        surface: 'cli',
        name,
        description: fm.description,
        enabled: true,
        origin: 'user',
        path: real,
        staticTokensEst: estTokens(fm.chars),
        startupTokensEst: estTokens((name + (fm.description ?? '')).length),
      });
    } catch (e) {
      warnings.push({ source: 'agents', message: `${f}: ${errMessage(e)}` });
    }
  }
  return { items, warnings };
}
