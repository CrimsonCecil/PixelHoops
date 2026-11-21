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
