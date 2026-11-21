# Euro step rhythm

Run `node qa/euro-tempo.cjs`; add `--live` for a GET-only C1 comparison.
Optional `EURO_BASE=<commit>` prints the old waypoint timings too (requires full Git history).
Baseline used: `3360bd87bf26fc3ce214a96ae5feb2714fcca9b5`.

## Controls

调参台 → 终结 → 脚步与起跳:

- `l1_euroTempo`: default **1.35**, range **0.8–2**, step **0.05**. Larger is slower.
- `l1_euroBeat`: default **0.22 seconds**, range **0–0.45**, step **0.01**.
  Pause on the first plant before moving to the second step; zero disables the pause.
- Both have `wide:false`. Tempo scales both steps and the pause, not airborne release timing.
- Speed/acceleration contributes only a 0.95–1.10 duration factor. Shared step/gather
  tuning still applies, with Euro-specific floors of 0.24/0.08 seconds before scaling,
  so old fast profiles cannot erase the slower rhythm.
- Existing `l1_euroD` (default 1.2m) affects geometry, not tempo. Shared defaults were
  `l1_stepT=0.18`, `l1_gathT=0.10`, `l1_layTi=0.34` seconds.

## Flagg timings

Same setup throughout: 4.5m from hoop, 5m/s toward hoop, seed 7. Seconds from move start;
release below is ideal release, not a claim about every human release input.

| Profile | Before plant1 / plant2 / release | After plant1 / plant2 / release | Plant1→plant2 before→after |
|---|---|---|---|
| Defaults | .340 / .613 / .953 | .529 / 1.259 / 1.599 | .273 → .730 |
| Fixture C1 | .187 / .363 / .693 | .485 / 1.192 / 1.522 | .176 → .707 |
| Live C1 | .192 / .374 / .704 | .491 / 1.207 / 1.537 | .182 → .716 |

Actual shared 240Hz simulation, holding until ideal then releasing:
defaults **1.608s**, fixture **1.537s**, live **1.550s** (frame quantization/input ordering).
The actual pause for Flagg at defaults is approximately **0.291s**.

Live GET returned `l1_stepT=.1`, `l1_gathT=.04`, `l1_euroD=1.8`,
`l1_layTi=.33`; neither new Euro key was present. Fixture is not identical to live:
in particular geometry/run/stride values differ. Neither cloud profile nor fixture was modified.

## Existing systems reused

`game.js`: `buildSteps`, `stepUpdate`, `stepPose`, `layMeter`, `updateGrip` and
the existing rig carry (`render.js:finishGrip`). Two legal waypoints remain two waypoints;
first waypoint includes a grounded hold. Motion and pose use movement duration, while
meter/takeoff use full duration including the hold. No new runtime file or renderer subsystem.

CPU `aiInputCore` previously gated its contest decision on `!oa.inSteps`, so merely
slowing the gather could not bait it. A Euro-only first-plant hook now enters the same
reaction/position/willJump logic and marks `seenAct` once; no guaranteed hit/miss roll
or contest-strength exemption was added. In the seeded Gobert check, reaction is .190s
and existing ballistic block flight is .650s, below the new 1.037–1.070s
first-plant-to-release interval. The test checks the actual AI jump input and jump velocity;
this proves an early jump can land before release, not that all defenders always whiff.

QA also checks planted position/pose, slow-motion rig attachment after gather, zero beat,
tempo scaling, modest rating difference, invalid tuning input and empty-waypoint fallback.
