const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

{
  const events = {}, pad = { connected: true, axes: [], buttons: [] };
  const ctx = vm.createContext({ addEventListener: (event, fn) => { events[event] = fn; }, navigator: { getGamepads: () => [pad] } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8'), ctx);
  const room = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
  const clean = vm.runInContext(room.slice(room.indexOf('  function cleanInput('), room.indexOf('  function incoming(')) + '\ncleanInput;', ctx);
  pad.buttons[2] = { pressed: true };
  assert.equal(clean(ctx.PH.input.read3(false)).alleyX, true);
  assert.equal(clean(ctx.PH.input.read3(false)).alleyB, false);
  pad.buttons = []; pad.buttons[1] = { pressed: true };
  assert.equal(clean(ctx.PH.input.read3(false)).alleyB, true);
  pad.buttons = []; pad.axes = [0, 0, -1, 0];
  assert.equal(clean(ctx.PH.input.read3(false)).dx, -1);
  assert.equal(clean({ alleyX: 'true' }).alleyX, false);
  pad.axes = []; pad.buttons[0] = { pressed: true };
  assert.equal(ctx.PH.input.read(0, true, true).selfAlley, true);
  assert.equal(ctx.PH.input.read3(true).selfAlley, false, '3V3 A must remain a teammate pass');
  pad.buttons = [];
  events.keydown({ code: 'KeyV' });
  assert.equal(ctx.PH.input.read(0, true, false).selfAlley, true);
  events.keydown({ code: 'Numpad4' });
  assert.equal(ctx.PH.input.read(1, true, false).selfAlley, true);
  console.log('PASS: off-ball Xbox X/B and right stick survive 3V3 host input sanitization.');
}

function fixture(five = false) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.navigator = { getGamepads: () => [] };
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', ...(five ? ['b5', 'team5'] : ['team3'])]) {
    let code = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'team5') code = code.replace('doPass: doPass,', 'doPass: doPass, qaPassUpdate: passUpdate, qaHumanInp: humanInp,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const { game, T3, T5, TUNE } = ctx.PH, G = game.G, api = game.t5;
  if (five) T5.start({ home: 'LAL', away: 'BOS', human: 0 });
  else T3.start({ slots: ['curry', 'edwards', 'jokic', 'luka', 'kobe', 'giannis'].map(arch => ({ arch, role: 'human' })), replay: false, clock: 0, target: 999 });
  const p = G.players[1], from = G.players[0];
  function reset(seed = 7, cpu = false) {
    game.seed(Math.imul(seed, 7919));
    Object.assign(G, { phase: 'live', time: 5, needClear: false, illId: -1, off: 0, floats: [], lastShot: null, shotClock: 24, replay: null });
    Object.assign(G.fx, { hit: 0, slow: 0 });
    for (const q of G.players) Object.assign(q, { x: q.tm ? 7 : -7, y: 3, z: 0, vz: 0, vx: 0, vy: 0, hasBall: false, action: null, stun: 0, off: false, stam: 100, ib: null, finQ: null, ctrl: 'p1', prev: { a1: false, a2: false, a3: false } });
    Object.assign(p, { x: 0, y: api.HOOP.y - 2, vy: 4, ctrl: cpu ? 'cpu' : 'p1', h: 2.1 });
    Object.assign(p.r, { dunk: 0.98, sdunk: 0.98, vert: 0.95, leap: 0.95, lay: 0.9, hnd: 0.9 });
    Object.assign(from, { x: -3, y: api.HOOP.y - 5 });
    Object.assign(G.ball, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 2.5, vx: 0, vy: 0, vz: 0, dead: false, shot: null, wasShot: false, noPick: 0 });
    p.hasBall = true;
    return { kind: 'alley', from, to: p, duration: 0.6, T: 0.6, t: 0 };
  }
  return { ctx, game, G, api, p, from, reset, T3, T5, TUNE };
}

