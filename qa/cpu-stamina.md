# CPU stamina parity audit

## Result

Audited stamina references across `js/*.js`, including all writes to player/roster stamina, all action-cost callers, controller dispatch, recovery, fatigue and substitutions. **No competitive CPU-only stamina discount, recovery multiplier, stamina floor, or cost bypass was found on main.** The initial consolidation (`0096fbb`) passed the same-input regression against main with identical output. The subsequent C1 investigation below found a behavioral recovery asymmetry missed by same-input comparisons: scripted dribbling with a neutral movement stick received standing recovery. The shared recovery classifier now includes physical movement and active dribble moves, without changing costs, rates, training options or AI decisions.

The initial default-profile simulation reached CPU stamina minima of 66.00 in 1V1, 57.11 in 5V5, and 76.60 in 3V3. That established CPU costs existed, but did not establish equivalent recovery during human/AI movement. C1 was subsequently fetched GET-only and is reproduced below. Browser visuals and the owner's exact live input sequence remain unchecked.

Shared recovery is fast: defaults give 21.84 points/second standing and 10.92 moving, with additional recovery below 30 stamina. Recovery still runs during actions when not sprinting/backing down. Possession resets add 25 in 1V1 and 15 in 3V3. These rates and resets are preserved; only the asymmetric movement classification is corrected.

## Audit table

Line numbers refer to this branch. `C = ST.cost` (default 0.8), `S = stamK(player)` (stamina rating and motor badge), `R = CFG.stamRegen` (default 1.68). All costs clamp to zero. All short-term recovery clamps to 100. CPU before/after comparisons assume identical attributes, badge tiers, actions, contact geometry and tuning, not different roster players.

| Cost/recovery site | File:line | Human rule | CPU before | CPU after |
|---|---|---|---|---|
| Creation/new game | `js/game.js:1765` | Start at 100 | Same | Same |
| Duel possession/check reset | `js/game.js:1943` | Recover 25, cap 100 | Same | Same |
| Impact: finishing, block, sprint bump, post/low-speed push | `js/game.js:2114–2116` | `(2.2 + 4.8*intensity) * lossFactor * C * S * fatigueScale * scale`; lossFactor 1.4 losing / 0.75 otherwise | Same shared `bodyCost` | Same, shared drain |
| Jump shot release (not windup/fake) | `js/game.js:2810` | `stShotCost * C` (2.4 default) | Same | Same, shared drain |
| Post stride gather | `js/game.js:3278` | `poStrideCost * C * S` | Same | Same, shared drain |
| Gather-step spin layup | `js/game.js:3422` | Extra `4 * C` | Same | Same, shared drain |
| Layup / euro / hop / floater | `js/game.js:3531` | `(euro/hop ? 8 : 5) * C` | Same | Same, shared drain |
| Dunk, including alley-oop/self-alley finish | `js/game.js:3617,6888–6901` | `9 * C`; alley calls shared dunk/finish functions | Same | Same, shared drain |
| Post fake | `js/game.js:4032` | `poFakeCost * C` (default 0) | Same | Same, shared drain |
| Dribble: cross, spin, hesi, inout, stepback, post drop/face/shimmy, chains/signatures | `js/game.js:4050–4158` | `moveCost * move.cost * combo/chain modifiers * tight badge * takeover * S`; post costs included in move.cost | Same `startMove`, no CPU cost branch | Same, shared drain |
| Block/rebound jump | `js/game.js:4322` | `bkCost * C` (4.8 default) | Same | Same, shared drain |
| Steal/poke attempt | `js/game.js:4338` | `stlCost * C` (2.4 default) | Same | Same, shared drain |
| Dive | `js/game.js:4363` | `dvCost * C * hustle badge` | Same `startDive`; HUD prompt alone is human-only | Same, shared drain |
| Sprint on/off ball, offense/defense | `js/game.js:5034–5039` | `sprintDrain * S * takeover * dt`; needs movement, no action/post, stamina >3 | AI emits `sprint`; same gate and drain | Same, shared drain |
| Moving post-up | `js/game.js:5043` | `5.5 * C * S * dt` while moving/not stuck | Same | Same, shared drain |
| Idle/moving/post recovery | `js/game.js:5041–5045` | `(post ? stRgPost : recoveringMoving ? stRgMove : stRgIdle) * lowStaminaBonus * R * dt`; delayed after pressure | Same formula, but neutral-stick AI dribble got idle rate | Physical speed >=0.7 or active dribble also counts as moving, for either controller; stationary stance remains idle |
| Continuous collision pressure, both players | `js/game.js:6584–6587` | Penetration/speed-based `bdStam/60 * strengthRatio * C * S`; defender uses `resistCost` when pressed | Same | Same, shared drain |
| Defensive stance under contact | `js/game.js:2118,6587,6651–6661` | Defense multiplier * strength ratio * `(1 + bdStSt)`; post/low-speed push charges both via bodyCost | Same | Same |
| Explicit training infinite-stamina option | `js/game.js:2115,6587,6701` | Slot 0 is exempt from contact costs/restored to 100 when selected | Not a competitive CPU setting | Preserved explicit training option |
| Training dummy/demo contact exclusions | `js/game.js:2115,6584` | Dummy/demo do not pay contact costs; inactive players excluded | Training dummy exemption, not ordinary CPU | Preserved training/demo behavior |
| 3V3 possession reset | `js/team3.js:111` | Recover 15, cap 100 for all six | Same | Same |
| 3V3 live player actions/contact | `js/team3.js:454–458` | All six enter `game.t5.step` | Same, CPU input generators dispatch into shared update | Same |
| 5V5 player creation/substitution | `js/team5.js:399,562–577` | Copy live stamina to roster on exit; restore roster stamina on entry | Same | Same |
| 5V5 live fatigue cap | `js/team5.js:2344–2348` | Time/speed/durability-based long-term fatigue; cap `p.stam` at `100-r.fat` | Same all roster players | Same |
| 5V5 bench recovery | `js/team5.js:2349` | Reduce long-term fatigue with quarter-length/dead-ball scaling; `r.stam=100-r.fat` | Same | Same |
| 5V5 quarter break | `js/team5.js:2365` | Reduce fatigue by `t5_fat_qb`, restore available stamina | Same | Same |
| 5V5 live player actions/contact | `js/team5.js:2380–2385` | Human/CPU inputs both enter `game.t5.step` | Same | Same |

