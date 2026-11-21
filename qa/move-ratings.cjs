const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {} });
ctx.window = ctx;
vm.runInContext('Math.random = () => 0.5', ctx);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game', 'b5', 'team5', 'team3']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.moveQA = { updatePlayer, pumpFake, aiInputCore, postQuality, uuQuality, postFakeAllowed, psK }; PH.game = {');
  vm.runInContext(source, ctx, { filename: name + '.js' });
}
const { game: gm, T5: team, TUNE: tune, moveQA: qa } = ctx.PH;
const { G, _dbg: dbg, K } = gm;
const dt = 1 / 120, zero = () => gm.t5.zeroInp();
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);
function fixture(mode = '2p') {
  if (ctx.PH.T3.T.on) ctx.PH.T3.stop();
  if (team.T.on) team.stop();
  if (G.mode === 't5') gm.t5.end();
  tune.load({ l1_stamRegen: 0 }); gm.seed(7);
  if (mode === 't5') team.start({ home: 'LAL', away: 'BOS', human: 0 });
  else if (mode === 't3') ctx.PH.T3.start({ local: 0, slots: ['luka', 'curry', 'jokic', 'gobert', 'kobe', 'lebron'].map((arch, i) => ({ arch, role: i ? 'cpu' : 'human' })) });
  else gm.newGame({ mode: '2p', arch0: 'luka', arch1: 'gobert', target: 999 });
  const p = mode === 't5' ? team.T.ctl : G.players[0];
  const d = G.players.find(q => q !== p && (mode !== 't5' && mode !== 't3' || q.tm !== p.tm));
  Object.assign(G, { phase: 'live', needClear: false, time: 10, off: p.tm || 0, shotClock: 20 });
  for (const q of G.players) Object.assign(q, { hasBall: false, off: true, x: -6, y: -6 });
  Object.assign(p, { x: 0, y: ctx.PH.render.HOOP.y - 5.2, z: 0, vz: 0, face: -Math.PI / 2, vx: 0, vy: 0, speed: 0, action: null, post: true, hasBall: true, opp: d, stam: 100, cd: 0, postMove: null, postFaceLock: false, off: false });
  p.arch = { ...p.arch, _bt: {} };
  Object.assign(p.r, { post: 0.92, close: 0.92, lay: 0.92, hook: 0, badges: [], sig: { ...p.r.sig, hook: 0 } });
  p.sk.ready = false;
  Object.assign(d, { x: 0, y: p.y + 1, z: 0, stun: 0, action: null, opp: p, off: true, vx: 0, vy: 0 });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  return { p, d };
}
function step(p, inp = {}, n = 1) {
  for (let i = 0; i < n; i++) { G.time += dt; qa.updatePlayer(p, { ...zero(), ...inp }, dt); }
}
function badge(p, key, tier) {
  p.r.badges = tier ? [key] : [];
  p.arch._bt = { [key]: tier };
}
function early(p, side = 1) {
  dbg.startShot(p, { ...zero(), mx: side }, 'a1');
  const a = p.action;
  step(p, { post: true, a1: true }, 5); step(p, { post: true });
  return a;
}
function finishFake(p) {
  for (let i = 0; p.action && i < 120; i++) step(p, { post: true });
  assert.equal(p.action, null);
}

