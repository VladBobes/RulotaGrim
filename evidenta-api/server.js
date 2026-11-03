'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, 'data', 'evidenta-rulota.json');
const STATIC_ROOT = process.env.STATIC_ROOT
  ? path.resolve(process.env.STATIC_ROOT)
  : path.resolve(__dirname, '..');

const EMPTY_STORE = { version: 1, updatedAt: null, entries: [] };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Serialize concurrent mutations so temp+rename writes never interleave. */
let writeChain = Promise.resolve();

function withWriteLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

function emptyStore() {
  return {
    version: 1,
    updatedAt: null,
    entries: [],
  };
}

function normalizeStore(raw) {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return store;
  store.version = Number(raw.version) || 1;
  store.updatedAt = raw.updatedAt == null ? null : String(raw.updatedAt);
  store.entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry) => ({
        id: String((entry && entry.id) || ''),
        responsabil: String((entry && entry.responsabil) || ''),
        cnp: String((entry && entry.cnp) || ''),
        telefon: String((entry && entry.telefon) || ''),
        quantities: entry && typeof entry.quantities === 'object' && entry.quantities && !Array.isArray(entry.quantities)
          ? entry.quantities
          : {},
        taxCollected: Boolean(entry && entry.taxCollected),
        createdAt: entry && entry.createdAt != null ? String(entry.createdAt) : null,
      }))
    : [];
  return store;
}

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`, 'utf8');
  }
}

function readStore() {
  ensureDataFile();
  try {
    const text = fs.readFileSync(DATA_FILE, 'utf8');
    return normalizeStore(JSON.parse(text));
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyStore();
    throw err;
  }
}

function writeStore(store) {
  ensureDataFile();
  const normalized = normalizeStore(store);
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  return normalized;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendText(res, status, text, contentType) {
  const body = String(text);
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function readBody(req, limitBytes) {
  const max = limitBytes || 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(Object.assign(new Error('Body prea mare'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isPathInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0')) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  const filePath = path.resolve(STATIC_ROOT, `.${rel}`);
  if (!isPathInside(STATIC_ROOT, filePath)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  // Keep secrets and runtime data off the static surface.
  const blocked = [
    path.join(STATIC_ROOT, 'evidenta-api', 'data'),
    path.join(STATIC_ROOT, 'bot', 'data'),
    path.join(STATIC_ROOT, 'bot-actiuni', 'data'),
    path.join(STATIC_ROOT, 'bot', '.env'),
    path.join(STATIC_ROOT, 'bot-actiuni', '.env'),
    path.join(STATIC_ROOT, 'evidenta-api', '.env'),
  ];
  for (const blockedPath of blocked) {
    if (filePath === blockedPath || filePath.startsWith(`${blockedPath}${path.sep}`)) {
      sendText(res, 404, 'Not Found');
      return;
    }
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendText(res, 404, 'Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/evidenta' && req.method === 'GET') {
    try {
      sendJson(res, 200, readStore());
    } catch (err) {
      sendJson(res, 500, { error: 'read_failed', message: String(err && err.message || err) });
    }
    return;
  }

  if (pathname === '/api/evidenta' && req.method === 'PUT') {
    try {
      const rawText = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(rawText || 'null');
      } catch (e) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        sendJson(res, 400, { error: 'invalid_shape', message: 'Body trebuie să fie un obiect JSON.' });
        return;
      }
      if (parsed.entries != null && !Array.isArray(parsed.entries)) {
        sendJson(res, 400, { error: 'invalid_shape', message: 'entries trebuie să fie un array.' });
        return;
      }

      const saved = await withWriteLock(() => {
        const next = normalizeStore(parsed);
        if (!next.updatedAt) next.updatedAt = new Date().toISOString();
        return writeStore(next);
      });
      sendJson(res, 200, saved);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      sendJson(res, status, { error: 'write_failed', message: String(err && err.message || err) });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

function createServer() {
  ensureDataFile();
  return http.createServer(async (req, res) => {
    if (applyCors(req, res)) return;

    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
    } catch (e) {
      sendText(res, 400, 'Bad Request');
      return;
    }

    if (pathname === '/health' || pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, pathname);
      } catch (err) {
        sendJson(res, 500, { error: 'server_error', message: String(err && err.message || err) });
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed');
      return;
    }

    serveStatic(req, res, pathname);
  });
}

function start(port) {
  const listenPort = port == null ? PORT : port;
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, () => {
      server.off('error', reject);
      // eslint-disable-next-line no-console
      console.log(`evidenta-api listening on :${listenPort}`);
      console.log(`  data: ${DATA_FILE}`);
      console.log(`  static: ${STATIC_ROOT}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  createServer,
  start,
  normalizeStore,
  emptyStore,
  readStore,
  writeStore,
  withWriteLock,
  DATA_FILE,
  STATIC_ROOT,
  PORT,
};
