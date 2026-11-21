const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5', 'team3']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, PT, T3 } = ctx.PH;
const voices = JSON.parse(fs.readFileSync(path.join(__dirname, '../vo/manifest.json'), 'utf8')).voices;
const lines = {
  ginobili: ['盯着我的第一步。对，就那一步。', '你是跟上了，可惜跟的是上一步。'],
  iverson: ['你看球？那我先走了。', '别急，第一下是拿来问你的。'],
  carter: ['别抬头太早。我还没起跳。', '刚才那圈？给看台看的。']
};
ctx.PH.input = { read: () => game.t5.zeroInp(), endTick() {} };
for (const [key, texts] of Object.entries(lines)) {
  const arch = game.ARCH[key], look = game.lookOf(arch), p = game.t5.makePlayer(0, key, 'p1');
  assert.equal(arch.team, 'LEG');
  assert.equal(PT.of(arch).id, 'slasher');
  assert.equal(ctx.PH.measurements[key].length, 2, 'unknown wingspan uses fallback');
  assert.equal(look.body.arm, look.wing);
  for (const [i, event] of ['intro', 'reply'].entries()) {
    const clip = voices[key].lines[event][0];
    assert.equal(clip.t, texts[i]);
    const sprite = fs.readFileSync(path.join(__dirname, '../vo', voices[key].s));
    assert.equal(sprite.length % 120, 0);
    assert(clip.n > 0 && (clip.o + clip.n) * 120 <= sprite.length);
  }
  console.log(key + ': ' + JSON.stringify({ ovr: arch.ovr, ptype: PT.of(arch).name, badges: Object.fromEntries(p.r.badges.map((b) => [b, game.btier(p, b)])), lefty: !!arch.lefty, look }));
  for (const mode of ['cpu', 't3']) for (const side of [0, 1]) for (const audio of ['ready', 'missing', 'unavailable']) {
    ctx.PH.audio = audio === 'missing' ? null : {
      voLine: (k, ev, i) => audio === 'unavailable' ? null : voices[k]?.lines[ev]?.[i % voices[k].lines[ev].length],
      voSay() {}, voStop() {}, play() {}
    };
    if (mode === 't3') {
      const slots = ['curry', 'joe', 'maxey', 'kyrie', 'white', 'herb'].map((arch) => ({ arch, role: 'cpu' }));
      slots[side ? 5 : 2].arch = key;
      T3.start({ slots, target: 21, clock: 14, replay: false });
    } else game.newGame({ mode, arch0: side ? 'kobe' : key, arch1: side ? key : 'kobe' });
    game.introStart();
    const featured = game.G.intro.duo.map((id) => game.G.players.find((p) => p.id === id).arch.key);
    assert(featured.includes(key), key + ' featured even alongside an existing rivalry');
    game.introPress();
    if (side) { game.introPress(); game.introPress(); }
    assert.equal(game.G.intro.lines[game.G.intro.li].t, texts[side], `${mode}/${side}/${audio}`);
    game.introEnd();
  }
}
assert.equal(game.ARCH.ginobili.lefty, true);
assert.equal(game.lookOf(game.ARCH.iverson).sleeve, 'R');
assert.equal(game.lookOf(game.ARCH.carter).style, 'bald');
console.log('PASS legends: computed slasher types, measured looks, sprite bounds and exact 1V1/3V3 opening/reply subtitles with ready/missing/unavailable audio');

for (const key of Object.keys(lines)) for (const frontcourt of ['barkley', 'yao', 'mutombo']) for (const side of [0, 1]) {
  ctx.PH.audio = null;
  game.newGame({ mode: 'cpu', arch0: side ? frontcourt : key, arch1: side ? key : frontcourt });
  game.introStart();
  assert.equal(game.G.intro.lines.length, 2);
  for (const line of game.G.intro.lines) {
    const player = game.G.players.find((p) => p.id === line.id);
    const index = player.arch.key === key ? side : 1 - side;
    const expected = player.arch.key === key ? lines[key][index] : player.arch.intro[index];
    assert.equal(line.t || line.fb, expected, 'cross-PR legend matchup preserves both authored lines');
    assert.equal(line.v, player.arch.key === key && side ? 'reply' : 'intro');
    assert.equal(line.i, player.arch.key === key ? 0 : index);
  }
  game.introEnd();
}
console.log('PASS merged legends: all 18 mixed guard/wing vs frontcourt intro matchups preserve both authored voices/subtitles');