for (const mode of ['2p', 't3', 't5']) {
  for (const [x, y] of [[1, 0], [0, -1], [0, 1]]) {
    const samples = [];
    for (const rating of [0.4, 0.98]) {
      const { p } = fixture(mode); p.r.post = rating;
      dbg.startShot(p, { ...zero(), mx: x, my: y }, 'a1');
      const s = p.action.stride, x0 = p.x, y0 = p.y;
      assert(s);
      while (p.action.t < s.T) step(p, { post: true, a1: true });
      samples.push({ T: s.T, distance: s.distance / qa.psK(p).sp, travel: Math.hypot(p.x - x0, p.y - y0) });
      assert.equal(p.z, 0);
    }
    const [low, high] = samples;
    near(high.T / low.T, 0.92 / 1.25, `${mode} post duration ratio`);
    near(high.distance / low.distance, 1.1 / 0.6, `${mode} post stride ratio`);
    assert(high.travel > low.travel * 1.7);
  }
  for (const [tier, limit] of [[0, 1], [1, 2], [2, 3], [3, 8], [4, 8]]) {
    const { p } = fixture(mode); badge(p, 'dream', tier);
    for (let n = 0; n < limit; n++) {
      early(p, n % 2 ? -1 : 1);
      assert(p.action.postFake && p.hasBall && p.post, `${mode} tier ${tier} fake ${n + 1}`);
      assert.equal(p.postFakeCount, n + 1); finishFake(p);
    }
    if (tier < 3) {
      const a = early(p);
      assert(!a.released && p.hasBall && p.action.postFake, `${mode} tier ${tier} over-limit release stays a fake`);
      assert.equal(G.stats[p.id].fga, 0); assert.equal(p.postFakeCount, limit + 1);
    }
  }
  for (const mv of ['uuForward', 'uuBack', 'uuLeft', 'uuRight']) {
    const samples = [];
    for (const rating of [0.4, 0.98]) {
      const { p } = fixture(mode); p.post = false; p.r.close = p.r.lay = rating;
      p.uuFake = { until: G.time + 1, def: -1, bitUntil: -1 };
      dbg.startMove(p, zero(), mv);
      const a = p.action;
      assert.equal(a.kind, 'uu');
      near(p.uuShot.until, G.time + a.T + K.uuWin, 'UU window follows scaled duration');
      samples.push({ T: a.T, distance: a.sp * a.T });
    }
    near(samples[1].T / samples[0].T, 0.92 / 1.25, `${mode} UU duration ratio`);
    near(samples[1].distance / samples[0].distance, 1.15 / 0.55, `${mode} UU distance ratio`);
  }
}
for (const mode of ['2p', 't3', 't5']) for (const rating of [0.4, 0.98]) {
  for (const move of ['uuForward', 'uuBack', 'uuLeft', 'uuRight', 'Spin', 'Back', 'Front']) {
    const { p } = fixture(mode); p.r.post = p.r.close = p.r.lay = rating;
    const uu = move.startsWith('uu');
    tune.set('l1_' + (uu ? 'uuTime' : 'poStrideTime') + (rating < 0.5 ? 'Low' : 'High'), 0);
    if (uu) { p.post = false; dbg.startMove(p, zero(), move); }
    else dbg.startShot(p, { ...zero(), mx: move === 'Spin' ? 1 : 0, my: move === 'Back' ? -1 : move === 'Front' ? 1 : 0 }, 'a1');
    const a = p.action;
    assert((uu ? a.T : a.stride.T) > 0, `${mode} ${move} zero multiplier needs a positive duration`);
    for (let i = 0; i < 12; i++) {
      step(p, { post: !uu, a1: !uu });
      assert([p.x, p.y, p.vx, p.vy].every(Number.isFinite), `${mode} ${move} positions and velocities stay finite`);
    }
  }
}
console.log('PASS zero duration tuning: low/high multipliers keep all UU and post strides finite in every mode');
console.log('PASS move quality: post Spin/Back/Front and all four UU steps are larger/faster at high ratings in 1V1/3V3/5V5');
console.log('PASS fake limits: no dream=1, bronze=2, silver=3, gold/HOF unlimited effective fakes; excess early releases retain the ball in all modes');

for (const mode of ['2p', 't3', 't5']) for (const [tier, limit] of [[0, 1], [1, 2], [2, 3], [3, 5], [4, 5]]) {
  const { p } = fixture(mode); badge(p, 'dream', tier);
  for (let i = 0; i < limit + (tier < 3 ? 1 : 0); i++) {
    const side = i % 2 ? -1 : 1;
    step(p, { post: true, rs: true, rsPad: true, dx: side });
    assert.equal(p.postFakeCount || 0, i, 'a provisional stick move preserves the count before hold conversion');
    step(p, { post: true, rs: true, rsPad: true, dx: side }, Math.ceil(K.rsHold / dt) + 1);
    const a = p.action;
    assert.equal(a.type, 'shot', `${mode} held stick converts its preliminary move to a shot`);
    step(p, { post: true, rsPad: true });
    assert(p.action.postFake && p.hasBall && !a.released, `${mode} tier ${tier} stick fake ${i + 1}`);
    assert.equal(p.postFakeCount, i + 1, `${mode} stick conversion preserves the fake count`);
    finishFake(p);
  }
}
console.log('PASS right-stick fake limits: preliminary post moves preserve Dream counts; excess releases remain fakes in all modes');