{
  const { G, api, p, from, reset, TUNE } = fixture();
  let P = reset();
  api.alleyInput(P, {}, 0.3);
  assert.equal(P.finish.button, 'X');
  assert(G.floats.some(f => f.alleyPrompt && f.progress > 0));
  api.alleyInput(P, { alleyX: true }, 0.02);
  assert(api.alleyFinish(P, 0.95));
  assert.equal(P.finish.grade, 'green');
  assert.equal(p.action.type, 'dunk');
  assert(!G.floats.some(f => f.alleyPrompt));
  const makes = G.stats[p.id].alley || 0;
  api.scoreBy(p.id, 2, 'dunk', '暴扣得分');
  assert.equal(G.stats[p.id].alley, makes + 1);
  assert.equal(G.banner.text, '空接暴扣');
  P = reset();
  api.alleyInput(P, { alleyB: true }, 0.02);
  assert.equal(P.finish.error, null);
  api.alleyFinish(P, 0.95);
  assert.equal(P.finish.grade, 'bad');
  assert.equal(p.action.type, 'layup');
  api.scoreBy(p.id, 2, 'lay', '上篮', p.action);
  assert.equal(G.banner.text, '空接上篮');
  assert.equal(G.stats[p.id].alley, makes + 2);
  P = reset(); from.x = 3;
  api.alleyInput(P, { alleyX: true }, 0.02);
  assert.equal(P.finish.button, 'B');
  assert.equal(P.finish.error, null);
  api.alleyInput(P, { alleyB: true }, -0.02);
  api.alleyFinish(P, 0.95);
  assert.equal(P.finish.grade, 'green');
  P = reset();
  Object.assign(G.ball, { x: p.x - 1, y: p.y });
  api.alleyInput(P, { dx: -1, dy: 0 }, 0.02);
  api.alleyFinish(P, 0.95);
  assert.equal(P.finish.grade, 'green');
  P = reset();
  Object.assign(G.ball, { x: p.x - 1, y: p.y });
  api.alleyInput(P, { dx: 1, dy: 0 }, 0.02);
  assert.equal(P.finish.error, null, 'stick must point toward the ball');
  P = reset(); api.alleyInput(P, { alleyX: true }, 0.18);
  api.alleyFinish(P, 0.95);
  assert.equal(P.finish.grade, 'ok');
  P = reset(); api.alleyInput(P, { alleyX: true }, 0.5);
  api.alleyFinish(P, 0.95);
  assert.equal(P.finish.grade, 'bad');
  api.alleyInput(null, {}, 0);
  api.alleyInput({ kind: 'chest' }, {}, 0);
  assert(TUNE.list().filter(d => d.k.startsWith('l1_alley')).every(d => d.cat === 'fin' && d.gm === 'both'));
  console.log('PASS: human green starts a dunk; side buttons, stick direction, ok/bad/late timing and empty input are graded.');
}

{
  const { ctx, game, G, api, p, reset, TUNE } = fixture();
  reset();
  const open = api.alleyWindow(p).width;
  const defender = G.players[3];
  Object.assign(defender, { x: 0, y: api.HOOP.y - 0.1 });
  const rim = api.alleyWindow(p).width;
  Object.assign(defender, { x: p.x, y: p.y });
  assert(api.alleyWindow(p).width < rim && rim < open);
  const P = reset();
  api.alleyInput(P, { alleyX: true }, open * 0.8);
  Object.assign(defender, { x: p.x, y: p.y });
  api.alleyFinish(P, 0.95);
  assert.notEqual(P.finish.grade, 'green', 'late rotation regrades the same press at catch');
  const base = api.alleyWindow(p).width;
  TUNE.set('l1_alleyWindow', 0.15);
  assert(api.alleyWindow(p).width > base);
  p.arch = Object.values(game.ARCH).find(a => ctx.PH.PT.of(a).id === 'lob');
  assert(p.arch);
  const lob = api.alleyWindow(p).width;
  TUNE.set('l1_alleyLob', 0);
  assert(lob > api.alleyWindow(p).width);
  let fumbles = 0;
  for (let seed = 1; seed <= 64; seed++) {
    const pass = reset(seed);
    Object.assign(defender, { x: p.x, y: p.y });
    api.alleyInput(pass, {}, 0);
    api.alleyFinish(pass, 0.5);
    if (G.ball.state === 'loose') fumbles++;
  }
  assert(fumbles > 0 && fumbles < 64);
  console.log('PASS: rim/receiver defenders tighten the live window, tuning updates it, and contested no-press catches can fumble.');
}

