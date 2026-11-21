const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.postFakeQA = { updatePlayer, pumpFake, aiInputCore }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, T5: team, TUNE: tune } = ctx.PH;
const { G, K, _dbg: dbg } = gm;
const dt = 1 / 120, zero = () => gm.t5.zeroInp();
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);
function fixture(mode = '2p') {
  if (ctx.PH.T3.T.on) ctx.PH.T3.stop();
  if (team.T.on) team.stop();
  if (G.mode === 't5') gm.t5.end();
  tune.load({ l1_stamRegen: 0 }); gm.seed(7);
  if (mode === 't5') team.start({ home: 'LAL', away: 'BOS', human: 0 });
  else if (mode === 't3') ctx.PH.T3.start({ local: 0, slots: ['barkley', 'curry', 'jokic', 'gobert', 'kobe', 'lebron'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })) });
  else gm.newGame({ mode: '2p', arch0: 'barkley', arch1: 'gobert', target: 999 });
  const p = mode === 't5' ? team.T.ctl : G.players[0];
  const arch = gm.ARCH.barkley;
  p.arch = { ...arch, _bt: {} };
  p.r = { ...arch, badges: arch.badges.slice(), sig: { ...arch.sig } };
  p.sk.ready = false;
  Object.assign(G, { phase: 'live', needClear: false, time: 10, off: p.tm || 0, shotClock: 20 });
  for (const q of G.players) Object.assign(q, { hasBall: false, off: true, x: -6, y: -6 });
  Object.assign(p, { ctrl: 'p1', x: 0, y: ctx.PH.render.HOOP.y - 5.2, z: 0, vz: 0, face: -Math.PI / 2, vx: 0, vy: 0, speed: 0, action: null, post: true, hasBall: true, stam: 100, cd: 0, postMove: null, postFaceLock: false, off: false });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  return p;
}
function step(p, inp = {}, n = 1) {
  for (let i = 0; i < n; i++) { G.time += dt; ctx.PH.postFakeQA.updatePlayer(p, { ...zero(), ...inp }, dt); }
}
function finish(p) {
  for (let i = 0; p.action && i < 120; i++) step(p, { post: true });
  assert.equal(p.action, null);
}

for (const mode of ['2p', 't3', 't5']) for (const stick of [false, true]) for (const side of [-1, 1]) {
  const p = fixture(mode), initialShots = G.shotN || 0, initialAttempts = G.stats[p.id].fga;
  assert(!p.r.badges.includes('dream'), 'Barkley has no Dream badge (tier 0), despite his high post rating');
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? -side : side;
    if (stick) {
      step(p, { post: true, rs: true, rsPad: true, dx: s });
      step(p, { post: true, rs: true, rsPad: true, dx: s }, Math.ceil(K.rsHold / dt) + 1);
    } else step(p, { post: true, a1: true, mx: s }, 5);
    assert.equal(p.action.type, 'shot');
    step(p, { post: true, rsPad: stick });
    assert(p.action.postFake && p.hasBall && p.post, `${mode} ${stick ? 'stick' : 'button'} side ${side} fake ${i + 1} must retain the ball`);
    assert.equal(G.shotN || 0, initialShots);
    assert.equal(G.stats[p.id].fga, initialAttempts);
    finish(p);
  }
  assert.equal(p.postFakeCount, 4);
  console.log(`PASS Barkley ${mode} ${stick ? 'stick' : 'J/X'} side=${side}: four fakes, shots=0, Dream tier=0`);
}

for (const v of ['poSpinShot', 'postfade', 'postfade1', 'postfront', 'turn', 'spinfade', 'shimshot', 'hook']) {
  const p = fixture();
  dbg.startShot(p, zero(), 'a1', v);
  const a = p.action;
  step(p, { post: true, a1: true }, Math.floor(a.jT / dt) - 1);
  assert(!a.jumped);
  step(p, { post: true });
  assert(p.action.postFake && p.hasBall && !a.released, `${v} release before takeoff remains a fake`);
}
console.log('PASS post early releases: all pre-takeoff releases remain fakes, including late gathers and hooks');

for (const stick of [false, true]) {
  const p = fixture();
  p.postFakeCount = 4;
  const held = stick ? { post: true, rs: true, rsPad: true, dx: 1 } : { post: true, a1: true, mx: 1 };
  for (let i = 0; i < 240 && p.hasBall; i++) step(p, held);
  assert(!p.hasBall && p.action.released && G.ball.state === 'shot', 'holding through release still shoots after the cap');
  assert(p.action.jumped && G.ball.z > 2, 'real post shot releases airborne, not from a grounded fake');
}
console.log('PASS post held releases: J/X and stick still shoot airborne after the fake cap');

{
  const p = fixture(), d = G.players[1];
  Object.assign(d, { off: false, x: p.x, y: p.y + 1, opp: p }); p.opp = d;
  tune.set('l1_poFakeBite', 1);
  for (let i = 0; i < 3; i++) {
    dbg.startShot(p, zero(), 'a1', 'turn');
    d.ai.willJump = false;
    ctx.PH.postFakeQA.pumpFake(p, 0.26, false);
    assert.equal(d.ai.willJump, i === 0, 'only the first no-Dream fake can provoke a bite');
    assert(p.hasBall && p.action.postFake);
    finish(p);
  }
}
console.log('PASS capped fake differentiation: later fakes retain the ball without provoking another defensive bite');

