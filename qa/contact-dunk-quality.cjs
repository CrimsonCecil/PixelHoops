const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load(before = false, base = '444770d') {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {}, read: () => ({}), read5: () => ({}) } };
  for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'r2k', 'game', 'b5', 'team5']) {
    let code = before && name === 'game'
      ? execFileSync('git', ['show', `${base}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') code = code.replace('PH.game = {', 'PH.qualityQA = { finContact, updateAction, thruHit }; PH.game = {');
    if (name === 'team5') code = code.replace('PH.T5 = {', 'PH.qualityTeamQA = (g) => { G = g; T.tm = [0, 1].map(tm => ({ on: g.players.filter(p => p.tm === tm) })); shotAdj(); }; PH.T5 = {');
    vm.runInContext(code, ctx, { filename: name + '.js' });
  }
  return ctx;
}

function fixture(ctx, { attacker = 'rdunn', defender = 'pritchard', kind = 'dunk', seed = 7, mode = '2p', cpu = false, ratings } = {}) {
  const gm = ctx.PH.game, G = gm.G;
  gm.newGame({ mode: '2p', arch0: attacker, arch1: defender, target: 9999 });
  Object.assign(G, { mode, phase: 'live', tips: null, needClear: false });
  const [p, d] = G.players;
  Object.assign(p, { x: 0, y: 10, z: 0.05, vx: 0, vy: 5, face: Math.PI / 2, speed: 5, hasBall: true, ctrl: cpu ? 'cpu' : 'p1', stam: 100 });
  Object.assign(d, { x: 0, y: 10.6, z: 0, vx: 0, vy: 0, face: -Math.PI / 2, stance: true, stun: 0, action: null, stam: 100 });
  if (ratings) Object.assign(p.r, ratings);
  if (mode === 't5') { p.tm = 0; d.tm = 1; p.opp = d; G.h5 = { score: (q, pts) => { G.score[q.tm] += pts; } }; }
  Object.assign(G.ball, { state: 'held', holder: 0, x: p.x, y: p.y, z: 1.4, dead: false });
  if (kind === 'dunk') gm._dbg.startDunk(p, gm._dbg.finPlan(p), 'a2', 'two');
  else assert(gm._dbg.startFinish(p, gm.t5.zeroInp(), 'lay'));
  const a = p.action;
  Object.assign(a, { skill: null, inSteps: true, run0: 0.8, sx: p.x, sy: p.y, fumbleChecked: true });
  if (kind === 'lay') { a.v = 'normal'; a.V = { ...gm._qa.LVR.normal }; a.farLsv = false; a.lsv = null; }
  if (mode === 't5') ctx.PH.qualityTeamQA(G);
  gm.CFG.blockMul = 0;
  gm.seed(Math.imul(seed, 100003));
  return { gm, G, p, d, a };
}

function resolve(ctx, f, kind) {
  const { gm, G, p, a } = f;
  a.inSteps = false;
  if (kind === 'dunk') { a.t = a.T * 0.8; ctx.PH.qualityQA.updateAction(p, gm.t5.zeroInp(), 0); }
  else { Object.assign(p, { x: 0, y: 11, z: 0.8 }); gm._dbg.releaseShot(p, 0, 'lay'); }
  const info = G.lastShot;
  assert(info && Number.isFinite(info.prob) && info.prob >= 0 && info.prob <= 1);
  return info;
}

function sample(ctx, opts, N = 2000) {
  let triggers = 0, falls = 0, made = 0, prob = 0;
  for (let seed = 1; seed <= N; seed++) {
    const f = fixture(ctx, { ...opts, seed });
    ctx.PH.qualityQA.finContact(f.p, f.d);
    if (!f.a.thru) continue;
    triggers++; falls += f.a.thru === 'fall';
    const info = resolve(ctx, f, opts.kind);
    made += info.made; prob += info.prob;
  }
  return { trigger: triggers / N, fall: falls / N, make: triggers ? made / triggers : null, expected: triggers ? prob / triggers : null, joint: made / N };
}

const before = load(true), after = load(), legacy = load(true, '61e7280');
const pct = x => x == null ? 'n/a' : (100 * x).toFixed(1) + '%';
console.log('N=2000 seeded front contacts at 0.6m; ordinary finishes, blocks disabled; make = sampled makes conditional on through-contact');
console.log('Attacker Defender Kind | trigger before/after | make before/after | through+make per contact before/after');
for (const attacker of ['rdunn', 'giannis']) for (const defender of ['pritchard', 'queta']) for (const kind of ['dunk', 'lay']) {
  const opts = { attacker, defender, kind }, old = sample(before, opts), now = sample(after, opts);
  console.log(`${attacker} ${defender} ${kind} | ${pct(old.trigger)}/${pct(now.trigger)} | ${pct(old.make)}/${pct(now.make)} | ${pct(old.joint)}/${pct(now.joint)}`);
  if (attacker === 'rdunn' && defender === 'pritchard') {
    assert(now.trigger > old.trigger);
    if (kind === 'dunk') assert(now.trigger >= 0.45 && now.trigger <= 0.55, 'Dunn dunk trigger target is about 50%');
    assert(Math.abs(now.make - old.make) < 0.06, 'conditional make rate stays roughly unchanged');
  }
  if (attacker === 'giannis') assert.deepEqual(now, old, 'elite quality retains original through-contact behavior');
  if (now.make != null) assert(Math.abs(now.make - now.expected) < 0.1);
}

for (const kind of ['dunk', 'lay']) {
  const average = { kind, ratings: { dunk: 0.675, lay: 0.675, hnd: 0.675, spd: 0.675, str: 0.675 } };
  assert(sample(after, average, 600).trigger < sample(legacy, average, 600).trigger * 0.85, 'average attackers remain below pre-quality trigger rates');
  const ordinaryBefore = fixture(before, { kind }), ordinaryAfter = fixture(after, { kind });
  assert.equal(resolve(after, ordinaryAfter, kind).prob, resolve(before, ordinaryBefore, kind).prob, 'ordinary non-through finish odds unchanged');
  for (const rating of ['hnd', 'spd', 'str', kind === 'dunk' ? 'dunk' : 'lay']) {
    const low = sample(after, { kind, ratings: { [rating]: 0.4 } }, 600);
    const high = sample(after, { kind, ratings: { [rating]: 0.95 } }, 600);
    assert(high.trigger > low.trigger, `${kind}: ${rating} independently increases through-contact rate`);
  }
  for (const thru of ['fall', 'stagger']) for (const mode of ['2p', 't5']) for (const cpu of [false, true]) {
    const opts = { kind, mode, cpu };
    const old = fixture(before, opts), now = fixture(after, opts);
    for (const [ctx, f] of [[before, old], [after, now]]) ctx.PH.qualityQA.thruHit(f.p, f.d, f.a, thru, 0.5, 0, 1, 0, 1, false);
    assert(Math.abs(resolve(after, now, kind).prob - resolve(before, old, kind).prob) < 0.01, `${kind}/${thru}/${mode}: conditional make odds preserved`);
    assert(now.G.lastShot.prob < 0.85, 'weak through finish cannot become automatic through 5V5 calibration');
  }
  for (const opts of [{ gap: 4 }, { phase: 'dead' }, { skill: 'giannis' }, { off: true }, { released: true }]) {
    const f = fixture(after, { kind });
    if (opts.gap) f.d.y = f.p.y + opts.gap;
    if (opts.phase) f.G.phase = opts.phase;
    if (opts.skill) f.a.skill = opts.skill;
    if (opts.off) f.d.off = true;
    if (opts.released) f.a.released = true;
    after.PH.qualityQA.finContact(f.p, f.d);
    assert(!f.a.thru, 'contact gating preserved');
  }
}
const guard = fixture(after);
after.PH.game.K.ctThruQ1 = after.PH.game.K.ctThruQ0;
after.PH.qualityQA.finContact(guard.p, guard.d);
assert(Number.isFinite(guard.p.stam), 'equal tuning thresholds remain finite');
console.log('PASS contact quality: seeded actual finContact/thruHit and dunk/layup make rolls, four independent ratings, elite preservation, fall/stagger, human/CPU, 1v1/5V5, ineligible contacts and tuning guards');

function jumper(ctx, { distance = 2.5, error = 0, gap = 9, rawContest, badge = false, mode = '2p' } = {}) {
  const f = fixture(ctx, { mode, attacker: 'pritchard', defender: 'rdunn', kind: 'lay' }), { gm, G, p, d } = f;
  p.action = null; p.x = 0; p.y = ctx.PH.render.HOOP.y - distance; p.z = 0; p.vx = p.vy = p.speed = 0;
  d.x = gap; d.y = p.y; d.stun = 0;
  p.r.badges = badge ? ['pullup'] : [];
  p.arch = { ...p.arch, _bt: {} };
  gm._dbg.startShot(p, gm.t5.zeroInp(), 'a1', 'set');
  p.action.skill = null;
  if (rawContest != null) {
    const c = gm.contestInfo(p, d, 'shot').c;
    p.action.V = { ...p.action.V, c: rawContest / c };
  }
  gm._dbg.releaseShot(p, error, 'shot');
  return G.lastShot;
}
console.log('Pritchard jumpers: scenario | before/after probability');
for (const opts of [{}, { distance: 3 }, { distance: 3.001 }, { distance: 5 }, { distance: 7 }, { error: 0.75 }, { gap: 0.6, rawContest: 0.199 }, { gap: 0.6, rawContest: 0.2 }, { gap: 0.6, rawContest: 0.7 }, { badge: true }, { mode: 't5' }]) {
  const old = jumper(before, opts), now = jumper(after, opts);
  console.log(`${JSON.stringify(opts)} | ${pct(old.prob)}/${pct(now.prob)}`);
  const exempt = now.green && now.contest < 0.2 && (opts.distance || 2.5) <= 3 && !opts.badge;
  assert.equal(now.prob, old.prob);
  if (exempt) assert.equal(now.styleDelta, 0);
}
console.log('PASS close green jumpers: 100% preserved, distance and contest boundaries, non-green/contested/midrange/long unchanged, pullup badge, shared 5V5 release');
