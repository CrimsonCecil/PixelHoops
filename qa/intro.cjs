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
  assert.equal(saw.lines.length, 4);
  assert.deepEqual(said, ['lebrontaunt3', 'currytaunt0', 'lebrondom2', 'currydom0'], 'all 4 rivalry lines play each player voice pack');
  for (const [pair, lines] of Object.entries(Gm.TALK)) {
    for (const L of lines) assert.ok(L.length >= 3 && typeof L[1] === 'string' && typeof L[2] === 'number', pair + ' has no text-only lines');
  }
  assert.equal(G.phase, 'check');
  G.players.forEach((p, i) => { assert.equal(p.x, want[i][0]); assert.equal(p.y, want[i][1]); });
  assert.ok(G.banner && G.banner.text === 'GAME START', 'GAME START title at the cut to the game camera');
  assert.ok(!/猩猩|动物园/.test(JSON.stringify(Gm.TALK)), 'no ape / zoo lines');
  console.log('PASS: 1V1 LeBron vs Curry intro walks in, does signatures, plays 4 rivalry lines, then hands off to the check.');
}
{
  const { Gm, G, said } = load();
  Gm.newGame({ mode: '2p', arch0: 'maxey', arch1: 'joe' });
  Gm.introStart();
  const L = G.intro.lines, maxey = G.players.find((p) => p.arch.key === 'maxey');
  assert.equal(L.length, 3);
  assert.equal(L[0].id, maxey.id);
  assert.ok(L[0].gen && L[1].gen && L[2].gen, 'generic lines are tagged');
  assert.equal(L[0].v, 'dom', 'generic opening line uses player voice pack (dom)');
  assert.equal(L[1].v, 'taunt', 'generic reply line uses opponent voice pack (taunt)');
  assert.equal(L[2].v, 'taunt', 'generic closing line uses player voice pack (taunt)');
  assert.ok(L[0].fb.includes(Gm.ARCH.joe.name) && L[1].fb.includes(Gm.ARCH.maxey.name), 'stat templates kept as fallback text');
  Gm.introPress(); Gm.introPress();
  assert.equal(G.intro.li, 0, 'first press skips to the dialogue, second completes the typing');
  for (let i = 0; i < 5; i++) Gm.introPress();
  assert.equal(G.intro, null);
  assert.equal(L[0].t, 'maxey:dom:' + L[0].i, 'opening line resolves from voice pack');
  assert.equal(L[1].t, 'joe:taunt:' + L[1].i, 'reply line resolves from voice pack');
  assert.equal(L[2].t, 'maxey:taunt:' + L[2].i, 'closing line resolves from voice pack');
  assert.equal(said.length, 3, 'all 3 generic intro lines play the player voice packs continuously');
  assert.equal(G.phase, 'check');
  const keys = Object.keys(Gm.ARCH);
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i], b = keys[(i * 7 + 3) % keys.length];
    if (a === b || Gm.TALK[[a, b].sort().join('|')]) continue;
    Gm.newGame({ mode: 'cpu', arch0: a, arch1: b }); Gm.introStart();
    const { lines: T, duo: [first, second] } = G.intro;
    assert.equal(T.length, 3, a + ' vs ' + b);
    for (const [i, id, line, voice] of [[0, first, 0, 'dom'], [1, second, 1, 'taunt'], [2, first, 1, 'taunt']]) {
      const custom = G.players[id].arch.intro;
      assert.equal(T[i].id, id);
      if (custom) {
        assert.equal(T[i].t, custom[line]);
        assert.equal(T[i].v, 'intro', 'authored lines use dedicated clips or keep their subtitles');
        assert.equal(T[i].i, line);
      } else {
        assert.equal(T[i].v, voice);
        if (i < 2) assert.ok(T[i].fb && !/[{}]/.test(T[i].fb), a + ' vs ' + b);
      }
    }
    G.intro = null;
  }
  console.log('PASS: generic matchups voice all 3 intro lines from each player voice pack with template fallbacks; presses advance and finish the intro.');
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
  assert.equal(saw.lines[0].t, 'kyrie:win:2', '3V3 rivalry opening line resolves from voice pack');
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
  for (const k of ['camInZ', 'camInDist', 'camInPitch', 'camInTalkZ', 'camInTalkDist', 'camInTalkPitch']) {
    const m = ctx.PH.TUNE.meta('l1_' + k);
    assert.ok(m, `tune parameter l1_${k} is registered`);
    assert.equal(m.cat, 'pace', `l1_${k} categorized under pace`);
    assert.equal(m.sub, '镜头', `l1_${k} categorized under 镜头`);
  }
  // Changing exposed intro camera tuning immediately updates camera1Intro
  Gm.newGame({ mode: 'cpu', arch0: 'edwards', arch1: 'jclark' });
  Gm.introStart();
  ctx.PH.TUNE.set('l1_camInZ', 1.1);
  ctx.PH.TUNE.set('l1_camInPitch', 2);
  R.camera1Intro(G, 1 / 60);
  assert.ok(Math.abs(R.cam.z - 1.1) < 1e-6, 'camInZ tune controls walk-in camera height');
  assert.ok(R.cam.fz > 0, 'positive camInPitch tilts camera upward');
  console.log('PASS: 1V1 intro camera centers walking stars, uses low-angle defaults, and responds to exposed tuning sliders.');
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
{
  const { ctx, Gm, G } = load();
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  Gm.newGame({ mode: 'cpu', arch0: 'beal', arch1: 'braun' });
  assert.ok(G.players[1].pose.passHands, 'setupCheck sets defender passHands for check-ball');
  Gm.introStart();
  for (const p of G.players) assert.equal(p.pose.passHands, undefined, `introStart clears passHands on player ${p.id}`);
  for (let n = 0; n < 300 && G.intro; n++) {
    Gm.introTick(1 / 60);
    for (const p of G.players) {
      assert.equal(p.pose.passHands, undefined, `no stale passHands on player ${p.id} during intro`);
      const k = ctx.PH.rig(p);
      assert.ok(dist3(k.shL, k.handL) < 1.3, `player ${p.id} left arm length stays normal during intro`);
      assert.ok(dist3(k.shR, k.handR) < 1.3, `player ${p.id} right arm length stays normal during intro`);
    }
  }
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  assert.match(css, /#stage\.intro\s+#scorebar\b/, 'CSS hides scoreboard during intro');
  assert.match(css, /#stage\.intro\s+\.pcard\b/, 'CSS hides player info cards during intro');
  console.log('PASS: intro clears check-ball passHands (no stretched arms) and hides top scoreboard/player cards.');
}
{
  // Verify every TALK entry resolves in real vo/manifest.json and introNext waits for async voSay onStart before auto-advancing
  const { ctx, Gm, G } = load();
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../vo/manifest.json'), 'utf8')).voices;
  for (const [pair, lines] of Object.entries(Gm.TALK)) {
    for (const L of lines) {
      const [who, ev, idx] = L;
      const arr = manifest[who] && manifest[who].lines && manifest[who].lines[ev];
      assert.ok(arr && arr.length > 0 && arr[idx % arr.length] && arr[idx % arr.length].t, `${pair}: ${who}.${ev}[${idx}] exists in vo/manifest.json`);
    }
  }
  let pendingStart = null, preloaded = null;
  ctx.PH.audio.voPreload = (keys) => { preloaded = keys; };
  ctx.PH.audio.voSay = (it, onStart) => { pendingStart = onStart; return true; };
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  Gm.introStart();
  assert.deepEqual(Array.from(preloaded), ['lebron', 'curry'], 'introStart preloads both featured players');
  Gm.introPress();
  assert.equal(G.intro.li, 0);
  assert.equal(G.intro.lines[0].waitVo, true, 'line waits for async voSay start before auto-advancing');
  for (let i = 0; i < 60 * 3; i++) Gm.introTick(1 / 60);
  assert.equal(G.intro.li, 0, 'slow voice fetch (3s) does not advance and cancel the line early');
  pendingStart(2.4);
  assert.equal(G.intro.lines[0].waitVo, false, 'onStart clears waitVo and resyncs line duration');
  for (let i = 0; i < 60 * 2; i++) Gm.introTick(1 / 60);
  assert.equal(G.intro.li, 0, 'line stays visible while the 2.4s clip plays');
  for (let i = 0; i < 60 * 2; i++) Gm.introTick(1 / 60);
  assert.equal(G.intro.li, 1, 'line advances once playback duration finishes');
  console.log('PASS: all 9 TALK rivalries resolve in vo/manifest.json and intro waits for async voSay start without early cancellation.');
}
{
  // Verify walk-in + dialogue never repeat a voice clip across all 9 rivalries and small voice packs (jwells: 2 taunts)
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../vo/manifest.json'), 'utf8')).voices;
  const fetched = new Set();
  const audioCtx = vm.createContext({
    window: null, PH: {}, performance: { now: () => 0 }, setTimeout: () => {}, clearTimeout: () => {},
    fetch: async (url) => {
      if (url === 'vo/manifest.json') return { ok: true, json: async () => ({ voices: manifest }) };
      fetched.add(url);
      return { ok: fs.existsSync(path.join(__dirname, '..', url)) };
    }
  });
  audioCtx.window = audioCtx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), audioCtx, { filename: 'audio.js' });
  const checkDedupe = () => {
    const { ctx, Gm, G } = load();
    // Wire real audio.js voLine (skip-aware) and simulate walk-in always colliding with the first dialogue taunt
    const playedClips = [];
    ctx.PH.audio.vo = (k, ev) => {
      const first = manifest[k].lines[ev][0];
      playedClips.push(first.f);
      return first;
    };
    ctx.PH.audio.voLine = (k, ev, i, skip) => audioCtx.PH.audio.voLine(k, ev, i, skip);
    ctx.PH.audio.voSay = (it) => { playedClips.push(it.f); };

    // Test every rivalry pair (walk-in + 4 dialogue lines = 6 clips, all unique)
    for (const pair of Object.keys(Gm.TALK)) {
      const [a, b] = pair.split('|');
      playedClips.length = 0;
      Gm.newGame({ mode: 'cpu', arch0: a, arch1: b });
      Gm.introStart();
      runIntro(Gm, G);
      assert.equal(new Set(playedClips).size, playedClips.length, `${pair}: no repeated clips (${playedClips.join(', ')})`);
      assert.equal(playedClips.length, 2 + Gm.TALK[pair].length, `${pair}: walk-in + all dialogue lines played`);
    }

    // Test smallest voice pack (jwells has only 2 taunts) vs maxey
    playedClips.length = 0;
    Gm.newGame({ mode: 'cpu', arch0: 'jwells', arch1: 'maxey' });
    Gm.introStart();
    runIntro(Gm, G);
    assert.equal(new Set(playedClips).size, playedClips.length, `jwells vs maxey: no repeated clips (${playedClips.join(', ')})`);
    assert.equal(playedClips.length, 5, 'generic matchup plays 2 walk-in + 3 dialogue unique clips');
    console.log('PASS: walk-in + intro dialogue never repeat a voice clip across all 9 rivalries and small voice packs.');

    const audio = audioCtx.PH.audio;
    ctx.PH.audio.voPreload = audio.voPreload;
    // Keep gameplay/walk-in voice pools unchanged; only the dialogue borrows clips.
    delete ctx.PH.audio.vo;
    for (const [key, donor, ids] of [
      ['barkley', 'shaq', ['shaq_make_1.mp3', 'shaq_dom_1.mp3']],
      ['yao', 'sengun', ['sengun_dom_0.mp3', 'sengun_taunt_1.mp3']],
      ['mutombo', 'gobert', ['gobert_taunt_2.mp3', 'gobert_taunt_0.mp3']]
    ]) {
      const pack = manifest[donor], clips = ids.map(f => Object.values(pack.lines).flat().find(it => it.f === f));
      const sprite = fs.readFileSync(path.join(__dirname, '../vo', pack.s));
      for (const clip of clips) {
        assert.ok(clip?.t && clip.n > 0 && (clip.o + clip.n) * 120 <= sprite.length);
        assert.equal(sprite[clip.o * 120], 0xff, 'clip starts at an MP3 frame');
      }
      for (const side of [0, 1]) {
        playedClips.length = 0;
        const [arch0, arch1] = side === 0 ? [key, 'joe'] : ['joe', key];
        Gm.newGame({ mode: 'cpu', arch0, arch1 });
        Gm.introStart();
        const player = G.players.find(p => p.arch.key === key);
        assert.ok(fetched.has('vo/' + pack.s), 'preload fetches the borrowed sprite');
        assert.equal(G.intro.lines.find(l => l.id === player.id).t, player.arch.intro[side], 'authored subtitle before voice resolution');
        const lines = runIntro(Gm, G).lines.filter(l => l.id === player.id);
        const expected = side === 0 ? clips : [clips[1]];
        assert.deepEqual(lines.map(l => l.t), expected.map(it => it.t), 'subtitles match the borrowed speech');
        assert.deepEqual(playedClips.filter(f => ids.includes(f)), expected.map(it => it.f));
      }
      assert.equal(audio.voLine(key, 'taunt', 0), null);
    }
    assert.equal(audio.voLine('shaq', 'intro', 0, new Set()), null, 'unmapped authored text does not borrow unrelated audio');
    console.log('PASS: Barkley, Yao and Mutombo preload and play their mapped intro clips with matching subtitles.');
  };
  audioCtx.PH.audio.voWhenReady(checkDedupe);
}
