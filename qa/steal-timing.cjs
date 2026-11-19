const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Optional baseline source: STEAL_BASELINE=/path/to/original-game.js node qa/steal-timing.cjs
function fixture(source) {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
    let code = name === 'game' && source ? source : fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('_qa: {', '_qa: { updateAction,');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'joe', target: 999 });
  return gm;
}

function sample(gm, { kind = 'cross', mv, u = 0.5, side = 1, hand = 1, mode = '2p', chin = false, type = 'move', range = 1.05 } = {}) {
  const { G, K, t5 } = gm, [p, d] = G.players;
  G.mode = mode;
  Object.assign(G, { phase: 'live', needClear: false, off: 0, fb: 'detail' });
  Object.assign(p, { x: 0, y: 5, face: Math.PI / 2, hand, handX: 0.33 * hand, hasBall: true, action: type ? { type, kind, mv, t: u, T: 1 } : null, chinT: chin ? G.time + 1 : 0, post: false, z: 0, opp: d });
  Object.assign(d, { x: side * hand * range * 0.8, y: 5 + range * 0.6, face: -Math.PI / 2, hasBall: false, ctrl: 'p2', action: { type: 'steal', t: K.stlHitT, T: K.stlT }, opp: p });
  Object.assign(G.ball, { state: 'held', holder: 0, dead: false, x: p.x, y: p.y, z: 0.8 });
  const before = G.stats[1].stl;
  gm._qa.updateAction(d, t5.zeroInp(), 0);
  return { hit: G.stats[1].stl > before, recovery: d.action.T, text: G.floats.at(-1)?.text };
}

function rates(gm, label) {
  const cases = {
    'cross in-window': {}, 'cross out-of-window': { u: 0.05 },
    'ball-side': { type: null }, 'across-body': { type: null, side: -1 },
    'safe behind': { kind: 'behind' },
  };
  const result = {};
  for (const [name, opts] of Object.entries(cases)) {
    gm.seed(7);
    let hits = 0;
    for (let i = 0; i < 4000; i++) hits += sample(gm, opts).hit;
    result[name] = hits / 4000;
    console.log(label + ' ' + name + ': ' + hits + '/4000 (' + (100 * result[name]).toFixed(2) + '%)');
  }
  return result;
}

function possessions(gm, label) {
  let steals = 0, attempts = 0, timeouts = 0;
  const N = 3000, dt = 1 / 60;
  for (let n = 0; n < N; n++) {
    gm.seed(7 + n * 2);
    gm.newGame({ mode: 'cpu', arch0: n % 2 ? 'kyrie' : 'luka', arch1: 'joe', target: 999, diff: 1 });
    const { G } = gm;
    G.players.forEach(p => { p.ctrl = 'cpu'; });
    // Start after the check-ball, with both CPUs otherwise using real game decisions.
    if (G.phase === 'check') G.phaseT = 0;
    let live = false, ended = false, previous = null;
    for (let i = 0; i < 2400; i++) {
      gm.tick(dt);
      const a = G.players[1].action;
      if (a?.type === 'steal' && a !== previous) attempts++;
      previous = a;
      if (G.phase === 'live') live = true;
      if (live && (G.off !== 0 || G.phase !== 'live' || G.stats[1].stl > 0)) { ended = true; break; }
    }
    steals += G.stats[1].stl;
    if (!ended) timeouts++;
  }
  assert.equal(timeouts, 0, 'all CPU possessions should finish');
  console.log(label + ' CPU-vs-CPU: ' + steals + ' steals / ' + N + ' possessions; ' + attempts + ' reaches; timeouts=' + timeouts);
  return steals;
}

if (process.env.STEAL_BASELINE) {
  const before = fixture(fs.readFileSync(process.env.STEAL_BASELINE, 'utf8'));
  rates(before, 'before');
  possessions(before, 'before');
}
const gm = fixture();
const r = rates(gm, 'after');
assert(r['cross in-window'] > r['cross out-of-window'] + 0.2);
assert(r['ball-side'] > r['across-body'] + 0.1);
assert.equal(r['safe behind'], 0);
for (const hand of [-1, 1]) {
  gm.seed(7); const right = Array.from({ length: 100 }, () => sample(gm, { hand, mode: '2p' }).hit);
  gm.seed(7); const team = Array.from({ length: 100 }, () => sample(gm, { hand, mode: 't5' }).hit);
  assert.deepEqual(team, right, '5V5 shares the same judgement for either hand');
}
gm.seed(7); const left = Array.from({ length: 100 }, () => sample(gm, { hand: -1 }).hit);
gm.seed(7); const right = Array.from({ length: 100 }, () => sample(gm, { hand: 1 }).hit);
assert.deepEqual(left, right, 'mirroring ball hand and defender side preserves odds');
gm.CFG.stealMul = 0;
const good = sample(gm), bad = sample(gm, { u: 0.05, side: -1 });
assert(bad.recovery > good.recovery);
assert.equal(bad.text, '伸手失位');
gm.CFG.stealMul = 1;
for (const type of ['layup', 'dunk']) {
  for (let i = 0; i < 100; i++) assert(!sample(gm, { type }).hit);
}
// No action is also a valid judgement input.
assert.equal(typeof sample(gm, { type: null }).hit, 'boolean');
assert.equal(sample(gm, { range: 3 }).text, '伸手失位');
const d = gm.G.players[1];
d.arch = gm.ARCH.draymond;
d.sk.cd = 0;
assert(sample(gm, { side: -1, u: 0.05 }).hit, 'Draymond skill overrides a bad reach');
assert(d.sk.cd > 0, 'skill goes on cooldown');
d.sk.cd = 0;
let chinHits = 0;
for (let i = 0; i < 100; i++) chinHits += sample(gm, { side: -1, chin: true }).hit;
assert(chinHits < 20, 'chin retains low ordinary odds rather than the guaranteed skill');
assert.equal(d.sk.cd, 0, 'chin prevents the guaranteed skill from firing');
for (const type of ['layup', 'dunk']) assert(!sample(gm, { type }).hit, 'finishes exclude the skill too');
possessions(fixture(), 'after');
console.log('PASS steal timing, geometry, recovery, exclusions and shared 5V5 judgement');
