const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const main = fs.readFileSync(require('node:path').join(__dirname, '../js/main.js'), 'utf8');
const ctx = vm.createContext();
vm.runInContext(main.slice(main.indexOf('  const pkPositions ='), main.indexOf('  function pkPositionChips()')) + '\nthis.positions = playerPositions;', ctx);
for (const [pos, expected] of [['PG/SG', ['PG', 'SG']], ['小前锋/大前锋', ['SF', 'PF']], ['后卫', ['PG', 'SG']], ['前锋', ['SF', 'PF']], ['中锋', ['C']], ['', []], [undefined, []], ['unknown', []]]) {
  assert.deepEqual(Array.from(ctx.positions({ pos })), expected);
}
console.log('PASS: position parsing covers Chinese labels, multiple positions, broad roles, empty and unknown data.');
