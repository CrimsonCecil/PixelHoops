const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load(baseline = false) {
  let randomSeed = 7;
  const math = Object.create(Math);
  math.random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ctx = vm.createContext({ console, Math: math, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}), read5: () => ({}) } };
  ctx.credits = [];
  ctx.credit = (df, hp) => {
    const rig = ctx.PH.rig(df), p = hp || ctx.PH.game.G.ball;
    const distance = Math.min(...[rig.handL, rig.handR].map(h => Math.hypot(h[0] - p.x, h[1] - p.y, h[2] - p.z)));
    ctx.credits.push(distance);
    if (!baseline) {
      assert(distance <= ctx.PH.render.BALL_R + 0.12 + 1e-9, `noncontact block: ${distance}`);
      assert(!df.armS || df.armS.every(s => s <= 1), 'stretched blocking arm');
      assert.deepEqual([p.x, p.y, p.z], [ctx.PH.game.G.ball.x, ctx.PH.game.G.ball.y, ctx.PH.game.G.ball.z]);
    }
  };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game', 'b5', 'team5']) {
    let source = baseline && name === 'game'
      ? execFileSync('git', ['show', `${process.env.BLOCK_BASE || 'HEAD'}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') {
      source = source.replace('function blockFx(df, hp, sh, kind) {', 'function blockFx(df, hp, sh, kind) { window.credit(df, hp);');
      source = source.replace('function chaseFx(df) {', 'function chaseFx(df) { window.credit(df);');
      const names = baseline ? 'tryBlock, updateBall' : 'blockContact, tryBlock, contactBlock, heldShotPos, updateBall, updateAction';
      source = source.replace('PH.game = {', `PH.contactQA = { ${names} }; PH.game = {`);
    }
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  return ctx;
}

function fixture() {
  const ctx = load(), gm = ctx.PH.game;
  gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'gobert', target: 9999 });
  const [sh, df] = gm.G.players;
  Object.assign(sh, { x: 0, y: 10, z: 1.5, face: Math.PI / 2 });
  Object.assign(df, { x: 0, y: 10.3, z: 0.19, face: -Math.PI / 2, stun: 0 });
  df.action = { type: 'block', t: 0.04, zmax: 1, rel: 1 };
  Object.assign(df.pose, { aRp: Math.PI, aRe: 0, aRq: 0, reachR: 1, reachL: 1 });
  return { ctx, gm, sh, df, qa: ctx.PH.contactQA };
}

{
  const { ctx, gm, sh, df, qa } = fixture();
  const high = { x: df.x, y: df.y, z: 3.9 }, before = [df.x, df.y, df.z];
  assert.equal(qa.blockContact(df, high), false);
  assert.equal(qa.tryBlock(sh, df, 'dunk', 100, null, high, {}), false);
  assert.deepEqual([df.x, df.y, df.z], before);
  df.z = 1; df.vz = 0; df.action.t = 0.25;
  const hand = ctx.PH.rig(df).handR, ball = { x: hand[0], y: hand[1], z: hand[2] };
  assert(qa.blockContact(df, ball));
  gm.CFG.blockMul = 100;
  assert(qa.tryBlock(sh, df, 'shot', 100, null, ball, {}));
  const attempt = {};
  gm.CFG.blockMul = 0;
  assert.equal(qa.tryBlock(sh, df, 'shot', 100, null, ball, attempt), false);
  gm.CFG.blockMul = 100;
  assert.equal(qa.tryBlock(sh, df, 'shot', 100, null, ball, attempt), false);
  assert.equal(qa.blockContact(df, { ...ball, x: ball.x + 2 }), false);
  df.action.chase = true;
  assert.equal(qa.tryBlock(sh, df, 'dunk', 100, 1, high, {}), false);
  console.log('PASS low jump/high dunk: no contact/block or position snap; apex contact: block possible; one roll per defender; chase requires contact');
}

{
  const { ctx, gm, sh, df, qa } = fixture();
  gm.G.mode = 't5'; sh.tm = 0; df.tm = 0; sh.opp = df;
  const helper = gm.t5.makePlayer(1, 'gobert', 'cpu');
  Object.assign(helper, { id: 2, x: df.x, y: df.y, z: 1, tm: 0, face: df.face, stun: 0, action: { type: 'block', t: 0.3, zmax: 1, rel: 1 } });
  Object.assign(helper.pose, df.pose);
  gm.G.players.push(helper); gm.G.stats.push(gm.t5.newStats());
  const hand = ctx.PH.rig(helper).handR, ball = { x: hand[0], y: hand[1], z: hand[2] };
  const attempt = { type: 'layup', t: 0.3, V: { blk: 100, name: 'test' } }, info = { who: sh.id };
  assert.equal(qa.contactBlock(sh, attempt, ball, 'lay', info), false);
  helper.tm = 1; gm.CFG.blockMul = 100;
  assert(qa.contactBlock(sh, attempt, ball, 'lay', info));
  assert.equal(gm.G.stats[2].blk, 1); assert.equal(info.blocked, true);
  assert.equal(gm.G.stats[1].blk, 0);
  console.log('PASS 5V5 contact resolver: no opponents => no block; non-opp help defender credited, teammate excluded');
}

for (const rising of [false, true]) {
  const { ctx, gm, sh, df, qa } = fixture();
  df.z = 1; gm.CFG.blockMul = 100;
  const hand = ctx.PH.rig(df).handR;
  const attempt = { type: 'shot', t: 0.5, V: { blk: 100, name: 'test' } };
  const info = { who: sh.id, made: true }; gm.G.lastShot = info;
  Object.assign(gm.G.ball, { state: 'shot', x: hand[0], y: hand[1], z: hand[2], vx: 0, vy: 0, vz: rising ? 1 : -1,
    shot: { t: 0, T: 1, shooter: sh.id, kind: 'shot', made: true, attempt, info } });
  qa.updateBall(1 / 60);
  assert.equal(gm.G.stats[df.id].blk, rising ? 1 : 0);
  if (rising) { assert.equal(info.made, false); assert.equal(info.blocked, true); assert.equal(gm.G.ball.shot, null); }
}
console.log('PASS flight contact: rising shot blocked and pending make cancelled; descending shot not blocked');

for (const outcome of ['block', 'make', 'miss']) {
  const { ctx, gm, sh, df, qa } = fixture();
  gm.G.phase = 'live'; gm.G.needClear = false; df.off = true;
  sh.icy = true; sh.mk = 2;
  gm._dbg.startShot(sh, { mx: 0, my: 0 }, 'a1');
  const a = sh.action, hzBefore = JSON.stringify(gm.G.hz[sh.id]);
  gm._dbg.releaseShot(sh, 0, 'shot');
  const s = gm.G.ball.shot;
  assert(s && s.made, 'uncontested green release should project a make');
  assert.equal(JSON.stringify(gm.G.hz[sh.id]), hzBefore);
  assert.equal(sh.icy, true); assert.equal(sh.mk, 2);
  if (outcome === 'block') {
    df.off = false; df.z = 1; gm.CFG.blockMul = 100;
    const hand = ctx.PH.rig(df).handR;
    Object.assign(gm.G.ball, { x: hand[0], y: hand[1], z: hand[2], vz: 1 });
    qa.updateBall(1 / 60);
    assert.equal(s.info.blocked, true);
    assert.equal(JSON.stringify(gm.G.hz[sh.id]), hzBefore);
    assert.equal(sh.icy, true); assert.equal(sh.mk, 2);
  } else {
    s.made = outcome === 'make'; s.T = 0; s.mk = null;
    qa.updateBall(1 / 60);
    assert.equal(gm.G.hz[sh.id]['_' + a.hzZ], outcome === 'make' ? 1 : -1);
    assert.equal(sh.icy, outcome !== 'make');
    assert.equal(sh.mk, outcome === 'make' ? 0 : 3);
  }
}
console.log('PASS shooting form: projected/blocked makes grant no hot-zone or cold-streak boosts; resolved makes/misses update form');

for (const outcome of ['make', 'miss', 'cleared', 'no-stats']) {
  const { ctx, gm, sh, df, qa } = fixture();
  gm.G.mode = 'train'; gm.G.phase = 'live'; gm.G.needClear = false;
  gm.G.train.stats = gm.newTrainStats(); df.off = true;
  ctx.Math.random = () => 0.999999;
  gm._dbg.startShot(sh, { mx: 0, my: 0 }, 'a1');
  gm._dbg.releaseShot(sh, outcome === 'miss' ? 1 : 0, 'shot');
  const s = gm.G.ball.shot, S = gm.G.train.stats;
  assert.equal(S.n, 1); assert.equal(S.made, outcome === 'miss' ? 0 : 1);
  const timing = JSON.stringify(S.timing), sumC = S.sumC;
  if (outcome === 'cleared') gm.G.train.stats = gm.newTrainStats();
  if (outcome === 'no-stats') gm.G.train.stats = null;
  ctx.Math.random = () => 0; df.off = false; df.z = 1; gm.CFG.blockMul = 100;
  const hand = ctx.PH.rig(df).handR;
  Object.assign(gm.G.ball, { x: hand[0], y: hand[1], z: hand[2], vz: 1 });
  qa.updateBall(1 / 60);
  assert.equal(s.info.blocked, true);
  assert.equal(qa.contactBlock(sh, s.attempt, { x: hand[0], y: hand[1], z: hand[2] }, 'shot', s.info), false);
  if (outcome === 'cleared') { assert.equal(gm.G.train.stats.n, 0); assert.equal(gm.G.train.stats.blocked, 0); }
  else if (outcome !== 'no-stats') {
    assert.equal(S.n, 1); assert.equal(S.made, 0); assert.equal(S.blocked, 1);
    assert.equal(S.zones[s.info.zone][0], 0); assert.equal(S.zones[s.info.zone][1], 1);
    assert.equal(S.last.length, 1); assert.equal(S.last[0].made, false); assert.equal(S.last[0].tl, '—');
    assert.equal(JSON.stringify(S.timing), timing); assert.equal(S.sumC, sumC);
  }
}
console.log('PASS training flight blocks: one attempt, no made credit, one block, coherent zone/timing/recent totals; cleared/missing stats safe');

function cpuRuns(baseline) {
  const ctx = load(baseline), gm = ctx.PH.game;
  let blocks = 0, attempts = 0;
  const pairs = [['lebron', 'gobert'], ['jordan', 'wemby'], ['curry', 'davis'], ['giannis', 'shaq']];
  for (let seed = 1; seed <= 8; seed++) {
    const pair = pairs[(seed - 1) % pairs.length];
    gm.seed(seed);
    gm.newGame({ mode: 'cpu', arch0: pair[0], arch1: pair[1], target: 9999, diff: 2 });
    gm.G.players[0].ctrl = 'cpu'; gm.G.vopt.replay = false;
    for (let frame = 0; frame < 18000; frame++) gm.tick(1 / 60);
    blocks += gm.G.stats.reduce((s, p) => s + p.blk, 0);
    attempts += gm.G.stats.reduce((s, p) => s + p.fga, 0);
  }
  assert.equal(blocks, ctx.credits.length);
  if (!baseline) assert(blocks > 0, 'contact audit must include credited blocks');
  console.log(`${baseline ? 'BEFORE' : 'AFTER'} 8 seeded CPU games × 300s: blocks=${blocks}, FGA=${attempts}, block rate=${(100 * blocks / attempts).toFixed(2)}%, max hand-ball distance=${Math.max(0, ...ctx.credits).toFixed(6)}m`);
}

if (process.env.BLOCK_BASE) cpuRuns(true);
cpuRuns(false);

{
  const ctx = load();
  ctx.PH.game.seed(99);
  ctx.PH.T5.start({ home: 'LAL', away: 'BOS', human: -1, qlen: 300 });
  ctx.PH.game.G.vopt.replay = false;
  for (let frame = 0; frame < 7200; frame++) ctx.PH.T5.tick(1 / 60);
  assert.equal(ctx.PH.game.G.players.length, 10);
  console.log(`PASS 5V5 7200 frames: simulation time=${ctx.PH.T5.T.time.toFixed(2)}s, audited blocks=${ctx.credits.length}`);
}
