const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const dt = 1 / 60;
function fixture(mode) {
  let seed = 7;
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ctx = vm.createContext({ console, Math: math, Date: class extends Date { static now() { return 7; } }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
  ctx.charges = [];
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
    let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game' && process.env.CPU_STAMINA_BASE) {
      source = execFileSync('git', ['show', process.env.CPU_STAMINA_BASE + ':js/game.js'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
      source = source.replace(/(\w+)\.stam = Math.max\(0, \1\.stam - /g, 'spendStamina($1, ')
        .replace('  function stamK(', '  function spendStamina(pl, cost) { pl.stam = Math.max(0, pl.stam - cost); }\n  function stamK(');
    }
    if (name === 'game') source = source.replace('PH.game = {', 'PH.cpuQA = { updatePlayer, collide, fat, bodyPow }; PH.game = {')
      .replace('function spendStamina(pl, cost) {', 'function spendStamina(pl, cost) { window.charges.push({ id: pl.id, ctrl: pl.ctrl, cost, action: pl.action?.type });');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  const { game: gm, T5, T3 } = ctx.PH;
  gm.seed(7);
  if (mode === 't5') T5.start({ home: 'LAL', away: 'BOS', human: -1, qlen: 720 });
  else if (mode === 't3') T3.start({ slots: Array.from({ length: 6 }, () => ({ arch: 'lebron', role: 'cpu' })), target: 999, clock: 24, replay: false });
  else gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'lebron', target: 999 });
  gm.t5.checkStep(9);
  const G = gm.G;
  Object.assign(G, { phase: 'live', needClear: false, intro: null, tips: null });
  return { ctx, gm, G, qa: ctx.PH.cpuQA, T5, T3 };
}

function scenario(mode, ctrl, kind, stamina = 100) {
  const f = fixture(mode), { ctx, gm, G, qa } = f;
  ctx.PH.TUNE.load({ l1_stamRegen: kind === 'recovery' ? 1.68 : 0 });
  const p = G.players[0], d = G.players.find(q => gm.t5.TM(q) !== gm.t5.TM(p));
  for (const q of G.players) q.off = q !== p && q !== d;
  Object.assign(p, { ctrl, x: 0, y: 5, z: 0, vx: 0, vy: 0, speed: 2, stam: stamina, hasBall: true, action: null, post: false, stun: 0, cd: 0, opp: d, prev: {} });
  p.arch = { ...p.arch, key: 'qa', skill: null, _bt: {} };
  Object.assign(p.r, { sta: 0.5, badges: [] });
  Object.assign(d, { x: 4, y: 5, z: 0, vx: 0, vy: 0, hasBall: false, action: null, stun: 0, opp: p });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  let o = { ...gm.t5.zeroInp() };
  if (kind === 'dribble') o = { ...o, a3: true, dx: 1 };
  if (kind === 'sprint') o = { ...o, mx: 1, sprint: true };
  if (kind === 'post') o = { ...o, my: 1, post: true };
  if (kind === 'steal' || kind === 'jump') {
    p.hasBall = false; d.hasBall = true; G.ball.holder = d.id;
    o[kind === 'steal' ? 'a2' : 'a1'] = true;
  }
  if (kind === 'off') p.off = true;
  if (kind === 'sustained sprint') {
    for (let i = 0; i < 600; i++) {
      p.x = 0; p.y = 5;
      qa.updatePlayer(p, { ...o, mx: 1, sprint: true }, dt);
    }
  }
  if (kind === 'contact' || kind === 'post contact') {
    Object.assign(p, { hasBall: false, y: 6.7, stance: true });
    Object.assign(d, { hasBall: true, x: 0, y: 6.1, vy: 0.45, post: kind === 'post contact' });
    G.ball.holder = d.id;
    qa.collide(d, p);
  } else if (kind !== 'sustained sprint') qa.updatePlayer(p, o, dt);
  const cost = ctx.charges.filter(c => c.id === p.id).reduce((n, c) => n + c.cost, 0);
  return { drop: stamina - p.stam, cost, action: p.action?.type, fatigue: qa.fat(p), power: qa.bodyPow(p) };
}

for (const mode of ['cpu', 't5', 't3']) {
  for (const kind of ['dribble', 'sprint', 'sustained sprint', 'contact', 'post contact', 'post', 'steal', 'jump', 'idle', 'off', 'recovery']) {
    const stamina = kind === 'recovery' ? 20 : 100;
    const human = scenario(mode, 'p1', kind, stamina), cpu = scenario(mode, 'cpu', kind, stamina);
    assert.deepEqual(cpu, human, `${mode} ${kind}: CPU must use exactly the human rules`);
    if (['idle', 'off'].includes(kind)) assert.equal(cpu.drop, 0);
    else if (kind === 'recovery') assert(cpu.drop < 0);
    else { assert(cpu.drop > 0, `${mode} ${kind} must drain CPU stamina`); assert(Math.abs(cpu.drop - cpu.cost) < 1e-9); }
    if (kind === 'sustained sprint') assert(cpu.drop > 95, 'CPU must be able to exhaust its stamina');
    console.log(`PASS ${mode} ${kind}: human=${human.drop.toFixed(6)} CPU=${cpu.drop.toFixed(6)}`);
  }
  for (const kind of ['dribble', 'jump']) {
    const human = scenario(mode, 'p1', kind, 0), cpu = scenario(mode, 'cpu', kind, 0);
    assert.deepEqual(cpu, human);
    assert.equal(cpu.action, undefined, 'exhausted players cannot start moves/jumps');
    assert.equal(cpu.drop, 0, 'stamina cannot underflow');
  }
  const tired = scenario(mode, 'cpu', 'sprint', 3), fresh = scenario(mode, 'cpu', 'sprint');
  assert.equal(tired.cost, 0, 'sprint unavailable at exhaustion threshold');
  assert(tired.fatigue > fresh.fatigue && tired.power < fresh.power, 'CPU fatigue affects movement/accuracy and contact power');
  console.log(`PASS ${mode} exhaustion, action gates, fatigue penalties and zero clamp`);
}

for (const mode of ['cpu', 't5', 't3']) {
  const { ctx, gm, G, T5, T3 } = fixture(mode);
  let minStamina = 100;
  for (let i = 0; i < 2400; i++) {
    if (mode === 't5') T5.tick(dt);
    else if (mode === 't3') T3.tick(dt);
    else gm.tick(dt);
    for (const p of G.players) if (p.ctrl === 'cpu') minStamina = Math.min(minStamina, p.stam);
  }
  const cpu = ctx.charges.filter(c => c.ctrl === 'cpu' && c.cost > 0);
  assert(cpu.length > 0, `${mode} autonomous AI reaches shared stamina spending`);
  assert(cpu.some(c => c.action === 'move'), `${mode} autonomous dribble moves pay stamina`);
  assert(cpu.some(c => !c.action), `${mode} autonomous movement/contact pays stamina`);
  assert(minStamina < 99, `${mode} CPU stamina actually falls`);
  console.log(`PASS ${mode} autonomous AI: ${cpu.length} paid actions, ${cpu.filter(c => c.action === 'move').length} move charges, minimum stamina=${minStamina.toFixed(2)}`);
}
