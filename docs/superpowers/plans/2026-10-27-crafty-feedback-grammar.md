# Crafty Phase 3: One Feedback Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a red edge means danger, a white flash means contact, a solid core with an ink outline means magic, and a siege night with 40 mobs costs a fraction of today's draw calls.

**Architecture:** the mob and spell feedback becomes uniforms on materials that already exist, not material floods: the windup drives rim and outline colour, the hit drives a lit-band flash term in the toon shader. Each mob becomes ONE vertex-coloured rig mesh whose legs swing in the vertex shader, with one ink hull and one eye mesh. Spells become a solid HDR core, an ink hull, one additive shell and a dark secondary. Impacts get pooled ground decals and voxel debris. Every shader term is a pure GLSL string module with a JS twin (the `oreGlow.js` / `leafFeel.js` pattern, DECISIONS 2026-10-27).

**Tech Stack:** React 19, three 0.172 (`frontend/node_modules/three/package.json:3`), @react-three/fiber 9.5, drei 10.7.9 (`node_modules/@react-three/drei/package.json:3`), vitest, Playwright, puppeteer.

**Spec:** roadmap move 11, `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json:175-190`, amended by refute F3 (`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md:25-35`) and the umbrella plan `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md:87-91`. Where they differ, the umbrella plan wins.

**Layout:** ROOT = `<repo>`; APP = `<repo>/frontend`. Every path below is relative to ROOT unless it starts with `src/`, `tests/` or `scripts/`, which are under APP. Run every command from APP.

## Goal

When a husk starts its swing, its ink outline heats to danger red (and its rim's colour with it, at the rim's ordinary strength) while its body keeps its toon shading, so the player reads the threat from the edge at any distance, at any hour, on the iPad's low tier as well as on a Mac. When the player's blow lands, the side of the mob facing the key light goes white for about 70 ms, its outline goes white, and it squashes for about 50 ms (three frames at 60 fps, the same duration at any refresh rate): contact, without the 300 ms white-out that hides the mob's shape today. A mob's eyes are the only part of it that glows. A spell reads as a solid coloured core with an ink line round it, a single glow and a dark wisp behind it, so it shows against a bright noon sky as well as at night, and an impact leaves a scorch or frost mark, a ring on the ground and a few chunky cubes of debris. None of this costs more GPU than today, and a siege night draws a fraction of today's mob draw calls, which matters most on the iPad's WebKit.

## Current state (cited)

Every line below was read on `main` at `f0e84766` on 2026-10-27. Line numbers on the steady-cool branch differ where noted.

**Mob telegraph and hit flash flood the whole body.**
- `src/render/MobModel.jsx:53-55` builds `hitColor` `#ffffff` and `chargeColor` `#ff3a00`.
- `:188` holds the hit flash for 300 ms of wall clock.
- `:190-193` ramps the charge intensity by `(0.6 + 0.4 * Math.sin(wnow * 0.025)) * windupRamp(...) ** 2 * 1.5`, a throb of about 4 Hz on a squared ramp, using the global `WINDUP_MS` (`:192`; `src/game/attackTelegraph.js:9`, 380 ms).
- `:195-219` traverses every mesh in the mob each frame. On a hit it writes white into `material.color` and `material.emissive` at intensity 1.5. During a windup it writes the charge colour into `emissive`. The whole body floods: the toon bands vanish exactly when the player most needs to read the mob.
- The colour restore exists because of that write (`src/render/mobFlash.js:1-33`).

**The pose already lives on the group, not on parts.** Dissolve, flinch, stagger and windup coil all write `modelRef.current` scale and rotation (`MobModel.jsx:138-185`). The roadmap's threat that merging "can break the directional flinch (MobModel.jsx:137-160) and deathFx, which address individual meshes" is refuted by these lines. Only the leg swing (`:241-244`, `:269-271`) and the leg IK (`:248-266`, which writes `mesh.position.y`) address individual meshes.

**Squash.** `MobModel.jsx:148-166` runs a 250 ms sine squash (Y 0.85, XZ 1.10) with a directional tilt from `flinchTilt` (`src/game/mobHitFx.js`). Neither reads the existing feedback dial `juiceIntensity` (`src/store/useGameStore.jsx:322-347`, which reduced motion drives to 0).

**The hit stamp.** `src/systems/CombatSystem.jsx:101` sets `entity.lastHit = performance.now()`.

**The rim already runs at every tier, at strength 0.**
- `MobToonMaterialImpl` installs the fresnel rim unconditionally (`src/render/MobToonMaterial.jsx:10-16`, `src/render/characterStyle.js:42-68`).
- MobModel zeroes the strength when the tier's `charRim` is false (`MobModel.jsx:51`). `charRim` is true only at high (`src/render/quality.js:20-32`).
- So the "all-tier rim" costs no new shader ALU: the term already executes on low and med, multiplied by 0.
- All rim materials share one program: `customProgramCacheKey = () => 'mobToonRim'` (`characterStyle.js:66`).
- Other users of the rim material: `src/render/BeastAvatar.jsx:134` and `src/render/mascots/voxelKit.jsx:19`.

**The toon band edge is at dotNL = 0, not 0.5.**
- three r172 samples the gradient at `coord = dotNL * 0.5 + 0.5` (`node_modules/three/src/renderers/shaders/ShaderChunk/gradientmap_pars_fragment.glsl.js`).
- With the 2-texel NearestFilter ramp (`characterStyle.js:25-38`), the lit band is therefore `dotNL >= 0`.
- The comment "hard step at dotNL=0.5" at `characterStyle.js:9` is wrong.
- Toon direct light runs through `RE_Direct_Toon` (`lights_toon_pars_fragment.glsl.js`).

**The eyes do not glow.**
- Hostile eyes are `meshBasicMaterial` `#ff0000` and cast shadows (`MobModel.jsx:293-300`).
- Linear luminance of pure red is about 0.21, under the Bloom `luminanceThreshold={0.65}` (`src/GameScene.jsx:121`), so the eyes never bloom. That is the whole reason.
- **A material's `toneMapped` flag does nothing in this scene.** three applies a material's tone mapping only when it renders straight to the screen (`node_modules/three/src/renderers/webgl/WebGLPrograms.js:165-172`, `currentRenderTarget === null`). The scene always renders into the EffectComposer's half-float buffer (`GameScene.jsx:90`, mounted with no tier gate at `:412`; @react-three/postprocessing's default `frameBufferType` is `HalfFloatType`). Tone mapping happens once, in the post chain, after Bloom: `<ToneMapping mode={ToneMappingMode.NEUTRAL} />` (`GameScene.jsx:126`), which is three's `NeutralToneMapping` (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:169-195`).
- **The Neutral tone map pulls a bright saturated colour toward white** in proportion to its peak (its `Desaturation = 0.15` mix). Measured on paper with a JS twin of that chunk (scratch probe, 2026-10-27): no red hue (`#ff3a00`, `#ff1a00`, `#ff0000`) can exceed a pre-tone-map luminance of about 0.59 and still come out with green and blue at or under half its red. `#ff3a00` lifted to luminance 0.65 at the strike renders at about sRGB (0.98, 0.46, 0.42), salmon; at a 1.05 threshold, (0.99, 0.58, 0.55). Unmeasured: the full chain's colour (grade, bloom halo, vignette) on a real frame.
- Villager eyes are green and the villager has a nose (`:304-322`).

**Draw calls per mob today, counted from the JSX.**
- The ink outline is on at every tier (`quality.js:20-32`, `charOutline: true`). Each `<Outlines>` adds one hull mesh. drei creates it as a plain `THREE.Mesh` (`node_modules/@react-three/drei/core/Outlines.js:113`), so the hull does not cast a shadow.
- Every part mesh in MobModel has `castShadow`.
- Parts: body and head with hulls (`:279-289`); hostile eyes (`:291-302`); legs, 4 with hulls in quad mode or 8 with hulls in spider mode (`:324-341`; the mode test is at `:240`/`:324`); features with hulls (`:345-351`; per-type counts at `src/game/mobFeatures.js:21-63`).
- **Not in the table: the nametag.** Every hostile within 30 m (`src/game/nametagData.js:6`, `:13-14`; passives and NPCs within 24 m) renders a billboarded troika `<Text>` (with an outline) plus a background plane and a bar plane (`src/render/Nametags.jsx:64-75`; one Tag per mob at `:89`). That is at least 3 main-pass draws per tagged mob; the Text's own count is measured in U0. This plan does not touch them. The table counts MobModel only, and every per-mob draw measurement below states which of the two it counts.

| type (display name) | hostile eyes | legs | features | main-pass draws | shadow draws per shadow render | total |
|---|---|---|---|---|---|---|
| pig (Boar) | 0 | 4 | 0 | 12 | 6 | 18 |
| cow (Ox) | 0 | 4 | 2 | 16 | 8 | 24 |
| zombie (Husk) | 2 | 4 | 2 | 18 | 10 | 28 |
| skeleton (Bonepicker) | 2 | 4 | 5 | 24 | 13 | 37 |
| spider | 2 | 8 | 0 | 22 | 12 | 34 |
| villager (Settler; green eyes + nose) | 2 | 4 | 2 | 20 | 11 | 31 |
| skitterling (`legMode: 'spider'`) | 2 | 8 | 2 | 26 | 14 | 40 |
| duskhound / moss_brute / emberhusk | 2 | 4 | 3 | 20 | 11 | 31 |
| hybrids, spider legs (dreadweaver, marrowspinner) | 0 (allies) | 8 | 0 | 20 | 10 | 30 |
| hybrids, quad legs (bonehide, grimhound) | 0 | 4 | 0 | 12 | 6 | 18 |

- The roadmap's "about 31 draws" is main plus shadow for the mid-weight hostiles; it holds.
- A night ramps to 40 mobs (`src/game/dayNight.js:90`, `:95-129`; tier mobs on top).
- With all 40 in view, that is 720 to 1,040 MobModel main-pass draws (plus at least 3 nametag draws for each hostile within 30 m, up to 120 more) and 400 to 560 shadow draws per shadow render. These are upper bounds: the main pass frustum-culls per mesh.
- After steady-cool lands, mobs count as dynamic casters, so the sun's shadow renders at up to 30 Hz in play (`feat/steady-cool:frontend/src/render/shadowSchedule.js:15`).

**The roadmap's "~6 draws" cannot be met with legs left as separate meshes.**
- A merged rigid body with its hull (2), plus eyes (1), plus four outlined legs (8) is 11 main-pass draws.
- Reaching about 6 or fewer means the legs move in the vertex shader. That is this plan's design (move M3).

**Outline thickness is in drawing-buffer pixels.**
- `characterStyle.js:13-17` sets the thickness; drei reads `gl.getDrawingBufferSize` when the `<Outlines>` component renders (`Outlines.js:81`, `:139`).
- MobModel is `React.memo` (`MobModel.jsx:28`). INFERENCE, to verify in U4: after steady-cool's pixel-budget dpr steps, a mounted mob's hull keeps the stale size until something re-renders it.

**Spells.**
- `SpellProjectileCore` (`src/render/spellVfx.jsx:156-437`) draws a per-element silhouette, an additive tinted core and an additive white-hot core (both with `depthTest={false}`, `:399`, `:410`), an additive outer glow, and a per-projectile trail (`:65-140`).
- Main-pass draws per projectile:
  - fire: 5 (teardrop, two cores, glow, trail);
  - ice: 5 (shards, cyan BackSide rim, two cores, trail; `glowShape: 'none'`);
  - lightning: 15 (5 segments, 2 forks, 5 white cores, two cores, trail; `:34-46`, `:251-280`);
  - arcane: 12 (3 sigil meshes, a torus, 4 motes, two cores, glow, trail; `:282-350`).
- Additive layers wash out against a bright sky. The profile comment says so: `src/game/spellVisualProfiles.js` fireball `glowOpacity` "additive orange over a bright sky washes pale-pink".
- `projectile.size` is the collision radius input (`src/EnhancedMagicSystem.jsx:346`, `checkMobCollision(projectile.position, projectile.size + 1.5, ...)`).
- Impacts: `SpellImpactPop` (`spellVfx.jsx:450-630`) draws an additive shock ring, a per-element decoration and an additive flash sphere.
- Sparks come from the shared pool, `src/world/GPUSparkSystem.jsx:8` (1,200 billboard additive planes, `:191-192`, `:239`). No debris and no ground mark exist.

**Lights: refute F3 is already built, on a branch.**
- `feat/steady-cool` commit `ce0ecd03` adds `src/render/lightPool.jsx`. Its `PooledLight` replaces the projectile and impact lights (`spellVfx.jsx:437`, `:621` on that branch), the cast hand, the chest beacons, the beast and the boss.
- The pool is a fixed per-tier size (`POOL_SIZE = { low: 2, med: 4, high: 6 }`).
- `poolFrame` snaps intensity on reassignment with no fade (`lightPool.jsx:56-82` there).
- This plan does not build a pool. It consumes `PooledLight`.

**The GPU probe cannot measure this milestone.**
- `scripts/visual/gpu-cost-probe.mjs:189` reads `renderer.info.render.calls` after a frame.
- three resets `info` at every `render()` call while `autoReset` is true (`node_modules/three/src/renderers/WebGLRenderer.js:1228`; default at `webgl/WebGLInfo.js:63`), and nothing in `src/` turns it off (grep for `autoReset` returns nothing).
- postprocessing calls `renderer.render` once per pass (`node_modules/postprocessing/build/index.js:563`, `:800`).
- INFERENCE, to confirm in U0: the probe's `drawCalls` is the last pass's count, not the scene's. A mob draw-call delta measured through it would read zero.

**Lookbook.**
- `feat/instruments` adds `scripts/visual/lookbook.mjs` and the prod seam `src/render/lookbookSeam.js`. The seam poses the camera and sets the time (`lookbookSeam.js:1-150` there); it cannot stage a mob, a windup, a hit or a spell.
- The DEV bridge has `readMobs` and `plantWindup` (`src/App.jsx:335-357`) and `spawnSpellCast` (`:649`). It is stripped from the prod build.