{
  const { G, api, p, reset } = fixture();
  const counts = { green: 0, none: 0, cpu: 0 }, grades = new Set();
  const N = 128;
  for (const mode of Object.keys(counts)) for (let seed = 1; seed <= N; seed++) {
    const P = reset(seed, mode === 'cpu');
    api.alleyInput(P, mode === 'green' ? { alleyX: true } : {}, 0.015);
    api.alleyFinish(P, 0.9);
    if (mode === 'cpu') grades.add(P.finish.grade);
    for (let i = 0; i < 240 && !G.lastShot; i++) api.step(G.players.map(() => api.zeroInp()), 1 / 60);
    if (G.lastShot?.made) {
      counts[mode]++;
      assert.match(G.lastShot.name, /^空接(暴扣|上篮)$/);
    }
    if (mode === 'green') assert(p.action?.alley || G.lastShot);
  }
  assert(counts.green > counts.none + N / 3, JSON.stringify(counts));
  assert(counts.cpu > 0 && counts.cpu < N && grades.size > 1, JSON.stringify(counts));
  console.log(`PASS: ${N} seeded trials: green ${counts.green}, no press ${counts.none}, CPU ${counts.cpu} makes; CPU grades ${[...grades].sort().join('/')}.`);
}

{
  const { G, api, T3, p, from, reset } = fixture();
  reset(); p.hasBall = false; from.hasBall = true;
  Object.assign(G.ball, { holder: from.id, x: from.x, y: from.y, z: 1.4 });
  Object.assign(from.tendency, { accuracy: 1, pass: 1, vision: 1 });
  T3.tick(1 / 60, { [from.id]: { ...api.zeroInp(), pass: true, passKind: 'alley', mx: 0.7, my: 0.7 } });
  assert.equal(T3.T.pass?.to, p);
  const P = T3.T.pass;
  for (let i = 0; i < 180 && T3.T.pass; i++) {
    const press = P.duration - P.t < 0.055;
    const button = P.finish?.button === 'B' ? 'alleyB' : 'alleyX';
    T3.tick(1 / 60, { [p.id]: { ...api.zeroInp(), [button]: press } });
  }
  assert.equal(P.finish.grade, 'green');
  assert.equal(p.action?.type, 'dunk');
  assert.equal(p.action?.alley.grade, 'green');
  console.log('PASS: a real 3V3 alley pass consumes the receiver timing input and starts the shared dunk.');
}

{
  const { G, api, T5, p, from, reset } = fixture(true), T = T5.T;
  reset(); p.hasBall = false; from.hasBall = true;
  Object.assign(T, { phase: 'live', time: 5, R: {}, qPass: null });
  T5.setCtl(from, 'manual');
  Object.assign(G.ball, { holder: from.id, x: from.x, y: from.y, z: 1.4 });
  assert(T5.doPass(from, p, 'alley'));
  const P = T.ps;
  P.int = null; P.er = P.leadEr = 0; P.kf = false;
  for (let i = 0; i < 240 && T.ps; i++) {
    const button = P.finish?.button || 'X';
    T.R = { [button]: P.t >= 0 && P.T - P.t < 0.045 };
    T.E = { X: !!T.R.X, B: !!T.R.B };
    T.R.lx = T.R.ly = T.R.rx = T.R.ry = 0;
    T5.qaHumanInp(p);
    assert(!p.ib && !p.cq, 'an alley grade press must not buffer a catch-and-shoot jumper');
    T5.qaPassUpdate(1 / 120);
  }
  assert.equal(G.ball.holder, p.id);
  assert.equal(P.finish.grade, 'green');
  assert.equal(p.action?.alley.grade, 'green');
  assert.equal(p.action.type, 'dunk');
  console.log('PASS: a real 5V5 high alley catch uses the same receiver grade and finish without a chest-height catch extension.');
}

