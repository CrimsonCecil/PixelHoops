# Full C1 far-hand tuning audit

Source: read-only GET `https://pixelhoops-api.cecilcai322.workers.dev/api/profiles`.
The response's default is `pmwly6cz9cafb`, named C1, updated `1795255123.945`.
`far-layup-c1.json` contains its complete saved data, not just the finishing subset.
No cloud writes were made. Original main below means pre-PR base `7d21115`.

## Result

No remaining shared layup setting was found that reaches normal but not far-hand
layups. No production-code fix is justified by this audit. Both versions share
`finPlan`, `startFinish`, `buildSteps`, `layJump` and `releaseShot`.
Far is a side/hand overlay (`a.lsv`), not the underlying variant (`a.v`).
In particular a far-hand hop/euro keeps that variant's footwork.

`cfgstore.js` selects the default profile via `TUNE.load(data)`. That resets defaults,
then loads saved values without slider-range clipping. `syncK` copies `l1_<key>` to
the shared `PH.game.K.<key>` and synchronizes LSV contest/block values and green-width
tables. There is no separate 3V3/5V5 layup-footwork cache. Mode-dispatched fixtures
exercise shared selection in 2p/t3/t5; these are not full team-match simulations.
Camera values are pending in the headless loader (registered by the live UI), not
missing gameplay keys. `t5_shakeOff` belongs to team presentation, not footwork.

Stages: S = selection/eligibility; F = footwork/takeoff; P = release/probability;
R = pose/render timing; I = indirect prerequisite; N = another action, deliberately
not applied to ordinary or far-hand layups. Each stage is conditional on its own
branch, e.g. stepT does not affect the shared direct-gather branch.
All keys below have the `l1_` prefix. Defaults are branch defaults unless noted.
No row needs a new gameplay fix.

| Key | C1 | Default | Reaches far: original / branch | Trace / condition |
|---|---:|---:|---|---|
| layK | 1.44 | 0.9 | S,F / S,F | eligibility and scaled takeoff target |
| layMax | 2.1 | 3 | S,F / S,F | eligibility; airborne speed cap |
| floMax | 3.85 | 3.8 | S / S | floater eligibility, affects alternative choice; far itself is not a floater |
| floK | 0.5 | 0.95 | S / S | same floater eligibility gate |
| floMin | 1.55 | 1.4 | S / S | same floater eligibility gate |
| runV | 4 | 6.5 | S,F / S,F | run = forward speed / runV, feeds stride/target |
| stepBase | 0.5 | 1.15 | S,F / S,F | finPlan stride length |
| stepRun | 0.71 | 0.85 | S,F / S,F | speed-dependent stride |
| stepMax | 1.6 | 2.1 | S,F / S,F | stride ceiling |
| layTgtA | 1.95 | 2.3 | F / F | scaled target lower bound |
| layTgtB | 3.4 | 2.8 | F / F | target upper bound; airborne speed ceiling |
| layGlide | 0 | 0.35 | F / F | only sty=glide, including far-hand glide |
| step0 | 0.8 | 0.45 | F / F | need < step0 selects direct gather |
| step1K | 0.5 | 1.3 | F / F | shared one-step threshold |
| stepT | 0.1 | 0.18 | F / F | duration of moving steps, not direct gather |
| gathT | 0.04 | 0.1 | F / F | extra gather time, including direct gather |
| layTi | 0.33 | 0.34 | P,R / P,R | ideal release/meter and pose timing |
| sP0 | 0.25 | 0.18 | S / S | laySide base selection probability |
| sPBase | 0.2 | 0.15 | S / S | baseline-cut selection bonus |
| lvFarP | 0.81 | 0.76 (original 0.96) | P* / P | original V.p could be overridden by green/saturation; branch final multiplier survives |
| lvFarC | 0.55 | 1.2 (original 0.9) | P / P | multiplies contest via LSV, less than 1 reduces contest |
| cvA | 1 | 0.82 | F,P,R / F,P,R | takeoff conversion eligibility; branch retains far penalty after conversion |
| gwLay | 8 | 5 | P / P | shared layup green-width table |
| smLay0 | 0.38 | 0.36 | P / P | base layup probability |
| smLayR | 0.55 | 0.54 | P / P | rating coefficient |
| smTLay | 0.25 | 0.18 | P / P | non-green layup timing penalty |
| cFrontK | 0.2 | 0.15 | P / P | front-facing defender contest |
| cSide | 0.4 | 0.35 | P / P | side defender contest |
| bChase | 2 | 1.9 | P / P | chase-block horizontal range |
| bChaseLim | 1 | 1.3 | P / P | chase-block hand-to-ball range |
| bRange | 1.2 | 1.35 | P / P | standard block range |
| bFront | 0.5 | 0.15 | P / P | block direction gate |
| bLim | 1.4 | 1 | P / P | hand-to-ball block range |
| bLay | 0.8 | 0.62 | P / P | block multiplier for layup attempts |
| uuWin | 0.3 | 0.45 | I / I | preceding fake-to-UU input window |
| uuT | 0.3 | 0.42 | I / I | preceding UU duration |
| uuForward | 1.65 | 1.5 | I / I | preceding UU displacement |
| uuBack | 1.55 | 1.15 | I / I | preceding UU displacement |
| uuSide | 1.75 | 1.25 | I / I | preceding UU displacement |
| uuCost | 0.38 | 0.3 | I / I | preceding UU stamina |
| uuBonus | 0.1 | 0.08 | P / P | only a UU-origin finish against the defender that bit; merged main additionally scales by quality |
| rsHold | 0.24 | 0.2 | I / I | input gesture choice, not far-only timing |
| dunkMax | 2.55 | 3.2 | S / S | auto-finish dunk eligibility, not layup takeoff target |
| dunkMin | 1.5 | 1.1 | S / S | same |
| dunkBase | 1.7 | 0.6 | S / S | same |
| dunkAth | 2.9 | 2.4 | S / S | same |
| bgLaunch | 0.43 | 0.4 | S / S | dunk reach badge, affects auto dunk-vs-lay choice |
| bgPoster | 0.24 | 0.08 | S / S | dunk attack score in conditional CPU dunk-vs-lay decision |
| sdMax | 1.15 | 1.9 | N / N | standing-dunk eligibility, not normal/far layup footwork |
| dkTgt | 0.8 | 1.6 | N / N | dunk target only |
| dkTgtRun | 0 | 1.2 | N / N | dunk target only |
| dkTgtMin | 1.7 | 1.2 | N / N | dunk target only |
| ctDkP | 0.6 | 1 | N / N | dunk probability only |
| gwFloat | 5 | 3 | N / N | floater green width, not far (laySide rejects floaters) |
| gwHook | 4 | 3.1 | N / N | hook green width |
| gwPost | 2.6 | 1.6 | N / N | post shot green width |
| gwMid | 1.8 | 1.2 | N / N | jump-shot green width |
| shotJump | 0.15 | 0.22 | N / N | jump-shot gather, not layup |
| bShot | 0.4 | 0.5 | N / N | jump-shot block multiplier |
| bDunk | 0.5 | 0.38 | N / N | dunk block multiplier |