Passes, screens, ordinary movement, idle defensive stance, and non-post pump fakes have no separate short-term stamina charge for either controller. Up-and-under follows the shared move/shot/finish costs, not a CPU-only path. 5V5 screens/cuts and 3V3 screen movement still enter shared movement; actual collisions enter the shared collision cost. HUD/box/replay/online serialization only reads/copies stamina and adds no controller-specific refill.

## Low stamina and AI decisions

Shared `fat` (`game.js:4759`) reduces speed/acceleration and shooting accuracy. `fatOf`/`bodyPow` (`2105–2107`) reduce contact power. Shared gates prevent exhausted moves, dives, jumps and sprints; dunk/layup planning and dunk probability also use stamina. No AI-specific lower clamp was found.

Kept AI decision-only tuning: `ai_cb_stLo`, `ai_cb_stMin` (shorten/stop combos), `aiStyKpSt` (continue dribbling), `aiWDSt` (drive preference when tired), and 5V5 `t5_spr_d`/`l1_stLow` (choose whether to sprint). Hard-coded stamina reads also influence dunk, post finish, dive, combo and sprint choices in `aiInput`. These do not modify costs or regeneration. No CPU-only stamina cost/recovery TUNE key or corresponding slider existed to remove. Non-stamina CPU advantages elsewhere, such as timing/steal logic, were outside this stamina audit's edit scope.

## Regression

`node qa/cpu-stamina.cjs` compares identical human/CPU scenarios in real 1V1/5V5/3V3 fixtures: dribble, sprint, sustained exhaustion, defensive contact/post pressure, moving post, steal, jump, idle, inactive, recovery, zero-stamina action gates, fatigue and power. It instruments the shared drain without loading `input.js`. Separate 40-second autonomous samples exercise actual AI input dispatch and assert paid dribble/movement/contact actions, not just direct debug move calls.

`CPU_STAMINA_BASE=main node qa/cpu-stamina.cjs` audits pre-refactor behavior by instrumenting the original inline subtraction expressions with the mathematically identical helper. At the initial consolidation commit its deterministic output matched exactly. It no longer matches autonomous outcomes after correcting recovery classification; gross action costs remain unchanged.

Other QA run: stamina, chain-stamina, contact-stamina, stamina-hud, pushback, stance-crab, sprint-dribble-tiers, sprint-trail, dribble-combo, combo-window, hesitation, post-moves, post-turn, move-ratings, steal-timing, poke-steal, rebound-input, rebound-hold, up-and-under, double-clutch, contested-layups, layup-fumble, check-ball, 3v3, b3-badges, box3, and seeded block-contact.

