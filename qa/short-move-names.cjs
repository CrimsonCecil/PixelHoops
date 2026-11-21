const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
ctx.window = ctx;
for (const name of ['tune', 'render', 'roster', 'r5', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ctx);
}
const short = ctx.PH.shortMoveText;
for (const [old, name] of Object.entries(ctx.PH.shortMoves)) {
  assert.equal(short(old), name);
  assert.match(name, /^[\u4e00-\u9fff]{2,3}$/);
  assert.equal(short(name), name);
}
assert.equal(short('长距离起跳 · 风车扣篮'), '远扣');
assert.equal(short('后撤步跳投命中'), '后撤投');
assert.equal(short('背后后撤步 · 连招 ×8'), '背后撤');
assert.equal(short(''), '');
assert.equal(short(null), null);
assert.equal(short(undefined), undefined);
assert.equal(short('未知动作'), '未知动作');
assert.equal(ctx.PH.game.ARCH.curry.skill.name, '夜夜晚安');
console.log('PASS: short move map, compound labels, empty/invalid input and canonical gameplay names.');
