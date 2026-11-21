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

// 1. Pre-game entrance: visuals and early walk-in voice packs stay intact without noisy procedural intro SFX
{
  const { Gm, G, played, voiced } = load();
  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  Gm.introStart();
  const t0 = G.intro.t0;
  let maxConfetti = 0, sawLed = false, sawHighCheer = false, firstVoAt = null, secondVoAt = null;
  for (let i = 0; i < 60 * 9 && G.intro; i++) {
    Gm.introTick(1 / 60);
    if (firstVoAt == null && voiced.length > 0) firstVoAt = G.time - t0;
    if (secondVoAt == null && voiced.length > 1) secondVoAt = G.time - t0;
    maxConfetti = Math.max(maxConfetti, G.fx.confetti.length);
    if (G.fx.led && /NOW ENTERING/.test(G.fx.led.text)) sawLed = true;
    if (G.fx.cheer >= 2.2) sawHighCheer = true;
  }
  assert.equal(played.length, 0, 'entrance does not fire noisy procedural intro SFX (' + played.join(',') + ')');
  assert.ok(sawLed, 'entrance drives LED ticker');
  assert.ok(sawHighCheer, 'entrance keeps crowd visual cheering');
  assert.ok(maxConfetti >= 40, 'entrance spawns abundant confetti (' + maxConfetti + ')');
  assert.ok(firstVoAt != null && firstVoAt <= 0.5, 'first entrance voice fires early as the player starts walking in (' + firstVoAt + 's)');
  assert.ok(secondVoAt != null && secondVoAt <= 3.85, 'second entrance voice fires immediately when second player starts walking in (' + secondVoAt + 's)');
  assert.ok(voiced.some((v) => v.startsWith('lebron:walk:')), 'LeBron plays voice pack during walk-in');
  assert.ok(voiced.some((v) => v.startsWith('curry:walk:')), 'Curry plays voice pack during walk-in');
  Gm.introEnd();
  assert.equal(G.fx.confetti.length, 0, 'introEnd clears leftover entrance confetti');
  console.log('PASS: entrance walk-in fires voices early (' + firstVoAt.toFixed(2) + 's / ' + secondVoAt.toFixed(2) + 's) and keeps visuals without noisy intro SFX.');
}

