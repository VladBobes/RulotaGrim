'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evidenta-api-'));
const dataFile = path.join(tmpRoot, 'evidenta-rulota.json');
process.env.DATA_FILE = dataFile;
process.env.STATIC_ROOT = path.resolve(__dirname, '..', '..');
process.env.PORT = '0';

const { start, normalizeStore } = require('../server');

function request(server, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
        : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('normalizeStore tolerează input invalid', () => {
  assert.deepEqual(normalizeStore(null).entries, []);
  assert.equal(normalizeStore({ entries: 'x' }).entries.length, 0);
  const store = normalizeStore({
    version: 1,
    entries: [{ id: 1, responsabil: 'A', cnp: '9', quantities: { joint: 2 }, taxCollected: 1 }],
  });
  assert.equal(store.entries[0].id, '1');
  assert.equal(store.entries[0].taxCollected, true);
});

test('health, GET/PUT evidenta, CORS și static index', async (t) => {
  const server = await start(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const health = await request(server, 'GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.headers['access-control-allow-origin'], '*');

  const initial = await request(server, 'GET', '/api/evidenta');
  assert.equal(initial.status, 200);
  assert.equal(initial.json.version, 1);
  assert.deepEqual(initial.json.entries, []);

  const put = await request(server, 'PUT', '/api/evidenta', {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    entries: [{
      id: 'a1',
      responsabil: 'Test',
      cnp: '12',
      telefon: '',
      quantities: { joint: 3 },
      taxCollected: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.entries.length, 1);
  assert.equal(put.json.entries[0].responsabil, 'Test');

  const again = await request(server, 'GET', '/api/evidenta');
  assert.equal(again.json.entries[0].id, 'a1');

  const bad = await request(server, 'PUT', '/api/evidenta', [1, 2, 3]);
  assert.equal(bad.status, 400);

  const index = await request(server, 'GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'] || '', /text\/html/);
  assert.match(index.text, /Evidență|Rulota|Livrare/i);

  const options = await request(server, 'OPTIONS', '/api/evidenta');
  assert.equal(options.status, 204);
});

test('scrieri concurente nu corup fișierul', async (t) => {
  const server = await start(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const writes = Array.from({ length: 8 }, (_, i) => request(server, 'PUT', '/api/evidenta', {
    version: 1,
    updatedAt: null,
    entries: [{
      id: `c${i}`,
      responsabil: `R${i}`,
      cnp: String(i),
      telefon: '',
      quantities: {},
      taxCollected: false,
      createdAt: null,
    }],
  }));

  const results = await Promise.all(writes);
  for (const res of results) assert.equal(res.status, 200);

  const final = await request(server, 'GET', '/api/evidenta');
  assert.equal(final.status, 200);
  assert.equal(final.json.entries.length, 1);
  assert.match(final.json.entries[0].id, /^c\d$/);
  JSON.parse(fs.readFileSync(dataFile, 'utf8'));
});
