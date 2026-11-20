const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { read: () => ({}), read5: () => ({}), endTick() {} } };
for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune, T5: team } = ctx.PH;
const { G, K, _dbg: dbg } = gm;
const t5 = gm.t5;
const close = (a, b, label) => assert(Math.abs(a - b) < 1e-9, `${label}: expected ${b}, got ${a}`);
const SEQ = ['cross', 'inout', 'stepback', 'cross', 'inout', 'stepback'];

function costs(seq, badges, tier) {
  tune.load({ l1_stamRegen: 0 });
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'gobert', target: 999 });
  const [p, d] = G.players;
  Object.assign(G, { phase: 'live', needClear: false });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  Object.assign(p, { x: 0, y: 5, z: 0, hasBall: true, opp: d, stam: 100, speed: 2 });
  p.arch = { ...p.arch, key: 'qa', _bt: Object.fromEntries(badges.map((b) => [b, tier])) };
  Object.assign(p.r, { sta: 0.5, badges });
  Object.assign(d, { x: -4, y: 4, off: true, opp: p, hasBall: false });
  return seq.map((kind) => { const s = p.stam = 100; dbg.startMove(p, { ...t5.zeroInp(), dx: 1 }, kind); G.time += 0.2; return { drop: s - p.stam, combo: p.combo, dcn: p.dcn }; });
}

const single = {};
for (const k of new Set(SEQ)) single[k] = costs([k], [], 3)[0].drop;
const ramp = (r) => (1 + K.cbStep * (r.combo - 1)) * (1 + K.cbCost * r.dcn) - 1;

const plain = costs(SEQ, [], 3);
plain.forEach((r, i) => {
  assert.equal(r.combo, i + 1, 'move ' + (i + 1) + ' must extend the chain');
  close(r.drop / single[SEQ[i]], 1 + ramp(r), 'no badge: move ' + (i + 1) + ' ramp');
  if (i) assert(r.drop / single[SEQ[i]] > plain[i - 1].drop / single[SEQ[i - 1]], 'each extra chained move costs more than the last');
});
assert(plain[3].drop / single.cross >= 2.5, 'fourth chained move costs at least 2.5x a single move');

for (const [badge, tier, tf] of [['tight', 3, K.bgT3], ['ankle', 3, K.bgT3], ['ankle', 1, K.bgT1], ['tight', 4, K.bgT4]]) {
  const flat = Object.fromEntries(Object.keys(single).map((k) => [k, costs([k], [badge], tier)[0].drop]));
  const bgK = 1 + (K.bgChainSt - 1) * tf;
  costs(SEQ, [badge], tier).forEach((r, i) => {
    close(r.drop / flat[SEQ[i]], 1 + ramp(r) * bgK, badge + ' tier ' + tier + ': move ' + (i + 1) + ' ramp');
    if (i) assert(r.drop / flat[SEQ[i]] < plain[i].drop / single[SEQ[i]], badge + ' ramps up more slowly');
  });
}

console.log('PASS chained dribble moves ramp stamina cost; tight / ankle badges slow the ramp by tier');
