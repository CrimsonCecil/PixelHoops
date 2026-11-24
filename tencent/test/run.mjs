// Integration test for the Tencent backend. Starts the real server on an ephemeral port and checks:
//  1. public-room directory contract (same assertions as qa/public-rooms.mjs)
//  2. tune profiles / default / history
//  3. replays incl. >900KB chunking, name collision, delete
//  4. relay (WebSocket) end-to-end incl. host token claim and 4000/4001/4003/4404 close codes
//  5. TURN credentials: HMAC verifies, rate limit, disabled when unconfigured
//  6. static hosting: hidden dirs, path traversal, Last-Modified
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ph-tencent-'));
const staticDir = join(dir, 'site');
mkdirSync(join(staticDir, 'js'), { recursive: true }); mkdirSync(join(staticDir, 'worker'), { recursive: true }); mkdirSync(join(staticDir, 'vo'), { recursive: true });
writeFileSync(join(staticDir, 'index.html'), "<!doctype html><title>x</title><script>window.__API_BASE__='https://pixelhoops-api.kccecil.com';</script>");
writeFileSync(join(staticDir, 'js', 'a.js'), 'console.log(1)');
writeFileSync(join(staticDir, 'worker', 'secret.js'), 'nope');
writeFileSync(join(staticDir, 'vo', 'lines.md'), 'nope');
writeFileSync(join(dir, 'outside.txt'), 'outside');

const S = await startServer({ port: 0, host: '127.0.0.1', dbFile: join(dir, 'db', 't.db'), staticDir, turnSecret: 's3cret', turnHost: 'turn.test', turnPort: 3478, turnTlsPort: 5349, selfApi: true });
const base = `http://127.0.0.1:${S.port}`;
const api = async (method, path, data) => {
  const r = await fetch(base + path, { method, body: data === undefined ? undefined : JSON.stringify(data) });
  const t = await r.text(); let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, body, headers: r.headers };
};
let n = 0; const ok = (m) => console.log(`PASS ${++n}. ${m}`);

