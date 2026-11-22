const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const c1 = require('./far-layup-c1.json');
const dt = 1 / 60;
const offsets = [-18, -15, -12, -9, -6, -3, 0, 3, 6];
const kinds = ['shot', 'lay', 'dunk'];
const groups = [...kinds, 'driving lay', 'standing lay'];
const counters = () => ({
  total: 0, air: 0, range: 0, hand: 0, contactInRange: 0, judged: 0, heldJudgment: 0, blocked: 0, pressed: 0, aborted: 0
});

function load(base, profile) {
  const ctx = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} });
  ctx.window = ctx;
  ctx.PH = { input: { endTick() {} } };
  for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
    let source = base && name === 'game'
      ? execFileSync('git', ['show', `${base}:js/game.js`], { cwd: root, encoding: 'utf8' })
      : fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8');
    if (name === 'game') {
      for (const [line, replacement] of [
        ['function tryBlock(sh, df, kind, mul, chM, ballPos, attempt, edge) {', '$& PH.probe(sh, df, kind, ballPos, attempt, blockContact);'],
        ['const q = jumpQ(df), tq =', 'PH.judge(kind); $&'],
        ['return chM == null || df.action.rimB || rnd() < chM;', '{ PH.judge(kind); $& }']
      ]) {
        assert(source.includes(line), 'missing probe site: ' + line);
        source = source.replace(line, replacement);
      }
    }
    vm.runInContext(source, ctx, { filename: name + '.js' });
  }
  if (profile) ctx.PH.TUNE.load(profile.data, profile);
  return ctx.PH;
}

function attempt(ph, kind, position, pair, seed, pressFrame) {
  const gm = ph.game, { G, _dbg: dbg, t5 } = gm;
  gm.seed(seed);
  gm.newGame({ mode: '2p', arch0: pair[0], arch1: pair[1], target: 99 });
  const [sh, df] = G.players, hoop = ph.render.HOOP;
  Object.assign(G, { off: 0, phase: 'live', needClear: false, tips: null, chk: null });
  Object.assign(G.ball, { state: 'held', holder: 0, x: 0, y: hoop.y - 3, z: 1 });
  const [x, gap] = position, moving = kind === 'lay' && seed % 4 === 1;
  const distance = kind === 'shot' ? 4.2 : kind === 'dunk' ? 1.65 : moving ? 2.7 : 1.9;
  Object.assign(sh, { hasBall: true, x: 0, y: hoop.y - distance, vx: 0, vy: moving ? 3.4 : 0, face: Math.PI / 2, stam: 100, ctrl: 'p1' });
  Object.assign(df, { hasBall: false, x, y: sh.y + gap, vx: 0, vy: 0, face: -Math.PI / 2, stam: 100, ctrl: 'p2' });
  delete df.pose.passHands;
  G.vopt.replay = false;
  const input = t5.zeroInp(), held = { ...input, a1: true };
  if (kind === 'shot') dbg.startShot(sh, held, 'a1');
  else {
    assert(dbg.startFinish(sh, held, kind === 'lay' ? 'lay' : 'auto', 'a1'));
  }
  const a = sh.action;
  assert.equal(a.type, kind === 'lay' ? 'layup' : kind);
  const out = { ...counters(), release: null };
  ph.probe = (s, d, k, ball, action, contact) => {
    if (action !== a || d.off || d.stun > 0 || d.action?.type !== 'block' || d.z <= 0.18) return;
    assert.equal(k, kind);
    out.air = true;
    const dx = d.x - s.x, dy = d.y - s.y, dd = Math.hypot(dx, dy);
    const hx = hoop.x - s.x, hy = hoop.y - s.y;
    const legal = (d.action.chase && dd < gm.K.bChase) || (dd <= gm.K.bRange &&
      (dd <= 0.3 || (dx * hx + dy * hy) / (dd * Math.hypot(hx, hy)) >= gm.K.bFront));
    if (legal) out.range = true;
    if (contact(d, ball)) {
      out.hand = true;
      if (legal) out.contactInRange = true;
    }
  };
  ph.judge = (k) => {
    assert.equal(k, kind);
    out.judged = true;
    out.heldJudgment = !a.released && !a.done;
  };
  for (let frame = 0; frame < 100; frame++) {
    gm.tick(dt, p => p === sh ? (a.inSteps || a.t + 1e-9 < a.ideal ? held : input) : frame === pressFrame ? held : input);
    if (frame === pressFrame) out.pressed = df.action?.type === 'block';
    if (out.release == null && (a.released || a.done)) out.release = frame;
    if (out.release == null && sh.action !== a) { out.aborted = true; break; }
    if (a.blocked || (out.release != null && (kind === 'dunk' || !G.ball.shot || G.ball.vz <= 0))) break;
  }
  assert(out.aborted || out.release != null, `attempt stuck: ${kind} ${pair} ${position} seed=${seed} press=${pressFrame}`);
  out.blocked = !!a.blocked;
  assert(!out.blocked || out.judged, 'credited block must enter judgment');
  return out;
}

