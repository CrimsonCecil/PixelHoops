const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 } });
ctx.window = ctx;
vm.runInContext('delete Array.prototype.findLast', ctx);
const noop = () => {};
let numberPixels;
const canvas = () => {
  const c = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 8 }),
    fillRect(x, y, w, h) { if (this.fillStyle === '#123456') numberPixels?.push([x, y, w, h]); },
  }, {
    get: (obj, key) => obj[key] ?? noop,
  });
  return { getContext: () => c };
};
ctx.document = { createElement: canvas };
for (const name of ['tune', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5']) {
  const file = path.resolve(__dirname, '../js', name + '.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

const { game, render, rig, measurements, buildTags, T5 } = ctx.PH;
render.init(canvas());
const rgb = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const jerseyOf = p => game.NBA[p.arch.team === 'LEG' ? 'LAL' : p.arch.team].jersey;
const homeRoster = game.ROSTER.map(key => game.t5.makePlayer(0, key, 'p1'));
const awayRoster = game.ROSTER.map(key => game.t5.makePlayer(1, key, 'cpu'));
for (const home of homeRoster) {
  for (const away of awayRoster) {
    game.applyMatchKits([home, away]);
    assert.equal(home.col.jersey[1], jerseyOf(home));
    const clash = distance(jerseyOf(home), jerseyOf(away)) < 120;
    assert.equal(away.col.jersey[1], clash
      ? distance(jerseyOf(home), '#eeeae0') >= 120 ? '#eeeae0' : game.NBA[away.arch.team].shorts
      : jerseyOf(away));
    assert(distance(home.col.jersey[1], away.col.jersey[1]) >= 120, home.arch.key + ' vs ' + away.arch.key);
  }
}
for (const p of [...homeRoster, ...awayRoster]) {
  assert.match(p.col.jerseyNo, /^\d{1,2}$/);
  assert.equal(p.col.jerseyNo, String(p.arch.num));
  assert.equal(p.col.ringCol, game.TEAMS[p.id].css);
}
for (const key of ['oneale', 'clarkson', 'scoot']) {
  assert.equal(homeRoster.find(p => p.arch.key === key).col.jerseyNo, '00');
}
game.newGame({ mode: 'cpu', arch0: 'curry', arch1: 'lillard' });
assert.equal(game.G.players[0].col.jerseyNo, '30');
assert.equal(game.G.players[1].col.jerseyNo, '0');
game.newGame({ mode: 'train', arch0: 'lebron', arch1: 'maxey' });
const [trainee, dummy] = game.G.players;
assert.equal(trainee.col.jersey[1], game.NBA.PHI.jersey);
assert.equal(dummy.col.jersey[1], '#eeeae0');
assert.equal(trainee.col.jerseyNo, '23');
assert.equal(dummy.col.jerseyNo, '0');
dummy.arch = game.ARCH.lillard;
game.applyMatchKits(game.G.players);
assert.equal(dummy.col.jersey[1], game.NBA.POR.jersey);
dummy.arch = game.ARCH.curry;
game.applyMatchKits(game.G.players);
assert.equal(dummy.col.jerseyNo, '30');
trainee.col.jerseyInk = '#123456';
for (const facing of [-Math.PI / 2, Math.PI / 2]) {
  numberPixels = [];
  trainee.face = facing;
  render.drawPlayer(trainee);
  assert(numberPixels.length > 10, 'two number glyphs render on front and back');
}
console.log('PASS all 302 jersey numbers and team kits resolve; all 91,204 ordered matchups are distinguishable');
const jerseyCam = { ...render.cam };
render.setCam({ zoom: 0.8, dist: 14, height: 10 });
// The holder at the top of the court fixes the camera at the near end of its follow range.
render.cam.y = 2 - render.CAMV.dist;
for (const y of [7, 15]) for (const player of homeRoster) {
  for (const face of [-Math.PI / 2, Math.PI / 2]) {
    numberPixels = [];
    render.drawPlayer({ ...player, y, face, col: { ...player.col, jerseyInk: '#123456' } });
    const columns = new Set(numberPixels.map(([x]) => x));
    assert(columns.size >= player.col.jerseyNo.length * 2,
      player.arch.key + ' #' + player.col.jerseyNo + ' at minimum zoom, y=' + y + ', face=' + face);
  }
}
render.setCam(render.CAM_DEF);
Object.assign(render.cam, jerseyCam);
console.log('PASS jersey digits render on the front and back of all 302 players at minimum zoom');
assert.deepEqual(Object.keys(measurements).sort(), Array.from(game.ROSTER).sort());
assert.deepEqual(Object.keys(buildTags).sort(), Array.from(game.ROSTER).sort());
const classes = ['lean', 'balanced', 'muscular', 'heavy'];
for (const key of game.ROSTER) {
  const p = game.t5.makePlayer(0, key, 'cpu');
  const m = measurements[key], body = p.col.body;
  assert(classes.includes(buildTags[key]), key);
  assert.equal(p.col.buildTag, buildTags[key], key);
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
const edwards = look('edwards');
assert.equal(edwards.buildTag, 'muscular');
assert.equal(edwards.style, 'buzz');
assert.equal(edwards.face, 'oval');
assert.equal(edwards.beard, 'goatee');
assert.equal(edwards.smile, true);
assert.equal(edwards.body.taper, 1);
assert(edwards.body.chest > edwards.body.waist * 1.65);
assert(edwards.body.shoulder > edwards.body.hip * 1.35);
assert(edwards.body.armThickness > edwards.body.limb * 1.2);
assert.equal(curry.smile, undefined);
assert.equal(curry.body.taper, 0);
assert.equal(game.lookOf({ ...game.ARCH.curry, key: 'unknown' }).smile, undefined);
assert(look('clingan').body.chest > look('kobe').body.chest * 1.3);
for (const key of ['curry', 'cade', 'shaq', 'jokic', 'morant', 'butler', 'kawhi']) {
  const { limb, armThickness } = look(key).body;
  assert.equal(armThickness, limb, key);
}
console.log('PASS every rostered player renders; 302 measured-height profiles, signature looks, original gameplay rig and held-ball wrist anchors');

const widths = Object.fromEntries(classes.map(tag => [tag, []]));
for (const key of game.ROSTER) {
  const { height, chest, waist, limb } = look(key).body;
  const scale = 1 + 1.05 * Math.max(0, height / 1.95 - 1);
  widths[buildTags[key]].push({ waist: waist / scale, limb: limb / scale });
  if (buildTags[key] !== 'heavy') assert(0.32 * waist <= 0.9 * 0.375 * chest, key);
}
const max = (tag, part) => Math.max(...widths[tag].map(body => body[part]));
const min = (tag, part) => Math.min(...widths[tag].map(body => body[part]));
assert(classes.every(tag => widths[tag].length > 0));
assert(max('lean', 'limb') < min('balanced', 'limb'));
assert(max('balanced', 'limb') < min('muscular', 'limb'));
assert(max('muscular', 'waist') < min('heavy', 'waist'));
const lillard = look('lillard');
assert.equal(lillard.buildTag, 'balanced');
assert.equal(lillard.beard, 'full');
assert.equal(lillard.beardFit, 'close');
const lillardFaceRows = [];
const lillardContext = canvas().getContext();
lillardContext.rect = (x, y, w) => lillardFaceRows.push(w);
render.drawHead(lillardContext, lillard, 16, 16, 16, -Math.PI / 2);
assert(Math.max(...lillardFaceRows) < lillardFaceRows.length * 0.75, 'Lillard has a narrow, elongated face');
assert(lillardFaceRows.at(-3) < Math.max(...lillardFaceRows), 'Lillard has a tapered jaw');
console.log('PASS Lillard has a slim face and a close-fitting full beard');
assert(lillard.body.waist < lillard.body.chest * 0.95);
assert(lillard.body.limb > curry.body.limb && lillard.body.limb < look('holiday').body.limb);
console.log('PASS only heavy builds can add belly volume; Lillard stays compact with his full beard');
const luka = look('luka');
assert.equal(luka.buildTag, 'muscular');
assert(luka.body.shoulder >= 1.28 && luka.body.limb > lillard.body.limb * 1.25);
assert(luka.body.waist < 1.8);
console.log('PASS Luka retains a broad frame without the heavy-build waist');
for (const key of ['kdunn', 'curry', 'wemby']) assert.equal(buildTags[key], 'lean', key);
assert.equal(buildTags.holiday, 'muscular');
for (const part of ['shoulder', 'chest', 'waist', 'armThickness', 'limb']) {
  assert(look('kdunn').body[part] < look('holiday').body[part], part);
}
const approvedWidths = {
  holiday: [1.2193, 1.4798, 1.5209, 1.4044],
  queta: [1.1834, 1.5399, 1.5777, 1.4706],
  lebron: [1.8, 2.4098, 1.7891, 2.2396],
  shaq: [1.7875, 2.429, 2.7421, 2.2221],
  jokic: [1.3652, 1.7979, 2.1303, 1.6859],
  zion: [1.9679, 2.7851, 2.579, 2.5297],
  gobert: [1.1369, 1.4459, 1.4745, 1.3935],
  sabonis: [1.1515, 1.4268, 1.4572, 1.3709]
};
for (const [key, floors] of Object.entries(approvedWidths)) {
  const { shoulder, chest, waist, armThickness } = look(key).body;
  assert([shoulder, chest, waist, armThickness].every((v, i) => v >= floors[i] - 1e-9), key);
}
assert(relativeLimb('queta') > relativeLimb('tatum') * 1.1);
assert(relativeLimb('queta') > relativeLimb('wemby') * 1.5);
const queta = game.t5.makePlayer(0, 'queta', 'cpu');
const { height, arm, legs } = queta.col.body, scale = 1 + (height / 1.95 - 1) * 1.55;
const { k: visual } = render.drawPlayer(queta);
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
assert(dist(visual.shL, visual.elL) < 0.96 * 0.28 * scale * arm);
assert(dist(visual.hipL, visual.kneeL) < 0.97 * 0.41 * scale * legs);
console.log('PASS all 302 builds are tagged and ordered; Dunn stays lean and approved V6 builds are preserved');

function headPixels(look, size, angle) {
  const rows = new Map(), pixels = new Map();
  let clipped = false;
  const c = {
    save: noop, beginPath: noop, rect: (x, y, w) => rows.set(y, [x, x + w]),
    clip: () => { clipped = true; }, restore: () => { clipped = false; },
    fillRect(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) {
        const bounds = rows.get(yy);
        for (let xx = x; xx < x + w; xx++) {
          if (!clipped || (bounds && xx >= bounds[0] && xx < bounds[1])) pixels.set(yy * 128 + xx, this.fillStyle);
        }
      }
    }
  };
  render.drawHead(c, look, 48, 48, size, angle);
  return { rows, pixels };
}

for (const key of game.ROSTER) {
  const profile = look(key), bald = profile.style === 'bald';
  const bare = [...profile.skin, ctx.PH.shade(profile.skin[1], 1.18)];
  for (const size of [8, 16, 29]) {
    for (const angle of [-0.16, 0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, Math.PI + 0.16]) {
      const { rows, pixels } = headPixels(profile, size, angle);
      const first = rows.keys().next().value;
      const side = Math.cos(angle), back = Math.sin(angle) > 0.35;
      for (const [y, [left, right]] of rows) {
        const t = (y - first) / rows.size;
        if (t >= (back ? 0.63 : Math.sin(angle) < -0.1 ? 0.47 : 0.54)) break;
        for (let x = left; x < right; x++) {
          const u = (x + 0.5 - left) / (right - left);
          if (!back && t >= 0.08 && (side > 0 ? u > 0.24 : u < 0.76)) continue;
          const color = pixels.get(y * 128 + x);
          if (profile.band && [profile.band, ctx.PH.shade(profile.band, 1.16)].includes(color)) continue;
          assert(color && bare.includes(color) === bald, `${key} (${profile.style}), size ${size}, angle ${angle}: unexpected scalp pixel at ${x},${y}`);
        }
      }
      if (!bald && !back) {
        const bareFace = { ...profile, beard: false };
        const shaved = headPixels({ ...bareFace, style: 'bald' }, size, angle).pixels;
        const withHair = headPixels(bareFace, size, angle).pixels;
        for (const [y, [left, right]] of rows) {
          if ((y - first) / rows.size < 0.39) continue;
          for (let x = left; x < right; x++) {
            if ((x + 0.5 >= (left + right) / 2) !== (side > 0)) continue;
            const pixel = y * 128 + x;
            assert.strictEqual(withHair.get(pixel), shaved.get(pixel),
              `${key} (${profile.style}), size ${size}, angle ${angle}: hair covers the profile face at ${x},${y}`);
          }
        }
      }
    }
  }
}
console.log('PASS continuous side and rear scalp coverage for all 302 players, including bald exceptions');
console.log('PASS hair stays off the front half of the profile from eye to jaw');

const dosunmu = look('dosunmu'), wells = look('jwells');
assert.equal(dosunmu.style, 'longbraids');
assert.equal(wells.style, 'afro');
assert(wells.body.headScale > dosunmu.body.headScale && wells.body.neckScale > dosunmu.body.neckScale);
const hairstyles = [...new Set(game.ROSTER.map(key => look(key).style))];
const pixelDifference = (a, b) => {
  const positions = new Set([...a.keys(), ...b.keys()]);
  let changed = 0;
  for (const p of positions) if (a.get(p) !== b.get(p)) changed++;
  return changed / positions.size;
};
for (const angle of [Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
  const hairstylesAtAngle = hairstyles.map(style => [style,
    headPixels({ ...dosunmu, style, band: '', beard: '' }, 16, angle).pixels]);
  hairstylesAtAngle.forEach(([a, pixels], i) => {
    for (const [b, other] of hairstylesAtAngle.slice(i + 1)) {
      assert(pixelDifference(pixels, other) >= 0.05, `${a} vs ${b} at ${angle}: hairstyle sprites too similar`);
    }
  });
}
console.log(`PASS all ${hairstyles.length} roster hairstyles are visibly distinct from the back and rear ¾`);

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
