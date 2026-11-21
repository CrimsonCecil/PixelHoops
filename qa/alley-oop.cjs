const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(five = false) {
  const events = {}, pad = { index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener: (k, fn) => { events[k] = fn; }, navigator: { getGamepads: () => [pad] } });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'input', 'roster', 'measurements', 'r5', 'game', ...(five ? ['b5', 'team5'] : ['team3'])]) {
    let code = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'team5') code = code.replace('doPass: doPass,', 'doPass: doPass, qaPassUpdate: passUpdate, qaHumanInp: humanInp,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  return { ctx, pad, events, game: ctx.PH.game, G: ctx.PH.game.G, api: ctx.PH.game.t5, input: ctx.PH.input, TUNE: ctx.PH.TUNE, T3: ctx.PH.T3, T5: ctx.PH.T5 };
}

function fixture(five = false) {
  const f = load(five), { game, G, api, T3, T5 } = f;
  if (five) T5.start({ home: 'LAL', away: 'BOS', human: 0 });
  else T3.start({ slots: ['curry', 'edwards', 'jokic', 'luka', 'kobe', 'giannis'].map(arch => ({ arch, role: 'human' })), replay: false, clock: 0, target: 999 });
  const p = G.players[1], from = G.players[0];
  function reset(seed = 7, cpu = false) {
    game.seed(Math.imul(seed, 7919));
    Object.assign(G, { phase: 'live', time: 5, needClear: false, illId: -1, off: 0, floats: [], lastShot: null, shotClock: 24, replay: null });
    Object.assign(G.fx, { hit: 0, slow: 0 });
    for (const q of G.players) Object.assign(q, { x: q.tm ? 7 : -7, y: 3, z: 0, vz: 0, vx: 0, vy: 0, hasBall: false, action: null, stun: 0, off: false, stam: 100, ib: null, cq: null, finQ: null, ctrl: 'p1', prev: { a1: false, a2: false, a3: false } });
    Object.assign(p, { x: 0, y: api.HOOP.y - 2, vy: 4, ctrl: cpu ? 'cpu' : 'p1', h: 2.1 });
    Object.assign(p.r, { dunk: 0.98, sdunk: 0.98, vert: 0.95, leap: 0.95, lay: 0.9, hnd: 0.9 });
    Object.assign(from, { x: -3, y: api.HOOP.y - 5 });
    Object.assign(G.ball, { state: 'held', holder: p.id, x: p.x, y: p.y, z: 2.5, vx: 0, vy: 0, vz: 0, dead: false, shot: null, wasShot: false, noPick: 0 });
    p.hasBall = true;
    return { kind: 'alley', from, to: p, duration: 0.6, T: 0.6, t: 0 };
  }
  return { ...f, p, from, reset };
}

{
  const { G, input, pad, events, ctx } = load();
  const room = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
  const clean = vm.runInContext(room.slice(room.indexOf('  function cleanInput('), room.indexOf('  function incoming(')) + '\ncleanInput;', ctx);
  assert(!('alleyX' in clean({ alleyX: true, alleyB: true })));
  assert(!('alleyB' in input.read3(true)));
  for (const team of [false, true]) {
    input.flush();
    const read = () => team ? input.read3(true) : input.read(0, true, false);
    G.time = 1; pad.buttons[0].pressed = true;
    let o = read(); assert(!o.selfAlley && o.passKind !== 'alley');
    pad.buttons[0].pressed = false; read();
    pad.buttons[3].pressed = true; o = read();
    assert(!o.a2 && !o.selfAlley && o.passKind !== 'alley');
    pad.buttons[3].pressed = false; G.time += 0.1; read();
    pad.buttons[3].pressed = true; G.time += 0.05; o = read();
    assert(!o.a2);
    assert(team ? o.pass && o.passKind === 'alley' : o.selfAlley);
    pad.buttons[3].pressed = false; read();
    input.flush();
    G.time += 1; pad.buttons[3].pressed = true; read();
    G.time += 0.26; o = read();
    assert(o.a2 && !o.selfAlley && o.passKind !== 'alley', 'single/held Y preserves normal finishing');
    G.time += 0.1; assert(read().a2);
    pad.buttons[3].pressed = false; read();
    input.flush();
    G.time += 1; pad.buttons[3].pressed = true; read();
    pad.buttons[3].pressed = false; G.time += 0.05; read();
    G.time += 0.21; assert(read().a2, 'a released single tap still starts the ordinary finish');
    assert(!read().a2);
  }
  events.keydown({ code: 'KeyV' }); assert(input.read(0, true, false).selfAlley);
  events.keydown({ code: 'Numpad4' }); assert(input.read(1, true, false).selfAlley);
  console.log('PASS: double-tap Y initiates alleys; single A/Y do not; single/held Y preserves finishing, V/Num4 remain, receiver inputs are removed.');
}

