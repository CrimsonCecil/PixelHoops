# McGrady / Nash / Hamilton signatures

Run `node qa/legends-tmac-nash-rip.cjs` (includes `legend-skills.cjs`).
All new gameplay magnitudes are registered as `l1_lg*` in PH.TUNE / 调参台.
Shot bonuses are 4pp / 3.5pp before contest scaling, with a 96% skill-shot
ceiling, including perfect timing. These use ordinary shot/block resolution,
not the legacy legendary-shot contest/block bypass.

## Recording McGrady and Hamilton

Open index.html, click the first player's 更换, choose 麦迪 or 汉密尔顿,
then click the gold 必杀技 card in the picker. This opens the existing real-input
demonstration system. It loops; neither new demo forces a make.

Equivalent console calls from the main menu (use either key):

```js
const key = 'tmac'; // or 'rip'
document.querySelector('#pick0').click();
document.querySelector('[data-pk="' + key + '"]').click();
document.querySelector('[data-ptip="sk-' + key + '"]').click();
window.resumeRealtime();
```

For deterministic frames, call `advanceTime(100)` until
`PH.game.G.stats[0].sk > 0`. The cut-in, LED, meter label and normal shot
feedback are visible. `PH.game.tipsStart('sk-tmac')` /
`PH.game.tipsStart('sk-rip')` also restart the scenario once in demo view.

In ordinary 1V1/training play:

- McGrady: outside 3.5m, perform an existing hesitation/crossover or pump fake,
  then shoot a non-fade pull-up within 1.1s. Leave the gather-hand side open.
  The skill uses the pull-up form, zero backward/lateral shot movement and
  zero form lean/kick, 0.88 release-time multiplier and 1.08 jump multiplier.
- Hamilton: at the elbow/midrange (3.5–6.2m, within 3.8m of court center,
  inside the arc), sprint at least 4.5m/s for 0.3s, then stop and shoot within
  0.65s without a dribble move. A defender within 1.35m cancels it.
  His three rating remains 0.81.
- Team Hamilton: use F as an off-ball teammate to screen his pursuing
  defender, cut at least 0.65m off that contact into the same midrange area,
  catch within 3s and shoot within 0.65s without dribbling. Close/switch
  coverage at the catch cancels the bonus even if that defender later leaves.

## Recording Nash in 3V3 (real screen and pass input)

Select 3V3 and start a match first. The following console fixture stages
the players before recording, uses the normal screen input/contact code,
then moves into the passing setup and uses the normal pass input. It never
sets skill-ready flags, skill cooldowns or a pass's skill/kind.

```js
advanceTime(1); // manual frames, no background simulation
const gm = PH.game, G = gm.G, A = gm.t5, T3 = PH.T3;
T3.start({
  slots: ['nash', 'shaq', 'tmac', 'kobe', 'giannis', 'curry']
    .map(arch => ({ arch, role: 'human' })),
  local: 0, replay: false
});
Object.assign(G, {
  time: 5, phase: 'live', needClear: false, off: 0, chk: null, intro: null
});
const [p, s, q, d, e, f] = G.players;
for (const a of G.players) Object.assign(a, {
  x: 6, y: 1, action: null, hasBall: false, stun: 0,
  z: 0, vx: 0, vy: 0, speed: 0
});
Object.assign(p, { x: 0, y: 5, hasBall: true, face: Math.PI / 2 });
Object.assign(s, { x: 0.79, y: 7 });
Object.assign(d, { x: 0, y: 7 });
Object.assign(e, { x: 4, y: 8 });
T3.T.marks = new Map([[d, p], [e, s], [f, q]]);
T3.T.swap = T3.T.cover = null;
T3.T.defTeam = 1;
Object.assign(G.ball, {
  state: 'held', holder: p.id, x: p.x, y: p.y, z: 1, dead: false
});
const z = () => A.zeroInp();
T3.tick(1 / 60, { 1: { ...z(), screen: true } });
for (let n = 0; n < 8; n++) T3.tick(1 / 60, {});
Object.assign(d, { x: 0.23, y: 7, vx: 3 });
T3.tick(1 / 60, { 3: { ...z(), mx: 1, sprint: true } });
console.assert(p.sk.screen, 'screen contact recorded');
Object.assign(p, { x: 0, y: 6, vx: 0, vy: 0 });
Object.assign(s, { x: 0, y: 8, vx: 0, vy: 2 });
Object.assign(d, { x: -1, y: 6.5, stun: 0 });
Object.assign(e, { x: 1, y: 6.5, stun: 0 });
Object.assign(G.ball, { x: p.x, y: p.y, z: 1 });
// Start recording here: ordinary pass is automatically converted.
T3.tick(1 / 60, {
  0: { ...z(), mx: 0, my: 1, pass: true },
  1: { ...z(), my: 1, sprint: true }
});
advanceTime(100);
console.assert(T3.T.pass?.kind === 'bounce');
console.assert(G.cutin?.skill === '太阳口袋传');
// advanceTime(16.667) for individual flight frames; resumeRealtime() to continue.
```

Normal gameplay: select Nash as the handler, use teammate F screens / CPU
ball screens, move at least 0.5m after the screen contacts his defender,
draw two nearby defenders (within 2.8m, opposite sides of the passing lane),
then aim the pass at the rolling screener (at least 0.5m/s toward the hoop)
within 3s. Nash's pocket skill has no 1V1 substitute.

The same screen-contact / rolling-target gate is used by 5V5's normal
`PH.T5.doPass(p, screener, 'chest')` path. Per step 1, these legends are
not added to real 5V5 rosters; the 5V5 QA installs a legend into its fixture.
Nash's pass still follows normal windup/flight, badge and interception code.
