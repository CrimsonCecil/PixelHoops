const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function client() {
  let now = 0;
  const timers = new Map(), doc = new EventEmitter(), win = new EventEmitter(), peers = [], events = [];
  for (const target of [doc, win]) {
    target.addEventListener = target.on.bind(target);
    target.removeEventListener = target.off.bind(target);
  }
  class Peer extends EventEmitter {
    constructor() { super(); peers.push(this); }
    connect() {
      const conn = this.conn = new EventEmitter();
      conn.open = true;
      conn.send = (msg) => events.push(msg.type);
      return conn;
    }
    disconnect() { this.disconnected = true; this.emit('disconnected'); }
    reconnect() { this.reconnects = (this.reconnects || 0) + 1; this.disconnected = false; }
    destroy() { this.emit('close'); if (this.broken) throw Error('cleanup'); }
  }
  win.PH = {}; win.Peer = Peer;
  const ctx = vm.createContext({ window: win, document: doc, crypto: { getRandomValues: (a) => a }, Date: { now: () => now },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(fs.readFileSync(__dirname + '/../js/rooms.js', 'utf8'), ctx);
  const rooms = win.PH.rooms;
  const open = (host = false) => rooms.open(host ? '' : 'ABCDE', 'online', {
    error: (message) => events.push(message), joined: () => events.push('joined'), start: () => events.push('start'), ready: () => events.push('ready')
  });
  const next = () => {
    const [id, timer] = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0];
    timers.delete(id); timer.fn();
  };
  return { rooms, peers, events, timers, doc, win, open, next, time: (ms) => { now = ms; } };
}

(async () => {
  let c = client();
  await c.open(); c.peers[0].emit('open'); c.peers[0].conn.emit('open');
  c.peers[0].conn.emit('data', null);
  c.peers[0].conn.emit('data', { type: 'joined', slot: 1 });
  c.time(20000); c.doc.emit('visibilitychange');
  c.peers[0].conn.emit('data', { type: 'start', config: {} });
  c.peers[0].emit('disconnected');
  assert.deepEqual(c.events, ['join', 'joined', 'start']);
  assert.equal(c.timers.size, 0);
  assert.equal(c.rooms.room.active, true);
  console.log('PASS: normal join/start, empty data, deadline cleanup, active match survives signaling loss');

  for (const resume of ['timer', 'visibilitychange', 'pageshow']) {
    c = client(); await c.open(); c.peers[0].emit('open'); c.time(16000);
    if (resume === 'timer') [...c.timers.values()][0].fn();
    else (resume === 'pageshow' ? c.win : c.doc).emit(resume);
    assert.deepEqual(c.events, ['连接超时，请检查网络或房间号。']);
    assert.equal(c.rooms.room.role, '');
    assert.equal(c.doc.listenerCount('visibilitychange'), 0);
  }
  console.log('PASS: stalled guest times out via timer or background-page resume');

  for (const event of ['close', 'error']) {
    c = client(); await c.open(); c.peers[0].emit(event, { type: 'invalid-key' });
    assert.equal(c.events.length, 1); assert.equal(c.rooms.room.role, '');
  }
  c = client(); await c.open(); c.peers[0].broken = true;
  assert.throws(() => c.peers[0].emit('close'), /cleanup/);
  assert.equal(c.events.length, 1);
  console.log('PASS: signaling failures and cleanup exceptions surface an error');

  c = client(); await c.open(); c.peers[0].emit('open'); const old = c.peers[0].conn;
  await c.open(); old.emit('open'); old.emit('data', { type: 'joined' }); old.emit('close');
  assert.deepEqual(c.events, []); assert.equal(c.rooms.room.role, 'guest');
  c.rooms.close(); assert.equal(c.timers.size, 0);
  console.log('PASS: canceled attempts cannot send joins, alter status, or cancel a new deadline');

  for (const event of ['peer-unavailable', 'network', 'disconnected']) {
    c = client(); await c.open(); const first = c.peers[0]; first.emit('open');
    if (event !== 'disconnected') first.emit('error', { type: event });
    else first.disconnect();
    assert.deepEqual(c.events, []); c.next(); assert.equal(c.peers.length, 2);
    first.conn.emit('close'); first.emit('error', { type: 'network' });
    c.peers[1].emit('open'); c.peers[1].conn.emit('open');
    c.peers[1].conn.emit('data', { type: 'joined', slot: 1 });
    assert.deepEqual(c.events, ['join', 'joined']);
  }
  c = client(); await c.open(); c.peers[0].emit('error', { type: 'peer-unavailable' }); c.next();
  c.peers[1].emit('error', { type: 'peer-unavailable' });
  assert.deepEqual(c.events, ['找不到该房间。']); assert.equal(c.peers.length, 2);
  c = client(); await c.open(); c.peers[0].disconnect(); c.next(); c.time(16000);
  [...c.timers.values()].find((t) => t.delay === 15000).fn();
  assert.deepEqual(c.events, ['连接超时，请检查网络或房间号。']);
  console.log('PASS: guest retries unavailable/disconnected once, ignores old callbacks, and retains original timeout');

  c = client(); await c.open(true); const host = c.peers[0]; host.emit('open'); const code = c.rooms.room.code;
  c.time(20000); host.disconnect(); host.emit('error', { type: 'network' });
  c.next(); assert.equal(host.reconnects, 1); host.emit('open');
  assert.equal(c.rooms.room.code, code); assert.deepEqual(c.events, ['ready']); assert.equal(c.timers.size, 0);
  host.disconnect(); c.doc.hidden = false; c.doc.emit('visibilitychange');
  c.next(); assert.equal(host.reconnects, 2); host.emit('open');
  assert.deepEqual(c.events, ['ready']); c.rooms.close();
  assert.equal(c.doc.listenerCount('visibilitychange'), 0); assert.equal(c.timers.size, 0);
  console.log('PASS: host reconnects with same code after deadline, resets retries, and resumes immediately when visible');

  c = client(); await c.open(true); c.peers[0].emit('open'); c.peers[0].disconnect();
  while (c.timers.size) c.next();
  assert.equal(c.peers[0].reconnects, 3);
  assert.deepEqual(c.events, ['ready', '在线服务重连失败，请重新建房。']);
  c = client(); await c.open(true); c.peers[0].emit('open'); c.peers[0].disconnect();
  c.rooms.close(); assert.equal(c.timers.size, 0);
  console.log('PASS: host stops after three failed reconnects; closing room cancels recovery');
})().catch((err) => { console.error(err); process.exitCode = 1; });