for (const five of [false, true]) {
  const { G, api, T3, T5, p, from, reset, TUNE } = fixture(five);
  reset(); p.hasBall = false; from.hasBall = true;
  Object.assign(G.ball, { holder: from.id, x: from.x, y: from.y, z: 1.4 });
  TUNE.set('l1_alleyWindow', 0.3);
  TUNE.set('l1_alleyOk', 4);
  let P, step;
  if (five) {
    Object.assign(T5.T, { phase: 'live', time: 5, R: {}, qPass: null });
    T5.setCtl(from, 'manual');
    assert(T5.doPass(from, p, 'alley'));
    P = T5.T.ps; P.int = null; P.er = P.leadEr = 0; P.kf = false;
    step = () => T5.qaPassUpdate(1 / 120);
  } else {
    Object.assign(from.tendency, { accuracy: 1, pass: 1, vision: 1 });
    T3.tick(1 / 120, { [from.id]: { ...api.zeroInp(), pass: true, passKind: 'alley', mx: 0.7, my: 0.7 } });
    P = T3.T.pass;
    step = () => T3.tick(1 / 120, {});
  }
  const duration = P.duration || P.T;
  for (let i = 0; i < 400 && G.ball.state === 'pass'; i++) step();
  assert.notEqual(G.ball.state, 'pass');
  assert(P.t <= duration + 0.2 + 1 / 120, 'even widened tuning cannot leave the ball waiting past 200ms');
  assert.equal(P.finish.error, null);
  assert.equal(P.finish.grade, 'bad');
}
console.log('PASS: 3V3/5V5 no-press catches resolve within 200ms even at maximum timing windows; 5V5 alley X does not queue a jumper.');

function soloFixture(mode = '2p') {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {}, navigator: { getGamepads: () => [] } });
  ctx.window = ctx;
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  const game = ctx.PH.game, G = game.G, api = game.t5;
  if (mode === 'train') Object.assign(G.train, { role: 'off', dummy: 'none', infStam: false });
  function reset(seed = 7, x = 0, distance = 3.5, cpu = false) {
    game.newGame({ mode, arch0: 'giannis', arch1: 'joe', target: 999 });
    game.seed(Math.imul(seed, 7919));
    Object.assign(G, { phase: 'live', phaseT: 0, needClear: false, illId: -1, off: 0, chk: null, target: 999 });
    const [p, d] = G.players;
    Object.assign(p, { x, y: api.HOOP.y - distance, vx: -x / 2, vy: 4, hasBall: true, action: null, stun: 0, z: 0, vz: 0, prev: {}, ctrl: cpu ? 'cpu' : 'p1' });
    Object.assign(p.r, { dunk: 0.99, sdunk: 0.99, vert: 0.99, hnd: 0.95 });
    Object.assign(d, { x: -6, y: 3, off: true, hasBall: false, action: null });
    Object.assign(G.ball, { state: 'held', holder: 0, x: p.x + 0.2, y: p.y, z: 1.4, dead: false });
    return { p, d };
  }
  const step = (input = {}) => game.tick(1 / 120, p => ({ ...api.zeroInp(), ...(p.id === 0 ? input : {}) }));
  return { game, G, api, TUNE: ctx.PH.TUNE, reset, step };
}

