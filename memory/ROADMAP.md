# Roadmap & Future Enhancements

> ⚠️ **Superseded framing (2026-05-31):** the "Phase 19–25" roadmap below is the pre-initiative Gemini plan. The ACTIVE roadmap is now the **Crafty → SOTA initiative**, decomposed into streams: **S0** reality audit (DONE) · **S1** art direction (locked; **S1-A foundation DONE** · **S1-B render recipe DONE** — M1 render correctness + device tiers, M2a mood/atmosphere + bright-Caribbean art, M2b character render language [2-band toon + fresnel rim + inverted-hull outlines; boss emissive telegraph preserved]; all merged to `main`, `test:visual` 6/6) · **S1-C UI design system IN PROGRESS** — **M1 token-foundation + bold-flat primitives + i18n DONE** (2026-06-01, merged; tokens→CSS-vars→Tailwind SoT chain, 7 primitives, en/zh i18n with lazy-CJK, `test:visual` 8/8); **M2 consolidate-3-languages + UI-hex-migration NEXT**, then M3 icon-system + emoji-data-decouple; then S1-D signatures (Spell-VFX, Mascot) · **S2** game design · **S3** engine (touch input DONE 2026-06-15 · de-monolith DONE [5 god-files -> 2] · remaining: ECS hardening, WebGPU/TSL migration) · **S4** multiplayer + monetization. See `SOTA-INITIATIVE.md` + `docs/superpowers/` (specs + per-milestone plans). Items below are retained as historical/backlog reference.

*(Updated via the autonomous loop — June 11, 2026)*

