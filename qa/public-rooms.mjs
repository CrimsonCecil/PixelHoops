// Same HTTP contract against the actual Worker handler (SQLite/D1 adapter) and local Python API.
// Requires Node 22.13+ for node:sqlite; never contacts production.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import worker from '../worker/src/index.js';

class D1 {
  constructor(db) { this.db = db; }
  prepare(sql) {
    const stmt = this.db.prepare(sql); let values = [];
    return { bind(...v) { values = v; return this; },
      async run() { return { meta: { changes: Number(stmt.run(...values).changes) } }; },
      async all() { return { results: stmt.all(...values) }; },
      async first() { return stmt.get(...values) || null; } };
  }
}
async function contract(name, request, db) {
  const code = 'ABCDE', token = 'a'.repeat(36), stranger = 'b'.repeat(36);
  const data = { token, name: '下班来一场', mode: 'online', players: 1, capacity: 2 };
  assert.deepEqual((await request('GET', '')).body, { rooms: [] });
  assert.equal((await request('PUT', '/' + code, { ...data, mode: 't5' })).status, 400);
  assert.equal((await request('PUT', '/' + code, { ...data, token: 'short' })).status, 400);
  assert.equal((await request('PUT', '/' + code, { ...data, token: [token] })).status, 400);
  assert.equal((await request('PUT', '/' + code, data)).status, 200);
  let rooms = (await request('GET', '')).body.rooms;
  assert.equal(rooms.length, 1); assert.equal(rooms[0].name, data.name);
  assert.equal(rooms[0].token, undefined, 'lease capability must never be listed');
  assert.equal((await request('PUT', '/' + code, { ...data, token: stranger, name: 'stolen' })).status, 409);
  await request('DELETE', '/' + code, { token: stranger });
  assert.equal((await request('GET', '')).body.rooms.length, 1, 'stranger cannot delete the room');
  await request('PUT', '/' + code, { ...data, players: 2 });
  assert.equal((await request('GET', '')).body.rooms.length, 0, 'full rooms are not joinable');
  await request('PUT', '/' + code, { ...data, mode: 't3', capacity: 6 });
  assert.equal((await request('GET', '')).body.rooms[0].capacity, 6);
  await request('PUT', '/' + code, { ...data, mode: 't3', capacity: 1 });
  assert.equal((await request('GET', '')).body.rooms.length, 0, 'no waiting human slots means no joinable listing');
  db.exec('UPDATE rooms SET updated=0');
  assert.equal((await request('GET', '')).body.rooms.length, 0, 'abandoned rooms expire');
  assert.equal((await request('PUT', '/' + code, { ...data, token: stranger })).status, 200, 'expired code can be reclaimed');
  await request('DELETE', '/' + code, { token: stranger });
  assert.equal((await request('GET', '')).body.rooms.length, 0);
  const race = await Promise.all([request('PUT', '/BCDEF', data), request('PUT', '/BCDEF', { ...data, token: stranger })]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409], 'racing owners cannot steal a live lease');
  console.log('PASS ' + name + ': create/list, validation, ownership, heartbeat, full-room exclusion, expiry, reclaim, delete and racing owners');
}
const sqlite = new DatabaseSync(':memory:'), d1 = new D1(sqlite);
await contract('Worker/D1', async (method, path, data) => {
  const response = await worker.fetch(new Request('http://local/api/rooms' + path, { method, body: data ? JSON.stringify(data) : undefined }), { DB: d1 });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  return { status: response.status, body: await response.json() };
}, sqlite);
let relayRouted = false;
const relayEnv = { DB: d1, ROOMS: { idFromName: (code) => code, get: (code) => ({ fetch: () => {
  assert.equal(code, 'ABCDE'); relayRouted = true; return new Response('relay');
} }) } };
assert.equal((await worker.fetch(new Request('http://local/api/rooms/ABCDE/ws?role=host', { headers: { Upgrade: 'websocket' } }), relayEnv)).status, 200);
assert.equal(relayRouted, true, 'relay upgrade must route before the directory code handler');
assert.equal((await worker.fetch(new Request('http://local/api/rooms/ABCDE/ws?role=host'), relayEnv)).status, 426);
console.log('PASS Worker router: room-directory HTTP and relay WebSocket routes coexist');
sqlite.close();

const dir = mkdtempSync(join(tmpdir(), 'pixelhoops-room-contract-'));
const server = spawn('python3', ['server/server.py'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '18992', PIXELHOOPS_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
let pyDb;
try {
  for (let n = 0; ; n++) { try { await fetch('http://127.0.0.1:18992/api/health'); break; } catch (e) { if (n > 50) throw e; await new Promise((r) => setTimeout(r, 50)); } }
  pyDb = new DatabaseSync(join(dir, 'tune.db'));
  await contract('Python/SQLite', async (method, path, data) => {
    const response = await fetch('http://127.0.0.1:18992/api/rooms' + path, { method, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  }, pyDb);
} finally { pyDb?.close(); server.kill(); await new Promise((r) => server.once('exit', r)); rmSync(dir, { recursive: true, force: true }); }
