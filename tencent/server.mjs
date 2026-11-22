// PixelHoops backend for Tencent Cloud (Node >= 22.13).
//  - REST: the *unchanged* Cloudflare Worker handler (worker/src/index.js) running on a D1-compatible SQLite adapter
//  - WS:   /api/rooms/:code/ws  -> lib/relay.mjs (port of the RoomRelay Durable Object)
//  - GET /api/turn -> short-lived coturn credentials
//  - optional static hosting of the front-end (STATIC_DIR), so the whole site can leave Cloudflare later
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';
import { openD1 } from './lib/d1.mjs';
import { createRelay } from './lib/relay.mjs';
import { makeTurnHandler } from './lib/turn.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const env0 = process.env;
export const config = {
  port: Number(env0.PORT || 8787),
  host: env0.HOST || '127.0.0.1',
  dbFile: env0.DB_FILE || join(HERE, 'data', 'pixelhoops.db'),
  staticDir: env0.STATIC_DIR || '',
  selfApi: env0.SELF_API === '1', // rewrite window.__API_BASE__ in index.html to this site's own origin
  turnSecret: env0.TURN_SECRET || '',
  turnHost: env0.TURN_HOST || '',
  turnPort: Number(env0.TURN_PORT || 3478),
  turnTlsPort: Number(env0.TURN_TLS_PORT || 0),
  maxBody: 95 * 1024 * 1024,
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
// Mirrors .assetsignore + backend/test dirs
const HIDDEN = new Set(['.git', '.wrangler', 'worker', 'server', 'qa', 'tencent', 'progress.md', 'node_modules']);
const HIDDEN_FILES = new Set(['vo/generate-legends.py', 'vo/lines.md']);

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (typeof xff === 'string' && xff.split(',')[0].trim()) || req.socket.remoteAddress || '';
}

async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > config.maxBody) { const e = new Error('too large'); e.status = 413; throw e; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return true; }
  if (rel.endsWith('/')) rel += 'index.html';
  const root = resolve(config.staticDir);
  const file = resolve(join(root, normalize(rel)));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return true; }
  const relPath = file.slice(root.length + 1).split(sep).join('/');
  if (HIDDEN.has(relPath.split('/')[0]) || HIDDEN_FILES.has(relPath)) { res.writeHead(404).end(); return true; }
  let st;
  try { st = await stat(file); } catch { return false; }
  if (!st.isFile()) return false;
  const lm = st.mtime.toUTCString();
  const headers = {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Last-Modified': lm,           // index.html derives its cache-busting version from document.lastModified
    'Cache-Control': 'public, max-age=0, must-revalidate',
  };
  if (req.headers['if-modified-since'] && Date.parse(req.headers['if-modified-since']) >= Math.floor(st.mtimeMs / 1000) * 1000) {
    res.writeHead(304, headers).end(); return true;
  }
  let body = await readFile(file);
  if (config.selfApi && relPath === 'index.html') {
    // index.html hardcodes the production API host; for a test domain point it at ourselves instead.
    const host = String(req.headers.host || '').replace(/[^a-zA-Z0-9.:-]/g, '');
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    body = Buffer.from(body.toString('utf8').replace(/window\.__API_BASE__\s*=\s*'[^']*'/, `window.__API_BASE__='${proto}://${host}'`), 'utf8');
  }
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

export async function startServer(overrides = {}) {
  Object.assign(config, overrides);
  const db = openD1(config.dbFile, join(HERE, '..', 'worker', 'schema.sql'));
  const relay = createRelay();
  const turn = makeTurnHandler({ secret: config.turnSecret, host: config.turnHost, port: config.turnPort, tlsPort: config.turnTlsPort });
  const env = { DB: db };
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/turn' && req.method === 'GET') {
        const r = turn(clientIp(req));
        res.writeHead(r.status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(r.body));
        return;
      }
      if (url.pathname === '/api/stats' && req.method === 'GET') {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(relay.stats()));
        return;
      }
      if (!url.pathname.startsWith('/api/') && config.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
        if (await serveStatic(req, res, url.pathname)) return;
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const body = hasBody ? await readBody(req) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const response = await worker.fetch(new Request(url, { method: req.method, headers, body }), env);
      const out = Buffer.from(await response.arrayBuffer());
      const h = Object.fromEntries(response.headers);
      h['content-length'] = String(out.length);
      res.writeHead(response.status, h);
      res.end(out);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error('[http]', e);
      if (!res.headersSent) res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 413 ? 'too large' : 'internal error' }));
    }
  });
  server.on('upgrade', (req, socket, head) => relay.upgrade(req, socket, head));
  server.keepAliveTimeout = 65000;
  await new Promise((ok) => server.listen(config.port, config.host, ok));
  const addr = server.address();
  return {
    server, db, relay, port: addr.port,
    async close() { relay.close(); await new Promise((ok) => server.close(ok)); server.closeAllConnections?.(); db.close(); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`PixelHoops backend listening on http://${config.host}:${s.port}  db=${config.dbFile}  static=${config.staticDir || '(off)'}  turn=${config.turnSecret && config.turnHost ? config.turnHost : '(off)'}`);
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