> **STATUS (2026-06-15, HEAD eb924db) — ALL SELF-VALIDATABLE FRONTS DONE; REMAINING WORK IS KEVIN-GATED:** This session shipped (all on main, pushed): (1) P0 camera fix — own src/input/pointerLook.js + first LIVE-input gate npm run test:look (scripts/visual/look-e2e.mjs), replacing element-fragile drei PointerLockControls; (2) music overhaul — ElevenLabs day/night/boss tracks + crossfade via src/ui/MusicPlayer.jsx, procedural pad/arp muted (PROC_MUSIC_GAIN=0); (3) terrain flattened + sun mesh shrunk (radius 24->13); (4) TOUCH FRONT COMPLETE (probe-exhausted) — iOS cold-start bridged via enterPlay() (MenuSystem.jsx), QuestTracker collapses, spell-label nowrap, compact SimpleExperienceBarTouch readout, deterministic scripts/visual/touch-probe.mjs; minimap JUDGED+SKIPPED; (5) OCEAN MILESTONE COMPLETE (plan docs/superpowers/plans/2026-06-14-crafty-ocean-coast.md, 4 slices S1-S4: tropical teal + sheen, shore foam via un-merged water-top faces, depth-graded top surface, ocean-coast capture state; new scripts/visual/ocean-probe.mjs). **Gates: 1182 unit / 20-state visual (added ocean-coast) / build clean.** **ONLY REMAINING WORK = KEVIN-GATED (KEVIN-REVIEW #37/#38):** redeploy crafty-sand.vercel.app, real-device iOS touch feel, music ear-check, ocean taste sign-off; plus OPTIONAL sun-arc / menu-music. Loop in ~45min steady-state hold. The STATUS blocks below are HISTORY (newest first).

> **STATUS (2026-06-11) — 🏆 THE FOUR-ASPECT SPINE IS COMPLETE:** WILDHEART ✅ · VOIDHAND ✅ · SOULBIND ✅
> · ELEMANCER ✅ (all designed-workflow'd, spec'd, milestone-planned, built, judged, bannered; 837 unit /
> 23 gates / visual 13/13 [STALE as of 2026-06-15: now 1182 unit / 20-state visual]; zero re-baselines across B3+B4). ALSO SHIPPED 2026-06-10/11: Kevin's
> live-playtest arc (the respawn camera-streamer deadlock + the pointer-lock/menu state machine, 6
> commits), the Aspect-UX guide cards, the audio + feel + content interleaves (3 new mob types + the
> Grimhound). **THE ACTIVE ROADMAP NOW = the post-spine spine: S3 de-monolith/engine-hardening
> (charter §2.4 as amended; characterization-first over the 5 god-files) → B4-v1.5 (reagents / frost
> plates / fire-spread) → the v2 voxel-mutation seam (real-iPad-gated) → S4 (Kevin-gated:
> multiplayer/monetization).** The STATUS blocks below are HISTORY (newest first).

> **STATUS (2026-06-09):** **S2-B2 VOIDHAND (kinetic/gravity-hand, the 2nd Aspect) — design approved + M1 done** (on `main`, pushed). Design-of-record: `docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md`. **M1 = the load-bearing no-re-mesh foundation** (grab→phantom-orbit; pure SM `voidhand.js` + meter `kinetic.js`; `PhantomBlockSystem.jsx`; the `grab` intent = **`KeyV`**; the static gate `voidhand-noremesh-gates` GREEN; death-edge fix; adversarial review clean; 657 unit · visual 13/13). **NEXT = M2 real-iPad FPS gate BEFORE the verbs** → M3 HURL/SLAM impact + FPV playtest → M4 base-as-anvil 3× + kinetic-meter + voidhand_grasp talent gate + autosave + HUD → M5 elements → M6 pool-safety → M7 LOOK → M8 content. Aspect sequence: Wildheart✅ → **Voidhand (M1✅)** → Soulbind → Elemancer.

> **STATUS (2026-06-07):** **S2-A COMPLETE + merged** (M1 combat spine · M2a-d progression/persistence/talents/input · M3 stakes-loop/day-night/siege · M4 perf+tier-levers). **S2-B1 WILDHEART (the lead Aspect) COMPLETE + merged** — mechanics (M0 look-lock · M1 transactional collider-swap + no-permanent-beast · M2 bull physics gate · M3 transform SM/roar verb · M3.5 kill-fanout · M4 Ferocity meter · M5 combat+locomotion re-skin · M6 talent nodes + Primal-Roar gate) **AND the LOOK** (M7 third-person transform-cam beachhead · M7c morph choreography · M8 4-beast roster · punchy glow · cool-rim hold; merge `458bbb5`; 630 unit · visual 13/13). **Directional decision (Kevin):** Crafty → THIRD-PERSON (beachhead shipped; full control pivot deferred to ~S3 mobile). **NEXT:** S2-B1 deferred tuning (boss-kill ferocity, per-form melee range/arc + bull debris-shove, form-paced dodge/vault) + **beast-capture reliability** (in-world capture non-deterministic → 4 beast frames not gate-baselined) → then **S2-B2 = the next Aspect** (Voidhand / Soulbind / Elemancer) per `SOTA-INITIATIVE.md`. Also pending: vitest 3→4 security bump (#32, separate task on main).

> **STATUS (2026-06-02):** **S1 COMPLETE** (art direction + render + UI + signatures, all merged). **S2 game-design SPEC'd + approved** (`docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` — foundation-first S2-A, then the four **Aspects**: Wildheart/Voidhand/Soulbind/Elemancer). **S1→S2 reality audit DONE** (`REALITY-AUDIT-S1-2026-06-02.md`). **S2-A-M1 (combat spine + input abstraction) DONE + merged** (input-intent module · melee-hits-boss · boss-music + ribbon fixes; 360 unit · visual 12/12). **S2-A-M2a (progression-persistence core + save consolidation) DONE + merged** (`018f0dc`: single `buildSaveData` serializer + store-owned level/XP + full-slice round-trip + local-first autosave + slop teardown — dead axios save deleted, 4× maxStats formula DRY'd, GameSystems HP-ratchet removed, frost_shield de-baked; 406 unit · visual 12/12). M2 was decomposed → M2a / M2b / M2c / M2d — **ALL DONE + merged**: M2b (build axis A7 — allocate-attribute UI + weapon-dmg DRY; `f6665d0`), M2c (talent→4-Aspect-trees A4 — `849d1fa`), M2d (single pointer-lock authority — `inputState.active` SoT + `useActiveInput`; 451 unit · 12/12 visual). Quest+achievement persistence pulled forward (`97f645a`); boss→obsidian bridge fixed (`a428df7`). **NEXT: S2-A-M3** (stakes loop: day→build→night-SIEGE→survive-to-dawn + **the day/night clock tick** [`gameTime` never advances → permanent day; M3 owns it] + escalating night danger + loot juice) → M4 (perf + widen-the-gates: forced-med/low baselines + tier-transition invariant + wire dead `renderDistance`/`weather`) → **pre-S2-B sub-audit** (content-variety + signature-fires + coherence-gate calibration) → S2-B Aspects (Wildheart lead). QA cadence (spec §7): per-stream reality audits + widen-the-gates + the coherence/less-is-more dimension (blind-spot classes #7/#8/#9).

### S3 deferred technical items (logged from later streams)

- **[from M2d, 2026-06-03] Migrate `world/Terrain.jsx:253,556` off raw `document.pointerLockElement`** onto `getInput().active`. M2d made `inputState.active` the single input-active SoT for the React UI/menu/verb-gate + InputManager layer, but these two **canvas-layer** reads (block-highlight `useFrame` visibility gate + block place/break click gate) still read the raw browser pointer-lock fact — so they will NOT honor the S3 touch layer's `active` (touch never sets `pointerLockElement`). They pre-exist `main` (not an M2d regression). The block-place CLICK gate interacts with the optimistic-`setActive(true)`-before-browser-lock window → needs its own analysis + test (NOT a parity refactor), hence S3 (touch). Do it WITH the `setIsPointerLocked`→`setInputActive` prop-chain rename (HUD/MenuSystem/App) for a coherent single-name input-active surface.



### Phase 19: WebGL2 Texture2DArray Voxel Texturing & Wind Foliage [COMPLETED]
*Upgrading flat voxel coloring to high-resolution material batched arrays and dynamic wind-swayed foliage fields.*
- [x] **WebGL2 Texture2DArray Atlas**: Replace basic vertex colors with a single `Texture2DArray` sampler with dynamic coordinates pre-baked into compact vertex attributes.
- [x] **Wind Instanced Foliage Vectors**: Upgrade vegetation systems to support interactive multi-entity displacement and dynamic ambient wind sway animations.

### Phase 20: Procedural Melee Weapon Trails & GPU Spark Particles [COMPLETED]
*Polishing combat sensory feedback with procedural ribbon meshes and high-performance particle cascades.*
- [x] **Procedural Ribbon Trails**: Generate dynamic ribbon meshes trailing player weapon swing arcs to convey weight and velocity.
- [x] **GPU Particle Spark Systems**: Offload particle impact bursts to optimized GPU vertex shader instances, scattering hundreds of glowing embers.
- [x] **Impact Critical Camera Shake**: Add brief, directional camera shake and elemental gradient text color pulses on critical hit registry.

### Phase 21: Acoustic Voxel Ray-Tracing Occlusion & Dynamic Combat Soundtrack [COMPLETED]
*Implementing dynamic spatial audio occlusion raycasts and interactive tension arpeggiators.*
- [x] **Acoustic Occlusion Raycasts**: Cast low-overhead audio rays from emitters to listener. Reduce high-frequency filter thresholds if >3 solid voxel blocks intersect.
- [x] **Dynamic Combat Arpeggiators**: Synchronize chord arpeggiations and synthesizer tempos to scale with active combat hostiles population counts.

### Phase 22: Cellular Automata Dungeon Structures & Voxel Blueprint Stamp Systems [COMPLETED]
*Expanding world procedural depth with subterranean dungeon chambers and complex structural trees.*
- [x] **Cellular Automata Dungeons**: Implement background worker generators to carve out stone chambers and support beams in lower cave zones (`Y < 20`).
- [x] **Blueprint Stamp System**: Build asynchronous structure arrays to stamp complex architectural L-systems (huge dungeons, custom trees) into chunk streams.

### Phase 23: Ledge parkour, Placeable Chests, & Skill Talent Trees [COMPLETED]
*Deepening locomotion freedom, inventory storage solutions, and attributes progression paths.*
- [x] **Ledge Parkour**: Deploy parallel horizontal collision raycast sweeps to trigger climbing states when leaping against wall edges.
- [x] **Placeable Chest Entities**: Set up placable voxel container chests saving mapped inventories inside Zustand state trees.
- [x] **Skill Talent Tree Panels**: Construct interactive grid overlays to unlock and progress elemental spell enhancements.

### Phase 24: AI Behavior Trees Cover Systems & Dynamic Boss Voxel Destruction [COMPLETED]
*Upgrading hostile combat logic with tactically smart behavior selectors and dynamic environment destruction.*
- [x] **AI Behavior Trees**: Integrate dynamic state-selection trees enabling hostiles to seek blocked cover lines when health thresholds fall below 25%.
- [x] **Dynamic Boss Voxel Destruction**: Enable Phase 2/3 Shadow Dragon shockwaves to convert struck solid blocks into dynamic falling rigid-body entities.

### Phase 25: Multiplayer WebSockets Delta Sync & RLE Chunk Compression [PLANNED]
*Paving the way for online lobbies and highly optimized network chunk serialization.*
- [ ] **WebSocket Multiplayer State Sync**: Decouple player inputs to support network-interpolated guest character visual models.
- [ ] **Run-Length Encoded Chunk Compression**: Compress terrain data streams into run-length array packages before local or network saves.

### Phase 18: Rapier Kinematic Character Controller [COMPLETED]
*Deeply optimizing character locomotion, ground-snapping, slope navigation, and walled sliding.*
- [x] **WASM-Native Character Controller**: Integrated Rapier KCC to offload collision checking directly to WASM, resolving capsule sliding jitters.
- [x] **Automatic Slope Snapping & Step-Ups**: Enabled 1.05m autostep and 0.5m snapping to ensure perfect stairs and cliff climbing.
- [x] **Decayed Impulse Knockbacks**: Patched custom compatibility redirection that intercepts boss attacks and channels them into decayed spring dampers.

### Phase 17: SOTA 3D Greedy Voxel Mesher [COMPLETED]
*Deeply optimizing chunk geometry compilation and physics trimesh triangles.*
- [x] **3D Greedy Voxel Mesher**: Re-engineered chunk voxel compilations in `terrain.worker.js` with slice-and-sweep coplanar quad merging, slashing vertex counts by 80-90%.
- [x] **CCW Winding preservation**: Maintained exact lighting and rendering normals for all 6 faces.
- [x] **Trimesh physics optimization**: Simplified the Rapier compound collider, removing locomotion stutters.

### Phase 16: SOTA Visuals, Volumetric Weather, Cavern Acoustics & GPU Grass [COMPLETED]
*Deeply enhancing environmental visuals, weather cycles, acoustics, and foliage animations.*
- [x] **Interactive GPU Grass Displacement**: Implemented player position uniform binding and vertex-level quadratic grass bending in `OptimizedGrassSystem.jsx`.
- [x] **Bioluminescent Wave Shaders**: Added procedural wave displacements on water blocks and pulsating neon blue night bioluminescence via `onBeforeCompile` material shaders in `Terrain.jsx`.
- [x] **Volumetric Weather & Fireflies**: Integrated `<WeatherSystem />` in `GameScene.jsx` driving rain, snow, and night firefly cycles, using `getMobGroundLevel` raycasts for physics-ground snapping.
- [x] **Cavern Acoustics Reverb Loop**: Created a procedural delay-feedback audio graph in `SpatialAudioController` that dynamically modulates cave wetness echo based on depth (`y < 10`).

### Phase 15: Infinite Map Spawning & Chunk Culling Memory Leak [COMPLETED]
*Deeply resolving spawning radius failures and memory leaks for infinite world exploration.*
- [x] **Terrain Chunk Memory Leak Resolution**: Fixed the Progressive Chunk loading in `Terrain.jsx` to surgically delete culled chunk keys from the central `chunksRef.current` Set, preventing perpetual memory footprint growth.
- [x] **Dynamic Infinite Spawner Loop Engine**: Re-engineered the 2-second `SpawnerSystem` tick in `SimplifiedNPCSystem.jsx`. Replaced chunk-specific Set tracking with an active-mobs population cap check (max 16) that dynamically spawns mobs inside a ring range of `[28, 85]` blocks inside active generated chunks around the player.

### Phase 14: Interactive SOTA Overhaul & Immersive Atmosphere [COMPLETED]
*Deeply enhancing combat feel, visual casting indicators, environmental fog, and procedural synth soundscapes.*
- [x] **Visceral Combat Squash & Tilt**: Directional squash/tilt flinch on mobs combined with dampening springs.
- [x] **Expanding Impact Rings**: Pooled expanding shockwaves color-coded by hit type.
- [x] **Spell-Specific Floating Gradients**: High-contrast damage numbers with spell-colored linear gradients.
- [x] **Channeling Hands & Aura**: Channeling vibrations, colored left-hand pointLights, and attack-pulsed auras.
- [x] **Atmospheric Day/Night Fog**: Seamless EXP2 fog color/density transitions blended to background color.
- [x] **4-Voice Procedural FM Synth**: Step-scheduled chords with resonant filters, LFO frequency sweeps, and exponential portamento glides.

### Phase 13: Progression & Progression Loop [COMPLETED]
*Structuring the underlying progression systems and expanding world interactions.*
- [x] **Player Leveling System**: Connect XP orbs to player progression with UI feedback.
- [x] **Expanded NPC Interactions**: Reintroduce trading systems, quest hubs, and allied mobs.
- [x] **Persistent World Saving**: Build out backend support for chunk compression and saving player states directly to the database.

### Technical Debt (Audited & Resolved)
- [x] **Evaluate ECS Web Worker bridge performance with 100+ entities**: Audited V8 structured clone overhead. Serialization costs are extremely low (~0.1ms per frame for 100+ entities, taking <0.6% of the 16.6ms frame budget). Garbage Collection pressure is minimal (~2.4MB/s), resulting in zero stutters. The serialized array transfer is declared safe and highly optimized.
- [x] **Move any remaining UI state logic out of GameScene.jsx**: Verified that `GameScene.jsx` has been fully decluttered. It contains zero HTML/DOM UI state logic, serving exclusively as a clean 3D scene container with all UI overlays correctly isolated into dedicated components.

