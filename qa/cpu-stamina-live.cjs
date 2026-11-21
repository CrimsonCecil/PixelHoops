const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.CPU_STAMINA_PROFILE ||= path.join(__dirname, 'cpu-stamina-c1.json');
const { fixture } = require('./cpu-stamina.cjs');
const dt = 1 / 60;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const round = n => +n.toFixed(4);

function matchedMove(ctrl, held, cpuD, diff = 2) {
  const { ctx, gm, G, qa } = fixture('cpu', { diff, cpuD, arch0: 'kyrie', arch1: 'kyrie' });
  const p = G.players[ctrl === 'cpu' ? 1 : 0], d = G.players[1 - p.id];
  if (cpuD) assert.equal(G.players[1].D, cpuD, 'newGame must install King cpuD on player 1');
  G.off = p.id; G.ball.holder = p.id;
  Object.assign(p, { ctrl, stam: 60, speed: 2, x: 0, y: 5, vx: 0, vy: 0, hasBall: true, opp: d });
  Object.assign(d, { off: true, opp: p });
  let gross = 0, elapsed = 0;
  qa.updatePlayer(p, { ...gm.t5.zeroInp(), mx: held ? 0.5 : 0, a3: true, dx: 1 }, dt);
  assert.equal(p.action?.type, 'move');
  gross = ctx.charges.reduce((s, c) => s + (c.id === p.id ? c.cost : 0), 0);
  while (p.action && elapsed < 2) {
    qa.updatePlayer(p, { ...gm.t5.zeroInp(), mx: held ? 0.5 : 0 }, dt);
    G.time += dt; elapsed += dt;
  }
  return { gross: round(gross), net: round(60 - p.stam), seconds: round(elapsed), final: round(p.stam) };
}

const base = fixture('cpu').gm;
const mainSource = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const kingD = new Function('GM', mainSource.match(/^  const KING_AI = .*;$/m)[0] + '\n' + mainSource.match(/^  const KING_T = .*$/m)[0] + '\n' + mainSource.slice(mainSource.indexOf('  function kingD('), mainSource.indexOf('  function kingLadderView(')) + '\nreturn kingD;')(base);
const difficulties = [null, ...Array.from({ length: 5 }, (_, i) => kingD(i))];
const matched = {};
for (const held of [false, true]) {
  const human = matchedMove('p1', held), cpu = matchedMove('cpu', held);
  assert.deepEqual(cpu, human, 'same input and action must have identical stamina');
  for (const diff of [0, 1, 2]) assert.deepEqual(matchedMove('cpu', held, null, diff), cpu, 'ordinary difficulty must not change stamina accounting');
  for (const D of difficulties) assert.deepEqual(matchedMove('cpu', held, D), cpu, 'King cpuD must not change stamina accounting');
  matched[held ? 'held' : 'released'] = cpu;
}
console.log('MATCHED C1 move ' + JSON.stringify(matched));
assert.deepEqual(matched.released, matched.held, 'scripted move recovery must not depend on holding a movement input');

for (const mode of ['cpu', 't5', 't3']) {
  for (const ctrl of ['p1', 'cpu']) {
    for (const state of ['idle', 'moving', 'post', 'pressure', 'low']) {
      const { gm, G, qa } = fixture(mode), p = G.players[0];
      Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
      Object.assign(p, { ctrl, hasBall: true, speed: state === 'moving' ? 2 : 0, stam: state === 'low' ? 20 : 60, action: null, post: state === 'post', ctT: state === 'pressure' ? G.time : -9 });
      const before = p.stam;
      qa.updatePlayer(p, { ...gm.t5.zeroInp(), post: state === 'post' }, dt);
      const rate = state === 'pressure' ? 0 : state === 'post' ? gm.K.stRgPost : state === 'moving' ? gm.K.stRgMove : gm.K.stRgIdle;
      const expected = rate * (state === 'low' ? 1.2 : 1) * gm.CFG.stamRegen * dt;
      assert(Math.abs(p.stam - before - expected) < 1e-8, `${mode}/${ctrl}/${state}: recovery classification`);
    }
  }
}
console.log('PASS recovery: idle, physical movement without input, post, pressure delay and low stamina in 1V1/5V5/3V3');

function scripted(p, G, gm) {
  const o = { ...gm.t5.zeroInp() }, d = G.players[1 - p.id];
  if (G.phase !== 'live') return o;
  if (p.hasBall) {
    const phase = Math.floor(G.time / 0.8), side = phase % 2 ? 1 : -1;
    o.mx = -p.x * 0.3 + side * 0.35;
    o.my = p.y > 11 ? -0.5 : 0.65;
    const l = Math.max(1, Math.hypot(o.mx, o.my)); o.mx /= l; o.my /= l;
    o.sprint = !p.action && phase % 4 === 3;
    o.a3 = Math.floor(G.time * 60) % 48 === 0;
    if (o.a3) { o.dx = side; o.dy = 0; }
    if (gm.distHoop(p) < 3 && !p.action && phase % 4 === 3) o.a1 = true;
    if (p.action?.type === 'shot' || p.action?.type === 'layup') o.a1 = p.action.t < p.action.ideal;
  } else {
    const dx = d.x - p.x, dy = d.y - p.y, l = Math.hypot(dx, dy) || 1;
    o.mx = dx / Math.max(l, 0.8); o.my = dy / Math.max(l, 0.8); o.a3 = true; o.sprint = l > 2;
  }
  return o;
}