**Gates that assert today's flood (they change with this plan).**
- `tests/gates/attack-telegraph-gates.test.js:104-110` asserts `emissive.copy(chargeColor)` and the hit-flash precedence on emissive.
- `tests/gates/character-render-gates.test.js:74` carries "charRim stays high-only" in a comment.
- `tests/gates/mob-flash-restore-gates.test.js` asserts the authored-colour restore.
- `tests/gates/spell-shape-gates.test.js:69` asserts the spell shape materials.
- Rewriting any of their assertions needs a `Mutation-Proof:` trailer (the `mutation-proof-trailer` gate).

**Player strings in the file this plan rewrites.**
- `MobModel.jsx:62-68` (six villager greetings) and `:373` ("Villager") are hard-coded English. They bypass `t()`, against the rule at `src/i18n/strings.js:1-3`.
- The bubble says "Villager" while the registry calls the type "Settler" (`src/game/mobTypes.js:12`).

**Bytes.**
- The `index` chunk ceiling is 760,000 B (`scripts/ci/bundle-budget.mjs:35`).
- The last local build is 696,924 B (`frontend/build/assets/index-RM8RWfkj.js`, 2026-10-27 05:22; the branch it was built from is not recorded).
- That leaves about 63 KB of headroom before Phases 0-2 land. Re-measure before relying on it.

**Visual baselines that show mobs or spells.**
- Mobs: `tests/visual/baseline/mob-bestiary.png`, `character-closeup.png`.
- Spells: `spell-cast.png`, `spell-iceball.png`, `spell-lightning.png`, `spell-arcane.png`.
- Capture mode forces the high tier, and nothing in capture winds up or gets hit, so U1-U3 should not move any baseline. U4 must not either (it is meant to look identical; check B1a). U5-U7 will.

## Design

The thesis: every bright thing means something. Each move below names the meaning, its GPU cost and its main-chunk bytes. All byte figures are minified, uncompressed (what `bundle-budget.mjs` measures, `statSync().size`), estimated here and MEASURED in each unit's commit. None of this code runs only in rare moments (combat is the core loop), so all of it is main-chunk. The lookbook stage stays inside the seam module.

### M1. Telegraph through the edge (danger)

