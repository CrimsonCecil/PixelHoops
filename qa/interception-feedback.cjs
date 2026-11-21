const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');

function fixture(mode, local = 0) {
  const sounds = [], text = [];
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.navigator = { getGamepads: () => [] };
  vm.runInContext('Math.random = () => 0.25;', ctx);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', 'b5', 'team3', 'team5', 'render5']) {
    let code = source(name);
    if (name === 'game') code = code.replace('begin: t5begin,', 'qaFx: fxUpdate, begin: t5begin,');
    if (name === 'team3') code = code.replace('PH.T3 = {', 'PH.T3 = { qaSend: send, qaPass: passStep,');
    if (name === 'team5') code = code.replace('doPass: doPass,', 'qaPass: passUpdate, doPass: doPass,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const canvas = () => ({ getContext: () => new Proxy({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: s => ({ width: s.length * 12 }),
    fillText: (s, x, y, max) => text.push({ s, x, y, max })
  }, { get: (o, k) => o[k] ?? (() => {}) }) });
  ctx.document = { createElement: canvas };
  const PH = ctx.PH, game = PH.game, G = game.G;
  PH.render.init(canvas());
  PH.audio = { play: s => sounds.push(s), vo() {}, voPreload() {} };
  game.seed(7);
  if (mode === 3) {
    const slots = ['curry', 'edwards', 'jokic', 'lebron', 'durant', 'giannis'].map((arch, i) => ({ arch, role: i === 0 || i === 3 ? 'human' : 'cpu' }));
    PH.T3.start({ slots, local: local < 0 ? -1 : local * 3, target: 21, clock: 24, replay: false });
  } else PH.T5.start({ home: 'LAL', away: 'BOS', human: local });
  return { PH, G, game, sounds, text };
}

function roomHarness(f, slot, role) {
  const main = source('main');
  const ctx = vm.createContext({ G: f.G, GM: f.game, PH: f.PH, localSlot: slot, room: { role, active: true, links: new Map([[3, true]]) } });
  vm.runInContext(main.slice(main.indexOf('  const NET_STATE ='), main.indexOf('  function roomAction(')), ctx);
  vm.runInContext('resetRoomAudio()', ctx);
  return {
    snapshot: () => vm.runInContext('roomSnapshot()', ctx),
    receive: state => { ctx.packet = state == null ? state : JSON.parse(JSON.stringify(state)); vm.runInContext('roomState(packet)', ctx); }
  };
}

function networkPerspectives(host, room, hostTeam, stealing) {
  const packet = room.snapshot();
  assert.equal(JSON.stringify(packet.audio.filter(e => e[0] === 'intercept')), JSON.stringify([['intercept', stealing]]));
  assert(!packet.audio.some(e => e[0] === 'play' && ['interceptGood', 'interceptBad', 'steal'].includes(e[1])), 'Never relay host-resolved interception sound');
  for (const local of [0, 1, -1]) {
    const guest = fixture(3, local), client = roomHarness(guest, local < 0 ? -1 : local * 3, 'guest');
    client.receive(null); client.receive({ players: [] }); assert.equal(guest.sounds.length, 0);
    client.receive(packet);
    const expected = local < 0 ? { col: '#5ee0ff', sound: 'steal' } : local === stealing ? { col: '#7dff8a', sound: 'interceptGood' } : { col: '#ff6b5e', sound: 'interceptBad' };
    const F = guest.G.fx;
    assert.equal(guest.sounds.filter(s => ['steal', 'interceptGood', 'interceptBad'].includes(s)).join(), expected.sound);
    assert.equal(F.possession.team, stealing); assert.equal(F.possession.col, expected.col);
    assert.equal(F.possession.text, '抢断！攻防转换'); assert.equal(F.possession.t, host.G.fx.possession.t);
    assert.equal(F.flashCol, expected.col);
    for (const q of [...F.parts, ...F.rings]) assert.equal(q.col, q.interceptTeam == null ? '#ffffff' : expected.col);
    assert.equal(guest.G.floats.find(f => f.interceptTeam === stealing).color, expected.col);
    assert.equal(guest.G.players.find(p => p.ring)?.tm ?? -1, local);
    guest.sounds.length = 0;
    client.receive({ ...packet, audio: [] });
    assert.equal(guest.G.fx.possession.col, expected.col); assert.equal(guest.sounds.length, 0, 'State refresh must not replay the cue');
  }
  assert.equal(room.snapshot().audio.length, 0, 'Neutral event drains once');
  assert.equal(host.G.fx.possession.col, stealing === hostTeam ? '#7dff8a' : '#ff6b5e', 'Guest recoloring must not mutate host state');
  console.log(`PASS online 3V3: host=${hostTeam} interceptor=${stealing}; same-team guest, opposing guest and spectator resolve their own sound and all effect colors`);
}