Known existing failure: `qa/alley-oop.cjs:92`, `AssertionError [ERR_ASSERTION]: automatic layup/dunk must complete without input`. Reproduced with the unchanged `main:js/game.js` loaded into the same harness. It is not changed here.

## C1 live-profile follow-up

GET `https://pixelhoops-api.cecilcai322.workers.dev/api/profiles` returned default `pmwly6cz9cafb`, name `C1`, updated `1795265545.88`. Only GET was used; `qa/cpu-stamina-c1.json` is the complete returned C1 profile. `index.html` supplies this API base, and `cfgstore.js:138–141` selects the cloud default on a timely clean boot. A late request or pre-existing local overrides can prevent auto-selection; the owner's actual browser boot was not observed.

### Reachable cause and fix

1. `game.js:6686` dispatches CPU players through `aiInput`; humans through the input provider. `aiInputCore` initializes `zeroInp()`, then `if (a) return o` at line 6122 returns neutral movement during most active dribble frames (apart from occasional chain presses). Real C1 series before the fix recorded 95.16% / 96.25% neutral-input CPU dribble frames and 511 / 524 physically-moving neutral-input frames. The scripted human held direction throughout dribbles.
2. `updatePlayer` calls `updateAction` before recovery. The dribble action writes `vx/vy` around line 4647 independently of joystick direction. The former recovery branch classified only `Math.hypot(inp.mx, inp.my) > 0.1`. Thus a physically moving CPU dribble got standing recovery; a direction-held human dribble got moving recovery. A human releasing the stick had the same unintended advantage, disproving a CPU-only cost exemption.
3. C1 has `stRgIdle=18`, `stRgMove=8`, `stRgPost=10`; effective `stamRegen=1.68` is the unchanged default. This is **30.24/s idle versus 13.44/s moving**, not the default-profile 21.84/s idle. Over the matched 0.25s including the initiation frame, the extra recovery is 4.2 stamina.
4. Matched Kyrie crossover, start stamina 60, no opponent contact: gross charge **4.4813** for either controller/input. Before: released-stick net drop **-3.0787** (actually gained stamina), held-stick drop **1.1213**. After: both drop **1.1213**, final **58.8787**. Same cost and human direction-held behavior; no CPU tuning added. `CPU_STAMINA_BASE=0096fbb node qa/cpu-stamina-live.cjs` fails the new input-independent recovery assertion as expected.
5. Shared `recoveringMoving` uses input movement, physical speed >=0.7 (the existing stuck threshold), or an active dribble action. This also stops physical gliding/knockback receiving idle recovery solely because the input vector is neutral. Human neutral-stick scripted moves/gliding intentionally change by the same corrected rule. Sprint eligibility, post cost, pressure delay, low-stamina bonus and all rates remain unchanged. Idle, post, pressure-delayed and low-stamina recovery have explicit 1V1/5V5/3V3 tests.

This is a reproduced C1 simulation mechanism capable of hiding CPU dribble drains, not proof of the owner's particular rendered browser session. There is no evidence that CPU stamina is universally higher: the realistic games below actually have lower CPU overall mean stamina, because its decisions/action counts differ.

### C1 keys and difficulty

All C1 overrides load through the shared TUNE getters. Relevant explicit overrides: `l1_stRgIdle=18`, `l1_stRgMove=8`, `l1_stRgPost=10`, `l1_moveCost=10`, `l1_sprintDrain=10`, `l1_stlCost=10`, `l1_bkCost=15.1`, `l1_bdStam=7`, `l1_bdStSt=0.65`, `l1_bdPressCost=0.4`, `l1_cbCost=0.3`, `l1_uuCost=0.38`, `l1_sprintSp=1.4`, `l1_speedMul=0.9`. None selects controller-specific cost/recovery values. Remaining C1 overrides affect movement/finishing/contact geometry, success or rendering rather than a CPU stamina account. No CPU-only stamina multiplier/slider was found.

`diffOf` (`game.js:1935`) selects `pl.D` or `DIFF[G.diff]`; `newGame` installs `cpuD` on `players[1].D` (`1839`). King-of-the-Court (`main.js:466–472,587`) interpolates only lag, reaction, bite, steal, timing, move-bite and open-shot fields. These affect actions/timing, hence indirectly the elapsed recovery/actions chosen, not per-player stamina rates or costs. The matched test exercises ordinary difficulties 0/1/2 and all five actual `kingD` configurations, asserting the real `newGame(cpuD)` assignment on player 1 and identical gross/net crossover results.

