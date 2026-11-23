const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  ctx.PH.audio = { voLine: (k, ev, i) => ({ f: k + ev + i, t: k + ':' + ev + ':' + i, d: 1.5 }), voSay() {}, voStop() {}, play() {} };
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  ctx.PH.game.seed(7);
  return { ctx, Gm: ctx.PH.game, G: ctx.PH.game.G };
}
const { ctx, Gm, G } = load();
const setSig3 = (v) => { ctx.PH.TUNE.set('l1_celSig3', v); assert.equal(Gm.K.celSig3, v); };
Gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
const [curry, joe] = G.players;
const pick = (pl, lv, why, pts, n = 200) => { const s = new Set(); for (let i = 0; i < n; i++) s.add(JSON.stringify(Gm.celPick(pl, lv, why, pts))); return [...s].map((x) => JSON.parse(x)); };

for (let lv = 0; lv < 3; lv++) {
  assert.equal(Gm.CEL_TIERS[lv].length, 3);
  const got = pick(joe, lv, null, 2);
  assert.ok(got.every((c) => c.lv === lv && Gm.CEL_TIERS[lv].includes(c.ty)), 'generic tier ' + lv + ' stays in its tier');
  assert.equal(new Set(got.map((c) => c.ty)).size, 3, 'all three moves of tier ' + lv + ' show up');
}
assert.ok(Gm.CEL_TIERS[2].includes('robot'), 'advanced tier has the robot dance');
for (const why of ['andone', 'win']) {
  assert.deepEqual(pick(curry, 0, why, 2), [{ ty: 'night', lv: 3 }], 'Curry always does night-night on ' + why);
  assert.ok(pick(joe, 0, why, 2).every((c) => c.lv === 2 && Gm.CEL_TIERS[2].includes(c.ty)), 'non-signature players use the advanced tier on ' + why);
}
setSig3(1); assert.deepEqual(pick(curry, 1, null, 3), [{ ty: 'night', lv: 3 }], 'celSig3=1: every Curry three is night-night');
setSig3(0); assert.ok(pick(curry, 1, null, 3).every((c) => c.lv === 1), 'celSig3=0: Curry threes use the generic tier');
assert.ok(pick(curry, 1, null, 2).every((c) => c.ty !== 'night'), 'plain twos never trigger the signature');
setSig3(0.6);
const sigOf = (k) => { Gm.newGame({ mode: 'cpu', arch0: k, arch1: 'joe' }); return pick(G.players[0], 0, 'win', 3, 5); };
assert.deepEqual(sigOf('lillard'), [{ ty: 'watch', lv: 3 }]);
assert.deepEqual(sigOf('lebron'), [{ ty: 'crown', lv: 3 }]);
console.log('PASS: celebration tiers 普通/中等/高级 x3, signatures (Curry night, Lillard watch, LeBron crown) on and-one/game winner, tunable three chance');

// game winner now celebrates
Gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
Object.assign(G, { intro: null, phase: 'live' }); G.score[0] = G.target - 3;
Gm.t5.scoreBy(0, 3, 'shot', '三分');
assert.ok(G.cel && G.cel.ty === 'night' && G.cel.lv === 3, 'Curry game-winning three plays night-night');
Gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe', glen: 60 });
Object.assign(G, { intro: null, phase: 'live', gclock: 0 }); G.score[0] = G.score[1] = 5;
Gm.t5.scoreBy(0, 2, 'shot', '中投');
assert.ok(G.cel && G.cel.ty === 'night', 'tie-breaking basket after the horn in a timed game plays night-night');
console.log('PASS: game winner plays the signature celebration (target score and timed buzzer)');

// and-one / 3+1: signature after the final free throw goes in
for (const pts of [2, 3]) {
  Gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
  Object.assign(G, { intro: null, phase: 'live' });
  Gm.awardFreeThrows(0, pts, true);
  assert.equal(G.cel, null);
  Gm.settleFreeThrow({ shooter: 0, made: true });
  assert.ok(G.cel && G.cel.ty === 'night' && G.phase === 'dead', pts + '+1 made free throw plays night-night');
  Gm.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'joe' });
  Object.assign(G, { intro: null, phase: 'live' });
  Gm.awardFreeThrows(0, pts, true);
  Gm.settleFreeThrow({ shooter: 0, made: false });
  assert.equal(G.cel, null, pts + '+1 missed free throw: no celebration');
}
console.log('PASS: 2+1 and 3+1 play the signature after the made free throw, not after a miss');

// entrance tiers follow player level
const lvOf = (k) => { Gm.newGame({ mode: 'cpu', arch0: k, arch1: 'joe' }); return Gm.introLv(G.players[0]); };
for (const k of ['lebron', 'curry', 'lillard']) assert.equal(lvOf(k), 3, k + ' has a signature entrance');
const byTier = { star: 2, mid: 1, avg: 0, rook: 0 };
for (const k of Object.keys(Gm.ARCH)) if (!Gm.ISIG[k]) assert.equal(lvOf(k), byTier[Gm.ARCH[k].tier], k);
for (const [a, b] of [['lebron', 'curry'], ['lillard', 'joe'], ['kobe', 'maxey']]) {
  Gm.newGame({ mode: 'cpu', arch0: a, arch1: b });
  Gm.introStart();
  for (const p of G.players) {
    const S = G.intro.walk.filter((s) => s.id === p.id && s.lv >= 0);
    assert.equal(S.length, 1, p.arch.key + ' has one tiered entrance move');
    const lv = Gm.introLv(p);
    assert.equal(S[0].lv, lv);
    assert.ok(lv === 3 ? S[0].ty === Gm.ISIG[p.arch.key] : Gm.INTRO_TIERS[lv].includes(S[0].ty), p.arch.key + ' entrance from its tier');
  }
}
console.log('PASS: entrance tier by player level (avg/rook → 普通, mid → 中等, star → 高级, LeBron/Curry/Lillard → 招牌)');
