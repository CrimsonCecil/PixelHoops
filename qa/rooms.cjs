const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function client({ relay = true, rtc = false, bcBus = null, direct = false, ice = null } = {}) {
  let now = 0;
  const timers = new Map(), doc = new EventEmitter(), win = new EventEmitter(), events = [], sockets = [], messages = [], pcs = [], bcs = [];
  for (const target of [doc, win]) {
    target.addEventListener = target.on.bind(target);
    target.removeEventListener = target.off.bind(target);
  }
  class WebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    opened() { this.readyState = 1; this.onopen?.(); }
    receive(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }); }
  }
  class FakeChannel {
    constructor(label, opts = {}) { this.label = label; this.opts = opts; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; }
    open() { this.readyState = 'open'; this.onopen?.(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); }
  }
  class RTCPeerConnection {
    constructor(cfg) { this.cfg = cfg; this.channels = new Map(); this.remoteDescription = null; this.localDescription = null; this.addedIce = []; this.connectionState = 'new'; pcs.push(this); }
    createDataChannel(label, opts) { const ch = new FakeChannel(label, opts); this.channels.set(label, ch); return ch; }
    async createOffer() { return { type: 'offer', sdp: 'fake-offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'fake-answer' }; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) { this.remoteDescription = d; }
    async addIceCandidate(c) { this.addedIce.push(c); }
    emitDataChannel(label, opts) { const ch = new FakeChannel(label, opts); this.channels.set(label, ch); this.ondatachannel?.({ channel: ch }); return ch; }
    close() { this.connectionState = 'closed'; for (const ch of this.channels.values()) ch.close(); }
  }
  win.WebSocket = WebSocket;
  if (rtc) win.RTCPeerConnection = RTCPeerConnection;
  if (bcBus) {
    win.BroadcastChannel = class FakeBroadcastChannel {
      constructor(name) {
        this.name = name; this.closed = false; this.onmessage = null;
        if (!bcBus.has(name)) bcBus.set(name, new Set());
        bcBus.get(name).add(this);
        bcs.push(this);
      }
      postMessage(data) {
        if (this.closed) return;
        const copy = JSON.parse(JSON.stringify(data));
        for (const peer of bcBus.get(this.name) || []) {
          if (peer !== this && !peer.closed) peer.onmessage?.({ data: copy });
        }
      }
      close() {
        if (this.closed) return;
        this.closed = true;
        bcBus.get(this.name)?.delete(this);
      }
    };
  }
  if (relay) win.__API_BASE__ = 'https://relay.example';
  win.PH = { TUNE: { reg() {}, get: (k) => (k === 'net_direct' ? +direct : undefined) } };
  if (ice) win.fetch = async () => ({ ok: true, json: async () => ({ iceServers: ice }) });
  const ctx = vm.createContext({ window: win, document: doc, URL, TextEncoder, performance: { now: () => now }, crypto: { getRandomValues: (a) => a }, Date: { now: () => now },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(fs.readFileSync(__dirname + '/../js/rooms.js', 'utf8'), ctx);
  const rooms = win.PH.rooms;
  const open = (host = false) => rooms.open(host ? '' : 'ABCDE', 'online', {
    error: (message) => events.push(message), joined: () => events.push('joined'), start: () => events.push('start'), ready: () => events.push('ready'),
    reserve: (mode, links) => links.has(1) ? -1 : 1, change: (slot, reason) => { if (reason) events.push(reason); }, notice: (message) => events.push(message), state: () => events.push('state'), message: (msg, slot) => messages.push({ ...msg, senderSlot: slot })
  });
  const next = () => {
    const [id, timer] = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0];
    timers.delete(id); timer.fn();
  };
  return { rooms, events, sockets, messages, pcs, bcs, timers, doc, win, open, next, time: (ms) => { now = ms; } };
}

(async () => {
  // 1. Missing API_BASE surfaces config error cleanly
  let c = client({ relay: false });
  await c.open();
  assert.deepEqual(c.events, ['在线服务未配置，请检查网络。']);
  console.log('PASS: missing relay config surfaces error cleanly');

  // 2. Normal guest join/start over relay, lobby forwarding stops when active, deadline cleanup
  c = client(); await c.open();
  c.sockets[0].opened(); c.sockets[0].receive({ type: 'relay-ready' });
  c.sockets[0].receive(null);
  c.sockets[0].receive({ type: 'joined', slot: 1, protocol: 1 });
  c.sockets[0].receive({ type: 'lobby', ready: true });
  assert.equal(c.messages[0].ready, true);
  c.rooms.sendLobby({ ready: true }); assert.equal(c.sockets[0].sent.at(-1).type, 'lobby');
  c.time(20000); c.doc.emit('visibilitychange');
  c.sockets[0].receive({ type: 'start', config: {} });
  c.sockets[0].receive({ type: 'lobby', ready: false });
  assert.equal(c.messages.length, 1);
  assert.equal(c.timers.size, 0);
  assert.equal(c.rooms.room.active, true);
  c.rooms.close();
  console.log('PASS: normal relay join/start, pre-match lobby forwarding, and deadline cleanup');

  // 3. Stalled guest times out via timer / visibilitychange / pageshow
  for (const resume of ['timer', 'visibilitychange', 'pageshow']) {
    c = client(); await c.open(); c.time(16000);
    if (resume === 'timer') [...c.timers.values()][0].fn();
    else (resume === 'pageshow' ? c.win : c.doc).emit(resume);
    assert.deepEqual(c.events, ['连接超时，请检查网络或房间号。']);
    assert.equal(c.rooms.room.role, '');
    assert.equal(c.doc.listenerCount('visibilitychange'), 0);
  }
  console.log('PASS: stalled guest times out via timer or background-page resume');

  // 4. Missing room (4404) & rejection
  c = client(); await c.open(); c.sockets[0].opened(); c.sockets[0].close(4404);
  assert.deepEqual(c.events, ['找不到该房间。']);
  c = client(); await c.open(); c.sockets[0].opened(); c.sockets[0].receive({ type: 'relay-ready' }); c.sockets[0].receive({ type: 'reject' });
  assert.deepEqual(c.events, ['房间已满、已开赛或比赛模式不同。']);
  console.log('PASS: 4404 missing room and room rejection');

  for (const protocol of [undefined, 0, 2, '1']) {
    const host = client(); await host.open(true); host.sockets[0].opened();
    host.sockets[0].receive({ type: 'peer-open', id: 9 });
    host.sockets[0].receive({ from: 9, msg: { type: 'join', mode: 'online', protocol } });
    const reject = host.sockets[0].sent.at(-1).msg;
    assert.deepEqual(reject, { type: 'reject', reason: 'version' });
    assert.equal(host.rooms.room.links.size, 0, 'incompatible guest cannot reserve a slot');
    const guest = client(); await guest.open(); guest.sockets[0].opened(); guest.sockets[0].receive({ type: 'relay-ready' });
    assert.equal(guest.sockets[0].sent.find(m => m.type === 'join').protocol, 1);
    guest.sockets[0].receive(reject);
    assert.deepEqual(guest.events, ['版本不一致，请刷新页面后重试。']);
    assert.equal(guest.timers.size, 0);
    const reverse = client(); await reverse.open(); reverse.sockets[0].opened(); reverse.sockets[0].receive({ type: 'relay-ready' });
    reverse.sockets[0].receive({ type: 'joined', slot: 1, protocol });
    reverse.sockets[0].receive({ type: 'start', config: {} });
    assert.deepEqual(reverse.events, ['版本不一致，请刷新页面后重试。']);
    assert.equal(reverse.rooms.room.role, '');
    assert.equal(reverse.timers.size, 0);
    host.rooms.close();
  }
  console.log('PASS: missing/mismatched protocols reject before slot reservation; new guests reject legacy hosts before start and show refresh errors.');

  // 5. Host relay reconnect with same token and fatal/max-retry failure
  c = client(); await c.open(true); c.sockets[0].opened();
  assert.deepEqual(c.events, ['ready']);
  c.sockets[0].close(1006); c.next(); c.sockets[1].opened();
  assert.match(new URL(c.sockets[0].url).searchParams.get('token'), /^[a-f0-9]{64}$/);
  assert.equal(c.sockets[1].url, c.sockets[0].url);
  assert.equal(c.rooms.room.code, '22222');
  c.rooms.close();
  assert.equal(c.timers.size, 0); assert.equal(c.doc.listenerCount('visibilitychange'), 0);
  c = client(); await c.open(true);
  for (let i = 0; i < 4; i++) { c.sockets[i].close(1006); if (i < 3) c.next(); }
  assert.deepEqual(c.events, ['房间中继重连失败。']);
  console.log('PASS: host relay reconnect preserves token and stops after max retries');

  // 6. Host virtual links, sender slot isolation, frame size guard, input throttling, seq drop, 8KB relay backpressure
  c = client(); await c.open();
  c.sockets[0].opened(); c.sockets[0].receive({ type: 'relay-ready' });
  c.sockets[0].receive({ type: 'joined', slot: 1, protocol: 1 });
  c.sockets[0].receive({ type: 'start', config: {} });
  const sentBeforeInput = c.sockets[0].sent.length;
  c.time(100); c.rooms.input({ mx: 1, my: 0 });
  c.time(116); c.rooms.input({ mx: 1, my: 0 }); // unchanged within 100ms -> throttled
  c.time(132); c.rooms.input({ mx: 0, my: 0 }); // changed -> immediate
  c.time(240); c.rooms.input({ mx: 0, my: 0 }); // heartbeat >= 100ms -> sent
  assert.equal(c.sockets[0].sent.length - sentBeforeInput, 3);
  const statesBefore = c.events.filter((e) => e === 'state').length;
  c.sockets[0].receive({ type: 'state', seq: 5, state: { t: 5 } });
  c.sockets[0].receive({ type: 'state', seq: 4, state: { t: 4 } }); // stale -> dropped
  c.sockets[0].receive({ type: 'state', seq: 4, state: { t: 4, audio: [['play', 'swish']] } }); // stale with audio -> audio still delivered
  c.sockets[0].receive({ type: 'state', seq: 5, state: { t: 5 } }); // duplicate -> dropped
  c.sockets[0].receive({ type: 'state', seq: 6, state: { t: 6 } }); // newer -> accepted
  assert.equal(c.events.filter((e) => e === 'state').length - statesBefore, 3);
  c.rooms.close();

  c = client(); await c.open(true); c.sockets[0].opened();
  c.sockets[0].receive({ type: 'peer-open', id: 9 });
  c.sockets[0].receive({ from: 9, msg: { type: 'join', mode: 'online', protocol: 1 } });
  c.sockets[0].receive({ from: 9, msg: { type: 'lobby', slot: 5, ready: true } });
  assert.equal(c.messages[0].senderSlot, 1);
  c.rooms.room.active = true;
  assert.equal(c.rooms.relaying(), true);
  assert.equal(c.rooms.congested(), false);
  c.rooms.broadcast({ type: 'state', state: { a: 1 } });
  c.rooms.broadcast({ type: 'state', state: { a: 2 } });
  assert.equal(c.sockets[0].sent.at(-2).msg.seq, 1);
  assert.equal(c.sockets[0].sent.at(-1).msg.seq, 2);
  const sentBeforeBackpressure = c.sockets[0].sent.length;
  c.sockets[0].bufferedAmount = 10 * 1024; // > 8KB relay limit
  assert.equal(c.rooms.congested(), true);
  c.rooms.broadcast({ type: 'state', state: { a: 3 } }); // dropped under 8KB relay backpressure
  assert.equal(c.sockets[0].sent.length, sentBeforeBackpressure);
  c.rooms.broadcast({ type: 'state', state: { a: 4, audio: [['play', 'swish']] } }); // audio-bearing state preserved
  assert.equal(c.sockets[0].sent.length, sentBeforeBackpressure + 1);
  c.rooms.broadcast({ type: 'start', config: {} }); // control messages preserved
  assert.equal(c.sockets[0].sent.length, sentBeforeBackpressure + 2);
  c.sockets[0].bufferedAmount = 0;
  assert.equal(c.rooms.congested(), false);
  const beforeLarge = c.sockets[0].sent.length;
  c.rooms.broadcast({ type: 'state', state: 'x'.repeat(1024 * 1024) }); // > MAX_FRAME dropped
  assert.equal(c.sockets[0].sent.length, beforeLarge);
  c.rooms.close();
  console.log('PASS: input throttling, state seq ordering, 8KB relay backpressure, and audio/control preservation');

  // 7. Self-hosted WebRTC P2P signaling upgrade, dual DataChannel routing, and fallback to relay
  const host = client({ rtc: true }), guest = client({ rtc: true });
  await host.open(true); host.sockets[0].opened();
  await guest.open(); guest.sockets[0].opened(); guest.sockets[0].receive({ type: 'relay-ready' });
  host.sockets[0].receive({ type: 'peer-open', id: 1 });
  // Flush offer -> guest -> answer -> host
  await new Promise((r) => setImmediate(r));
  const offerMsg = host.sockets[0].sent.find((m) => m.msg?.type === 'rtc' && m.msg.kind === 'offer');
  assert.ok(offerMsg, 'host sends WebRTC offer via own relay');
  guest.sockets[0].receive(offerMsg.msg);
  await new Promise((r) => setImmediate(r));
  const answerMsg = guest.sockets[0].sent.find((m) => m.type === 'rtc' && m.kind === 'answer');
  assert.ok(answerMsg, 'guest sends WebRTC answer via own relay');
  host.sockets[0].receive({ from: 1, msg: answerMsg });
  await new Promise((r) => setImmediate(r));
  // Complete join over relay first
  const joinMsg = guest.sockets[0].sent.find((m) => m.type === 'join');
  host.sockets[0].receive({ from: 1, msg: joinMsg });
  const joinedMsg = host.sockets[0].sent.find((m) => m.msg?.type === 'joined');
  guest.sockets[0].receive(joinedMsg.msg);
  assert.equal(host.rooms.relaying(), true);
  // Open WebRTC ctrl + state DataChannels on both sides -> upgrades seamlessly to P2P
  const hCtrl = host.pcs[0].channels.get('ctrl'), hState = host.pcs[0].channels.get('state');
  assert.equal(hState.opts.ordered, false);
  assert.equal(hState.opts.maxRetransmits, 0);
  const gCtrl = guest.pcs[0].emitDataChannel('ctrl', { ordered: true });
  const gState = guest.pcs[0].emitDataChannel('state', { ordered: false, maxRetransmits: 0 });
  hCtrl.open(); hState.open(); gCtrl.open(); gState.open();
  assert.equal(host.rooms.room.transport, 'p2p');
  assert.equal(host.rooms.relaying(), false);
  assert.equal(guest.rooms.room.transport, 'p2p');
  // Regular state uses unreliable 'state' channel; audio-bearing state & ping use reliable 'ctrl' channel
  assert.equal(hCtrl.sent.length, 1);
  assert.equal(hCtrl.sent[0].type, 'ping');
  hCtrl.sent.length = 0;
  host.rooms.room.active = true;
  host.rooms.broadcast({ type: 'state', state: { x: 1 } });
  assert.equal(hState.sent.length, 1);
  assert.equal(hCtrl.sent.length, 0);
  host.rooms.broadcast({ type: 'state', state: { x: 2, audio: [['play', 'swish']] } });
  assert.equal(hCtrl.sent.length, 1);
  // Match restart keeps stateSeq monotonic so late unordered P2P snapshots cannot block new match frames
  const seqBeforeRestart = hState.sent[0].seq;
  host.rooms.broadcast({ type: 'start', config: { mode: 'online' } });
  host.rooms.broadcast({ type: 'state', state: { x: 3 } });
  assert.ok(hState.sent[1].seq > seqBeforeRestart, 'stateSeq remains monotonic across match restarts');
  // Fallback back to relay if P2P ctrl closes while relay is still alive (guest 2)
  host.sockets[0].receive({ type: 'peer-open', id: 2 });
  await new Promise((r) => setImmediate(r));
  const hCtrl2 = host.pcs[1].channels.get('ctrl');
  hCtrl2.open();
  hCtrl2.close();
  assert.equal(host.rooms.room.transport, 'p2p'); // guest 1 still on P2P
  // If relay already closed (peer-close / ws.onclose), closing P2P ctrl releases slot & reports disconnect,
  // and rooms.close() still closes detached P2P peer connections
  host.sockets[0].receive({ type: 'peer-close', id: 1 });
  assert.equal(host.rooms.room.links.has(1), true);
  host.rooms.close();
  assert.equal(host.pcs[0].connectionState, 'closed');
  assert.equal(host.rooms.room.links.size, 0);
  guest.sockets[0].close(1006);
  assert.equal(guest.rooms.room.transport, 'p2p');
  gCtrl.close();
  assert.equal(guest.events.at(-1), '房间中继已断开（1006）。');
  guest.rooms.close();
  console.log('PASS: self-hosted WebRTC P2P upgrade, dual-channel routing, relay fallback, and dead-relay cleanup');

  // 7b. net_direct: the host's switch governs the room; it strips TURN on both peers
  const TURN_ICE = [{ urls: ['stun:t.example:3478', 'turn:t.example:3478?transport=udp', 'turns:t.example:5349'], username: 'u', credential: 'c' }, { urls: 'turn:only.example' }];
  for (const hostDirect of [false, true]) {
    const h = client({ rtc: true, direct: hostDirect, ice: TURN_ICE }), g = client({ rtc: true, ice: TURN_ICE });
    await h.open(true); await new Promise((r) => setImmediate(r)); h.sockets[0].opened();
    await g.open(); await new Promise((r) => setImmediate(r)); g.sockets[0].opened(); g.sockets[0].receive({ type: 'relay-ready' });
    h.sockets[0].receive({ type: 'peer-open', id: 1 });
    await new Promise((r) => setImmediate(r));
    const offer = h.sockets[0].sent.find((m) => m.msg?.type === 'rtc' && m.msg.kind === 'offer');
    assert.equal(offer.msg.direct === true, hostDirect);
    g.sockets[0].receive(offer.msg);
    await new Promise((r) => setImmediate(r));
    const urls = (pc) => pc.cfg.iceServers.flatMap((s) => [].concat(s.urls));
    for (const pc of [h.pcs[0], g.pcs[0]]) {
      assert.equal(urls(pc).some((u) => /^turns?:/.test(u)), !hostDirect);
      assert.ok(urls(pc).includes('stun:t.example:3478'));
    }
    if (hostDirect) assert.equal(h.pcs[0].cfg.iceServers[0].username, 'u');
    g.sockets[0].receive({ type: 'joined', slot: 1 });
    assert.equal(g.rooms.room.direct, hostDirect);
    h.rooms.close(); g.rooms.close();
    assert.equal(g.rooms.room.direct, false);
  }
  console.log('PASS: net_direct strips TURN servers on host and guest; off keeps them');

  // 7c. net_direct: the Worker only carries signaling; a failed direct connection fails both sides with 直连失败
  const DIRECT_FAIL = /^直连失败/;
  const directPair = async () => {
    const h = client({ rtc: true, direct: true }), g = client({ rtc: true });
    await h.open(true); await new Promise((r) => setImmediate(r)); h.sockets[0].opened();
    await g.open(); await new Promise((r) => setImmediate(r)); g.sockets[0].opened(); g.sockets[0].receive({ type: 'relay-ready' });
    h.sockets[0].receive({ type: 'peer-open', id: 1 });
    await new Promise((r) => setImmediate(r));
    g.sockets[0].receive(h.sockets[0].sent.find((m) => m.msg?.kind === 'offer').msg);
    await new Promise((r) => setImmediate(r));
    // The join went out over the Worker before the guest knew the room is direct-only: the host ignores it.
    h.sockets[0].receive({ from: 1, msg: g.sockets[0].sent.find((m) => m.type === 'join') });
    assert.equal(h.rooms.room.links.size, 0);
    assert.ok(!h.sockets[0].sent.some((m) => m.msg && m.msg.type !== 'rtc'));
    return { h, g };
  };
  let dp = await directPair();
  const dhCtrl = dp.h.pcs[0].channels.get('ctrl'), dgCtrl = dp.g.pcs[0].emitDataChannel('ctrl', { ordered: true });
  dhCtrl.open(); dgCtrl.open();
  dhCtrl.receive(dgCtrl.sent.find((m) => m.type === 'join'));
  dgCtrl.receive(dhCtrl.sent.find((m) => m.type === 'joined'));
  assert.ok(dp.g.events.includes('joined'));
  assert.equal(dp.h.rooms.room.links.size, 1);
  assert.equal(dp.g.rooms.room.transport, 'p2p'); assert.equal(dp.g.rooms.room.direct, true);
  // P2P drops mid-room while the Worker is still up: no relay fallback, both sides told
  dp.h.rooms.room.active = true;
  const before = dp.h.events.length;
  dhCtrl.close();
  assert.ok(DIRECT_FAIL.test(dp.h.events.at(-1)));
  assert.equal(dp.h.events.length, before + 1); // via change(slot, reason) only, not notice too
  const hFail = dp.h.sockets[0].sent.find((m) => m.msg?.kind === 'fail');
  assert.ok(hFail); assert.ok(!dp.h.sockets[0].sent.some((m) => m.msg?.type === 'state'));
  dp.g.sockets[0].receive(hFail.msg);
  assert.ok(DIRECT_FAIL.test(dp.g.events.at(-1)));
  assert.equal(dp.g.rooms.room.role, '');
  dp.h.rooms.close();
  // Direct never connects: host gives up after the direct timeout and tells the guest
  dp = await directPair();
  dp.h.next();
  assert.ok(DIRECT_FAIL.test(dp.h.events.at(-1)));
  dp.g.sockets[0].receive(dp.h.sockets[0].sent.find((m) => m.msg?.kind === 'fail').msg);
  assert.ok(DIRECT_FAIL.test(dp.g.events.at(-1)));
  dp.h.rooms.close();
  // ICE fails on the guest first: guest shows 直连失败 and tells the host
  dp = await directPair();
  dp.g.pcs[0].connectionState = 'failed'; dp.g.pcs[0].onconnectionstatechange();
  assert.ok(DIRECT_FAIL.test(dp.g.events.at(-1)));
  dp.h.sockets[0].receive({ from: 1, msg: dp.g.sockets[0].sent.find((m) => m.kind === 'fail') });
  assert.ok(DIRECT_FAIL.test(dp.h.events.at(-1)));
  dp.h.rooms.close();
  console.log('PASS: net_direct never relays game data; direct failure shows 直连失败 on host and guest');

  // 8. Guest & host ping/pong RTT measurement
  c = client(); await c.open(); c.sockets[0].opened();
  c.sockets[0].receive({ type: 'relay-ready' }); c.sockets[0].receive({ type: 'joined', slot: 1, protocol: 1 });
  assert.equal(c.rooms.room.ping, null);
  c.time(1000); c.rooms.ping();
  assert.equal(c.sockets[0].sent.at(-1).type, 'ping');
  c.time(1042); c.sockets[0].receive({ type: 'pong', t: 1000 });
  assert.equal(c.rooms.room.ping, 42);
  c.sockets[0].receive({ type: 'ping', t: 2500 });
  assert.deepEqual(c.sockets[0].sent.at(-1), { type: 'pong', t: 2500 });
  c.rooms.close(); assert.equal(c.rooms.room.ping, null);

  c = client(); await c.open(true); c.sockets[0].opened();
  c.sockets[0].receive({ type: 'peer-open', id: 7 });
  c.sockets[0].receive({ from: 7, msg: { type: 'join', mode: 'online', protocol: 1 } });
  c.time(2000); c.rooms.ping();
  assert.deepEqual(c.sockets[0].sent.at(-1), { to: 7, msg: { type: 'ping', t: 2000 } });
  c.time(2035); c.sockets[0].receive({ from: 7, msg: { type: 'pong', t: 2000 } });
  assert.equal(c.rooms.room.ping, 35);
  c.sockets[0].receive({ from: 7, msg: { type: 'ping', t: 3100 } });
  assert.deepEqual(c.sockets[0].sent.at(-1), { to: 7, msg: { type: 'pong', t: 3100 } });
  c.sockets[0].receive({ type: 'peer-close', id: 7 });
  assert.equal(c.rooms.room.ping, null); c.rooms.close();
  console.log('PASS: guest and host ping/pong RTT tracking and disconnect cleanup');

  // 9. Same-browser BroadcastChannel local upgrade bypasses relay & WebRTC
  const bcBus = new Map();
  const lHost = client({ rtc: true, bcBus }), lGuest = client({ rtc: true, bcBus });
  await lHost.open(true); lHost.sockets[0].opened();
  await lGuest.open(false); lGuest.sockets[0].opened();
  lHost.sockets[0].receive({ type: 'peer-open', id: 1 });
  lGuest.sockets[0].receive({ type: 'relay-ready' });
  await new Promise((r) => setImmediate(r));
  const localOffer = lHost.sockets[0].sent.find((m) => m.msg?.type === 'rtc' && m.msg.kind === 'local-offer');
  assert.ok(localOffer, 'host sends local-offer via relay');
  const lJoin = lGuest.sockets[0].sent.find((m) => m.type === 'join');
  lHost.sockets[0].receive({ from: 1, msg: lJoin });
  lGuest.sockets[0].receive(lHost.sockets[0].sent.find((m) => m.msg?.type === 'joined').msg);
  lGuest.sockets[0].receive(localOffer.msg);
  assert.equal(lHost.rooms.room.transport, 'local');
  assert.equal(lGuest.rooms.room.transport, 'local');
  assert.equal(lHost.rooms.relaying(), false);
  assert.equal(lHost.pcs[0].connectionState, 'closed');
  // Surviving transient relay disconnect while local peer is still alive (probe-ack),
  // and closing cleanly if the local peer vanished (tab closed/refreshed without ctrl:close)
  lHost.sockets[0].receive({ type: 'peer-close', id: 1 });
  assert.equal(lHost.rooms.room.links.has(1), true);
  lGuest.bcs[0].close(); // simulate guest tab hard-closed without sending ctrl:close
  lHost.rooms.room.links.get(1).conn.detachRelay();
  lHost.next(); // probe timeout fires -> releases dead local guest
  assert.equal(lHost.rooms.room.links.has(1), false);
  assert.equal(lHost.bcs[0].closed, true);
  lHost.rooms.close();
  lGuest.rooms.close();
  console.log('PASS: same-browser BroadcastChannel local upgrade, RTC teardown, and dead-tab cleanup');

  // 10. Relay in-flight ACK pacing prevents TCP queue buildup without blocking audio or deadlocking
  const rHost = client(), rGuest = client();
  await rHost.open(true); rHost.sockets[0].opened();
  await rGuest.open(false); rGuest.sockets[0].opened();
  rHost.sockets[0].receive({ type: 'peer-open', id: 1 });
  rGuest.sockets[0].receive({ type: 'relay-ready' });
  rHost.sockets[0].receive({ from: 1, msg: rGuest.sockets[0].sent.find((m) => m.type === 'join') });
  rGuest.sockets[0].receive(rHost.sockets[0].sent.find((m) => m.msg?.type === 'joined').msg);
  rHost.rooms.room.active = true; rGuest.rooms.room.active = true;
  rHost.time(100);
  const beforePacing = rHost.sockets[0].sent.length;
  rHost.rooms.broadcast({ type: 'state', state: { f: 1 } });
  rHost.rooms.broadcast({ type: 'state', state: { f: 2 } });
  assert.equal(rHost.rooms.congested(), true);
  rHost.rooms.broadcast({ type: 'state', state: { f: 3 } }); // dropped: 2 unacked in-flight
  assert.equal(rHost.sockets[0].sent.length, beforePacing + 2);
  rHost.rooms.broadcast({ type: 'state', state: { f: 4, audio: [['play', 'swish']] } }); // audio preserved
  assert.equal(rHost.sockets[0].sent.length, beforePacing + 3);
  // Guest receives frame 1 & 2 -> emits ack -> unblocks host
  const sent1 = rHost.sockets[0].sent[beforePacing].msg;
  const sent2 = rHost.sockets[0].sent[beforePacing + 1].msg;
  rGuest.sockets[0].receive(sent1);
  rGuest.sockets[0].receive(sent2);
  const acks = rGuest.sockets[0].sent.filter((m) => m.type === 'ack');
  assert.equal(acks.length, 2);
  rHost.sockets[0].receive({ from: 1, msg: acks[1] });
  rHost.rooms.broadcast({ type: 'state', state: { f: 5 } });
  assert.equal(rHost.sockets[0].sent.length, beforePacing + 4);
  // Timeout expiry after 600ms prevents deadlock if acks are lost
  rHost.rooms.broadcast({ type: 'state', state: { f: 6 } });
  assert.equal(rHost.rooms.congested(), true);
  rHost.time(800);
  assert.equal(rHost.rooms.congested(), false);
  rHost.rooms.close(); rGuest.rooms.close();
  console.log('PASS: relay in-flight ACK pacing caps queue, preserves audio, and expires cleanly');
})().catch((err) => { console.error(err); process.exitCode = 1; });
