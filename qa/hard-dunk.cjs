const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game']) {
  let code = fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8');
  if (name === 'game') code = code.replace('PH.game = {', 'PH.hdQA = { hardDunk, finEdge, finContact }; PH.game = {');
  vm.runInContext(code, ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, hdQA: qa } = ctx.PH;
const { G, _dbg: dbg, t5: t } = gm;
G.vopt.replay = false;
gm.setAudioSink(() => {});
const set = (key, value) => tune.set('l1_' + key, value);
set('ctThruP', 0); set('ctThruPM', 0);

// 布莱恩特收球冲筐，杰伦·格林横移到路线上（录像 1V1 杰伦·格林vs布莱恩特 11-24 02:55 的最后一攻）
function drive(seed) {
  gm.newGame({ mode: '2p', arch0: 'jgreen', arch1: 'kobe' });
  t.checkStep(9); G.phase = 'live';
  const [d, p] = G.players;
  Object.assign(p, { face: Math.PI / 2, x: 0, y: 6.43, vx: 0, vy: 8.9, z: 0, hasBall: true, action: null });
  Object.assign(d, { face: -Math.PI / 2, x: -0.12, y: 8.74, vx: 0, vy: 0, z: 0, hasBall: false, action: null, stun: 0 });
  G.ball.holder = p.id; G.ball.state = 'held'; G.off = p.id;
  dbg.startDunk(p, dbg.finPlan(p), 'a2');
  Object.assign(p, { x: 0, y: 8.3, z: 0.1, vx: 0, vy: 11 });
  gm.seed(seed);
  return [p, d];
}
function outcomes(n) {
  const r = { hard: 0, lay: 0, other: 0 };
  for (let i = 0; i < n; i++) {
    const [p, d] = drive(i * 7919 + 3);
    const a = p.action;
    qa.finContact(p, d);
    assert(a.cHit, 'gather contact registered');
    if (p.action && p.action.type === 'layup') r.lay++;
    else if (p.action === a && a.bodyPen > 0) r.hard++;
    else r.other++;
  }
  return r;
}

const [p, d] = drive(1), a = p.action, e = qa.finEdge(p, d, a, true);
assert(e > 0.15 && e < 0.5, `Bryant's edge over Green is a mid-size advantage (${e.toFixed(3)})`);

// 0 = 旧行为：一过门槛就必定硬扣，也不消耗随机数
set('ctKeep', 0); set('ctKeepW', 0);
const w0 = outcomes(300);
assert.equal(w0.lay, 0, 'ctKeepW 0 never switches a stronger dunker');
assert(w0.hard > 0);
for (let i = 0; i < 50; i++) { gm.seed(i + 1); assert.equal(qa.hardDunk(p, d, a, 0), true); assert.equal(qa.hardDunk(p, d, a, e + 0.01), false); }

// 过渡宽度：差值越过门槛越多越可能硬扣
set('ctKeepW', 0.5);
const w5 = outcomes(300), share = w5.hard / (w5.hard + w5.lay);
assert(w5.lay > 0 && w5.hard > w5.lay, 'ctKeepW 0.5 lets a mid-size advantage sometimes switch to a layup');
let hi = 0, lo = 0, mid = 0;
for (let i = 0; i < 2000; i++) { gm.seed(i * 31 + 1); if (qa.hardDunk(p, d, a, e - 0.6)) hi++; if (qa.hardDunk(p, d, a, e + 0.01)) lo++; if (qa.hardDunk(p, d, a, e - 0.125)) mid++; }
assert.equal(hi, 2000, 'an edge past threshold + width always powers through');
assert.equal(lo, 0, 'an edge under the threshold never powers through');
assert(Math.abs(mid / 2000 - 0.25) < 0.03, `a quarter-width edge powers through about a quarter of the time (${(mid / 20).toFixed(1)}%)`);
set('ctKeepW', 0);

console.log(`PASS hard dunk: ctKeepW 0 keeps the old all-or-nothing (${w0.hard} hard / ${w0.lay} layup); 0.5 turns Bryant's +${e.toFixed(2)} edge into ${w5.hard} hard / ${w5.lay} layup (${(100 * share).toFixed(0)}% hard)`);
