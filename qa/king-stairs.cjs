const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const ladder = ['one', 'two', 'three', 'four', 'five'];
const list = { innerHTML: '', querySelectorAll: () => [] };
const lives = { innerHTML: '' };
let saved = null;
const ctx = vm.createContext({
  GM: { ARCH: Object.fromEntries(ladder.map((key, i) => [key, { name: 'Player-' + key, full: 'Full-' + key, ovr: 70 + i * 5 }])) },
  opts: { arch0: 'me', kreveal: 'hide' }, kingLadder: ladder, KING_LIVES: 3,
  kingSaved: () => saved, kingRoll: () => assert.fail('existing ladder should be retained'),
  kingLives: (n) => 'lives:' + n, show() {}, $: (id) => id === 'lk-list' ? list : lives
});
vm.runInContext(source.slice(source.indexOf('  function kingLadderView()'), source.indexOf('  const KING_LIVES =')), ctx);
const render = () => { ctx.kingLadderView(); return list.innerHTML; };
let html = render();
assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
assert.match(html, /king-rung-1" aria-current="step"/);
assert.equal((html.match(/class="lk-mystery"/g) || []).length, 5);
assert.doesNotMatch(html, /<canvas|Player-|Full-|<em>/, 'mystery opponents reveal no identity, portrait or numbered labels');
for (let stage = 0; stage < 5; stage++) {
  saved = { ladder, stage, retry: 0, open: false, lives: 2 };
  html = render();
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(html.includes('king-rung-' + (stage + 1) + '" aria-current="step"'));
  assert.equal((html.match(/<canvas/g) || []).length, stage, 'only defeated opponents are revealed');
  assert.equal((html.match(/class="lk-defeated"/g) || []).length, stage);
  assert.equal(lives.innerHTML, 'lives:2');
  saved.retry = 1;
  assert.equal((render().match(/<canvas/g) || []).length, stage + 1, 'retry reveals the current opponent');
}
saved.open = true;
assert.equal((render().match(/<canvas/g) || []).length, 5, 'show-opponents setting is preserved');
console.log('PASS: five hidden silhouettes, one current arrow, no numbered labels, progress/retry reveals and lives');
