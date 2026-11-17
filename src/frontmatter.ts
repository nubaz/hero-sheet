import fs from 'node:fs';
import { parse } from 'yaml';

/**
 * Read a SKILL.md or agent .md file. Throws if the file is unreadable or its
 * frontmatter is not valid YAML; callers turn that into a warning.
 * A file without frontmatter is valid and yields no name or description.
 */
export function readSkillFile(file: string): { name?: string; description?: string; chars: number } {
  const text = fs.readFileSync(file, 'utf8');
  const chars = text.length;
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return { chars };
  let data: unknown;
  try {
    data = parse(m[1]);
  } catch (e) {
    // Claude Code accepts frontmatter that strict YAML rejects, most often an
    // unquoted description containing ": ". Fall back to reading the two
    // fields we need line by line; give up only if neither is there.
    const loose = looseFields(m[1]);
    if (!loose.name && !loose.description) throw e;
    return { ...loose, chars };
  }
  if (data === null || data === undefined) return { chars };
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter is not a mapping');
  }
  const rec = data as Record<string, unknown>;
  const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : undefined;
  const description = typeof rec.description === 'string'
    ? rec.description.trim().replace(/\s+/g, ' ')
    : undefined;
  return { name, description, chars };
}

function looseFields(block: string): { name?: string; description?: string } {
  const out: { name?: string; description?: string } = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^(name|description):\s*(.+)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2').replace(/\s+/g, ' ');
    if (value && out[m[1] as 'name' | 'description'] === undefined) out[m[1] as 'name' | 'description'] = value;
  }
  return out;
}
