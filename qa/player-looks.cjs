const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 } });
ctx.window = ctx;
const noop = () => {};
const canvas = () => {
  const c = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 8 }) }, {
    get: (obj, key) => obj[key] ?? noop,
  });
  return { getContext: () => c };
};
ctx.document = { createElement: canvas };
for (const name of ['tune', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5']) {
  const file = path.resolve(__dirname, '../js', name + '.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

const { game, render, rig, measurements, T5 } = ctx.PH;
render.init(canvas());
assert.deepEqual(Object.keys(measurements).sort(), Array.from(game.ROSTER).sort());
for (const key of game.ROSTER) {
  const p = game.t5.makePlayer(0, key, 'cpu');
  const m = measurements[key], body = p.col.body;
  assert.equal(body.height, m[0] * 0.0254);
  assert(body.height > 1.7 && body.height < 2.35 && m[1] > 150 && m[1] <= 325, key);
  if (!m[2]) assert.equal(body.arm, p.col.wing, key);
  for (const value of Object.values(body)) assert(Number.isFinite(value), key);
  const live = rig(p);
  const painted = render.drawPlayer(p);
  assert(Object.values(painted.k).flat().every(Number.isFinite), key);
  const legacy = { ...p, col: { ...p.col, body: undefined } };
  assert.deepEqual(live, rig(legacy), key);
  const held = render.drawPlayer({ ...p, hasBall: true });
  assert.deepEqual(Array.from(held.k.handL), Array.from(live.handL), key);
  assert.deepEqual(Array.from(held.k.handR), Array.from(live.handR), key);
}
const look = (key) => game.lookOf(game.ARCH[key]);
const curry = look('curry'), lebron = look('lebron');
assert(curry.mouthguard && lebron.band && lebron.beard === 'boxed');
assert(lebron.body.shoulder > curry.body.shoulder && lebron.body.limb > curry.body.limb);
assert(look('wemby').body.legs > look('zion').body.legs);
assert(look('wemby').body.arm > curry.body.arm);
assert(look('zion').body.chest > look('wemby').body.chest);
assert(look('kawhi').body.hand > curry.body.hand);
assert(look('harden').beard === 'long' && look('kawhi').style === 'braids');
assert.equal(curry.style, 'curlfade');
assert.equal(curry.face, 'youthful');
assert.equal(curry.beard, '');
assert.equal(curry.eyes, 'open');
assert.equal(look('kyrie').style, 'curlfade');
assert.equal(look('kyrie').beard, 'trimmed');
assert.equal(look('wemby').style, 'bald');
assert.equal(look('cade').style, 'curlfade');
assert.equal(look('cade').skin[1], '#a67453');
const calibrated = ['cade', 'giannis', 'kawhi', 'tatum', 'ad', 'brunson', 'booker'];
assert.equal(new Set(calibrated.map(key => look(key).skin[1])).size, calibrated.length);
for (const key of calibrated) {
  assert.notEqual(look(key).skin[1], game.ARCH[key].skin, key);
}
const expectedTones = {
  wemby: '#4e3324', embiid: '#4e3324', giannis: '#6a4430', edwards: '#5e3c2a',
  curry: '#be8b66', kawhi: '#88543f', tatum: '#a16e50', ad: '#9c6749', brunson: '#a97759', booker: '#d29a76'
};
for (const [key, tone] of Object.entries(expectedTones)) {
  assert.equal(look(key).skin[1], tone, key);
}
for (const key of ['shaq', 'jokic']) {
  const { bw, body } = look(key);
  const legacyWidth = 1 + 1.5 * (bw - 1);
  assert(0.29 * body.waist >= 0.31 * (0.2 + 0.8 * legacyWidth) * 1.06, key);
  assert(body.limb >= (0.5 + 0.5 * legacyWidth) * 1.12, key);
}
for (const key of ['curry', 'wemby', 'sga']) {
  assert(look(key).body.limb < 0.9, key);
}
const relativeLimb = key => {
  const { height, limb } = look(key).body;
  return limb / (1 + (height / 1.95 - 1) * 1.55);
};
assert(relativeLimb('kyrie') < relativeLimb('fvv'));
assert(relativeLimb('durant') < relativeLimb('tatum'));
for (const key of ['cade', 'giannis', 'embiid', 'lebron']) {
  assert(look(key).body.shoulder > 1.1 && look(key).body.limb > 1.1, key);
}
for (const key of ['lebron', 'giannis', 'zion', 'embiid', 'edwards']) {
  const { chest, waist, limb, armThickness } = look(key).body;
  assert(chest > waist * 1.07 && armThickness > limb * 1.1, key);
}
assert(lebron.body.chest > lebron.body.waist * 1.3);
assert(lebron.body.armThickness > lebron.body.limb * 1.3);
assert(look('clingan').body.chest > look('kobe').body.chest * 1.3);
for (const key of ['curry', 'cade', 'shaq', 'jokic', 'morant', 'butler', 'kawhi']) {
  const { limb, armThickness } = look(key).body;
  assert.equal(armThickness, limb, key);
}
console.log('PASS every rostered player renders; 302 measured-height profiles, signature looks, original gameplay rig and held-ball wrist anchors');

const bmi = key => {
  const [inches, pounds] = measurements[key];
  return pounds * 0.45359237 / (inches * 0.0254) ** 2;
};
const averageBmi = game.ROSTER.reduce((total, key) => total + bmi(key), 0) / game.ROSTER.length;
for (const key of game.ROSTER) {
  if (bmi(key) < averageBmi) continue;
  const { height, shoulder, chest, waist } = look(key).body;
  const scale = 1 + (height / 1.95 - 1) * 1.55;
  assert(shoulder >= 1.045 && chest / scale >= 1.035 && waist / scale >= 1.035 && relativeLimb(key) >= 1.01, key);
}
assert(relativeLimb('queta') > relativeLimb('tatum') * 1.1);
assert(relativeLimb('queta') > relativeLimb('wemby') * 1.5);
const queta = game.t5.makePlayer(0, 'queta', 'cpu');
const { height, arm, legs } = queta.col.body, scale = 1 + (height / 1.95 - 1) * 1.55;
const { k: visual } = render.drawPlayer(queta);
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
assert(dist(visual.shL, visual.elL) < 0.96 * 0.28 * scale * arm);
assert(dist(visual.hipL, visual.kneeL) < 0.97 * 0.41 * scale * legs);
console.log('PASS above-average BMI profiles have solid height-relative widths; Queta has shorter visual limbs and a fuller frame');

const gameCanvas = canvas();
let spriteContext;
gameCanvas.getContext().drawImage = (image) => { spriteContext = image.getContext('2d'); };
render.init(gameCanvas);
render.drawPlayer(game.t5.makePlayer(0, 'zion', 'cpu'));
assert(spriteContext);
for (const key of game.ROSTER) {
  const p = game.t5.makePlayer(0, key, 'cpu');
  const jerseyRows = [], headRows = [];
  spriteContext.fillRect = (_x, y) => { if (p.col.jersey.includes(spriteContext.fillStyle)) jerseyRows.push(y); };
  spriteContext.rect = (_x, y) => headRows.push(y);
  for (const [face, tilt, lean] of [[-Math.PI / 2, 0, 0], [-Math.PI / 4, 0.48, 0.38]]) {
    Object.assign(p, { face });
    Object.assign(p.pose, { tilt, lean });
    jerseyRows.length = headRows.length = 0;
    render.drawPlayer(p);
    assert(headRows.length && jerseyRows.length, key);
    const jaw = Math.min(...headRows) + Math.floor(headRows.length * 0.75);
    assert(Math.min(...jerseyRows) >= jaw, `${key}: shoulders overlap the upper face`);
  }
}
spriteContext.fillRect = spriteContext.rect = noop;
console.log('PASS shoulders stay below the upper face for all 302 players in front and tilted poses');

game.newGame({ mode: 'train', arch0: 'luka', arch1: 'curry' });
for (const p of game.G.players) {
  const base = p.h, listed = p.col.body.height;
  assert.notEqual(base, listed);
  const heightScale = h => 1 + (h / 1.95 - 1) * 1.55;
  const headZ = () => render.drawPlayer(p).k.head[2];
  const initial = headZ();
  let previous = -Infinity;
  for (const h of [1.7, base - 0.01, base, base + 0.01, 2.25]) {
    p.h = h;
    const current = headZ();
    assert(current > previous, `${p.arch.key}: sprite height should increase at ${h} m`);
    assert(Math.abs(current / initial - heightScale(listed * (h / base)) / heightScale(listed)) < 1e-9, p.arch.key);
    previous = current;
  }
  p.h = base;
  assert.equal(headZ(), initial, p.arch.key);
}
console.log('PASS training player and dummy resize monotonically and restore their listed visuals at default');

T5.start({ home: 'LAL', away: 'GSW', human: -1 });
assert.equal(game.G.players.length, 10);
for (const p of game.G.players) {
  assert.equal(p.col.body.height, measurements[p.arch.key][0] * 0.0254);
  render.drawPlayer(p);
}
console.log('PASS 5V5 starters share the measured appearance profiles');
