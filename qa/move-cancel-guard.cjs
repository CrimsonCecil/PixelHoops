// 运球招式打断保护：同招不互断（mvSame，默认关：同一招也按换招死区）、换招基础死区（mvDead）、右摇杆换向角度（rsTurn）；高控球急停干拔不受死区限制
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dt = 1 / 60;

function fixture(base, knobs = {}, hnd = 0.8) {
  const pad = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const ctx = vm.createContext({ navigator: { getGamepads: () => [pad] }, performance: { now: () => 0 }, setTimeout() {}, addEventListener() {} });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game']) {
    const src = base && name === 'game' ? execFileSync('git', ['show', base + ':js/game.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    vm.runInContext(src, ctx, { filename: name + '.js' });
  }
  const { game: gm, TUNE: tune } = ctx.PH;
  tune.set('l1_moveCost', 10);
  for (const k in knobs) tune.set('l1_' + k, knobs[k]);
  gm.seed(7);
  gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
  const G = gm.G, p = G.players[0];
  Object.assign(G, { phase: 'live', intro: null, needClear: false, off: p.id });
  for (const o of G.players) if (o !== p) Object.assign(o, { hasBall: false, x: 6, y: 2, stun: 30 });
  Object.assign(p, { x: 0, y: ctx.PH.render.HOOP.y - 6, hasBall: true, action: null, stun: 0, cd: 0, stam: 100, z: 0, vz: 0, vx: 0, vy: 0, speed: 0 });
  p.r.hnd = hnd;
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false, wasShot: false });
  const moves = [];
  let last = null, spent = 0;
  const step = (x = 0, y = 0, shoot = false) => {
    pad.axes[2] = x; pad.axes[3] = -y; pad.buttons[2].pressed = shoot;
    const s0 = p.stam; gm.tick(dt); spent += Math.max(0, s0 - p.stam);
    if (p.action && p.action !== last && p.action.type === 'move') moves.push({ t: +G.time.toFixed(3), name: p.action.mv || p.action.kind });
    last = p.action;
  };
  return { gm, G, p, step, moves, spent: () => spent };
}

const deg = (a) => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
// 推杆抖动：0.2 秒内在 22.5° 扇区边界两侧来回晃（人以为一直推着同一个方向）
function wobble(f) { for (let i = 0; i < 12; i++) f.step(...deg(i % 4 < 2 ? 18 : 27)); for (let i = 0; i < 60; i++) f.step(); }
// 同方向快速连拨四下
function flicks(f) { for (let n = 0; n < 4; n++) { for (let i = 0; i < 3; i++) f.step(1, 0); for (let i = 0; i < 3; i++) f.step(); } for (let i = 0; i < 60; i++) f.step(); }
// 左右交替快拨（不同方向，每 0.067 秒一下）
function alternate(f) { for (let n = 0; n < 6; n++) { for (let i = 0; i < 2; i++) f.step(n % 2 ? -1 : 1, 0); for (let i = 0; i < 2; i++) f.step(); } for (let i = 0; i < 60; i++) f.step(); }

const OFF = { mvDead: 0, mvSame: 0, rsTurn: 0, rsSnap: 0, rsSettle: 0 };
const out = {};
for (const [name, run] of [['wobble', wobble], ['flicks', flicks], ['alternate', alternate]]) {
  const r = {};
  for (const [tag, base, knobs] of [['main', '3ddbcd8', {}], ['off', null, OFF], ['new', null, {}]]) {
    const f = fixture(base, knobs); const t0 = f.G.time;
    run(f);
    r[tag] = { moves: f.moves.map((m) => ({ t: +(m.t - t0).toFixed(3), name: m.name })), stam: +f.spent().toFixed(1) };
  }
  assert.deepEqual(r.off, r.main, name + ': knobs off reproduce main');
  out[name] = r;
  console.log(`${name}: main ${r.main.moves.length} moves / -${r.main.stam} stamina → now ${r.new.moves.length} moves / -${r.new.stam} stamina`);
}
assert(out.wobble.main.moves.length >= 3, 'repro: stick wobble used to fire the same move repeatedly');
assert.equal(out.wobble.new.moves.length, 1, 'stick wobble inside rsTurn is one move');
assert(out.flicks.main.moves.length >= 4, 'repro: four quick same-direction flicks used to give four moves');
{
  const same = (knobs) => { const f = fixture(null, knobs); f.step(1, 0); const a = f.p.action; f.step(); f.step(1, 0);
    for (let i = 0; f.p.action === a && i < 120; i++) f.step(); return { a, K: f.gm.K }; };
  const d = same({});
  assert(d.a.t >= d.a.T * d.K.mvDead - 1e-9 && d.a.t < d.a.T * d.K.mvDead + dt + 1e-9, 'same move cancels itself at the base dead zone by default');
  const s = same({ mvSame: 1 });
  assert(s.a.t >= s.a.T - 1e-9, 'mvSame on: same move only follows after the first one finishes');
  console.log(`PASS same move cancels at mvDead=${d.K.mvDead} (progress ${(d.a.t / d.a.T).toFixed(2)}); mvSame on waits for the end`);
}
{
  const f = fixture(null, {}); f.step(1, 0); const a = f.p.action; f.step(); f.step(-1, 0);
  for (let i = 0; f.p.action === a && i < 120; i++) f.step();
  assert.notEqual(f.p.action, a); assert(a.t >= a.T * f.gm.K.mvDead - 1e-9 && a.t < a.T * f.gm.K.mvDead + dt + 1e-9, 'another move cancels exactly at the base dead zone');
  console.log(`PASS different move cancels at mvDead=${f.gm.K.mvDead} (progress ${(a.t / a.T).toFixed(2)})`);
}
{
  const f = fixture(null, {}, 0.99); f.step(1, 0); const a = f.p.action; f.step(); f.step(); f.step(0, 0, true);
  assert.equal(f.p.action?.type, 'shot', 'high handle pull-up still cancels the move immediately');
  assert(a.t < a.T * f.gm.K.mvDead, 'pull-up happens inside the dead zone');
  console.log('PASS pull-up cancel: hnd 0.99 shoots inside the dead zone (low-handle gate: qa/pullup-cancel.cjs)');
}
assert(out.alternate.new.moves.length < out.alternate.main.moves.length, 'dead zone slows rapid left/right cancels');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('PASS move cancel guard');