C1 contains no `euro*`, `hop*`, other `lv*`, `stepN`, `stepHeavy` or individual
one/two-step length overrides. Their defaults still apply to both far and normal
when the underlying variant selects them (`hopD=2.6`, `euroD=1.2`).
Other saved keys in the complete fixture concern camera, prior dribble combos,
ankle-breaks, steals, stamina/contact, defensive stance/running cadence and effects;
they are not alternate layup-footwork controls. Running/stance cadence does not
set either normal or far-hand gather cadence (`stepT` and `gathT` do).

## Empirical result

Same Joe fixture as the main QA: lay=0.9, forward speed=4m/s, normal base style.
Original main and current branch have identical configured waypoints/durations.

| Profile | Start | Far takeoff / steps / gather | Normal takeoff / steps / gather |
|---|---:|---|---|
| Defaults | 3.4m | 2.700m / 1 / 0.297s | 2.700m / 1 / 0.297s |
| Defaults | 5m | 2.701m / 2 / 0.517s | 2.701m / 2 / 0.517s |
| Only layK=1.44 | 3.4m | 3.280m / 0 / 0.140s | 3.280m / 0 / 0.140s |
| Only layK=1.44 | 5m | 4.300m / 1 / 0.297s | 4.300m / 1 / 0.297s |
| Full saved C1 | 3.4m | 3.280m / 0 / 0.080s | 3.280m / 0 / 0.080s |
| Full saved C1 | 5m | 4.880m / 0 / 0.080s | 4.880m / 0 / 0.080s |

Zero steps denotes the direct-gather waypoint (0.12m carry), not an empty path.
C1's target lower bound is `(1.95 + 0.7*1 + 0.3*0.9)*1.44 = 4.2048m`.
At 5m, need is `0.7952m`, below C1's `step0=0.8m`, so both launch directly.
The short carry takes `gathT+0.04 = 0.08s`. `stepT` and `step1K` are not consulted
after this earlier return. This is shared branch priority, not an ignored key.
Yes: layK=1.44 alone is enough to reproduce a direct launch around 3.3m; full C1
also extends that direct branch to 5m in this fixture. This does not prove that a
specific live recorded attempt had identical position, speed, player or base style.
