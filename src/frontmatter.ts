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
  const data = parse(m[1]) as unknown;
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