// ---- 1. directory contract
{
  const code = 'ABCDE', token = 'a'.repeat(36), stranger = 'b'.repeat(36);
  const data = { token, name: '下班来一场', mode: 'online', players: 1, capacity: 2 };
  const R = (m, p, d) => api(m, '/api/rooms' + p, d);
  assert.deepEqual((await R('GET', '')).body, { rooms: [] });
  assert.equal((await R('PUT', '/' + code, { ...data, mode: 't5' })).status, 400);
  assert.equal((await R('PUT', '/' + code, { ...data, token: 'short' })).status, 400);
  assert.equal((await R('PUT', '/' + code, data)).status, 200);
  const rooms = (await R('GET', '')).body.rooms;
  assert.equal(rooms.length, 1); assert.equal(rooms[0].token, undefined);
  assert.equal((await R('PUT', '/' + code, { ...data, token: stranger, name: 'stolen' })).status, 409);
  await R('DELETE', '/' + code, { token: stranger });
  assert.equal((await R('GET', '')).body.rooms.length, 1);
  await R('PUT', '/' + code, { ...data, players: 2 });
  assert.equal((await R('GET', '')).body.rooms.length, 0, 'full rooms hidden');
  S.db.raw.exec('UPDATE rooms SET updated=0');
  assert.equal((await R('PUT', '/' + code, { ...data, token: stranger })).status, 200, 'expired code reclaimable');
  await R('DELETE', '/' + code, { token: stranger });
  const race = await Promise.all([R('PUT', '/BCDEF', data), R('PUT', '/BCDEF', { ...data, token: stranger })]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  ok('room directory: create/list/ownership/full/expiry/reclaim/race (same contract as qa/public-rooms.mjs)');
}

// ---- 2. profiles
{
  assert.deepEqual((await api('GET', '/api/profiles')).body, { profiles: [], default: 'official' });
  assert.equal((await api('PUT', '/api/profiles/official', { name: 'x', data: {} })).status, 400);
  const put = await api('PUT', '/api/profiles/p1', { name: '手感A', data: { gravity: 9.8, flag: true, bad: { nested: 1 }, arr: [1] } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.profiles[0].data, { gravity: 9.8, flag: true }, 'non-scalar values are filtered');
  assert.equal((await api('POST', '/api/default', { id: 'nope' })).status, 404);
  assert.equal((await api('POST', '/api/default', { id: 'p1' })).body.default, 'p1');
  assert.equal((await api('GET', '/api/history')).body.history.length, 1);
  const del = await api('DELETE', '/api/profiles/p1');
  assert.equal(del.body.default, 'official', 'deleting default profile resets default');
  const hist = (await api('GET', '/api/history')).body.history.map((h) => h.op).sort();
  assert.deepEqual(hist, ['delete', 'put']);
  ok('tune profiles: put/filter/default/delete/history (batch transactions)');
}

// ---- 3. replays
{
  const big = 'x'.repeat(2_000_000); // -> 3 chunks of 900000
  const meta = { mode: 'online', score: [21, 19] };
  let r = await api('PUT', '/api/replays/r1', { name: '决赛', meta, data: big });
  assert.equal(r.status, 200); assert.equal(r.body.size, 2_000_000);
  assert.equal(S.db.raw.prepare('SELECT COUNT(*) c FROM replay_chunks WHERE id=?').get('r1').c, 3);
  assert.equal((await api('PUT', '/api/replays/r2', { name: '决赛', data: 'abc' })).status, 409, 'name collision');
  assert.equal((await api('PUT', '/api/replays/r1', { name: '决赛', meta, data: 'short' })).status, 200, 'overwrite same id');
  assert.equal(S.db.raw.prepare('SELECT COUNT(*) c FROM replay_chunks WHERE id=?').get('r1').c, 1);
  r = await api('PUT', '/api/replays/r1', { name: '决赛', meta, data: big }); assert.equal(r.status, 200);
  const got = await api('GET', '/api/replays/' + encodeURIComponent('决赛'));
  assert.equal(got.body.id, 'r1'); assert.equal(got.body.data.length, 2_000_000); assert.deepEqual(got.body.meta, meta);
  assert.equal((await api('GET', '/api/replays')).body.replays.length, 1);
  assert.equal((await api('PUT', '/api/replays/bad id!', { name: 'x', data: '' })).status, 400);
  assert.equal((await api('GET', '/api/replays/nope')).status, 404);
  await api('DELETE', '/api/replays/r1');
  assert.equal(S.db.raw.prepare('SELECT COUNT(*) c FROM replay_chunks').get().c, 0);
  ok('replays: 2MB -> 3 chunks, roundtrip by name/id, 409 name taken, overwrite, delete cascades');
}

// ---- 4. relay
{
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const code = Array.from(randomBytes(5), (b) => alphabet[b % 31]).join('');
  const tok = randomBytes(32).toString('hex');
  const open = (role, token) => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${S.port}/api/rooms/${code}/ws?role=${role}${token ? '&token=' + token : ''}`);
    const q = [], w = []; let closeCode = null;
    ws.onmessage = (e) => { const m = JSON.parse(e.data); w.length ? w.shift()(m) : q.push(m); };
    const closed = new Promise((c) => { ws.onclose = (e) => { closeCode = e.code; c(e.code); }; });
    ws.onopen = () => res({ ws, closed, get code() { return closeCode; }, send: (m) => ws.send(JSON.stringify(m)), next: () => q.length ? Promise.resolve(q.shift()) : new Promise((r, j) => { const t = setTimeout(() => j(Error('timeout')), 2000); w.push((m) => { clearTimeout(t); r(m); }); }) });
    ws.onerror = () => rej(Error('ws error'));
  });
  assert.equal((await (await open('guest')).closed), 4404);
  const host = await open('host', tok), g = await open('guest');
  assert.deepEqual(await g.next(), { type: 'relay-ready' });
  const po = await host.next(); assert.equal(po.type, 'peer-open');
  g.send({ type: 'input', input: { mx: 1 } }); assert.deepEqual(await host.next(), { from: po.id, msg: { type: 'input', input: { mx: 1 } } });
  host.send({ to: '*', msg: { type: 'state', seq: 1 } }); assert.deepEqual(await g.next(), { type: 'state', seq: 1 });
  assert.equal((await (await open('host', 'f'.repeat(64))).closed), 4003);
  assert.equal((await (await open('host')).closed), 4003, 'missing token rejected');
  const h2 = await open('host', tok); assert.equal(await host.closed, 4001);
  assert.deepEqual(await h2.next(), { type: 'peer-open', id: po.id }, 'replacement host sees existing guests');
  h2.ws.close(); assert.equal(await g.closed, 4000);
  ok('relay over real sockets: 4404 / peer-open / uplink wrap / broadcast / 4003 / 4001 replace / 4000 host left');
  assert.deepEqual(S.relay.stats().rooms >= 1, true);
}

// ---- 5. TURN credentials
{
  const r = await api('GET', '/api/turn');
  assert.equal(r.status, 200);
  const s = r.body.iceServers[0];
  assert.ok(s.urls.includes('turn:turn.test:3478?transport=udp') && s.urls.includes('turns:turn.test:5349?transport=tcp'));
  assert.equal(s.credential, createHmac('sha1', 's3cret').update(s.username).digest('base64'), 'credential is coturn-compatible HMAC-SHA1');
  const exp = Number(s.username.split(':')[0]); const now = Date.now() / 1000;
  assert.ok(exp > now + 6 * 3600 - 60 && exp < now + 6 * 3600 + 60, 'expires in ~6h');
  const codes = []; for (let i = 0; i < 35; i++) codes.push((await api('GET', '/api/turn')).status);
  assert.ok(codes.includes(429), 'rate limited per IP');
  ok('TURN creds: coturn HMAC-SHA1 REST scheme, 6h expiry, per-IP rate limit');
  const { makeTurnHandler } = await import('../lib/turn.mjs');
  const m = makeTurnHandler({ secret: 's3cret', host: ' 203.0.113.7 , turn.test ' })('1.1.1.1').body.iceServers;
  assert.deepEqual(m.map((x) => x.urls), [
    ['stun:203.0.113.7:3478', 'turn:203.0.113.7:3478?transport=udp', 'turn:203.0.113.7:3478?transport=tcp'],
    ['turn:turn.test:3478?transport=udp', 'turn:turn.test:3478?transport=tcp'],
  ]);
  assert.ok(m[0].username === m[1].username && m[0].credential === m[1].credential, 'one credential for every box');
  assert.equal(makeTurnHandler({ secret: 's3cret', host: ' , ' })('1.1.1.1').status, 404);
  ok('TURN creds: several relay boxes in TURN_HOST, preferred one first');
}

// ---- 6. static
{
  const idx = await fetch(base + '/'); assert.equal(idx.status, 200); assert.match(await idx.text(), /<title>x<\/title>/);
  assert.ok(idx.headers.get('last-modified'));
  // fetch() cannot override Host, so speak raw HTTP exactly like nginx does when proxying
  const html = await new Promise((res) => { import('node:net').then(({ default: net }) => { const c = net.connect(S.port, '127.0.0.1', () => c.write('GET / HTTP/1.1\r\nHost: ph-test.example.com\r\nX-Forwarded-Proto: https\r\nConnection: close\r\n\r\n')); let b = ''; c.on('data', (d) => (b += d)); c.on('close', () => res(b)); }); });
  assert.match(html, /window\.__API_BASE__='https:\/\/ph-test\.example\.com'/, 'index.html API base rewritten to own origin');
  assert.ok(!html.includes('pixelhoops-api.kccecil.com'));
  assert.equal((await fetch(base + '/js/a.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(base + '/worker/secret.js')).status, 404);
  assert.equal((await fetch(base + '/vo/lines.md')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/outside.txt')).status, 404);
  const raw = await new Promise((res) => { import('node:net').then(({ default: net }) => { const c = net.connect(S.port, '127.0.0.1', () => c.write('GET /../outside.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')); let b = ''; c.on('data', (d) => (b += d)); c.on('close', () => res(b)); }); });
  assert.ok(!raw.includes('outside'), 'path traversal blocked');
  assert.equal((await fetch(base + '/nothing.html')).status, 404);
  ok('static: serves site, hides worker/vo-lines, blocks traversal, Last-Modified present');
}

await S.close(); rmSync(dir, { recursive: true, force: true });
console.log(`\nALL ${n} GROUPS PASSED`);