function sweep(base, profile) {
  const ph = load(base, profile);
  const pairs = [['jordan', 'davis'], ['kobe', 'giannis'], ['lebron', 'jordan']];
  const results = Object.fromEntries(groups.map(k => [k, Object.fromEntries(offsets.map(o => [o, counters()]))]));
  for (const kind of kinds) {
    for (const pair of pairs) for (const seed of [1, 3, 5, 7, 9, 11]) {
      for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) for (const y of [0.55, 0.85, 1.15, 1.45]) {
        const args = [ph, kind, [x, y], pair, seed];
        const reference = attempt(...args);
        if (reference.aborted) continue;
        for (const o of offsets) {
          const frame = reference.release + o;
          if (frame < 0) continue;
          const out = attempt(...args, frame);
          const rows = [results[kind][o]];
          if (kind === 'lay') rows.push(results[seed % 4 === 1 ? 'driving lay' : 'standing lay'][o]);
          for (const row of rows) {
            row.total++;
            for (const k of Object.keys(row)) if (k !== 'total') row[k] += +out[k];
          }
        }
      }
    }
  }
  return { tuning: Object.fromEntries(['bRange', 'bFront', 'bChase', 'bShot', 'bLay', 'bDunk'].map(k => [k, ph.game.K[k]])), results };
}

function report(label, profile, { results, tuning }) {
  console.log(`${label} ${profile}: ${JSON.stringify(tuning)}`);
  for (const kind of groups) {
    const rows = Object.values(results[kind]), sum = k => rows.reduce((acc, row) => acc + row[k], 0);
    const percent = (a, b) => (100 * a / (b || 1)).toFixed(1) + '%';
    console.log(`  ${kind}: judgment ${sum('judged')}/${sum('total')} (${percent(sum('judged'), sum('total'))}); pre-release ${sum('heldJudgment')}; blocked given judgment ${sum('blocked')}/${sum('judged')} (${percent(sum('blocked'), sum('judged'))}); airborne/range/hand/legal contact ${['air', 'range', 'hand', 'contactInRange'].map(sum).join('/')}`);
  }
}

const runs = {};
for (const [label, base] of [['before', process.env.BLOCK_BASE], ['after', null]]) {
  if (label === 'before' && !base) continue;
  runs[label] = {};
  for (const [name, profile] of [['default', null], ['C1', c1]]) {
    const data = runs[label][name] = sweep(base, profile);
    report(label, name, data);
  }
}
const settings = ['lay', [-0.3, 0.85], ['jordan', 'davis'], 1];
const ph = load(null, c1);
const pressFrame = attempt(ph, ...settings).release - 15;
const early = attempt(ph, ...settings, pressFrame);
assert(early.pressed && early.contactInRange && early.heldJudgment, 'an early human jump against a driving C1 layup must reach the held ball and enter judgment');
if (process.env.BLOCK_BASE) {
  const old = attempt(load(process.env.BLOCK_BASE, c1), ...settings, pressFrame);
  console.log(`C1 driving layup, jump 250 ms early: before range=${!!old.range}, hand contact=${!!old.hand}, judgment=${!!old.judged}; after held-ball judgment=${early.heldJudgment}`);
}
console.log('PASS C1 early human block input enters pre-release driving layup judgment through real hand contact');
if (process.env.BLOCK_JSON) fs.writeFileSync(process.env.BLOCK_JSON, JSON.stringify({ offsets, runs }));
