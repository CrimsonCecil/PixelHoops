const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 11; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  const played = [];
  ctx.PH.audio = {
    voLine: (k, ev, i) => ({ f: k + ev + i, t: k + ':' + ev + ':' + i, d: 1.5 }),
    voSay() {},
    voStop() {},
    play: (n) => played.push(n),
    vo() {},
  };
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  ctx.PH.game.seed(11);
  return { ctx, Gm: ctx.PH.game, G: ctx.PH.game.G, played };
}

// 1. Pre-game entrance: cheering, confetti, LED ticker, and clean handoff
{
  const { Gm, G, played } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  Gm.introStart();
  let maxConfetti = 0, sawIntroCheer = false, sawLed = false, sawHighCheer = false;
  for (let i = 0; i < 60 * 8 && G.intro; i++) {
    Gm.introTick(1 / 60);
    maxConfetti = Math.max(maxConfetti, G.fx.confetti.length);
    if (played.includes('introCheer')) sawIntroCheer = true;
    if (G.fx.led && /NOW ENTERING/.test(G.fx.led.text)) sawLed = true;
    if (G.fx.cheer >= 2.2) sawHighCheer = true;
  }
  assert.ok(sawIntroCheer, 'entrance plays introCheer audio');
  assert.ok(sawLed, 'entrance drives LED ticker');
  assert.ok(sawHighCheer, 'entrance keeps crowd cheering');
  assert.ok(maxConfetti >= 40, 'entrance spawns abundant confetti (' + maxConfetti + ')');
  Gm.introEnd();
  assert.equal(G.fx.confetti.length, 0, 'introEnd clears leftover entrance confetti');
  console.log('PASS: entrance walk-in plays cheering, drives LED/crowd, spawns confetti, and cleans up on end.');
}

// 2. 1V1 scoring full-screen feedback and dunk screen shake
{
  const { Gm, G, played } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  G.phase = 'live';

  // Regular 2PT with unlimited shot clock (shotClock = 0) must not misclassify as CLUTCH
  Gm.CFG.shotClock = 0; G.shotClock = 0;
  played.length = 0; G.fx.shake = 0; G.fx.confetti.length = 0; G.fx.scoreFx = null;
  Gm.t5.scoreBy(0, 2, 'shot', '中投');
  assert.ok(G.fx.scoreFx && G.fx.scoreFx.tier === 0, 'unlimited shot clock 2PT stays tier 0');
  assert.ok(played.includes('cheerSoft') && !played.includes('cheer2'), 'unlimited shot clock 2PT plays cheerSoft');
  Gm.CFG.shotClock = 24; G.shotClock = 24;

  // Regular 2PT
  played.length = 0;
  Gm.t5.scoreBy(0, 2, 'shot', '中投');
  assert.ok(G.fx.scoreFx, '2PT triggers full-screen scoreFx');
  assert.equal(G.fx.scoreFx.pts, 2);
  assert.ok(G.fx.confetti.length >= 10, '2PT spawns subtle confetti');
  assert.ok(played.includes('cheerSoft'), '2PT plays soft crowd cheer');

  // Normal dunk
  G.fx.shake = 0; G.fx.confetti.length = 0; G.fx.scoreFx = null;
  Gm.t5.scoreBy(0, 2, 'dunk', '单手劈扣');
  assert.ok(G.fx.scoreFx && G.fx.scoreFx.kind === 'dunk', 'dunk triggers dunk scoreFx');
  assert.ok(G.fx.shake >= 9, 'normal dunk triggers strong screen shake (' + G.fx.shake + ')');
  assert.ok(G.fx.confetti.length >= 35, 'dunk fires confetti cannon');

  // Poster / special dunk
  G.fx.shake = 0; G.fx.confetti.length = 0; G.fx.scoreFx = null;
  Gm.t5.scoreBy(0, 2, 'dunk', '隔人暴扣');
  assert.ok(G.fx.shake >= 14, 'poster dunk triggers heavy screen shake (' + G.fx.shake + ')');
  assert.ok(G.fx.confetti.length >= 55, 'poster dunk fires bigger confetti cannon');
  console.log('PASS: 1V1 2PT, dunk, and poster dunk trigger full-screen scoreFx, confetti, and scaled dunk shake.');
}

// 3. 3V3 / 5V5 (scoreT5) scoring feedback and dunk shake
{
  const { ctx, Gm, G } = load();
  const slots = ['lebron', 'curry', 'jokic', 'kobe', 'shaq', 'kyrie'].map((arch) => ({ arch, role: 'cpu' }));
  ctx.PH.T3.start({ slots, target: 21, clock: 14, replay: false });
  G.phase = 'live'; G.needClear = false;

  Gm.t5.scoreBy(0, 3, 'shot', '三分');
  assert.ok(G.fx.scoreFx && G.fx.scoreFx.pts === 3, '3V3 3PT triggers scoreFx');
  assert.ok(G.fx.confetti.length >= 25, '3V3 3PT spawns confetti');

  G.fx.shake = 0; G.fx.confetti.length = 0; G.fx.scoreFx = null;
  Gm.t5.scoreBy(0, 2, 'dunk', '单手劈扣');
  assert.ok(G.fx.scoreFx && G.fx.scoreFx.kind === 'dunk', '3V3/5V5 dunk triggers scoreFx');
  assert.ok(G.fx.shake >= 9, '3V3/5V5 dunk triggers screen shake (' + G.fx.shake + ')');
  console.log('PASS: 3V3/5V5 scoring triggers full-screen scoreFx, confetti, and dunk screen shake.');
}
