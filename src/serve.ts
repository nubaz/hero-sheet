import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveRoots } from './roots.js';
import { errMessage } from './util.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const USAGE = 'usage: hero-sheet serve [--port 4477] [--state <file>]';

/** The `web/` folder next to `src/` (or `dist/`). */
export function defaultWebDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
}

export interface ServeOptions {
  webDir: string;
  /** State file written by `scan`. When it does not exist, the sample state is served. */
  stateFile: string;
}

function send(res: http.ServerResponse, status: number, type: string, body: Buffer | string, head: boolean, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(head ? undefined : body);
}

/** Request handler: GET and HEAD only, static files from webDir, `/state.json` from the state file. */
export function createHandler(opts: ServeOptions): http.RequestListener {
  const root = path.resolve(opts.webDir);
  return (req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) {
      return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed\n', head, { allow: 'GET, HEAD' });
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return send(res, 400, 'text/plain; charset=utf-8', 'Bad request\n', head);
    }
    if (pathname.includes('\0')) return send(res, 400, 'text/plain; charset=utf-8', 'Bad request\n', head);

    if (pathname === '/state.json') {
      const sample = path.join(root, 'sample-state.json');
      for (const [file, source] of [[opts.stateFile, 'state'], [sample, 'sample']] as const) {
        try {
          return send(res, 200, TYPES['.json'], fs.readFileSync(file), head, { 'x-hero-sheet-source': source });
        } catch { /* try the next one */ }
      }
      return send(res, 404, 'text/plain; charset=utf-8', 'No state file and no sample state\n', head);
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      return send(res, 403, 'text/plain; charset=utf-8', 'Forbidden\n', head);
    }
    try {
      // realpath check: a symlink inside web/ must not lead out of it
      const real = fs.realpathSync(file);
      const realRoot = fs.realpathSync(root);
      if (!real.startsWith(realRoot + path.sep) || !fs.statSync(real).isFile()) throw new Error('not a file');
      const type = TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream';
      return send(res, 200, type, fs.readFileSync(real), head);
    } catch {
      return send(res, 404, 'text/plain; charset=utf-8', 'Not found\n', head);
    }
  };
}

/** Starts the server on 127.0.0.1 only. Port 0 picks a free port. */
export function startServer(opts: ServeOptions, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createHandler(opts));
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** `hero-sheet serve`: runs until the process is stopped. Returns an exit code only on failure. */
export async function serveCommand(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let values: { port?: string; state?: string };
  try {
    values = parseArgs({ args: argv, options: { port: { type: 'string' }, state: { type: 'string' } } }).values;
  } catch (e) {
    process.stderr.write(`${errMessage(e)}\n${USAGE}\n`);
    return 2;
  }
  const port = values.port === undefined ? 4477 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const stateFile = values.state ?? path.join(resolveRoots(undefined, env).stateDir, 'state.json');
  try {
    const server = await startServer({ webDir: defaultWebDir(), stateFile }, port);
    const addr = server.address();
    const shown = typeof addr === 'object' && addr ? addr.port : port;
    const source = fs.existsSync(stateFile) ? stateFile : 'sample data (no state file yet)';
    process.stdout.write(`Hero Sheet at http://127.0.0.1:${shown}/  using ${source}\n`);
    await new Promise<void>((resolve) => server.once('close', () => resolve()));
    return 0;
  } catch (e) {
    process.stderr.write(`${errMessage(e)}\n`);
    return 1;
  }
}