const csv = ['game,time,id,ctrl,role,stam,action,inputMoving,speed,pressureDelayed'];
for (const first of [0, 1]) {
  const { ctx, gm, G } = fixture('cpu', { diff: 2, arch0: 'kyrie', arch1: 'kyrie' });
  gm.giveBall(); G.off = first; G.ball.holder = first; G.ball.lastTouch = first;
  for (const p of G.players) p.hasBall = p.id === first;
  assert(G.players[first].hasBall && G.ball.holder === first, 'requested attacker starts with possession');
  Object.assign(G.players[first], { x: 0, y: 5 });
  Object.assign(G.players[1 - first], { x: 0, y: 6.1 });
  const samples = [[], []], starts = new Map(), completed = [[], []];
  let nextSample = 0, previous = G.players.map(p => p.action);
  for (let i = 0; i < 7200; i++) {
    if (G.phase === 'check') gm.t5.checkStep(9);
    gm.tick(dt, p => scripted(p, G, gm));
    for (const p of G.players) {
      if (p.action !== previous[p.id]) {
        const old = starts.get(previous[p.id]);
        if (old) { completed[p.id].push(old.before - p.stam); starts.delete(previous[p.id]); }
        if (p.action?.type === 'move') {
          const m = ctx.moveCharges.findLast(m => m.id === p.id && Math.abs(m.t - G.time) < 0.001);
          if (m) starts.set(p.action, { before: ctx.charges[m.index].before });
        }
      }
      previous[p.id] = p.action;
    }
    if (G.time >= nextSample) {
      nextSample = G.time + 0.1 - 1e-8;
      for (const p of G.players) {
        const inp = ctx.inputFrames.findLast(q => q.id === p.id);
        const row = { time: round(G.time), stam: p.stam, role: G.off === p.id ? 'attack' : 'defend', moving: !!inp?.moving, action: p.action?.type || '', speed: p.speed, delayed: p.ctT <= G.time && p.ctT > G.time - gm.K.bdPbCd * 2 };
        samples[p.id].push(row);
        csv.push([first, row.time, p.id, p.ctrl, row.role, round(p.stam), row.action, +row.moving, round(row.speed), +row.delayed].join(','));
      }
    }
  }
  for (const p of G.players) {
    const s = samples[p.id], moves = ctx.moveCharges.filter(m => m.id === p.id), moveFrames = ctx.inputFrames.filter(q => q.id === p.id && q.action === 'move');
    const out = { firstAttacker: first, ctrl: p.ctrl, samples: s.length, min: round(Math.min(...s.map(s => s.stam))), mean: round(mean(s.map(s => s.stam))), moveCount: moves.length, meanGrossPerMove: round(mean(moves.map(m => ctx.charges[m.index].cost))), meanNetPerMove: round(mean(completed[p.id])), moveIdleInputPct: round(100 * mean(moveFrames.map(q => +!q.moving))), physicallyMovingButIdleFrames: moveFrames.filter(q => !q.moving && q.speed > 0.7).length, defenseMean: round(mean(s.filter(s => s.role === 'defend').map(s => s.stam))), defensePressureSamples: s.filter(s => s.role === 'defend' && s.delayed).length };
    assert(s.length > 500 && moves.length > 0, 'both controllers must dribble in realistic series');
    console.log('SERIES C1 ' + JSON.stringify(out));
  }
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], csv.join('\n') + '\n');

function pressure(defenderCtrl) {
  const { gm, G, qa } = fixture('cpu', { arch0: 'kyrie', arch1: 'kyrie' });
  const [h, d] = G.players;
  Object.assign(h, { x: 0, y: 5.5, hasBall: true, opp: d });
  Object.assign(d, { x: 0, y: 6.7, hasBall: false, opp: h, ctrl: defenderCtrl });
  const samples = [];
  for (let i = 0; i < 600; i++) {
    G.time += dt;
    qa.updatePlayer(h, { ...gm.t5.zeroInp(), my: 0.35 }, dt);
    qa.updatePlayer(d, { ...gm.t5.zeroInp(), a3: true }, dt);
    qa.collide(h, d);
    if (i % 6 === 0) samples.push(d.stam);
  }
  return { min: round(Math.min(...samples)), mean: round(mean(samples)), final: round(d.stam) };
}
const humanPressure = pressure('p1'), cpuPressure = pressure('cpu');
assert.deepEqual(cpuPressure, humanPressure, 'identical C1 pressure must charge and delay recovery for either defender');
console.log('PRESSURE C1 ' + JSON.stringify({ human: humanPressure, cpu: cpuPressure }));

// Identical drawing calls for both players: immediate fill, 0.6s damage ghost.
const { ctx } = fixture('cpu');
const calls = [], canvas = { fillRect(...r) { calls.push({ color: this.fillStyle, alpha: this.globalAlpha, r }); } };
for (const key of ['human', 'cpu']) {
  calls.length = 0;
  ctx.PH.stamBar(canvas, 0, 0, 30, 2, 100, key, 0);
  ctx.PH.stamBar(canvas, 0, 0, 30, 2, 92, key, 0.1);
  const memory = ctx.PH.stamBar.STB.mem.get(key);
  assert.equal(memory.last, 92); assert.equal(memory.g, 100);
  assert(calls.some(c => c.alpha === 0.85 && c.r[2] === 2), '8-point drain leaves 2px ghost in 30px bar');
}
console.log('PASS HUD: both players read actual stamina immediately with identical 0.6s ghost; 8-point drain is only 2 pixels');
