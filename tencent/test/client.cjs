// Client-side tests for the lag fixes in js/rooms.js (runs rooms.js in a vm with fake WebSocket/RTC/fetch):
//  A. /api/turn credentials are injected into RTCPeerConnection, google STUN is gone
//  B. fetch failure / 429 / garbage -> STUN fallback, room setup never blocked
//  C. offer waits for in-flight credential fetch (no race using stale ICE)
//  D. 'input' travels on its own unordered channel, state stays on 'state', others on 'ctrl'
//  E. host drops late/duplicate input by seq; seq resets between matches
//  F. relay (no P2P) still carries seq-stamped input
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function client({ rtc = true, fetchImpl } = {}) {
  let now = 0;
  const timers = new Map(), doc = new EventEmitter(), win = new EventEmitter(), sockets = [], pcs = [], fetches = [];
  for (const t of [doc, win]) { t.addEventListener = t.on.bind(t); t.removeEventListener = t.off.bind(t); }
  class WebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(d) { this.sent.push(JSON.parse(d)); }
    opened() { this.readyState = 1; this.onopen?.(); }
    receive(d) { this.onmessage?.({ data: JSON.stringify(d) }); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }); }
  }
  class Ch {
    constructor(label, opts = {}) { this.label = label; this.opts = opts; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; }
    open() { this.readyState = 'open'; this.onopen?.(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); }
  }
  class PC {
    constructor(cfg) { this.cfg = cfg; this.channels = new Map(); this.remoteDescription = null; this.connectionState = 'new'; pcs.push(this); }
    createDataChannel(l, o) { const c = new Ch(l, o); this.channels.set(l, c); return c; }
    async createOffer() { return { type: 'offer', sdp: 'o' }; }
    async createAnswer() { return { type: 'answer', sdp: 'a' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d) { this.remoteDescription = d; }
    async addIceCandidate() {}
    emit(l, o) { const c = new Ch(l, o); this.channels.set(l, c); this.ondatachannel?.({ channel: c }); return c; }
    close() { this.connectionState = 'closed'; }
  }
  win.WebSocket = WebSocket; if (rtc) win.RTCPeerConnection = PC;
  win.__API_BASE__ = 'https://api.example';
  win.PH = {};
  if (fetchImpl) win.fetch = (url, opts) => { fetches.push(url); return fetchImpl(url, opts); };
  const ctx = vm.createContext({ window: win, document: doc, URL, TextEncoder, AbortSignal, Promise, JSON, Math, Number, Array, Object, Map, Set, performance: { now: () => now }, crypto: { getRandomValues: (a) => a }, Date: { now: () => now },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(fs.readFileSync(__dirname + '/../../js/rooms.js', 'utf8'), ctx);
  const rooms = win.PH.rooms, events = [];
  const open = (host = false) => rooms.open(host ? '' : 'ABCDE', 'online', {
    error: (m) => events.push(m), joined: () => events.push('joined'), start: () => events.push('start'), ready: () => events.push('ready'),
    reserve: (mode, links) => (links.has(1) ? -1 : 1), change: () => {}, state: () => events.push('state'),
  });
  return { rooms, sockets, pcs, fetches, events, open, win, time: (ms) => { now = ms; } };
}
const tick = () => new Promise((r) => setImmediate(r));
const TURN = { iceServers: [{ urls: ['turn:hk.example:3478?transport=udp'], username: '1795:abc', credential: 'cred==' }] };
const okFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(TURN) });