function interception(mode, local, stealing, result = 'int', network = false) {
  const f = fixture(mode, local), { PH, G, game, sounds } = f;
  const room = network ? roomHarness(f, local * 3, 'host') : null;
  const api = mode === 3 ? PH.T3 : PH.T5, T = api.T;
  const fromTeam = 1 - stealing, from = G.players.find(p => p.tm === fromTeam);
  const to = G.players.find(p => p.tm === fromTeam && p !== from), d = G.players.find(p => p.tm === stealing);
  Object.assign(G, { phase: 'live', off: fromTeam }); Object.assign(T, { phase: 'live', off: fromTeam });
  for (const p of G.players) Object.assign(p, { x: -7, y: -12, hasBall: false, stun: 0, action: null });
  Object.assign(from, { x: -3, y: 4, face: 0, hasBall: true });
  Object.assign(to, { x: 3, y: 4, vx: 0, vy: 0, speed: 0 });
  Object.assign(d, { x: 0, y: 4 });
  Object.assign(G.ball, { state: 'held', holder: from.id, x: -3, y: 4, z: 1.2, dead: false });
  sounds.length = 0;
  let spot;
  const original = game.t5.passIntercept;
  game.t5.passIntercept = (...args) => { spot = { x: G.ball.x, y: G.ball.y }; return original(...args); };
  if (mode === 3) {
    assert(api.qaSend(from, to));
    if (result === 'miss') d.stun = 1;
    api.qaPass(T.pass.duration / 2);
  } else {
    assert(api.doPass(from, to, 'chest'));
    const P = T.ps;
    api.qaPass(P.windup);
    P.T = 0.02; P.int = { d, u: 0.5, ch: 1, done: false };
    PH.T5.TV.t5_int_grab = result === 'defl' ? 0 : 10;
    PH.T5.TV.t5_int_deflD = 10; PH.T5.TV.t5_int_defl = 1;
    if (result === 'miss') d.stun = 1;
    api.qaPass(0.010001);
  }
  if (result !== 'int') {
    assert.equal(G.fx.possession, undefined);
    assert(!sounds.some(s => s.startsWith('intercept')));
    assert.equal(G.stats[d.id].stl, 0);
    if (result === 'defl') assert(sounds.includes('steal'), 'Deflection keeps its existing sound');
    return;
  }
  assert.equal(G.ball.holder, d.id); assert.equal(G.off, stealing);
  assert.equal(G.stats[d.id].stl, 1); assert.equal(G.stats[from.id].tov, 1);
  assert.equal(G.fx.possession.text, '抢断！攻防转换');
  assert(G.fx.possession.sub.includes(d.arch.name));
  const teamName = mode === 3 ? game.TEAMS[stealing].name : T.tm[stealing].name;
  assert(G.fx.possession.sub.includes(teamName));
  assert.equal(G.fx.possession.dur, 1.35);
  assert(G.fx.flash >= 0.12); assert(G.fx.parts.length >= 24); assert(G.fx.rings.length >= 2);
  const sign = mode === 5 ? -1 : 1;
  assert(G.fx.rings.some(r => r.R >= 2.4 && Math.abs(r.x - sign * spot.x) < 1e-9 && Math.abs(r.y - sign * spot.y) < 1e-9), 'Effect follows the interception point, including possession flip');
  assert.equal(G.floats.filter(x => x.text === '抢断传球').length, 1, 'Existing float remains visible in simple feedback');
  const expected = local < 0 ? 'steal' : local === stealing ? 'interceptGood' : 'interceptBad';
  assert.equal(sounds.filter(s => ['interceptGood', 'interceptBad', 'steal'].includes(s)).join(), expected);
  if (network) networkPerspectives(f, room, local, stealing);

  for (const camera of mode === 3 ? ['half-court'] : ['broadcast', '2k']) {
    f.text.length = 0;
    if (mode === 3) PH.render.render(G);
    else { T.cam.preset = camera; PH.render5.render(T, 1 / 60); }
    const rows = f.text.filter(q => q.s === G.fx.possession.text || q.s === G.fx.possession.sub);
    assert.equal(rows.length, 2, `${camera}: exactly one screen-space prompt`);
    for (const row of rows) { assert.equal(row.x, PH.render.W / 2); assert(row.y > 0 && row.y < PH.render.H - 12); assert(row.max <= PH.render.W - 24); }
  }
  for (let i = 0; i < 78; i++) game.t5.qaFx(1 / 60);
  assert(G.fx.possession, 'Prompt remains for at least 1.3 seconds');
  for (let i = 0; i < 4; i++) game.t5.qaFx(1 / 60);
  assert.equal(G.fx.possession, null, 'Prompt expires after 1.35 seconds');
  f.text.length = 0; PH.render.drawPossession(G); assert.equal(f.text.length, 0);
  console.log(`PASS ${mode}V${mode}: local=${local < 0 ? 'spectator' : local} interceptor=${stealing} effect + Chinese prompt + ${expected}; cameras and 1.35s expiry`);
}

for (const mode of [3, 5]) {
  for (const local of [0, 1, -1]) for (const stealing of [0, 1]) interception(mode, local, stealing);
  interception(mode, 0, 1, 'miss');
}
interception(5, 0, 1, 'defl');
console.log('PASS stunned defenders do not trigger interception feedback; 5V5 deflections retain existing feedback.');
for (const host of [0, 1]) for (const stealing of [0, 1]) interception(3, host, stealing, 'int', true);

{
  const frequencies = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain: parameter(), frequency: parameter(), Q: parameter(), connect() { return this; }, start() {}, stop() {} });
  class AudioContext {
    constructor() { this.currentTime = 1; this.sampleRate = 48000; this.destination = node(); }
    createGain() { return node(); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { const n = node(); n.frequency.setValueAtTime = f => frequencies.push(f); return n; }
  }
  const ctx = vm.createContext({ window: { AudioContext }, performance: { now: () => 0 }, fetch: async () => ({ ok: false }) });
  vm.runInContext(source('audio'), ctx);
  const audio = ctx.window.PH.audio;
  audio.play('interceptGood'); assert.equal(frequencies.length, 4);
  assert(frequencies.every((f, i) => !i || f > frequencies[i - 1]));
  frequencies.length = 0; audio.play('interceptBad'); assert.equal(frequencies.length, 3);
  assert(frequencies.every((f, i) => !i || f < frequencies[i - 1]));
  console.log('PASS procedural audio: rewarding ascending four-note cue vs negative descending three-note cue.');
}