for (const mode of ['2p', 't3', 't5']) for (const exhausted of [false, true]) {
  const p = fixture(mode);
  const defenders = G.players.filter(d => d !== p && (mode === '2p' || d.tm !== p.tm));
  for (const d of defenders) Object.assign(d, { off: false, dummy: false, x: p.x + 0.2, y: p.y + 1, opp: p, D: { ...gm.DIFF[1], react: 0.01, bite: 1, steal: 0 } });
  p.opp = defenders[0]; p.postFakeCount = exhausted ? 1 : 0;
  tune.set('l1_poFakeBite', 1);
  tune.set('l1_aiJmpS', 1); tune.set('l1_aiJmpMin', 0);
  dbg.startShot(p, zero(), 'a1', 'turn');
  for (const d of defenders) {
    ctx.PH.postFakeQA.aiInputCore(d, dt);
    assert(d.ai.willJump && d.ai.jumpAt > G.time && d.ai.seenAct === p.action, 'a genuine shot start schedules a defender jump');
  }
  step(p, { post: true });
  assert(p.hasBall && p.action.postFake);
  G.time += 0.11;
  for (const d of defenders) {
    const input = ctx.PH.postFakeQA.aiInputCore(d, dt);
    ctx.PH.postFakeQA.updatePlayer(d, input, dt);
    console.log(`Queued reaction ${mode} exhausted=${exhausted}: jumpInput=${!!input.a1} defenderZ=${d.z.toFixed(6)}`);
    assert.equal(d.z > 0, !exhausted, 'only an effective fake can make the defender actually leap');
    assert.equal(!!input.a1, !exhausted, `${mode} exhausted=${exhausted}: pending shot reaction must respect the effective fake cap`);
  }
}
console.log('PASS pending post reactions: genuine shot-start jumps survive effective fakes but never exhausted fakes, including help defenders in 1V1/3V3/5V5');

function flight(v, arc, error = 0) {
  const p = fixture();
  p.arch.arc = arc;
  p.post = v !== 'set';
  dbg.startShot(p, zero(), 'a1', v);
  p.z = 0.65;
  const a = p.action;
  a.t = a.ideal; a.jumped = true;
  gm.seed(7);
  dbg.releaseShot(p, error, 'shot');
  const b = G.ball;
  return { T: b.shot.T, apex: b.z + b.vz * b.vz / 25, speed: Math.hypot(b.vx, b.vy, b.vz), vx: b.vx, vy: b.vy, vz: b.vz };
}
for (const arc of ['low', 'mid', 'high']) for (const error of [0, -1, 1]) {
  const normal = flight('set', arc, error);
  for (const v of ['poSpinShot', 'postfade', 'postfade1', 'postfront', 'turn', 'spinfade', 'shimshot']) {
    const post = flight(v, arc, error);
    for (const key of Object.keys(normal)) near(post[key], normal[key], `${arc} ${v} timing=${error} ${key}`);
  }
  if (arc === 'mid' && error === 0) console.log(`PASS matched-geometry jumper flight: normal/post apex=${normal.apex.toFixed(6)}m speed=${normal.speed.toFixed(6)}m/s T=${normal.T.toFixed(6)}s`);
}
assert.notEqual(flight('hook', 'mid').T, flight('set', 'mid').T, 'hooks retain their intentionally quicker close-range trajectory');
console.log('PASS post flight: all jumper variants share normal arc/speed/flight time for low/mid/high arcs and perfect/early/late misses; hook remains distinct');

for (const saved of [{}, { l1_poFakeLimitNone: 0 }, { l1_poFakeLimitNone: 1, l1_rsHold: 0 }, { l1_poFakeLimitNone: -1, l1_rsHold: 0.4 }]) for (const stick of [false, true]) {
  const p = fixture(); tune.load(saved);
  near(K.poFakeLimitNone, saved.l1_poFakeLimitNone ?? 1, 'missing saved cap defaults; recognized zero/stale cap remains an override');
  near(K.rsHold, saved.l1_rsHold ?? 0.2, 'missing hold defaults; recognized zero/stale hold remains an override');
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? -1 : 1;
    if (stick) step(p, { post: true, rs: true, rsPad: true, dx: side }, Math.ceil(K.rsHold / dt) + 3);
    else step(p, { post: true, a1: true, mx: side }, 5);
    step(p, { post: true, rsPad: stick });
    assert(p.hasBall && G.ball.state !== 'shot', `saved=${JSON.stringify(saved)} stick=${stick} fake=${i + 1} cannot shoot on early release`);
    if (stick && K.rsHold === 0) assert.equal(p.action.type, 'move', 'legacy zero hold leaves a preliminary move, not a forced shot');
    else assert(p.action.postFake);
    finish(p);
  }
  tune.load({}); near(K.poFakeLimitNone, 1, 'official resets cap'); near(K.rsHold, 0.2, 'official resets hold');
}
console.log('PASS saved tuning: missing/zero/stale caps and hold values cannot force early-release shots; official resets overrides');
