# W2-E follow: the beast's eye, the hands in motion, mobs that sense the body, and the hands by the fire

The open rows the W2-E hands lane left (`memory/registry.jsonl`, ids `REVIEW:w2e:*`), on main `6999a7de`. A task script
under DECISIONS 2026-10-28 (W1-H) item 3: 300 lines or less, red-first steps, the gates it runs. DECISIONS items for
this lane start at 80.

## Goal

1. In first person in a beast form, the player sees the world and their gauntlets, and no part of their own beast
   fills or tints the view: no box the eye sits in, no glow sphere the eye sits in (`beast-form-eye-in-head`).
2. The swing, the cast and the heavy charge are seen at their apex on a GPU, judged, and what reads wrong is fixed
   (`hands-in-motion-unseen`).
3. Mobs and the combat stance sense the player's body, not the camera, so the roar's reveal camera, the shake and the
   kicks move no mob's reach (`mob-sense-from-camera`).
4. Beside the Hearth's brazier at night the gauntlets take its light (`hand-light-fill-and-point-lights`).
5. The three LOW rows: no allocation in the hand pose's hot path, the beast's hidden parts judged from this frame's
   camera, and a gate on the follow eye.

## The instrument, built first: the lookbook `self` set

The seam has no beast-form pose and no way to hold a hand pose (registry notes). Added to
`frontend/src/render/lookbookSeam.js`, each inert until a script calls it, as the seam's other verbs are:

- `form(element | null)`: enter or leave a beast form through the store's own `enterBeastForm` / `exitBeastForm`. The
  Player's beast state machine would end a form it did not start on its next tick (its `activeSince` is 0), so a form
  is shot under an **eye pose**: `pose({ position, lookAt, hands: true })` pins the camera at the body + `EYE_HEIGHT_M`
  (the Player's controller, the beast state machine with it, does not run under a pose) and keeps the hands, which a
  hero pose hides. What it changes: no bob, no FOV kick, the camera exactly at the steady eye.
- `handPose({ kind: 'swing', step, t } | { kind: 'cast', t } | { kind: 'charge', level } | null)`: held by the hand
  rig in place of the clock (`render/playerRender.jsx`), so a still lands on the apex rather than racing a 0.3 s swing.
  The cast pose and the left hand's orb read it as they read `attackType`.

The set (`--sets self`, Chromium 1280x800 at dpr 2; the touch fits are portrait-only questions, so the hand poses are
shot on WebKit 820x1180 too): the four forms at 0.30 and 0.75 facing the Hearth's bearing; the apex of step 1, step 2,
the finisher, the cast and the full charge at 0.30; the hands at the brazier at 0.75. Before frames come from a build
of this instrument alone (`--build-dir`), after frames from the lane's head. GPU runs: one at a time under the lock,
never 18:00-21:00Z, never at a 1-minute load over 28. Frames are contact sheets (ImageMagick, JPG), at most 16 files,
under `docs/superpowers/masterpiece-2026-10/evidence/w2e-follow/`, each opened before it is committed.

## Steps (each red first; the gate before the build)

### 1. The beast in first person (MED)

Measured from the parts table before any change (avatar space, eye at `EYE_HEIGHT_M - FEET_OFFSET` = 1.57 m): the halo
sphere (BackSide, additive, radius `core.radius x 1.7 x aura x 1.07`) stands 0.036 m from the golem's eye, 0.057 m
from the dragon's and 0.20 m from the bull's, so it covers the lower part of the view in those three forms, more
with the bob. The core and hot spot draw with no depth test.

**Decision rule.** The eye stays at the body + `EYE_HEIGHT_M` in every form: a per-form eye puts the dragon's 2.15 m
up, inside the ceiling of a two-block passage its 1.44 m capsule fits, and pops at the roar's handover (item 39). What
first person hides grows instead: every drawn part within `SELF_CLEARANCE_M` of the eye, the spheres as well as the
boxes, judged against the sphere's surface. If the before frames show a fragment floating (the hawk's beak without its
head, the dragon's head without its neck), a part hung from a hidden part hides with it (an `on` index in the table).

- Red: `tests/gates/beast-self-view-gates.test.jsx` gains, per form, over the bob range (`EYE_BOB_M` above and under
  the eye, 9 samples), "every part the avatar draws is at least `SELF_CLEARANCE_M` from the eye", over boxes, core,
  hot spot and halo, with the count of parts checked asserted; and "no part flips between drawn and hidden within the
  bob" (a part that flickers with every step). Mounted: in the golem form at the eye the halo writes no colour; in
  the reveal it does. Red on main: the halo of the golem, the dragon and the bull.
- Build: `BeastAvatar.jsx` applies the clearance to every sphere it draws (`beastAvatarParts.js` gains
  `sphereDistance` and the sphere list per form). Green.
- Frames: the four forms at 0.30 and 0.75, before and after, one sheet each.
- Mutation: the halo's check removed (red), the bob range collapsed to the steady eye (red where a part flips),
  identity (green).

### 2. The hands in motion (MED)

Stills at the apex (t = 0.5 for the swings, the cast at its forward peak, the charge at level 1), 16:10 and iPad
portrait. Judged against: a hand through the camera (the fist's box behind the viewmodel near plane, or filling over
40% of the frame), a wrist at an impossible angle (the forearm turned past 90 degrees from its rest about any axis,
read in the frame), the gauntlet leaving the frame (under 95% of the fist inside, the fit's own share).

- Red first for whatever is fixed: `tests/gates/hand-pose-gates.test.jsx` asserts the defect's shape at every sampled
  step before the fix. If nothing reads wrong, nothing is changed and the row closes on the frames.
- Frames: one sheet per viewport, before; one after if anything changed.

### 3. Mobs sense the body (MED)

`mobSensePoint` becomes the steady eye of the body (`combat/swingOrigin.js steadyEye`): the body's centre +
`EYE_HEIGHT_M`, no bob, shake, kick or reveal. `AIWorkerSystem.jsx` reads the body from the store's
`playerRigidBodyRef` and posts that point; the arrow's target and the leap's direction read the same point;
`combatStance.stanceFrame` reads it from the body it is already handed. Item 36's ledge table is unchanged (it was
built from `steadyEye`).

- Red: `tests/gates/mob-senses-gates.test.js` mounts `AIWorkerSystem` through R3F with the worker stubbed, stages the
  roar's reveal (the camera at `transformCamPose(body, fwd, 1)`), reads the `playerPos` the system posts, and drives the
  real worker with it: a zombie beside the body strikes, one beside the reveal camera does not. Red on main (the camera
  is posted). The stance: `combatStance` gate, the point read from the body with the camera elsewhere.
- DECISIONS: what else reads the camera as the player's position (`grep -rn "camera.position" src`), each kept or
  changed with its reason.
- Mutation: the camera posted again (red), the eye height dropped from the point (red), identity (green).

### 4. The hands by the fire (LOW)

The brazier's light is not pooled (`lightPool.jsx`: always-mounted lights stay as they are), so "the pool's nearest
lights" would miss the one the row names. The hand rig gains `HAND_POINT_LIGHTS` (3) point lights, a constant count
(no shader relink). Each frame the viewmodel layer ranks the world's lit point lights by the light they put on the eye
(three's own falloff: `distance` cutoff and decay) and mirrors the first three into view space; the rest of the rig's
lights go to 0. The world's point lights are found through one registry: the pool's lights and the always-mounted ones
(the brazier, Atmosphere's fill, the phantom block's), each registered where it mounts. No allocation per frame
(scratch arrays and vectors).

- Red: `tests/gates/viewmodel-gates.test.js`, the ranking and the mirror: a brazier-like light 1.5 m from the eye
  lands in the rig at its view-space position with its colour and intensity, a farther or out-of-reach one does not,
  the count stays 3. Mounted (`viewmodel-layer-gates`): a registered light reaches the rig through the layer.
- Frames: the hands beside the brazier at 0.75, before and after.
- Mutation: the mirror skipped (red), the ranking reversed (red), identity (green).

### 5. The LOW rows

- `handpose-hot-path-alloc`: `frameScale(aspect, fov, out)` writes into a scratch; `swingPose` and `chargePose` take
  it. Gate: the existing pose gates stay green; a call count of `frameScale` allocations is not measurable in vitest,
  so the row closes on the code and the unchanged numbers.
- `beast-hide-previous-frame-camera`: the beast's hidden set is judged after the Player loop moves the camera (its
  `useFrame` runs at a priority between the loop's and the composer's render). Red: a mounted gate where a sibling
  loop at priority 0, subscribed after the avatar, moves the camera from the reveal to the eye; the head must be hidden
  on that same frame.
- `follow-eye-unguarded`: the e2e head checks (`ember.spec.js backAtHead`, `heavy-melee.spec.js head`) allow
  `EYE_BOB_M` of height rather than 0.6 m. Mutation-proven on CI: a throwaway branch with the eye at + 1.2 in the
  follow, run by `workflow_dispatch`; the two specs must go red there.

## Anti-attack

- A clearance gate that counts no spheres passes on main: the count of parts checked is asserted per form.
- A hide that reads the steady eye would pass the geometry gate and still flash a part during a camera shake: the
  mounted gate moves the camera, not the body.
- A sense-point gate that calls `mobSensePoint` directly proves the function, not what the system posts: the gate reads
  the system's own `postMessage`.
- A hand-light gate on the ranking alone would pass with the rig never added to the scene: the layer gate reads the
  rig's lights after a frame.
- A still at the apex shot through real input would race the clock: the seam holds the pose.

## Verify

From `frontend/`: `npm run lint`, `npm run test:unit` (background, deadline), `node scripts/ci/doc-currency.mjs`,
`node scripts/ci/gate-shape.mjs`, `npm run build`, `node scripts/ci/bundle-budget.mjs`, `npm run knip`. Then merge
`origin/main`, push, open the PR, wait for its CI on the exact head, read each e2e shard's first attempt.

## Not in this lane

`REVIEW:w2e:viewmodel-pass-gpu-cost`, `touch-controls-over-gauntlets`, `viewmodel-e2e-mutants-unrun`, unless one falls
out of the work. Files another lane holds (`QuestSystem.jsx`, `store/useGameStore.jsx`, `combat/targeting.js`,
`data/items.js`, `data/lootTables.js`, `game/consumables.js`, i18n, `ui/GamePanels.jsx`, `ui/QuestLog.jsx`,
`ui/primitives/*`): a registry row if an item needs one.