async function checkEventAudio() {
  const started = [], fetched = [];
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
    createBufferSource() { return { connect() {}, stop() {}, start() { started.push(this.buffer.bytes); } }; }
    decodeAudioData(bytes, ok) { ok({ bytes, duration: bytes.byteLength / 120 * 0.024 }); }
  }
  const audioCtx = vm.createContext({
    window: null, PH: {}, performance: { now: () => 0 }, setTimeout, clearTimeout, AudioContext,
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ voices }), arrayBuffer: async () => {
        const bytes = fs.readFileSync(path.join(__dirname, '..', url));
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } };
    }
  });
  audioCtx.window = audioCtx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), audioCtx, { filename: 'audio.js' });
  const audio = audioCtx.PH.audio, flush = () => new Promise(setImmediate);
  await new Promise((resolve) => audio.voWhenReady(resolve));
  const packs = {
    ginobili: ['white', { dunk: 1, three: 2, make: 1, ankle: 0, block: 2, steal: 1, taunt: 1, dom: 2, win: 1, miss: 1, hurt: 0, poster: 0, fall: 2, pin: 0, clutch: 0, hot: 0, stop: 2, rejected: 1, dropped: 2, posterized: 2, stolen: 0 }],
    iverson: ['kyrie', { dunk: 0, three: 1, make: 2, ankle: 1, block: 1, steal: 0, taunt: 2, dom: 1, win: 0, miss: 1, hurt: 0, poster: 0, fall: 1, pin: 0, clutch: 2, hot: 0, stop: 0, rejected: 1, dropped: 1, posterized: 1, stolen: 0 }],
    carter: ['lavine', { dunk: 1, three: 0, make: 1, ankle: 2, block: 1, steal: 0, taunt: 1, dom: 1, win: 1, miss: 1, hurt: 0, poster: 0, fall: 0, pin: 0, clutch: 0, hot: 1, stop: 1, rejected: 0, dropped: 0, posterized: 0, stolen: 0 }]
  };
  audio.voPreload(Object.keys(packs)); await flush();
  for (const key of [...Object.keys(packs), ...Object.values(packs).map(([key]) => key)]) {
    assert(fetched.includes('vo/' + voices[key].s), `${key} sprite preloaded`);
  }
  const checkStarted = (key, clip, before) => {
    assert.equal(started.length, before + 1, `${clip.f} starts through real audio.js`);
    const sprite = fs.readFileSync(path.join(__dirname, '../vo', voices[key].s));
    assert(clip.n > 0 && (clip.o + clip.n) * 120 <= sprite.length);
    assert.deepEqual(Buffer.from(started.at(-1)), sprite.subarray(clip.o * 120, (clip.o + clip.n) * 120), 'correct source sprite and frame slice');
  };
  for (const [key, [pack, events]] of Object.entries(packs)) {
    assert.deepEqual(Object.keys(events).sort(), Object.keys(voices[pack].lines).sort(), 'all gameplay events covered');
    for (const [event, i] of Object.entries(events)) {
      const expected = voices[pack].lines[event][i], before = started.length;
      assert(!/绿军|抢七|德鲁|2016|骑士|蝴蝶穿花|萨城|芝加哥|双冠|两届|戈登|国王|萨克拉门托|罚球线/.test(expected.t), 'no donor identity/catchphrase leaks');
      assert.strictEqual(audio.voLine(key, event, 0), expected);
      assert.strictEqual(audio.vo(key, event, 'pri'), expected);
      await flush(); checkStarted(pack, expected, before);
    }
    for (const event of ['intro', 'reply']) {
      const clip = audio.voLine(key, event, 0), before = started.length;
      assert.strictEqual(clip, voices[key].lines[event][0], 'own intro/reply takes precedence');
      const duration = await new Promise((resolve) => assert(audio.voSay(clip, resolve)));
      assert(duration > 0); checkStarted(key, clip, before);
    }
    voices[key].lines.dunk = [];
    assert.strictEqual(audio.vo(key, 'dunk', 'pri'), voices[pack].lines.dunk[events.dunk], 'empty own event uses alias');
    delete voices[key].lines.dunk;
    voices[key].lines.dunk = voices[key].lines.intro;
    assert.strictEqual(audio.vo(key, 'dunk', 'pri'), voices[key].lines.intro[0], 'future own event overrides alias');
    delete voices[key].lines.dunk;
    await flush();
    console.log(`PASS legend audio ${key} -> ${pack}: all ${Object.keys(events).length} event clips start from donor sprite; own intro/reply sprites still start`);
  }
  const poster = voices.white.lines.poster;
  delete voices.white.lines.poster;
  assert.strictEqual(audio.vo('ginobili', 'poster', 'pri'), voices.white.lines.dunk[1], 'existing event fallback works with alias');
  voices.white.lines.poster = poster;
  assert.equal(audio.vo('ginobili', 'unknown', 'pri'), null);
  assert.equal(audio.vo('unknown', 'dunk', 'pri'), null);
  assert.equal(audio.voLine('unknown', 'intro', 0), null);
  for (const [key, pack] of Object.entries(voices)) if (!packs[key]) {
    for (const [event, clips] of Object.entries(pack.lines)) {
      for (let i = 0; i < clips.length; i++) assert.strictEqual(audio.voLine(key, event, i), clips[i], 'other player lines unchanged');
    }
    assert.equal(audio.vo(key, 'intro', 'pri'), null, 'other players do not acquire aliases');
  }
  console.log('PASS legend audio: only three legends aliased; unknown/empty events, future own recordings, existing event fallback and all original player lines preserved');
}
checkEventAudio().catch((error) => { console.error(error); process.exitCode = 1; });
