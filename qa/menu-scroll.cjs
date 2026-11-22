const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the production scroll-routing function with independent pane geometry.
const source = fs.readFileSync(__dirname + '/../js/main.js', 'utf8');
const begin = source.indexOf('  function scrollBox(');
const end = source.indexOf('\n  let adj =', begin);
assert.ok(begin >= 0 && end > begin);
const context = vm.createContext({
  NAV_SCROLL: { picker: '#pk-detail' },
  getComputedStyle: (el) => ({ overflowY: el.overflowY })
});
vm.runInContext(source.slice(begin, end), context);
const scrollBox = context.scrollBox;

function pane(id, { height = 100, content = 100, top = 0, overflow = 'auto', focused = false, visible = true } = {}, children = []) {
  const el = { id, clientHeight: height, scrollHeight: content, scrollTop: top, overflowY: overflow, focused, children,
    // Fixed-position elements have no offsetParent but still have layout rectangles.
    offsetParent: null, getClientRects: () => visible ? [{}] : [],
    querySelectorAll: () => children.flatMap((child) => [child, ...child.querySelectorAll('*')]),
    querySelector: (selector) => el.querySelectorAll('*').find((child) => selector === '.pf' ? child.focused : '#' + child.id === selector) || null
  };
  children.forEach((child) => { child.parentElement = el; });
  return el;
}

const player = pane('player', { focused: true });
const roster = pane('front-grid', { content: 1000 }, [player]);
const filter = pane('filter');
const menu = pane('menu', { height: 400, content: 1200 }, [filter, roster]);
assert.equal(scrollBox(menu, 1), roster, 'focused roster consumes input before the page');
roster.scrollTop = 900;
assert.equal(scrollBox(menu, 1), menu, 'roster boundary chains to overflowing menu');
menu.scrollTop = 800;
assert.equal(scrollBox(menu, 1), null, 'both containers clamp at their lower boundary');
assert.equal(scrollBox(menu, -1), roster, 'reverse input returns to focused roster');
player.focused = false; filter.focused = true; menu.scrollTop = 0; roster.scrollTop = 0;
assert.equal(scrollBox(menu, 1), menu, 'focus outside roster scrolls fixed page, not unrelated list');
menu.scrollTop = 800;
assert.equal(scrollBox(menu, 1), null, 'outside focus never hands input to unrelated roster');

const badges = pane('badges', { content: 200 });
const fighter = pane('fighter', { focused: true }, [badges]);
const fighterMenu = pane('menu', { height: 400, content: 1200 }, [fighter]);
assert.equal(scrollBox(fighterMenu, 1), badges, 'focused card exposes nested badges');
badges.scrollTop = 100;
assert.equal(scrollBox(fighterMenu, 1), fighterMenu, 'badge boundary chains to page');

const selected = pane('selected', { focused: true });
const modalRoster = pane('pk-grid', { content: 1000, top: 300 }, [selected]);
const details = pane('pk-detail', { height: 300, content: 1030 });
const body = pane('pk-body', { overflow: 'visible' }, [modalRoster, details]);
const picker = pane('picker', { overflow: 'hidden' }, [body]);
for (const top of [0, 300, 730]) {
  details.scrollTop = top;
  for (const direction of [-1, 1]) assert.equal(scrollBox(picker, direction), details, 'overflowing details own input at either edge');
}
details.scrollHeight = details.clientHeight; details.scrollTop = 0;
assert.equal(scrollBox(picker, 1), modalRoster, 'short Random details do not swallow roster input');
assert.equal(scrollBox(picker, -1), modalRoster, 'non-overflowing details allow reverse roster input');
details.overflowY = 'visible'; modalRoster.overflowY = 'visible';
body.overflowY = 'auto'; body.scrollHeight = 1000; body.clientHeight = 300;
assert.equal(scrollBox(picker, 1), body, 'compact details use their shared scrolling parent');

console.log('PASS: menu, focused roster/badges, fixed roots, details boundaries, Random and compact scrolling');
