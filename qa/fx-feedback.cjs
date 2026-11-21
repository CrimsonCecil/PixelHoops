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
  const played = [], voiced = [], said = [];
  let manifestReady = true, readyCbs = [];
  ctx.PH.audio = {
    voLine: (k, ev, i) => (manifestReady ? { f: k + ev + i, t: k + ':' + ev + ':' + i, d: 1.5 } : null),
    voSay: (it) => said.push(it.f),
    voStop() {},
    voWhenReady: (cb) => { if (manifestReady) cb(); else readyCbs.push(cb); },
    play: (n) => played.push(n),
    vo: (k, ev, mode) => { if (!manifestReady) return null; voiced.push(k + ':' + ev + ':' + (mode || '')); return { f: k + ev }; },
  };
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  ctx.PH.game.seed(11);
  return {
    ctx, Gm: ctx.PH.game, G: ctx.PH.game.G, played, voiced, said,
    setManifestReady: (v) => { manifestReady = v; if (v) { const cbs = readyCbs; readyCbs = []; cbs.forEach((cb) => cb()); } }
  };
}

// 1. Pre-game entrance: visuals and walk-in voice packs stay intact without noisy procedural intro SFX
{
  const { Gm, G, played, voiced } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  Gm.introStart();
  let maxConfetti = 0, sawLed = false, sawHighCheer = false;
  for (let i = 0; i < 60 * 9 && G.intro; i++) {
    Gm.introTick(1 / 60);
    maxConfetti = Math.max(maxConfetti, G.fx.confetti.length);
    if (G.fx.led && /NOW ENTERING/.test(G.fx.led.text)) sawLed = true;
    if (G.fx.cheer >= 2.2) sawHighCheer = true;
  }
  assert.equal(played.length, 0, 'entrance does not fire noisy procedural intro SFX (' + played.join(',') + ')');
  assert.ok(sawLed, 'entrance drives LED ticker');
  assert.ok(sawHighCheer, 'entrance keeps crowd visual cheering');
  assert.ok(maxConfetti >= 40, 'entrance spawns abundant confetti (' + maxConfetti + ')');
  assert.ok(voiced.some((v) => v.startsWith('lebron:taunt')), 'LeBron plays voice pack during walk-in');
  assert.ok(voiced.some((v) => v.startsWith('curry:taunt')), 'Curry plays voice pack during walk-in');
  Gm.introEnd();
  assert.equal(G.fx.confetti.length, 0, 'introEnd clears leftover entrance confetti');
  console.log('PASS: entrance walk-in keeps visuals and voice packs without noisy intro SFX.');
}

// 1b. Delayed vo/manifest.json load still plays voiced intro dialogue line once ready
{
  const { Gm, G, said, setManifestReady } = load();
  setManifestReady(false);
  Gm.newGame({ mode: 'cpu', arch0: 'maxey', arch1: 'joe' });
  Gm.introStart();
  Gm.introPress(); Gm.introPress(); // line 0 (template)
  Gm.introPress(); Gm.introPress(); // line 1 (template)
  Gm.introPress(); // line 2 (voiced taunt, manifest not loaded yet)
  assert.equal(said.length, 0, 'nothing played before manifest resolves');
  setManifestReady(true);
  assert.equal(said.length, 1, 'voiced intro line plays once manifest resolves');
  assert.match(G.intro.lines[2].t, /^maxey:taunt:/, 'subtitle updates to resolved voice line');
  console.log('PASS: delayed vo/manifest.json load still triggers voiced intro dialogue line.');
}

// 1c. Skipping walk-in suppresses pending walk-in voices during dialogue
{
  const { Gm, G, played, voiced } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  Gm.introStart();
  Gm.introPress(); // skip straight to dialogue before walk-in beats fire
  played.length = 0; voiced.length = 0;
  for (let i = 0; i < 60 * 6 && G.intro; i++) Gm.introTick(1 / 60);
  assert.equal(voiced.length, 0, 'skipped walk-in voices do not interrupt dialogue');
  assert.equal(played.length, 0, 'skipped walk-in plays no intro SFX during dialogue');
  console.log('PASS: skipping walk-in suppresses pending walk-in voices during dialogue.');
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

// 4. Rebound positive cue SFX (1V1 & 3V3)
{
  const { ctx, Gm, G, played } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  G.phase = 'live';

  // 1V1 human defensive rebound plays positive 'rebound' cue (without duplicating 'grab')
  G.off = 1;
  G.ball.state = 'loose';
  G.ball.wasShot = true;
  played.length = 0;
  Gm.t5.pickup(G.players[0]);
  assert.ok(played.includes('rebound'), 'human defensive rebound plays positive rebound cue');
  assert.ok(!played.includes('grab'), 'rebound does not duplicate grab SFX');

  // 1V1 CPU defensive rebound does not play positive 'rebound' cue
  G.off = 0;
  G.ball.state = 'loose';
  G.ball.wasShot = true;
  played.length = 0;
  Gm.t5.pickup(G.players[1]);
  assert.ok(!played.includes('rebound'), 'CPU defensive rebound does not play positive rebound cue');

  // 1V1 human offensive rebound keeps 'oreb' cue without duplicating 'grab'
  G.off = 0;
  G.ball.state = 'loose';
  G.ball.wasShot = true;
  played.length = 0;
  Gm.t5.pickup(G.players[0]);
  assert.ok(played.includes('oreb'), 'offensive rebound plays oreb cue');
  assert.ok(!played.includes('grab'), 'offensive rebound does not duplicate grab SFX');

  // Non-rebound loose ball pickup by human still plays 'grab'
  G.off = 1;
  G.ball.state = 'loose';
  G.ball.wasShot = false;
  played.length = 0;
  Gm.t5.pickup(G.players[0]);
  assert.ok(played.includes('grab'), 'non-rebound loose ball pickup still plays grab');

  // 3V3 AI teammate defensive rebound plays positive 'rebound' cue; opponent CPU does not
  const slots = ['lebron', 'curry', 'jokic', 'kobe', 'shaq', 'kyrie'].map((arch, i) => ({ arch, role: i === 0 ? 'p1' : 'cpu' }));
  ctx.PH.T3.start({ slots, target: 21, clock: 14, replay: false });
  G.phase = 'live';
  G.off = 1;
  G.ball.state = 'loose';
  G.ball.wasShot = true;
  played.length = 0;
  Gm.t5.pickup(G.players[1]); // AI teammate on team 0
  assert.ok(played.includes('rebound'), '3V3 teammate defensive rebound plays positive rebound cue');

  G.off = 0;
  G.ball.state = 'loose';
  G.ball.wasShot = true;
  played.length = 0;
  Gm.t5.pickup(G.players[3]); // opponent CPU on team 1
  assert.ok(!played.includes('rebound'), '3V3 opponent defensive rebound does not play positive rebound cue');
  console.log('PASS: rebound grabs play positive cue SFX for the player/team without firing for opponents.');
}