{
  const { G, api, p, reset, TUNE } = fixture();
  const counts = { high: 0, low: 0 }, green = { high: 0, low: 0 }, grades = new Set();
  const N = 128;
  for (const mode of ['high', 'low']) for (let seed = 1; seed <= N; seed++) {
    const P = reset(seed);
    if (mode === 'low') Object.assign(p.r, { dunk: 0.15, sdunk: 0.15, vert: 0.15, hnd: 0.15, lay: 0.3 });
    assert(api.alleyFinish(P, mode === 'high' ? 0.95 : 0.2));
    assert(p.action?.alley && !p.ib && !p.cq);
    grades.add(P.finish.grade);
    if (P.finish.grade === 'green') green[mode]++;
    if (mode === 'high') {
      const grade = P.finish.grade, error = P.finish.error;
      const cpu = reset(seed, true); api.alleyFinish(cpu, 0.95);
      assert.equal(cpu.finish.grade, grade); assert.equal(cpu.finish.error, error, 'human and CPU use identical seeded grading');
    }
    for (let i = 0; i < 240 && !G.lastShot; i++) api.step(G.players.map(() => api.zeroInp()), 1 / 60);
    assert(G.lastShot, 'automatic layup/dunk must complete without input');
    if (G.lastShot.made) { counts[mode]++; assert.match(G.lastShot.name, /^空接(暴扣|上篮)$/); }
    assert(!G.floats.some(f => f.alleyPrompt));
  }
  assert(green.high > green.low && counts.high > counts.low, JSON.stringify({ counts, green }));
  assert(counts.high > 0 && counts.high < N && grades.size > 1);
  const P = reset(); api.alleyFinish(P, 0.95);
  const makes = G.stats[p.id].alley || 0;
  api.scoreBy(p.id, 2, 'dunk', '暴扣得分', p.action);
  assert.equal(G.banner.text, '空接暴扣'); assert.equal(G.stats[p.id].alley, makes + 1);
  api.scoreBy(p.id, 2, 'lay', '上篮', p.action);
  assert.equal(G.banner.text, '空接上篮'); assert.equal(G.stats[p.id].alley, makes + 2);
  assert(!TUNE.list().some(d => d.k === 'l1_alleyWait'));
  console.log(`PASS: ${N} seeded automatic finishes: high ${counts.high} makes/${green.high} green, low ${counts.low} makes/${green.low} green; human/CPU grading identical, names/stats retained.`);
}

{
  const { ctx, game, G, api, p, reset, TUNE } = fixture();
  reset(); const open = api.alleyWindow(p).width, d = G.players[3];
  Object.assign(d, { x: 0, y: api.HOOP.y - 0.1 });
  const rim = api.alleyWindow(p).width;
  Object.assign(d, { x: p.x, y: p.y }); assert(api.alleyWindow(p).width < rim && rim < open);
  const base = api.alleyWindow(p).width;
  TUNE.set('l1_alleyWindow', 0.15); assert(api.alleyWindow(p).width > base);
  p.arch = Object.values(game.ARCH).find(a => ctx.PH.PT.of(a).id === 'lob'); assert(p.arch);
  const lob = api.alleyWindow(p).width;
  TUNE.set('l1_alleyLob', 0); assert(lob > api.alleyWindow(p).width);
  let fumbles = 0;
  for (let seed = 1; seed <= 128; seed++) {
    const P = reset(seed); Object.assign(d, { x: p.x, y: p.y });
    Object.assign(p.r, { dunk: 0.1, vert: 0.1, hnd: 0.1 });
    api.alleyFinish(P, 0.1); if (G.ball.state === 'loose') fumbles++;
  }
  assert(fumbles > 0 && fumbles < 128);
  console.log('PASS: pressure, lob type and tuning still affect automatic grade thresholds; contested weak catches can fumble.');
}

for (const five of [false, true]) {
  const { G, api, T3, T5, p, from, reset, input, pad } = fixture(five);
  reset(); p.hasBall = false; from.hasBall = true;
  Object.assign(G.ball, { holder: from.id, x: from.x, y: from.y, z: 1.4 });
  let P, step;
  if (five) {
    Object.assign(T5.T, { phase: 'live', time: 5, R: {}, E: {}, qPass: null });
    T5.setCtl(from, 'manual'); assert(T5.doPass(from, p, 'alley'));
    P = T5.T.ps; P.int = null; P.er = P.leadEr = 0; P.kf = false;
    step = () => { T5.qaHumanInp(p); T5.qaPassUpdate(1 / 120); };
  } else {
    Object.assign(from.tendency, { accuracy: 1, pass: 1, vision: 1 });
    const tick = () => T3.tick(1 / 120, { [from.id]: { ...input.read3(true), mx: 0.7, my: 0.7 } });
    pad.buttons[3].pressed = true; tick(); assert(!T3.T.pass);
    pad.buttons[3].pressed = false; tick();
    pad.buttons[3].pressed = true; tick(); pad.buttons[3].pressed = false;
    P = T3.T.pass; assert.equal(P?.kind, 'alley'); assert.equal(P.to, p);
    step = () => T3.tick(1 / 120, {});
  }
  for (let i = 0; i < 400 && G.ball.state === 'pass'; i++) step();
  assert.equal(G.ball.holder, p.id); assert.equal(p.action?.type, 'dunk');
  assert(p.action.alley && P.finish.grade !== 'bad');
  assert(P.t <= (P.duration || P.T) + 1 / 120, 'catch resolves immediately, without waiting for input');
  assert(!p.ib && !p.cq && !G.floats.some(f => f.alleyPrompt));
  console.log(`PASS: real ${five ? '5V5' : '3V3 double-Y'} alley auto-finishes a human catch without input, prompt, shot buffer or catch delay.`);
}

