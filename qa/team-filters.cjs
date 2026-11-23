const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const nodes = new Map();
const ctx = vm.createContext({ $: (id) => {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: '', classList: { add() {}, toggle() {} } });
  return nodes.get(id);
} });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(root, 'js/roster.js'), 'utf8'), ctx);
ctx.GM = { NBA: { ...ctx.PH.RX.teams, LEG: { name: '传奇' } } };
vm.runInContext(source.slice(source.indexOf("  let pkTeam ="), source.indexOf('  function pkFill()')), ctx);
const conferences = vm.runInContext('PK_CONFERENCES', ctx);
assert.equal(Object.keys(conferences).length, 2);
Object.values(conferences).forEach((teams) => assert.equal(teams.length, 15));
const teams = Object.values(conferences).flat();
assert.equal(new Set(teams).size, 30, 'each NBA team belongs to exactly one conference');
assert.deepEqual([...teams].sort(), Object.keys(ctx.PH.RX.teams).filter((k) => k !== 'LEG').sort(), 'conference rows cover the actual roster');
assert.ok(conferences['东部'].includes('BOS') && conferences['西部'].includes('LAL'));
for (const team of teams) {
  const svg = fs.readFileSync(path.join(root, 'assets/teams', team + '.svg'), 'utf8');
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /<script|<foreignObject|\b(?:href|src)=["'](?:https?:)?\/\//i);
}
for (const selected of ['LEG', 'rook', 'all', 'BOS', 'LAL']) {
  vm.runInContext(`pkTeam = '${selected}'; pkTeams();`, ctx);
  const html = nodes.get('pk-teams').innerHTML;
  const buttons = [...html.matchAll(/<button\b[^>]*data-tm="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(buttons.length, 33, '30 teams plus all, legends and rookies');
  assert.equal((html.match(/<img /g) || []).length, 30);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(buttons.find((b) => b[1] === selected)[0], /aria-pressed="true"/);
  assert.deepEqual(buttons.filter((b) => b[2].includes('★')).map((b) => b[1]), ['LEG']);
}
vm.runInContext("pkPositions.add('SG'); pkPositions.add('SF'); pkPositionChips();", ctx);
const positions = nodes.get('pk-positions').innerHTML;
assert.equal((positions.match(/aria-pressed="true"/g) || []).length, 2, 'position filters stay multi-select');
console.log('PASS: 30 unique conference teams, local logo safety/availability, legend-only star, filter states and multi-select positions');
