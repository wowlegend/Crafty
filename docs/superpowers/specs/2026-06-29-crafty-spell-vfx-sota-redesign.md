# Crafty Spell-VFX SOTA Redesign — Design Spec (v7-S3)

> **Status:** APPROVED DESIGN (loop self-gate per LOOP-CHARTER §4). **Source:** Kevin steer 2026-06-29
> ("the 4 spells are still looking a bit too childish, and not quite differentiated in terms of texture /
> shapes etc. deep research on most SOTA spell casting effects / combat effects. then autonomously enhance all").
> **Research:** background Workflow `wb688lnno` (run `wf_aa32ce5b-4fe`) — 3 parallel lanes returned
> (shipped-game taste / web-three technique / anti-childish code-ground); the synth+critique agents hit a
> StructuredOutput schema cap, so synthesis + adversarial review are done here in main context from the 3
> recovered research lanes (`scratchpad/spell-research-{1,2,3}.json`). The 3 lanes converge tightly.
> **Targets:** `frontend/src/game/spellVisualProfiles.js` (ENERGY_PROFILE data) + `frontend/src/render/spellVfx.jsx` (render).

## 0. The 4 spells
fireball / iceball / lightning / arcane. Cast pipeline `EnhancedMagicSystem.jsx`; per-element data in
`ENERGY_PROFILE` (`spellVisualProfiles.js`); render in `spellVfx.jsx` (`SpellProjectileCore`,
`EnhancedSpellProjectile` trail, `SpellImpactPop`, `CastTelegraph`, `MagicWand`, `ChainArc`).

## 1. Diagnosis — WHY they read childish + undifferentiated (3-lane convergent root cause)

The impl is *technically* layered (silhouette mesh + hot-white core + glow shell + point light + velocity
trail), so the problem is NOT "needs more glow." It's that **all four share one grammar**:

1. **Master homogenizers = two ROUND additive layers on every element.** `SpellProjectileCore` gives each
   spell an identical hot-white core sphere (`spellVfx.jsx` ~L338-361) + a spherical outer glow shell at
   `profile.glowScale` (~L364-375). Under bloom `luminanceThreshold 0.65` (glowier, intended) that round
   white core + round glow bloom **every** spell into the same circular white halo that drowns even the
   distinct silhouettes (bolt/crystal). White-blooms-to-white = the literal "not differentiated" cause.
2. **Symmetric platonic primitives** = toy/placeholder shape language: fireball icosahedron, iceball
   dodecahedron, arcane torus+box-cross. Radially symmetric, zero anisotropy, zero velocity-alignment.
   Only the bolt is asymmetric. (Sharp/pointed reads "dangerous"; round reads "friendly/toy".)
3. **One shared motion recipe** = `pulse = 1 + sin(phase)*flicker` (~L159) + hardcoded uniform spin
   `rotation.x+=.06/.y+=.05/.z+=.04` (~L169-171) for ALL four. The only per-element delta is flicker
   amplitude/speed. So ice "breathes" and tumbles exactly like fire. **Motion is read before color** — same
   motion = "samey."
4. **Flat 2-stop color** = `coreColor` (near-white) + ONE saturated `glowColor`. No intra-effect temperature
   RAMP (the universally-cited premium technique). Worse: **lightning `#86B8FF` and ice `#3FB7FF` collide in
   the same blue lane** → instant ambiguity.
5. **No anticipation/settle; same impact.** Projectile pops in at full scale; 3 of 4 impacts are
   expanding-ring + expanding-decoration variants (only `rune` implodes); the telegraph is one concentric
   rune-circle recolored 4 ways.
6. **Isotropic `setScalar` scaling** = directionless balls; no squash/stretch, no sense of speed/direction.

## 2. Design principles (the anti-childish levers — all 3 lanes agree)

- **Break radial symmetry** — asymmetric, directional, velocity-aligned silhouettes; form matches function
  (fire rises/teardrops, ice = sharp shard cluster, lightning = thin fractal line, arcane = layered
  concentric runic geometry).
- **Primary/secondary VALUE hierarchy** (LoL VFX Style Guide) — one hot focal core is "primary" (high
  value/opacity/bloom); demote glow shells/trails/secondaries to low value/opacity. Uniform full-bloom on
  every layer is the #1 childish driver. **Grayscale test:** if all four are the same white blob in
  grayscale, differentiation is fake — each needs a distinct light/dark structure.
- **Color is a RAMP, not a fill** — 3-4 value/temperature stops within each effect (fire blackbody
  white→gold→orange→ember; ice white→cyan→deep-teal). Reserve peak saturation+value for the focal point.
- **Per-element MOTION grammar** — kill the shared sin-pulse: fire **roil** (turbulent, non-sinusoidal), ice
  **static** (no tumble, rare crystalline twinkle), lightning **strobe** (quantized on/off, erratic), arcane
  **orbit** (smooth counter-rotation, no flicker). Slower-than-heartbeat = serene; faster = danger.
- **Anticipation + settle** — projectile grows/charges in; impacts get a per-element curve + low-value
  dissipation tail. Nothing premium "blinks into existence at full scale."
- **Anisotropy / squash-stretch** — stretch the body along velocity (from the velocity already in useFrame);
  lightning extreme (a line), fire vertical teardrop, arcane near-isotropic (the orbital exception).
- **Secondary motion** — capped InstancedMesh per element (6-8 motes): fire lagging embers, lightning
  offshoot sparks + after-image, arcane orbiting glyph motes, ice slow drifting splinters.
- **Make ICE non-additive** — solid faceted body (`NormalBlending` + `depthWrite`), emissive BELOW the 0.65
  threshold, bloom ONLY on a fresnel rim / edge highlights. An additive ice glow-ball is the worst offender.
  (Geometry-only first pass: an inverted-hull rim shell approximates fresnel without a shader — see §4.)
- **Palette lane-separation + saturation contrast** — resolve the ice/lightning blue collision (push
  lightning to white-violet `#C9B8FF`, highest value); desaturate ice (cold = desaturated); keep fire +
  arcane saturated; arcane is the only **duotone** (magenta + complementary cyan/gold accent).
- **Selective bloom discipline** — shrink the white hotspot to a small spec; push the SATURATED element hue
  into HDR (color>1, `toneMapped=false`) so the bloom HALO carries the element hue instead of white. Keep
  ice body below threshold. `pow()`-sharpen lightning/arcane cores so they bloom as crisp points.
- **Design the SET, not the spell** — deliberate cross-element contrast: lightning SMALL/FAST/thin/sparse/
  shortest-lived; fire MEDIUM/dense/billowing; ice SHARP/crisp/slow; arcane LARGE/slow/orbital.

## 3. Per-element redesign

### Fire — roiling heat comet (organic / additive / warm / medium-fast)
- **Silhouette:** replace the icosahedron with an upward, asymmetric **teardrop/comet** (taller than wide,
  breaks up at the top), pre-built static geometry; make the outer glow shell anisotropic (scale.y > x,z) so
  it licks rather than balls.
- **Motion:** `motion:'roil'` — turbulent, non-uniform x/y scale + slight upward bias; drop the tidy uniform
  spin. Non-sinusoidal (sum-of-sines / seeded), restless, no clean loop.
- **Color:** add `midColor:'#FFC24D'` (gold) → white-hot → gold → `#FF7A1A` orange → ember-red rim
  (blackbody ramp; currently only 2 stops). Highest/warmest saturation.
- **Anisotropy:** stretch along velocity, hot leading edge.
- **Secondary:** capped instanced embers that LAG behind + rise; faint low-value smoke at the tail.
- **Impact:** keep `burst` + add a lingering low-opacity smoke-puff follow-through (settle, not snap-off).
- **Contrast role:** the only organic/volumetric/additive element.

### Ice — frozen crystal cluster (solid / edge-bloom / desaturated / slow) — THE big fix
- **Material:** **solid faceted body, `NormalBlending` + `depthWrite`**, body emissive BELOW 0.65; bloom ONLY
  on a fresnel rim + edge highlights (geometry-first: a slightly-larger inverted-hull rim shell at higher
  emissive approximates fresnel with zero shader; the true ~4-line fresnel `dot(normal,viewDir)` is an
  optional Phase-2 polish, capture-safe via the pinned camera).
- **Silhouette:** replace the single dodecahedron with a **cluster of 2-3 intersecting sharp angular shards**
  at seeded angles/sizes (merge static geometry; sharp points read cold/dangerous).
- **Motion:** `motion:'static'` — NO tumble; rare low-amplitude crystalline twinkle only. Slowest element.
- **Color:** DESATURATED cyan/white body, bright near-white specular edges, faint internal blue; lower
  `glowOpacity` (0.20→~0.14) so facets read crisp + high-contrast.
- **Secondary:** a few slow-drifting angular splinter motes + low-opacity frost mist at the base.
- **Impact:** keep `shatter`; make it SNAP (fast ease-in) with MINIMAL ring expansion (contained, not
  explosive) + short decay + settle to slow glitter.
- **Contrast role:** the only matte/solid/edge-bloom body; opposite of fire on every axis.

### Lightning — hot crackling line (linear / instant / staccato / smallest-fastest)
- **Silhouette:** keep the bolt but make it **thinner + more jagged** (coarse path pass + fine wrinkle pass,
  asymmetric forks) and **DROP the spherical glow shell entirely** (`glowScale` 0.74 sphere → a thin axial
  glow), so it reads as a hot WIRE not a ball. Net draw-call reduction.
- **Material:** per-segment `meshBasicMaterial` pure additive hot wire (drop `meshStandardMaterial`);
  `pow()`-sharpen the core so it blooms as a crisp line.
- **Motion:** `motion:'strobe'` — discontinuous stepped on/off intensity + positional micro-jitter; re-seed
  the bolt pose per strike in gameplay (FROZEN seed in capture); never a smooth pulse.
- **Color:** resolve the blue collision — `glowColor #86B8FF → white-violet #C9B8FF`, core stays `#FFFFFF`.
  Highest value, lowest saturation.
- **Anisotropy:** extreme — a line aligned to velocity. **Anticipation:** fast crackle build → SNAP.
- **Secondary:** instant-pop offshoot sparks (die in 1-2 frames) + a faint after-image bolt.
- **Impact:** keep `fork`; make it INSTANT, flash peak ~40-90ms, shortest `maxAge` of all four.
- **Contrast role:** the only linear/instantaneous/erratic element.

### Arcane — hypnotic orbital rune-wheel (geometric / orbital / smooth / largest-slowest / duotone)
- **Silhouette:** keep the torus+glyph but make it a **wheel** spinning flat on one axis facing travel, +
  a **second counter-rotating inner ring** + a few **orbiting glyph motes** (secondary motion); asymmetric
  glyph, not a plain `+` cross. Reads as an intelligent mechanism.
- **Motion:** `motion:'orbit'` — smooth continuous counter-rotation at differing speeds/axes, NO
  flicker/scale-breathing. Slow-medium, hypnotic ("calm but wrong").
- **Color:** the only **duotone** — magenta `#B84DFF` core + a split-complementary accent (a touch of cyan
  or gold) on the rim/motes for otherworldly depth. `pow()`-sharpen core.
- **Impact:** keep the IMPLODING `rune` (inward collapse = absorption, the deliberate semantic opposite of
  everyone's outward burst) + a brief crisp geometric after-flash (reversed anticipation resolve).
- **Contrast role:** the only engineered/concentric/inward element; opposite of fire's chaos.

## 4. Shared systems (build once, reuse across elements)

- **`spellMotion.js` (NEW, pure)** — per-element motion-grammar functions keyed by `profile.motion`
  (`roil|static|strobe|orbit`): given `(phase, seed)` return the scale/rotation/intensity transform.
  Deterministic (seeded sin/step, the existing `seededUnit` pattern), frozen at `capturePhase` in capture.
  **Pure → unit-testable** (the gate for the motion slices).
- **`spellGeometry.js` (NEW, pure)** — module-load static builders for the asymmetric silhouettes
  (fire teardrop, ice shard cluster via `mergeGeometries`, arcane ring stack). Deterministic, zero runtime
  cost, byte-stable in capture. Returns `BufferGeometry` + baked `vertexColors` ramps.
- **Color-ramp** — bake 3-stop `vertexColors` into the static geometry (free, deterministic) OR one nested
  additive mid-layer mesh; add `profile.midColor`.
- **Secondary-motion pool** — one capped `InstancedMesh` per element type (≤8 motes), deterministic seeded
  orbits/offsets, 1 draw call each, `frustumCulled={false}` (the weather-cull lesson — they track the
  projectile), frozen in capture.
- **`ENERGY_PROFILE` new fields** (back-compat via `_defaultEnergy`): `motion`, `midColor`, `stretch`
  (velocity-elongation factor), `glowShape` (`sphere|conform|none`), `bodyBlend` (`additive|solid`).

## 5. Capture-determinism plan (load-bearing)
Every new motion/geometry reduces to: static seeded geometry, velocity-derived transforms, or
capture-frozen seeded phases. NO `Math.random` / NO unguarded `state.clock` in capture — drive all cadence
from `profile.capturePhase` + `seededUnit` (the existing `jitter`/`BOLT_SEGMENTS` pattern), gated by
`isCaptureMode()`. New birth/settle ages ride the already-frozen `deltaMs=0`. The regression frame stays
byte-stable. **Each render-affecting slice re-captures + self-eyeballs at HD; expect intended re-baselines
(batch the before/after into KEVIN-REVIEW per §4 BATCH cadence).**

## 6. Perf envelope (web + iPad + iPhone + swiftshader)
Differentiation comes from shape/motion/timing/palette discipline (cheap), NOT more particles. Silhouettes =
1-2 static meshes/element (merged); secondaries = 1 instanced draw each (capped ≤8); lightning DROPS its
glow sphere (net reduction); GPU spark pool (`SPARK_PROFILE`) stays capped/unchanged. Zero per-frame alloc
(reuse module scratch like `_trailDir`). **Geometry-first; shaders are Phase-2 optional.**

## 7. Adversarial self-review (the critique role — 5 dimensions)
- **Distinctiveness (post-redesign):** fire = organic teardrop, roil, warm ramp, additive; ice = solid
  shard cluster, static, desaturated, edge-bloom; lightning = thin strobing white-violet line, no glow ball;
  arcane = duotone orbital rune-wheel, inward impact. **Four distinct silhouettes + four distinct motion
  grammars + four distinct value structures** → passes the grayscale test by construction.
- **Capture-determinism risk:** the strobe + roil must be deterministic functions of the frozen phase — the
  ONE real risk. Mitigation: reuse the proven `seededUnit`+`capturePhase` pattern; unit-test the pure motion
  fns; re-capture every slice. NO shader in Phase 1 (removes the largest determinism risk).
- **Perf risk:** secondary-motion pools could add draw calls — capped to 1 instanced draw/element + only
  while the projectile is alive; lightning's dropped glow sphere offsets. Net ≈ flat.
- **Coherence / kitchen-sink:** stays inside the bold-flat + additive-geometry + bloom doctrine; restraint
  (2-3 stops/element, gradient-crunch) not more layers. No new texture atlases.
- **Explicitly NOT doing** (research AVOID-list): drei `MeshTransmissionMaterial` (render-target/sample cost,
  kills mobile, not capture-stable) → use the inverted-hull/fresnel approximation; drei `<Trail>` (per-frame
  history buffer, NOT capture-deterministic) → static seeded TubeGeometry if richer trails wanted; all
  TSL/WebGPU/`softParticles()` (stack is WebGL); heat-haze full-screen pass is Phase-3 optional + tier-gated
  OFF on swiftshader/iPhone.

## 8. Implementation slices (ordered; each = one committable, individually-gated unit)
Geometry-first (no shaders) Phase 1; each slice: characterization/static-gate + pure-helper unit test FIRST,
then build; capture-verify render-affecting slices (retry once on load-spike); bloom 0.65 preserved.

1. **S3.1 — `spellMotion.js` (shared, pure)** — the 4 motion-grammar fns + `ENERGY_PROFILE.motion` field
   (fire roil / ice static / lightning strobe / arcane orbit). Pure unit tests (deterministic given phase+
   seed; capturePhase frozen). Wire `SpellProjectileCore` useFrame to branch on it (replaces the shared
   sin-pulse + uniform spin). *Gate: spellMotion.test.js + spell-shape-gates retarget.*
2. **S3.2 — palette lane-separation + selective-bloom data** (`spellVisualProfiles.js` only) — lightning
   `#86B8FF→#C9B8FF`; desaturate ice + lower glowOpacity; add `midColor` per element; shrink core hotspot /
   push hue to HDR. *Gate: spell-color-unify-gates extend; pure data.*
3. **S3.3 — anisotropy + glow-shape conform** — velocity-stretch the core; lightning `glowShape:'none'`
   (drop the sphere → axial glow); fire `glowShape:'conform'` (anisotropic). *Gate: static seam-gate.*
4. **S3.4 — fire teardrop geometry + blackbody vertexColor ramp** (`spellGeometry.js`). *capture-verify.*
5. **S3.5 — ice solid shard cluster + non-additive body + inverted-hull rim** (the big visual fix).
   *capture-verify; the most look-bearing slice.*
6. **S3.6 — lightning thin fractal line + strobe + meshBasic wire.** *capture-verify.*
7. **S3.7 — arcane counter-rotating rune-wheel + duotone accent.** *capture-verify.*
8. **S3.8 — secondary-motion pools** (embers / sparks / glyph motes / ice splinters), capped instanced,
   frustumCulled=false, capture-frozen. *capture-verify.*
9. **S3.9 — impact + telegraph per-element timing/anticipation polish** (settle tails, snap vs billow,
   strobe-out, implode-resolve). *capture-verify.*
10. **(Optional Phase 2, Kevin taste) — minimal shaders:** fire vertex curl-noise roil; true ice fresnel rim.

## 9. Open taste questions for Kevin (batched to KEVIN-REVIEW — do NOT block)
- The redesign WILL move the spell baselines (intended re-baselines, batched per §4) — sign-off on the
  new look when the contact-sheet is ready.
- Phase-2 minimal shaders (curl-noise fire, true fresnel ice): worth the small determinism/perf risk for
  extra fidelity, or stay geometry-only? (Default: ship geometry-only, offer shaders as a follow-up.)
- Heat-haze on fire impact (tier-gated, off on mobile): want it, or skip? (Default: skip.)
- Related but separate: biome ground-tint not wired into the terrain shader (same-surface biomes look alike)
  — wire it for stronger biome identity? (Surfaced 2026-06-29; outside the spell mandate.)
