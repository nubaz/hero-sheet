import fs from 'node:fs';
import path from 'node:path';
import type { Item, Roots, ScanResult, Warning } from '../types.js';
import { readSkillFile } from '../frontmatter.js';
import { errMessage, estTokens, isDir } from '../util.js';

export type { ScanResult } from '../types.js';

/** Skills under <claudeDir>/skills. Skips `synced` (see scanSynced) and dot directories. */
export function scanUserSkills(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const dir = path.join(roots.claudeDir, 'skills');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      warnings.push({ source: 'skills', message: `cannot read ${dir}: ${errMessage(e)}` });
    }
    return { items, warnings };
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry === 'synced' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let real: string;
    try {
      real = fs.realpathSync(full);
    } catch {
      warnings.push({ source: 'skills', message: `${entry}: broken symlink` });
      continue;
    }
    if (!isDir(real)) continue;
    if (seen.has(real)) continue;
    seen.add(real);
    const file = path.join(real, 'SKILL.md');
    try {
      const fm = readSkillFile(file);
      const name = fm.name ?? entry;
      const description = fm.description;
      items.push({
        id: `cli:skill:${name}`,
        kind: 'skill',
        surface: 'cli',
        name,
        description,
        enabled: true,
        origin: 'user',
        path: real,
        staticTokensEst: estTokens(fm.chars),
        startupTokensEst: estTokens((name + (description ?? '')).length),
      });
    } catch (e) {
      const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no SKILL.md' : errMessage(e);
      warnings.push({ source: 'skills', message: `${entry}: ${msg}` });
    }
  }
  return { items, warnings };
}