for (const end of ['flick', 'direction', 'exit']) {
  const { p } = fixture(); early(p); finishFake(p);
  step(p, { post: true, rs: true, rsPad: true, dx: 1 });
  assert.equal(p.postFakeCount, 1);
  step(p, { post: end !== 'exit', rs: end !== 'flick', rsPad: true, dx: -1 });
  assert.equal(p.postFakeCount, 0, `${end} commits a real move or leaves post`);
}

for (const end of ['exit', 'loss', 'dead', 'move', 'shot']) {
  const { p } = fixture(); early(p); finishFake(p); assert.equal(p.postFakeCount, 1);
  if (end === 'move') dbg.startMove(p, { ...zero(), dx: 1 }, 'postspin');
  else if (end === 'shot') { dbg.startShot(p, zero(), 'a1'); dbg.releaseShot(p, 0.5, 'shot'); }
  else { if (end === 'loss') p.hasBall = false; if (end === 'dead') G.ball.dead = true; step(p); }
  assert.equal(p.postFakeCount, 0, end);
}
{
  const { p } = fixture(); tune.set('l1_poFakeLimitNone', 0);
  for (let i = 0; i < 4; i++) { early(p); assert(p.action.postFake); finishFake(p); }
  tune.set('l1_poFakeLimitNone', 2); assert(!qa.postFakeAllowed(p));
  tune.set('l1_poQMax', K.poQMin); tune.set('l1_uuQMax', K.uuQMin);
  assert(Number.isFinite(qa.postQuality(p)) && Number.isFinite(qa.uuQuality(p)));
}
for (const tier of [0, 1, 2, 3]) {
  const { p } = fixture(); badge(p, 'dream', tier); p.ctrl = 'cpu';
  tune.set('l1_aiPoFakeChain', 1);
  const limit = tier === 0 ? 1 : tier === 1 ? 2 : tier === 2 ? 3 : 5;
  for (let i = 0; i < limit; i++) { early(p); assert(p.action.postFake); finishFake(p); }
  assert.equal(!!p.ai.postChain, tier >= 3, 'CPU does not queue fakes after its badge limit');
  dbg.startShot(p, { ...zero(), mx: 1 }, 'a1');
  Object.assign(p.ai, { relFor: null, fakeNext: true });
  qa.aiInputCore(p, dt);
  if (tier < 3) assert(p.ai.releaseAt > 0.08, 'CPU ignores stale fakeNext at the limit');
}
console.log('PASS fake lifecycle: possession exit/loss/dead ball, real move/shot reset counts; zero-limit tuning and CPU chain/release guards');

{
  const { p } = fixture(); p.post = false;
  Object.assign(p.r, { post: 0.1, close: 0.1, lay: 0.1, hnd: 0.1 });
  step(p, { a1: true }); step(p); assert.equal(p.action.type, 'fake');
  step(p, { a3: true, dx: 0, dy: 1 }); assert.equal(p.action.kind, 'uu');
}
for (const move of ['post', 'uu']) {
  const rates = [];
  for (const rating of [0.4, 0.98]) {
    const { p, d } = fixture(); p.ctrl = 'cpu'; d.off = false; p.r.post = p.r.close = p.r.lay = rating;
    tune.set('l1_aiPoFake', 0); tune.set('l1_aiPoSpinShot', 0.6); tune.set('l1_uuCpu', 0.6);
    let count = 0;
    for (let i = 1; i <= 1000; i++) {
      p.action = move === 'uu' ? { type: 'fake', t: 0, T: 0.26 } : null;
      p.uuFake = move === 'uu' ? { until: G.time + 1, def: d.id, bitUntil: G.time + 1 } : null;
      Object.assign(p.ai, { plan: 'post', postT: 20, t: 2, side: 1, postChain: 0, su: { t0: 0, end: 0 }, cb: null, iso: null, om: null, call: null });
      gm.seed(i * 101);
      const out = qa.aiInputCore(p, dt);
      if (move === 'uu' ? out.a3 : out.a1 && Math.abs(out.mx) > 0.9 && out.my === 0) count++;
    }
    rates.push(count);
  }
  assert(rates[0] > 0 && rates[1] > rates[0] * 1.6, `${move} AI quality tendency: ${rates}`);
  console.log(`PASS seeded ${move} AI quality tendency: low=${rates[0]}/1000 high=${rates[1]}/1000; weak players retain UU access`);
}

