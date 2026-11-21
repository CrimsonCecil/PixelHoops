const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pads = [];
const ctx = vm.createContext({ console, navigator: { getGamepads: () => pads }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {} });
ctx.window = ctx;
vm.runInContext('Math.random = () => 0.5;', ctx);
for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.postQA = { updatePlayer, aiInput, postFollow, postMoveOf, MKF }; PH.game = {');
  if (name === 'team5') source = source.replace('doPass: doPass,', 'doPass: doPass, qaHumanInp: humanInp, qaStick: stick,');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, T5: team, TUNE: tune, input, postQA: qa } = ctx.PH;
const { G, _dbg: dbg } = gm;
const dt = 1 / 120, hoop = ctx.PH.render.HOOP;
const zero = () => gm.t5.zeroInp();
function fixture(mode = '2p', distance = 5.2) {
  if (team.T.on) team.stop();
  if (G.mode === 't5') gm.t5.end();
  tune.load({ l1_stamRegen: 0 });
  gm.seed(7);
  if (mode === 't5') team.start({ home: 'LAL', away: 'BOS', human: 0 });
  else gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'gobert', target: 999 });
  const p = mode === 't5' ? team.T.ctl : G.players[0];
  const d = G.players.find(q => q !== p && (mode !== 't5' || q.tm !== p.tm));
  Object.assign(G, { phase: 'live', needClear: false, time: 10, off: p.tm || 0, shotClock: 20 });
  for (const q of G.players) Object.assign(q, { hasBall: false, off: q !== p && q !== d });
  Object.assign(p, { x: 0, y: hoop.y - distance, z: 0, face: -Math.PI / 2, vx: 0, vy: 0, speed: 0, action: null, post: true, hasBall: true, opp: d, stam: 100, cd: 0, postMove: null, postFaceLock: false });
  Object.assign(p.r, { hook: 0.8, sig: { ...p.r.sig, hook: 0.8, fade: 0.8 }, post: 0.9, mid: 0.8, fade: 0.8, close: 0.9 });
  p.sk.ready = false;
  Object.assign(d, { x: 0, y: p.y + 1.1, z: 0, stun: 0, action: null, opp: p, off: false, vx: 0, vy: -2 });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  if (mode === 't5') Object.assign(team.T, { phase: 'live', icon: false, qPass: null, R: {}, E: {} });
  return { p, d };
}
function step(p, inp = {}, n = 1) {
  for (let i = 0; i < n; i++) { G.time += dt; qa.updatePlayer(p, { ...zero(), ...inp }, dt); }
}
function adapted(p, x, y, shot = false, shim = false) {
  const ax = team.qaStick(1, 0), ay = team.qaStick(0, 1);
  const sx = x * ax.x + y * ax.y, sy = x * ay.x + y * ay.y;
  team.T.R = { LT: true, X: shot, hesi: shim, lx: shot ? sx : 0, ly: shot ? sy : 0, rx: shot ? 0 : sx, ry: shot ? 0 : sy };
  team.T.E = { X: shot };
  return team.qaHumanInp(p);
}

for (const mode of ['2p', 't5']) {
  for (const [x, y, expected] of [[1, 0, 'postspin'], [-1, 0, 'postspin'], [0.7, 0.7, 'postdrop'], [-0.7, 0.7, 'postdrop'], [0, 1, 'postdrop'], [0, -1, 'postface'], [0, 0, 'postshim']]) {
    const { p } = fixture(mode);
    const inp = mode === 't5' ? adapted(p, x, y, false, expected === 'postshim') : { post: true, a3: true, dx: x, dy: y };
    step(p, inp);
    assert.equal(p.action?.kind, expected, `${mode} move ${x},${y}`);
    assert(p.stam < 100 && Number.isFinite(p.action.sp));
    assert(qa.MKF[expected].length >= 2);
  }
  for (const [x, y, distance, hook, expected] of [[0, -1, 5.2, 0.8, 'postfade'], [0.8, -0.8, 5.2, 0.8, 'postfade1'], [0, 1, 5.2, 0.8, 'postfront'], [0, 1, 4, 0.2, 'postfront'], [1, 0, 4, 0.8, 'hook'], [0, 0, 5.2, 0.8, 'turn']]) {
    const { p } = fixture(mode, distance);
    p.r.hook = hook;
    step(p, mode === 't5' ? adapted(p, x, y, true) : { post: true, a1: true, mx: x, my: y });
    assert.equal(p.action?.v, expected, `${mode} shot ${x},${y}`);
  }
  for (const [kind, distance, bite, expected] of [['postspin', 5, false, 'spinfade'], ['postshim', 5, true, 'shimshot'], ['postdrop', 3, false, 'drophook']]) {
    const { p } = fixture(mode, distance);
    p.post = false; p.postMove = { kind, t: G.time, bite };
    step(p, mode === 't5' ? adapted(p, 0, 0, true) : { a1: true });
    assert.equal(p.action?.v, expected, `${mode} ${kind} follow-up`);
  }
}
console.log('PASS post inputs: spins, drops, face-up, shimmy, six post shots and three follow-ups in 1V1 and 5V5 adapter');

