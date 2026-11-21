const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pads = [];
const ctx = vm.createContext({ console, navigator: { getGamepads: () => pads }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {} });
ctx.window = ctx;
vm.runInContext('Math.random = () => 0.5;', ctx);
for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'render') source = source.replace('PH.rig = rig;', 'PH.postVisualRig = visualRig; PH.rig = rig;');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.postQA = { updatePlayer, aiInput, postFollow, postMoveOf, poseTarget, MKF }; PH.game = {');
  if (name === 'team5') source = source.replace('doPass: doPass,', 'doPass: doPass, qaHumanInp: humanInp, qaStick: stick,');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, T5: team, TUNE: tune, input, postQA: qa } = ctx.PH;
const { G, _dbg: dbg } = gm;
const dt = 1 / 120, hoop = ctx.PH.render.HOOP;
const zero = () => gm.t5.zeroInp();
function fixture(mode = '2p', distance = 5.2, arch = 'luka') {
  if (team.T.on) team.stop();
  if (G.mode === 't5') gm.t5.end();
  tune.load({ l1_stamRegen: 0 });
  gm.seed(7);
  if (mode === 't5') team.start({ home: arch === 'embiid' ? 'PHI' : arch === 'jokic' ? 'DEN' : 'LAL', away: arch === 'luka' ? 'BOS' : 'MIN', human: 0 });
  else gm.newGame({ mode: '2p', arch0: arch, arch1: 'gobert', target: 999 });
  const p = mode === 't5' ? arch === 'luka' ? team.T.ctl : G.players.find(q => q.arch.key === arch) : G.players[0];
  const d = G.players.find(q => q !== p && q.arch.key === 'gobert' && (mode !== 't5' || q.tm !== p.tm)) || G.players.find(q => q !== p && (mode !== 't5' || q.tm !== p.tm));
  if (mode === 't5' && arch !== 'luka') team.setCtl(p, 'auto');
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
    if (inp.rs) step(p, adapted(p, 0, 0));
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

for (const mode of ['2p', 't5']) {
  for (const next of ['repost', 'hook', 'shot', 'finish']) {
    const { p, d } = fixture(mode, next === 'shot' ? 5.2 : 3);
    d.off = true;
    step(p, { post: true, a3: true, dx: 0.7, dy: 0.7 });
    assert.equal(p.action.kind, 'postdrop');
    step(p, { post: true }, Math.ceil(p.action.T / dt) + 1 + Math.ceil(0.3 / dt));
    assert.equal(p.post, false, `${mode} held post after drop`);
    const hx = hoop.x - p.x, hy = hoop.y - p.y;
    assert((Math.cos(p.face) * hx + Math.sin(p.face) * hy) / Math.hypot(hx, hy) > 0.99, `${mode} drop stays hoop-facing`);
    if (next === 'repost') { step(p); step(p, { post: true }); assert.equal(p.post, true); }
    if (next === 'hook') { step(p, { post: true, a1: true }); assert.equal(p.action.v, 'drophook'); }
    if (next === 'shot') { step(p, { post: true }, Math.ceil(gm.K.poFollow / dt) + 1); step(p, { post: true, a1: true }); assert.equal(p.action.v, 'set'); }
    if (next === 'finish') { step(p, { post: true, a2: true }); assert(['layup', 'dunk'].includes(p.action?.type)); }
  }
}
console.log('PASS postdrop held post: hoop-facing and not posting after 0.3s; release/repress, drop hook, normal shot and finish in 1V1 and 5V5');

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

{
  const { p } = fixture();
  dbg.startShot(p, zero(), 'a1', 'postfade1');
  p.anim = 'shoot'; p.animT = 0;
  const gather = qa.poseTarget(p);
  p.animT = p.action.ideal * 0.7;
  const air = qa.poseTarget(p);
  assert(gather.lB < air.lB && air.lB > air.rB + 0.8 && air.lean < 0);
  dbg.startShot(p, zero(), 'a1', 'shimshot');
  p.animT = p.action.jT * 0.5;
  const fake = qa.poseTarget(p);
  p.animT = p.action.ideal;
  const release = qa.poseTarget(p);
  assert(Math.abs(fake.tilt) > 0.15 && Math.abs(release.tilt) < 0.01);
}
console.log('PASS post poses: one-leg lift builds after gather; shimmy shoulder fake settles before release');

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

let armFrames = 0, maxArmRatio = 0;
const distance3 = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function checkArms(p) {
  const before = JSON.stringify(p.pose), natural = ctx.PH.rig(p, p.pose, false, p.col.body), k = ctx.PH.postVisualRig(p);
  for (const side of ['L', 'R']) {
    const upper = distance3(natural['sh' + side], natural['el' + side]), fore = distance3(natural['el' + side], natural['hand' + side]);
    const ratio = distance3(k['sh' + side], k['hand' + side]) / (upper + fore);
    assert(Number.isFinite(ratio) && ratio <= 1 + 1e-9, `${G.mode} ${p.arch.key} shoulder-hand reach ${ratio}`);
    assert(Math.abs(distance3(k['sh' + side], k['el' + side]) - upper) < 1e-9, 'Upper arm must retain its posed length');
    assert(Math.abs(distance3(k['el' + side], k['hand' + side]) - fore) < 1e-9, 'Forearm must retain its posed length');
    maxArmRatio = Math.max(maxArmRatio, ratio);
  }
  assert.equal(JSON.stringify(p.pose), before, 'Visual IK must not mutate gameplay pose or hand targets');
  armFrames++;
}
for (const mode of ['2p', 't5']) for (const arch of ['embiid', 'jokic']) {
  for (const kind of ['plain', 'postspin', 'postdrop', 'postface', 'postshim', 'postfade1', 'postfront', 'spinfade', 'shimshot', 'drophook']) {
    const { p, d } = fixture(mode, kind === 'drophook' ? 3 : 5.2, arch);
    assert.equal(d.arch.key, 'gobert');
    for (const q of [p, d]) delete q.pose.passHands;
    if (kind !== 'plain') {
      const inp = { ...zero(), post: true, dx: 0.7, dy: 0.7 };
      if (['postspin', 'postdrop', 'postface', 'postshim'].includes(kind)) dbg.startMove(p, inp, kind);
      else dbg.startShot(p, inp, 'a1', kind);
    }
    for (let frame = 0; frame < 180; frame++) {
      step(p, { post: true, a1: true, my: frame < 60 ? 0.4 : 0 });
      qa.updatePlayer(d, qa.aiInput(d, dt), dt);
      checkArms(p); checkArms(d);
    }
  }
  const { p, d } = fixture(mode, 4, arch);
  for (const q of [p, d]) {
    delete q.pose.passHands; q.grip = null; q.hasBall = false; q.armS = null; q.anim = 'idle';
    assert.deepEqual(ctx.PH.postVisualRig(q), ctx.PH.rig(q, q.pose, false, q.col.body), 'No hand target leaves the natural rig unchanged');
    const k = ctx.PH.rig(q);
    q.pose.passHands = { L: k.handL.slice(), R: k.handR.slice(), follow: 0 };
    checkArms(q);
    q.pose.passHands = { L: [q.x + 20, q.y - 20, -20], R: [q.x - 20, q.y + 20, -20], follow: 0 };
    const gameplay = JSON.stringify(ctx.PH.rig(q));
    checkArms(q);
    assert.equal(JSON.stringify(ctx.PH.rig(q)), gameplay, 'Unreachable visual targets must not change gameplay contact points');
  }
}
console.log(`PASS post arm reach: ${armFrames} player-frames in 1V1 and 5V5, Embiid/Jokic vs Gobert, max shoulder-hand/reach=${maxArmRatio.toFixed(6)}; segment lengths, empty/reachable/stale targets and gameplay rig preserved`);

function gamepadStep(mode, p, options = {}, n = 1) {
  const { x = 0, y = 0, mx = 0, my = 0, post = true, shot = false } = options;
  const axis = (x, y) => {
    if (mode !== 't5') return [x, -y];
    const a = team.qaStick(1, 0), b = team.qaStick(0, 1);
    return [x * a.x + y * a.y, -(x * b.x + y * b.y)];
  };
  pads[0] = { connected: true, index: 0, axes: [...axis(mx, my), ...axis(x, y)], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 6 && post || i === 2 && shot })) };
  for (let i = 0; i < n; i++) {
    let inp;
    if (mode === 't5') { const X = team.T.R.X; team.T.R = input.read5(); team.T.E = { X: shot && !X }; inp = team.qaHumanInp(p); }
    else inp = input.read(0, true, true);
    step(p, inp); input.endTick();
  }
}
const holdFrames = () => Math.ceil(gm.K.rsHold / dt) + 2;
for (const mode of ['2p', 't5']) for (const early of [false, true]) {
  const { p } = fixture(mode);
  gamepadStep(mode, p, { x: 1, shot: true });
  const a = p.action;
  gamepadStep(mode, p, { x: 1, shot: true }, early ? 8 : Math.floor(a.ideal / dt) - 1);
  gamepadStep(mode, p, { x: 1 });
  if (early) {
    assert(p.action.postFake && p.post && p.hasBall, `${mode} early button release fakes with stick deflected`);
    gamepadStep(mode, p, { x: 1 }, holdFrames() + 45);
    assert(!p.action && p.hasBall, 'The consumed stick does not start another shot after the button fake');
  } else assert(a.released, `${mode} button release must fire at the timed point despite a held right stick`);
}
console.log('PASS post button ownership: early release fakes without a stick-driven follow-up; timed release fires despite deflected stick in 1V1/5V5');
for (const mode of ['2p', 't5']) {
  for (const [x, y, move, shot] of [[1, 0, 'postspin', 'turn'], [0.7, 0.7, 'postdrop', 'postfront'], [0, -1, 'postface', 'postfade'], [1, -0.7, 'postspin', 'postfade1']]) {
    let { p } = fixture(mode);
    gamepadStep(mode, p, { x, y }, 5);
    assert.equal(p.action, null, 'A pending post flick must not move immediately');
    gamepadStep(mode, p);
    assert.equal(p.action?.kind, move, `${mode} flick ${x},${y}`);
    ({ p } = fixture(mode));
    gamepadStep(mode, p, { x, y }, holdFrames());
    assert.equal(p.action?.v, shot, `${mode} hold ${x},${y}`);
    const a = p.action;
    gamepadStep(mode, p, { x, y }, Math.max(1, Math.floor((a.ideal - a.t) / dt) - 1));
    assert(!a.released && a.meter.v > 0, 'Holding the stick holds the ordinary shot meter');
    gamepadStep(mode, p);
    assert(a.released && G.ball.state === 'shot', 'Stick release fires the committed shot');
  }
  for (const [kind, distance, bite, expected] of [['postspin', 5, false, 'spinfade'], ['postshim', 5, true, 'shimshot'], ['postdrop', 3, false, 'drophook']]) {
    const { p } = fixture(mode, distance);
    p.post = false; p.postFaceLock = kind === 'postdrop'; p.postMove = { kind, t: G.time - gm.K.poFollow + 0.1, side: -1, bite };
    gamepadStep(mode, p, { x: 1 }, holdFrames());
    assert.equal(p.action?.v, expected, `${mode} hold began inside ${kind} follow-up window`);
  }
  { const { p } = fixture(mode, 3); gamepadStep(mode, p, { y: 1 }, holdFrames()); assert.equal(p.action.v, 'hook'); }
  for (const x of [-1, 1]) {
    const { p } = fixture(mode);
    gamepadStep(mode, p, { x: -x, mx: x, shot: true });
    assert.equal(p.action?.v, 'turn', 'Button post shots still use movement rather than right-stick input');
  }
  for (const my of [-1, 1]) {
    const { p } = fixture(mode);
    gamepadStep(mode, p, { my, shot: true });
    assert.equal(p.action?.v, my < 0 ? 'postfade' : 'postfront');
  }
  const { p } = fixture(mode);
  const ids = [], poses = [];
  for (const x of [1, -1, 1, -1]) {
    gamepadStep(mode, p, { x }, holdFrames());
    assert.equal(p.action.type, 'shot');
    const stamina = p.stam;
    gamepadStep(mode, p);
    const fake = p.action;
    assert(fake.postFake && p.post && p.hasBall && p.z === 0 && G.ball.state === 'held', 'Early release remains in a grounded post fake with the ball');
    assert.equal(p.stam, stamina, 'Post fakes retain the default free-fake convention');
    ids.push(fake.fakeId);
    fake.t = fake.T / 2; p.animT = fake.t;
    poses.push(JSON.stringify(qa.poseTarget(p)));
    gamepadStep(mode, p, {}, Math.ceil(fake.T / dt) + 2);
  }
  for (let i = 1; i < ids.length; i++) { assert.notEqual(ids[i], ids[i - 1]); assert.notEqual(poses[i], poses[i - 1]); }
  gamepadStep(mode, p, { shot: true }); gamepadStep(mode, p);
  assert(p.action.postFake && p.post, 'Shoot-button early release also stays posting');
  gamepadStep(mode, p, {}, 45);
  gamepadStep(mode, p, { y: -1 }, holdFrames() + 45);
  const real = p.action; gamepadStep(mode, p);
  assert(real.released, 'Full hold after chained post fakes still releases a real shot');

  for (const state of ['stun', 'noBall', 'dead', 'noStamina', 'cancel', 'disconnect']) {
    const { p } = fixture(mode);
    gamepadStep(mode, p, { x: 1 }, 4);
    if (state === 'stun') p.stun = 3;
    if (state === 'noBall') p.hasBall = false;
    if (state === 'dead') G.ball.dead = true;
    if (state === 'noStamina') p.stam = 0;
    if (state === 'cancel') gamepadStep(mode, p, { x: 1, post: false }, 2);
    if (state === 'disconnect') { pads.length = 0; step(p); }
    gamepadStep(mode, p);
    assert(!p.action || !['move', 'shot'].includes(p.action.type), `${mode} ${state} cancels pending post gesture`);
  }
  {
    const { p } = fixture(mode); p.post = false; p.opp.off = true;
    gamepadStep(mode, p, { x: 1, post: false });
    assert.equal(p.action, null, 'PR81 shared non-post stick waits for flick or hold');
    gamepadStep(mode, p, { post: false });
    assert.equal(p.action.type, 'move', 'PR81 shared non-post flick triggers its move on release');
    assert(!p.rsGesture);
  }
  {
    const { p } = fixture(mode); p.post = false; p.opp.off = true;
    gamepadStep(mode, p, { x: 1, post: false }, holdFrames());
    assert.equal(p.action.type, 'shot', 'PR81 shared non-post hold starts a shot');
  }
  {
    const { p } = fixture(mode); p.post = false;
    gamepadStep(mode, p, { shot: true, post: false }); gamepadStep(mode, p, { post: false });
    assert.equal(p.action.type, 'fake'); assert(!p.action.postFake && !p.post && p.uuFake, 'Non-post pump fake and up-and-under window stay unchanged');
  }
}
pads.length = 0;
console.log('PASS post stick: shared PR81 flick/hold, directional shots, held meter and release, hook and expiring follow-ups in 1V1/5V5; movement+shoot preserved and shared non-post gestures');
console.log('PASS chained post fakes: early stick/button release retains posting and ball, alternating ids/poses, free stamina, real-shot follow-up and invalid-state cancellation');

