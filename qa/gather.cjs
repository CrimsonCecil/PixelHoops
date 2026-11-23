const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(opts = {}) {
  const listeners = {};
  const ctx = vm.createContext({ navigator: { getGamepads: () => [] }, performance: { now: () => 0 },
    setTimeout() {}, addEventListener: (name, cb) => { listeners[name] = cb; } });
  ctx.window = ctx;
  for (const name of ['tune', 'render', 'input', 'roster', 'r5', 'game', 'b5', 'team5', 'team3'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), ctx);
  const gm = ctx.PH.game;
  gm.seed(7);
  gm.newGame({ mode: '2p', arch0: opts.arch || 'luka', arch1: 'joe', travel: opts.travel !== false });
  gm.t5.checkStep(9);
  const G = gm.G, b = G.ball, p = G.players[0], d = G.players[1];
  Object.assign(G, { phase: 'live', needClear: false, fb: 'simple', off: 0 });
  Object.assign(p, { x: 0, y: 6.8, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, action: null, stun: 0, cd: 0, stam: 100 });
  Object.assign(d, { x: 3, y: 8, off: false, hasBall: false, stun: 30 });
  if (opts.r) Object.assign(p.r, opts.r);
  const key = (code, down = true) => listeners[down ? 'keydown' : 'keyup']({ code, preventDefault() {} });
  const step = (n = 1) => { for (let i = 0; i < n; i++) gm.tick(1 / 120); };
  const tap = (code) => { key(code); step(); key(code, false); step(); };
  const settle = () => { for (let i = 0; i < 240 && p.action; i++) step(); p.cd = 0; };
  return { gm, G, b, p, d, key, step, tap, settle };
}

// 接球（发球）后进入合球：双手抱球，不运球
{
  const { p, b, step } = fixture();
  assert.equal(p.hasBall, true); assert.equal(p.gather, true); assert.equal(p.dribDead, false);
  step(60);
  assert.equal(p.gather, true); assert.equal(p.catchDribbled, false, '合球时不运球');
  const mid = { x: b.x, z: b.z }; assert.ok(mid.z > 0.6, '球抱在腰前，不在地上');
}

// 合球推左摇杆 = 开始运球（唯一一次）
{
  const { p, key, step } = fixture();
  key('KeyW'); step(40); key('KeyW', false); step(30);
  assert.equal(p.gather, false); assert.equal(p.catchDribbled, true);
}

// 试探步：中枢脚不动、能接爆发突破，爆发速度随速度 / 加速提升
{
  const go = (r) => {
    const { p, tap, key, step, settle } = fixture({ r });
    const y0 = p.y; tap('KeyL');
    assert.equal(p.action.type, 'move'); assert.equal(p.action.kind, 'jab'); assert.equal(p.gather, true);
    settle(); assert.ok(Math.hypot(p.y - y0, p.x) < 0.05, '试探步不移动中枢脚');
    key('KeyW'); tap('KeyL'); key('KeyW', false);
    assert.equal(p.action.kind, 'jabgo'); assert.equal(p.gather, false);
    return p.action.sp;
  };
  const lo = go({ spd: 0.45, acc: 0.45 }), hi = go({ spd: 0.95, acc: 0.95 });
  assert.ok(hi > lo * 1.3, `高能力爆发更大 ${lo.toFixed(2)} → ${hi.toFixed(2)}`);
  assert.ok(hi > 8, '试探步爆发第一步明显快于普通变向');
}

// 运过球后假投 → 回到合球（死球），可继续假投 / 试探步；再运球判二次运球、拖步判走步，走攻防转换
for (const [what, act, call] of [['再运球', 'jabgo', '二次运球'], ['拖动中枢脚', 'walk', '走步']]) {
  const { G, p, key, step, tap, settle } = fixture();
  key('KeyW'); step(40); key('KeyW', false); step(20); assert.equal(p.catchDribbled, true);
  tap('KeyJ'); assert.equal(p.action.type, 'fake'); settle();
  assert.equal(p.gather, true); assert.equal(p.dribDead, true);
  tap('KeyJ'); assert.equal(p.action.type, 'fake', '合球后可再假投'); settle();
  tap('KeyL'); assert.equal(p.action.kind, 'jab', '死球合球仍可试探步'); assert.equal(G.off, 0);
  if (act === 'jabgo') { key('KeyW'); tap('KeyL'); key('KeyW', false); step(60); }
  else { settle(); key('KeyW'); step(60); key('KeyW', false); }
  assert.equal(G.off, 1, what + '后球权转换');
  assert.equal(G.phase, 'check'); assert.equal(G.banner.text, call); assert.equal(G.banner.foul, true, '走犯规转场');
  assert.equal(G.stats[0].tov, 1);
}

// 设置关闭：不吹走步 / 二次运球，运过球后合球仍可再运球
{
  const { G, p, key, step, tap, settle } = fixture({ travel: false });
  assert.equal(G.travel, false);
  key('KeyW'); step(40); key('KeyW', false); step(20);
  tap('KeyJ'); settle(); assert.equal(p.gather, true); assert.equal(p.dribDead, false);
  key('KeyW'); step(60); key('KeyW', false);
  assert.equal(G.off, 0); assert.equal(G.phase, 'live'); assert.equal(p.gather, false);
}

// 电脑同一套规则：死球合球不走动，只投 / 传 / 假投
{
  const { gm, G, p, key, step, tap, settle } = fixture();
  key('KeyW'); step(40); key('KeyW', false); step(20); tap('KeyJ'); settle();
  assert.equal(p.dribDead, true);
  p.ctrl = 'cpu';
  for (let i = 0; i < 30; i++) { const o = gm.aiInput ? gm.aiInput(p, 1 / 120) : null; if (!o) break; assert.equal(o.mx, 0); assert.equal(o.my, 0); }
  for (let i = 0; i < 400 && G.phase === 'live' && p.hasBall; i++) step();
  assert.notEqual(G.banner && G.banner.text, '走步'); assert.notEqual(G.banner && G.banner.text, '二次运球');
}
console.log('gather ok');
