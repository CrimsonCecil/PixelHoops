const assert = require('node:assert/strict');
const base = process.env.QA_RELAY || 'http://127.0.0.1:8787';
const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const code = Array.from(require('node:crypto').randomBytes(5), (n) => alphabet[n % alphabet.length]).join('');
const sockets = [];
const hostToken = require('node:crypto').randomBytes(32).toString('hex');
async function connect(role, room = code, token = hostToken) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/api/rooms/' + room + '/ws?role=' + role + (role === 'host' ? '&token=' + token : ''));
  sockets.push(ws);
  const queue = [], waiters = [];
  ws.addEventListener('message', (e) => { const msg = JSON.parse(e.data); if (waiters.length) waiters.shift()(msg); else queue.push(msg); });
  const closed = new Promise((resolve) => ws.addEventListener('close', resolve, { once: true }));
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  return { ws, closed, queue, send: (msg) => ws.send(JSON.stringify(msg)), next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Missing relay message')), 3000);
    waiters.push((msg) => { clearTimeout(timer); resolve(msg); });
  }) };
}
(async () => {
  assert.equal((await fetch(base + '/api/rooms/00000/ws?role=host')).status, 400);
  assert.equal((await fetch(base + '/api/rooms/' + code + '/ws?role=bad')).status, 400);
  assert.equal((await fetch(base + '/api/rooms/' + code + '/ws?role=host')).status, 426);
  const missing = await connect('guest'); assert.equal((await missing.closed).code, 4404);
  console.log('PASS: route validation, Upgrade required, guest without host closes 4404');
  const host = await connect('host'), a = await connect('guest'), b = await connect('guest');
  const one = await host.next(), two = await host.next();
  for (const token of ['', 'wrong', 'f'.repeat(64)]) {
    const intruder = await connect('host', code, token);
    assert.equal((await intruder.closed).code, 4003);
    assert.equal(host.ws.readyState, 1);
  }
  assert.equal(one.type, 'peer-open'); assert.equal(two.id, one.id + 1);
  a.send({ type: 'join' }); assert.deepEqual(await host.next(), { from: one.id, msg: { type: 'join' } });
  host.send({ to: one.id, msg: { type: 'joined' } }); assert.deepEqual(await a.next(), { type: 'joined' });
  host.send({ to: '*', msg: { type: 'state' } });
  assert.deepEqual(await a.next(), { type: 'state' }); assert.deepEqual(await b.next(), { type: 'state' });
  const large = { type: 'state', data: 'x'.repeat(94 * 1024) };
  host.send({ to: one.id, msg: large }); assert.deepEqual(await a.next(), large);
  a.send(large); assert.deepEqual(await host.next(), { from: one.id, msg: large });
  a.ws.send('bad json'); a.ws.send(new Uint8Array([1])); a.ws.send('"' + 'x'.repeat(1024 * 1024) + '"');
  host.send({}); a.send({ marker: 'after invalid frames' });
  assert.deepEqual(await host.next(), { from: one.id, msg: { marker: 'after invalid frames' } });
  b.ws.close(); assert.deepEqual(await host.next(), { type: 'peer-close', id: two.id });
  console.log('PASS: incrementing guest ids, wrapped uplink, targeted/broadcast downlink, malformed/oversize/binary frame drops, peer-close');
  const replacement = await connect('host');
  assert.equal((await host.closed).code, 4001);
  assert.deepEqual(await replacement.next(), { type: 'peer-open', id: one.id });
  a.send({ type: 'input' }); assert.deepEqual(await replacement.next(), { from: one.id, msg: { type: 'input' } });
  replacement.ws.close(); assert.equal((await a.closed).code, 4000);
  const intruder = await connect('host', code, 'f'.repeat(64));
  assert.equal((await intruder.closed).code, 4003);
  const returning = await connect('host'); assert.equal(returning.ws.readyState, 1);
  console.log('PASS: host claims reject missing/wrong tokens, protect disconnected rooms, and allow authenticated reconnects');
  console.log('PASS: host replacement preserves guests; host departure closes guests');
})().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => { for (const ws of sockets) ws.close(); });
