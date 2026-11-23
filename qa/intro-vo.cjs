const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vo/manifest.json')));
const dispatch = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8').split('\n').find(s => s.includes("screen === 'play' && G.intro && !paused"));
const read = name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');

async function scenario(name, options = {}) {
  let now = 0, clock = 0, serial = 0, ac, tasks = [], round = 0, advanced = false, hidden = false;
  const log = [], sources = [], fetches = {}, decodes = {};
  const emit = (event, f) => log.push({ t: +(now / 1000).toFixed(3), event, f });
  const later = (fn, ms) => { const id = ++serial; tasks.push({ id, at: now + ms, fn }); return id; };
  const gain = () => ({ connect() {}, gain: {} });
  class AudioContext {
    constructor() { ac = this; this.state = options.unlockAt ? 'suspended' : 'running'; this.sampleRate = 24000; }
    get currentTime() { return clock; }
    resume() {
      if (now >= (options.unlockAt || 0)) this.state = 'running';
      return options.resumeReject && this.state !== 'running' ? Promise.reject(new Error('gesture required')) : Promise.resolve();
    }
    createGain() { return gain(); }
    createBuffer() { return { getChannelData: () => new Float32Array(24000) }; }
    createBufferSource() {
      const src = { connect() {}, start: (_when, offset) => {
        assert.equal(ac.state, 'running', 'source must not start before resume');
        src.end = clock + src.buffer.duration - offset; sources.push(src); emit('start', src.buffer.f);
      }, stop: () => {
        if (src.end > clock && !src.stopped) { emit('cut', src.buffer.f); src.stopped = true; src.onended?.(); }
      } };
      return src;
    }
    decodeAudioData(it, ok, no) {
      decodes[it.f] = (decodes[it.f] || 0) + 1;
      later(() => {
        if (options.failDecode && decodes[it.f] <= options.failDecode) { no(new Error('decode')); return; }
        ok({ f: it.f, duration: it.n * 0.024 });
      }, options.decodeDelay || 0);
    }
  }
  const ctx = vm.createContext({ AudioContext, performance: { now: () => now }, setTimeout: later,
    clearTimeout: id => { tasks = tasks.filter(t => t.id !== id); }, addEventListener() {},
    navigator: { getGamepads: () => [{ index: 0, connected: true, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [options.held ? 0.8 : 0, 0, 0, 0] }] },
    fetch: url => new Promise(resolve => {
      const isManifest = url.includes('manifest');
      fetches[url] = (fetches[url] || 0) + 1;
      if (options.hangManifest && isManifest || options.hangSprite && !isManifest) return;
      later(() => {
        if (fetches[url] <= (isManifest ? options.failManifest || 0 : options.failSprite || 0)) { resolve({ ok: false }); return; }
        if (isManifest) { resolve({ ok: true, json: async () => manifest }); return; }
        const pack = Object.values(manifest.voices).find(p => 'vo/' + p.s === url);
        resolve({ ok: true, arrayBuffer: async () => ({ slice: (a, b) => {
          const it = Object.values(pack.lines).flat().find(it => it.o * 120 === a && (it.o + it.n) * 120 === b);
          assert.ok(it, 'valid sprite slice'); return it;
        } }) });
      }, isManifest ? options.manifestDelay || 0 : options.spriteDelay || 0);
    })
  });
  ctx.window = ctx;
  vm.runInContext('let seed=7; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)', ctx);
  for (const file of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3', 'input', 'audio']) vm.runInContext(read(file), ctx, { filename: file + '.js' });
  const A = ctx.PH.audio, GM = ctx.PH.game, G = GM.G;
  if (options.muted) A.setMix('vo', 0);
  A.play = () => {}; A.scene = () => {};
  Object.assign(ctx, { screen: 'play', G, GM, paused: false });
  const input = new vm.Script('(function(){const I=PH.input,button=I.pollPads();' + dispatch + '})()');
  const press = GM.introPress;
  GM.introPress = () => { emit('advance'); press(); };
  for (const method of ['vo', 'voSay']) {
    const original = A[method];
    A[method] = (...args) => {
      const it = original(...args);
      if (method === 'voSay' ? it : it?.f) emit('request', method === 'voSay' ? args[0].f : it.f);
      return it;
    };
  }
  const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
  async function step() {
    now += 1000 / 60;
    if (options.hiddenAt && !hidden && now >= options.hiddenAt) { hidden = true; now += 30000; }
    if (ac?.state === 'running') clock += 1 / 60;
    if (options.unlockAt && now >= options.unlockAt) ac.state = 'running';
    for (const src of sources) if (!src.stopped && src.end <= clock) { src.stopped = true; emit('end', src.buffer.f); if (!options.noEnded) src.onended?.(); }
    const due = tasks.filter(t => t.at <= now); tasks = tasks.filter(t => t.at > now);
    due.forEach(t => t.fn()); await settle();
    if (options.dialogueAt && !advanced && G.intro && now >= options.dialogueAt) { advanced = true; GM.introPress(); }
    if (options.dialogueAt && now > 6000 && now < 8000) {
      assert.equal(G.intro?.li, 0, 'loading dialogue is not skipped by the former 4s escape');
      assert.equal(G.intro.usedVo.size, 0, 'pending lines are not counted as voiced');
    }
    input.runInContext(ctx);
    if (G.intro) GM.introTick(1 / 60);
    await settle();
  }
  for (let i = 0; i < (options.exhausted || 0); i++) {
    let done = false, result;
    A.voPreload(options.keys || ['lebron', 'curry'], true).then(value => { result = value; done = true; });
    const limit = now + 10000;
    while (!done && now < limit) await step();
    assert.ok(done, 'failed preload has bounded retries');
    assert.equal(result, false, 'exhausted preload reports failure');
  }
  let expected = 0;
  for (round = 0; round < (options.repeat ? 2 : 1); round++) {
    A.ensure();
    const keys = options.keys || ['lebron', 'curry'];
    GM.newGame({ mode: 'cpu', arch0: keys[0], arch1: keys[1] });
    A.voPreload(keys); GM.introStart(); ctx.PH.input.flush();
    assert.equal(A.voSay({ f: 'tmac_dom_text' }), false, 'text is not voiced success');
    assert.equal(A.voSay(null), false, 'empty voice is safe');
    expected += (options.dialogueAt ? 0 : 2) + G.intro.lines.length;
    const limit = now + 90000;
    while (G.intro && now < limit) await step();
    assert.equal(G.intro, null, name + ': intro finishes');
  }
  const requests = log.filter(r => r.event === 'request').length;
  const starts = log.filter(r => r.event === 'start').length;
  const cuts = log.filter(r => r.event === 'cut').length;
  if (!options.fallback) {
    assert.equal(starts, expected, name + ': every entrance/dialogue line starts');
    assert.equal(requests, starts, name + ': no requested line lost');
    assert.equal(cuts, 0, name + ': no unintended interruption');
  }
  assert.equal(log.filter(r => r.event === 'advance').length, options.dialogueAt ? 1 : 0, 'only explicit fresh input advances');
  if (options.failSprite && !options.fallback) assert.ok(Object.entries(fetches).filter(([url]) => !url.includes('manifest')).every(([, n]) => n > options.failSprite));
  if (options.failManifest && !options.fallback) assert.ok(fetches['vo/manifest.json'] > options.failManifest);
  if (options.failDecode) assert.ok(log.filter(r => r.event === 'start').every(r => decodes[r.f] > options.failDecode));
  if (options.noEnded) assert.ok(now < 80000, 'missing completion signals have bounded waits');
  if (options.fallback) {
    assert.ok(now < 80000, name + ': bounded finish without input');
    if (!options.hiddenAt) assert.equal(starts, 0, 'unavailable audio never reports success');
    const count = starts;
    ac.state = 'running';
    for (let i = 0; i < 60; i++) await step();
    assert.equal(log.filter(r => r.event === 'start').length, count, 'expired speech cannot start after the intro');
    console.log(`PASS ${name}: bounded fallback finished within 80s without input; no late playback`);
  } else console.log(`PASS ${name}: ${requests} requests, ${starts} starts, ${cuts} cuts, 0 missing`);
  return log;
}

function inputEdges() {
  let now = 0;
  const listeners = {}, pad = { index: 0, connected: true, axes: [0.8, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const c = vm.createContext({ performance: { now: () => now }, navigator: { getGamepads: () => [pad] }, addEventListener: (name, fn) => { listeners[name] = fn; } });
  c.window = c; vm.runInContext(read('input'), c);
  const I = c.PH.input;
  listeners.keydown({ code: 'KeyW', repeat: false });
  pad.buttons[0].pressed = true; I.flush(); I.pollPads();
  assert.equal(I.introPressed(), false, 'launch key/button/stick blocked');
  for (let i = 0; i < 20; i++) { now += 100; I.pollPads(); assert.equal(I.introPressed(), false); I.clearSys(); }
  listeners.keyup({ code: 'KeyW' }); pad.axes[0] = 0; pad.buttons[0].pressed = false; I.pollPads(); I.clearSys();
  listeners.keydown({ code: 'KeyW', repeat: false }); assert.equal(I.introPressed(), true, 'fresh key advances'); I.clearSys();
  listeners.keydown({ code: 'KeyW', repeat: true }); assert.equal(I.introPressed(), false, 'key repeat ignored');
  pad.axes[0] = 0.8; I.pollPads(); assert.equal(I.introPressed(), true, 'fresh stick edge advances'); I.clearSys();
  now += 500; I.pollPads(); assert.equal(I.sysAny(), true, 'menu navigation still repeats'); assert.equal(I.introPressed(), false); I.clearSys();
  pad.buttons[7].pressed = true; I.pollPads(); assert.equal(I.introPressed(), true, 'any fresh button advances');
  I.clearSys(); pad.buttons[9].pressed = true; I.pollPads();
  listeners.keydown({ code: 'Escape', repeat: false });
  const slot = I.pressSlot();
  I.flush();
  assert.equal(I.pressSlot(), slot, 'flush does not repoll or change pressSlot');
  assert.equal(I.sysPressed('Escape'), true, 'flush preserves a queued pause key');
  assert.equal(I.sysPressed('PadStart'), true, 'flush preserves a queued menu button');
  assert.equal(I.introPressed('PadStart'), false, 'held launch Start does not skip intro');
  I.pollPads(); I.clearSys();
  pad.buttons[9].pressed = false; I.pollPads(); I.clearSys();
  pad.buttons[9].pressed = true; I.pollPads(); assert.equal(I.introPressed('PadStart'), true, 'fresh Start still skips'); I.clearSys();
  pad.buttons[8].pressed = true; I.flush();
  assert.equal(I.pollPads(), true, 'flush does not consume an unpolled menu button edge');
  assert.equal(I.introPressed(), false, 'unpolled launch hold remains blocked for intro');
  console.log('PASS intro input: launch holds and navigation repeats ignored; fresh key/stick/button edges retained');
  console.log('PASS flush: queued pause/menu events, unpolled edges and pressSlot preserved');
}

function pointerAdvance() {
  const handlers = {};
  let stopped = 0, online = false, votes = 0;
  const c = vm.createContext({ performance: { now: () => 0 }, setTimeout() {},
    $: id => ({ addEventListener: (name, fn) => { handlers[id + ':' + name] = fn; } }),
    skipScene: () => online, skipPress: () => { votes++; }
  });
  c.window = c;
  for (const file of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'team3']) vm.runInContext(read(file), c);
  c.PH.audio = { play() {}, voLine: () => null, voStop() {} };
  c.GM = c.PH.game;
  const main = read('main').split('\n');
  for (const id of ['talk', 'intro-skip']) vm.runInContext(main.find(s => s.includes("$('" + id + "').addEventListener('pointerdown'")), c);
  const event = pointerType => ({ pointerType, stopPropagation() { stopped++; } });
  c.GM.newGame({ mode: 'cpu', arch0: 'lebron', arch1: 'curry' }); c.GM.introStart(); c.GM.introPress();
  const I = c.GM.G.intro;
  handlers['talk:pointerdown'](event('touch'));
  assert.equal(I.li, 0); assert.equal(I.lines[0].done, true, 'tap completes typing');
  handlers['talk:pointerdown'](event('touch')); assert.equal(I.li, 1, 'fresh mobile tap advances');
  I.lines[1].done = true;
  handlers['talk:pointerdown'](event('mouse')); assert.equal(I.li, 2, 'mouse click advances');
  online = true; handlers['talk:pointerdown'](event('touch'));
  assert.equal(votes, 1); assert.equal(I.li, 2, 'online tap retains skip voting');
  handlers['intro-skip:pointerdown'](event('mouse')); assert.equal(c.GM.G.intro, null, 'pointer skip still exits');
  assert.equal(stopped, 5, 'pointer events do not bubble into other controls');
  console.log('PASS intro pointer input: touch tap and mouse click advance; typing, online voting and explicit skip preserved');
}

(async () => {
  inputEdges();
  pointerAdvance();
  await scenario('normal-back-to-back', { repeat: true });
  await scenario('held-pad-right', { held: true });
  await scenario('held-pad-right-sprite-2s', { held: true, spriteDelay: 2000 });
  await scenario('sprite-18s', { spriteDelay: 18000 });
  await scenario('manifest-9s', { manifestDelay: 9000, keys: ['tmac', 'nash'] });
  await scenario('manifest-18s', { manifestDelay: 18000 });
  await scenario('dialogue-sprite-loading-18s', { spriteDelay: 18000, dialogueAt: 1000 });
  await scenario('dialogue-placeholder-manifest-9s', { manifestDelay: 9000, dialogueAt: 1000, keys: ['tmac', 'nash'] });
  await scenario('HTTP-failure-retry', { failSprite: 1, failManifest: 1, repeat: true });
  await scenario('exhausted-cache-recovery', { failSprite: 3, failManifest: 3, exhausted: 2, repeat: true });
  await scenario('decode-failure-retry', { failDecode: 3 });
  await scenario('gordon-risacher-long-walk', { keys: ['gordon', 'risacher'], repeat: true });
  await scenario('suspended-until-18s', { unlockAt: 18000 });
  await scenario('resume-rejected-until-gesture', { unlockAt: 18000, resumeReject: true });
  await scenario('suspended-forever-no-gesture', { unlockAt: Infinity, fallback: true });
  await scenario('ended-never-resolves', { noEnded: true });
  await scenario('manifest-never-resolves', { hangManifest: true, fallback: true });
  await scenario('sprite-never-resolves', { hangSprite: true, fallback: true });
  await scenario('all-retries-exhausted', { failSprite: Infinity, failManifest: Infinity, fallback: true });
  await scenario('muted-voice-volume', { muted: true });
  await scenario('hidden-tab-resume', { hiddenAt: 1000, fallback: true });
})().catch(e => { console.error(e); process.exitCode = 1; });
