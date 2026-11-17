import fs from 'node:fs';
import path from 'node:path';
import type { Item, Roots, ScanResult, Surface, Warning } from '../types.js';
import { readSkillFile } from '../frontmatter.js';
import { errMessage, estTokens, isDir, readJson } from '../util.js';

export type { ScanResult } from '../types.js';

interface InstalledEntry {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export interface ShippedCtx {
  surface: Surface;
  source: string;   // warning source
  label: string;    // plugin label used in warnings
  pluginName: string;
  origin: string;   // value of `origin` on shipped items
  enabled: boolean;
}

/** Skills (<dir>/skills/*\/SKILL.md) and agents (<dir>/agents/*.md) a plugin directory ships. */
export function collectShipped(dir: string, ctx: ShippedCtx, items: Item[], warnings: Warning[]): void {
  const { surface, source, label, pluginName, origin, enabled } = ctx;
  const shipped = (kind: 'skill' | 'agent', file: string, fallbackName: string): void => {
    try {
      const fm = readSkillFile(file);
      const shortName = fm.name ?? fallbackName;
      const description = fm.description;
      items.push({
        id: `${surface}:${kind}:${pluginName}:${shortName}`,
        kind,
        surface,
        name: `${pluginName}:${shortName}`,
        description,
        enabled,
        origin,
        path: fs.realpathSync(file),
        staticTokensEst: estTokens(fm.chars),
        startupTokensEst: estTokens((shortName + (description ?? '')).length),
      });
    } catch (e) {
      warnings.push({ source, message: `${label}: ${kind} ${fallbackName}: ${errMessage(e)}` });
    }
  };

  const skillsDir = path.join(dir, 'skills');
  if (isDir(skillsDir)) {
    for (const d of fs.readdirSync(skillsDir).sort()) {
      if (d.startsWith('.') || !isDir(path.join(skillsDir, d))) continue;
      const file = path.join(skillsDir, d, 'SKILL.md');
      if (!fs.existsSync(file)) {
        warnings.push({ source, message: `${label}: skill ${d}: no SKILL.md` });
        continue;
      }
      shipped('skill', file, d);
    }
  }
  const agentsDir = path.join(dir, 'agents');
  if (isDir(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir).sort()) {
      if (!f.endsWith('.md') || f.startsWith('.')) continue;
      shipped('agent', path.join(agentsDir, f), f.slice(0, -3));
    }
  }
}

/** Plugins from installed_plugins.json plus the skills and agents each one ships. */
export function scanPlugins(roots: Roots): ScanResult {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const installedFile = path.join(roots.claudeDir, 'plugins', 'installed_plugins.json');

  let plugins: Record<string, unknown>;
  try {
    const doc = asRecord(readJson(installedFile));
    const p = asRecord(doc?.plugins);
    if (!p) throw new Error('no "plugins" object');
    plugins = p;
  } catch (e) {
    warnings.push({ source: 'plugins', message: `installed_plugins.json: ${errMessage(e)}` });
    return { items, warnings };
  }

  let enabledPlugins: Record<string, unknown> = {};
  try {
    enabledPlugins = asRecord(asRecord(readJson(path.join(roots.claudeDir, 'settings.json')))?.enabledPlugins) ?? {};
  } catch (e) {
    warnings.push({ source: 'plugins', message: `settings.json: ${errMessage(e)}; plugins treated as disabled` });
  }

  for (const id of Object.keys(plugins).sort()) {
    const list = plugins[id];
    const entry = (Array.isArray(list) ? asRecord(list[0]) : undefined) as InstalledEntry | undefined;
    if (!entry) {
      warnings.push({ source: 'plugins', message: `${id}: no install entry` });
      continue;
    }
    const enabled = enabledPlugins[id] === true;
    const pluginName = id.split('@')[0];
    const marketplace = id.includes('@') ? id.slice(id.indexOf('@') + 1) : '';

    // Fixtures and tests use a path relative to claudeDir; real installs are absolute.
    const rawPath = str(entry.installPath);
    let installPath: string | undefined;
    if (rawPath) {
      const abs = path.isAbsolute(rawPath) ? rawPath : path.join(roots.claudeDir, rawPath);
      try { installPath = fs.realpathSync(abs); } catch { installPath = undefined; }
    }

    const plugin: Item = {
      id: `cli:plugin:${id}`,
      kind: 'plugin',
      surface: 'cli',
      name: id,
      enabled,
      path: installPath,
      version: str(entry.version),
      installedAt: str(entry.installedAt),
      updatedAt: str(entry.lastUpdated),
      detail: { scope: str(entry.scope) ?? 'unknown', ...(marketplace ? { marketplace } : {}) },
    };
    if (installPath) {
      try {
        const manifest = asRecord(readJson(path.join(installPath, '.claude-plugin', 'plugin.json')));
        const description = str(manifest?.description);
        if (description) plugin.description = description;
      } catch { /* manifest is optional */ }
    }
    items.push(plugin);

    if (!installPath || !isDir(installPath)) {
      warnings.push({ source: 'plugins', message: `${id}: installPath not found` });
      continue;
    }

    collectShipped(installPath, { surface: 'cli', source: 'plugins', label: id, pluginName, origin: id, enabled }, items, warnings);
  }
  return { items, warnings };
}