### Defense and HUD: no separate defect reproduced

`collide` identifies handler/defender by possession, not controller or attacker ID. `pressing` uses relative physical velocity; it sets **both** `ctT` values to `G.time` and charges both participants. `bodyCost` and post/low-speed pressure also use shared costs. Idle stance is legitimately idle if there is no motion/contact pressure; there is no stance-only cost for either controller. Under sustained identical C1 pressure over 10s, human and CPU defenders both have minimum **25.5199**, mean **63.1543**, final **25.3371**. This disproves a blanket CPU defender charge/delay exemption in the tested situation; it does not reproduce every possible owner contact geometry.

1V1 `render.js:2069` passes `p.stam` to the same `PH.stamBar` for both players. 5V5 `render5.js:587` also passes `p.stam`; `team5.js:2342–2349` applies the same `100-r.fat` cap and stores it back to the roster. There is no CPU-specific smoothing. The common bar immediately shortens the colored fill but retains a 0.6s pale damage ghost; an 8-point loss in the 30px duel bar is only 2px. At C1 standing recovery, 8 points return in 0.265s, before the ghost expires. Canvas-call assertions verify identical immediate values and ghost behavior, and existing `qa/stamina-hud.cjs` passes. No browser visual check was performed.

### Realistic series at 10 Hz

Two seeded 7200-frame 1V1 runs with identical Kyrie archetypes, difficulty 2, C1 overrides, scripted human dribble/drives/finishes on offense and stance/closing pressure on defense, actual autonomous CPU decisions, and starting possession swapped. Both sides subsequently attack and defend naturally. Samples use simulation time; hit-stop/slow motion means roughly 116–119 simulated seconds per 120 frame-seconds. Possession resets remain enabled. CSVs include role, stamina, action, raw movement input, speed and pressure delay. Gross is the charge at move initiation; net is the mean start-to-end change of completed move actions and includes concurrent contact/recovery, not an isolated cost. Different move counts/finishes make whole-game means observational, not equivalent-work comparisons; the matched move and pressure tests above isolate accounting.

| Version | First attacker | Controller | Samples | Min | Mean | Moves | Gross/move | Net/move |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Before | Human | Human | 1179 | 49.6287 | 96.0495 | 10 | 3.9435 | 0.7179 |
| Before | Human | CPU | 1179 | 38.5716 | 89.7518 | 57 | 5.1350 | 7.4155 |
| Before | CPU | Human | 1173 | 55.0194 | 95.8619 | 13 | 4.0207 | 1.0460 |
| Before | CPU | CPU | 1173 | 36.3269 | 87.8575 | 60 | 5.6206 | 6.3597 |
| After | Human | Human | 1185 | 49.6231 | 94.4894 | 12 | 3.4715 | 0.5099 |
| After | Human | CPU | 1185 | 34.3716 | 87.0441 | 50 | 4.8593 | 7.8880 |
| After | CPU | Human | 1163 | 80.0092 | 97.8367 | 15 | 4.0224 | 1.2040 |
| After | CPU | CPU | 1163 | 29.2475 | 91.6824 | 47 | 5.1952 | 7.1870 |

Reproduce current results:

```sh
CPU_STAMINA_PROFILE=qa/cpu-stamina-c1.json node qa/cpu-stamina.cjs
node qa/cpu-stamina-live.cjs /home/ubuntu/cpu-stamina-c1-after.csv
```

Default and C1 regressions pass after the fix. C1 autonomous minima in 1V1/5V5/3V3 are **34.49 / 59.06 / 41.98**. Affected existing QA rerun: stamina, chain-stamina, contact-stamina, stamina-hud, pushback, stance-crab, sprint-dribble-tiers, sprint-trail, dribble-combo, combo-window, hesitation, post-moves, post-turn, move-ratings, check-ball, 3v3, b3-badges, box3; all pass. Required seeded block-contact passes: 18 blocks / 340 FGA (5.29%) across eight CPU games; shared 5V5 test reaches 120s and audits one block. Logs and before/after CSVs are saved under `/home/ubuntu/cpu-stamina-c1-*`. The separately documented pre-existing alley-oop failure was not rerun in this follow-up.
