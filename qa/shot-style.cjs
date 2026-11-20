const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
ctx.PH = { input: { endTick() {}, read: () => ({}) } };
for (const name of ['render', 'tune', 'roster', 'game']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.styleQA = { startShot, releaseShot, startMove, updatePlayer, pickup }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const gm = ctx.PH.game, qa = ctx.PH.styleQA;
const input = { mx: 0, my: 0, dx: 0, dy: 0 };
function shot({ badge = false, catchAge = null, dribble = false, mode = 't5', releaseDelay = 0, error = 0.15, move = false } = {}) {
  gm.newGame({ mode: '2p', arch0: 'klay', arch1: 'gobert', target: 9999 });
  gm.G.mode = mode; gm.G.phase = 'live'; gm.G.needClear = false; gm.G.time = 10;
  const [p, df] = gm.G.players;
  Object.assign(p, { x: 0, y: ctx.PH.render.HOOP.y - 5, vx: 0, vy: 0, speed: 0, hasBall: true, tm: 0, passCatchT: catchAge == null ? null : 10 - catchAge, catchDribbled: dribble });
  p.arch = { ...p.arch, _bt: {} };
  p.r.badges = badge ? ['pullup'] : [];
  p.sk.ready = false; df.off = true; df.tm = 1; p.opp = df;
  if (move) { qa.startMove(p, input, 'hesi'); p.action = null; }
  qa.startShot(p, input, 'a1', 'set'); p.action.skill = null;
  gm.G.time += releaseDelay; gm.seed(7);
  qa.releaseShot(p, error, 'shot');
  if (!badge && (catchAge == null || dribble || move || mode !== 't5' || catchAge > 0.6 || catchAge < 0)) assert(gm.G.floats.some(f => f.text === '持球投衰减'));
  return gm.G.ball.shot.info;
}
const base = shot({ catchAge: 0.1 }), pull = shot(), immune = shot({ badge: true });
assert(pull.prob < base.prob);
assert.equal(immune.prob, base.prob);
const scale = Math.min(1, base.prob / 0.5);
assert(Math.abs(base.prob - pull.prob - 0.05 * scale) < 1e-9);
for (const opts of [{ catchAge: 0.601 }, { catchAge: -0.1 }, { catchAge: 0.1, dribble: true }, { catchAge: 0.1, move: true }, { catchAge: 0.7, releaseDelay: 0.1 }, { catchAge: 0.1, mode: '2p' }]) assert.equal(shot(opts).prob, pull.prob);
assert.equal(shot({ catchAge: 0.59, releaseDelay: 0.2 }).prob, base.prob, 'catch window is evaluated at shot start, like csTick');
assert.equal(shot({ catchAge: 0.6 }).prob, base.prob);
assert.equal(shot({ catchAge: 0 }).prob, base.prob);
assert.equal(shot({ mode: '2p', badge: true }).prob, base.prob);
for (const error of [0, 0.35, 2]) for (const badge of [false, true]) { const s = shot({ error, badge }); assert(s.prob >= gm.K.smMin && s.prob <= 1); }
for (const [three, tier] of [[0.7, 0], [0.8, 1], [0.85, 2], [0.9, 3], [0.99, 4]]) assert.equal(gm.BADGE_TIER.cs({ three }), tier);
for (const key of ['curry', 'harden', 'luka', 'durant', 'lillard', 'kyrie', 'sga']) assert(gm.ARCH[key].badges.includes('pullup'), key);
for (const key of ['curry', 'klay', 'drobinson']) assert(gm.BADGE_TIER.cs(gm.ARCH[key]) > 0, key);
for (const name of ['b5', 'team5']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'team5') source = source.replace('  PH.T5.CSB = CSB;', '  PH.catchQA = { catchBall, csTick }; PH.T5.CSB = CSB;');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
ctx.PH.T5.start({ home: 'GSW', away: 'BOS', qlen: 90, human: -1 });
const teammates = gm.G.players.filter(p => p.tm === gm.G.off), receiver = teammates[1];
gm.G.time = 0;
receiver.catchDribbled = true;
ctx.PH.catchQA.catchBall(receiver, { from: teammates[0], kind: 'chest', inb: true });
assert.equal(receiver.passCatchT, 0);
assert.equal(receiver.catchDribbled, false);
gm.G.ball.wasShot = false;
qa.pickup(receiver);
assert.equal(receiver.passCatchT, null, 'loose-ball pickup is not a pass catch');
function teamCatch(tier, dribbled = false) {
  ctx.PH.T5.start({ home: 'GSW', away: 'BOS', qlen: 90, human: -1 });
  gm.G.time = 10; ctx.PH.T5.T.time = 10;
  const team = gm.G.players.filter(p => p.tm === gm.G.off), p = team[1];
  for (const d of gm.G.players) if (d.tm !== p.tm) d.off = true;
  Object.assign(p, { x: 0, y: ctx.PH.render.HOOP.y - 5, speed: 0, vx: 0, vy: 0 });
  ctx.PH.catchQA.catchBall(p, { from: team[0], kind: 'chest', inb: true });
  p.csT = tier; p.catchDribbled = dribbled; p.sk.ready = false;
  qa.startShot(p, input, 'a1', 'set'); p.action.skill = null;
  ctx.PH.catchQA.csTick();
  const boost = p.action.csB || 0;
  const pop = (gm.G.bpops || []).some(b => b.pid === p.id && b.key === 'cs' && b.tier === tier);
  gm.seed(7); qa.releaseShot(p, 0.15, 'shot');
  return { prob: gm.G.ball.shot.info.prob, boost, pop };
}
const plainCatch = teamCatch(0), tieredCatch = teamCatch(3), dribbledCatch = teamCatch(3, true);
assert(tieredCatch.prob > plainCatch.prob);
assert.equal(tieredCatch.boost, 3); assert(tieredCatch.pop);
assert.equal(dribbledCatch.boost, 0);
assert.equal(ctx.PH.T5.CSB.p[3], 0.055);
assert(ctx.PH.T5.T5REG.some(t => t.k === 't5_csb_g4'));
console.log(`Shot probability: catch=${base.prob.toFixed(4)} pull-up=${pull.prob.toFixed(4)} pull-up badge=${immune.prob.toFixed(4)}`);
console.log(`5V5 existing CS badge: no badge=${plainCatch.prob.toFixed(4)} gold=${tieredCatch.prob.toFixed(4)}`);
console.log('PASS shot styles: scaled -5pp, badge immunity, 0.6s catch window, zero/expired/future catches, dribble/move exclusion, 1V1, bounds, roster, real catch/pickup, tiered CS effects/pops/tunables');
