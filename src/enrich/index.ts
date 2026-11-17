import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defaultBranch } from '../branch.js';
import type { BranchId, Card, Localized, Warning } from '../types.js';
import { errMessage } from '../util.js';
import { PROMPT } from './prompt.js';

export const BRANCHES: BranchId[] = ['code', 'design', 'research', 'writing', 'data', 'automation',
  'memory', 'communication', 'finance', 'system', 'other'];

/** Kinds with no text that is safe to send (hook commands, memory names built from paths). */
const NOT_DESCRIBED = new Set<Card['kind']>(['memory', 'instructions', 'hook']);

const MAX_TITLE = 80;
const MAX_SUMMARY = 400;
const MAX_WARNINGS_PER_BATCH = 5;
const DESCRIBER_TIMEOUT_MS = 300_000;

export interface Enrichment { branch: BranchId; title: Localized; summary: Localized; }

export interface DescribeItem {
  id: string; kind: string; name: string; description?: string; sampleTools?: string[];
}
export interface DescribeRequest { branches: BranchId[]; items: DescribeItem[]; }

/** sha256 over kind, name and description: an unchanged item keeps its key. */
export function cacheKey(c: Pick<Card, 'kind' | 'name' | 'description'>): string {
  return createHash('sha256').update(JSON.stringify([c.kind, c.name, c.description ?? null])).digest('hex');
}

/** The only fields of a card that may leave the process. */
function toDescribeItem(c: Card): DescribeItem {
  const item: DescribeItem = { id: c.id, kind: c.kind, name: c.name };
  if (c.description !== undefined) item.description = c.description;
  const tools = c.surface === 'connector' ? c.detail?.sampleTools : undefined;
  if (typeof tools === 'string' && tools) item.sampleTools = tools.split(',').map((t) => t.trim()).filter(Boolean);
  return item;
}

// ---- cache -----------------------------------------------------------------

export interface Cache { entries: Map<string, Enrichment>; }

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n).trimEnd() : s);

function localized(v: unknown, max: number): Localized | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { en, ru } = v as { en?: unknown; ru?: unknown };
  if (typeof en !== 'string' || !en.trim()) return undefined;
  const out: Localized = { en: clip(en.trim(), max) };
  if (typeof ru === 'string' && ru.trim()) out.ru = clip(ru.trim(), max);
  return out;
}

/** Reads the cache file. A missing file is an empty cache; garbage is an empty cache plus a warning. */
export function loadCache(file: string): Cache & { warnings: Warning[] } {
  const cache = { entries: new Map<string, Enrichment>(), warnings: [] as Warning[] };
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      cache.warnings.push({ source: 'enrich', message: `cache unreadable, starting empty: ${errMessage(e)}` });
    }
    return cache;
  }
  try {
    const doc = JSON.parse(text) as { entries?: Record<string, unknown> };
    if (!doc || typeof doc.entries !== 'object' || doc.entries === null || Array.isArray(doc.entries)) {
      throw new Error('no entries object');
    }
    for (const [key, raw] of Object.entries(doc.entries)) {
      const r = raw as { branch?: unknown; title?: unknown; summary?: unknown } | null;
      const title = localized(r?.title, MAX_TITLE);
      const summary = localized(r?.summary, MAX_SUMMARY);
      if (!title || !summary) continue;
      const branch = BRANCHES.includes(r?.branch as BranchId) ? (r!.branch as BranchId) : 'other';
      cache.entries.set(key, { branch, title, summary });
    }
  } catch (e) {
    cache.entries.clear();
    cache.warnings.push({ source: 'enrich', message: `cache is not valid, starting empty: ${errMessage(e)}` });
  }
  return cache;
}

/** Atomic write: a crash or a full disk never leaves a half-written cache. */
export function saveCache(file: string, cache: Cache): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: Object.fromEntries(cache.entries) }, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** Cards with branch, title and summary from the cache; the flag says whether any card got one. */
export function applyCache(cards: Card[], cache: Cache): { cards: Card[]; enriched: boolean } {
  let enriched = false;
  const out = cards.map((c): Card => {
    // a stale title or summary from an earlier run goes away with its cache entry
    const { title: _t, summary: _s, ...rest } = c;
    const hit = NOT_DESCRIBED.has(c.kind) ? undefined : cache.entries.get(cacheKey(c));
    if (!hit) return { ...rest, branch: defaultBranch(c) };
    enriched = true;
    return { ...rest, branch: hit.branch, title: hit.title, summary: hit.summary };
  });
  return { cards: out, enriched };
}

// ---- describer output ------------------------------------------------------

/** The outermost JSON array in `text`; anything around it is ignored. */
export function extractArray(text: string): unknown[] | undefined {
  const end = text.lastIndexOf(']');
  let start = text.indexOf('[');
  for (let tries = 0; start !== -1 && start < end && tries < 50; tries++) {
    try {
      const v: unknown = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(v)) return v;
    } catch { /* try the next opening bracket */ }
    start = text.indexOf('[', start + 1);
  }
  return undefined;
}