// 1b. Delayed vo/manifest.json load still plays voiced intro dialogue line once ready
{
  const { ctx, Gm, G, said, setManifestReady } = load();
  setManifestReady(false);
  Gm.newGame({ mode: 'cpu', arch0: 'maxey', arch1: 'joe' });
  Gm.introStart();
  Gm.introPress(); // line 0 (voiced dom, manifest not loaded yet)
  assert.equal(said.length, 0, 'nothing played before manifest resolves');
  assert.ok(G.intro.lines[0].t.includes(Gm.ARCH.joe.name), 'uses template fallback text while waiting for manifest');
  setManifestReady(true);
  assert.equal(said.length, 1, 'voiced intro line plays once manifest resolves');
  assert.match(G.intro.lines[0].t, /^maxey:dom:/, 'subtitle updates to resolved voice line');
  // Long voice line (>4.5s) is never truncated by the line duration cap
  ctx.PH.audio.voLine = (k, ev, i) => ({ f: k + ev + i, t: '长台词测试', d: 4.72 });
  Gm.introPress(); Gm.introPress(); // advance to line 1
  assert.ok(G.intro.ld >= 4.72 + 0.5, 'long voice line keeps full duration without truncation (' + G.intro.ld + 's)');
  console.log('PASS: delayed vo/manifest.json load still triggers voiced intro dialogue line and preserves long voice durations.');
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

for (const mode of ['1v1', '3v3']) {
  for (const [name, tier] of [['长 · 单手扣篮', 2], ['长距离起跳 · 单手扣篮', 2], ['单手扣篮', 1], ['长传', 1], ['', 1], [undefined, 1]]) {
    const { ctx, Gm, G } = load();
    if (mode === '3v3') {
      const slots = ['lebron', 'curry', 'jokic', 'kobe', 'shaq', 'kyrie'].map((arch) => ({ arch, role: 'cpu' }));
      ctx.PH.T3.start({ slots, target: 21, clock: 14, replay: false });
    } else Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
    Object.assign(G, { phase: 'live', needClear: false });
    G.players[0].action = null;
    Gm.t5.scoreBy(0, 2, 'dunk', name);
    assert.equal(G.fx.scoreFx.tier, tier, `${mode}: ${name} keeps the correct dunk effects`);
    assert.ok(G.fx.led.text.includes(name || '暴扣'), 'LED preserves the original move name');
    if (mode === '1v1') assert.equal(G.banner.text, name || '暴扣得分');
  }
  console.log(`PASS: ${mode} long dunk prefixes retain special effects; normal, unknown and empty names retain normal effects and display text.`);
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

  // Online 3V3: audioSink emits ('rebound', team) and host only plays for its own local team
  const netEvents = [];
  Gm.setAudioSink((...ev) => netEvents.push(ev));
  G.players[0].ring = true; // host on team 0
  G.players[3].ctrl = 'net'; G.players[3].ring = false; // remote opponent on team 1
  G.off = 0; G.ball.state = 'loose'; G.ball.wasShot = true;
  played.length = 0; netEvents.length = 0;
  Gm.t5.pickup(G.players[3]); // remote opponent grabs defensive rebound
  assert.ok(!played.includes('rebound'), 'online 3V3 host does not hear positive rebound cue for remote opponent');
  assert.deepEqual(netEvents.filter((e) => e[0] === 'rebound'), [['rebound', 1]], 'online 3V3 emits team-scoped rebound event for clients');

  G.off = 1; G.ball.state = 'loose'; G.ball.wasShot = true;
  played.length = 0; netEvents.length = 0;
  Gm.t5.pickup(G.players[1]); // host's AI teammate grabs defensive rebound
  assert.ok(played.includes('rebound'), 'online 3V3 host hears positive rebound cue for own team');
  assert.deepEqual(netEvents.filter((e) => e[0] === 'rebound'), [['rebound', 0]], 'online 3V3 emits team-0 rebound event for clients');
  Gm.setAudioSink(null);

  console.log('PASS: rebound grabs play positive cue SFX for the player/team without firing for opponents (local and online).');
}

// 5. Voice playback trims long leading silence/room-tone (e.g. mwagner_taunt_2.mp3) while keeping normal 0.1s onset
{
  const sr = 24000;
  const starts = [];
  const makeBuf = (leadSec, totalSec) => {
    const data = new Float32Array(Math.floor(sr * totalSec));
    // Low-level breath/room noise before speech onset (below 0.02 RMS)
    for (let i = 0; i < Math.floor(sr * leadSec); i++) data[i] = Math.sin(i * 0.1) * 0.006;
    // Speech energy starting at leadSec
    for (let i = Math.floor(sr * leadSec); i < data.length; i++) data[i] = Math.sin(i * 0.25) * 0.12;
    return { sampleRate: sr, duration: totalSec, getChannelData: () => data };
  };
  const bufs = {
    'mwagner_taunt_2.mp3': makeBuf(1.65, 4.2),
    'normal_clip.mp3': makeBuf(0.12, 2.0)
  };
  let decodeIdx = 0;
  const decodeOrder = ['mwagner_taunt_2.mp3', 'normal_clip.mp3'];
  const manifest = {
    voices: {
      mwagner: {
        s: 'p/mwagner.mp3',
        lines: {
          taunt: [{ f: 'mwagner_taunt_2.mp3', t: '戏精本精上线，你接着防！', d: 3.75, o: 0, n: 10 }],
          dom: [{ f: 'normal_clip.mp3', t: '正常开头台词', d: 2.0, o: 10, n: 10 }]
        }
      }
    }
  };
  let tested = false;
  const audioCtx = {
    window: null,
    console,
    Math,
    Date,
    Promise,
    ArrayBuffer,
    Uint8Array,
    Float32Array,
    performance: { now: () => 1000 },
    setTimeout: () => 1,
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifest),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4096))
    }),
    AudioContext: function FakeAC() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = sr;
      this.destination = {};
      this.resume = () => Promise.resolve();
      this.createGain = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} });
      this.createBiquadFilter = () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} });
      this.createBuffer = () => ({ getChannelData: () => new Float32Array(16) });
      this.createBufferSource = () => ({ buffer: null, connect() {}, start(when, offset) { starts.push(offset); }, stop() {} });
      this.decodeAudioData = (_ab, ok) => ok(bufs[decodeOrder[decodeIdx++]]);
    },
    PH: {}
  };
  audioCtx.window = audioCtx;
  vm.createContext(audioCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), audioCtx, { filename: 'js/audio.js' });

  audioCtx.PH.audio.voWhenReady(() => {
    try {
      const it1 = audioCtx.PH.audio.voLine('mwagner', 'taunt', 0);
      audioCtx.PH.audio.voSay(it1);
      setImmediate(() => {
        try {
          assert.equal(starts.length, 1, 'delayed-onset clip starts playing');
          assert.ok(starts[0] >= 1.55 && starts[0] <= 1.65, 'trims 1.65s leading silence down to ~1.60s onset (' + starts[0] + 's)');
          const it2 = audioCtx.PH.audio.voLine('mwagner', 'dom', 0);
          audioCtx.PH.audio.voSay(it2);
          setImmediate(() => {
            try {
              assert.equal(starts.length, 2, 'normal clip starts playing');
              assert.equal(starts[1], 0.1, 'normal clip keeps default 0.1s start offset');
              tested = true;
              console.log('PASS: voice playback trims long leading silence (' + starts[0].toFixed(2) + 's) while preserving normal 0.1s onset.');
            } catch (err) {
              console.error(err);
              process.exit(1);
            }
          });
        } catch (err) {
          console.error(err);
          process.exit(1);
        }
      });
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });
  process.on('beforeExit', () => {
    assert.ok(tested, 'async leading-silence trim test must run to completion');
  });
}

