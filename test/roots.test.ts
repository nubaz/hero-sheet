import { describe, it, expect } from 'vitest';
import { resolveRoots } from '../src/roots.js';

describe('resolveRoots', () => {
  it('derives defaults from home', () => {
    const r = resolveRoots('/h', {});
    expect(r.claudeDir).toBe('/h/.claude');
    expect(r.claudeJson).toBe('/h/.claude.json');
    expect(r.desktopDir).toBe('/h/Library/Application Support/Claude');
    expect(r.stateDir).toBe('/h/.local/state/hero-sheet');
  });
  it('honours CLAUDE_CONFIG_DIR and XDG_STATE_HOME', () => {
    const r = resolveRoots('/h', { CLAUDE_CONFIG_DIR: '/x', XDG_STATE_HOME: '/s' });
    expect(r.claudeDir).toBe('/x');
    expect(r.stateDir).toBe('/s/hero-sheet');
  });
});
