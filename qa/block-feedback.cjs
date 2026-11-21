const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const C1 = require('./far-layup-c1.json');
const root = path.resolve(__dirname, '..');
const before = process.argv.indexOf('--before');
const ref = before >= 0 ? process.argv[before + 1] || 'origin/main' : null;
const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
ctx.window = ctx;
vm.runInContext('Date.now = () => 7; let randomSeed = 7; Math.random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 4294967296)', ctx);
const floats = [], sounds = [];
ctx.recordFloat = (text, pl, lvl) => floats.push({ text, pid: pl.id, lvl });
let stop;
ctx.recordStop = (sh, df, hp) => {
  const k = ctx.PH.rig(df);
  stop = {
    distance: Math.min(...[k.handL, k.handR].map(h => Math.hypot(h[0] - hp.x, h[1] - hp.y, h[2] - hp.z))),
    airborne: df.action?.type === 'block' && df.z > 0.18 && !df.stun
  };
  assert(Number.isFinite(stop.distance));
};
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5']) {
  let source = ref && name === 'game'
    ? execFileSync('git', ['show', `${ref}:js/game.js`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
  if (name === 'game') {
    source = source.replace('function float(text, pl, color, lvl) {', 'function float(text, pl, color, lvl) { window.recordFloat(text, pl, lvl);');
    source = source.replace('// 被内线大闸正面挡住：球被打掉，扣篮的人被弹开', 'window.recordStop(pl, df, grip);');
    source = source.replace('PH.game = {', 'PH.feedbackQA = { tryStart }; PH.game = {');
  }
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, TUNE: tune } = ctx.PH, G = gm.G;
for (const [key, value] of Object.entries(C1.data)) tune.set(key, value);
gm.setAudioSink((kind, sound) => { if (kind === 'play') sounds.push(sound); });

function attempt(route, seed, delay, side, threshold) {
  gm.newGame({ mode: '2p', arch0: 'flagg', arch1: 'ad', target: 9999, fouls: false });
  gm.seed(seed * 100003);
  gm.t5.checkStep(9);
  Object.assign(G, { phase: 'live', time: 10, needClear: false, intro: null, tips: null, fb: 'simple' });
  tune.set('l1_bStopDist', threshold);
  const [p, d] = G.players, standing = route === 'standing';
  Object.assign(p, { x: standing ? 0 : -2.4, y: standing ? 11.5 : 10.6, z: 0, vz: 0, vx: standing ? 0 : 5, vy: standing ? 0 : 3,
    speed: standing ? 0 : Math.hypot(5, 3), face: 1, hasBall: true, ctrl: 'p1', stam: 90, wasShot: false });
  Object.assign(d, { x: standing ? 0 : -1.7, y: p.y + (side === 'front' ? 0.8 : -0.7), z: 0, vz: 0, vx: 0, vy: 0, speed: 0,
    face: -Math.PI / 2, stun: 0, action: null, stam: 80, ctrl: 'p2', off: false });
  Object.assign(G.ball, { state: 'held', holder: 0, x: p.x, y: p.y, z: 1.4, dead: false });
  if (route === 'dunk') gm._dbg.startDunk(p, gm._dbg.finPlan(p), 'a2', 'two');
  else {
    const len = Math.hypot(p.x, 12.425 - p.y);
    const input = { ...gm.t5.zeroInp(), mx: -p.x / len, my: (12.425 - p.y) / len, sprint: true, a1: true };
    ctx.PH.feedbackQA.tryStart(p, input, { a1: true });
  }
  floats.length = 0; sounds.length = 0; stop = null;
  for (let frame = 0, jumped = false; frame < 150; frame++) {
    if (!jumped && frame / 60 >= delay) { gm._dbg.startBlock(d, gm.t5.zeroInp()); jumped = true; }
    gm.tick(1 / 60, () => gm.t5.zeroInp());
    if (G.lastShot) return { p, d, info: G.lastShot, stop, seed, delay, side, route };
  }
  throw new Error('finish did not resolve');
}

function feedback(result, fall = false) {
  assert(floats.some(f => f.text === '被阻挡' && f.pid === result.p.id && f.lvl >= 1), 'shooter receives default-visible 被阻挡');
  assert(G.floats.some(f => f.text === '被阻挡' && f.pid === result.p.id), 'shooter float survives simple feedback filtering');
  assert(sounds.includes('bigblock'), 'bigblock slap plays');
  assert(G.fx.rings.length > 0, 'block impact ring appears');
  assert(result.p.blkR, 'graded block recoil starts');
  assert(result.p.stun > 0, 'medium/strong stop stuns the shooter');
  if (fall) assert.equal(result.p.stunK, 'fall', 'strong stop knocks the shooter down');
}

gm.newGame({ mode: '2p', arch0: 'flagg', arch1: 'ad', target: 9999, fouls: false });
gm.t5.checkStep(9);
Object.assign(G, { phase: 'live', time: 10, needClear: false, intro: null, tips: null, fb: 'simple' });
const [shooter, chaser] = G.players;
Object.assign(shooter, { x: 0, y: 10, z: 1, hasBall: false, ctrl: 'p1' });
Object.assign(shooter.r, { str: 0.1, bw: 0.5 });
Object.assign(chaser.r, { str: 1, bw: 1.5, vert: 1 });
Object.assign(chaser, { x: 0, y: 9.7, z: 1, vz: 0, stun: 0, ctrl: 'p2', action: { type: 'block', t: 0.25, zmax: 1, rel: -1, chase: true } });
gm.tick(1 / 60, () => gm.t5.zeroInp());
const hand = ctx.PH.rig(chaser).handR;
const info = { who: shooter.id, made: true };
const shot = { type: 'shot', t: 0.5, V: { blk: 1, name: 'test' } };
Object.assign(G.ball, { state: 'shot', x: hand[0], y: hand[1], z: hand[2], vx: 0, vy: 0, vz: 1,
  shot: { t: 0, T: 1, shooter: shooter.id, kind: 'shot', made: true, attempt: shot, info } });
G.lastShot = info;
floats.length = 0; sounds.length = 0;
gm.tick(1 / 60, () => gm.t5.zeroInp());
assert(info.blocked, 'chase jump blocks a rising shot on hand-ball contact');
assert(chaser.action.chase);
assert.equal(G.stats[chaser.id].blk, 1);
feedback({ p: shooter });
console.log('PASS contact block chase: shooter text, bigblock, ring, recoil; one block credit');

const found = new Set(['chase']);
let closeFixture;
for (const route of ['dunk', 'standing', 'sprint']) {
  for (let seed = 1; seed <= 80; seed++) for (const delay of [0.05, 0.2, 0.35]) for (const side of ['front', 'chase']) {
    const r = attempt(route, seed, delay, side, 0.55);
    if (r.info.blocked && r.p.blkR?.tier >= 2 && !found.has(side)) {
      feedback(r);
      assert.equal(G.stats[r.d.id].blk, 1, 'contact block receives exactly one block credit');
      found.add(side);
      console.log(`PASS contact block ${side}: shooter text, bigblock, ring, recoil; one block credit`);
    }
    if (r.stop && r.stop.airborne && r.stop.distance > 0.255 && r.stop.distance <= 0.55 && r.p.blkR?.tier === 3 && !found.has('close')) {
      feedback(r, true);
      assert.equal(r.info.blocked, false);
      assert.equal(G.stats[r.d.id].blk, 0);
      assert.equal(r.info.made, false);
      closeFixture = { route, seed, delay, side };
      found.add('close');
      console.log(`PASS close defensive dunk stop (${r.stop.distance.toFixed(3)}m): text, bigblock, ring, fall; no block credit`);
    }
    if (r.stop && r.stop.airborne && r.stop.distance >= 0.74 && !found.has('far')) {
      assert(!floats.some(f => f.text === '被阻挡'));
      assert(!sounds.includes('bigblock'));
      assert(sounds.includes('rim'));
      assert(!r.p.blkR);
      assert.equal(r.info.blocked, false);
      assert.equal(G.stats[r.d.id].blk, 0);
      found.add('far');
      console.log(`PASS far interference miss (${r.stop.distance.toFixed(3)}m): rim sound, no block feedback or credit`);
    }
  }
}
assert.deepEqual([...found].sort(), ['chase', 'close', 'far', 'front']);
const r = attempt(closeFixture.route, closeFixture.seed, closeFixture.delay, closeFixture.side, 0.25);
assert(r.stop && r.stop.distance > 0.25);
assert(!sounds.includes('bigblock'), 'tuned smaller distance disables near-stop presentation');
assert(!floats.some(f => f.text === '被阻挡'));
assert.equal(G.stats[r.d.id].blk, 0);
console.log('PASS tuned distance: close-stop presentation obeys l1_bStopDist');