function biteRate(post, rating, fakes) {
  const { p, d } = fixture(); G.mode = 'cpu'; p.ctrl = 'human'; d.ctrl = 'cpu'; d.off = false;
  d.D = { ...gm.DIFF[1], bite: 0.35, steal: 0 }; badge(p, 'fakes', fakes ? 3 : 0);
  p.r.post = p.r.close = p.r.lay = rating;
  let count = 0;
  for (let i = 1; i <= 2000; i++) {
    p.action = { type: 'shot', postOrigin: post, fakeSide: 1 }; p.postFakeCount = 0;
    Object.assign(d.ai, { willJump: false, jumpAt: -1, seenAct: null }); gm.seed(i * 137);
    qa.pumpFake(p, 0.26, false);
    if (post) { if (d.ai.willJump) count++; }
    else {
      Object.assign(d.ai, { seenAct: p.action, willJump: true, jumpAt: G.time - 0.01 });
      if (qa.aiInputCore(d, dt).a1) count++;
    }
  }
  return count;
}
for (const post of [false, true]) {
  const low = biteRate(post, 0.4, false), high = biteRate(post, 0.98, false), badgeHigh = biteRate(post, 0.98, true);
  assert(low > 0 && high > low * 1.8 && badgeHigh > high * 1.15 && badgeHigh < 2000);
  console.log(`PASS seeded ${post ? 'post' : 'normal'} fake bite: low=${low}/2000 high=${high}/2000 gold-fakes=${badgeHigh}/2000`);
}

function shotProb(origin, rating, penalty = true, bit = false) {
  const { p, d } = fixture(); p.r.post = p.r.close = p.r.lay = rating;
  p.post = origin === 'post'; d.off = !bit;
  tune.set(origin === 'post' ? 'l1_poStrideMiss' : 'l1_uuMiss', penalty ? origin === 'post' ? 0.12 : 0.1 : 0);
  if (origin === 'uu') p.uuShot = { mv: 'uuRight', until: G.time + 1, def: bit ? d.id : -1, bitUntil: G.time + 1 };
  dbg.startShot(p, { ...zero(), mx: origin === 'post' ? 1 : 0 }, 'a1');
  dbg.releaseShot(p, 0.5, 'shot');
  return G.lastShot;
}
for (const origin of ['post', 'uu']) {
  near(shotProb(origin, 0.4).prob / shotProb(origin, 0.4, false).prob, origin === 'post' ? 0.88 : 0.9, `${origin} low quality shot penalty`);
  near(shotProb(origin, 0.98).prob, shotProb(origin, 0.98, false).prob, `${origin} high quality no penalty`);
}
near(shotProb('uu', 0.4, true, true).uuBonus, 0, 'low quality UU bonus');
near(shotProb('uu', 0.98, true, true).uuBonus, 0.08, 'high quality UU bonus');
{
  const distances = [];
  for (const tier of [0, 1, 2, 3, 4]) {
    const { p } = fixture(); p.post = false; badge(p, 'fakes', tier);
    dbg.startMove(p, zero(), 'uuRight'); distances.push(p.action.sp * p.action.T);
  }
  assert(distances.every((v, i) => !i || v > distances[i - 1]));
  near(distances[3] / distances[0], 1.15, 'gold fakes step multiplier');
}
console.log('PASS shot quality: post/UU low-rating penalties, high-rating exemption, quality-scaled UU bonus and tier-scaled fakes step');

function kobeFade(mode, skill, error, penalty) {
  const { p, d } = fixture(mode);
  p.arch = { ...gm.ARCH.kobe, skill: skill ? gm.ARCH.kobe.skill : null };
  Object.assign(p.r, gm.ARCH.kobe); p.sk.cd = 0;
  G.sd = true;
  if (mode === 't5') { team.T.q = 4; team.T.gclock = 20; team.T.tm[0].score = team.T.tm[1].score; }
  Object.assign(d, { off: false, x: p.x, y: p.y + 0.6 });
  tune.set('l1_poStrideMiss', penalty);
  dbg.startShot(p, { ...zero(), my: -1 }, 'a1');
  assert.equal(p.action.v, 'postfade'); assert(p.action.stride);
  assert.equal(!!p.action.skill, skill, 'Kobe skill activates naturally in clutch time');
  dbg.releaseShot(p, error, 'shot');
  return { prob: G.lastShot.prob, q: qa.postQuality(p) };
}
for (const mode of ['2p', 't3', 't5']) for (const skill of [true, false]) for (const error of [0, 0.4]) {
  const base = kobeFade(mode, skill, error, 0), penalized = kobeFade(mode, skill, error, 0.12);
  if (skill && error === 0) {
    console.log(`Kobe green skill ${mode}: base=${base.prob} with-penalty=${penalized.prob}`);
    assert.equal(penalized.prob, 1, 'green Kobe skill post fade must retain its guaranteed make');
  } else near(penalized.prob / base.prob, 1 - 0.12 * (1 - base.q), 'ordinary and non-green skill fades retain the rating penalty');
}
console.log('PASS skill guarantee: perfect Kobe post fades remain 100%; non-green skill and ordinary post fades retain penalties in all modes');

