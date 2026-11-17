export type Surface = 'cli' | 'synced' | 'desktop' | 'connector';
export type Kind = 'skill' | 'plugin' | 'mcp_server' | 'agent' | 'hook'
  | 'scheduled_task' | 'memory' | 'instructions';

export interface Item {
  id: string;            // `${surface}:${kind}:${name}`; plugin-shipped: name is `${plugin}:${skill}`
  kind: Kind;
  surface: Surface;
  name: string;
  description?: string; // raw frontmatter/manifest description
  enabled: boolean;
  origin?: string;      // owning plugin id, or 'user'
  path?: string;        // real path of the defining file or directory
  version?: string;
  installedAt?: string;
  updatedAt?: string;
  staticTokensEst?: number;  // whole file
  startupTokensEst?: number; // name + description only
  inferred?: boolean;   // true when not read from a config file
  detail?: Record<string, string | number | boolean>;
}

export interface Usage {
  uses30d: number;
  lastUsedAt?: string;
  lifetimeUses?: number;
  outTokens?: number;
  ctxGrowth?: number;
}

export type Verdict = 'active' | 'rare' | 'dead_weight' | 'disabled' | 'unknown';

export interface Card extends Item {
  usage: Usage;
  verdict: Verdict;
  update?: { installed: string; latest: string };
}

export interface Warning { source: string; message: string; }

export interface RuleResult {
  id: string; title: string; matched: number; total: number; rate: number; target: number;
}

export interface State {
  generatedAt: string;
  usageSource: 'cclens' | 'transcripts';
  cards: Card[];
  rules: RuleResult[];
  warnings: Warning[];
  totals: Record<Kind, number>;
}

export interface Roots {
  home: string;
  claudeDir: string;
  claudeJson: string;
  desktopDir: string;
  stateDir: string;
}

export interface ScanResult { items: Item[]; warnings: Warning[]; }
