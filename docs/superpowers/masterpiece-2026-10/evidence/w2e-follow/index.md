# W2-E follow: frames

Shot by the lookbook's `self` set (`frontend/scripts/visual/lookbook.mjs shootSelf`) on production builds served by
`vite preview`: before = `6f36c691` (main `6999a7de` plus the seam and the set, nothing else), after = `2c7bdc67`.
Chromium on ANGLE-Metal (Apple M3 Max) at 1280x800, device scale 2; WebKit at 820x1180 (iPad portrait). Every eye
frame stands 0.670 m over the body's centre (the steady eye, `info().eye - info().body`). Contact sheets, each tile a
whole frame unless named a crop. DECISIONS 2026-10-29 items 80-86.

| file | what it shows |
|---|---|
| `beast-forms-before.jpg` | first person in each form (dragon, bull, hawk, golem; left to right), 0.30 above, midnight below: the dragon's wings fill the upper corners, the bull's halo is a cyan band behind the hotbar, the golem's a purple edge at midnight |
| `beast-forms-after.jpg` | the same views: the world and the gauntlets, nothing of the beast |
| `beast-reveal-after.jpg` | each form from the roar's reveal hold (4.5 m behind, 2.2 m up) at 0.30: the whole beast still draws away from the eye |
| `hand-poses-16x10-before.jpg`, `-after.jpg` | rest; step 1, step 2 and the finisher at their apex (t 0.5) and near their end (t 0.9); the cast at its peak; the full heavy charge (row by row, left to right) |
| `hand-poses-portrait-before.jpg`, `-after.jpg` | the same nine poses on an iPad in portrait |
| `cast-before-after.jpg` | crops of the cast at its peak, before on the left: 16:10 above, portrait below; the red cone shard and the hand pulled back, then the wand pushed and tipped forward |
| `hands-brazier-midnight-before-after.jpg` | beside the Hearth's brazier at midnight, facing 110 with the fire low on the right; whole frames above, crops of the right gauntlet below, before on the left: after, its faces toward the fire warm |

## PR #52 fix round: the beast form's colour on the gauntlets (DECISIONS 2026-10-29 item 87)

Shot on 2026-10-29 after 21:00Z by the `self` set, Chromium on ANGLE-Metal (Apple M3 Max) at 1280x800, device scale 2,
each form at the steady eye at 0.30. Before = a production build of `ec0394ce` (no form colour); after = `7c3cffef`,
whose dragon rim read as a thin orange-red line on the orange plates, so the after row is now the crimson fire build
(`46010095`, shot at 22:32Z; the bull, hawk and golem tiles match `7c3cffef`'s to JPEG noise).

| file | what it shows |
|---|---|
| `gauntlet-form-colour-before-after.jpg` | whole frames, dragon, bull, hawk and golem left to right, before above and after below: in the after row the gauntlets' outlines and the right core carry the form's colour |
| `gauntlet-form-colour-crops.jpg` | the left gauntlet at half scale, before above and after below: ink outlines before; crimson, cyan, yellow and violet rims after, the held block's outline still ink |
| `gauntlet-fire-colour-before-after.jpg` | the dragon form only, left and right gauntlets, the beast's orange (`7c3cffef`) above and the crimson (`46010095`) below: the orange rim and core sit in the plates' orange; the crimson rim is a red line round both gauntlets and the core a red plate |
| `gauntlet-plate-glow-rejected.jpg` | the right gauntlet, before above and the first after arm below (the core plus 0.35 of the glow on the plates): the plates read salmon for the bull and pink for the golem, so the plates were left out |
