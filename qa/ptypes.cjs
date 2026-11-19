// V4.6 球员类型 + 2K 细分属性检查：类型分布、属性范围、1V1 / 5V5 无报错跑完整局
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
let inputs = [];
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: (i) => inputs[i] || {}, read5: () => ({}), endTick() {} } };
for (const n of ['tune', 'ptype', 'render', 'roster', 'r5', 'r2k', 'game', 'b5', 'team5']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', n + '.js'), 'utf8'), ctx, { filename: n + '.js' });
const { game: gm, PT } = ctx.PH, A = gm.ARCH;
const NEW = ['spdB', 'lat', 'ocon', 'dcon', 'hus', 'dur', 'rej', 'leap', 'hang'];
const by = {};
for (const k of gm.ROSTER) {
  const a = A[k]; for (const f of NEW) assert(a[f] >= 0.25 && a[f] <= 0.99, k + ' ' + f + ' = ' + a[f]);
  const t = PT.of(a).id; (by[t] = by[t] || []).push(a.name + a.ovr);
}
const ids = Object.keys(PT.types);
for (const id of ids) console.log(PT.types[id].name.padEnd(6, '　'), String((by[id] || []).length).padStart(3), (by[id] || []).slice(0, 10).join(' '));
assert.equal(ids.filter((id) => (by[id] || []).length >= 3).length, ids.length, 'every type has at least 3 players');
const show = (k) => { const a = A[k]; console.log(a.name, PT.of(a).name, NEW.map((f) => f + '=' + Math.round(a[f] * 99)).join(' ')); };
['curry', 'shaq', 'giannis', 'gobert', 'zion', 'jokic', 'wemby', 'caruso'].filter((k) => A[k]).forEach(show);
// 类型特性：三分射手接球 0.6 秒内三分绿区 +8%
gm.seed(7); gm.newGame({ mode: '2p', arch0: 'lillard', arch1: 'gobert', target: 11 });
{ const [p] = gm.G.players; assert.equal(gm.ptOf(p), 'sniper'); p.hc = 0; p.gotT = gm.G.time; const g1 = gm._qa.greenWidth(p, p.r.three, 0, 'three'); p.gotT = -9; const g0 = gm._qa.greenWidth(p, p.r.three, 0, 'three'); assert(Math.abs(g1 / g0 - 1.08) < 1e-9, 'sniper catch ' + g1 / g0); }
// 完整对局：1V1 电脑对电脑、5V5 电脑对电脑
const z = () => ({ mx: 0, my: 0 });
for (const [a0, a1] of [['curry', 'gobert'], ['giannis', 'caruso'], ['sabonis', 'towns']]) {
  gm.seed(7); gm.newGame({ mode: 'cpu', arch0: a0, arch1: a1, target: 11 }); for (const p of gm.G.players) p.ctrl = 'cpu';
  let n = 0; while (gm.winnerNow() < 0 && n < 120 * 900) { inputs = [z(), z()]; gm.tick(1 / 120); n++; }
  console.log('1V1', a0, 'vs', a1, Math.round(n / 120) + 's', JSON.stringify(gm.G.score));
  assert(gm.winnerNow() >= 0, '1V1 game finished');
}
const T5 = ctx.PH.T5; Math.random = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
T5.start({ home: 'BOS', away: 'DEN', qlen: 90, diff: 1, human: -1 });
let m = 0; while (!T5.T.over && m < 120 * 1200) { T5.tick(1 / 120); m++; }
const B = null;
console.log('5V5 BOS vs DEN', Math.round(m / 120) + 's', 'over', !!T5.T.over, JSON.stringify(T5.T.tm.map((t) => t.pts != null ? t.pts : t.score)));
assert(T5.T.over, '5V5 game finished');
