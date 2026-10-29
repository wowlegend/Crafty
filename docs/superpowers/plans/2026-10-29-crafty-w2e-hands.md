# W2-E: the hands become a viewmodel

Lane W2-E of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md` (row 13; Wave 2 table). A task script under
DECISIONS 2026-10-28 (W1-H) item 3: 300 lines or less, red-first steps, the gates it runs.

## Goal

What the player sees today at eye level (`masterpiece-2026-10/evidence/eye-level/`): two near-black upright slabs at
the bottom of the frame and an orange translucent sphere on the right. Measured at about luminance 10 (registry
`QUEUE:B5-partial`). At point blank they sink into the wall, because they are ordinary scene meshes hung off the camera.

After this lane: warm ember gauntlets, readable at midnight, that never clip a wall, cast no shadow and carry no point
light. Owned by this lane too: the eye-height question W1-D left open, and the diagnosis of
`REVIEW:w2k:dark-polygon-between-hands`.

## The metric, declared before any frame is shot

Instrument: a new `hands` set in `frontend/scripts/visual/lookbook.mjs` on the production build (`vite preview`),
Chromium on ANGLE-Metal, 1280x800 CSS at device scale 2, plus one WebKit iPad portrait frame.

- **Hand pixels.** At each time, two frames at the same eye and bearing: the player's eye (hands on), then a lookbook
  pose at that exact eye and direction (a pose hides the hands). A pixel below 55% of the frame height is a hand pixel
  when any channel differs by more than 24 (8-bit) and a second hidden frame agrees with the first there within 12. The HUD is in both frames and drops out. Denominator: at least
  1.5% of the frame's pixels, or the shot is COULD NOT MEASURE.
- **Value floor, at midnight (cycle 0.75).** Mean luma of the hand pixels in the hands-on frame, Rec. 709 weights on
  the 8-bit encoded values: **at least 48**, and the median **at least 40**. Before this lane it is about 10.
- **Warm.** At 0.30, 0.48, 0.55 and 0.75: mean red at least 1.3 times mean blue over the hand pixels.
- **No clipping.** The player walks into a wall (a real W key at the `trunk` material sight, held until the
  controller stops them; the first run used the `turf-wall` sight, whose one-block terraces the controller climbs). Hand pixels at point blank divided by hand pixels in open ground at the same time and
  bearing: **at least 0.9** after (before, the wall swallows most of them).
- **Touch.** WebKit 820x1180 (iPad portrait): both gauntlets inside the frame, by eye and by the mask's left and
  right halves both holding hand pixels.

Anti-attack (what would pass and be wrong): a bright emissive core alone could lift the mean while the plates stay
black, so the median is declared too; a diff mask can catch a mob, a cloud or swaying grass, so the mask is limited to
the lower 45%, unstable pixels are dropped, and its size is printed; the pose twin must face the same direction (heading and pitch read back within 0.5
degrees) or the pair is refused.

## Decisions this lane records (DECISIONS, items after the last on main)

1. **Inside the composer, as a second render pass.** The viewmodel renders right after the scene's `RenderPass`,
   inside `EffectComposer`: the canvas has no MSAA (`antialias: false`, `multisampling={0}`), so only SMAA can
   smooth the gauntlets' edges; the grade and the Neutral tone mapping keep them in the world's colour; bloom
   carries the ember core, which is what replaces the point light. Drawn after the composer, the hands would be
   aliased, ungraded and untone-mapped (R3F's composer sets `gl.toneMapping = NoToneMapping`).
2. **A depth range, not a depth clear.** `GodRaysEffect` reads the composer's depth texture to occlude the sun
   (postprocessing 6.39.5, `EffectAttribute.DEPTH`). A depth clear would leave that texture empty where the world
   is, and shafts would shine through walls. The viewmodel camera's projection maps its whole depth range into the
   front 2% of the buffer, so the hands win every depth test against any world surface beyond 0.102 m (the main
   near plane is 0.1 m) and still test against each other.
3. **Its own FOV, 60 degrees vertical**, fixed: the main camera's FOV moves 75 to 85 with speed, which stretched the
   hands. The anchors follow the aspect so both gauntlets stay in frame on an iPad in portrait.
4. **The light on the hands is the world's**, mirrored into the viewmodel scene every frame from the sky frame
   (`render/mood.js skyFrameRef`): ambient, hemisphere and the key, the key turned into the camera's view space.
   A value floor in the material (`max(lit, albedo x floor)`) keeps them readable when the world goes dark.
5. **The eye height** (W1-D's open question): decided in this lane, its own commit, with the reason.
6. **The dark polygon**: diagnosed from the before build's turf-wall frame and its pose twin.

## Files

- New `frontend/src/render/viewmodel.js`: `VIEWMODEL`, `squashDepth`, `ViewmodelCamera`, `ViewmodelPass`,
  `getViewmodel()`, `handAnchors()`, `HAND_VALUE_FLOOR`, `installValueFloor()`, `GAUNTLET`, `makeGauntletMaterials()`.
- New `frontend/src/render/ViewmodelLayer.jsx`: the portal into the viewmodel scene, its light rig, the aspect sync.
- `frontend/src/render/playerRender.jsx`: ember gauntlets; the aura sphere, the hand point light and every
  `castShadow` / `receiveShadow` go.
- `frontend/src/Components.jsx`: the hands mount through the layer, not on the camera.
- `frontend/src/GameScene.jsx`: the pass is the composer's first child.
- `frontend/src/render/Atmosphere.jsx`: a moved camera stops counting as a shadow caster (the hands were the reason).
- `frontend/src/render/lookbookSeam.js`, `frontend/src/index.jsx`: `info().handNodes`, counted in the viewmodel.
- `frontend/scripts/visual/_lookbook.mjs`, `lookbook.mjs`: the `hands` set and `handPixelStats`.
- Gates: `frontend/tests/gates/viewmodel-gates.test.js`, additions to `lookbook-plan-gates` and `lookbook-seam-gates`.

## Steps (red first)

1. **Gate, red:** `viewmodel-gates.test.js` imports `render/viewmodel.js`, which does not exist. Red on import.
2. **Camera and depth.** `ViewmodelCamera` squashes depth; asserts: x and y project as an unsquashed camera of the
   same FOV; near and far land on window depth 0 and the slice; any point 0.3-2 m out lands below the slice; the
   main camera (75 degrees, 0.1-500 m) puts every point beyond 0.1/(1 - slice) m above it; an aspect change keeps
   the squash. Mutants: drop the squash (red); slice 0.5 (red); comment edit (green).
3. **The pass.** `ViewmodelPass` driven with a recording fake renderer: renders the viewmodel scene with the
   viewmodel camera, `autoClear` false during the call and restored after (also on a throw), no clear pass, no
   background. Mutants: leave autoClear alone (red); enable the clear pass (red).
4. **Value floor and materials.** `installValueFloor` run on three's real toon fragment shader: the anchor exists,
   the floor line lands once, after `outgoingLight` is declared and before `opaque_fragment`, the uniform is
   declared and bound. `makeGauntletMaterials()`: plates and leather are `MeshToonMaterial` with the shared
   two-band gradient and the floor; the core is a `MeshBasicMaterial` whose linear luminance exceeds Bloom's 0.65
   threshold; plate hue within 12 degrees of the `ember` token; the floored luminance of the darkest gauntlet
   colour at least 0.03 (linear). Mutants: anchor string typo (red); floor 0 (red); core at plate brightness (red).
5. **Anchors.** `handAnchors(aspect)` for 0.5, 0.69, 1.0, 1.44, 1.6 and 2.4: both fists project inside NDC x
   [-0.9, 0.9], y [-0.95, -0.4], left of centre and right of centre, at least 0.3 NDC apart; at 1.6 the authored
   x. Mutant: return the authored anchors at every aspect (red at 0.69).
6. **Implement** steps 2-5, then `ViewmodelLayer.jsx`, the gauntlets, the wiring. `npm run lint`.
7. **Seam:** `handNodes` gate in `lookbook-seam-gates` (falls to 0 with no hands root); the eye verdict reads
   `handNodes` when a build reports it, else `cameraNodes` (`lookbook-plan-gates`). Mutant: verdict ignores
   `handNodes` (red).
8. **Instrument:** `handPixelStats` gate on synthetic RGBA buffers (mask count, mean, median, lower-region limit,
   size mismatch refused). Mutant: no region limit (red).
9. **Shoot**, one GPU run at a time under the lock, load under 28: before build (c3a0a7cb) and after build,
   `--sets hands`. Frames to `masterpiece-2026-10/evidence/w2e/`, 12 at most, none over 300 KB.
10. **Eye height**, its own commit. **Shadow camera term**, its own commit.
11. DECISIONS, registry; verify; merge origin/main; push; PR; CI on the head sha. (`memory/ACTIVE_PLAN.md` is the
    command session's cursor and is left to it.)

## Verification

`npm run lint`; `npm run test:unit` (background, deadline); `node scripts/ci/doc-currency.mjs`; `npm run build`;
`node scripts/ci/bundle-budget.mjs`. Each gate's mutation run is recorded in its commit's `Mutation-Proof:` trailer.

## Not proven by this lane

Real-device iPad feel; frames on the live URL (the lookbook has no `--url` mode yet); the hands in motion beyond the
cast and swing poses the code drives (no clip); a GPU-time cost of the second pass (expected tiny, unmeasured).
