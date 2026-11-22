const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function client({ relay = false, peerFails = false } = {}) {
  let now = 0;
  const timers = new Map(), doc = new EventEmitter(), win = new EventEmitter(), peers = [], events = [], sockets = [], messages = [];
  for (const target of [doc, win]) {
    target.addEventListener = target.on.bind(target);
    target.removeEventListener = target.off.bind(target);
  }
  class Peer extends EventEmitter {
    constructor() { super(); if (peerFails) throw Error('PeerJS unavailable'); peers.push(this); }
    connect() {
      const conn = this.conn = new EventEmitter();
      conn.open = true;
      conn.send = (msg) => events.push(msg.type);
      conn.close = () => { if (conn.open) { conn.open = false; conn.emit('close'); } };
      return conn;
    }
    disconnect() { this.disconnected = true; this.emit('disconnected'); }
    reconnect() { this.reconnects = (this.reconnects || 0) + 1; this.disconnected = false; }
    destroy() { this.emit('close'); if (this.broken) throw Error('cleanup'); }
  }
  class WebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    opened() { this.readyState = 1; this.onopen?.(); }
    receive(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }); }
  }
  win.WebSocket = WebSocket;
  if (relay) win.__API_BASE__ = 'https://relay.example';
  win.PH = {}; win.Peer = Peer;
  const ctx = vm.createContext({ window: win, document: doc, URL, TextEncoder, performance: { now: () => now }, crypto: { getRandomValues: (a) => a }, Date: { now: () => now },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(fs.readFileSync(__dirname + '/../js/rooms.js', 'utf8'), ctx);
  const rooms = win.PH.rooms;
  const open = (host = false) => rooms.open(host ? '' : 'ABCDE', 'online', {
    error: (message) => events.push(message), joined: () => events.push('joined'), start: () => events.push('start'), ready: () => events.push('ready'),
    reserve: (mode, links) => links.has(1) ? -1 : 1, change: () => {}, state: () => events.push('state'), message: (msg, slot) => messages.push({ ...msg, senderSlot: slot })
  });
  const next = () => {
    const [id, timer] = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0];
    timers.delete(id); timer.fn();
  };
  return { rooms, peers, events, sockets, messages, timers, doc, win, open, next, time: (ms) => { now = ms; } };
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

  c = client(); await c.open(); c.peers[0].emit('open'); c.peers[0].conn.emit('open');
  c.peers[0].conn.emit('data', { type: 'joined', slot: 1 });
  c.peers[0].conn.emit('data', { type: 'lobby', ready: true });
  assert.equal(c.messages[0].ready, true);
  c.rooms.sendLobby({ ready: true }); assert.equal(c.events.at(-1), 'lobby');
  c.rooms.room.active = true;
  c.peers[0].conn.emit('data', { type: 'lobby', ready: false });
  assert.equal(c.messages.length, 1); c.rooms.close();
  console.log('PASS: P2P pre-match lobby forwarding stops once the match is active');

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

  c = client({ relay: true }); await c.open(); c.peers[0].emit('open'); c.next();
  assert.match(c.sockets[0].url, /^wss:\/\/relay.example\/api\/rooms\/ABCDE\/ws\?role=guest$/);
  c.sockets[0].opened(); assert.notEqual(c.rooms.room.peer, null);
  assert.equal(c.sockets[0].sent.length, 0);
  c.sockets[0].receive({ type: 'relay-ready' }); assert.equal(c.rooms.room.peer, null);
  assert.equal(c.sockets[0].sent[0].type, 'join');
  c.sockets[0].receive(null); c.sockets[0].receive({ type: 'joined', slot: 1 });
  c.sockets[0].receive({ type: 'lobby', ready: true }); assert.equal(c.messages[0].ready, true);
  c.rooms.sendLobby({ ready: true }); assert.equal(c.sockets[0].sent.at(-1).type, 'lobby');
  c.sockets[0].receive({ type: 'start', config: {} }); c.sockets[0].receive({ type: 'state', state: {} });
  c.sockets[0].receive({ type: 'lobby', ready: false }); assert.equal(c.messages.length, 1);
  c.rooms.input({ mx: 1 }); assert.equal(c.sockets[0].sent.at(-1).type, 'input');
  const large = 'x'.repeat(94 * 1024);
  c.sockets[0].receive({ type: 'state', state: large }); assert.equal(c.events.at(-1), 'state');
  c.sockets[0].receive({ type: 'state', state: 'x'.repeat(1024 * 1024) });
  c.events.pop();
  assert.deepEqual(c.events, ['joined', 'start', 'state']); c.rooms.close(); assert.equal(c.sockets[0].readyState, 3);
  console.log('PASS: guest falls back at 5s, uses JSON relay for join/start/state/input, and closes P2P loser');

  c = client({ relay: true }); await c.open(); c.peers[0].emit('open'); c.next();
  c.peers[0].conn.emit('open'); assert.equal(c.sockets[0].readyState, 3);
  c.sockets[0].opened(); assert.deepEqual(c.events, ['join']); c.rooms.close();
  c = client({ relay: true }); await c.open(); c.peers[0].emit('error', { type: 'network' });
  c.sockets[0].opened(); c.sockets[0].close(4404); assert.deepEqual(c.events, ['找不到该房间。']);
  for (const code of [4404, 1006]) {
    c = client({ relay: true }); await c.open(); c.peers[0].emit('open'); c.next();
    c.sockets[0].opened(); c.sockets[0].close(code);
    assert.deepEqual(c.events, []); assert.notEqual(c.rooms.room.peer, null);
    c.peers[0].conn.emit('open'); c.peers[0].conn.emit('data', { type: 'joined', slot: 1 });
    assert.deepEqual(c.events, ['join', 'joined']); c.rooms.close();
  }
  c = client({ relay: true }); await c.open(); c.peers[0].emit('open'); c.next();
  c.sockets[0].opened(); c.sockets[0].close(4404); c.peers[0].emit('error', { type: 'peer-unavailable' });
  assert.deepEqual(c.events, ['找不到该房间。']);
  c = client({ relay: true }); await c.open(); c.next(); c.sockets[0].opened(); c.time(16000);
  [...c.timers.values()].find((t) => t.delay === 15000).fn();
  assert.deepEqual(c.events, ['连接超时，请检查网络或房间号。']);
  console.log('PASS: P2P wins race, late relay cannot win, 4404 reports missing room, relay handshake retains 15s deadline');
  console.log('PASS: relay waits for relay-ready; early 4404/close preserves pending P2P, missing room reported only after both fail');

  c = client({ relay: true, peerFails: true }); await c.open(true); c.sockets[0].opened();
  assert.deepEqual(c.events, ['ready']);
  c.sockets[0].receive({ type: 'peer-open', id: 7 });
  c.sockets[0].receive({ from: 7, msg: { type: 'join', mode: 'online' } });
  assert.equal(c.rooms.room.links.size, 1);
  assert.equal(c.sockets[0].sent[0].to, 7); assert.equal(c.sockets[0].sent[0].msg.type, 'joined');
  c.sockets[0].receive({ from: 7, msg: { type: 'lobby', slot: 5, ready: true } });
  assert.equal(c.messages[0].senderSlot, 1, 'host assigns the sender slot rather than trusting the payload');
  assert.equal(c.messages[0].ready, true);
  c.rooms.room.active = true;
  c.sockets[0].receive({ from: 7, msg: { type: 'lobby', ready: false } }); assert.equal(c.messages.length, 1);
  c.sockets[0].receive({ from: 7, msg: { type: 'input', input: { mx: 1 } } });
  assert.equal(c.rooms.inputs()[1].mx, 1);
  c.rooms.broadcast({ type: 'state', state: {} }); assert.equal(c.sockets[0].sent.at(-1).msg.type, 'state');
  c.rooms.broadcast({ type: 'state', state: 'x'.repeat(94 * 1024) });
  assert.equal(c.sockets[0].sent.at(-1).msg.state.length, 94 * 1024);
  const count = c.sockets[0].sent.length;
  c.rooms.broadcast({ type: 'state', state: 'x'.repeat(1024 * 1024) });
  assert.equal(c.sockets[0].sent.length, count);
  c.sockets[0].receive({ type: 'peer-close', id: 7 }); assert.equal(c.rooms.room.links.size, 0); c.rooms.close();
  console.log('PASS: host works without PeerJS; virtual links reuse reserve/input/broadcast/disconnect logic');

  c = client({ relay: true }); await c.open(true); c.peers[0].emit('open');
  c.sockets[0].opened(); c.peers[0].emit('error', { type: 'invalid-key' });
  assert.deepEqual(c.events, ['ready']); c.sockets[0].close(); c.next(); c.sockets[1].opened();
  assert.match(new URL(c.sockets[0].url).searchParams.get('token'), /^[a-f0-9]{64}$/);
  assert.equal(c.sockets[1].url, c.sockets[0].url);
  assert.equal(c.rooms.room.code, '22222'); assert.deepEqual(c.events, ['ready']); c.rooms.close();
  assert.equal(c.timers.size, 0); assert.equal(c.doc.listenerCount('visibilitychange'), 0);
  c = client({ relay: true }); await c.open(true); c.peers[0].emit('open'); c.sockets[0].opened();
  c.sockets[0].close(4001); assert.deepEqual(c.events, ['ready']); c.rooms.close();
  c = client({ relay: true }); await c.open(true); c.peers[0].emit('open');
  for (let i = 0; i < 4; i++) { c.sockets[i].close(1006); c.next(); }
  assert.equal(c.sockets.length, 5); c.sockets[4].opened();
  assert.deepEqual(c.events, ['ready']); c.rooms.close();
  c = client({ relay: true, peerFails: true }); await c.open(true);
  for (let i = 0; i < 4; i++) { c.sockets[i].close(1006); if (i < 3) c.next(); }
  assert.deepEqual(c.events, ['房间中继重连失败。']);
  c = client({ relay: true, peerFails: true }); await c.open(); assert.equal(c.sockets.length, 1);
  c.sockets[0].opened(); c.sockets[0].receive({ type: 'relay-ready' }); c.sockets[0].receive({ type: 'reject' });
  assert.deepEqual(c.events, ['房间已满、已开赛或比赛模式不同。']);
  console.log('PASS: independent host transport failures, relay reconnect, cancellation, PeerJS load failure, and room rejection');
})().catch((err) => { console.error(err); process.exitCode = 1; });
