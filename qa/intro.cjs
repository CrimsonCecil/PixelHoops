const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout: () => {} });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  const said = [];
  ctx.PH.audio = { voLine: (k, ev, i) => ({ f: k + ev + i, t: k + ':' + ev + ':' + i, d: 1.5 }), voSay: (it) => said.push(it.f), voStop() {}, play() {} };
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  ctx.PH.game.seed(7);
  return { ctx, Gm: ctx.PH.game, G: ctx.PH.game.G, said };
}
function runIntro(Gm, G) {
  let n = 0, saw = { walk: false, sig: new Set(), lines: [] };
  while (G.intro && n++ < 60 * 40) {
    const I = G.intro;
    if (G.time < I.t0 + 1) saw.walk = saw.walk || G.players.some((p) => p.speed > 1);
    for (const p of G.players) if (p.anim === 'cel') saw.sig.add(p.id);
    if (I.li >= 0 && saw.lines[saw.lines.length - 1] !== I.lines[I.li]) saw.lines.push(I.lines[I.li]);
    Gm.introTick(1 / 60);
  }
  assert.equal(G.intro, null, 'intro finishes on its own');
  return saw;
}

{
  const { Gm, G, said } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  const want = G.players.map((p) => [p.x, p.y]);
  Gm.introStart();
  assert.equal(G.phase, 'intro');
  assert.ok(Math.abs(G.players[0].x) > 6 && Math.abs(G.players[1].x) > 6, 'players start on the sidelines');
  assert.ok(G.intro.walk.some((S) => G.players[S.id].arch.key === 'lebron' && S.ty === 'chalk'), 'LeBron tosses chalk on his walk-in');
  assert.equal(G.players[G.intro.duo[0]].arch.key, 'lebron', 'first shot is LeBron');
  const saw = runIntro(Gm, G);
  assert.ok(saw.walk, 'players walk in');
  assert.match(saw.lines[0].t, /1 比 3/);
  assert.match(saw.lines[1].t, /四枚/);
  assert.equal(saw.lines.length, 4);
  assert.deepEqual(said, ['currydom0'], 'only the voiced line plays the voice pack');
  assert.equal(G.phase, 'check');
  G.players.forEach((p, i) => { assert.equal(p.x, want[i][0]); assert.equal(p.y, want[i][1]); });
  assert.ok(G.banner && G.banner.text === 'GAME START', 'GAME START title at the cut to the game camera');
  assert.ok(!/猩猩|动物园/.test(JSON.stringify(Gm.TALK)), 'no ape / zoo lines');
  console.log('PASS: 1V1 LeBron vs Curry intro walks in, does signatures, plays 4 rivalry lines, then hands off to the check.');
}
{
  const { Gm, G } = load();
  Gm.newGame({ mode: '2p', arch0: 'maxey', arch1: 'joe' });
  Gm.introStart();
  const L = G.intro.lines;
  assert.equal(L.length, 2);
  Gm.introPress(); Gm.introPress();
  assert.equal(G.intro.li, 0, 'first press skips to the dialogue, second completes the typing');
  Gm.introPress(); Gm.introPress(); Gm.introPress();
  assert.equal(G.intro, null);
  assert.equal(L[0].t, 'maxey:taunt:' + L[0].i);
  assert.equal(G.phase, 'check');
  console.log('PASS: generic matchup uses voiced taunt/dom clips; presses advance and finish the intro.');
}
{
  const { ctx, Gm, G } = load();
  const slots = ['curry', 'joe', 'maxey', 'kyrie', 'white', 'herb'].map((arch) => ({ arch, role: 'cpu' }));
  ctx.PH.T3.start({ slots, target: 21, clock: 14, replay: false });
  const want = G.players.map((p) => [p.x, p.y]);
  Gm.introStart();
  assert.equal(G.phase, 'intro');
  assert.equal(G.intro.duo.map((id) => G.players[id].arch.key).sort().join(), 'curry,kyrie', '3V3 features the rivalry pair');
  const saw = runIntro(Gm, G);
  assert.ok(saw.walk);
  assert.match(saw.lines[0].t, /2016 抢七/);
  G.players.forEach((p, i) => { assert.equal(p.x, want[i][0]); assert.equal(p.y, want[i][1]); });
  for (let i = 0; i < 120; i++) ctx.PH.T3.tick(1 / 60, []);
  assert.equal(G.phase, 'live', '3V3 goes live after the intro');
  console.log('PASS: 3V3 intro features Curry vs Kyrie, restores the six check spots and the match goes live.');
}
{
  const { Gm, G } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'kobe', arch1: 'shaq' });
  Gm.introStart(); Gm.introEnd();
  assert.equal(G.intro, null); assert.equal(G.phase, 'check');
  for (let i = 0; i < 90; i++) Gm.tick(1 / 60);
  assert.equal(G.phase, 'live');
  console.log('PASS: Esc skip hands straight to the tip-off and 1V1 goes live.');
}
{
  const { ctx, Gm, G } = load();
  const R = ctx.PH.render;
  // Simulate stale demo focus near the basket/corner before starting a 1V1 match
  G.focus = { cx: -4.2, cy: 0.2 };
  Gm.newGame({ mode: 'cpu', arch0: 'edwards', arch1: 'jclark' });
  assert.equal(G.focus.cx, 0, 'newGame resets stale demo focus cx');
  assert.ok(G.focus.cy < -3.5, 'newGame resets stale demo focus cy back to check distance');
  Gm.introStart();
  const W = R.W, H = R.H;
  let walkFrames = 0, talkFrames = 0;
  for (let n = 0; G.intro && n < 60 * 40; n++) {
    const I = G.intro;
    R.camera1Intro(G, 1 / 60);
    if (I.li < 0) {
      walkFrames++;
      const sh = G.players.find((p) => p.id === (I.shot != null ? I.shot : I.duo[0]));
      const head = R.proj(sh.x, sh.y, sh.h), feet = R.proj(sh.x, sh.y, 0);
      assert.ok(Math.abs(feet.x - W / 2) < W * 0.12, `walk-in player x centered: ${feet.x.toFixed(1)} vs ${W / 2}`);
      assert.ok(head.y >= H * 0.14 && feet.y <= H * 0.85, `walk-in player vertical bounds: head=${head.y.toFixed(1)} feet=${feet.y.toFixed(1)}`);
    } else if (G.time - I.lt > 0.6) {
      talkFrames++;
      for (const p of G.players) {
        const head = R.proj(p.x, p.y, p.h), feet = R.proj(p.x, p.y, 0);
        assert.ok(Math.abs(feet.x - W / 2) < W * 0.12, `dialogue player ${p.id} x centered: ${feet.x.toFixed(1)}`);
        assert.ok(head.y >= H * 0.11, `dialogue player ${p.id} head below top letterbox: ${head.y.toFixed(1)}`);
        assert.ok(feet.y <= H * 0.67, `dialogue player ${p.id} feet above dialogue box: ${feet.y.toFixed(1)}`);
      }
    }
    Gm.introTick(1 / 60);
  }
  assert.ok(walkFrames > 100 && talkFrames > 60, 'verified both walk-in and dialogue frames');
  console.log('PASS: 1V1 intro camera centers walking stars and keeps both players above the dialogue box.');
}
{
  const listeners = {};
  let gamepads = [];
  const ctx = vm.createContext({
    performance: { now: () => 0 },
    setTimeout: () => {},
    navigator: { getGamepads: () => gamepads },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  });
  ctx.window = ctx;
  vm.runInContext('let seed = 7; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
  for (const name of ['input', 'tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  ctx.PH.audio = { voLine: (k, ev, i) => ({ f: k + ev + i, t: k + ':' + ev + ':' + i, d: 1.5 }), voSay() {}, voStop() {}, play() {} };
  ctx.PH.game.seed(7);
  const Gm = ctx.PH.game, G = Gm.G, T3 = ctx.PH.T3, I = ctx.PH.input;
  const emit = (ev, data) => { for (const fn of listeners[ev] || []) fn({ preventDefault() {}, ...data }); };
  const tick3 = () => {
    const h = T3.holder();
    const off = !!(h && h.id === 0);
    const local = I.read3(off);
    T3.tick(1 / 60, { 0: local });
    I.endTick();
  };
  const start3v3IntroToLastLine = () => {
    const slots = [
      { arch: 'curry', role: 'human' },
      { arch: 'joe', role: 'cpu' },
      { arch: 'maxey', role: 'cpu' },
      { arch: 'kyrie', role: 'cpu' },
      { arch: 'white', role: 'cpu' },
      { arch: 'herb', role: 'cpu' },
    ];
    T3.start({ slots, local: 0, target: 21, clock: 14, replay: false });
    Gm.introStart();
    // Advance to the final line already fully typed out
    while (G.intro.li < G.intro.lines.length - 1) Gm.introPress();
    G.intro.lines[G.intro.li].done = true;
  };

  // 1) Quick tap of KeyE (pass) ends dialogue: latch must not leak into check-ball T.passQueue
  start3v3IntroToLastLine();
  emit('keydown', { code: 'KeyE', repeat: false });
  emit('keyup', { code: 'KeyE' });
  assert.ok(I.sysAny());
  Gm.introPress();
  I.clearSys();
  assert.equal(G.intro, null);
  assert.equal(G.phase, 'check');
  for (let i = 0; i < 65; i++) tick3();
  assert.equal(G.phase, 'live');
  assert.equal(T3.T.pass, null, 'tapped KeyE during intro must not fire a pass at tip-off');
  assert.equal(T3.T.passQueue, null);
  assert.equal(T3.holder()?.id, 0, 'ball handler keeps the ball at tip-off');

  // 2) Held KeyE across introEnd() must stay masked until released, then a fresh press passes
  start3v3IntroToLastLine();
  emit('keydown', { code: 'KeyE', repeat: false });
  Gm.introPress();
  I.clearSys();
  for (let i = 0; i < 10; i++) tick3();
  assert.equal(T3.T.passQueue, null, 'held KeyE from intro must not queue a pass during check');
  emit('keyup', { code: 'KeyE' });
  while (G.phase !== 'live') tick3();
  tick3();
  assert.equal(T3.T.pass, null, 'ball handler still holds the ball after releasing KeyE');
  emit('keydown', { code: 'KeyE', repeat: false });
  tick3();
  emit('keyup', { code: 'KeyE' });
  assert.ok(T3.T.pass, 'a fresh KeyE press after tip-off passes normally');

  // 3) Gamepad Xbox A (button 0) pressed & held to end dialogue must not pass at tip-off
  const mkPad = (aPressed) => ({
    index: 0,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 ? aPressed : false, value: i === 0 && aPressed ? 1 : 0 })),
  });
  gamepads = [mkPad(false)];
  I.pollPads();
  start3v3IntroToLastLine();
  gamepads = [mkPad(true)];
  assert.ok(I.pollPads());
  Gm.introPress();
  I.clearSys();
  for (let i = 0; i < 10; i++) { I.pollPads(); tick3(); }
  assert.equal(T3.T.passQueue, null, 'held Xbox A from intro must not queue a pass during check');
  gamepads = [mkPad(false)];
  while (G.phase !== 'live') { I.pollPads(); tick3(); }
  I.pollPads(); tick3();
  assert.equal(T3.T.pass, null, 'ball handler still holds the ball at tip-off after Xbox A release');
  gamepads = [mkPad(true)];
  I.pollPads();
  tick3();
  gamepads = [mkPad(false)];
  assert.ok(T3.T.pass, 'a fresh Xbox A press after release passes normally');

  console.log('PASS: pass presses (keyboard tap/hold and gamepad A) ending 3V3 intro do not fire at tip-off.');
}
