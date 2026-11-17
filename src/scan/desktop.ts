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

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((d) => !d.startsWith('.') && isDir(path.join(dir, d))).sort();
  } catch {
    return [];
  }
}

function isoOf(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  return str(v);
}

/**
 * Desktop-app skills. The manifest at
 * <desktopDir>/local-agent-mode-sessions/skills-plugin/<a>/<b>/manifest.json
 * is the source of truth for name, description, enabled and updatedAt.
 */
export function scanDesktopSkills(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const base = path.join(roots.desktopDir, 'local-agent-mode-sessions', 'skills-plugin');
  const seen = new Set<string>();

  for (const a of listDirs(base)) {
    for (const b of listDirs(path.join(base, a))) {
      const bDir = path.join(base, a, b);
      const manifestFile = path.join(bDir, 'manifest.json');
      let skills: unknown[];
      try {
        const m = asRecord(readJson(manifestFile));
        if (!m || !Array.isArray(m.skills)) throw new Error('no "skills" array');
        skills = m.skills;
      } catch (e) {
        warnings.push({ source: 'desktop', message: `${a}/${b}/manifest.json: ${errMessage(e)}` });
        continue;
      }
      for (const s of skills) {
        const rec = asRecord(s);
        const name = str(rec?.name);
        if (!rec || !name) {
          warnings.push({ source: 'desktop', message: `${a}/${b}: manifest skill without a name` });
          continue;
        }
        if (seen.has(name)) continue;
        seen.add(name);
        const description = str(rec.description);
        const detail: Record<string, string> = {};
        const creatorType = str(rec.creatorType);
        if (creatorType) detail.creatorType = creatorType;
        const skillId = str(rec.skillId);
        if (skillId) detail.skillId = skillId;
        const item: Item = {
          id: `desktop:skill:${name}`,
          kind: 'skill',
          surface: 'desktop',
          name,
          description,
          enabled: rec.enabled === true,
          origin: str(rec.backingPluginId),
          updatedAt: isoOf(rec.updatedAt),
          detail,
        };
        const dir = path.join(bDir, 'skills', name);
        const file = path.join(dir, 'SKILL.md');
        if (isFile(file)) {
          try {
            const chars = fs.readFileSync(file, 'utf8').length;
            item.path = fs.realpathSync(dir);
            item.staticTokensEst = estTokens(chars);
            item.startupTokensEst = estTokens((name + (description ?? '')).length);
          } catch (e) {
            warnings.push({ source: 'desktop', message: `${name}: ${errMessage(e)}` });
          }
        }
        items.push(item);
      }
    }
  }
  return { items, warnings };
}

/**
 * Account-synced skills. Observed layout is <claudeDir>/skills/synced/<bucket>/<name>/SKILL.md;
 * a nested <bucket>/skills/<name>/ layout is accepted too.
 */
export function scanSynced(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const base = path.join(roots.claudeDir, 'skills', 'synced');
  const seen = new Set<string>();
  for (const bucket of listDirs(base)) {
    const bucketDir = path.join(base, bucket);
    const nested = path.join(bucketDir, 'skills');
    const candidates = [
      ...listDirs(bucketDir).filter((e) => e !== 'skills').map((e) => path.join(bucketDir, e)),
      ...listDirs(nested).map((e) => path.join(nested, e)),
    ];
    for (const dir of candidates) {
      const entry = path.basename(dir);
      let real: string;
      try { real = fs.realpathSync(dir); } catch { continue; }
      if (seen.has(real)) continue;
      seen.add(real);
      try {
        const fm = readSkillFile(path.join(real, 'SKILL.md'));
        const name = fm.name ?? entry;
        items.push({
          id: `synced:skill:${name}`,
          kind: 'skill',
          surface: 'synced',
          name,
          description: fm.description,
          enabled: true,
          origin: 'synced',
          path: real,
          staticTokensEst: estTokens(fm.chars),
          startupTokensEst: estTokens((name + (fm.description ?? '')).length),
        });
      } catch (e) {
        const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no SKILL.md' : errMessage(e);
        warnings.push({ source: 'synced', message: `${bucket}/${entry}: ${msg}` });
      }
    }
  }
  return { items, warnings };
}
