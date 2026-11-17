#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { appendSnapshot } from './journal.js';
import { buildCards } from './join.js';
import { evaluateRules, loadRuleConfig, type RuleConfig } from './rules.js';
import { resolveRoots } from './roots.js';
import { scanConnectors } from './scan/connectors.js';
import { scanMcpServers, scanHooks, scanMemory, scanScheduledTasks } from './scan/config.js';
import { scanDesktopSkills, scanSynced } from './scan/desktop.js';
import { scanUserAgents } from './scan/agents.js';
import { scanPlugins } from './scan/plugins.js';
import { scanSyncedPlugins } from './scan/synced-plugins.js';
import { scanUserSkills } from './scan/skills.js';
import type { Item, Kind, RuleResult, ScanResult, State, Warning } from './types.js';
import { checkUpdates } from './updates.js';
import { errMessage } from './util.js';
import { collectUsage, type Exec } from './usage/index.js';
import { lifetimeFromClaudeJson } from './usage/native.js';
import { missedFromTranscripts } from './usage/oracle.js';

const KINDS: Kind[] = ['skill', 'plugin', 'mcp_server', 'agent', 'hook', 'scheduled_task', 'memory', 'instructions'];

const USAGE = `usage: hero-sheet scan [--home <dir>] [--out <file>] [--rules <file>] [--days 30]`;

/** Runs a binary without a shell. Missing binary gives code 127. */
export const defaultExec: Exec = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, timeout: 120_000 }, (err, stdout) => {
      if (!err) return resolve({ code: 0, stdout });
      const code = (err as NodeJS.ErrnoException).code;
      resolve({ code: typeof code === 'number' ? code : 127, stdout: typeof stdout === 'string' ? stdout : '' });
    });
  });

export interface Deps {
  exec?: Exec;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const baseExec = deps.exec ?? defaultExec;
  const now = deps.now ?? (() => new Date());
  const env = deps.env ?? process.env;

  let values: { home?: string; out?: string; rules?: string; days?: string };
  let command: string | undefined;
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        home: { type: 'string' }, out: { type: 'string' },
        rules: { type: 'string' }, days: { type: 'string' },
      },
    });
    values = parsed.values;
    command = parsed.positionals[0];
  } catch (e) {
    process.stderr.write(`${errMessage(e)}\n${USAGE}\n`);
    return 2;
  }
  const days = values.days === undefined ? 30 : Number(values.days);
  if (command !== 'scan' || !Number.isFinite(days) || days <= 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  // cclens always reads the real home and cannot be pointed at another one,
  // so with --home it is not run: usage comes from that home's transcripts.
  const external = values.home === undefined;
  const exec: Exec = external ? baseExec : async () => ({ code: 127, stdout: '' });
  const roots = resolveRoots(values.home, env);
  const when = now();
  const items: Item[] = [];
  const warnings: Warning[] = [];

  const run = (source: string, fn: () => ScanResult): void => {
    try {
      const r = fn();
      items.push(...r.items);
      warnings.push(...r.warnings);
    } catch (e) {
      warnings.push({ source, message: errMessage(e) });
    }
  };
  run('skills', () => scanUserSkills(roots));
  run('agents', () => scanUserAgents(roots));
  run('plugins', () => scanPlugins(roots));
  run('mcp', () => scanMcpServers(roots));
  run('hooks', () => scanHooks(roots));
  run('scheduled-tasks', () => scanScheduledTasks(roots));
  run('memory', () => scanMemory(roots));
  run('synced', () => scanSynced(roots));
  run('synced-plugins', () => scanSyncedPlugins(roots));
  run('desktop', () => scanDesktopSkills(roots));

  try {
    const known = new Set<string>();
    for (const it of items) {
      if (it.kind === 'mcp_server') known.add(it.name);
      if (it.kind === 'plugin') known.add(it.name.split('@')[0]);
    }
    const r = await scanConnectors(roots, known, days, when);
    items.push(...r.items);
    warnings.push(...r.warnings);
  } catch (e) {
    warnings.push({ source: 'connectors', message: errMessage(e) });
  }

  let usage;
  try {
    usage = await collectUsage(roots, exec, { days, now: when });
  } catch (e) {
    warnings.push({ source: 'usage', message: errMessage(e) });
    usage = { skills: new Map(), servers: new Map(), agents: new Map(), source: 'transcripts' as const, sessions: 0 };
  }
  // rules file: rules and the optional skill oracle; a broken file is one warning
  const ruleFile = values.rules ?? path.join(roots.stateDir, 'rules.json');
  let ruleConfig: RuleConfig = { rules: [] };
  let ruleError: string | undefined;
  try { ruleConfig = loadRuleConfig(ruleFile); } catch (e) { ruleError = errMessage(e); }

  let missed = new Map<string, number>();
  if (ruleConfig.oracle) {
    try {
      missed = await missedFromTranscripts(roots, ruleConfig.oracle, days, when);
    } catch (e) {
      warnings.push({ source: 'oracle', message: errMessage(e) });
    }
  }
  let cards = buildCards(items, usage, lifetimeFromClaudeJson(roots), missed);

  try {
    const updated = checkUpdates(cards, roots);
    cards = updated.cards;
    warnings.push(...updated.warnings);
  } catch (e) {
    warnings.push({ source: 'updates', message: errMessage(e) });
  }

  let rules: RuleResult[] = [];
  try {
    if (ruleError !== undefined) throw new Error(ruleError);
    rules = await evaluateRules(roots, ruleConfig.rules, days, when);
  } catch (e) {
    warnings.push({ source: 'rules', message: errMessage(e) });
  }

  const totals = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  for (const c of cards) totals[c.kind]++;

  const state: State = {
    generatedAt: when.toISOString(),
    usageSource: usage.source,
    cards, rules, warnings, totals,
  };
  const out = values.out ?? path.join(roots.stateDir, 'state.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(state, null, 2) + '\n');
  appendSnapshot(roots, state);

  process.stdout.write(
    `${cards.length} items, ${warnings.length} warnings, usage from ${state.usageSource} -> ${out}\n`,
  );
  return 0;
}

function isEntryPoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try { return import.meta.url === pathToFileURL(fs.realpathSync(arg)).href; } catch { return false; }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { process.stderr.write(`${errMessage(e)}\n`); process.exitCode = 1; },
  );
}
