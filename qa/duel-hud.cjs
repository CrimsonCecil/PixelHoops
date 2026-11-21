const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const G = {};
const context = vm.createContext({ G, AT_CLOSE: ['close', '内线'], GM: { hcMod: (p) => p.heat || 0 }, A99: (v) => Math.round(v * 99), vcl: () => 'rating' });
vm.runInContext(src.slice(src.indexOf('  const PC_SPEED'), src.indexOf('  function cardHTML')), context);

const r = { three: .88, mid: .79, close: .72, lay: .81, dunk: .64, flo: .75, post: .69, hnd: .94, spd: .87,
  def: .75, intD: .58, str: .62, stl: .72, blk: .35, lat: .76, oreb: .32, dreb: .44 };
const pl = { r, r5: { raw: { pac: 95, hlp: 91 } }, tendency: { accuracy: .92, vision: .81, passIQ: .86 } };
const render = (off, is5) => context.pcRatings(pl, off, is5);
const names = (html) => [...html.matchAll(/<span>([^<]+)<i/g)].map((m) => m[1]);

for (const mode of ['cpu', '2p']) {
  G.mode = mode;
  assert.deepEqual(names(render(true)), ['三分', '中投', '内线', '上篮', '扣篮', '抛投', '背打', '控球', '速度']);
  assert.deepEqual(names(render(false)), ['外防', '内防', '力量', '抢断', '盖帽', '横移', '前板', '后板', '速度']);
  for (const off of [true, false]) assert.doesNotMatch(render(off), /—/, 'all duel cells have real ratings');
}

G.mode = 'cpu';
pl.rBase = r;
pl.r = { ...r, post: .89, str: .67 };
pl.heat = -.05;
assert.match(render(true), /背打<i class="rating up">88<sup>↑20/);
assert.match(render(false), /力量<i class="rating up">66<sup>↑5/);
assert.match(render(true), /三分<i class="rating dn">82<sup>↓5/);

G.mode = 't3';
assert.deepEqual(names(render(true)), ['三分', '中投', '扣篮', '上篮', '控球', '速度', '传球', '视野', '传球智商']);
assert.deepEqual(names(render(false)), ['外防', '内防', '抢断', '盖帽', '后板', '速度', '传球', '视野', '传球智商']);
G.mode = 't5';
assert.match(render(true, true), /传球<i class="rating">95/);
assert.match(render(false, true), /协防<i class="rating">91/);
G.mode = 'train';
assert.equal(names(render(true)).length, 6);
assert.equal(names(render(false)).length, 6);
console.log('PASS: duel rating grids, rating deltas, and unchanged 3V3, 5V5, and training cards');