const rows = Object.values(gm.ARCH);
for (const a of rows) assert.equal(a.badges.includes('fakes'), (a.close + a.lay) * 99 / 2 >= 80, a.name);
for (const [rating, expected] of [[79, 0], [80, 1], [85, 1], [86, 2], [91, 2], [92, 3], [97, 4]])
  assert.equal(gm.BADGE_TIER.fakes({ close: rating / 99, lay: rating / 99 }), expected);
const granted = rows.filter(a => a.badges.includes('fakes'));
assert(granted.some(a => a.badges.length >= 5));
console.log(`PASS fakes auto-grant: ${granted.length}/${rows.length}; every ARCH/roster player matches close+lay thresholds, independent of hand-picked slots`);
console.log('FAKES HOLDERS: ' + granted.map(a => `${a.key}(${a.name})`).join(', '));
console.log('NO FAKES EXAMPLES: ' + rows.filter(a => !a.badges.includes('fakes')).slice(0, 12).map(a => `${a.key}(${a.name})`).join(', '));
console.log('DREAM HOLDERS: ' + rows.filter(a => a.badges.includes('dream')).map(a => `${a.key}(${a.name})`).join(', '));
{
  const main = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const ui = vm.createContext({ GM: gm, PH: ctx.PH, IC: { has: () => false } });
  vm.runInContext(main.slice(main.indexOf('  function bLv('), main.indexOf('  // 徽章触发：')) + '\nthis.list = bList; this.hex = bHex;', ui);
  const a = granted.find(a => a.badges.length >= 5);
  assert(ui.list(a, false).some(([k]) => k === 'fakes')); assert(ui.list(a, false).length >= 5);
  assert(ui.hex('fakes', 3).includes('假'));
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  assert(/\.pcard \.pcb\s*\{[^}]*flex-wrap: wrap/.test(css) && /\.pkbrow\s*\{[^}]*flex-wrap: wrap/.test(css));
}

const postRe = /^(po(Drop|Face|Shim|Front|OneLat|Stride|Fake|BlendT|ReturnT|Follow|Q)|bgDream)/;
let checked = 0;
for (const def of tune.list()) {
  const k = def.k.replace(/^l1_/, '');
  if (postRe.test(k) || /^(uu(?!Cpu$)|bgFakes)/.test(k)) {
    assert.equal(def.cat, 'moves', k); assert.equal(def.sub, postRe.test(k) ? '背打' : '上下步', k); checked++;
  } else if (/^po(Int|Win|Attr|Rnd|Skill|Seal|Knock)/.test(k)) { assert.equal(def.cat, 'ct', k); assert.equal(def.sub, '背打', k); }
  else if (/^aiPo|^uuCpu$/.test(k)) assert.equal(def.cat, 'ai', k);
}
assert(checked >= 50);
assert.equal(tune.CATS.findIndex(c => c.id === 'moves'), tune.CATS.findIndex(c => c.id === 'drib') + 1);
assert.equal(tune.CAT_ID.moves.name, '进攻招式');
assert.equal(tune.meta('l1_uuReq').v, 0);
tune.load({ l1_poStrideSpinT: 0.49, l1_poFakeT: 0.17, l1_uuT: 0.53, l1_bgDreamSp: 1.3, l1_uuReq: 0.45 });
near(K.poStrideSpinT, 0.49, 'saved post stride'); near(K.poFakeT, 0.17, 'saved fake duration');
near(K.uuT, 0.53, 'saved UU duration'); near(K.bgDreamSp, 1.3, 'saved dream'); near(K.uuReq, 0.45, 'saved UU gate');
tune.load({}); assert.equal(K.uuReq, 0);
console.log(`PASS tuning/UI: ${checked} move parameters classified with correct subcategories; contact/AI stay separate, saved keys load, empty config uses defaults, fifth badge renders`);
console.log('Move ratings: all assertions passed.');
