const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..'), ref = process.env.LIMB_REF;
const read = name => ref ? execFileSync('git', ['show', `${ref}:js/${name}.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { endTick() {}, read: () => ({}) } };
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3', 'render5']) {
  let code = read(name);
  if (name === 'render') code = code.replace('PH.rig = rig;', 'PH.limbVisual = visualRig; PH.rig = rig;');
  if (name === 'game') code = code.replace('PH.game = {', 'PH.limbQA = { poseTarget, updatePlayer, updateBall, startSteal, moveDefense, MKF, DKF, LKF, SV }; PH.game = {');
  if (name === 'render5') {
    const wpk = code.match(/const wpk = \(p\) => \{[\s\S]*?\n    \};/)[0].replace('const wpk = ', '').replace(/;$/, '');
    code = code.replace('PH.render5 = {', `PH.limbCameras = { wp, rotated: (U, V, fa) => (${wpk}) }; PH.render5 = {`);
  }
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, limbQA: qa, limbVisual: visual, limbCameras: cameras } = ctx.PH;
const { G, K, t5 } = gm;
gm.seed(7);
gm.newGame({ mode: '2p', arch0: 'lyles', arch1: 'drummond', target: 999 });
const profiles = (process.env.LIMB_QUICK ? ['drummond', 'draymond', 'lyles'] : gm.ROSTER).map(key => t5.makePlayer(1, key, 'p2'));
const stats = {}, worst = {}, frames = [];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function lengths(p) {
  const b = p.col.body, height = b ? b.height * p.h / b.baseHeight : p.h;
  const h = 1 + (height / 1.95 - 1) * (b ? ctx.PH.bodyHeightK() : 1.7);
  return { thigh: 0.41 * h * (b ? 0.95 * b.legs : 1), shin: 0.41 * h * (b ? 0.95 * b.legs : 1), upper: 0.28 * h * (b ? 0.94 * b.arm : p.col.wing || 1), fore: 0.26 * h * (b ? 0.94 * b.arm : p.col.wing || 1) };
}
function snapshot(p) {
  const o = {};
  for (const key of ['x', 'y', 'z', 'face', 'h', 'col', 'pose', 'sq', 'armS', 'anim', 'hasBall', 'grip', 'stealFoot', 'brPh', 'exr', 'stam']) if (p[key] != null) o[key] = p[key];
  if (o.stealFoot) o.stealFoot = { ...o.stealFoot, action: null };
  return JSON.parse(JSON.stringify(o));
}
function measure(p, label, meta = {}, rendered) {
  const k = rendered || visual(p), normal = lengths(p), s = stats[label] ||= { upper: 0, fore: 0, thigh: 0, shin: 0, legReach: 0, armReach: 0 };
  for (const side of ['L', 'R']) {
    for (const [part, a, b] of [['upper', 'sh', 'el'], ['fore', 'el', 'hand'], ['thigh', 'hip', 'knee'], ['shin', 'knee', 'foot']]) {
      const deviation = Math.abs(distance(k[a + side], k[b + side]) / normal[part] - 1);
      s[part] = Math.max(s[part], deviation);
    }
    const reach = distance(k['hip' + side], k['foot' + side]) / (normal.thigh + normal.shin);
    s.legReach = Math.max(s.legReach, reach);
    s.armReach = Math.max(s.armReach, distance(k['sh' + side], k['hand' + side]) / (normal.upper + normal.fore));
    if (!worst[label] || reach > worst[label].ratio) worst[label] = { ratio: reach, player: p.arch?.key || meta.player, side, ...meta, playerState: snapshot(p) };
  }
}
function record(p, label, meta) {
  measure(p, label, meta);
  frames.push({ state: snapshot(p), label, meta });
  if (G.mode === 't5') {
    measure(cameras.wp(p, 1), label + '/broadcast', meta);
    const angle = 0.7, U = (x, y) => y * Math.sin(angle) + x * Math.cos(angle), V = (x, y) => y * Math.cos(angle) - x * Math.sin(angle);
    measure(cameras.rotated(U, V, -angle)(p), label + '/2k', meta);
  }
}

for (const mode of ['2p', 't3', 't5']) for (const fps of [60, 120]) {
  const dt = 1 / fps;
  for (const key of ['drummond', 'draymond', 'lyles']) for (const scenario of ['hit', 'miss', 'pushback', 'sliding', 'drive-past', 'repeat', 'fall', 'fall-after-steal', 'daze-after-steal', 'poke-daze', 'new-action']) {
    gm.newGame({ mode: '2p', arch0: 'lyles', arch1: key, target: 999 });
    const [p, d] = G.players;
    Object.assign(G, { phase: 'live', needClear: false, time: 0, mode, intro: null });
    Object.assign(p, { x: 0, y: 5, hasBall: true, face: Math.PI / 2, opp: d, action: null, hand: 1, handX: 0.33 });
    Object.assign(d, { x: 0.564, y: 5.752, hasBall: false, face: -Math.PI / 2, opp: p, action: null });
    delete p.pose.passHands; delete d.pose.passHands;
    p.grip = d.grip = null;
    Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
    gm.CFG.stealMul = scenario === 'miss' || scenario.endsWith('after-steal') ? 0 : 100; K.stlMax = 1;
    gm.CFG.ankle = 10; gm.CFG.stunMul = 10;
    K.stlCl0 = scenario === 'poke-daze' ? 0 : 1; K.stlClS = K.stlClTm = 0;
    const step = () => { G.time += dt; qa.updatePlayer(p, t5.zeroInp(), dt); qa.updatePlayer(d, t5.zeroInp(), dt); qa.updateBall(dt); };
    for (let i = 0; i < fps / 2; i++) step();
    const fall = scenario === 'fall';
    if (!fall) qa.startSteal(d);
    else {
      qa.moveDefense(p, 'cross', 1, 0, { kySk: true });
      assert.equal(d.stunK, 'fall', 'crossover dispatch reaches fall tier');
    }
    p.drib = 1;
    for (let i = 0; i < fps; i++) {
      const t = i * dt;
      if (scenario === 'repeat' && i > 0 && i % Math.round(fps / 4) === 0) {
        p.hasBall = true; d.hasBall = false; d.action = null;
        Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
        qa.startSteal(d);
      }
      if (i === Math.round(fps * 0.1) && /^(fall|daze)-after-steal$/.test(scenario)) {
        const old = K.akT2;
        if (scenario.startsWith('daze')) K.akT2 = 999;
        qa.moveDefense(p, 'cross', 1, 0);
        K.akT2 = old;
        assert.equal(d.stunK, scenario.startsWith('fall') ? 'fall' : 'daze', 'crossover interrupts steal');
      }
      if (i === Math.round(fps * 0.1) && scenario === 'new-action') {
        d.action = null; d.hasBall = true; p.hasBall = false;
        Object.assign(G.ball, { state: 'held', holder: d.id, dead: false });
        gm._dbg.startMove(d, { ...t5.zeroInp(), dx: 1 }, 'cross');
        assert.equal(d.action?.type, 'move', 'a new move interrupts the visual plant');
      }
      if (t > 0.1 && t < 0.35) {
        if (scenario === 'pushback') { d.x += dt * 5; d.y += dt * 3; }
        if (scenario === 'sliding') { d.vx = -4; d.vy = 4; }
        if (scenario === 'drive-past') { p.y -= dt * 8; d.x += dt * 4; }
      }
      const previousPlant = d.stealFoot;
      step();
      if (!ref && (d.stun > 0 || d.action && d.action.type !== 'steal') && d.stealFoot) {
        assert(d.stealFoot.cancelled && !d.stealFoot.action, 'stun replaces the plant with an unanchored blend');
        assert(d.stealFoot.returnT < 0.1, 'interrupted plant clears within 100ms');
      }
      if (!ref && previousPlant && !d.stealFoot) assert(distance(previousPlant.pos, visual(d)['foot' + previousPlant.side]) < 0.00001, 'return finishes on the live unplanted pose foot');
      if (!ref && d.stealFoot && !d.action) assert.equal(d.stealFoot.action, null, 'return step does not retain an ended action');
      record(d, 'steal/' + scenario, { mode, fps, t, player: key });
      if (scenario === 'fall' || scenario === 'fall-after-steal') measure(d, scenario + '/' + key, { mode, fps, t, player: key });
      if (scenario === 'poke-daze' && p.stunK === 'daze') record(p, 'poke-daze', { mode, fps, t, player: p.arch.key });
    }
  }
  const p = G.players[0]; p.hasBall = false;
  delete p.pose.passHands;
  const base = { type: 'move', T: 0.6, h0: 1, h1: -1, hand: 1, dx: 1, dy: 0, hx: 0, hy: 1, ideal: 0.35, jT: 0.2, wp: [], side: 1, postSide: 1 };
  const poses = [
    ...['idle', 'run', 'def', 'box', 'post', 'pass', 'fake', 'shoot', 'win', 'lose', 'land'].map(an => [an, an, {}]),
    ['stance/crab', 'def', { stance: true }],
    ['sprint', 'run', {}],
    ...Object.keys(qa.SV).map(v => ['shoot/' + v, 'shoot', { V: qa.SV[v], v }]),
    ...Object.keys(qa.MKF).map(kind => ['move/' + kind, 'move', { kind }]),
    ...['uuForward', 'uuBack', 'uuLeft', 'uuRight'].map(mv => ['up-and-under/' + mv, 'move', { kind: 'uu', mv }]),
    ...Object.keys(qa.DKF).map(v => ['dunk/' + v, 'dunk', { type: 'dunk', v }]),
    ...Object.keys(qa.LKF).map(sty => ['layup/' + sty, 'layup', { type: 'layup', sty, v: 'normal' }]),
    ...['floater', 'power', 'euro', 'reverse'].map(v => ['layup/' + v, 'layup', { type: 'layup', sty: 'tip', v }]),
    ...['off', 'daze', 'spin', 'fall'].map(stunK => ['stun/' + stunK, 'stun', { stunK }]),
    ...['swat', 'catch', 'facial', 'chase', 'normal'].map(bst => ['block/' + bst, 'block', { type: 'block', bst: bst === 'normal' ? null : bst, hitT: 0.1 }]),
    ['alley-oop', 'dunk', { type: 'dunk', v: 'two', alley: true }],
    ['dunk/steps', 'dunk', { type: 'dunk', inSteps: true }],
    ['dive', 'dive', { pre: 0.1, air: 0.15, slide: 0.1, rec: 0.25 }],
    ['cel', 'cel', {}], ['hurt', 'hurt', {}],
    ['pass/windup', 'idle', { pass: true }],
    ['reach/extreme', 'block', { type: 'block', verticalArm: 1, stretch: true }],
  ];
  for (const [label, an, extra] of poses) {
    Object.assign(p, { action: { ...base, ...extra }, anim: an, stealFoot: null, crab: null, grip: null, armS: extra.stretch ? [1.6, 1.6] : null, hasBall: false, stun: 0, stance: !!extra.stance, speed: an === 'run' || extra.stance ? 7 : 0, x: 0, y: 5, z: 0, sq: 1, landT: 0, recT: 0.6 });
    if (an === 'stun') Object.assign(p, { stun: 0.8, stunT0: 0.8, stunK: extra.stunK });
    for (let i = 0; i <= Math.round(0.6 * fps); i++) {
      const t = i * dt;
      G.time = t; G.cel = { t0: 0, ty: 'flex', hurt: 'hips' };
      p.animT = p.action.t = t; p.action.released = t > 0.35;
      p.runPh = t * 12; p.stun = Math.max(0, 0.8 - t); p.sq = 1 + 0.2 * Math.sin(t * 20);
      if (an !== 'stun') p.stun = 0;
      if (extra.stance) ctx.PH.gait.crab(p, dt, p.pose);
      p.pose = qa.poseTarget(p);
      if (extra.pass) p.pose.passHands = { L: [-1, 4, 2], R: [1, 4, 2] };
      record(p, label, { mode, fps, t, player: p.arch.key });
    }
  }
  Object.assign(p, { anim: 'idle', action: null, stealFoot: null, armS: null, sq: 1, grip: null, hasBall: false, stance: false });
  delete p.pose.passHands;
  const folded = visual(p);
  p.stealFoot = { side: 'L', pos: folded.hipL.slice() };
  p.pose.passHands = { L: folded.shL.slice(), R: folded.shR.slice() };
  record(p, 'endpoint/coincident', { mode, fps, player: p.arch.key });
}

// Identical render inputs across modes/rates share a solve, not an assertion.
const uniqueFrames = new Map();
for (const frame of frames) {
  const { col, h, stealFoot, ...state } = frame.state;
  const key = JSON.stringify({ ...state, stealFoot: stealFoot && { side: stealFoot.side, pos: stealFoot.pos, sampling: stealFoot.sampling } });
  const group = uniqueFrames.get(key);
  if (group) group.push(frame); else uniqueFrames.set(key, [frame]);
}
for (const profile of profiles) {
  for (const group of uniqueFrames.values()) {
    const p = { ...group[0].state, arch: profile.arch, col: profile.col, h: profile.h }, k = visual(p);
    for (const { label, meta } of group) measure(p, label, { ...meta, player: profile.arch.key }, k);
  }
}
const report = { ref: ref || 'working-tree', profiles: profiles.length, frames: frames.length, stats, worst };
if (process.env.LIMB_REPORT) fs.writeFileSync(process.env.LIMB_REPORT, JSON.stringify(report, null, 2));
for (const [label, s] of Object.entries(stats)) console.log(`${label}: upper=${s.upper.toFixed(4)} fore=${s.fore.toFixed(4)} thigh=${s.thigh.toFixed(4)} shin=${s.shin.toFixed(4)} legReach=${s.legReach.toFixed(4)} armReach=${s.armReach.toFixed(4)}`);
if (!process.env.LIMB_MEASURE) for (const [label, s] of Object.entries(stats)) {
  for (const part of ['upper', 'fore', 'thigh', 'shin']) assert(s[part] <= 0.02, `${label}: ${part} length deviation ${(s[part] * 100).toFixed(2)}%`);
  assert(s.legReach <= 1.01 && s.armReach <= 1.01, label + ': endpoint exceeds limb reach');
}
console.log(`PASS limb-length audit: ${profiles.length} roster profiles, ${frames.length} frames, all pose families, 1V1/3V3/5V5, 60/120fps${process.env.LIMB_MEASURE ? ' (measurement only)' : ''}`);