**Behaviour.**
- During a windup, `telegraph = windupRamp(wnow, windupUntil, windupMs) ** 2`. The square is today's coil ease (`MobModel.jsx:177`). `windupMs = entity.windupMs ?? WINDUP_MS`, so move 5's per-archetype windups ramp over their own length.
- **Decision (review amendment 15): today's 4 Hz throb is dropped.** It made a whole-body flood read as charging. On a 5 px edge its 0.6-1.0 factor would dim the edge during the last 100 ms, exactly when the strike is due, and the monotonic ramp is what tells the player the timing.
- **The ink outline carries the danger.** Its colour lerps from `OUTLINE.color` `#0b0e14` to `DANGER` `#ff3a00`. Its `toneMapped={false}` (`MobModel.jsx:282`) does nothing inside the composer (Current state) and is not relied on.
- **Whether the edge blooms is decided on a measured frame, not assumed (review amendment 5).** The Neutral tone map turns any red lifted past about 0.59 luminance toward salmon (Current state). Default: (b) the edge goes to plain `DANGER` (gain 1; through the tone map about sRGB (0.95, 0.25, 0.13), solid danger red) and does NOT bloom, so the eyes stay the mob's only bloom. Alternative: (a) an HDR gain so the edge crosses the bloom threshold near the strike, at the cost of a salmon core with a red halo. U2 step 3 shoots both on the lookbook windup frame at the live threshold and keeps (b) unless (a) still reads as danger red; the choice and its frame go into U2's commit body, and the U1/U2 gates encode the one chosen.
- **The rim's strength and power do NOT ramp (review amendment 2).** The fresnel term is computed from `vNormal` (`characterStyle.js:60-61`), which is constant across each flat box face, so on a box mob it is not an edge: raising the strength to 1.1 at power 1.6 adds up to +0.36 linear red to a face 60 degrees off the view and nearly the full strength to a top face seen at a grazing angle, a partial flood. The rim keeps `RIM.strength` 0.35 and `RIM.power` 2.5 through a windup. Its COLOUR lerps from the mood rim to `DANGER`, which keeps the umbrella's "rim and outline toward danger red" at today's rim magnitude. If U2's three-angle e2e shows the interior changing even so, the rim colour stays at the mood rim too and the outline alone carries the danger. An edge-only rim telegraph needs smoothed normals for the term (the hull's creased normals exist after U4); that is a follow-up, not this milestone.
- The body's emissive stays 0 during a windup.
- The rim runs at every tier. The `charRim` tier flag is deleted, because after this move nothing would read it (review amendment 11). The rim is coloured by mood: `RIM_BY_MOOD = ['#bfe2ff', '#e6ecff', '#ffd2c2']`, indexed by `moodRef.current` in [0, 2] (`src/render/mood.js:11`). Index 0 is explore, 1 is dusk/night (moon-white), 2 is obsidian.

**Precedence (unchanged).** Flash beats stagger beats telegraph beats rest (`MobModel.jsx:188-217`).

| | Cost |
|---|---|
| GPU | Zero new ALU for the all-tier rim. Zero for the telegraph: the rim colour is a uniform the shader already reads, and the outline colour is a uniform. Bloom cost is full-screen and unchanged. Draws +0. Programs +0 (cache key `mobToonRim` unchanged). |
| CPU | Removes the per-frame emissive writes on every part. |
| Bytes | about +1.5 KB (`src/render/feedbackGrammar.js`) |

### M2. A hit flash on the lit band (contact)

**The shader term.** `installRim` gains `uniform float uFlash` and one term after the rim:

```glsl
float fgLit = 1.0;
#if NUM_DIR_LIGHTS > 0
  fgLit = step(0.0, dot(normal, directionalLights[0].direction));
#endif
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uFlash * fgLit);
```

- `normal` and `directionalLights` are in scope in `main()` of the toon program.
- The key light is the one directional light (`src/render/Atmosphere.jsx:316`). Move 4 keeps a single directional light and hands it to the moon, so the lit band follows the moon at night.
- **Until move 4 lands, the lit band at night is the mob's underside (review amendment 8).** On main the light's direction follows the sun arc, which sits below the horizon all night (`src/render/mood.js:160`, `:165`, applied at `:198`; written into the light at `Atmosphere.jsx:298-299`). `step(0.0, dot(normal, lightDir))` then whitens the downward faces, and during a siege the body flash is mostly invisible. **So U3 depends on move 4's moon handoff** (umbrella Phase 1, which precedes Phase 3). If U3 must land first, the term gates on the light's elevation, `dot(directionalLights[0].direction, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz) > 0.0`, and falls back to the upward-facing faces when the light is below the horizon (about 3 more ALU; the GLSL gate and the JS twin cover both branches).
- `fgLit` ignores cast shadow: a mob standing in a shadow flashes on its light-facing side, which renders in the shadow band. Accepted and stated: the flash marks contact, and the white outline carries it either way. The flash is on the light-facing side, whichever side was struck; the directional tilt is what shows where the blow came from.

**The sequence, frame-counted so a slow device cannot skip it.**
- On a new `lastHit` stamp the mob enters FLASH. Flash holds while `now - stamp < FLASH_MS` (70) OR fewer than `MIN_FLASH_FRAMES` (1) flash frames have been rendered.
- Then SQUASH runs for `SQUASH_MS` (50) of wall clock AND at least `MIN_SQUASH_FRAMES` (2) rendered frames. Its amplitude follows the curve through `SQUASH_AMPS` `[1, 0.6, 0.25]` at u = 0, 1/3, 2/3 of the window (and 0 at its end), against today's peak scale (Y 0.85, XZ 1.10). Then REST. At 60 fps that is the roadmap's "3 frames"; at 120 Hz with the frame cap off (`useGameStore.jsx:334-338`, `frameCap` 0) it is 6 frames and at 30 fps 2, all about 50 ms. A frame count would have lasted 25 ms on a ProMotion display and 100 ms on a slow iPad, the defect `src/game/trauma.js:41-47` already fixed once for screen shake (review amendment 7).
- During FLASH the outline is `CONTACT` `#ffffff`.
- The directional tilt keeps its 250 ms wave (`MobModel.jsx:156-166`), because the tilt is what tells the player where the blow came from.

**Reduced motion.**
- `uFlash = flash * juice`, so at `juiceIntensity` 0 the body does not flash and the white outline alone marks contact.
- The squash scales with `juice`.
- The flash window shrinks from 300 ms of whole-body white to 70 ms on the lit band.

| | Cost |
|---|---|
| GPU | About 4 ALU per mob fragment (dot, step, mix). Draws +0, programs +0. |
| Bytes | about +0.6 KB |

### M3. One rig mesh per mob (the draw-call merge)

**`src/render/mobRig.js` (pure).**
- `mobPartSpecs(entity)` turns today's JSX transforms into data: body, head, the villager nose, features, quad or spider legs, and the eye boxes. The values are copied verbatim from `MobModel.jsx:279-351`.
- `buildRigGeometry(parts)` appends every rigid and leg box into one INDEXED `BufferGeometry` (24 vertices per box, as `BoxGeometry` has today; it must stay indexed, see the hull below) with these attributes:
  - `position`, `normal`;
  - `color`: the absolute part colour, baked as the LINEAR values `THREE.Color` holds after parsing the hex (a vertex colour is read as linear; writing the hex's sRGB components would render every mob lighter);
  - `aLeg`: 0 for rigid, 1-8 for a leg;
  - `aPivot`: the leg's rest position.
- The spider legs' static rotation `[0, 0, PI/4]` (`:335`) is baked into `position`.

**The vertex chunk (generated by `rigGlsl()`).**
- For a leg vertex: `transformed = aPivot + vec3(0, uLegLift[i], 0) + rotX(uLegSwing[i]) * (position - aPivot)`, and `objectNormal = rotX(uLegSwing[i]) * objectNormal`.
- This is exactly three's Euler XYZ (`Rx * Ry * Rz`) applied today to a leg mesh at `position = pivot + lift` and `rotation = (swing, 0, rotZ)`.
- `rigLegMirror` is its JS twin.

**The materials.** Three of them read the SAME `Float32Array`s for `uLegSwing[8]` and `uLegLift[8]`, so one write moves the leg in all three:
- the toon material (`MobToonMaterialImpl` with `userData.rig = true`: program key `mobToonRim+rig`, `vertexColors`, white `color`);
- `createInkOutlineMaterial({ rig: true })` in `src/render/inkOutlineMaterial.js`: drei's outline vertex and fragment shader (`Outlines.js:15-59`) with the rig chunk, `BackSide`, and one shared `size` uniform object that `<OutlineSizeSync />` writes from `gl.getDrawingBufferSize` on mount and on every resize or dpr step. That last point fixes the stale-thickness inference above. `toneMapped` is not set: it has no effect inside the composer;
- `createRigDepthMaterial()` as `mesh.customDepthMaterial`, so the shadow legs swing too.

**The rest of the mob.**
- The hull geometry is `toCreasedNormals(rigGeometry, Math.PI)` from `three-stdlib`, the call drei makes (`Outlines.js:117`). drei already imports it, so it adds no bytes.
- **This is safe only because the rig geometry is indexed (review amendment 1).** For an indexed input the function works on `geometry.toNonIndexed()`, a copy. For a non-indexed input it rewrites that geometry's own `normal` attribute in place and returns the same object (`node_modules/three-stdlib/utils/BufferGeometryUtils.js:579`, `:624-625`). Measured with a scratch probe: on a non-indexed box it returned `same true`, and the first face's normals went from `1,0,0` to `0.408,0.408,0.816`. A non-indexed rig would give the body corner-averaged normals and a diagonal light/shadow split on every face. The hull comes out non-indexed (36 vertices per box, as drei's is today) and carries `aLeg` and `aPivot`, which `toNonIndexed` copies. The U4 hull gate asserts both properties.
- The eyes become ONE mesh (`meshBasicMaterial`, `castShadow={false}`), a child of `modelRef` so the flinch and the dissolve carry it.
- The cover aura (`MobModel.jsx:357-360`) is unchanged.
- The bounding sphere grows by `LEG_SWING_MARGIN = 0.6` so a swinging leg is never frustum-culled.
- Geometry is cached by `rigKey(entity)`: type, legMode, dimensions and colour. There are 10 types and 4 hybrids, all with fixed colours (`src/game/mobTypes.js:6-21`, `src/game/hybrids.js:13-29`), so the cache stays small. It is reference-counted and disposed on last release.

**Per frame.** The leg swing and IK formulas move from mesh writes into the two arrays, with the same math (`MobModel.jsx:236-272`). The traverse at `:195-219` is deleted; the frame writes about 8 uniforms instead.

**Draws per mob.** MobModel's own, main pass: rig 1 + hull 1 + eyes 1 (0 eyes on a pig or cow), so 2-3. Shadow: 1. The nametag's draws (at least 3 within range) are unchanged by this plan.

| | Cost |
|---|---|
| Main-pass draws (MobModel only) | 12-26 per mob down to 2-3 |
| Shadow draws per shadow render | 6-14 per mob down to 1 |
| 40-mob night, all in view (nametags not counted) | main 720-1,040 down to at most 120; shadow 400-560 down to 40 per shadow render |
| Vertex work | Same vertex count as today (the rig indexed at 24 per box; the hull non-indexed at 36 per box, as drei's is), plus about 12 ALU per leg vertex |
| Fragment work | Unchanged |
| Programs | +3, each compiled once: rig toon, rig ink, rig depth. Warmed at world load (U4 step 9), so the first spawned mob does not hitch. |
| CPU | Down: no per-part traverse, and three's per-draw cost about 10x lower for mobs. WebKit's per-draw cost makes this the iPad's largest win (roadmap move 11 rails). |
| Bytes | about +5 KB for the rig, ink and depth modules, about -2 KB of MobModel JSX, so about +3 KB net |

### M4. Part tones and HDR eyes (identity and threat)

**Tones.**
- `src/game/mobTones.js` gives each archetype at most 2 tones BEYOND its body colour and its existing feature tones (`bone` and `dark` from `featureColor`, `mobFeatures.js:105-109`; used by the skeleton, `:45-49`, moss_brute, `:27-30`, and emberhusk, `:53-56`), as data, in vertex colours:
  - a lighter face or belly plate, as a flush box;
  - darker extremities (legs and arm features at x0.7);
  - one strap or band, in the extremity colour, so it adds no colour of its own (review amendment 14).
- The silhouette does not change: plates and straps sit within 0.03 of the body faces, the convention of the skeleton ribs (`mobFeatures.js:46-48`), and the gate checks containment, not a bounding box.

**Eyes.**
- Hostile eyes get the colour `#ff0000` x `hdrGain('#ff0000', BLOOM_THRESHOLD, 1.25)`. They are the mob's only bloom: a threat's tell. The gain is what makes them bloom; `toneMapped` is irrelevant inside the composer (Current state).
- Through the Neutral tone map their core reads hot red-pink (on paper about sRGB (0.99, 0.58, 0.58) at threshold 0.65), with a red halo. The eyes are tiny, so the halo carries the colour; judge it on the lookbook night frames, and lower the margin if the core reads pink rather than hot.
- Villager eyes stay tone-mapped green. A settler is not a threat, so it does not glow.
- `hdrGain` computes linear Rec. 709 luminance. Verify the weights against the Bloom `LuminanceMaterial`, which calls `luminance()` at `node_modules/postprocessing/build/index.js:3486`, before writing the constant.
- `BLOOM_THRESHOLD` is read from ONE export (see Open questions).

| | Cost |
|---|---|
| GPU | Draws +0. About 150 vertices per archetype. The eyes' bloom contribution is a few pixels. |
| Bytes | about +1 KB |

### M5. Spell projectile grammar (magic)

**Layers, from `src/render/spellGrammar.js`.** Each element gets exactly four layers:
1. **A solid saturated core.** `NormalBlending`, `depthWrite: true`, colour x `hdrGain(..., BLOOM_THRESHOLD, 1.2)`, so the core is the bloom source. A core lifted past the threshold tone-maps toward white at its centre (Current state), so its saturation is carried by the ink ring and the halo; the gain is checked through the `neutralToneMap` twin and the lookbook noon frame before it is fixed. The cores: fire teardrop with its vertex-colour ramp (`src/render/spellGeometry.js`); ice shards; lightning segments and forks merged into one geometry; arcane sigil wheel, torus and motes merged into one geometry.
2. **An ink hull.** `createInkOutlineMaterial({ rig: false })`: the same pixel-constant ink line as the mobs.
3. **ONE additive shell**, the element colour at low opacity.
4. **A dark secondary.**

| element | dark secondary | colour |
|---|---|---|
| fire | smoke | `#2a1a14` |
| ice | mist | `#26404d` |
| lightning | ozone haze | `#1c1838` |
| arcane | void | `#140a24` |

- **One source for the layers (review amendment 12).** `spellVfx.jsx` takes every projectile mesh's material from `createSpellMaterials(element)`, which builds them from `spellLayers(element)`; the JSX declares no material of its own. A DEV `readSpellMaterials(projectileId)` walks the mounted projectile group, so the e2e can see an extra or wrong layer added in the JSX.
- The secondaries are emitted as puffs into ONE shared instanced `SpellPuffPool`: normal blend, depthWrite off, at most 64 puffs.
- The two additive core spheres, including the `depthTest={false}` one (`spellVfx.jsx:386-412`), are deleted.
- Everything scales by `SPELL_VISUAL_SCALE = 1.5` on the VFX group ONLY. `projectile.size` is untouched, because it is the hit radius (`EnhancedMagicSystem.jsx:346`).
- Lights stay `PooledLight` (steady-cool).

| | Cost |
|---|---|
| Draws per projectile | fire 5 to 4, ice 5 to 4, lightning 15 to 4, arcane 12 to 4, plus 1 shared puff draw while any puff lives |
| Fill | The scale enlarges coverage 2.25x, but the additive layers per pixel drop from about 3 to 1. ESTIMATE: additive overdraw per projectile at most today's. The opaque core gains early-z. |
| Programs | +1 plain ink, +1 puff |
| Bytes | about +2.5 KB new, about -1.5 KB JSX removed, so about +1 KB net |

### M6. Impact grammar (contact, for magic)

**`src/render/impactGrammar.js` (pure).** Per element:
- a ground mark: scorch for fire, frost for ice, violet scorch for lightning, void for arcane;
- an expanding ground ring;
- 6 to 10 chunky voxel debris cubes (lightning 6, arcane 8, ice 10, fire 10), velocities seeded through `makeSeededRandom` (`src/devtest/captureMode.js`);
- the existing shock ring.

**`src/render/ImpactPools.jsx`.**
- `<ImpactDecalPool>`: one `InstancedMesh` of flat quads, at most 24, ShaderMaterial. A per-instance kind, age and colour draws a ring or a blot procedurally. `polygonOffset`, `depthWrite: false`.
- `<DebrisPool>`: one `InstancedMesh` of boxes, at most 160, ballistic in the vertex shader like `GPUSparkSystem.jsx:36-50`. Normal blend and lit flat colour: debris is matter, not light, so it does not glow.
- Both set `visible = liveCount > 0`, so idle cost is 0 draws.
- Both mount inside EnhancedMagicSystem's returned group (`EnhancedMagicSystem.jsx:486-504`), not in GameScene.

**Spawning.**
- `spawnImpact(position, element)` is called from `createSpellImpact`.
- The decal sits at the floor under the impact: `store.getMobFloor(x, z, y + 0.5)`, the call MobModel's IK uses (`MobModel.jsx:257`). If that returns nothing, it sits at the impact's own y.

| | Cost |
|---|---|
| Draws | +2 while any impact lives, +0 idle. The per-element decorations (shatter spokes, fork lines; `spellVfx.jsx:50-61`) are kept. |
| Fill | Decals: about 3 m² of transparent ground each, at most 24 live. Debris: 12 triangles per cube. |
| Programs | +2 |
| Bytes | about +3.5 KB |

### M7. Instruments (U0)

**A real draw counter.** `scripts/visual/_glDrawCounter.mjs`:
- wraps `drawArrays`, `drawElements`, `drawArraysInstanced`, `drawElementsInstanced` and `drawRangeElements` on the canvas's WebGL2 context;
- counts per `requestAnimationFrame`;
- exports a pure `summariseDraws(frames)`.

`gpu-cost-probe.mjs` reports `glDraws` beside the old `drawCalls`, which it relabels.

**A lookbook combat stage.** It extends the seam with `__craftyLookbook.stage({ type, distance, moment })`, where `moment` is `'idle'`, `'windup'`, `'hit'` or `'impact:<element>'`.
- It requires `?lookbook=1` AND an active pose, the seam's two locks (`lookbookSeam.js:9-12`).
- It spawns through the injected store's `spawnMob` and sets `entity.lookHold`. The pure `mobLook` honours `lookHold` by holding the telegraph at 0.8 or holding FLASH. No other code path sets the field.
- **The stage is a lazy chunk (review amendment 16).** It never runs in play, so `installLookbookSeam` loads `src/render/lookbookStage.js` with a dynamic `import()` only when `?lookbook=1` is present (the umbrella's rule for rare-moment code, `2026-10-27-crafty-masterpiece.md:107-108`).
- The seam's header says it may "pose the camera, set the time of day and make input live in the production build — and nothing else" (`feat/instruments:frontend/src/render/lookbookSeam.js:5-7`). The same commit rewrites that header to name the wider surface: staging a mob, holding its look, spawning an impact.

| | Cost |
|---|---|
| Bytes | about +1 KB in a lazy chunk; about +0.1 KB in `index` for the dynamic import |
| GPU | 0 in play |

**Totals.** Main-chunk bytes about +10.7 KB (M1 1.5, M2 0.6, M3 3, M4 1, M5 1, M6 3.5, M7 0.1; the stage is lazy, and the i18n change is detached, review amendment 16).
- GPU on a siege night: CPU frame time down, from up to about 600-900 fewer MobModel main-pass draws and 360-520 fewer shadow draws with all 40 in view. The measured target is set per in-view mob (Acceptance 2), because a siege does not control how many mobs are on screen.
- Fragment work flat to slightly up: the flash term on mob pixels, and the decals.
- This matches the roadmap's target, "lower CPU frame time on siege nights with GPU flat" (`roadmap-2026-10-27.json:182`).
- All of these are targets until U0's counter and the perf scenarios measure them.

## Global Constraints

- **No WebGPU or TSL, and no three bump.** New shader terms are pure GLSL string generators with JS twins, built from the same constants (DECISIONS 2026-10-27; pattern `feat/steady-cool:frontend/src/world/oreGlow.js`).
- **Death stays soft.** Nothing here touches respawn.
- **Bytes.** The `index` chunk stays at or under 760,000 B (`bundle-budget.mjs:35`). Raising a ceiling is forbidden (`bundle-budget.mjs:30-31`). Each unit's commit message states its measured `index` delta.
- **Game-loop isolation.** No `useState` or zustand subscription is driven per frame.
  - MobModel writes uniforms through refs.
  - Pools are refs plus instanced attributes.
  - Spawning goes through module-level imperative functions.
  - The only zustand read in MobModel stays the tier subscription (`MobModel.jsx:49`). It changes on a tier step, not per frame.
- **No emoji in `src/`.**
- **i18n.** Every player string goes through `t()`, with en and zh-CN keys in `src/i18n/strings.js`. zh-CN must cover every en key (`strings.js:1-3`).
- **iPad.** The low tier and WebKit must stay correct. The rim and edge telegraph run at every tier. No unit adds a dynamic light.
- **Capture determinism.** VFX that run in capture use seeded randomness (`makeSeededRandom`), never `Math.random`. Capture guards RESET to a declared value and never early-return (`.agent/AGENTS.md`, the capture-guard bullet).
- **Commits.** No AI footer. A visual-baseline re-shoot is its own commit with a `Baseline-Review:` trailer and no `src/` change. It comes after the 147-to-151 re-baseline, which is done alone first (DECISIONS 2026-10-27).
- **Gates.** A new or rewritten gate under `tests/gates/` carries a `Mutation-Proof:` trailer, and every gate states its denominator (`.claude/rules/gates-and-probes.md`). New gates EXECUTE the subject, so the frozen source-grep ledger does not rise.
- **Do not edit by `sed`.** Edit `.js`/`.jsx` only with AST-safe tools or Edit.

## Review Focus

1. **A 5 fps device, or a loaded CI runner, renders no frame inside a 70 ms flash.** The frame-counted `MIN_FLASH_FRAMES` guarantees one flash frame. Tested in U3 step 1, `hitSequence holds FLASH for one rendered frame when the frame interval exceeds FLASH_MS`.
2. **A mob is hit again mid-squash or mid-flash.** A new stamp restarts FLASH. Tested in U3, `a second stamp during SQUASH restarts FLASH`.
3. **A windup is cancelled by a perfect dodge (stagger) or interrupted by a hit.** The edge must drop to rest or contact the same frame. Tested in U2, `stagger clears the telegraph` and `flash beats telegraph`.
4. **A projectile looks bigger but must not hit wider.** Tested in U6, `the visual scale never reaches projectile.size` (drives `checkMobCollision`'s radius input through the spawn path).
5. **A tier step or dpr step while mobs are mounted must not leave hulls at the old thickness, and a spell's hull must have a size when no mob exists.** Tested in U4, `ink outline materials share one size uniform that follows the drawing buffer` and `the outline size is set with no mob mounted`.
6. **A windup seen from the side or from above.** A box face has no fresnel edge, so a ramped rim would tint whole faces. Tested in U2's e2e at 0, 45 and 90 degrees (amendment 2).
7. **A 120 Hz display with the cap off, or a 30 fps iPad.** The squash lasts about 50 ms on both. Tested in U3, `SQUASH lasts SQUASH_MS, not a frame count, at 120 and 30 fps` (amendment 7).
8. **Night before move 4.** The key light is below the horizon, so the lit band is the underside. U3 waits for the moon handoff or carries the elevation fallback (amendment 8).

---

## Units

Build order: U0, U1, U2, U3, U4, B1a, U5, B1b, U6, U7, B2. (The former U8, the settler's lines in i18n, is detached into its own change; review amendment 16.)

Dependencies:
- U0's lookbook stage needs `feat/instruments` merged. Its draw counter does not.
- U3 needs move 4's moon handoff (umbrella Phase 1) for its night behaviour, or the elevation fallback in M2 (review amendment 8).
- U6 and U7 need `feat/steady-cool` merged (`PooledLight` in `spellVfx.jsx`).
- U1, U2, U4 and U5 need neither branch.
- Each unit ends green and pushable.
- Reviews per the programme: a fresh `/code-review xhigh` per unit, plus one `adversarial-reviewer-kz` at xhigh on U4 (a vertex-shader seam no gate fully sees) and on U7 (a capture-determinism seam).

### Task U0: Instruments: a GL draw counter and the lookbook combat stage

**Files:**
- Create: `scripts/visual/_glDrawCounter.mjs`
- Modify: `scripts/visual/gpu-cost-probe.mjs:183-200` (add `glDraws`; relabel `drawCalls` as "last renderer.render() only")
- Modify (after `feat/instruments` merges): `src/render/lookbookSeam.js` (add `stage`), `scripts/visual/_lookbook.mjs` (a `COMBAT_MOMENTS` shot plan), `scripts/visual/lookbook.mjs` (a `--combat` mode), `src/index.jsx` (inject `ecs` and `spawnSpellImpact` into the seam)
- Test: `tests/scripts/gl-draw-counter.test.js` (its subject is a probe script, so it is sited under `tests/scripts`; say so in the file), `tests/gates/lookbook-seam-gates.test.js` (extend)

**Interfaces:**
- Produces:
  - `drawCounterSource(): string`, a self-contained function source evaluated in-page, which installs `window.__glDraws = { frames: number[], reset(): void }`;
  - `summariseDraws(frames: number[]) -> { n, median, max, p95 }`;
  - seam `stage({ type: string, distance: number, moment: 'idle'|'windup'|'hit'|`impact:${'fireball'|'iceball'|'lightning'|'arcane'}` }) -> { id } | { refused: string }`.
- Consumes: `installLookbookSeam(win, deps)` (`feat/instruments:frontend/src/render/lookbookSeam.js:110`).

- [ ] **Step 1: Write the failing counter test**

```js
// tests/scripts/gl-draw-counter.test.js — subject is a probe script; behaviour run against a fake context.
it('counts every draw entry point, per frame', () => {
  const ctx = fakeGl(); const win = fakeWindow(ctx);   // rAF queue driven by the test
  new Function('window', drawCounterSource())(win);
  ctx.drawElements(); ctx.drawArrays(); ctx.drawElementsInstanced(); ctx.drawArraysInstanced(); ctx.drawRangeElements();
  win.__tickFrame();
  ctx.drawElements(); win.__tickFrame();
  expect(win.__glDraws.frames).toEqual([5, 1]);
});
it('summariseDraws refuses an empty denominator', () => {
  expect(() => summariseDraws([])).toThrow(/no frames/);
  expect(summariseDraws([3, 5, 4])).toEqual({ n: 3, median: 4, max: 5, p95: 5 });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/scripts/gl-draw-counter.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `drawCounterSource()` and `summariseDraws()` in `scripts/visual/_glDrawCounter.mjs`.** Wrap on the context INSTANCE the page's canvas returns (not the prototype), and reset per rAF. Run it in `gpu-cost-probe.mjs` before `page.goto` via `page.evaluateOnNewDocument`, and print `glDraws median/max` beside `drawCalls`.
- [ ] **Step 4:** Run the test. Expected: PASS, 2 tests.
- [ ] **Step 5: Mutants** (cp backup, restore, `cmp`):
  - **K0a:** remove the `drawElementsInstanced` wrap. Expected: test 1 RED (`[4, 1]`).
  - **K0b:** `summariseDraws([])` returns zeros. Expected: test 2 RED.
  - Identity (no edit): GREEN.
- [ ] **Step 6: Lookbook stage, red-first** (after `feat/instruments` merges). Extend `tests/gates/lookbook-seam-gates.test.js`:
  - `stage is refused without a pose` (`{ refused: /pose/ }`);
  - `stage is absent when the URL lacks ?lookbook=1` (`__craftyLookbook` undefined);
  - `stage('windup') spawns through the injected spawnMob and sets lookHold 'windup'` (a fake store and ecs; assert the call and the field; denominator: 1 spawn);
  - `stage refuses an unknown type`.

  Run `npx vitest run tests/gates/lookbook-seam-gates.test.js`. Expected: FAIL on the 4 new cases.
- [ ] **Step 7: Implement `stage` in `src/render/lookbookSeam.js`.**
  - Spawn at `distance` m along the posed camera's forward, on the floor via the injected store's `getMobFloor`.
  - For `impact:<el>`, call the injected `spawnSpellImpact(position, el)`.
  - Add `COMBAT_MOMENTS` to `_lookbook.mjs` and a `--combat` mode to `lookbook.mjs`. That mode shoots `zombie`, `duskhound` and `skitterling` at `windup`, `zombie` at `hit`, and each element at `impact`, at cycles 0.30 and 0.75.
  - Run the test. Expected: PASS.
- [ ] **Step 8: Measure TODAY's per-mob draws** (before U4, on an idle machine, prod build). `node scripts/visual/gpu-cost-probe.mjs --json <scratch>/draws-before.json` with 0, then 8 zombies staged in view (a `--stage zombie:8` flag on the probe). Record `(median8 - median0) / 8` in the plan's acceptance table below. Expected, if the probe sees it: about 18 MobModel draws plus the nametag's (at least 3; 8 zombies 3 m away are all inside its 30 m range) on a frame without a shadow render, so about 21 or more, and about 10 more on a frame with one. The prod build has no DEV bridge to split the two; U4 step 7's DEV e2e measures the nametag's share and records it in the acceptance table.
- [ ] **Step 9: Commit**

```bash
git add frontend/scripts/visual/_glDrawCounter.mjs frontend/scripts/visual/gpu-cost-probe.mjs frontend/tests/scripts/gl-draw-counter.test.js
git commit -m "test(probe): count GL draws per frame at the context — renderer.info resets every render() call, so the probe's drawCalls was the last pass's count" -m "Mutation-Proof: K0a drawElementsInstanced unwrapped -> counter test RED; K0b empty summary -> denominator test RED; identity GREEN"
```

(The seam and lookbook changes are a second commit once `feat/instruments` is on main, with the K-mutants of step 6 in its trailer.)

### Task U1: The feedback shader term and the pure grammar (no behaviour change yet)

**Files:**
- Create: `src/render/feedbackGrammar.js`, `src/render/hdrGain.js`
- Modify: `src/render/characterStyle.js:9` (correct the band comment to dotNL = 0), `:42-68` (`installRim` adds `uFlash` and splices `feedbackGlsl().apply` after the rim line)
- Test: `tests/gates/feedback-grammar-gates.test.js`

**Interfaces:**
- Produces:
  - `DANGER = '#ff3a00'`, `CONTACT = '#ffffff'`, `FLASH_MS = 70`, `MIN_FLASH_FRAMES = 1`, `SQUASH_MS = 50`, `MIN_SQUASH_FRAMES = 2`, `SQUASH_AMPS = [1, 0.6, 0.25]` (the curve's knots at u = 0, 1/3, 2/3), `RIM_BY_MOOD`, `EDGE_GAIN` (1 under the default (b) of M1; set from the measured frame if (a) is chosen). No telegraph rim strength or power: the rim does not ramp (review amendment 2);
  - `telegraphLevel(ramp: number) -> number` (`ramp ** 2`, clamped 0..1);
  - `rimForMood(mood: number, out: THREE.Color) -> THREE.Color`;
  - `edgeLook({ telegraph, flash, juice, mood, bloomThreshold }, out) -> { rim: Color, rimStrength, rimPower, outline: Color, bodyFlash }`;
  - `feedbackGlsl() -> { decl: string, apply: string }`;
  - `shadeMirror({ rgb, normalDotKey, rimDot, rim, rimStrength, rimPower, flash }) -> [r, g, b]` (the JS twin of the rim line plus `apply`);
  - `hdrGain(hex: string, threshold: number, margin: number) -> number` and `linearLuminance(color: THREE.Color) -> number` in `hdrGain.js`;
  - `neutralToneMap(rgbLinear: number[]) -> number[]` in `hdrGain.js`, the JS twin of three's `NeutralToneMapping` (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:169-195`, the chunk the post chain's ToneMappingEffect includes), and `toneMappedSrgb(hex, gain) -> [r, g, b]`, so every HDR gain in this plan is chosen from the colour the player sees (review amendment 5).

- [ ] **Step 1: Write the failing gates**

```js
it('flash 0 is the identity on every channel (beast and props share this program)', () => {
  for (const rgb of [[1,0,0],[0,1,0],[0,0,1],[0.5,0.4,0.3]])              // primaries: rule 3b
    for (const nDotKey of [-0.7, 0, 0.6])
      expect(shadeMirror({ rgb, normalDotKey: nDotKey, rimDot: 0.3, rim: [0,0,0], rimStrength: 0, rimPower: 2.5, flash: 0 })).toEqual(rgb);
});
it('a flash whitens the lit band and leaves the shadow band', () => {
  const lit = shadeMirror({ rgb: [0.2,0.3,0.1], normalDotKey: 0.4, rimDot: 0, rim: [0,0,0], rimStrength: 0, rimPower: 2.5, flash: 1 });
  const dark = shadeMirror({ rgb: [0.2,0.3,0.1], normalDotKey: -0.4, rimDot: 0, rim: [0,0,0], rimStrength: 0, rimPower: 2.5, flash: 1 });
  expect(lit).toEqual([1,1,1]); expect(dark).toEqual([0.2,0.3,0.1]);
});
it('the band edge is dotNL = 0 (the 2-texel ramp), not 0.5', () => {
  expect(shadeMirror({ rgb: [0,0,0], normalDotKey: 0.25, rimDot: 0, rim: [0,0,0], rimStrength: 0, rimPower: 2.5, flash: 1 })).toEqual([1,1,1]);
});
it('the generated GLSL carries exactly one flash mix, gated by the key-light band', () => {
  const { decl, apply } = feedbackGlsl();
  expect(decl).toBe('uniform float uFlash;');
  expect(apply.match(/mix\(gl_FragColor\.rgb, vec3\(1\.0\), uFlash \* fgLit\)/g)).toHaveLength(1);
  expect(apply).toMatch(/step\(0\.0, dot\(normal, directionalLights\[0\]\.direction\)\)/);
});
it('hdrGain lifts each primary exactly to threshold x margin (linear Rec.709)', () => {
  for (const [hex, t] of [['#ff0000', 0.65], ['#00ff00', 0.65], ['#0000ff', 1.05], ['#ff3a00', 1.05]]) {
    const c = new THREE.Color(hex).multiplyScalar(hdrGain(hex, t, 1.25));
    expect(linearLuminance(c)).toBeCloseTo(t * 1.25, 5);
  }
});
it('neutralToneMap mirrors three r172: identity under the knee, compressed and desaturated above it', () => {
  expect(neutralToneMap([0.5, 0.3, 0.2])).toEqual([0.46, 0.26, 0.16].map((v) => expect.closeTo(v, 5)));   // offset 0.04 only, peak < 0.76
  const [r, g, b] = neutralToneMap([3.35, 0.142, 0]);                                // #ff3a00 (linear 1, 0.0423, 0) x 3.35
  expect(g / r).toBeGreaterThan(0.2);                                                // 0.294 in: pulled toward white, the desaturation mix ran (0.042 without it)
});
it('the danger edge renders danger red through the tone map at the chosen EDGE_GAIN', () => {
  const [r, g, b] = toneMappedSrgb(DANGER, EDGE_GAIN);
  expect(r).toBeGreaterThan(0.6); expect(g).toBeLessThan(0.35); expect(b).toBeLessThan(0.3);   // the U2 e2e pixel predicate
});
it('installRim still compiles ONE program for every rim user', () => {
  const a = installRim(new THREE.MeshToonMaterial()), b = installRim(new THREE.MeshToonMaterial());
  expect(a.customProgramCacheKey()).toBe('mobToonRim'); expect(b.customProgramCacheKey()).toBe('mobToonRim');
  const shader = fakeToonShader(); a.onBeforeCompile(shader);         // real three ShaderLib.toon source
  expect(shader.uniforms.uFlash.value).toBe(0);
  expect(shader.fragmentShader).toContain(feedbackGlsl().apply);
});
```

- [ ] **Step 2:** Run `npx vitest run tests/gates/feedback-grammar-gates.test.js`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** `feedbackGrammar.js`, `hdrGain.js` and the `installRim` splice. Generate `apply` from the module constants; it is placed after the rim `+=` line, before `#include <dithering_fragment>`. `uFlash` is `material.userData.rim.uFlash`, default 0.
- [ ] **Step 4:** Run the test. Expected: PASS, 8 tests. Then run `npx vitest run src/render tests/gates/character-render-gates.test.js` (the beast and boss gates still green).
- [ ] **Step 5: Mutants:**
  - **K1a:** `fgLit` uses `step(0.5, ...)`. Expected: the band-edge test RED.
  - **K1b:** luminance as a plain RGB average. Expected: the hdrGain primaries test RED.
  - **K1c:** `apply` mixes without `fgLit`. Expected: the shadow-band and GLSL tests RED.
  - **K1d:** `neutralToneMap` without the desaturation mix. Expected: the tone-map mirror test RED.
  - **K1e:** `EDGE_GAIN = hdrGain(DANGER, 0.65, 1)` (about 2.68, the smallest gain that crosses the 0.65 threshold). Expected: the danger-edge test RED (sRGB g about 0.52; at gain 1 it is 0.25). If M1's option (a) is chosen, this test is rewritten to the measured predicate in the same commit and K1e re-aimed.
  - Identity: GREEN.
- [ ] **Step 6: Commit** `feat(render): the toon rim gains a lit-band flash term, identity at zero — one GLSL generator with a JS twin; band edge comment corrected to dotNL = 0`, with a `Mutation-Proof:` trailer for K1a-K1c and the measured `index` delta.

### Task U2: Telegraph through the edge, and the rim at every tier

**Files:**
- Modify: `src/render/MobModel.jsx`:
  - `:49-55`: `rimStrength` no longer tier-gated; `chargeColor` deleted; the colours come from `feedbackGrammar`.
  - `:187-219`: the traverse no longer writes emissive during a windup. It writes the rim colour and the outline colour through refs collected at mount; the rim strength and power stay at `RIM`.
- Modify: `src/render/quality.js:17-32` (`charRim` deleted from every tier, with its header comment at `:17`: once MobModel stops tier-gating the rim, nothing reads it, `MobModel.jsx:51` being its only reader; review amendment 11)
- Create: `src/render/mobLook.js` (pure per-frame look: `mobLook({ now, wnow, entity, juice, mood, bloomThreshold, seq }, out)`)
- Modify: `src/App.jsx` near `:335` (DEV hook `readMobLook(id)`: reads back the LIVE uniforms from the mounted materials through a DEV-only `mobLookRegistry` Map keyed by entity id)
- Modify: `tests/gates/attack-telegraph-gates.test.js:104-110` (re-point to `mobLook` behaviour), `tests/gates/character-render-gates.test.js:74` (comment)
- Create: `tests/gates/edge-telegraph-gates.test.js`, `tests/e2e/feedback-grammar.spec.js` (first test)

**Interfaces:**
- Consumes: U1's `edgeLook`, `telegraphLevel`, `rimForMood`; `windupRamp` and `WINDUP_MS` (`src/game/attackTelegraph.js:9-31`); `isStaggered` (`src/game/perfectDodge.js`).
- Produces: `mobLook(...) -> { phase: 'rest'|'telegraph'|'flash'|'squash', telegraph, bodyFlash, rim, rimStrength, rimPower, outline, squashAmp }` (U3 extends the phases), and DEV `readMobLook(id) -> { telegraph, rimRGB, rimStrength, rimPower, outlineRGB, bodyEmissive, uFlash }`, read from the LIVE uniforms of the mounted materials.
- `mobLook` honours `entity.lookHold`: `'windup'` holds the telegraph at 0.8 and `'hit'` holds FLASH. Only the DEV e2e and the lookbook seam (U0) set it. It is one branch at the top of `mobLook`, and it has its own gate case: `lookHold is ignored when absent`.

- [ ] **Step 1: Write the failing gates**

```js
it('a windup raises the edge and never the body', () => {
  const e = { windupUntil: 1000, lastHit: 0 }; const out = {};
  mobLook({ now: 900, wnow: 1000 - 0.2 * WINDUP_MS, entity: e, juice: 1, mood: 0, bloomThreshold: 0.65 }, out);
  expect(out.phase).toBe('telegraph'); expect(out.telegraph).toBeCloseTo(0.64, 5);   // ramp 0.8 squared
  expect(out.bodyFlash).toBe(0);
  expect(out.outline.r).toBeGreaterThan(out.outline.g * 3);                          // toward DANGER
  expect(out.rimStrength).toBe(RIM.strength); expect(out.rimPower).toBe(RIM.power);   // the rim's magnitude never ramps (amendment 2)
});
it('uses the entity windup length when move 5 provides one', () => {
  const out = {}; mobLook({ now: 0, wnow: 1000 - 310, entity: { windupUntil: 1000, windupMs: 620 }, juice: 1, mood: 0, bloomThreshold: 0.65 }, out);
  expect(out.telegraph).toBeCloseTo(0.25, 5);                                        // ramp 0.5 of 620 ms
});
// Under M1's default (b) the edge never blooms: the case below asserts at(0.95) <= the threshold instead.
// Only if (a) is chosen on the measured frame does it read as written.
it('the edge crosses the bloom threshold only near the strike (option (a) only)', () => {
  const at = (ramp) => { const o = {}; mobLook({ now: 0, wnow: 1000 - (1 - ramp) * WINDUP_MS, entity: { windupUntil: 1000 }, juice: 1, mood: 1, bloomThreshold: 1.05 }, o); return linearLuminance(o.outline); };
  expect(at(0.5)).toBeLessThan(1.05); expect(at(0.95)).toBeGreaterThan(1.05);
});
it('stagger clears the telegraph the same frame', () => { /* staggerUntil > wnow -> phase 'rest', telegraph 0 */ });
it('flash beats telegraph', () => { /* lastHit = now - 10 during a windup -> phase 'flash', outline CONTACT */ });
// 'the rim at every tier' is proved in the running game (step 5's low-tier e2e), not by a table entry nothing reads.
it('night swaps the rim toward moon-white', () => { /* rimForMood(1) bluer-white than rimForMood(0): b/r ratio drops, luminance rises */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/gates/edge-telegraph-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `mobLook.js`, then rewire MobModel. Before fixing `EDGE_GAIN`, shoot M1's options (a) and (b) on the lookbook windup frame (before `feat/instruments` lands, the step 5 e2e's planted frame on a real GPU) at the live bloom threshold, and record the choice (M1).
  - Collect each toon material's `userData.rim` uniforms and each outline material (drei's: `mesh.children` of the `<Outlines>` group) into a ref ONCE at mount (`useLayoutEffect`).
  - The `useFrame` calls `mobLook` and writes the uniforms. It never sets `emissive` for a telegraph.
  - The DEV registry entry is added in a `useEffect` guarded by `import.meta.env.DEV`.
- [ ] **Step 4: Re-point `attack-telegraph-gates.test.js:104-110`.** The charge glow assertion becomes the behavioural `mobLook` precedence cases above. Delete the source-grep `emissive.copy(chargeColor)` assertion, so the source-grep ledger FALLS by its count. Run `npx vitest run tests/gates/edge-telegraph-gates.test.js tests/gates/attack-telegraph-gates.test.js`. Expected: PASS.
- [ ] **Step 5: Write the e2e** `tests/e2e/feedback-grammar.spec.js`, test `a planted windup reddens the edge, not the body`:
  - Boot with `bootDev` and `startPlayActive` (`tests/e2e/_boot.js`). Spawn a zombie 3 m along the camera forward (the `heavy-melee.spec.js:39-68` method). Freeze the world with the store's hitstop. Plant a windup with `plantWindup(id, 0.2 * 380)`.
  - Assert `readMobLook(id)`: `telegraph > 0.5`, `outlineRGB[0] > 3 * outlineRGB[1]`, `bodyEmissive === 0`.
  - Pin the time of day first, to a value where the key light is high (`tests/e2e/_boot.js` pins none). Check the value against `sunArcDirection` (`mood.js:148-168`: cycle 0.25 is noon) rather than trusting a comment; `spawnSpellCast` uses `setTimeOfDay(0.5)` and calls it midday (`App.jsx:654`), while `perfScenarios.js:11` calls 0.4 mid-day.
  - THEN a pixel check, at mob yaw 0, 45 and 90 degrees to the camera (set the frozen mob's `rotation`; review amendment 2). At each angle, project the mob centre with `window.__threeCamera` and screenshot a 160x160 clip, both planted and after clearing the windup:
    - the count of danger-red pixels (r > 0.6, g < 0.35, b < 0.3; the predicate U1's tone-map gate pins for `EDGE_GAIN`) rises by at least 40;
    - the interior 40x40 mean luminance changes by under 10%;
    - the interior keeps at least 2 luminance bands (two histogram clusters at least 0.08 apart), the roadmap's own proof (`roadmap-2026-10-27.json:181`).
    A head-on view alone cannot see a whole-face rim flood; the 45-degree case is the one that can.
  - Assert the PRESENCE first: the clip contains at least 400 non-sky pixels, so the mob is on screen.
  - Precondition message: `active`, `isAlive`, frozen, mob alive (rule 4e).
  - Second test, **`the rim is lit on the low tier`**: force the low tier through the store, spawn and freeze a zombie, and assert `readMobLook(id).rimStrength === RIM.strength` (above 0) from the live material.
  - A night case (cycle 0.75, moon-white rim) is added once move 4 lands.
- [ ] **Step 6: Mutants:**
  - **K2a:** restore the emissive flood (`emissive.copy(DANGER)` at `chargeI` in MobModel's useFrame). Expected: the e2e RED twice, on `readMobLook(id).bodyEmissive === 0` and on the interior-luminance check. The flood lives in the component, not in `mobLook`, so no unit gate can see it; that is why the e2e reads the live material.
  - **K2b:** MobModel zeroes the rim strength on the low tier (a tier gate put back). Expected: the e2e `the rim is lit on the low tier` RED.
  - **K2c:** the outline colour not written. Expected: e2e `outlineRGB` RED and the pixel count RED.
  - **K2d:** use `WINDUP_MS` instead of `entity.windupMs`. Expected: the move-5 test RED.
  - **K2e:** the rim strength ramps to 1.1 and the power to 1.6 with the telegraph (the design this amendment removed). Expected: the `mobLook` rim-magnitude assertion RED, and in the component the e2e interior check RED at 45 degrees (it may stay green head-on, which is why three angles run).

  e2e mutants run through `scripts/dev/mutate-e2e.sh` with an identity mutant, on CI or an idle machine (not locally while the load is high).
- [ ] **Step 7: Commit** `feat(mobs): a windup reddens the ink edge and the rim's colour, never the body; the rim reads at every tier, moon-white at night`, with `Mutation-Proof:` K2a-K2e, the M1 option chosen with its frame, and the `index` delta.

### Task U3: The hit flash on the lit band, the white outline, the 50 ms squash

**Depends on** move 4's moon handoff, or the M2 elevation fallback built here (review amendment 8).

**Files:**
- Modify: `src/render/mobLook.js` (add the hit sequence: a per-mob `seq = { stamp, flashFrames, squashStart, squashFrames }` kept in a MobModel ref)
- Modify: `src/render/MobModel.jsx:148-166` (scale squash from `out.squashAmp`, tilt unchanged), `:187-219` (delete the colour and emissive writes; write `uFlash = out.bodyFlash`)
- Modify: `tests/gates/mob-flash-restore-gates.test.js` (re-point: `the flash never writes material.color`, driven through `mobLook` and a recording material; the authored-colour restore becomes unnecessary for mob bodies, and `mobFlash.js` stays for any remaining caller or is deleted with knip's confirmation)
- Test: `tests/gates/hit-sequence-gates.test.js`, the e2e (second and third tests)

**Interfaces:**
- Produces: `hitSequence(seq, { now, lastHit }) -> 'flash'|'squash'|'rest'` (mutates `seq`), and `squashAmp(seq, now) -> number` (the curve through `SQUASH_AMPS` at u = (now - squashStart) / SQUASH_MS, or 0). DEV: MobModel's `useFrame` appends `{ frame, now, phase, uFlash }` to a 16-entry ring buffer on its `mobLookRegistry` entry, keyed by FrameCap's `readFrameloop().frames` so a frame is recorded once.

- [ ] **Step 1: Write the failing gates**

```js
it('FLASH lasts FLASH_MS of wall clock at 60 fps, then SQUASH for 3 frames (50 ms)', () => {
  const seq = {}; const phases = [];
  for (let t = 1000; t < 1200; t += 16.7) phases.push(hitSequence(seq, { now: t, lastHit: 1000 }));
  expect(phases.filter(p => p === 'flash')).toHaveLength(5);                     // 0..66.8 ms < 70
  expect(phases.slice(5, 8)).toEqual(['squash', 'squash', 'squash']); expect(phases[8]).toBe('rest');
});
it('SQUASH lasts SQUASH_MS, not a frame count, at 120 and 30 fps', () => {     // amendment 7
  for (const dt of [8.33, 33.3]) {
    const seq = {}; const trace = [];
    for (let t = 1000; t < 1300; t += dt) trace.push([t, hitSequence(seq, { now: t, lastHit: 1000 })]);
    const squash = trace.filter(([, p]) => p === 'squash');
    expect(squash.length).toBeGreaterThanOrEqual(MIN_SQUASH_FRAMES);
    expect(squash.at(-1)[0] - squash[0][0]).toBeLessThan(SQUASH_MS + dt);      // 120 Hz: 6 frames; 30 fps: 2
    expect(trace.at(-1)[1]).toBe('rest');
  }
});
it('holds FLASH for one rendered frame when the frame interval exceeds FLASH_MS', () => {
  const seq = {}; expect(hitSequence(seq, { now: 1000 + 200, lastHit: 1000 })).toBe('flash');   // first frame seen 200 ms late
  expect(hitSequence(seq, { now: 1400, lastHit: 1000 })).toBe('squash');
});
it('a second stamp during SQUASH restarts FLASH', () => { /* ... */ });
it('reduced motion keeps the white outline and drops the body flash and the squash', () => {
  const out = {}; mobLook({ now: 1010, wnow: 0, entity: { lastHit: 1000 }, juice: 0, mood: 0, bloomThreshold: 0.65, seq: {} }, out);
  expect(out.bodyFlash).toBe(0); expect(out.outline.getHexString()).toBe('ffffff'); expect(out.squashAmp).toBe(0);
});
it('the flash never writes material.color (vertex/authored colour is never touched)', () => { /* drive MobModel's applier on a recording material; color writes === 0, denominator: 1 flash cycle of 9 frames */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/gates/hit-sequence-gates.test.js tests/gates/mob-flash-restore-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `hitSequence`, wire `uFlash` and the squash, and delete the colour writes.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Extend the e2e.**
  - **`a real click flashes the struck mob for one beat, then squashes it`.** Pin the time of day to midday first. A zombie 2.5 m ahead; `page.mouse.down/up` through the real listener (`heavy-melee.spec.js:111-113`). Read MobModel's DEV ring buffer: one entry per R3F frame, not a page rAF loop (amendment 6). A page rAF loop samples each rendered frame twice on a 120 Hz host under the 60 fps cap (`FrameCap.jsx:8`, `:106-107`), and a 400 ms wall-clock window holds fewer frames than the sequence needs on a loaded CI runner (`App.jsx:340-341`). Take the first 12 recorded frames after the health drop. PRECONDITION, named in the failure message: at least 4 frames recorded. Assert:
    - at least 1 frame with `uFlash > 0`;
    - then at least `MIN_SQUASH_FRAMES` squash frames, whose recorded `now` span is under `SQUASH_MS` plus one frame interval, then rest;
    - flash frames whose recorded `now` is more than 70 ms after the stamp number at most 1;
    - a pixel check on the flash frame against a rest frame: the clip's top-lit half mean luminance rises by at least 0.15. Taken by holding FLASH through `entity.lookHold = 'hit'` for the screenshot (DEV and seam only).
  - **`a tap on the touch action button flashes the mob`** (`test.use({ hasTouch: true, viewport: { width: 820, height: 1180 } })`, the `touch-controls.spec.js:22` pattern, the `touch-action` button; `src/ui/TouchControls.jsx:190`). Use whatever press shape `feat/touch-hold` leaves on that button: tap for the light attack. Expected: at least 1 flash frame.
- [ ] **Step 6: Mutants:**
  - **K3a:** `FLASH_MS = 300`. Expected: gate 1 RED and the e2e "flash frames after 70 ms" RED.
  - **K3b:** drop `MIN_FLASH_FRAMES`. Expected: gate 2 RED.
  - **K3c:** delete `uFlash` from the applier (the GLSL term never fed). Expected: the e2e pixel check RED (the uniform read alone would stay green, which is why the pixel check exists).
  - **K3d:** squash ignores juice. Expected: the reduced-motion gate RED.
  - **K3e:** SQUASH counted as 3 frames instead of `SQUASH_MS`. Expected: the 120/30 fps gate RED.
- [ ] **Step 7: Commit** `feat(mobs): contact is 70 ms of white on the lit band with a white ink edge, then a 50 ms squash; reduced motion keeps the edge only`, with `Mutation-Proof:` K3a-K3e.

### Task U4: One rig mesh per mob

**Files:**
- Create: `src/render/mobRig.js` (parts, geometry, GLSL, mirror, cache), `src/render/inkOutlineMaterial.js`, `src/devtest/RigParityStage.jsx` (DEV-only: the same parts as separate `THREE.Mesh`es posed by Object3D, beside the rig mob, at y = 140 in the sky studio)
- Modify: `src/render/MobToonMaterial.jsx:10-16` (rig flag: `vertexColors`, the rig chunk in `onBeforeCompile`, key `mobToonRim+rig`)
- Modify: `src/render/MobModel.jsx:221-351` (legs to uniforms, one rig mesh, one hull mesh, one eye mesh; delete the per-part JSX), `src/App.jsx` (DEV hook `rigParityStage({ type, swings, lifts })`)
- Create: `src/render/RigWarmup.jsx` (the world-load warm-up: `gl.compileAsync` of a hidden rig mob, eye and hull, then unmount), mounted by `src/SimplifiedNPCSystem.jsx` beside the mob list (`:129-135`).
- Create: `<OutlineSizeSync />` (in `src/render/inkOutlineMaterial.js`'s JSX companion, `src/render/OutlineSizeSync.jsx`), mounted once beside `RigWarmup` in `SimplifiedNPCSystem`, which is mounted whether or not any mob is. It calls `syncOutlineSize(gl)` on mount and whenever R3F's `size` or `viewport.dpr` changes (a `useThree` selector: it re-renders on a resize or dpr step, never per frame). It must not depend on a mob having rendered: U6's spell ink hulls read the same uniform, drei's default size is `(0, 0)` (`Outlines.js:14`), and the vertex shader divides the thickness by it (`:47`) (review amendment 17).
- Test: `tests/gates/mob-rig-gates.test.js`, the e2e (fourth and fifth tests)

**Interfaces:**
- Produces:
  - `mobPartSpecs(entity) -> { rigid: Part[], legs: Part[], eyes: Part[] }`, where `Part = { box: [w,h,d], pos: [x,y,z], rot: [x,y,z], color: string, leg?: 1..8 }`;
  - `buildRigGeometry(parts: Part[]) -> THREE.BufferGeometry` with `position`, `normal`, `color`, `aLeg`, `aPivot`;
  - `rigKey(entity) -> string`, `acquireRig(entity) -> { key, geometry, hullGeometry, eyeGeometry }`, `releaseRig(key)`;
  - `MAX_LEGS = 8`, `LEG_SWING_MARGIN = 0.6`;
  - `rigGlsl() -> { decl, beginNormal, beginVertex }`;
  - `rigLegMirror(p: [x,y,z], pivot: [x,y,z], swing: number, lift: number) -> [x,y,z]`;
  - `createRigUniforms() -> { uLegSwing: { value: Float32Array(8) }, uLegLift: { value: Float32Array(8) } }`;
  - `createInkOutlineMaterial({ rig: boolean, rigUniforms?, thickness, color }) -> THREE.ShaderMaterial`, `OUTLINE_SIZE` (a shared `{ value: THREE.Vector2 }`), `syncOutlineSize(gl)`, `<OutlineSizeSync />`, `createRigDepthMaterial(rigUniforms) -> THREE.MeshDepthMaterial`;
  - DEV: `dumpMobMeshes(id)` (step 0) and `rigWarmupReport() -> { warmedAt, firstRigDrawAt, programKeysAtWarmup }` (step 9).

- [ ] **Step 0: Freeze the oracle from the running code, before any U4 change (review amendment 9).** Add a DEV hook `dumpMobMeshes(id)` that walks a mounted pre-U4 MobModel's meshes (skipping drei's hull meshes and the cover aura) and returns each part's vertices in the mob's root frame, its colour and its `castShadow`. A one-off e2e-style script stages each of the 10 types and 4 hybrids in the sky studio, frozen and at rest (swing 0, lift 0), and writes `tests/fixtures/mob-legacy-vertices.json`. Commit the hook and the fixture alone. The step 1 gates compare against this fixture, so a transcription error in `mobPartSpecs` cannot also live in its oracle, as it could if both were copied by hand from `MobModel.jsx:279-351`.

- [ ] **Step 1: Write the failing gates**

```js
// The oracle is today's MobModel as it RENDERED: tests/fixtures/mob-legacy-vertices.json from step 0, never a hand restatement.
it('the rig reproduces every legacy part, vertex for vertex, at rest — every type and hybrid', () => {
  let checked = 0;
  for (const ent of [...Object.keys(MOB_TYPES).map(asEntity), ...HYBRID_ENTITIES]) {
    const want = LEGACY_FIXTURE[fixtureKey(ent)]; const got = rigVertices(buildRigGeometry(flatten(mobPartSpecs(ent))));
    expect(got).toEqualVertexSet(want, 1e-5); checked++;
  }
  expect(checked).toBe(14);                                                       // 10 types + 4 hybrids
});
it('the leg mirror equals three Object3D posing for every leg, swing and lift', () => {
  let spiderCases = 0;
  for (const ent of [asEntity('zombie'), asEntity('spider')]) for (const leg of mobPartSpecs(ent).legs)
    for (const swing of [-0.6, -0.2, 0, 0.3, 0.6]) for (const lift of [-0.3, 0, 0.12]) {
      expect(rigLegMirror(...)).toBeCloseToVec(object3dPose(leg, swing, lift), 1e-6);
      if (leg.rot[2] !== 0) spiderCases++;
    }
  expect(spiderCases).toBe(8 * 5 * 3);                                            // the rotZ legs carry the order test
});
it('the rig toon, ink and depth materials share ONE swing and lift array', () => { /* identity (===) of uniform values */ });
it('ink outline materials share one size uniform that follows the drawing buffer', () => {
  const a = createInkOutlineMaterial({ rig: true }), b = createInkOutlineMaterial({ rig: false });
  expect(a.uniforms.size).toBe(b.uniforms.size);
  syncOutlineSize({ getDrawingBufferSize: (v) => v.set(1475, 922) }); expect(a.uniforms.size.value.x).toBe(1475);
});
it('the hull is a creased COPY and the body keeps its face normals', () => {          // amendment 1
  /* acquireRig(zombie): hullGeometry !== geometry, and hull.attributes.normal !== geometry.attributes.normal;
     every body normal equals its box's rotated face axis within 1e-6 (denominator: every vertex, 24 per box);
     the hull is non-indexed at 36 vertices per box and carries aLeg and aPivot; its normals are NOT all face axes. */
});
it('eyes never cast shadows; one eye mesh per mob; none for allies or passives', () => { /* hasHostileEyes truth table x mobPartSpecs().eyes */ });
it('the bounding sphere covers a full swing', () => { /* every mirrored vertex at swing ±0.6, lift 0.3 lies inside the sphere */ });
it('the rig cache disposes on last release', () => { /* acquire twice, release twice -> geometry.dispose called once */ });
```

- [ ] **Step 2:** Run `npx vitest run tests/gates/mob-rig-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `mobRig.js` and `inkOutlineMaterial.js`, then `MobToonMaterial`'s rig flag. The chunk replaces `#include <beginnormal_vertex>` and `#include <begin_vertex>`, guarded by `#ifdef MOB_RIG`.
- [ ] **Step 4:** Run the test. Expected: PASS, 8 tests.
- [ ] **Step 5: Rewire MobModel.**
  - `acquireRig` in a `useMemo` on `rigKey`, `releaseRig` on unmount.
  - Legs: today's swing and IK formulas write `rigUniforms.uLegSwing.value[i]` and `uLegLift.value[i]` (the lift is a per-mob `Float32Array(4)` lerped at 0.2, the factor at `:260`).
  - U2/U3's look writes go to the one toon material and the one hull material.
  - Run `npx vitest run src tests/gates`. Expected: PASS.
- [ ] **Step 6: Write the GLSL-parity e2e** `the vertex-shader legs match Object3D legs on screen`.
  - `rigParityStage({ type, swings, lifts })` for `zombie` (quad, with IK lift) and `spider` (rotZ legs), at swings `[0.5, -0.5, -0.5, 0.5]` and `sin(i) * 0.3`.
  - Screenshot both halves and `pixelmatch` them at threshold 0.1.
  - Expected: under 2% of the mob's pixels differ.
  - PRESENCE first: each half has at least 300 mob pixels.
- [ ] **Step 7: Write the draw-count e2e** `a mob costs at most 3 main-pass draws and 1 shadow draw, its nametag unchanged`.
  - Use the U0 counter injected through `page.addInitScript`. Stage 0, then 8 zombies in view (world frozen).
  - Split frames by the DEV shadow-render counter (steady-cool's; if absent, force `shadow.needsUpdate` on alternate frames).
  - Run the staging twice: once as is, and once with a DEV `hideNametags` switch that makes `<Nametags>` return null, the path it already takes under capture (`Nametags.jsx:86`). (8 zombies 3 m away are all inside the nametag's 30 m range; counting them into the mob would make a correct U4 measure at least 6 per mob, review amendment 3.)
  - Expected with nametags hidden: `(d8 - d0) / 8` is at most 3 on non-shadow frames and at most 4 on shadow frames. With nametags shown, the per-mob difference between the two runs is the nametag's cost; record it, and it equals the pre-U4 figure (U4 does not touch nametags).
  - Record the measured before and after in the acceptance table, MobModel and nametag on separate rows.
  - Third test in this step, `the outline size is set with no mob mounted`: remove every mob right after boot and assert the DEV read of `OUTLINE_SIZE` is non-zero and equals `gl.getDrawingBufferSize`. U6 extends it to cast one spell with no mob mounted (amendment 17).
- [ ] **Step 8: Mutants:**
  - **K4a:** the Rx/Rz order swapped in `rigGlsl` and in the mirror. Expected: the mirror gate RED (spider cases) and the parity e2e RED.
  - **K4b:** the swing sign flipped in `rigGlsl` only. Expected: the parity e2e RED (no node test can see the GLSL; this is why the parity stage exists).
  - **K4c:** `castShadow` left on the eye mesh. Expected: the eyes gate RED and the draw e2e RED.
  - **K4d:** `LEG_SWING_MARGIN = 0`. Expected: the bounding-sphere gate RED.
  - **K4e:** the hull built without `toCreasedNormals` (the rig geometry used as the hull). Expected: the hull gate RED (`hullGeometry === geometry`, hull normals all face axes).
  - **K4g:** the rig geometry built non-indexed, so `toCreasedNormals` rewrites it in place. Expected: the hull gate RED on the body-normal check and on `hullGeometry !== geometry`.
  - **K4h:** `<OutlineSizeSync />` not mounted (the size synced only from MobModel). Expected: the no-mob outline-size e2e RED.
- [ ] **Step 9: Warm-up.** At world load, compile the rig toon, rig ink, rig depth and eye programs once (`gl.compileAsync` on a hidden staged rig, removed after). e2e `the rig programs are compiled before any rig mob draws`: a DEV record holds the time the warm-up's `compileAsync` resolved and the time the first rig mesh's `onBeforeRender` fired (module-level, once), plus the program cache keys in `renderer.info.programs` at warm-up. Assert the warm-up time is set and earlier, and the three rig keys are present at it. Comparing `programs.length` around the test's own `spawnMob` cannot fail: the spawner's 20 world-load mobs and the 4 hub NPCs (`SpawnerSystem.jsx:97-116`, rendered by `SimplifiedNPCSystem.jsx:128-130`) draw through MobModel first (review amendment 10). **K4f:** skip the warm-up. Expected: that e2e RED (no warm-up time).
- [ ] **Step 10: Commit** `perf(mobs): one rig mesh per mob — legs swing in the vertex shader, one ink hull, one eye mesh; a zombie goes from 18 main + 10 shadow draws to 3 + 1`, with `Mutation-Proof:` K4a-K4h, the measured eye-shadow difference from B1a, and the `index` delta.

### Task U5: HDR eyes and part tones

**Files:**
- Create: `src/game/mobTones.js`
- Modify: `src/render/mobRig.js` (`mobPartSpecs` applies the tones: plates and straps as extra rigid parts, extremity factor 0.7), `src/render/MobModel.jsx` (eye material colour from `eyeColor`, i.e. x `hdrGain`; no `toneMapped` change, it has no effect inside the composer)
- Test: `tests/gates/mob-tones-gates.test.js`

**Interfaces:**
- Consumes: U1's `hdrGain`, the bloom threshold export (see Open questions).
- Produces: `MOB_TONES[type] -> { plate?: PartLike, strap?: PartLike, extremity: number }`, and `eyeColor(entity, bloomThreshold) -> THREE.Color`.

- [ ] **Step 1: Write the failing gates**
  - `every hostile archetype adds 1-2 tones` (distinct vertex colours on the rig at rest, excluding eyes, minus the body colour and the existing `featureColor` tones: at least 1 and at most 2 for each of the 7 hostiles; denominator 7). The old "2-3 in total" could not hold: plate, extremities and strap on top of the body colour are 4 already, and the skeleton, moss_brute and emberhusk carry `bone` or `dark` features too (review amendment 14);
  - `tones never change the silhouette` (every corner of every plate and strap box lies inside some legacy part box from the step 0 fixture, expanded by 0.03; denominator: every tone box of the 7 hostiles). A bounding-box comparison would pass a strap that sticks out inside the box;
  - `hostile eyes cross the bloom threshold; settler eyes do not` (`linearLuminance(eyeColor(zombie, t)) > t` and `<= t` for the villager, at t in {0.65, 1.05}).
- [ ] **Step 2:** Run `npx vitest run tests/gates/mob-tones-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Tones are taste: start from the roadmap (lighter face or belly, darker hands and feet, one strap) and judge on the lookbook frames.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Mutants:**
  - **K5a:** `eyeColor` without `hdrGain` (gain 1). Expected: the `hostile eyes cross the bloom threshold` gate RED.
  - **K5c:** MobModel's eye material takes the raw `#ff0000` instead of `eyeColor` (the gain bypassed in the component). Expected: no unit gate can see it. The lookbook night windup frame shows no eye bloom, and the e2e pixel check `the eyes bloom at night` (a 9x9 clip around the projected eye: peak luminance > 0.9 at cycle 0.75) goes RED. Add that check to `feedback-grammar.spec.js`.
  - **K5b:** villager eyes through `hdrGain`. Expected: the gate RED.
  - Not a mutant: setting the eye's `toneMapped` to true. three ignores the flag when rendering into the composer's buffer (Current state), so it cannot remove the bloom, and a trailer recording it as a kill would record one that cannot happen (review amendment 4).
- [ ] **Step 6: Commit** `feat(mobs): each archetype wears one or two more tones, and only a hostile's eyes glow`, with `Mutation-Proof:` K5a-K5c.

### Check B1a: U4 reproduces the mob frames (no re-shoot)

Review amendment 9. On U4's tree, before its commit and before any U5 change, run the visual gate for `mob-bestiary.png` and `character-closeup.png` against the existing baselines (the 151 re-baseline, Phase 0e). U4 is meant to look identical, so both must pass unchanged. That gate is the one check on U4 that is independent of `mobPartSpecs`. A single re-shoot after U4 and U5 together would absorb any U4 error into the new oracle, the bundling DECISIONS.md 2026-10-27 forbids for the renderer re-baseline.
- The one stated difference is the eyes' tiny shadows. Measure it (the per-region pixel diff of each frame, with the diff image opened) and write the number into U4's commit body.
- The gate also catches a colour-space error in the baked vertex colours (M3).
- If the eye-shadow difference alone exceeds the gate, re-shoot those two frames ALONE in a `Baseline-Review:` commit that names the eye shadows as the only change, after confirming on the diff image that nothing else moved.

### Commit B1b: Baseline-Review for mob frames after U5

After U5 alone, re-shoot only `mob-bestiary.png` and `character-closeup.png` (`npm run visual:baseline`, then restore every other frame from the 151 baseline). Commit with no `src/` change and a `Baseline-Review:` trailer naming each frame. Open both frames by eye before committing: the tones and the eyes.

### Task U6: Spell projectile grammar

**Files:**
- Create: `src/render/spellGrammar.js`, `src/render/SpellPuffPool.jsx`
- Modify: `src/render/spellGeometry.js` (add `buildBoltGeometry()` and `buildSigilGeometry()`, merging today's segments, forks, wheel, torus and motes from `spellVfx.jsx:34-46`, `:282-350`), `src/render/spellVfx.jsx:156-437` (four layers per element; the two additive core spheres deleted; the group scaled by `SPELL_VISUAL_SCALE`), `src/EnhancedMagicSystem.jsx:486-504` (mount `SpellPuffPool`)
- Modify: `tests/gates/spell-shape-gates.test.js` (re-point to the grammar)
- Test: `tests/gates/spell-grammar-gates.test.js`

**Interfaces:**
- Consumes: U4's `createInkOutlineMaterial({ rig: false })`, U1's `hdrGain`, `PooledLight` (`feat/steady-cool:src/render/lightPool.jsx:112`).
- Produces:
  - `SPELL_VISUAL_SCALE = 1.5`;
  - `SPELL_GRAMMAR[element] -> { core: { color, hdrMargin }, shell: { color, opacity, scale }, secondary: { kind, color, opacity, rate } }`;
  - `spellLayers(element) -> Array<{ role: 'core'|'ink'|'shell'|'secondary', blending, depthWrite, depthTest }>` (no `toneMapped` field: it has no effect inside the composer, and a gate on it would prove nothing, review amendment 4);
  - `createSpellMaterials(element) -> { core, ink, shell }`: the THREE materials `spellVfx.jsx` renders, built from `spellLayers` (the secondary is the puff pool's). The JSX declares no material of its own (review amendment 12);
  - DEV `readSpellMaterials(projectileId) -> Array<{ blending, depthTest, depthWrite }>`, walking the mounted projectile group;
  - `emitPuff(position, element)` (imperative; module-level).

- [ ] **Step 1: Write the failing gates**
  - `every element has exactly core, ink, shell, secondary, and only the shell is additive`: denominator 4 elements; the core is `NormalBlending` with `depthWrite: true`; no layer has `depthTest: false`. Asserted on the material INSTANCES `createSpellMaterials(element)` returns, as well as on the table.
  - `the core blooms and the secondary is dark`: `linearLuminance(core x gain) > t` at t in {0.65, 1.05}; secondary luminance under 0.05.
  - `the visual scale never reaches projectile.size`: drive the projectile spawn path (`EnhancedMagicSystem`'s create function, exported or reached through the DEV `spawnSpellCast`). `projectile.size` equals the `SPELL_TYPES` value, and `checkMobCollision` receives `size + 1.5` (a spy).
  - `merged bolt and sigil geometries keep every legacy vertex`: the U4 oracle method, against `spellVfx.jsx`'s literal transforms.
- [ ] **Step 2:** Run `npx vitest run tests/gates/spell-grammar-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run tests/gates/spell-grammar-gates.test.js tests/gates/spell-shape-gates.test.js src/render`. Expected: PASS.
- [ ] **Step 5: e2e** `casting 20 spells adds no program and renders a solid core`.
  - Real right-clicks (and `touch-cast` in the touch project) cycle the four elements.
  - `renderer.info.programs.length` after cast 1 equals after cast 20.
  - Pixel check at noon (`setTimeOfDay(0.5)`): the projectile clip contains ink pixels (luminance < 0.08) ringing a core whose mean luminance is above the sky's.
  - The mounted projectile's materials (`readSpellMaterials(id)`): exactly the grammar's layers, none with `depthTest: false`.
  - The U0 counter, with the projectile ISOLATED: every cast also draws the 4-mesh cast telegraph for 180 ms (`EnhancedMagicSystem.jsx:124`, `spellVfx.jsx:686-741`), and impacts add rings and sparks. So sample the draws between the telegraph's expiry and the impact, the projectile cast at open sky so it flies past 180 ms, against a frame with no projectile; the commit body states the method (review amendment 12). Expected: projectile draws at most 4 + 1 shared puff draw.
  - Extend U4's `the outline size is set with no mob mounted` to cast one spell with every mob removed (amendment 17).
- [ ] **Step 6: Mutants:**
  - **K6a:** the core additive in `createSpellMaterials`. Expected: gate 1 RED, and the e2e noon check RED.
  - **K6b:** scale `projectile.size` instead of the group. Expected: the collision gate RED.
  - **K6c:** keep the `depthTest={false}` white core as a JSX mesh beside the grammar's layers. Expected: the e2e `readSpellMaterials` check RED (an extra layer with `depthTest: false`). Gate 1 reads the factory and cannot see a JSX mesh, which is why the e2e reads the mounted group.
- [ ] **Step 7: Commit** `feat(magic): a spell is a solid core with an ink line, one glow and a dark wisp — it reads on a noon sky; lightning 15 draws to 4`, with `Mutation-Proof:` K6a-K6c.

### Task U7: Impact grammar: ground ring, scorch or frost, debris, shock ring

**Files:**
- Create: `src/render/impactGrammar.js`, `src/render/ImpactPools.jsx`
- Modify: `src/EnhancedMagicSystem.jsx` (`createSpellImpact` calls `spawnImpact`; the pools mount at `:486-504`), `src/render/spellVfx.jsx:450-630` (the shock ring kept; the flash sphere kept; the light stays `PooledLight`)
- Test: `tests/gates/impact-grammar-gates.test.js`

**Interfaces:**
- Produces:
  - `IMPACT_GRAMMAR[element] -> { mark: 'scorch'|'frost'|'violet'|'void', markColor, markMs, ringMs, debris: { count, color, size } }`;
  - `poolAlloc(pool, n) -> number[]`, `poolStep(pool, dtMs) -> liveCount`;
  - `debrisLaunch(seed, n, out)` (seeded velocities);
  - `spawnImpact(position, element)` and `impactPoolsLive() -> { marks, debris }` (DEV read).

- [ ] **Step 1: Write the failing gates**
  - `debris count is 6-10 for every element`: denominator 4.
  - `the pools recycle and never exceed their caps`: 30 impacts into a 24-mark pool leaves 24 live, the oldest replaced.
  - `idle pools draw nothing`: after `poolStep` past every lifetime, `liveCount === 0` and the mesh `visible === false`.
  - `debris velocities are seeded`: two runs with one seed are equal, and `Math.random` is never called (a spy).
  - `the mark sits on the floor under the impact`: a fake `getMobFloor` returns 63.0 and the mark y is 63.01.
- [ ] **Step 2:** Run `npx vitest run tests/gates/impact-grammar-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: e2e** `an impact leaves a mark and debris, and both clear`. A real cast at a staged mob; `impactPoolsLive()` is above 0 within 2 frames of the hit and equals 0 after `markMs` + 200 ms. The U0 counter reads 0 pool draws when idle.
- [ ] **Step 6: Mutants:**
  - **K7a:** `visible` not tied to the live count. Expected: the idle gate RED and the e2e idle draws RED.
  - **K7b:** `Math.random` in `debrisLaunch`. Expected: the seeded gate RED.
  - **K7c:** the mark at the impact y. Expected: the floor gate RED.
- [ ] **Step 7: Commit** `feat(magic): an impact scorches or frosts the ground, rings it, and throws chunky debris — two pooled draws, none when idle`, with `Mutation-Proof:` K7a-K7c.

### Commit B2: Baseline-Review for spell frames

After U6 and U7, re-shoot only `spell-cast.png`, `spell-iceball.png`, `spell-lightning.png` and `spell-arcane.png`. Commit with no `src/` change and a `Baseline-Review:` trailer, frames opened by eye.

### Detached (was U8): the settler's lines in i18n — NOT part of this milestone

Review amendment 16. This is outside Phase 3's scope (the umbrella names only "one feedback grammar" for move 11, `2026-10-27-crafty-masterpiece.md:89-90`), and U4 does not touch these lines (it modifies `MobModel.jsx:221-351`; the strings sit at `:59-90` and `:365-377`). The strings still bypass `t()`, which the i18n rule forbids, so it lands as its own small i18n change, on its own schedule, with its own commit. The spec below is kept so the work is not lost. It does not count toward this milestone's acceptance or its byte total.

**Files:**
- Modify: `src/render/MobModel.jsx:59-90`, `:365-377` (read the lines and label through `t()`; the label uses the registry's name, "Settler", not "Villager"), `src/i18n/strings.js` (en + zh-CN keys `npc.settler.name`, `npc.settler.greet.1` to `.6`)
- Test: `tests/gates/settler-lines-gates.test.js`

- [ ] **Step 1: Write the failing gates**
  - `every settler line resolves in en and zh-CN`: denominator 7 keys; no value equals its key.
  - `the bubble's name matches the registry`: `t('npc.settler.name')` in en equals `MOB_TYPES.villager.displayName`.
- [ ] **Step 2:** Run `npx vitest run tests/gates/settler-lines-gates.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write the zh-CN lines in plain spoken Chinese, a game NPC's register. The en lines keep their meaning; "Snapping up voxel blocks is easy now!" is reworded to a real tip.
- [ ] **Step 4:** Run the test. Expected: PASS, and `node scripts/ci/i18n-adoption.mjs` does not rise.
- [ ] **Step 5: Mutant.** **K8a:** delete one zh-CN key. Expected: the gate RED.
- [ ] **Step 6: Commit** `i18n(npc): the settler's lines and name speak both languages`, with `Mutation-Proof:` K8a.

## Acceptance

The milestone is done when every row holds, measured in the turn it is claimed.

**1. Lived proof in the running game.** These run on CI and must pass at the HEAD that lands each unit (e2e-freshness receipt):
- `tests/e2e/feedback-grammar.spec.js`: windup edge at three angles (U2), rim on the low tier (U2), click flash and squash (U3), touch flash (U3), GLSL parity (U4), draw count with the nametag split out (U4), outline size with no mob (U4, extended in U6), rig programs compiled before the first rig draw (U4), eye bloom (U5), 20 casts with the mounted materials read (U6), impact clear (U7).

What would still pass if the feature were deleted?
- Delete the shader flash term: the uniform read stays green, the pixel check goes red (K3c).
- Delete the vertex-shader legs' GLSL: the node gates stay green, the parity e2e goes red (K4b).
- Bypass the HDR eyes in the component: the unit gates stay green, the eye-bloom pixel check goes red (K5c; K5a, the gain removed in `eyeColor`, turns the unit gate red too).
- Put the rim's tier gate back: no unit gate reads it any more; the low-tier e2e goes red (K2b).

Each of these has its named mutant above. Run them with `scripts/dev/mutate-e2e.sh`, identity mutant included.

**2. Draw and GPU deltas, measured** (U0 counter on the prod build; perf scenarios B and E, `src/devtest/perfScenarios.js:15-21`, with `npm run perf:m2`):

| measure | before (U0 step 8) | after (U4 step 7, U6, U7) | target |
|---|---|---|---|
| zombie, MobModel main-pass draws per mob (nametags hidden, U4 step 7) | (fill) | (fill) | at most 3 |
| zombie, nametag draws per tagged mob | (fill) | (fill) | unchanged |
| zombie, shadow draws per mob per shadow render | (fill) | (fill) | 1 |
| scenario B, `glDraws` median, with the count of mobs in view on each sampled frame printed beside it | (fill) | (fill) | at least 12 draws saved per in-view mob (MobModel's 12-26 down to 2-3, less culling). Scenario B does not control framing (`perfScenarios.js:17`), so a fixed "600 at 40 mobs in view" could not be measured (review amendment 13) |
| lightning projectile draws | (fill) | (fill) | at most 5 |
| programs across 20 casts | (fill) | (fill) | constant |
| CPU frame time, scenario B (load average beside it) | (fill) | (fill) | lower |
| GPU time, scenario B (`EXT_disjoint_timer_query_webgl2` if exposed; else marked UNMEASURED) | (fill) | (fill) | flat (within +0.3 ms) |

**3. Looks on a real GPU, motion on, opened by eye.**
- Run `node scripts/visual/lookbook.mjs --combat` on the prod build. Chromium must be ANGLE-Metal; the run refuses SwiftShader (`lookbook.mjs` header). Targets: WebKit at 1180x820 and 820x1180.
- Moments: windup (husk, duskhound, skitterling), hit (husk), impact (four elements), at cycles 0.30 and 0.75.
- Before and after sets go side by side, with the frames opened and one line per frame written into the unit's commit body:
  - the edge reads red and the body keeps two bands, the side and top faces included;
  - the hit shows white on the light-facing side only (at night, only once move 4 has handed the light to the moon);
  - the core reads on the noon sky;
  - the eyes, and nothing else on the mob, bloom at night;
  - on WebKit's low tier the rim is visible at night.
- The 31 capture frames stay the regression oracle only (B1a, B1b, B2).

**4. Gates and budget.** At each unit's HEAD:
- `npm run test:unit`
- `npm run lint`
- `npm run build && node scripts/ci/bundle-budget.mjs`: `index` at or under 760,000 B, the delta stated
- `node scripts/ci/gate-shape.mjs`
- `node scripts/ci/killability-ledger.mjs`
- `node scripts/ci/doc-currency.mjs`

Each must exit 0. Sweep with `sh scripts/dev/kill-test-procs.sh` after any browser run.

## Risks

1. **The vertex-shader legs are the one seam no node gate sees.** The parity e2e (U4 step 6) is the only instrument, and it runs under SwiftShader on CI. Mitigation: K4b proves it can go red, and the lookbook shows motion on a real GPU.
2. **Program warm-up.** Six to seven new programs compiled at first use would hitch the first fight. Mitigation: the U4 step 9 warm-up, and the e2e that asserts the rig programs exist before the first rig draw. U6 and U7 add their programs to the same warm-up.
3. **The rim at every tier on a darker night (move 4) could over-brighten small mobs on the low tier.** The strength is a constant; judge it on the WebKit night frames before U2 lands.
4. **The outline colour write must reach the hull material, not drei's per-instance copy that a re-render replaces.** U4 removes drei from mobs. Until then (U2, U3), collect the hull material at mount and re-collect it on `rigKey` or tier change.
5. **Move 5 and the light-colour script land in parallel and touch neighbouring lines.** Move 5 touches `ai.worker.js` and `attackPhase`, never MobModel. The light-colour script owns the bloom threshold. Conflicts are mechanical; the interfaces (`entity.windupMs`, `BLOOM_THRESHOLD`) are named here so each side codes to them.
6. **The light pool snaps lights on reassignment** (`lightPool.jsx:70-79` on steady-cool). A spell-heavy fight with more requests than the pool can shows light pops. Not this milestone's (see Out of scope), but U6's lookbook frames will show it if it bites.
7. **Debris on a slope or ledge.** The ballistic cubes ignore terrain and fall through it. Their life is short (under 900 ms) and they fade, the spark system's precedent.
8. **Bytes.** About 10.7 KB against about 63 KB of headroom that Phases 0-2 also spend. If `index` would cross the ceiling, the puff and decal pools are the candidates for a lazy chunk mounted on the first cast.

## Out of scope

- Building a point-light pool (done on `feat/steady-cool`, `ce0ecd03`). Fading pool lights on reassignment is a follow-up to that lane.
- Instancing all mobs of one archetype into one `InstancedMesh` (draws per archetype, not per mob). It needs per-instance swing and look attributes. The rig geometry here is its prerequisite, and it is the next step if siege caps rise (roadmap move 10).
- The dragon's rig (move 13). It reuses `mobRig.js`, the ink material and `mobLook` (named interfaces above).
- Ember-touched elites' rim (move 10). They set `rim` through `mobLook` as an affix overlay.
- Off-screen windup chevrons and windup sounds (move 5) and impact sounds (move 8).
- The boss's hit flash and emissive (`characterStyle.js:76-121`).
- A pairwise 64 px silhouette-distinctness probe across archetypes. U4 proves the silhouettes are UNCHANGED, which is this milestone's claim.
- The settler's lines in i18n (the former U8, detached above; review amendment 16).
- An edge-only rim telegraph computed from smoothed normals (the hull's creased normals, after U4). On box faces today's fresnel term cannot carry one (review amendment 2).

## Open questions

1. **Where `BLOOM_THRESHOLD` lives.** The light-colour lane (move 4) raises the threshold above 1.0 and should export it. If it has not landed when U2 starts, U1 adds `export const BLOOM_THRESHOLD = 0.65` in `src/render/bloomConfig.js`, and `GameScene.jsx:121` reads it. That touches GameScene, so `.claude/rules/input-and-pointer-lock.md` applies (a constant only). One reader per fact either way.
2. **How the lookbook stage holds a mob in place in the prod build.** The seam sets `entity.lookHold`. If no existing entity field stops the AI worker from moving a mob, the stage re-pins position each frame from the seam's per-frame hook. Decide in U0 step 7 by reading `src/workers/ai.worker.js` and `src/game/mobStateSync.js`.
3. **Tone and colour values (U5 tones, U6 secondaries)** are first proposals, judged on the lookbook frames. Kevin reviews async through KEVIN-REVIEW-BATCH, per the loop charter. Not blocking.
4. **`mobFlash.js` after U3.** It is deleted only if knip and a grep show no caller remains (the boss uses its own flash path, `src/render/bossFlash.test.js`).
5. **Does the danger edge bloom?** M1's default (b) is a plain danger-red edge that does not bloom. (a), a blooming edge with a salmon core, is chosen only if U2 step 3's measured frame still reads as danger red. Not blocking: the default ships.

## Review amendments (2026-10-27)

An adversarial review (17 findings: 2 HIGH, 8 MED, 7 LOW) was re-verified finding by finding against the code on `main` at `dfae38b6`. Each verdict below was re-derived, not copied. Two claims were run, not only read, with scratch probes:
- `toCreasedNormals` on a non-indexed box: three-stdlib returns the same object and overwrites its normals.
- The Neutral tone map: a JS twin of three's chunk was evaluated on the plan's colours.

The tally is **17 applied, 0 rejected.** Where the fix in the plan differs from the reviewer's proposed fix, the entry says how and why.

1. **HIGH: U4's hull recipe overwrote the body's normals.** Applied. Reproduced: `same true`. The first face's normals went from `1,0,0` to `0.408,0.408,0.816`, not the ±0.577 the review estimated: three-stdlib sums triangle normals, not face normals. The defect is the same either way. The non-indexed box also has 36 vertices, against `BoxGeometry`'s 24. Changes:
   - The rig geometry stays indexed, so the hull is a copy (M3).
   - The hull gate asserts `hullGeometry !== geometry`, face normals on the body, and 24 and 36 vertices per box.
   - K4e is re-aimed and K4g added.
2. **HIGH: the rim telegraph was not an edge on box mobs.** Applied, with a narrower fix than the review's. Verified: `characterStyle.js:60-61` uses `vNormal`, constant per box face. The rim's strength and power no longer ramp (`TELEGRAPH_RIM` removed). The rim's colour still lerps toward danger, at today's strength, to keep the umbrella's "rim and outline". U2's e2e runs at 0, 45 and 90 degrees with the two-band check; if the interior still changes, the rim colour stays at the mood rim too. K2e is added. An edge-only rim from smoothed normals moves to Out of scope.
3. **MED: per-mob draws omitted the nametags.** Applied. Verified: `Nametags.jsx:64-75`, `:89`; `nametagData.js:6`, `:13-14`. Changes:
   - Current state, M3 and U0 step 8 count the nametag separately.
   - U4 step 7 measures with a DEV `hideNametags` switch, the capture path at `Nametags.jsx:86`, and records the nametag's share.
   - The acceptance table has separate MobModel and nametag rows.
4. **MED: K5a (eye `toneMapped`) could not go red.** Applied. Verified: `WebGLPrograms.js:165-172` tone-maps only when the render target is null, and the composer is mounted unconditionally (`GameScene.jsx:90`, `:412`) with a half-float buffer. Changes:
   - Current state now explains that the eyes do not bloom because of luminance, and that the flag is inert.
   - K5a is re-aimed at the gain inside `eyeColor`, and K5c at the gain bypassed in the component.
   - `toneMapped` is removed from `spellLayers` and from M3, M4 and M5.
5. **MED: the HDR gains tone-map toward pink.** Applied. Confirmed for the tone-map stage; not measured on a full post-chain frame. The review's probe printed false on every row: for example, `#ff3a00` at the threshold-0.65 gain renders at sRGB (0.984, 0.461, 0.416). A further probe found no red hue can pass luminance 0.59 and keep green and blue at or under half its red. Changes:
   - U1 adds the `neutralToneMap` and `toneMappedSrgb` twins with a gate, plus K1d and K1e.
   - M1 now makes the edge's bloom a measured choice. The default (b) is plain danger red, about sRGB (0.95, 0.25, 0.13), which passes the U2 pixel predicate.
   - M4 and M5 state the eyes' and cores' tone-mapped look.
6. **MED: the U3 e2e sampled per page rAF in a wall-clock window.** Applied. Verified: `FrameCap.jsx:8`, `:106-107`; `App.jsx:340-341`. The e2e reads a per-R3F-frame DEV ring buffer, de-duplicated by `readFrameloop().frames`, over the first 12 frames after the hit. It first asserts that at least 4 frames were recorded.
7. **MED: a 3-frame squash depends on the refresh rate.** Applied. Verified: `useGameStore.jsx:334-338` (`frameCap` 0 runs at the display's rate); the `trauma.js:41-47` precedent. The squash is now `SQUASH_MS` 50 with `MIN_SQUASH_FRAMES` 2, its amplitude a curve over the window. A gate covers 120 and 30 fps, and K3e is added.
8. **MED: the lit-band flash lands on the underside at night until move 4.** Applied. Verified: `mood.js:160`, `:165`, `:198`; `Atmosphere.jsx:298-299`. Changes:
   - U3 depends on move 4's moon handoff, or carries an elevation fallback (M2).
   - The goal says "the side facing the key light".
   - Cast shadow is ignored, stated and accepted.
   - The e2e pins the time of day, and a night case follows move 4.
9. **MED: B1's single re-shoot threw away U4's only independent check.** Applied. Verified: plan U4 step 1 restated the oracle by hand; `DECISIONS.md` 2026-10-27 forbids bundled re-baselines. Changes:
   - Check B1a: U4 must pass the visual gate against the existing baselines, with the eye-shadow difference measured.
   - Commit B1b re-shoots after U5 alone.
   - U4 step 0 freezes the oracle from the running pre-U4 MobModel into `tests/fixtures/mob-legacy-vertices.json`.
10. **MED: K4f probably survives.** Applied. The evidence is the world-load spawn: 20 mobs plus 4 hub NPCs once the spawn chunk loads (`SpawnerSystem.jsx:97-116`), mounted with no distance cull (`SimplifiedNPCSystem.jsx:128-130`). Whether one of them draws before the test's spawn depends on the frustum, so the old e2e was at best unreliable. The e2e now asserts the warm-up's `compileAsync` resolved before the first rig `onBeforeRender`, with the rig program keys present at warm-up.
11. **LOW: `charRim` becomes dead config.** Applied. Verified: its only reader is `MobModel.jsx:51`. Changes:
    - The flag is deleted from `quality.js`.
    - The tier gate is replaced by the e2e `the rim is lit on the low tier`, which reads the live uniform.
    - K2b is re-aimed at a tier gate put back in MobModel.
12. **LOW: `spellLayers` was not tied to the JSX, and projectile draws were not isolated.** Applied. Changes:
    - `createSpellMaterials` is the single source of the materials.
    - The DEV `readSpellMaterials` reads the mounted group; K6c is re-aimed at it.
    - The draw count samples after the 180 ms telegraph and before the impact (`EnhancedMagicSystem.jsx:124`, `spellVfx.jsx:686-741`).
13. **LOW: "down at least 600 at 40 mobs in view" was not measurable.** Applied. Verified: scenario B has no framing control (`perfScenarios.js:17`). The target is now at least 12 draws saved per in-view mob, with the in-view count printed beside each sample.
14. **LOW: the tones gate contradicted the tones design.** Applied. Verified: `mobFeatures.js:27-30`, `:45-49`, `:53-56`, `:105-109`. Changes:
    - The tones are counted beyond the body and feature tones, at 1-2.
    - The strap takes the extremity colour.
    - Silhouette is gated by box containment against the step 0 fixture, not by bounding box.
15. **LOW: the charge-glow quote dropped its pulse, and other small inaccuracies.** Applied.
    - Current state now quotes the full expression.
    - Dropping the about-4 Hz throb is recorded as a decision in M1, with its reason.
    - Both core spheres are cited as `depthTest={false}` (`:399`, `:410`).
    - The EnhancedMagicSystem return block is cited at `:486-504`.
16. **LOW: scope creep and a wider prod door.** Applied. Verified: the seam header at `lookbookSeam.js:5-7` on `feat/instruments`; umbrella `:89-90` and `:107-108`. Changes:
    - U8 is detached into its own i18n change; its spec is kept, out of this milestone's acceptance and bytes.
    - The lookbook `stage` becomes a lazy chunk behind `?lookbook=1`.
    - The seam header is rewritten in the same commit.
    - The byte total drops from about 12 to about 10.7 KB.
17. **LOW: the shared outline size depended on a mob rendering.** Applied. Verified: drei defaults `size` to `(0, 0)` (`Outlines.js:14`) and divides by it (`:47`). Changes:
    - `<OutlineSizeSync />`, mounted in the always-present `SimplifiedNPCSystem`, syncs the size on mount and on resize or dpr steps, never per frame.
    - The e2e `the outline size is set with no mob mounted` is added, and U6 extends it with a spell cast.
    - K4h is added.

**Not checked in this pass:**
- Real-GPU or WebKit rendering of any amended look.
- The troika Text's own draw count, which U0 measures.
- The full post chain's colour on a frame, which U2 step 3 measures.
- Whether the spawner's world-load mobs fall in the frustum before a test spawn. The amended K4f e2e no longer depends on it.