/** Valid entries for the ids that were asked about; the rest is skipped with a warning each. */
export function parseEntries(
  raw: unknown[],
  asked: Set<string>,
): { entries: Map<string, Enrichment>; warnings: string[] } {
  const entries = new Map<string, Enrichment>();
  const warnings: string[] = [];
  raw.forEach((r, i) => {
    const e = r as { id?: unknown; branch?: unknown; title?: unknown; summary?: unknown } | null;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string') { warnings.push(`entry ${i}: no id`); return; }
    if (!asked.has(e.id)) { warnings.push(`entry ${i}: id was not asked for`); return; }
    if (entries.has(e.id)) return;
    const title = localized(e.title, MAX_TITLE);
    const summary = localized(e.summary, MAX_SUMMARY);
    if (!title || !summary) { warnings.push(`entry ${e.id}: needs title.en and summary.en`); return; }
    const branch = BRANCHES.includes(e.branch as BranchId) ? (e.branch as BranchId) : 'other';
    entries.set(e.id, { branch, title, summary });
  });
  return { entries, warnings };
}

// ---- running the describer -------------------------------------------------

/** Writes `input` to the describer's stdin and returns its stdout. Rejects on exit code, timeout or spawn error. */
export function runDescriber(command: string | undefined, input: string, timeoutMs = DESCRIBER_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    // Default: no shell, the prompt is one argument. A custom command is a shell command line.
    const child = command === undefined
      ? spawn('claude', ['-p', '--model', 'haiku', PROMPT], { stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    let settled = false;
    const done = (fn: () => void): void => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(() => reject(new Error(`describer timed out after ${Math.round(timeoutMs / 1000)}s`)));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => { if (err.length < 400) err += d.toString('utf8'); });
    child.on('error', (e) => done(() => reject(e)));
    child.on('close', (code) => done(() => {
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else reject(new Error(`describer exited with code ${code}${err.trim() ? `: ${err.trim().slice(0, 200)}` : ''}`));
    }));
    child.stdin.on('error', () => { /* describer closed stdin early; the exit code tells */ });
    child.stdin.end(input);
  });
}

export interface EnrichOptions {
  command?: string;
  batch: number;
  cacheFile: string;
  describe?: typeof runDescriber;
}

export interface EnrichReport {
  cards: Card[];
  enriched: boolean;
  warnings: Warning[];
  cached: number;   // distinct items already in the cache
  sent: number;     // distinct items sent to the describer
  batches: number;
  learned: number;  // distinct items that came back valid
}

/**
 * Sends cards without a cache hit to the describer in batches. Items with the
 * same key (same kind, name, description on different surfaces) are sent once.
 * A bad batch (failure, junk, wrong shape) gives warnings and leaves its items
 * for the next run; the cache file is only ever replaced by a complete, valid
 * one, after each batch.
 */
export async function enrichCards(cards: Card[], opts: EnrichOptions): Promise<EnrichReport> {
  const describe = opts.describe ?? runDescriber;
  const loaded = loadCache(opts.cacheFile);
  const cache: Cache = { entries: loaded.entries };
  const warnings: Warning[] = [...loaded.warnings];
  const warn = (message: string): void => { warnings.push({ source: 'enrich', message }); };

  const todo = new Map<string, Card>();
  let cached = 0;
  const seen = new Set<string>();
  for (const c of cards) {
    if (NOT_DESCRIBED.has(c.kind)) continue;
    const key = cacheKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    if (cache.entries.has(key)) cached++;
    else todo.set(key, c);
  }

  const pending = [...todo.entries()];
  const batches = Math.ceil(pending.length / opts.batch);
  let learned = 0;
  for (let b = 0; b < batches; b++) {
    const slice = pending.slice(b * opts.batch, (b + 1) * opts.batch);
    const label = `batch ${b + 1}/${batches}`;
    const request: DescribeRequest = { branches: BRANCHES, items: slice.map(([, c]) => toDescribeItem(c)) };
    try {
      const stdout = await describe(opts.command, JSON.stringify(request));
      const arr = extractArray(stdout);
      if (!arr) { warn(`${label}: describer output has no JSON array, ${slice.length} items left un-enriched`); continue; }
      const { entries, warnings: bad } = parseEntries(arr, new Set(slice.map(([, c]) => c.id)));
      for (const m of bad.slice(0, MAX_WARNINGS_PER_BATCH)) warn(`${label}: ${m}`);
      if (bad.length > MAX_WARNINGS_PER_BATCH) warn(`${label}: ${bad.length - MAX_WARNINGS_PER_BATCH} more invalid entries`);
      let got = 0;
      for (const [key, c] of slice) {
        const e = entries.get(c.id);
        if (e) { cache.entries.set(key, e); got++; }
      }
      learned += got;
      if (got > 0) {
        try { saveCache(opts.cacheFile, cache); } catch (e) { warn(`${label}: cache not saved: ${errMessage(e)}`); }
      }
      if (got < slice.length) warn(`${label}: ${slice.length - got} of ${slice.length} items left un-enriched`);
    } catch (e) {
      warn(`${label}: ${errMessage(e)}; ${slice.length} items left un-enriched`);
    }
  }

  const applied = applyCache(cards, cache);
  return { ...applied, warnings, cached, sent: pending.length, batches, learned };
}
