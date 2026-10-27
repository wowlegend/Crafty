# Crafty — the masterpiece programme ("Ember against the dark")

> **Status: ACTIVE, umbrella plan.** Kevin, 2026-10-27: *"make Crafty a masterpiece you'd be proud of. be creative and
> go all out ... free to enhance / prune / revise anything."* Every milestone below gets its OWN plan doc under
> `docs/superpowers/plans/` before it is built (the writing-plans rule in `.agent/AGENTS.md`); this file is the map,
> not a build contract. Design inputs, kept verbatim: `docs/superpowers/masterpiece-2026-10/` (four survey lanes, the
> roadmap, the upside pass, the adversarial refute). Where this file and the roadmap differ, this file applies the
> refute's amendments and wins.

## The thesis

Crafty should feel like a hand-painted toy diorama of a frontier where **light is the thing you fight for**: Ember
against the dark. By day a warm, readable bold-flat world under an authored sky; by night a cool, moonlit siege in
which every bright thing on screen means something: the player's power (the Hearth, a lantern they placed, a shrine
they relit, glowing ore, a spell core, the beast form's ember) or a threat's tell (a mob's eyes, the red edge of a
windup, the dragon's throat). Bloom, warmth and saturation are spent only on meaning; shadows are designed colour.
Play is close and legible: you cannot out-walk a fight, so you answer each telegraph with a dodge, a heavy, a finisher
or an Aspect. The climb from the Hearth to the Blight Heart is a chain of shrines you relight, each one weakening the
dragon (Old Pike's quest line already promises this; nothing implements it, `src/game/questLore.js`). And it runs cool
on purpose: a pixel budget, tiers that settle, nothing redrawn that did not change.

## How a move counts as done (the anti-Goodhart rule for this programme)

1. **Lived proof in the running game**, not a compiling call site: a real-input e2e, a probe, or a log line watched
   fire. Ask what would still pass if the feature were deleted.
2. **Looks are judged on real-GPU, motion-on frames** (the lookbook probe, Phase 0), opened by eye, including iPad
   viewports in WebKit. The 31 SwiftShader capture frames stay the REGRESSION oracle only: capture mode turns off
   weather, mobs, NPCs, particles and spawning, and pins the sun at noon.
3. **A heat budget held:** no move adds GPU cost without stating it, and Phase 0 sets the budget the rest are held to.
4. **Mutation receipts** on every gate (identity mutant included), per `.claude/rules/gates-and-probes.md`.
5. **Review:** fresh headless `/code-review xhigh` per change range plus one pointed adversarial reviewer at xhigh on
   runtime seams (DECISIONS.md, 2026-10-27).

## Phase 0 — deliver, see, cool (first)

| # | Move | Amended by the refute |
|---|---|---|
| 0a | Push main (receipt, CI green): the post chain built once, the 60 fps cap, the shadow-size reset reach the live site | — |
| 0b | The parked milestone (`feat/parked-looks-perf`: title pacing, compass, ore glow, leaf sway, storm lightning) e2e-proven, PR, merged | Ore glow re-tuned when the bloom threshold moves (F6), in that unit |
| 0c | **Touch plays the signature** (roadmap 3): the roar sector and the action button become press-and-hold with a radial charge fill, so the beast form and the heavy can be performed on iPad | Moved INTO Phase 0 (F9 too: a sector the new player can see) |
| 0d | **Instruments:** a lookbook probe (prod build, real GPU, motion on, WebKit at 1180x820 and 820x1180, four times of day); a Diagnostics readout (tier, dpr, GL renderer, context losses); the iPad probe run and its frames opened; a powermetrics A/B script for Kevin's Mac | Proofs need a PROD-reachable read path (F7); the governor oscillation is a hypothesis until measured |
| 0e | **The 147 -> current-Chromium re-baseline, alone**, its own Baseline-Review commit | Never bundled with a look change (F4) |
| 0f | **Steady tiers + an honest iPad** (roadmap 1): governor hysteresis; composer resized on a pixel-ratio change; GodRays, N8AO AND Bloom built once and disposed; a context-loss panel that recovers; the dead AdaptiveDpr deleted | Bloom included (F8); BloomSpikeDriver follows its effect |
| 0g | **Cool by budget** (roadmap 2): dpr from a pixel budget (high 4.2 Mpx / cap 1.75, med 2.8 / 1.5, low 1.8 / 1.25); the HUD on one ticker that also runs under Unlimited; pacing behind opaque panels, unfocused windows and idle; shadow updates on a quantised sun (~0.5 deg steps) and on change; chest-beacon and cast-hand point lights into a fixed per-tier pool | F2, F3, F10; the power baseline is the post-0a deploy (F12) |

## Seen on a real GPU, 2026-10-27 (the first frames of the shipped game that were not SwiftShader)

The Phase 0d lookbook (`feat/instruments`, Chromium new-headless on ANGLE-Metal / M3 Max, and WebKit at both iPad
viewports; production build; motion on) took the Hearth, a forest edge, the coast and a snow terrace at four times of
day. Kept in `docs/superpowers/masterpiece-2026-10/evidence/before-*.jpg`. What it shows, as a player sees it:

- **Night is unplayable to the eye.** At midnight (0.75) the whole world is maroon and magenta under an orange sky,
  in both engines; the Hearth reads black. This is the "frozen sunset" finding, now measured on real hardware.
- **Golden hour is cold.** At 0.48 the land carries a blue-teal cast, and in WebKit iPad portrait the Hearth's stone
  pad renders as saturated NAVY. The iPad starts on the low tier (no AO, no god rays), where the saturated-blue flat
  ambient does the shading. **This is the strongest candidate yet for Kevin's "iPad visuals very buggy / broken"** —
  a colour defect that reads as broken, not a crash.
- The compass labels overprint each other ("HOME" over "NPC"); the motes read as dust on the lens; the ocean is one
  flat plastic sheet.

**So the light and colour script leads Phase 1**, and its acceptance is these same lookbook shots, re-shot after,
opened side by side, on both engines and both iPad orientations.

## Phase 1 — the core look and feel (three disjoint lanes)

- **Ember against the dark — the light and colour script** (roadmap 4): colour by sun elevation through a six-key
  script; the moon takes the directional light below the horizon on its own vector (`sunDirRef` stays the sun's —
  the ore glow and cloud shadows read it, F5); the light rig re-balanced (ambient down, hemisphere up, a warm bounce,
  an authored shadow tint); bloom threshold above 1.0 so only HDR emissive blooms; sun-glow fog; motes only where
  something explains them. Capture states get a declared solar fraction each (F5). Day length reviewed (a 300 s cycle
  makes golden hour last seconds).
- **Close-quarters combat** (roadmap 5): a combat stance whose walk speeds are DERIVED from the roster's chase speeds
  (aggro x1.5, spiders x2.0), so a backpedal is slower than the slowest intended chaser and travel keeps Kevin's
  14 m/s out of combat (F1); off-screen windup chevrons; a three-step light string with a finisher.
- **A coast that reads as voxel water** (roadmap 7): the ocean's Fresnel, highlight and foam before fog, faded by
  distance; a seabed-depth bake for shallows.

## Phase 2 — first impression, surfaces, sound

- **The first minute** (roadmap 6): a living golden-hour title diorama; an Ember Prologue (a scripted first fight that
  shows a dodge, a heavy and the beast form) once per profile; i18n for the hardcoded title strings; the prologue is
  not a siege night for a new player.
- **One material grammar** (roadmap 9): the 16 procedural layers re-authored as structured bold-flat pixel art; top
  vs side faces (dirt under the turf lip); grass jittered and reservoir-sampled (no bald strip).
- **Sound with body** (roadmap 8): a lazy-loaded CC0 sample bank (Kenney packs), with a byte ceiling.

## Phase 3 — the light becomes the game

- **One feedback grammar** (roadmap 11): telegraph through the edge (rim and outline toward danger red); a hit flash
  on the lit band; merged mob meshes (~30 draws -> ~6); spell VFX with a solid core and ink outline.
- **The lantern and a baked block-light field** (roadmap 12): block light first (sky light is a later step, F13),
  carried in the greedy-merge key, shaded through a time-of-day lookup texture; the Hearth's forge and lookout glow.
- **Encounters and a siege that marches** (roadmap 10): one encounter table, four consumers (day groups, siege waves,
  shrine events, dungeon guardians), within today's mob caps.
- **Relight the frontier** (roadmap 14): hold-the-light shrine events; a lit shrine's beam turns ember gold and is a
  permanent light source; `shrinesLit` strips HP and one trick from the dragon, up to 3.
- **The Shadow Dragon earns the climax** (roadmap 13): a segmented voxel dragon in the box vocabulary, on the mob rules
  (windups, perfect-dodge stagger), a lit arena.

## Decisions taken with this plan (recorded in DECISIONS.md)

- **Death stays soft.** The roadmap's ember cache would forfeit coins and Aspect meters on a second death, which
  reverses a decision of record (`SOTA-INITIATIVE.md`) and is wrong for a young player. Not built.
- **No WebGPU/TSL migration and no engine bump now.** New shader terms are pure GLSL string modules with JS mirrors
  (the `oreGlow.js` / `leafFeel.js` pattern) so a later port is mechanical. A three r17x+ bump re-baselines the whole
  look and is its own decision.
- **The bundle has a byte plan:** each Phase 1-3 move states its main-chunk bytes against `bundle-budget.mjs`'s
  `index` ceiling, and splits code that runs only in rare moments (the prologue, the dragon) into lazy chunks.

## Open questions for Kevin (none blocking)

- His iPad's iPadOS and Safari version (Safari 27 fixed a WebGL stacked-canvas regression; Crafty stacks two canvases
  at the title).
- Optional: one powermetrics A/B run on his M3 Max with the script from 0d, to measure the heat before and after.