{
  const { p } = fixture(); tune.set('l1_rsHold', 0.4);
  gamepadStep('2p', p, { x: 1 }, 30); assert.equal(p.action, null);
  gamepadStep('2p', p); assert.equal(p.action.kind, 'postspin');
}
let cpuFakes = 0;
for (let seed = 1; seed <= 80; seed++) {
  const { p } = fixture('2p', 4); p.ctrl = 'cpu'; G.mode = 'cpu';
  Object.assign(p.ai, { plan: 'post', postT: 20, t: 2, su: null, cb: null, iso: null, om: null, call: null });
  gm.seed(seed * 101);
  const out = qa.aiInput(p, dt);
  if (out.a1 && p.ai.fakeNext) cpuFakes++;
}
assert(cpuFakes > 0 && cpuFakes < 80);
console.log(`PASS live l1_rsHold threshold and seeded post AI fakes=${cpuFakes}/80`);

for (const bite of [0, 1]) {
  const { p, d } = fixture();
  tune.set('l1_poFakeBite', bite); tune.set('l1_poFakeCost', 2);
  step(p, { a1: true, post: true }); const before = p.stam;
  step(p, { post: true });
  assert(p.action.postFake && p.stam < before);
  assert.equal(!!d.ai.willJump, !!bite);
}
{
  const { p } = fixture(); tune.set('l1_poFakeCommit', 0);
  step(p, { a1: true, post: true }); const a = p.action; step(p, { post: true });
  assert(a.released && !p.action.postFake, 'The fake commit window is live tunable');
}
{
  const { p } = fixture(); p.ctrl = 'cpu'; G.mode = 'cpu'; p.ai.fakeNext = true;
  step(p, { a1: true, post: true });
  for (let i = 0; i < 24 && p.action.type === 'shot'; i++) step(p, qa.aiInput(p, dt));
  assert(p.action.postFake && p.post && p.hasBall, 'AI releases its post fake before committing');
}
console.log('PASS post fake tunables: commit window, stamina cost and defender bite; CPU early release preserves posting and ball');

