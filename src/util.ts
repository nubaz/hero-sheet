import fs from 'node:fs';

/** Token estimate used everywhere: ceil(chars / 4). Always an estimate. */
export function estTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Read and parse a JSON file. Throws on missing or invalid file. */
export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

export function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
