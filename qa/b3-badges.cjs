const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.join(__dirname, '..');

function context(baseline = false) {
  const c = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  c.window = c; c.addEventListener = () => {}; c.navigator = { getGamepads: () => [] };
  vm.runInContext('let seed=7; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)', c);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
    let code = baseline ? cp.execFileSync('git', ['show', '7d21115:js/' + name + '.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'team3') code = code.replace('PH.T3 = {', 'PH.T3 = { send, passStep, passRead, pickTick, startPick,');
    vm.runInContext(code, c, { filename: name + '.js' });
  }
  c.PH.game.seed(7);
  return c;
}

function fixture(key, enabled) {
  const c = context(), { game: gm, T3, B5: B } = c.PH;
  const score = a => key === 'cs' ? gm.BADGE_TIER.cs(a) : B.tiersOf(a)[key] || 0;
  const best = Object.values(gm.ARCH).reduce((a, b) => score(b) > score(a) ? b : a);
  const slots = ['jokic', 'curry', 'edwards', 'giannis', 'durant', 'lebron'];
  const defender = ['dodger', 'intercept', 'anchor', 'boxout'].includes(key);
  slots[defender ? 3 : 0] = best.key;
  T3.start({ slots: slots.map(arch => ({ arch, role: 'human' })), clock: 24, replay: false });
  const G = gm.G, A = gm.t5, p = G.players[0], m = G.players[1], d = G.players[3];
  Object.assign(G, { phase: 'live', needClear: false, time: 10 });
  for (const q of G.players) Object.assign(q, { x: -7, y: 1 + q.id, z: 0, hasBall: false, action: null, stun: 0, vx: 0, vy: 0 });
  p.x = 0; p.y = 6; p.hasBall = true; m.x = 4; m.y = 8;
  Object.assign(G.ball, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 1.3 });
  for (const k of ['cs', ...B.KEYS]) B.dis[k] = k !== key || !enabled;
  B.tick(T3.badges, 0);
  return { c, gm, G, A, T3, B, p, m, d, tier: score(best), best };
}

function effect(key, enabled) {
  const f = fixture(key, enabled), { G, A, T3, B, p, m, d } = f;
  if (key === 'cs') {
    Object.assign(p, { x: 6.5, y: 10, passCatchT: G.time, passQuality: 1, catchDribbled: false });
    f.gm._dbg.startShot(p, A.zeroInp(), 'a1');
    return [p.action.V.p, p.action.V.g, p.action.t];
  }
  if (key === 'anchor') {
    Object.assign(p, { x: 0, y: 10.5, action: { type: 'layup', V: { p: 1, g: 1, c: 1, blk: 1 } } });
    Object.assign(d, { x: 0.7, y: 11 }); B.tick(T3.badges, 0);
    return [p.action.V.c, p.action.V.blk];
  }
  if (key === 'brick' || key === 'dodger') {
    p.hasBall = false; m.hasBall = true;
    Object.assign(p, { x: 0, y: 7 }); Object.assign(m, { x: 0, y: 5 });
    Object.assign(d, { x: 0.2, y: 7, vx: -3 });
    d.r.lat = d.r.def = d.tendency.help = 0.4;
    T3.startPick(p, m, d); T3.T.pick.at = G.time - 0.2;
    T3.pickTick(m);
    assert(T3.T.pick.hit, 'screen must actually connect');
    return [d.screenSpeed3, d.screenSlow3 - G.time, Math.hypot(p.vx, p.vy)];
  }
  if (key === 'chaser' || key === 'boxout') {
    Object.assign(p, { x: 0, y: 10 }); Object.assign(d, { x: 0.2, y: 11 });
    B.tick(T3.badges, 0);
    assert.equal(G.h5.rebK, B.rebK, 'shared rebound range hook is installed');
    const k = G.h5.rebK(p); let calls = 0;
    G.h5.rebK = q => { calls++; return B.rebK(q); };
    p.hasBall = false;
    Object.assign(G.ball, { state: 'loose', holder: -1, wasShot: true, x: 2, y: 10, z: 1.3, vx: 0, vy: 0, vz: 0 });
    A.step(G.players.map(() => A.zeroInp()), 0.0001);
    assert(calls > 0, 'the 3V3 shared rebound loop actually applies the badge hook');
    return [k];
  }
  if (key === 'bailout') Object.assign(p, { x: 0, y: 10 });
  if (key === 'postpm') p.post = true;
  if (key === 'breaker') {
    G.off = 1; B.tick(T3.badges, 0); G.off = 0; B.tick(T3.badges, 0);
    Object.assign(p, { x: 0, y: 1 }); Object.assign(m, { x: 0, y: 11 });
  }
  Object.assign(G.ball, { x: p.x, y: p.y });
  const value = T3.passRead(p, m).value;
  assert(T3.send(p, m)); const P = T3.T.pass;
  if (key === 'needle' || key === 'intercept') {
    Object.assign(d, { x: (P.x + P.tx) / 2 + 0.05, y: (P.y + P.ty) / 2 });
    A.rnd = () => 0.999;
    T3.passStep(P.duration / 2);
    assert(P.int, 'defender must reach the pass');
    return [B.reachK(d, p), P.int.ch];
  }
  if (key === 'bailout' || key === 'breaker') return [P.error, P.duration, value];
  assert(!p.post, 'send clears post state after the snapshot');
  T3.passStep(P.duration);
  assert.equal(G.ball.holder, m.id, 'receiver actually catches pass');
  m.action = { type: 'shot', V: { p: 1, g: 1, c: 1, blk: 1 } };
  B.tick(T3.badges, 0);
  return [m.action.V.p, m.action.V.g];
}

{
  const { c, gm, G, T3, B, p, m } = fixture('dimer', true);
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  Object.assign(c, { G });
  vm.runInContext(main.slice(main.indexOf('  const NET_STATE'), main.indexOf('  function roomState')), c);
  const snapshot = () => vm.runInContext('roomSnapshot()', c);
  assert(snapshot().players.every(q => !Object.hasOwn(q, 'b5in')), 'empty provenance stays off the wire');
  assert(T3.send(p, m));
  const provenance = m.b5in;
  assert.equal(provenance.from, p, 'real pass retains the host passer reference');
  assert.equal(p.opp.opp, p, 'fixture contains live cyclic matchup references');
  const state = snapshot();
  assert.equal(state.players.length, 6);
  assert(state.players.every(q => !Object.hasOwn(q, 'b5in')), 'guests never receive host-only badge provenance');
  assert.equal(state.players[m.id].oppId, m.opp.id, 'matchup identity is still serialized');
  assert.equal(m.b5in, provenance, 'snapshot does not mutate host badge state');
  T3.passStep(T3.T.pass.duration);
  assert.equal(G.ball.holder, m.id);
  assert.doesNotThrow(snapshot, 'snapshot after catch also serializes');
  m.action = { type: 'shot', V: { p: 1, g: 1, c: 1, blk: 1 } };
  B.tick(T3.badges, 0);
  assert(m.action.V.p > 1 && m.action.V.g > 1, 'host receiver still gets dimer after snapshots');
  assert.equal(gm.G.mode, 't3');
  console.log('PASS: online 3V3 roomSnapshot serializes during and after a real badge pass; b5in omitted, host dimer preserved.');
}

for (const key of ['cs', 'dimer', 'needle', 'bailout', 'breaker', 'postpm', 'brick', 'dodger', 'intercept', 'anchor', 'chaser', 'boxout']) {
  const zero = effect(key, false), top = effect(key, true), f = fixture(key, true);
  assert(f.tier > 0); assert.notDeepEqual(top, zero, key + ' must affect the reachable 3V3 path');
  const direction = ['needle', 'bailout', 'breaker', 'brick', 'boxout'].includes(key) ? -1 : 1;
  assert((top[0] - zero[0]) * direction > 0, key + ' must improve its primary effect');
  console.log(`PASS ${key} (${f.best.key}, tier ${f.tier}): ${zero.map(n => n.toFixed(6)).join('/')} -> ${top.map(n => n.toFixed(6)).join('/')}`);
}

{
  const { T3, B, p, m, G, gm } = fixture('bailout', true);
  assert.equal(T3.send(p, null), false);
  p.action = { type: 'shot' }; assert.equal(T3.send(p, m), false, 'no airborne bailout'); p.action = null;
  p.y = 1; assert.equal(B.passState(p, m, 'chest').bailout, 0, 'outside kick window');
  p.y = 10; assert(B.passState(p, m, 'chest').bailout > 0);
  T3.stop(); assert.equal(B.reachK(p, m), 1, 'inactive session is neutral');
  G.mode = 'cpu'; assert.equal(B.rebK(p), 1, 'solo mode is neutral');
  assert.equal(B.tier(null, 'needle'), 0);
  assert.equal(gm.BADGE_TIER.cs({ three: 0 }), 0);
  console.log('PASS: empty target, action-locked bailout, out-of-context and inactive/solo badge gates.');
}

{
  const { B, T3, p, m, G } = fixture('breaker', true);
  G.off = 1; B.tick(T3.badges, 0); G.off = 0; B.tick(T3.badges, 0);
  Object.assign(p, { x: 0, y: 1 }); Object.assign(m, { x: 0, y: 11 });
  assert(B.passState(p, m, 'chest').breaker > 0);
  m.y = 9.9; assert.equal(B.passState(p, m, 'chest').breaker, 0);
  m.y = 11; G.time += 4.01; assert.equal(B.passState(p, m, 'chest').breaker, 0);
  console.log('PASS: breaker keeps the 9m minimum and 4s possession window.');
}

{
  const { T3, G, B, p, m, d, A } = fixture('intercept', true);
  assert(T3.send(p, m)); const P = T3.T.pass;
  const reach = (0.25 + d.tendency.read * 0.37 + 0.12 * d.r.stl) * (1.1 - 0.25 * p.tendency.accuracy) * B.reachK(d, p);
  const length = Math.hypot(P.tx - P.x, P.ty - P.y), u = 0.2 + 0.9 * reach / length;
  Object.assign(d, { x: P.x + (P.tx - P.x) * u, y: P.y + (P.ty - P.y) * u });
  A.rnd = () => 0.999; T3.passStep(P.duration * 0.2);
  assert(P.int.ch > 0.5, 'first contact must use closest lane distance, not near-zero edge overlap');
  console.log('PASS: interception rolls once per defender using closest lane distance, not entry-edge overlap.');
}

{
  const { gm, G, A, p, d } = fixture('cs', true);
  Object.assign(p, { x: 6.5, y: 10, passCatchT: G.time, passQuality: 1, catchDribbled: false });
  Object.assign(d, { x: 6, y: 10.5, opp: p });
  const shot = () => { gm._dbg.startShot(p, A.zeroInp(), 'a1'); return p.action.V.g; };
  const normal = shot(); p.screenSlow3 = G.time + 1;
  assert.equal(shot(), normal, 'own previous defensive slowdown is not an offensive screen bonus');
  d.screenSlow3 = G.time + 1;
  assert(shot() > normal, 'screening the shooter defender grants the shared CS extra');
  console.log('PASS: CS screen bonus follows the screened defender, not the shooter slowdown.');
}

{
  const { T3, G, B } = fixture('cs', true);
  B.dis = {};
  for (const p of G.players) p.ctrl = 'cpu';
  for (let i = 0; i < 60 * 900 && G.phase !== 'over'; i++) T3.tick(1 / 60, {});
  assert.equal(G.phase, 'over');
  assert(Number.isFinite(G.time));
  console.log('PASS: complete 3V3 game with shared badges enabled: ' + G.score.join(':') + '.');
}

{
  const snapshots = [true, false].map(baseline => {
    const c = context(baseline), { T5, game } = c.PH;
    T5.start({ home: 'LAL', away: 'BOS', human: -1 });
    for (let i = 0; i < 3600; i++) T5.tick(1 / 60);
    return JSON.stringify({ state: T5.state(), text: game.toText(), badges: c.PH.B5.stats() });
  });
  assert.equal(snapshots[1], snapshots[0], 'seeded 5V5 simulation must match pre-change baseline');
  console.log('PASS: 3600-frame seeded 5V5 state, player stats and badge stats match baseline 7d21115 exactly.');
}
