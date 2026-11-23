const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game']) {
  let code = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
  if (name === 'game') code = code.replace('PH.game = {', 'PH.dkQA = { shootingFoul, d2lAir, updateAction }; PH.game = {');
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, dkQA: qa } = ctx.PH;
const { G, _dbg: dbg, t5: t } = gm;
G.vopt.replay = false;
gm.setAudioSink(() => {});
const set = (key, value) => tune.set('l1_' + key, value);
function duel() {
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'curry' });
  t.checkStep(9); G.phase = 'live';
  const [p, d] = G.players;
  Object.assign(p, { face: Math.PI / 2, x: 0, y: 8.6, vx: 0, vy: 4, z: 0 });
  Object.assign(d, { face: -Math.PI / 2, x: 0, y: 9.6, vx: 0, vy: 0, stance: true });
  Object.assign(p.r, { lay: 0.95, dunk: 0.95, close: 0.95 });
  return [p, d];
}

// 扣篮犯规倍率：只乘扣篮，上篮、跳投不变
function foulRate(kind) {
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const [p, d] = duel();
    G.ftTrips = 0; G.foulDrought = 1;
    gm.seed(i * 7919 + 1);
    if (qa.shootingFoul(p, d, { type: kind === 'shot' ? 'jump' : kind, cHit: kind !== 'shot' }, { c: 0.6 }, kind)) n++;
  }
  return n / 2000;
}
const base = {};
set('foulDunk', 1);
for (const k of ['shot', 'lay', 'dunk']) base[k] = foulRate(k);
assert(Math.abs(base.lay - base.dunk) < 1e-9, 'foulDunk = 1 keeps dunks equal to layups');
set('foulDunk', 2);
const dunk2 = foulRate('dunk');
assert.equal(foulRate('lay'), base.lay);
assert.equal(foulRate('shot'), base.shot);
assert(dunk2 > base.dunk * 1.6 && dunk2 < base.dunk * 2.4, `dunk foul rate ${base.dunk} -> ${dunk2}`);
console.log(`PASS dunk fouls: foulDunk 1 -> 2 raises dunk fouls ${(base.dunk * 100).toFixed(1)}% -> ${(dunk2 * 100).toFixed(1)}%, layup ${(base.lay * 100).toFixed(1)}% and jumper ${(base.shot * 100).toFixed(1)}% unchanged`);

// 扣篮飞行途中被挡：改成上篮，保持高度继续出手
function airDunk(u) {
  const [p] = duel();
  dbg.startDunk(p, dbg.finPlan(p), 'a2', 'one');
  const a = p.action;
  Object.assign(a, { inSteps: false, t: a.T * 0.8 * u, sx: p.x, sy: p.y });
  qa.updateAction(p, t.zeroInp(), 0);
  assert(p.z > 0.5, 'dunker is airborne mid-flight');
  return [p, a];
}
set('cvD2LAir', 1); set('cvD2LU', 0.75);
let [p, a] = airDunk(0.4);
const z = p.z;
gm.seed(3);
assert(qa.d2lAir(p, a, 0.3), 'mid-flight contact converts');
const na = p.action;
assert.equal(na.type, 'layup');
assert.equal(na.cv, 'dunk2lay');
assert(!na.inSteps && na.cHit && na.cAir);
assert(na.rearm, 'a human converted layup waits for a fresh press or the d2lE fallback');
assert.equal(p.z, z, 'conversion keeps the current height');
assert(p.vz > 0);
const left = (p.vz + Math.sqrt(p.vz * p.vz + 2 * 17 * p.z)) / 17;
assert(na.ideal < left, 'release timing fits in the remaining hang time');
for (let i = 0; i < 240 && !na.released; i++) gm.tick(1 / 120, () => t.zeroInp());
assert(na.released, 'converted layup is released');
assert.equal(G.ball.state, 'shot'); assert(p.z > 0, 'released before landing');

[p, a] = airDunk(0.4); p.z = 0.1;
assert(!qa.d2lAir(p, a, 0.3), 'contact on the takeoff frame keeps the dunk');
[p, a] = airDunk(0.8);
assert(!qa.d2lAir(p, a, 0.3), 'too late in the flight keeps the dunk');
set('cvD2LU', 0);
[p, a] = airDunk(0.2);
assert(!qa.d2lAir(p, a, 0.3), 'cvD2LU = 0 disables the air switch');
set('cvD2LU', 0.75); set('cvD2LAir', 0);
[p, a] = airDunk(0.2);
assert(!qa.d2lAir(p, a, 0.3), 'cvD2LAir = 0 disables the air switch');
set('cvD2LAir', 1);
[p, a] = airDunk(0.2);
Object.assign(p.r, { lay: 0.6, dunk: 0.6 });
assert(!qa.d2lAir(p, a, 0.3), 'below the variation rating gate keeps the dunk');
console.log('PASS air dunk-to-layup: converts mid-flight and releases before landing; takeoff frame, late flight, cvD2LU = 0, cvD2LAir = 0 and low ratings keep the dunk');
