import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { scanUserSkills } from '../src/scan/skills.js';

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');
const roots = resolveRoots(home, {});

describe('scanUserSkills', () => {
  const { items, warnings } = scanUserSkills(roots);
  const byId = new Map(items.map((i) => [i.id, i]));

  it('lists plain and symlinked skills', () => {
    expect(byId.has('cli:skill:alpha')).toBe(true);
    expect(byId.has('cli:skill:linked')).toBe(true);
    expect(items.filter((i) => i.name === 'linked')).toHaveLength(1);
  });

  it('reads description and estimates startup tokens', () => {
    const alpha = byId.get('cli:skill:alpha')!;
    expect(alpha.description).toBe('Alpha test skill');
    expect(alpha.startupTokensEst).toBe(Math.ceil(('alpha' + 'Alpha test skill').length / 4));
    expect(alpha.surface).toBe('cli');
    expect(alpha.origin).toBe('user');
    expect(alpha.enabled).toBe(true);
  });

  it('follows the symlink and reports the real path', () => {
    expect(byId.get('cli:skill:linked')!.path!.endsWith('skill-store/linked')).toBe(true);
  });

  it('warns about broken skills without dropping the others', () => {
    expect(warnings.filter((w) => w.message.includes('broken-yaml'))).toHaveLength(1);
    expect(warnings.filter((w) => w.message.includes('no-skill-file'))).toHaveLength(1);
    expect(items.some((i) => i.name === 'broken-yaml' || i.name === 'no-skill-file')).toBe(false);
  });

  it('reads frontmatter that strict YAML rejects', () => {
    const item = items.find((i) => i.id === 'cli:skill:colon-desc');
    expect(item?.description).toBe('Notes about a person: their rules and preferences');
    expect(warnings.some((w) => w.message.includes('colon-desc'))).toBe(false);
  });

  it('skips the synced directory', () => {
    expect(items.some((i) => i.name === 'synced')).toBe(false);
  });
});