for (const kind of ['postdrop', 'postface', 'postshim']) {
  const { p, d } = fixture();
  const y0 = p.y;
  d.off = true;
  dbg.startMove(p, { ...zero(), dx: 0.7, dy: 0.7 }, kind);
  const duration = p.action.T;
  step(p, kind === 'postface' ? { post: true } : {}, Math.ceil(duration / dt) + 1);
  if (kind === 'postdrop') { assert(p.y > y0 + 0.1 && Math.abs(p.x) > 0.1); assert(Math.sin(p.face) > 0.9); }
  if (kind === 'postface') { assert(p.y < y0 - 0.1); assert(Math.sin(p.face) > 0.9); step(p, { post: true }); assert.equal(p.post, false); step(p); step(p, { post: true }); assert.equal(p.post, true); }
  if (kind === 'postshim') assert(Math.hypot(p.x, p.y - y0) < 0.01);
}
let shimBites = 0, dropBeats = 0;
for (let seed = 1; seed <= 80; seed++) {
  for (const kind of ['postshim', 'postdrop']) {
    const { p, d } = fixture(); gm.seed(seed * 31);
    dbg.startMove(p, { ...zero(), dx: 1 }, kind);
    if (d.stun > 0) { if (kind === 'postshim') { shimBites++; assert(p.postMove.bite); } else { dropBeats++; assert(d.seal > G.time); } }
  }
}
assert(shimBites > 0 && shimBites < 80 && dropBeats > 0);
console.log(`PASS post effects: pivot/facing, face-up separation and re-entry, stationary shimmy; shim bites=${shimBites}/80 drop seals=${dropBeats}/80`);

for (const state of ['empty', 'stunned', 'frozen', 'exhausted']) {
  const { p } = fixture();
  if (state === 'empty') { p.hasBall = false; G.ball.state = 'loose'; }
  if (state === 'stunned') p.stun = 1;
  if (state === 'frozen') G.phase = 'over';
  if (state === 'exhausted') p.stam = 0;
  step(p, { post: true, a3: true, dx: 1 });
  assert(!p.action || !['postspin', 'postdrop', 'postshim', 'postface'].includes(p.action.kind), state);
}
for (const [kind, bite] of [['postshim', false], ['postface', true]]) {
  const { p } = fixture(); p.post = false; p.postAt = -9; p.postMove = { kind, bite, t: G.time };
  dbg.startShot(p, zero()); assert.notEqual(p.action.v, 'shimshot');
}
{
  const { p } = fixture(); p.post = false; p.postAt = -9; p.postMove = { kind: 'postspin', t: G.time - gm.K.poFollow - 0.1 };
  dbg.startShot(p, zero()); assert.equal(p.action.v, 'set');
}
for (const [x, y, expected] of [[1, 0, 'cross'], [0, -1, 'stepback']]) {
  const { p, d } = fixture(); p.post = false; p.speed = 2; p.arch = { ...p.arch, key: 'qa' }; d.off = true;
  step(p, { a3: true, dx: x, dy: y }); assert.equal(p.action.kind, expected);
}
console.log('PASS post guards: no ball, stun, dead play, no stamina, failed/expired follow-up; non-post cross and stepback unchanged');

function probability(v, contest = false) {
  const { p, d } = fixture(); p.post = false; d.off = !contest;
  p.r.badges = []; p.arch = { ...p.arch, _bt: {} };
  dbg.startShot(p, zero(), 'a1', v); p.action.skill = null;
  gm.seed(73); dbg.releaseShot(p, 0.4, 'shot');
  return G.ball.shot?.info.prob;
}
const sv = gm._qa.SV;
assert(sv.postfade1.c < sv.postfade.c && sv.postfade1.p < sv.postfade.p);
assert(sv.shimshot.c < sv.turn.c && sv.postfront.c < sv.turn.c);
assert(probability('postfade1') < probability('postfade'));
assert(probability('shimshot') > probability('turn'));
for (const v of ['postfade1', 'postfront', 'spinfade', 'shimshot', 'drophook']) {
  const prob = probability(v); assert(Number.isFinite(prob) && prob > 0 && prob <= 1, v);
  const key = 'l1_poV_' + v + '_p', before = sv[v].p;
  tune.set(key, before * 0.5); assert.equal(sv[v].p, before * 0.5);
}
{
  const { p } = fixture(); dbg.startShot(p, zero(), 'a1', 'postfront'); const fast = p.action.ideal;
  dbg.startShot(p, zero(), 'a1', 'turn'); assert(fast < p.action.ideal);
}
console.log('PASS post shots: finite probabilities, one-leg risk/reward, shimmy advantage, front release speed and live l1 tuning');

const variants = new Set();
for (let seed = 1; seed <= 160; seed++) {
  const { p } = fixture();
  p.ctrl = 'cpu'; G.mode = 'cpu';
  Object.assign(p.ai, { plan: 'post', postT: 1.2, t: 2, su: null, cb: null, iso: null, om: null, call: null });
  tune.set('l1_aiPoMv', 5); tune.set('l1_aiPoMvT', 0.1);
  gm.seed(seed * 101);
  const o = qa.aiInput(p, 0.5);
  if (o.a3 && o.post) {
    step(p, o);
    if (p.action?.kind) variants.add(p.action.kind);
  }
}
assert(variants.has('postspin') && variants.has('postdrop') && variants.has('postshim') && variants.has('postface'), [...variants].join(','));
console.log('PASS seeded AI post possessions choose ' + [...variants].sort().join(', '));
