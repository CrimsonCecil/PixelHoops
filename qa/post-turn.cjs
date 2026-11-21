const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const c = vm.createContext({ console, performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {}, addEventListener() {} });
c.window = c;
vm.runInContext('Math.random = () => 0.5', c);
for (const name of ['tune', 'ptype', 'render', 'roster', 'measurements', 'r5', 'game']) {
  let source = fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8');
  if (name === 'game') source = source.replace('PH.game = {', 'PH.turnQA = { updatePlayer }; PH.game = {');
  vm.runInContext(source, c, { filename: name + '.js' });
}
const { game: gm, turnQA: qa } = c.PH, G = gm.G, hoop = c.PH.render.HOOP;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dt = 1 / 60;

function followShot(key, side, turns = 0) {
  gm.newGame({ mode: '2p', arch0: key, arch1: 'gobert', target: 999 });
  gm.seed(7);
  const [p, d] = G.players;
  Object.assign(G, { phase: 'live', needClear: false, time: 10 });
  Object.assign(p, { x: -side * 1.328, y: 10.809, z: 0, face: Math.PI / 2 - side * (8.178 - Math.PI * 2 - Math.PI / 2) + turns * Math.PI * 2,
    vx: 0, vy: 0, speed: 0, post: false, hasBall: true, action: null, stam: 88.824,
    postMove: { kind: 'postspin', side, t: G.time - 0.75 } });
  Object.assign(d, { x: -6, y: 1, off: true, hasBall: false });
  Object.assign(G.ball, { state: 'held', holder: p.id, dead: false });
  gm._dbg.startShot(p, gm.t5.zeroInp(), 'a1');
  const a = p.action;
  assert.equal(a.v, 'spinfade');
  assert.equal(a.stride.kind, 'Spin');
  const trace = [];
  while (a.t < a.stride.T + 0.15) {
    G.time += dt;
    qa.updatePlayer(p, { ...gm.t5.zeroInp(), a1: true }, dt);
    trace.push({ t: +a.t.toFixed(3), face: +p.face.toFixed(3), body: +(p.face + (p.pose.yaw || 0)).toFixed(3) });
  }
  if (process.env.POST_TURN_TRACE && key === 'barkley' && side === -1 && !turns) console.log(JSON.stringify(trace));
  const angles = trace.map(f => f.face), travel = angles.reduce((sum, v, i) => sum + (i ? Math.abs(wrap(v - angles[i - 1])) : 0), 0);
  const correction = Math.abs(wrap(angles.at(-1) - angles[Math.ceil(a.stride.T / dt) - 2]));
  assert(travel < 2.2, `${key} side=${side}: a completed postspin must not add another half-turn and unwind (${travel.toFixed(3)}rad)`);
  assert(correction < 0.25, `${key} side=${side}: stride/shot facing must agree (${correction.toFixed(3)}rad correction)`);
  assert(Math.abs(wrap(p.face - Math.atan2(hoop.y - p.y, hoop.x - p.x) - side * 0.5)) < 0.01);
}

for (const key of ['barkley', 'luka', 'jokic', 'kobe']) for (const side of [-1, 1]) for (const turns of [0, -2, 2]) followShot(key, side, turns);
console.log('PASS post turnaround: completed-spin follow-ups align with the shot without another half-turn or unwind, both sides and wrapped facings');