(async () => {
  // A. credentials injected, google removed
  let h = client({ fetchImpl: okFetch });
  await h.open(true); await tick(); await tick();
  assert.equal(h.fetches[0], 'https://api.example/api/turn');
  h.sockets[0].opened(); h.sockets[0].receive({ type: 'peer-open', id: 1 }); await tick();
  const cfg = h.pcs[0].cfg.iceServers;
  assert.equal(cfg[0].username, '1795:abc'); assert.equal(cfg[0].credential, 'cred==');
  const allUrls = cfg.flatMap((s) => [].concat(s.urls)).join(' ');
  assert.ok(allUrls.includes('turn:hk.example'), 'own TURN present');
  assert.ok(!allUrls.includes('google'), 'google STUN removed');
  assert.ok(allUrls.includes('stun.qq.com'), 'STUN kept as fallback');
  console.log('PASS A: TURN credentials injected into RTCPeerConnection, google STUN removed, STUN fallback kept');

  // B. failures never block
  for (const [name, impl] of [
    ['network error', () => Promise.reject(new Error('net'))],
    ['429', () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })],
    ['garbage', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ foo: 1 }) })],
    ['no turn configured (404)', () => Promise.resolve({ ok: false, status: 404 })],
  ]) {
    h = client({ fetchImpl: impl });
    await h.open(true); await tick(); await tick();
    h.sockets[0].opened(); h.sockets[0].receive({ type: 'peer-open', id: 1 }); await tick();
    assert.ok(h.pcs[0], name + ': still builds a peer connection');
    const u = h.pcs[0].cfg.iceServers.flatMap((s) => [].concat(s.urls)).join(' ');
    assert.ok(u.includes('stun.qq.com') && !u.includes('turn:'), name + ': STUN-only fallback');
    assert.deepEqual(h.events, ['ready'], name + ': room opens normally');
  }
  h = client({ rtc: true }); // no window.fetch at all (old browsers / test env)
  await h.open(true); h.sockets[0].opened(); h.sockets[0].receive({ type: 'peer-open', id: 1 }); await tick();
  assert.ok(h.pcs[0]);
  console.log('PASS B: network error / 429 / garbage / 404 / no fetch -> STUN fallback, room opens normally');

  // C. offer waits for in-flight credential fetch
  let release; const slow = () => new Promise((r) => { release = () => r({ ok: true, json: () => Promise.resolve(TURN) }); });
  h = client({ fetchImpl: slow });
  await h.open(true); h.sockets[0].opened();
  h.sockets[0].receive({ type: 'peer-open', id: 1 }); await tick();
  assert.equal(h.pcs.length, 0, 'no peer connection while credentials are in flight');
  release(); await tick(); await tick(); await tick();
  assert.equal(h.pcs.length, 1); assert.equal(h.pcs[0].cfg.iceServers[0].username, '1795:abc', 'offer built with fresh TURN creds');
  // guest side: incoming offer while fetch pending
  h = client({ fetchImpl: slow });
  await h.open(); h.sockets[0].opened(); h.sockets[0].receive({ type: 'relay-ready' });
  h.sockets[0].receive({ type: 'rtc', kind: 'offer', sdp: { type: 'offer', sdp: 'o' } }); await tick();
  assert.equal(h.pcs.length, 0);
  release(); await tick(); await tick(); await tick(); await tick();
  assert.equal(h.pcs.length, 1); assert.equal(h.pcs[0].cfg.iceServers[0].username, '1795:abc');
  assert.ok(h.sockets[0].sent.some((m) => m.type === 'rtc' && m.kind === 'answer'), 'guest still answers after waiting');
  console.log('PASS C: host/guest wait for in-flight TURN fetch before building the peer connection (no stale-ICE race)');

  // D+E. channels + seq (host <-> guest pair)
  const host = client({ fetchImpl: okFetch }), guest = client({ fetchImpl: okFetch });
  await host.open(true); host.sockets[0].opened();
  await guest.open(); guest.sockets[0].opened(); guest.sockets[0].receive({ type: 'relay-ready' });
  await tick(); await tick();
  host.sockets[0].receive({ type: 'peer-open', id: 1 }); await tick(); await tick();
  const offer = host.sockets[0].sent.find((m) => m.msg?.kind === 'offer');
  guest.sockets[0].receive(offer.msg); await tick(); await tick();
  const ans = guest.sockets[0].sent.find((m) => m.kind === 'answer');
  host.sockets[0].receive({ from: 1, msg: ans }); await tick();
  host.sockets[0].receive({ from: 1, msg: guest.sockets[0].sent.find((m) => m.type === 'join') });
  guest.sockets[0].receive(host.sockets[0].sent.find((m) => m.msg?.type === 'joined').msg);
  const hc = host.pcs[0].channels;
  assert.deepEqual([...hc.keys()].sort(), ['ctrl', 'input', 'state']);
  assert.equal(hc.get('input').opts.ordered, false); assert.equal(hc.get('input').opts.maxRetransmits, undefined, 'input is reliable (no maxRetransmits)');
  assert.equal(hc.get('state').opts.maxRetransmits, 0);
  const gc = { ctrl: guest.pcs[0].emit('ctrl', { ordered: true }), state: guest.pcs[0].emit('state', { ordered: false, maxRetransmits: 0 }), input: guest.pcs[0].emit('input', { ordered: false }) };
  for (const c of [...hc.values(), ...Object.values(gc)]) c.open();
  assert.equal(host.rooms.room.transport, 'p2p'); assert.equal(guest.rooms.room.transport, 'p2p');
  // guest -> host
  host.rooms.room.active = true;
  host.sockets[0].receive({ from: 1, msg: { type: 'start' } }); // no-op on host, guest handles start below
  guest.sockets[0].receive({ type: 'start', config: {} });
  guest.time(1000); guest.rooms.input({ mx: 1 });
  assert.equal(gc.input.sent.length, 1, 'input goes on its own channel');
  assert.equal(gc.ctrl.sent.filter((m) => m.type === 'input').length, 0, 'not on ordered ctrl');
  assert.equal(gc.input.sent[0].seq, 1);
  guest.time(1010); guest.rooms.input({ mx: -1 }); assert.equal(gc.input.sent[1].seq, 2);
  // host -> guest: state on 'state', audio state + ping on 'ctrl'
  host.rooms.broadcast({ type: 'state', state: { x: 1 } });
  assert.equal(hc.get('state').sent.length, 1); assert.equal(hc.get('input').sent.length, 0);
  host.rooms.broadcast({ type: 'state', state: { x: 2, audio: [['play', 'swish']] } });
  assert.equal(hc.get('ctrl').sent.length >= 1, true);
  console.log('PASS D: input -> dedicated unordered channel with seq, state -> unreliable channel, audio/control -> ordered ctrl');

  // E. host-side seq filtering
  host.time(2000);
  hc.get('input').receive({ type: 'input', input: { mx: 1 }, seq: 5 }); host.time(2001);
  assert.equal(host.rooms.inputs()[1].mx, 1);
  hc.get('input').receive({ type: 'input', input: { mx: -1 }, seq: 4 });   // late -> ignored
  hc.get('input').receive({ type: 'input', input: { mx: -1 }, seq: 5 });   // duplicate -> ignored
  assert.equal(host.rooms.inputs()[1].mx, 1, 'stale/duplicate input does not overwrite newer state');
  hc.get('input').receive({ type: 'input', input: { mx: 0.5 }, seq: 6 });
  assert.equal(host.rooms.inputs()[1].mx, 0.5);
  hc.get('input').receive({ type: 'input', input: { mx: 0 } });            // legacy client without seq still works
  assert.equal(host.rooms.inputs()[1].mx, 0, 'old clients (no seq) remain compatible');
  console.log('PASS E: host drops late/duplicate input by seq, accepts newer, stays compatible with clients that send no seq');

  // F. relay-only path
  h = client({ rtc: false, fetchImpl: okFetch });
  await h.open(); h.sockets[0].opened(); h.sockets[0].receive({ type: 'relay-ready' }); h.sockets[0].receive({ type: 'joined', slot: 1 });
  h.sockets[0].receive({ type: 'start', config: {} });
  h.time(100); h.rooms.input({ mx: 1 });
  assert.equal(h.sockets[0].sent.at(-1).seq, 1); assert.equal(h.sockets[0].sent.at(-1).type, 'input');
  // new match resets the sequence
  h.rooms.close(); await h.open(); h.sockets[1].opened(); h.sockets[1].receive({ type: 'relay-ready' }); h.sockets[1].receive({ type: 'joined', slot: 1 });
  h.sockets[1].receive({ type: 'start', config: {} }); h.time(300); h.rooms.input({ mx: 1 });
  assert.equal(h.sockets[1].sent.at(-1).seq, 1, 'seq restarts for a new room');
  console.log('PASS F: relay fallback carries seq-stamped input; seq resets per room');
})().catch((e) => { console.error(e); process.exitCode = 1; });
