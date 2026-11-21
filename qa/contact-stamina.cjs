const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function fixture(baseline = false) {
  const ctx = vm.createContext({ console, Date: class extends Date { static now() { return 7; } }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
    let source = baseline && name === 'game'
      ? execFileSync('git', ['show', 'dc69df3^:js/game.js'], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.contactQA = { collide, ctPow }; PH.game = {')
      .replace('bodyCost(hd, 0.45', 'window.postAdv = df2; bodyCost(hd, 0.45');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'lebron', target: 9999 });
  gm.seed(7);
  Object.assign(gm.G, { phase: 'live', intro: null, tips: null, needClear: false });
  const [hd, df] = gm.G.players;
  for (const p of [hd, df]) {
    Object.assign(p, { x: 0, y: p === hd ? 5.5 : 6.7, vx: 0, vy: 0, z: 0, stun: 0, action: null, stam: 100, h: 1.95, hasBall: p === hd });
    Object.assign(p.r, { bw: 1, str: 0.65, def: 0.65, hnd: 0.65, post: 0.65, intD: 0.65, sta: 0.65, badges: [] });
  }
  Object.assign(gm.G.ball, { state: 'held', holder: hd.id });
  return { ctx, gm, hd, df };
}

function battle(post, ratio, baseline = false) {
  const { ctx, gm, hd, df } = fixture(baseline);
  const power = gm._qa.bodyPow(hd);
  df.r.bw += power * (ratio - 1) / 0.55;
  const curve = [], wins = [0, 0, 0], holds = [0, 0, 0];
  let last = -9, firstWin = null;
  for (let i = 0; i < 900; i++) {
    gm.tick(1 / 60, p => p === hd ? { mx: 0, my: post ? 0.35 : 0.2, post } : { mx: 0, my: 0, a3: true });
    const stamp = post ? gm.G.postBumpT : gm.G.pushT;
    if (stamp !== last && stamp >= 0) {
      last = stamp;
      const win = post ? ctx.postAdv > gm.K.poWin : hd.vy >= 0;
      const bin = Math.min(2, Math.floor(gm.G.time / 5));
      (win ? wins : holds)[bin]++;
      if (win && firstWin === null) firstWin = +gm.G.time.toFixed(2);
    }
    if (i % 180 === 179) curve.push([+gm.G.time.toFixed(1), +hd.stam.toFixed(1), +df.stam.toFixed(1)]);
  }
  return { curve, wins, holds, firstWin, passed: gm.distHoop(hd) < gm.distHoop(df) };
}

for (const post of [false, true]) for (const ratio of [1, 1.05]) {
  const before = battle(post, ratio, true), after = battle(post, ratio);
  console.log(JSON.stringify({ mode: post ? 'post' : 'walk', ratio, before, after }));
  assert(after.holds[0] > 0, 'defender must resist early');
  assert(after.firstWin >= 5 && after.firstWin <= (ratio === 1 ? 10 : 15), 'equal defender yields in 5–10s; stronger stance defender may hold up to 15s');
  const [, attackStam, defenseStam] = after.curve.at(-1);
  assert(defenseStam >= 30 && defenseStam <= 50, 'defender should retain 30–50 stamina at 15 seconds');
  assert(attackStam >= 70 && attackStam <= 85, 'attacker should spend 15–30 stamina at 15 seconds');
  assert(after.curve[2][2] < after.curve[2][1] - 10, 'defender must tire faster by nine seconds');
  assert(after.curve[2][2] < before.curve[2][2] - 10, 'baseline defender should retain more stamina');
  assert(after.wins[1] + after.wins[2] > 0 || after.passed, 'grinding must eventually win contact or pass');
}
const weak = battle(false, 0.55);
assert(weak.firstWin !== null && weak.firstWin < 1, 'huge-gap weak defender loses immediately');
console.log('PASS contact stamina: early resistance, defender tires faster, grind wins within 15s; huge-gap defender loses immediately');

function absorb({ stance = false, heavy = false, mode = '2p', phase = 'live', inward = true, ball = true } = {}) {
  const { ctx, gm, hd, df } = fixture();
  Object.assign(gm.G, { mode, phase });
  Object.assign(hd, { y: 6.1, vy: inward ? 0.45 : -0.45, post: true, hasBall: ball });
  df.stance = stance;
  if (heavy) hd.r.bw *= 1.5;
  ctx.PH.contactQA.collide(hd, df);
  return { cost: 100 - df.stam, attackerCost: 100 - hd.stam, time: gm.G.postBumpT };
}
const normal = absorb(), stance = absorb({ stance: true }), heavy = absorb({ heavy: true, stance: true });
assert(stance.cost > normal.cost, 'stance must cost more even after its power bonus');
assert(heavy.cost > stance.cost, 'holding heavier attackers must cost more');
assert(normal.cost > normal.attackerCost && normal.attackerCost > 0);
for (const options of [{ phase: 'dead' }, { inward: false }, { ball: false }]) assert.equal(absorb(options).time, -9);
assert.equal(absorb({ mode: 'demo' }).cost, 0);
console.log('PASS blocked low-speed post pressure, stance/heavy-attacker cost scaling, no-ball/dead/retreat exclusions and demo immunity');
