// Local zero-dependency static server for FJORDWING (Node 22 stdlib only).
// Usage: node serve.ts [--port 8080]

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function parsePort(argv: string[]): number {
  const idx = argv.indexOf('--port');
  if (idx === -1) return 8080;
  const parsed = Number(argv[idx + 1]);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 8080;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glsl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const port = parsePort(process.argv.slice(2));

const server = createServer((req, res) => {
  const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const targetPath = resolve(join(gameRoot, normalize(pathname)));
  if (targetPath !== gameRoot && !targetPath.startsWith(gameRoot + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let fileSize = 0;
  try {
    const info = statSync(targetPath);
    if (!info.isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }
    fileSize = info.size;
  } catch {
    res.writeHead(404).end('Not Found');
    return;
  }
  const mime = CONTENT_TYPES[extname(targetPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': mime,
    'content-length': fileSize,
    'cache-control': 'no-store',
  });
  createReadStream(targetPath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`FJORDWING serving game/ at http://127.0.0.1:${port}`);
});
