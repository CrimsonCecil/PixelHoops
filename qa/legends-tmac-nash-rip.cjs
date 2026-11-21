const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {},
  fetch: () => Promise.reject(new Error('offline')) });
ctx.window = ctx;
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team3', 'team5', 'audio']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx, { filename: name + '.js' });
}
const { game, PT, audio, T3, T5 } = ctx.PH;
for (const [key, type, ovr, inches, pounds, open, reply] of [
  ['tmac', 'creator', 93, 80, 210, '半步就行。剩下的是出手。', '我不后仰，你也得先跟上。'],
  ['nash', 'playmaker', 91, 75, 178, '你盯我，顺下的那位谁管？', '你没跟出来？那这球我自己投。'],
  ['rip', 'sniper', 85, 79, 185, '你跟我跑就好。一会儿还有一圈。', '我在肘区等你，别迟到。']
]) {
  const a = game.ARCH[key];
  assert(game.ROSTER.includes(key));
  assert.equal(a.team, 'LEG');
  assert.equal(a.tier, 'star');
  assert.equal(a.ovr, ovr);
  assert(game.ROSTER.indexOf(key) < game.ROSTER.indexOf('peat'));
  assert.equal(a.skill.id, key);
  assert.equal(PT.of(a).id, type);
  assert.equal(ctx.PH.buildTags[key], 'lean');
  assert.deepEqual(Array.from(ctx.PH.measurements[key]), [inches, pounds]);
  for (const b of a.badges) assert(game.BADGES[b], b);
  assert.equal(audio.voLine(key, 'dom', 0).t, open);
  assert.equal(audio.voLine(key, 'taunt', 0).t, reply);
  assert.equal(audio.voSay(audio.voLine(key, 'dom', 0)), false, 'no audio device is safe');
  for (const mode of ['cpu', 'train']) {
    game.newGame({ mode, arch0: key, arch1: 'kobe' });
    assert.equal(game.G.players[0].arch.key, key);
    assert.equal(!!game.G.players[0].col.mask, key === 'rip');
    if (mode === 'cpu') {
      game.introStart();
      assert(game.G.intro.walk.some(s => s.id === 0 && s.sig));
      assert.equal(game.G.intro.lines[0].v, 'dom');
      game.introPress();
      assert.equal(game.G.intro.lines[0].t, open);
      game.introPress(); game.introPress();
      game.introPress(); game.introPress();
      assert.equal(game.G.intro.lines[2].t, reply);
      game.introEnd();
    }
  }
  assert(!T5.teamList().includes('LEG'));
  for (const team of T5.teamList()) {
    const lineup = T5.lineup(team);
    assert(![...lineup.start, ...lineup.bench].includes(key));
  }
  console.log('PASS:', key, type, ovr, 'measurements, looks, badges, offline subtitles, 1V1 and training');
}
T3.start({ slots: ['tmac', 'nash', 'rip', 'curry', 'kobe', 'shaq'].map(arch => ({ arch, role: 'cpu' })), human: -1 });
assert.deepEqual(Array.from(game.G.players.slice(0, 3), p => p.arch.key), ['tmac', 'nash', 'rip']);
assert(game.ARCH.rip.mid > game.ARCH.rip.three);
assert.equal(audio.voLine('unknown', 'taunt', 0), null);
assert.equal(audio.voLine('tmac', 'missing', 0), null);
assert.equal(audio.voSay(null), false);
console.log('PASS: 3V3 lineup, midrange emphasis and missing voice fallbacks');
require('./legend-skills.cjs');
