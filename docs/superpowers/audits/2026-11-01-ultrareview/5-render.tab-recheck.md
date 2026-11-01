**The review delivered 10 findings, and all 10 mechanisms hold up in the code. Two matter in play and eight are nits; nothing blocks.** I checked by reading the code and ran nothing, so none is reproduced in the game. Nothing is fixed or filed.

| # | Where (lines corrected) | Problem | Fix |
|---|---|---|---|
| 1 ⚠️ | `BossEntity.jsx:494-500` | The lava burn checks only horizontal distance. A player pillared above the zone still takes about 60 damage before mitigation (6 per 500 ms, for about 5 s). The fireball does check height (`dragonMoves.js:96`). | Also limit the height difference. |
| 2 ⚠️ | `BossEntity.jsx:457`, `:504` | Fireball and lava hits pass no source, so the red damage cue re-flashes the previous hit's direction. | Pass a source at both sites; see the corrections for the wider fix. |
| 3 | `BossEntity.jsx:457`, `:504` | Fireball (18) and lava (6) damage are fixed, so they don't grow with boss tier as melee does. | Derive them from the tier's damage. |
| 4 | `spellGeometry.js:55` | Wobble is seeded per vertex index, so the lathe's seam vertices separate by up to 0.09, which should open a crack. I haven't seen it on a frame. | Seed from vertex position. |
| 5 | `Nametags.jsx:87` | The capture guard runs only on render, so tags already mounted stay visible after capture starts. | Move the guard into `Tag`'s `useFrame`. |
| 6 | `spellVfx.jsx:173-175`, `pickupVfx.jsx:27-28`, `:74` | Spin is added per frame, so its speed follows the frame rate. | Scale by delta. |
| 7 | `combatVfx.jsx:28` | `WALL HIT!` and ` XP` are hard-coded English. | Use `t()`; `ui.xp` already exists. |
| 8 | `colourScript.js:165`, `:176`, `mood.js:220`, `lightPool.jsx:90`, `:113` | Per-frame allocations, against the frame-cost rule and the comments claiming none. | Reuse scratch objects. |
| 9 | `BloomSpikeDriver.jsx:24`, `postFx.jsx:113`, `MoodGradeDriver.jsx:17-25` | The same composer pass walk is written three times. | Share `liveEffects`. |
| 10 | `spellVfx.jsx:18-21`, `TitleDiorama.jsx:109`, `Ocean.jsx:11`, `quality.js:31-40` | Comments narrate history, which the repo rules ban. | Keep only the why. |

## 🔍 Corrections to the review
- **Finding 2 is wider than reported:** `EnemyProjectileSystem.jsx:48` has the same unsourced hit. The cause is `useGameStore.jsx:1033`, which keeps the old angle so `t` can still trigger the camera kick. A cue that shows only for sourced hits fixes all three callers.
- **Finding 3 is a design gap:** the spec defines tier scaling only on phase damage and doesn't mention fireball or lava.
- **Finding 5 is overstated:** `lookbook.mjs` never calls `enterCapture`, so lookbook frames aren't affected. That leaves specs and probes that use capture.
- **Bad line numbers:** the review cited `Nametags.jsx:2149` for a 94-line file and `lightPool.jsx:4402` for a 168-line file. The table has the real lines.
- **Severity mismatch:** finding 2 is marked normal, but the review's own verification calls it a nit. I kept normal because it misdirects the player in combat.

## 📊 Cloud counters
The cloud run counted 30 found, 25 verified and 19 refuted, then delivered 10 findings, some merged. I can't tell from here whether all 25 verified reports are inside those 10. Cloud session `af09e7b1-576d-5d03-8330-61641355c310` should show that; I haven't opened it.

## 📁 Where things are
- **Raw output:** saved to `<crafty-root>/.claude/worktrees/ultra-results/ur3-5-render.output`, outside this review repo.
- **Memory:** I added this run to `reference_ultrareview.md`.
- **Still to do:** this repo has no remote or registry, so the findings need rows in the main checkout's registry, which the Crafty command session owns. Do you want me to send them to that session?