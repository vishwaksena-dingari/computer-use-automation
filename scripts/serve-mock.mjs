/**
 * @file Static files + thin JSON-table API for mock-core (default :4173).
 *
 * API (always HTTP 200 for member lookup — business not-found, not crash):
 *   GET /api/health
 *   GET /api/members          → { memberIds: string[] }
 *   GET /api/members/:id      → found join | { kind:'not_found', code:'member.NOT_FOUND' }
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTables, lookupMember, listMemberIds } from '../apps/mock-core/lib/db.js';

const ROOT = resolve(fileURLToPath(new URL('../apps/mock-core', import.meta.url)));
const DATA = join(ROOT, 'data');
const PORT = Number(process.env.MOCK_PORT || 4173);
const HOST = process.env.MOCK_HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** @type {Awaited<ReturnType<typeof loadTables>> | null} */
let tables = null;

async function getTables() {
  if (!tables) tables = await loadTables(DATA);
  return tables;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

/**
 * @param {string} urlPath
 */
function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0] || '/')).replace(/^(\.\.[/\\])+/, '');
  let rel = clean === '/' ? '/index.html' : clean;
  let abs = join(ROOT, rel);
  if (!abs.startsWith(ROOT)) return null;
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    abs = join(abs, 'index.html');
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${HOST}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/health') {
    sendJson(res, 200, { ok: true, store: 'json-tables', tables: ['members', 'accounts', 'contacts'] });
    return true;
  }

  if (req.method === 'GET' && path === '/api/members') {
    const t = await getTables();
    sendJson(res, 200, { memberIds: listMemberIds(t) });
    return true;
  }

  const one = path.match(/^\/api\/members\/([^/]+)$/);
  if (req.method === 'GET' && one) {
    const t = await getTables();
    const result = lookupMember(t, decodeURIComponent(one[1]));
    // Artificial latency — chatty legacy core
    await new Promise((r) => setTimeout(r, 180));
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').startsWith('/api/')) {
      const handled = await handleApi(req, res);
      if (handled) return;
      sendJson(res, 404, { error: 'unknown_api_route' });
      return;
    }

    const path = resolvePath(req.url || '/');
    if (!path) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(e));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mock-core http://${HOST}:${PORT}/member-lookup/`);
  console.log(`api        http://${HOST}:${PORT}/api/members/:id`);
});
