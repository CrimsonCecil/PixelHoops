const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function run(arch, how, pogo) {
  const ctx = vm.createContext({ console, navigator: { getGamepads: () => [] }, performance: { now: () => 0 }, setTimeout() {}, addEventListener() {} });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  const gm = ctx.PH.game, G = gm.G;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: arch, arch1: 'joe' });
  const p = G.players[0], o = G.players[1];
  if (pogo !== undefined) {
    p.r.badges = p.r.badges.filter(b => b !== 'pogo').concat(pogo ? ['pogo'] : []);
    (p.arch._bt || (p.arch._bt = {})).pogo = 3;
  }
  Object.assign(G, { phase: 'live', off: p.id, needClear: false });
  Object.assign(o, { x: 7, y: 9, stun: 99, action: null, hasBall: false });
  Object.assign(p, { x: 0, y: 6.5, z: 0, vz: 0, vx: 0, vy: 0, stun: 0, cd: 0, action: null, stam: 1 });
  let inp = { mx: 0, my: 0, dx: 0, dy: 0 };
  ctx.PH.input.read = () => inp;
  if (how === 'shot') {
    Object.assign(G.ball, { holder: p.id, state: 'held' }); p.hasBall = true;
    inp = { mx: 0, my: 0, dx: 0, dy: 0, a1: true };
    gm._dbg.startShot(p, inp, 'a1');
  } else gm._dbg.startBlock(p, inp);
  for (let i = 0; i < 600 && (p.action || p.z > 0); i++) { const hold = how === 'shot' && !(p.action?.jumped && p.vz < 0); inp = { mx: 0, my: 0, dx: 0, dy: 0, a1: hold }; gm.tick(1 / 120); }
  assert(!p.action && p.z <= 0, `${arch} ${how}: landed`);
  const rec = (p.lndT || 0) > G.time ? p.lndT - G.time : 0, cd = p.cd, rej = p.r.rej;
  Object.assign(p, { vx: 0, vy: 0, cd: 0, x: 3, y: 6.5 }); p.hasBall = false;
  if (how === 'block') {
  Object.assign(G, { phase: 'live', off: o.id, needClear: false });
  Object.assign(o, { x: 7, y: 9, stun: 99, action: null, hasBall: true });
  Object.assign(G.ball, { holder: o.id, state: 'held', dead: false, x: 7, y: 9, z: 1, vx: 0, vy: 0, vz: 0 });
  }
  p.ib = null;
  const x0 = p.x, y0 = p.y;
  inp = { mx: -1, my: 0, dx: 0, dy: 0 };
  for (let i = 0; i < 60; i++) { ctx.PH.input.read = () => inp; gm.tick(1 / 120); o.stun = 99; }
  return { rej, rec, cd, run: Math.hypot(p.x - x0, p.y - y0) };
}

const out = {};
const ARCH = ['edey', 'harden', 'barrett', 'curry', 'morant', 'rodman', 'giannis'];
for (const how of ['block', 'shot']) for (const arch of ARCH) out[how + ' ' + arch] = run(arch, how);
console.table(out);
const S = a => out['shot ' + a], B = a => out['block ' + a];
assert(S('harden').rec > S('curry').rec && S('curry').rec > S('morant').rec, 'shot: rec follows rej');
assert(S('morant').run > S('harden').run * 1.05, 'shot: high jumper runs farther in first 0.5s');
assert(S('rodman').rec < S('morant').rec, 'shot: pogo badge shortens recovery');
const old = a => 0.12 * Math.min(2.6, Math.max(0.7, 1 + 2.4 * (0.85 - B(a).rej)));   // 改动前的盖帽落地冷却
assert(Math.abs(B('barrett').cd - old('barrett')) < 0.02, 'block: average second jump keeps the old re-jump cooldown');
assert(B('edey').cd > B('harden').cd && B('harden').cd > B('barrett').cd && B('barrett').cd > B('morant').cd, 'block: cd follows rej');
assert(B('morant').cd < old('morant') * 0.6, 'block: second-jump monster re-jumps much sooner than before');
assert(B('edey').rec > 0 && B('morant').rec === 0 && B('barrett').rec < 0.02, 'block: only below-average jumpers are slowed on landing');
const a = run('harden', 'block', false), b = run('harden', 'block', true);
assert(b.cd < a.cd * 0.8, 'pogo badge on same player');
console.log('land-recovery ok');
