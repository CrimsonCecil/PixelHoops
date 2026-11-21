const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function fixture(baseline = false, seed = 7) {
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ctx = vm.createContext({ console, Math: math, Date: class extends Date { static now() { return 7; } }, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}) } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
    let source = baseline && name === 'game'
      ? execFileSync('git', ['show', `${process.env.PUSHBACK_BASE || 'main'}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') source = source.replace('PH.game = {', 'PH.pushQA = { collide }; PH.game = {')
      .replace('const A = Math.abs(adv), win =', 'window.bumpAdv = adv; const A = Math.abs(adv), win =');
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  const gm = ctx.PH.game;
  gm.newGame({ mode: '2p', arch0: 'lebron', arch1: 'lebron', target: 9999 });
  const [hd, df] = gm.G.players;
  Object.assign(gm.G, { phase: 'live', needClear: false, intro: null, tips: null });
  for (const p of [hd, df]) {
    Object.assign(p, { x: 0, y: p === hd ? 6 : 6.7, z: 0, vx: 0, vy: 0, stun: 0, action: null, post: false, stance: false, stam: 100, h: 1.95 });
    Object.assign(p.r, { str: 0.65, bw: 1, def: 0.65, hnd: 0.65, badges: [] });
    p.hasBall = p === hd;
  }
  Object.assign(gm.G.ball, { state: 'held', holder: hd.id });
  return { ctx, gm, hd, df, collide: ctx.PH.pushQA.collide, seed: value => { seed = value; gm.seed(value); } };
}

function walk(kind, baseline = false) {
  const { gm, hd, df } = fixture(baseline);
  if (!baseline && kind !== 'weaker') df.stance = true;
  if (kind === 'slightly weaker') df.r.str = 0.5;
  if (kind === 'stronger') Object.assign(df.r, { str: 1, bw: 1.7 });
  if (kind === 'weaker') Object.assign(df.r, { str: 0.1, bw: 0.5 });
  let retreat = 0, passed = false;
  for (let i = 0; i < 150; i++) {
    gm.tick(1 / 60, p => p === hd ? { mx: 0.07, my: 0.2 } : { mx: 0, my: 0, a3: !baseline && kind !== 'weaker' });
    retreat = Math.max(retreat, -hd.vy);
    passed ||= gm.distHoop(hd) < gm.distHoop(df);
  }
  return { retreat: +retreat.toFixed(3), passed, behind: gm.distHoop(hd) > gm.distHoop(df) };
}

const results = Object.fromEntries(['equal', 'slightly weaker', 'stronger', 'weaker'].map(k => [k, walk(k)]));
const baseline = walk('equal', true);
console.log(JSON.stringify({ baseline, ...results }));
assert(baseline.passed, 'baseline diagonal walking should slide past');
for (const k of ['equal', 'slightly weaker', 'stronger']) {
  assert(!results[k].passed && results[k].behind, `${k}: defender must hold the hoop side`);
  assert(results[k].retreat > 0.6, `${k}: handler must be pushed back`);
}
assert(results.stronger.retreat > results.equal.retreat, 'stronger defender must push further');
assert(results.weaker.passed, 'clearly stronger handler must still get through');
console.log('PASS diagonal non-sprint live play: stance defenders hold; stronger defender pushes further; weak standing defender beaten; baseline slides past');

function winRate(ratio, stance, sprint = false, bonus = 0.25) {
  const f = fixture(), { ctx, gm, hd, df, collide } = f;
  gm.K.bdStPow = bonus;
  const power = gm._qa.bodyPow(hd);
  df.r.bw = (power * ratio - 0.25 * (df.h - 1.7) / 0.4 - 0.45 * df.r.str) / 0.55;
  assert(Math.abs(gm._qa.bodyPow(df) / power - ratio) < 1e-9);
  let wins = 0;
  for (let i = 1; i <= 2000; i++) {
    f.seed(i * 7919);
    Object.assign(gm.G, { time: 1, pushT: -9, bumpT: -9 });
    for (const p of [hd, df]) Object.assign(p, { x: 0, y: p === hd ? 6.1 : 6.7, vx: 0, vy: p === hd ? (sprint ? 5 : 1) : 0, stam: 100, stun: 0, action: null, stance: p === df && stance });
    ctx.bumpAdv = null;
    collide(hd, df);
    if (sprint) {
      assert.equal(gm.G.bumpT, 1, 'sprint must reach shared bump event');
      assert.equal(gm.G.pushT, -9, 'bump must take priority over push-back');
      if (ctx.bumpAdv < 0) wins++;
    } else {
      assert.equal(gm.G.pushT, 1, 'slow contact must reach push-back roll');
      if (hd.vy < 0) wins++;
    }
  }
  return wins / 2000;
}
const rates = {
  standingEqual: winRate(1, false),
  standingWeaker: winRate(0.85, false),
  stanceWeaker: winRate(0.85, true),
  stanceHugeGap: winRate(0.6, true),
  stanceDisabled: winRate(0.85, true, false, 0),
  sprintStanding: winRate(1, false, true),
  sprintStance: winRate(1, true, true),
};
console.log('Defender win rates over 2000 seeded trials each:', JSON.stringify(rates));
assert(rates.standingEqual >= 0.35 && rates.standingEqual <= 0.65);
assert(rates.standingWeaker < rates.standingEqual);
assert(rates.stanceWeaker > 0.6);
assert(rates.stanceHugeGap < 0.4);
assert.equal(rates.stanceDisabled, rates.standingWeaker);
assert(rates.sprintStance > rates.sprintStanding);
console.log('PASS standing parity, percentage stance advantage, large-gap limit, zero multiplier and sprint-bump stance benefit');

for (const excluded of ['no ball', 'same team', 'post', 'shot', 'layup', 'dunk', 'stunned handler', 'stunned defender', 'dead', 'diving']) {
  const { gm, hd, df, collide } = fixture();
  hd.y = 6.1; hd.vx = 0.5; hd.vy = 1;
  if (excluded === 'no ball') hd.hasBall = false;
  if (excluded === 'same team') { hd.tm = 0; df.tm = 0; }
  if (excluded === 'post') hd.post = true;
  if (['shot', 'layup', 'dunk'].includes(excluded)) hd.action = { type: excluded };
  if (excluded === 'stunned handler') hd.stun = 0.1;
  if (excluded === 'stunned defender') df.stun = 0.1;
  if (excluded === 'dead') gm.G.phase = 'dead';
  if (excluded === 'diving') hd.action = { type: 'dive', t: 0.1, pre: 0, air: 0.2, slide: 0.3 };
  collide(hd, df);
  assert.equal(gm.G.pushT, -9, excluded);
}
{
  const { gm, hd, df, collide } = fixture();
  hd.y = 6.1; hd.vy = 1;
  collide(hd, df);
  const t = gm.G.pushT;
  assert(t >= 0);
  hd.y = df.y - 0.6; hd.vy = 1; hd.stun = 0;
  gm.G.time += gm.K.bdPbCd / 2;
  collide(hd, df);
  assert.equal(gm.G.pushT, t, 'cooldown must prevent repeated push');
}
console.log('PASS exclusions (empty handler, teammate, post, finishes, stun, dead ball, dive) and push cooldown');
