const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const C1 = require('./standing-dunk-c1.json');
const root = path.resolve(__dirname, '..');
const ref = process.argv.includes('--before') ? process.argv[process.argv.indexOf('--before') + 1] || 'origin/main' : null;

function fixture(profile, arch = 'flagg', cpu = false) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  for (const name of ['render', 'tune', 'roster', 'game']) {
    let source = ref && name === 'game' ? execFileSync('git', ['show', `${ref}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.standQA = { tryStart, updatePlayer, sdZone, sdScore, sdOk, sdMaxD, shaqReady, backTurn, postFollow, ST }; PH.game = {');
    vm.runInContext(source, ctx);
  }
  for (const [key, value] of Object.entries(profile)) ctx.PH.TUNE.set(key, value);
  const gm = ctx.PH.game, Q = ctx.PH.standQA;
  gm.newGame({ mode: '2p', arch0: arch, arch1: 'jalensmith', target: 9999 });
  Object.assign(gm.G, { phase: 'live', time: 10, needClear: false, intro: null, tips: null });
  const [p, d] = gm.G.players, H = ctx.PH.render.HOOP;
  d.off = true;
  Object.assign(p, { x: 0, y: H.y - 0.75, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, face: Math.PI / 2,
    hasBall: true, ctrl: cpu ? 'cpu' : 'p1', stam: 100 });
  const inp = { mx: 0, my: 0, dx: 0, dy: 0, sprint: true, a1: true, a2: false, a3: false, post: false };
  const fire = () => Q.tryStart(p, inp, { a1: true });
  return { ctx, gm, Q, p, H, inp, fire };
}

function history(f, kind) {
  if (kind === 'none') return;
  f.gm._dbg.startMove(f.p, { mx: 1, my: 0, dx: 0, dy: 0 }, kind);
  for (let i = 0; f.p.action && i < 120; i++) {
    f.gm.G.time += 1 / 60;
    f.Q.updatePlayer(f.p, { mx: 0, my: 0 }, 1 / 60);
  }
  assert.equal(f.p.action, null, 'dribble completed');
}

function inspect(f) {
  const { Q, p, gm } = f, P = gm._dbg.finPlan(p);
  return { d: P.d, fv: P.fv, inside: P.inside, max: Q.sdMaxD(p), zone: Q.sdZone(p, P), score: Q.sdScore(p),
    req: gm.K.sdReq, ok: Q.sdOk(p), stam: p.stam, shaq: Q.shaqReady(p), backTurn: Q.backTurn(p), follow: !!Q.postFollow(p) };
}

for (const [label, profile] of [['default', {}], ['C1', C1.data]]) {
  const base = fixture(profile);
  console.log(`${label} Flagg=${JSON.stringify({ h: base.p.h, sdunk: base.p.r.sdunk, dunk: base.p.r.dunk, str: base.p.r.str, bw: base.p.r.bw,
    sdMin: base.gm.K.sdMin, sdMax: base.gm.K.sdMax, sdHD: base.gm.K.sdHD, sdV: base.gm.K.sdV, sdH: base.gm.K.sdH, sdStr: base.gm.K.sdStr, ...inspect(base) })}`);
  for (const move of ['none', 'cross', 'postspin', 'postdrop', 'postshim']) for (const distance of [0.5, 0.75, 1, 1.1, 1.5, 1.99, 2, 2.5]) for (const speed of [0, 1, 1.6, 2, 3]) {
    const f = fixture(profile);
    history(f, move);
    Object.assign(f.p, { x: 0, y: f.H.y - distance, vx: 0, vy: speed, speed, face: Math.PI / 2, stam: 100, post: false });
    const state = inspect(f);
    f.fire();
    if (process.argv.includes('--matrix')) console.log(`${label} ${move} d=${distance} v=${speed}: ${f.p.action?.type}/${f.p.action?.v} stand=${!!f.p.action?.stand} ${JSON.stringify(state)}`);
    if (!process.argv.includes('--matrix')) {
      if (state.zone) assert.equal(f.p.action?.stand, true, `${label} neutral RT+X ${move} d=${distance} speed=${speed} must stand dunk`);
      else assert.notEqual(f.p.action?.stand, true, 'standing zone limits honored');
    }
  }
  if (process.argv.includes('--matrix')) continue;
  for (const cpu of [false, true]) {
    const weak = fixture(profile, 'curry', cpu);
    history(weak, 'postspin');
    Object.assign(weak.p, { x: 0, y: weak.H.y - 0.75, vx: 0, vy: 0, speed: 0, face: Math.PI / 2, post: false });
    assert(weak.Q.sdZone(weak.p, weak.gm._dbg.finPlan(weak.p)) && !weak.Q.sdOk(weak.p));
    weak.fire(); assert.equal(weak.p.action?.type, 'layup', 'weak standing dunker retains layup');
    const tired = fixture(profile, 'flagg', cpu);
    tired.p.stam = tired.Q.ST.dunk;
    tired.fire(); assert.equal(tired.p.action?.type, 'layup', 'stamina gate retained');
    const rebound = fixture(profile, 'flagg', cpu);
    Object.assign(rebound.p, { recT: 11, landT: 9.9 });
    rebound.fire(); assert.equal(rebound.p.action, null, 'rebound recovery guard retained');
    const raised = fixture(profile, 'flagg', cpu);
    raised.ctx.PH.TUNE.set('l1_sdReq', 0.9);
    raised.fire(); assert.equal(raised.p.action?.type, 'layup', 'rating threshold tuning honored');
    const widened = fixture(profile, 'flagg', cpu);
    widened.ctx.PH.TUNE.set('l1_sdMax', 1.9);
    widened.p.y = widened.H.y - 1.5;
    widened.fire(); assert.equal(widened.p.action?.stand, true, 'range tuning honored');
    const heldPost = fixture(profile, 'flagg', cpu);
    heldPost.p.post = heldPost.inp.post = true;
    heldPost.fire(); assert.equal(heldPost.p.action?.type, 'shot', 'explicit post shooting retained');
    const backTurn = fixture(profile, 'flagg', cpu);
    Object.assign(backTurn.p, { lastMove: 'postspin', lastMoveT: backTurn.gm.G.time, face: -Math.PI / 2 });
    assert(backTurn.Q.backTurn(backTurn.p));
    backTurn.fire(); assert.equal(backTurn.p.action?.type, 'shot', 'back-to-basket shooting retained');
    const noSprint = fixture(profile, 'flagg', cpu);
    history(noSprint, 'postspin');
    noSprint.inp.sprint = false;
    noSprint.fire(); assert.equal(noSprint.p.action?.type, 'shot', 'non-sprint post follow retained');
  }
  console.log(`PASS standing-dunk ${label}: neutral sprint+shoot distance/speed matrix, completed dribble/postspin, weaker ratings, stamina, live tuning, rebound guard and explicit post`);
}
