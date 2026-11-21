const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(ref) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let code = ref && name === 'game' ? execFileSync('git', ['show', `${ref}:js/game.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('PH.game = {', 'PH.euroQA = { buildSteps, stepUpdate, stepPose, updateGrip, updateAction, updatePlayer, heldShotPos }; PH.game = {');
    vm.runInContext(code, ctx);
  }
  return ctx.PH;
}
const profiles = [['defaults', {}], ['fixture C1', require('./far-layup-c1.json').data]];
if (process.argv.includes('--live')) {
  const response = JSON.parse(execFileSync('curl', ['-fsS', 'https://pixelhoops-api.cecilcai322.workers.dev/api/profiles'], { encoding: 'utf8' }));
  const c1 = response.profiles.find(p => p.name === 'C1');
  assert(c1);
  profiles.push(['live C1', c1.data]);
  console.log('GET-only live C1 timing keys:', JSON.stringify(Object.fromEntries(Object.entries(c1.data).filter(([k]) => /stepT|gathT|euro|layTi/.test(k)))));
}
for (const [label, data] of profiles) {
  for (const ref of [process.env.EURO_BASE, null].filter((v, i) => i || v)) {
    const PH = load(ref), gm = PH.game, Q = PH.euroQA, K = gm.K, H = PH.render.HOOP;
    for (const [k, v] of Object.entries(data)) if (k.startsWith('l1_') && k.slice(3) in K) K[k.slice(3)] = v;
    function setup() {
      gm.newGame({ mode: 'cpu', arch0: 'flagg', arch1: 'gobert', target: 9999 });
      gm.seed(7);
      Object.assign(gm.G, { phase: 'live', needClear: false, off: 0, time: 10 });
      const [p, d] = gm.G.players;
      Object.assign(p, { x: 0, y: H.y - 4.5, vx: 0, vy: 5, speed: 5, face: Math.PI / 2, hasBall: true, ctrl: 'p1', hand: 1 });
      Object.assign(d, { x: 4, y: H.y, stance: false, action: null, stun: 0 });
      Object.assign(gm.G.ball, { state: 'held', holder: 0, dead: false });
      assert(gm._dbg.startFinish(p, { mx: 0.7, my: -0.7 }, 'stick', 'a1'));
      assert.equal(p.action.v, 'euro');
      return { p, d, a: p.action };
    }
    const { p, d, a } = setup(), w = a.wp[0];
    const first = w.T - (w.hold || 0), second = w.T + a.wp[1].T, release = second + a.ideal;
    console.log(`${ref ? 'BEFORE' : 'AFTER'} ${label} Flagg (4.5m, 5m/s): plant1=${first.toFixed(3)} plant2=${second.toFixed(3)} release(ideal)=${release.toFixed(3)}; plant1->plant2=${(second - first).toFixed(3)} plant2->release=${a.ideal.toFixed(3)}`);
    if (ref) continue;
    assert.equal(a.wp.length, 2);
    for (const key of ['euroTempo', 'euroBeat']) assert.equal(PH.TUNE.meta('l1_' + key).wide, false);
    assert(first > 0.3 && second - first > 0.65, 'even C1 has human-paced steps and a readable beat');
    assert(release - first >= 1 && release < 2, 'readable first-plant rhythm without excessively slow defaults');
    const shared = { p, a }, sharedPlan = gm._dbg.finPlan(p);
    const originalStepT = K.stepT, originalGatherT = K.gathT;
    K.stepT = 0.1; K.gathT = 0.04;
    const tuned = Q.buildSteps(shared.p, shared.a, sharedPlan, 'euro', 1);
    const scale = K.euroTempo * (1.1 - 0.15 * (shared.p.r.spd + shared.p.r.acc) / 2);
    K.stepT = 0.09; K.gathT = 0.03;
    const quicker = Q.buildSteps(shared.p, shared.a, sharedPlan, 'euro', 1);
    assert(Math.abs(tuned[0].T - quicker[0].T - 0.02 * scale) < 1e-8, 'stepT and gathT directly control the first step even below former floors');
    assert(Math.abs(tuned[1].T - quicker[1].T - 0.01 * scale) < 1e-8, 'stepT directly controls the second step even below former floor');
    K.stepT = originalStepT; K.gathT = originalGatherT;
    Object.assign(a, { st: first + w.hold / 3, si: 0 });
    const pose = JSON.stringify(Q.stepPose(a));
    Q.stepUpdate(p, a, { a1: true }, 0.001);
    assert(Math.hypot(p.x - w.x, p.y - w.y, p.z) < 1e-8);
    assert.equal(p.vx, 0); assert.equal(p.vy, 0);
    Object.assign(a, { st: first + w.hold * 0.8 });
    assert.equal(JSON.stringify(Q.stepPose(a)), pose, 'planted pose holds during beat');
    p.grip = { right: 0.5, dunk: false, rim: 0, fade: 1, gather: null };
    for (let si = 0; si < 2; si++) for (let i = 0; i <= 100; i++) {
      Object.assign(a, { si, st: a.wp[si].T * i / 100 });
      Object.assign(p.pose, Q.stepPose(a)); Q.updateGrip(p, a, 1 / 240);
      const ball = Q.heldShotPos(p), rig = PH.rig(p);
      assert([ball.x, ball.y, ball.z].every(Number.isFinite));
      const mid = rig.handL.map((v, j) => (v + rig.handR[j]) / 2);
      assert(Math.hypot(ball.x - mid[0], ball.y - mid[1], ball.z - mid[2]) < 0.15, 'two-hand carry follows rig throughout slow motion');
    }
    Object.assign(a, { si: 0, st: first - 0.01 });
    Object.assign(d, { x: p.x, y: p.y + 0.6 });
    gm.t5.aiInput(d, 1 / 240);
    assert.notEqual(d.ai.seenAct, a, 'no reaction before plant');
    a.st = first + 0.001;
    gm.t5.aiInput(d, 1 / 240);
    assert.equal(d.ai.seenAct, a, 'existing CPU contest reacts at first plant');
    const reaction = d.ai.jumpAt - gm.G.time;
    gm.G.time = d.ai.jumpAt + 0.001;
    assert(gm.t5.aiInput(d, 1 / 240).a1, 'existing AI emits jump input');
    gm._dbg.startBlock(d, {});
    const airTime = (d.vz + Math.sqrt(d.vz * d.vz + 2 * 17 * d.z)) / 17;
    assert(reaction + airTime < release - first, 'first-plant contest lands before release');
    console.log(`PASS ${label}: CPU reaction=${reaction.toFixed(3)}s + jump flight=${airTime.toFixed(3)}s < plant1->release=${(release - first).toFixed(3)}s`);
    const baseTempo = K.euroTempo, baseBeat = K.euroBeat;
    K.euroBeat = 0;
    assert.equal(setup().a.wp[0].hold, 0, 'zero beat supported');
    K.euroBeat = baseBeat; K.euroTempo = baseTempo * 1.2;
    const slower = setup().a;
    assert(Math.abs(slower.wp[0].T / w.T - 1.2) < 1e-8, 'tempo scales whole ground rhythm');
    K.euroTempo = baseTempo;
    const empty = setup(); empty.a.wp = []; empty.a.meter = null;
    Q.stepUpdate(empty.p, empty.a, { a1: true }, 1 / 240);
    assert.equal(empty.a.inSteps, false, 'empty waypoint fallback still takes off');
    const rating = setup(), plan = gm._dbg.finPlan(rating.p), durations = [];
    for (const speed of [0.7, 1]) {
      rating.p.r.spd = rating.p.r.acc = speed;
      durations.push(Q.buildSteps(rating.p, rating.a, plan, 'euro', 1).reduce((sum, step) => sum + step.T, 0));
    }
    assert(durations[1] < durations[0] && durations[1] / durations[0] > 0.9, 'ratings retain a modest speed advantage');
    const live = setup(); live.d.off = true;
    PH.input.read = () => ({ a1: live.a.inSteps || live.a.t < live.a.ideal });
    let elapsed = 0;
    while (!live.a.released && elapsed < 3) { gm.tick(1 / 240); elapsed += 1 / 240; }
    assert(live.a.released && Math.abs(elapsed - release) < 0.03, 'actual shared simulation release follows the delayed footwork');
    console.log(`PASS ${label}: actual 240Hz release=${elapsed.toFixed(3)}s; rating duration ratio=${(durations[1] / durations[0]).toFixed(3)}`);
    PH.TUNE.set('l1_euroTempo', NaN);
    assert.equal(K.euroTempo, PH.TUNE.meta('l1_euroTempo').v, 'invalid slider value falls back to default');
  }
}
console.log('PASS Euro tempo: defaults/fixture, bounded sliders, shared stepT/gathT without floors, planted pause, slow-motion rig carry, CPU bait/landing, zero beat, scaling and empty-waypoint fallback');
