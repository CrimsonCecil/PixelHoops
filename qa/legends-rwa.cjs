const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vo/manifest.json')));
for (const key of ['barkley', 'yao', 'mutombo', 'rodman', 'bwallace', 'rallen']) {
  assert(manifest.voices[key], `merged legend voice manifest retains ${key}`);
  assert(fs.existsSync(path.join(root, 'vo', manifest.voices[key].s)), `${key} voice sprite exists`);
}
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) }) });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'audio']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, PT, B5, audio } = ctx.PH;
ctx.PH.input = { read: () => game.t5.zeroInp(), endTick() {} };
const keys = ['rodman', 'bwallace', 'rallen'];
const expected = ['glass', 'rim', 'sniper'];
const originals = {
  rodman: ['你投吧。后半段归我。', '你看篮筐，我看球往哪弹。'],
  bwallace: ['球还没掉下来，位置已经没了。', '要抢板？先从我背后出来。'],
  rallen: ['我到角落的时候，球就该来了。', '你已经扑得够快了。还是差半拍。']
};
for (const [i, key] of keys.entries()) {
  const a = game.ARCH[key];
  assert.equal(a.team, 'LEG');
  assert.equal(PT.of(a).id, expected[i]);
  assert.equal(a.skill.id, key);
  assert(['reb', 'seal', 'relo'].includes(a.skill.type));
  const badges = a.badges.map(k => k + ':' + (B5.KEYS.includes(k) ? B5.tiersOf(a)[k] : game.btier({ arch: a, r: a }, k)));
  console.log(key, PT.of(a).name, badges.join(' '));
  game.newGame({ mode: 'cpu', arch0: key, arch1: 'curry' });
  game.introEnd();
  for (let j = 0; j < 180; j++) game.tick(1 / 60, () => game.t5.zeroInp());
  assert(Number.isFinite(game.G.players[0].sk.n), 'legend skill state remains valid in simulation');
  const v = manifest.voices[key], pack = fs.readFileSync(path.join(root, 'vo', v.s));
  let end = 0;
  for (const ev of ['dunk', 'three', 'make', 'ankle', 'block', 'steal', 'taunt', 'miss', 'dom', 'win', 'hurt', 'intro', 'reply']) {
    const lines = v.lines[ev];
    assert(lines.length >= (['intro', 'reply'].includes(ev) ? 1 : 2) && lines.length <= 4);
    if (ev === 'intro' || ev === 'reply') assert.equal(lines[0].t, originals[key][ev === 'intro' ? 0 : 1]);
    for (const line of lines) {
      assert.equal(line.o, end);
      assert.equal(line.f.startsWith(key + '_' + ev + '_'), true);
      assert(Math.abs(line.d - line.n * 0.024) < 0.002);
      for (let off = line.o * 120; off < (line.o + line.n) * 120; off += 120) {
        assert.equal(pack[off], 255);
        assert.equal(pack[off + 1] & 0xE0, 0xE0);
      }
      end += line.n;
    }
  }
  assert.equal(pack.length, end * 120);
}
assert.equal(game.lookOf(game.ARCH.rodman).tattoos, true);
assert.equal(game.lookOf(game.ARCH.rodman).dyed, true);
assert.equal(game.lookOf(game.ARCH.bwallace).style, 'afro');
assert.equal(game.lookOf(game.ARCH.rallen).style, 'bald');
assert.equal(game.ARCH.rallen.form, 'ray');
assert.equal(game.SF.ray.two, false);
audio.voWhenReady(() => {
  assert(audio.voHas('rodman', 'intro'));
  assert(!audio.voHas('missing', 'intro'));
  assert(!audio.voHas('rodman', 'missing'));
  assert.equal(audio.voLine('missing', 'intro', 0), null);
  const played = [];
  ctx.PH.audio = { ...audio, play() {}, voStop() {}, voSay: it => played.push(it.t) };
  for (const key of keys) {
    for (const reverse of [false, true]) {
      game.newGame({ mode: 'cpu', arch0: reverse ? 'curry' : key, arch1: reverse ? key : 'curry' });
      game.introStart();
      game.introPress();
      const I = game.G.intro;
      if (reverse) { I.lines[0].done = true; game.introPress(); }
      assert.equal(played.at(-1), originals[key][reverse ? 1 : 0]);
      game.introEnd();
    }
  }
  ctx.PH.audio = { play() {}, voStop() {}, voLine: () => null, voHas: () => false };
  game.newGame({ mode: 'cpu', arch0: 'rodman', arch1: 'curry' });
  game.introStart(); game.introPress();
  assert(game.G.intro.lines[0].t.length > 0, 'missing voice retains text fallback');
  game.introEnd();
  let ready = false, onReady;
  ctx.PH.audio = { play() {}, voStop() {}, voHas: (key, ev) => ready && audio.voHas(key, ev),
    voLine: (...args) => ready ? audio.voLine(...args) : null,
    voWhenReady: cb => { onReady = cb; }, voSay: it => played.push(it.t) };
  game.newGame({ mode: 'cpu', arch0: 'rallen', arch1: 'curry' });
  game.introStart(); game.introPress();
  assert(game.G.intro.lines[0].t.length > 0);
  ready = true; onReady();
  assert.equal(played.at(-1), originals.rallen[0], 'late manifest resolves preferred intro event');
  console.log('PASS legend data, derived types, skill states, looks, 72 voice slices and intro/reply with missing/late-voice fallbacks');
});