for (const mode of ['2p', 'train']) {
  const { G, api, reset, step } = soloFixture(mode), { p } = reset();
  step({ selfAlley: true, my: 1 });
  const P = G.ball.selfAlley;
  assert(P && !P.glass && !p.hasBall);
  let pressed = false;
  for (let i = 0; i < 300 && G.ball.selfAlley; i++) {
    const button = P.finish?.button === 'X' ? 'alleyX' : 'alleyB';
    pressed = pressed || P.duration - P.t < 0.04;
    step({ [button]: pressed });
  }
  assert(!G.ball.selfAlley);
  assert.equal(P.finish.grade, 'green');
  assert.equal(p.action?.alley.grade, 'green');
  assert.equal(p.action?.type, 'dunk');
  assert(!p.ib && !p.cq);
  const makes = G.stats[p.id].alley || 0;
  const duration = P.duration;
  assert(P.t <= duration + 0.2 + 1 / 120);
  api.scoreBy(p.id, 2, 'dunk', '暴扣得分', p.action);
  assert.equal(G.stats[p.id].alley, makes + 1);
  assert.equal(G.banner.text, '空接暴扣');
  console.log(`PASS: human ${mode === 'train' ? 'training' : '1V1'} self toss auto-runs to a green shared dunk without a shot buffer.`);
}

{
  const { G, api, reset, step } = soloFixture();
  for (const [x, distance] of [[0, 5.5], [2.5, 3.5]]) {
    reset(7, x, distance); step({ selfAlley: true });
    const P = G.ball.selfAlley; assert(P?.glass);
    for (let i = 0; i < 300 && G.ball.selfAlley && !P.bounced; i++) step();
    assert(P.bounced, 'glass trajectory must actually hit the backboard');
  }
  for (const distance of [1, 8]) {
    reset(7, 0, distance); step({ selfAlley: true });
    assert.equal(G.ball.state, 'held'); assert(!G.ball.selfAlley);
  }
  let pair = reset(); pair.p.vx = pair.p.vy = 0;
  step({ selfAlley: true }); assert(!G.ball.selfAlley);
  pair = reset(); G.phase = 'check'; step({ selfAlley: true }); assert(!G.ball.selfAlley);
  pair = reset(); step({ selfAlley: true });
  const P = G.ball.selfAlley;
  pair.d.off = false;
  for (let i = 0; i < 100 && G.ball.selfAlley; i++) {
    Object.assign(pair.d, { x: G.ball.x, y: G.ball.y, z: 1, stun: 0 });
    step();
  }
  assert.equal(G.ball.holder, pair.d.id);
  assert.equal(G.stats[pair.d.id].stl, 1);
  assert(!pair.p.hasBall && !G.ball.selfAlley);
  pair = reset(); step({ selfAlley: true });
  for (let i = 0; i < 300 && G.ball.selfAlley; i++) { pair.p.stun = 1; step(); }
  assert.equal(G.ball.state, 'loose', 'a failed self catch must not resume dribbling');
  assert(!pair.p.hasBall);
  console.log('PASS: self toss chooses glass by distance/angle, bounces off glass, ignores invalid range/stationary/dead-ball commands, can be intercepted, and drops failed catches loose.');
}

{
  const { G, game, reset, TUNE } = soloFixture('cpu');
  let attempts = 0;
  const N = 128;
  for (let seed = 1; seed <= N; seed++) {
    reset(seed, 0, 6, true);
    for (let i = 0; i < 180 && !G.ball.selfAlley && !G.players[0].action && G.phase === 'live'; i++) game.tick(1 / 120);
    if (G.stats[0].selfAlley) {
      attempts++;
      const P = G.ball.selfAlley;
      for (let i = 0; i < 300 && G.ball.selfAlley; i++) game.tick(1 / 120);
      assert(P.finish.grade);
      assert(G.players[0].action?.alley || G.ball.state === 'loose' || G.lastShot);
    }
  }
  assert(attempts > 0 && attempts < N, `CPU self tosses ${attempts}/${N}`);
  TUNE.set('l1_selfAlleyCpu', 0);
  reset(7, 0, 6, true);
  for (let i = 0; i < 180 && !G.players[0].action && G.phase === 'live'; i++) game.tick(1 / 120);
  assert(!G.stats[0].selfAlley);
  console.log(`PASS: seeded CPU 1V1 approaches self-toss ${attempts}/${N} times; zero attempt-rate tuning disables it.`);
}
