# CPU stamina parity audit

## Result

Audited stamina references across `js/*.js`, including all writes to player/roster stamina, all action-cost callers, controller dispatch, recovery, fatigue and substitutions. **No competitive CPU-only stamina discount, recovery multiplier, stamina floor, or cost bypass was found on main.** The new regression also passes against main, with identical deterministic output. This change consolidates all 14 action/contact drain sites into `spendStamina`; it intentionally does not change the human rules, rates, training options or AI decisions.

The reported visual symptom is not reproduced by the headless simulation. Under default recovery, autonomous CPU stamina reached 66.00 in 1V1, 57.11 in 5V5, and 76.60 in 3V3 in the seeded 40-second samples. Controlled uninterrupted sprinting takes either controller below 3 stamina in all three modes. A final-frame-only assertion initially failed in 1V1 because the CPU had already recovered; sampling every frame records the actual drops. Browser visuals and the owner's saved tuning profile were not checked.

Shared recovery is fast: defaults give 21.84 points/second standing and 10.92 moving, with additional recovery below 30 stamina. Recovery also runs during actions when not sprinting/backing down. Possession resets add 25 in 1V1 and 15 in 3V3. These can hide brief drains, but are not CPU exceptions; whether they explain the owner's session is unverified. Changing them would change human gameplay too, so they are preserved.

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
| Idle/moving/post recovery | `js/game.js:5041–5044` | `(post ? stRgPost : moving ? stRgMove : stRgIdle) * lowStaminaBonus * R * dt`; delayed after pressure | Same; stance itself has no extra idle drain | Same |
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

`CPU_STAMINA_BASE=main node qa/cpu-stamina.cjs` audits pre-refactor behavior by instrumenting the original inline subtraction expressions with the mathematically identical helper. Its deterministic output matches the branch exactly. This confirms the observed competitive parity predates this change rather than claiming a CPU-specific bug was fixed.

Other QA run: stamina, chain-stamina, contact-stamina, stamina-hud, pushback, stance-crab, sprint-dribble-tiers, sprint-trail, dribble-combo, combo-window, hesitation, post-moves, post-turn, move-ratings, steal-timing, poke-steal, rebound-input, rebound-hold, up-and-under, double-clutch, contested-layups, layup-fumble, check-ball, 3v3, b3-badges, box3, and seeded block-contact.

Known existing failure: `qa/alley-oop.cjs:92`, `AssertionError [ERR_ASSERTION]: automatic layup/dunk must complete without input`. Reproduced with the unchanged `main:js/game.js` loaded into the same harness. It is not changed here.