function soloFixture(mode = '2p') {
  const f = load(), { game, G, api } = f;
  if (mode === 'train') Object.assign(G.train, { role: 'off', dummy: 'none', infStam: false });
  function reset(seed = 7, x = 0, distance = 3.5, cpu = false) {
    game.newGame({ mode, arch0: 'giannis', arch1: 'joe', target: 999 });
    game.seed(Math.imul(seed, 7919)); f.input.flush();
    Object.assign(G, { phase: 'live', phaseT: 0, needClear: false, illId: -1, off: 0, chk: null, target: 999 });
    const [p, d] = G.players;
    Object.assign(p, { x, y: api.HOOP.y - distance, vx: -x / 2, vy: 4, hasBall: true, action: null, stun: 0, z: 0, vz: 0, prev: {}, ctrl: cpu ? 'cpu' : 'p1' });
    Object.assign(p.r, { dunk: 0.99, sdunk: 0.99, vert: 0.99, hnd: 0.95 });
    Object.assign(d, { x: -6, y: 3, off: true, hasBall: false, action: null });
    Object.assign(G.ball, { state: 'held', holder: 0, x: p.x + 0.2, y: p.y, z: 1.4, dead: false });
    return { p, d };
  }
  const step = (input = {}) => game.tick(1 / 120, p => ({ ...api.zeroInp(), ...(p.id === 0 ? input : {}) }));
  return { ...f, reset, step };
}

for (const mode of ['2p', 'train']) {
  const { G, game, api, reset, pad } = soloFixture(mode), { p } = reset();
  pad.buttons[0].pressed = true; game.tick(1 / 120); assert(!G.ball.selfAlley);
  pad.buttons[0].pressed = false;
  pad.buttons[3].pressed = true; game.tick(1 / 120); assert(!G.ball.selfAlley && !p.action);
  pad.buttons[3].pressed = false; game.tick(1 / 120);
  pad.buttons[3].pressed = true; game.tick(1 / 120); pad.buttons[3].pressed = false;
  const P = G.ball.selfAlley; assert(P && !P.glass && !p.hasBall);
  for (let i = 0; i < 300 && G.ball.selfAlley; i++) game.tick(1 / 120);
  assert(!G.ball.selfAlley && p.action?.alley && p.action.type === 'dunk');
  assert(!p.ib && !p.cq && P.t <= P.duration + 1 / 120);
  assert(!G.floats.some(f => f.alleyPrompt));
  const makes = G.stats[p.id].alley || 0;
  api.scoreBy(p.id, 2, 'dunk', '暴扣得分', p.action);
  assert.equal(G.stats[p.id].alley, makes + 1); assert.equal(G.banner.text, '空接暴扣');
  console.log(`PASS: human ${mode === 'train' ? 'training' : '1V1'} double-Y self toss auto-runs and finishes without receiver input; A/single Y do not toss.`);
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
  pair.d.off = false;
  for (let i = 0; i < 100 && G.ball.selfAlley; i++) {
    Object.assign(pair.d, { x: G.ball.x, y: G.ball.y, z: 1, stun: 0 }); step();
  }
  assert.equal(G.ball.holder, pair.d.id); assert.equal(G.stats[pair.d.id].stl, 1);
  assert(!pair.p.hasBall && !G.ball.selfAlley);
  pair = reset(); step({ selfAlley: true });
  for (let i = 0; i < 300 && G.ball.selfAlley; i++) { pair.p.stun = 1; step(); }
  assert.equal(G.ball.state, 'loose', 'a failed self catch must not resume dribbling'); assert(!pair.p.hasBall);
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
  TUNE.set('l1_selfAlleyCpu', 0); reset(7, 0, 6, true);
  for (let i = 0; i < 180 && !G.players[0].action && G.phase === 'live'; i++) game.tick(1 / 120);
  assert(!G.stats[0].selfAlley);
  console.log(`PASS: seeded CPU 1V1 approaches self-toss ${attempts}/${N} times; zero attempt-rate tuning disables it.`);
}
