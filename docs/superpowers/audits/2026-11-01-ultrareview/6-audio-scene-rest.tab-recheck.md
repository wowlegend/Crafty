**All 10 ultrareview findings hold against the code: none refuted, 3 narrowed, and I found 1 new bug alongside them.** GitHub's main is still the reviewed commit, `dae1afb4`, so they all apply to it. I haven't fixed anything.

## 🔎 Verdicts, re-ranked

| # | Finding | Where | Re-derived result |
|---|---|---|---|
| 1 | Shadow box centred at y=0, not player height | `render/Atmosphere.jsx:381` | **Confirmed with three's real shadow matrix.** On low tier the player's column leaves the map above y≈47 (terrain 39–63, spawn ≈53), so there are no sun shadows at their feet. At y=53, the side away from the sun gets 20.5 of 56 m on medium and 50.5 of 72 m on high. |
| 2 | Gain ramps have no start anchor | `audio/stormBed.js:50-51, 56-57`, `SoundManager.jsx:234-235` | **Confirmed in Chromium 156.** When a storm clears, gain falls from 1 to 0.009 within 50 ms; anchored, it is still 0.97 and fades over 0.8 s. On wind steps, 75–80% lands at once. |
| 3 | Wind bed loops a decaying buffer | `SoundManager.jsx:197` | ⚠️ **Narrowed.** The decay is real (−87 dB at loop end, then a jump back). The peak is only about −52 dBFS at default volume before the filter, so "audible on every biome" is unproven. |
| 4 | Pitch sweeps run at double rate | `audio/synthVoices.js`, 11 voices | **Confirmed by derivation, not rendered.** The hurl reaches 0 Hz at 0.2 s of 0.3 s, and heavy-ready ends near 3.7 kHz instead of 2.3 kHz. |
| 5 | Placed block muffles its own sound | `render/SpatialAudioController.jsx:31-75` | ⚠️ **Narrowed, using the real Rapier engine and the same march.** "5 walls" occurs in 31% of 20,000 modelled top-face placements, 3 or more hits (350 Hz) in 55%, none in 16%. The voice lasts only 0.1 s. |
| 6 | Game-loop isolation breaks | `SpatialAudioController.jsx:26, 219`, `EnhancedMagicSystem.jsx:490-520` | ⚠️ **Narrowed.** The rule breaks are real. The repeated `setProjectiles` needs a frame to land before React commits, which I didn't measure. |
| 7 | Magic effect re-runs on every render | `EnhancedMagicSystem.jsx:203, 311` | **Confirmed by reading.** |
| 8 | Muted procedural music still runs | `SoundManager.jsx:15, 322, 348-374` | **Confirmed by reading.** |
| 9 | Firefly drift depends on frame rate | `render/WeatherSystem.jsx:301-303` | **Confirmed by reading.** |
| 10 | History comments in code | `GameScene.jsx:50-94`, `SoundManager.jsx:490` | **Confirmed.** A narrow sweep hits 19 lines across 4 files. |

**New bug, not in the review:** the wind bed's gain at `SoundManager.jsx:235` keeps the `volume` from when the pad started. The volume effect at `:259-266` only updates the pad's own gain, so volume changes don't reach the bed while the pad runs.

## ⚠️ Fix traps

- **Wind bed (#3):** reusing stormBed's flat buffer, as the review suggests, makes the bed 33 dB louder RMS and 20 dB louder at peak. It needs rescaling.
- **Shadows (#1):** `snapShadowCentre` snaps only x and z, so following the raw player y will probably make shadow edges shimmer when jumping (not tested). Capture pins the high tier, so the look gates can't catch the low-tier case; a fix needs its own low-tier check.
- **Muted music (#8):** `startSynthPad` also owns the wind bed and its 8 s loop, so an early return would kill the bed too. Those need splitting out.

## 🧪 Limits

- **Evidence:** this measures shadow coverage, ray counts and gain values, not how the game looks or sounds. No run was on a real GPU, and #2, #3 and #4 need your ear.
- **Registry:** a term grep found no open row for any of these. The only close matches are Q13 and OI-46, both closed, on the shadow frustum following the player.

These findings exist only in this session and in its cloud output, `<tmp>/<review-repo>/45a66eb1-6d03-466e-a673-3c5e2cb39e2d/tasks/rffb9sux1.output`, which gets reaped after the session ends. This review repo has no registry to record them in.

Should I send this to the Crafty command session to turn into registry rows?