// 6. Rebound, block, steal, and queued back-and-forth banter voice lines
{
  const timers = [];
  const ctx = vm.createContext({
    performance: { now: () => 0 },
    setTimeout: (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; }
  });
  ctx.window = ctx;
  vm.runInContext('Math.random = () => 0.1', ctx);
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
  }
  const voiced = [];
  ctx.PH.audio = {
    voLine: () => null,
    voSay() {},
    voStop() {},
    voWhenReady() {},
    play() {},
    vo: (key, ev, mode) => { voiced.push({ key, ev, mode }); return { f: key + '_' + ev + '.mp3', t: ev, d: 2.8 }; }
  };
  ctx.PH.input = { read: () => ctx.PH.game.t5.zeroInp(), endTick() {} };
  const Gm = ctx.PH.game;
  const G = Gm.G;

  Gm.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' });
  G.phase = 'live';

  // Offensive rebound triggers attacker dom ('pri') + defender hurt ('q')
  Gm.seed(11);
  G.off = 0; G.ball.state = 'loose'; G.ball.wasShot = true;
  voiced.length = 0; timers.length = 0;
  Gm.t5.pickup(G.players[0]);
  for (const t of timers) if (!t.cleared) t.fn();
  assert.ok(voiced.some((v) => v.key === 'lebron' && v.ev === 'dom' && v.mode === 'pri'), 'offensive rebound triggers attacker dom voice');
  assert.ok(voiced.some((v) => v.key === 'curry' && v.ev === 'hurt' && v.mode === 'q'), 'offensive rebound queues defender reply');

  // Defensive rebound triggers rebounder stop + actual shooter miss ('q')
  voiced.length = 0; timers.length = 0;
  G.lastShot = { who: G.players[1].id };
  for (let i = 0; i < 10; i++) {
    G.off = 1; G.ball.state = 'loose'; G.ball.wasShot = true;
    Gm.t5.pickup(G.players[0]);
  }
  for (const t of timers) if (!t.cleared) t.fn();
  assert.ok(voiced.some((v) => v.key === 'lebron' && v.ev === 'stop'), 'defensive rebound triggers rebounder stop voice');
  assert.ok(voiced.some((v) => v.key === 'curry' && v.ev === 'miss' && v.mode === 'q'), 'defensive rebound queues shooter reply');

  // 3V3 defensive rebound attributes 'miss' reply to the actual shooter, not OP(rebounder)
  const slots3 = ['lebron', 'curry', 'jokic', 'kobe', 'shaq', 'kyrie'].map((arch, i) => ({ arch, role: i === 0 ? 'p1' : 'cpu' }));
  ctx.PH.T3.start({ slots: slots3, target: 21, clock: 14, replay: false });
  G.phase = 'live';
  G.lastShot = { who: G.players[5].id }; // kyrie shot and missed (OP(lebron) is kobe, not kyrie)
  voiced.length = 0; timers.length = 0;
  for (let i = 0; i < 10; i++) {
    G.off = 1; G.ball.state = 'loose'; G.ball.wasShot = true;
    Gm.t5.pickup(G.players[0]);
  }
  for (const t of timers) if (!t.cleared) t.fn();
  assert.ok(voiced.some((v) => v.key === 'kyrie' && v.ev === 'miss' && v.mode === 'q'), '3V3 defensive rebound attributes miss reply to actual shooter');
  assert.ok(!voiced.some((v) => v.key === 'kobe' && v.ev === 'miss'), '3V3 defensive rebound does not make non-shooting matchup admit missing');

  // Steal and block fire 100% across many RNG draws
  voiced.length = 0;
  for (let i = 0; i < 20; i++) {
    Gm.t5.vo(G.players[0], 'block', 'pri');
    Gm.t5.vo(G.players[0], 'steal', 'pri');
  }
  assert.equal(voiced.filter((v) => v.ev === 'block').length, 20, 'block voice fires 100% of the time');
  assert.equal(voiced.filter((v) => v.ev === 'steal').length, 20, 'steal voice fires 100% of the time');

  // Test audio.js queued reply (mode === 'q') after a 3.2s lead clip & voStop cancellation
  let fakeNow = 1000;
  const aTimers = [];
  const startedClips = [];
  const manifest = {
    voices: {
      lebron: { s: 'p/lebron.mp3', lines: { block: [{ f: 'lb_blk', t: 'Not in my house!', d: 3.2, o: 0, n: 10 }] } },
      curry: { s: 'p/curry.mp3', lines: { rejected: [{ f: 'sc_rej', t: 'Next one is going in.', d: 2.1, o: 10, n: 10 }] } }
    }
  };
  let audioQueueTested = false;
  const audioCtx = {
    window: null,
    console,
    Math,
    Date,
    Promise,
    ArrayBuffer,
    Uint8Array,
    performance: { now: () => fakeNow },
    setTimeout: (fn, ms) => { const id = aTimers.length + 1; aTimers.push({ id, fn, at: fakeNow + ms, cleared: false }); return id; },
    clearTimeout: (id) => { const t = aTimers.find((x) => x.id === id); if (t) t.cleared = true; },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifest),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4096))
    }),
    AudioContext: function FakeAC() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = {};
      this.resume = () => Promise.resolve();
      this.createGain = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} });
      this.createBiquadFilter = () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} });
      this.createBuffer = () => ({ getChannelData: () => new Float32Array(16) });
      this.createBufferSource = () => ({ buffer: null, connect() {}, start() { startedClips.push(this.buffer); }, stop() {} });
      this.decodeAudioData = (ab, ok) => ok({ len: ab.byteLength });
    },
    PH: {}
  };
  audioCtx.window = audioCtx;
  vm.createContext(audioCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), audioCtx, { filename: 'js/audio.js' });

  // Wait for voReady to resolve manifest
  audioCtx.PH.audio.voWhenReady(() => {
    try {
      const first = audioCtx.PH.audio.vo('lebron', 'block', 'pri');
      assert.ok(first && first.f === 'lb_blk', 'lead block clip starts immediately');
      fakeNow += 60;
      const queued = audioCtx.PH.audio.vo('curry', 'rejected', 'q');
      assert.equal(queued, null, 'queued reply waits while lead clip is active');
      assert.equal(aTimers.filter((t) => !t.cleared).length, 1, 'queued reply schedules timer even for >2s lead clip');

      // Let lead clip decode and start before the queued timer fires
      setImmediate(() => {
        try {
          assert.equal(startedClips.length, 1, 'lead block clip starts playing');

          // Advance to timer firing time and execute queued reply
          const pending = aTimers.find((t) => !t.cleared);
          fakeNow = pending.at;
          pending.cleared = true;
          pending.fn();

          // Wait for queued reply decode + start()
          setImmediate(() => {
            try {
              assert.equal(startedClips.length, 2, 'both lead clip and queued opponent reply start playing');

              // Verify voStop cancels any newly queued reply
              audioCtx.PH.audio.vo('lebron', 'block', 'pri');
              fakeNow += 60;
              audioCtx.PH.audio.vo('curry', 'rejected', 'q');
              const q2 = aTimers.filter((t) => !t.cleared);
              assert.equal(q2.length, 1, 'second queued reply scheduled');
              audioCtx.PH.audio.voStop();
              assert.ok(q2[0].cleared, 'voStop cancels pending queued reply');

              audioQueueTested = true;
              console.log('PASS: rebounds, blocks, steals, and >2s queued opponent banter replies fire cleanly and cancel on voStop.');
            } catch (err) {
              console.error(err);
              process.exit(1);
            }
          });
        } catch (err) {
          console.error(err);
          process.exit(1);
        }
      });
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });
  process.on('beforeExit', () => {
    assert.ok(audioQueueTested, 'async audio queued-reply test must run to completion');
  });
}