{
  const source = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
  const clean = vm.runInNewContext(source.slice(source.indexOf('  function cleanInput('), source.indexOf('  function incoming(')) + '\ncleanInput;');
  assert.equal(clean(null), null);
  assert.equal(clean({ rs: 'true', rsPad: 1 }).rs, false);
  assert.equal(clean({ rsPad: 1 }).rsPad, false);
  assert.equal(clean({}).rs, false);
  assert.equal(clean({ dx: Infinity, dy: -2 }).dx, 0);
  assert.equal(clean({ dy: -2 }).dy, -1);
  const { p } = fixture();
  pads[0] = { connected: true, index: 0, axes: [0, 0, 0, 1], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 6 })) };
  for (let i = 0; i < holdFrames(); i++) step(p, clean(input.read(0, true, true)));
  assert.equal(p.action?.v, 'postfade', 'Guest right-stick hold survives host cleanInput and starts a post shot');
  const a = p.action;
  for (let i = 0; i < 45; i++) step(p, clean(input.read(0, true, true)));
  pads[0].axes[3] = 0;
  step(p, clean(input.read(0, true, true)));
  assert(a.released && G.ball.state === 'shot', 'Guest stick release fires the post shot');
  pads.length = 0;
}
console.log('PASS guest post stick: cleanInput preserves shared rs/direction and device presence, rejects invalid values, and hold/release produces a post shot');

for (const mode of ['2p', 't5']) for (const feedback of ['detail', 'simple']) for (const fake of [true, false]) {
  const { p, d } = fixture(mode); d.off = true;
  G.fb = feedback; G.floats = [];
  step(p, { a1: true, post: true });
  const a = p.action, name = a.V.name;
  assert(!G.floats.some(f => f.text === name), `${mode}/${feedback} does not announce a shot during gather`);
  if (!fake) step(p, { a1: true, post: true }, Math.floor(a.ideal / dt) - 1);
  step(p, { post: true });
  if (fake) {
    assert(p.action.postFake);
    assert.equal(G.floats.filter(f => f.text === '背身假投').length, 1, `${mode}/${feedback} shows the post fake`);
    assert(!G.floats.some(f => f.text === name), 'A fake never announces the unreleased shot');
  } else {
    assert(a.released);
    assert.equal(G.floats.filter(f => f.text === name).length, 1, 'The shot name appears exactly once on real release');
    assert(!G.floats.some(f => f.text === '背身假投'));
  }
}
console.log('PASS post feedback: gather has no shot-name float; early fake shows only 背身假投 and real release announces its shot once, in 1V1/5V5 detail/simple');
