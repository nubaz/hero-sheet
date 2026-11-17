import os from 'node:os';
import path from 'node:path';
import type { Roots } from './types.js';

export function resolveRoots(
  home: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): Roots {
  return {
    home,
    claudeDir: env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
    claudeJson: path.join(home, '.claude.json'),
    desktopDir: path.join(home, 'Library', 'Application Support', 'Claude'),
    stateDir: path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'hero-sheet'),
  };
}
