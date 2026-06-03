# Roadmap & Future Enhancements

> ⚠️ **Superseded framing (2026-05-31):** the "Phase 19–25" roadmap below is the pre-initiative Gemini plan. The ACTIVE roadmap is now the **Crafty → SOTA initiative**, decomposed into streams: **S0** reality audit (DONE) · **S1** art direction (locked; **S1-A foundation DONE** · **S1-B render recipe DONE** — M1 render correctness + device tiers, M2a mood/atmosphere + bright-Caribbean art, M2b character render language [2-band toon + fresnel rim + inverted-hull outlines; boss emissive telegraph preserved]; all merged to `main`, `test:visual` 6/6) · **S1-C UI design system IN PROGRESS** — **M1 token-foundation + bold-flat primitives + i18n DONE** (2026-06-01, merged; tokens→CSS-vars→Tailwind SoT chain, 7 primitives, en/zh i18n with lazy-CJK, `test:visual` 8/8); **M2 consolidate-3-languages + UI-hex-migration NEXT**, then M3 icon-system + emoji-data-decouple; then S1-D signatures (Spell-VFX, Mascot) · **S2** game design · **S3** engine (touch input, de-monolith, ECS hardening, WebGPU/TSL migration) · **S4** multiplayer + monetization. See `SOTA-INITIATIVE.md` + `docs/superpowers/` (specs + per-milestone plans). Items below are retained as historical/backlog reference.

*(Updated via Session Archivist - May 23, 2026)*

> **STATUS (2026-06-02):** **S1 COMPLETE** (art direction + render + UI + signatures, all merged). **S2 game-design SPEC'd + approved** (`docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` — foundation-first S2-A, then the four **Aspects**: Wildheart/Voidhand/Soulbind/Elemancer). **S1→S2 reality audit DONE** (`REALITY-AUDIT-S1-2026-06-02.md`). **S2-A-M1 (combat spine + input abstraction) DONE + merged** (input-intent module · melee-hits-boss · boss-music + ribbon fixes; 360 unit · visual 12/12). **S2-A-M2a (progression-persistence core + save consolidation) DONE + merged** (`018f0dc`: single `buildSaveData` serializer + store-owned level/XP + full-slice round-trip + local-first autosave + slop teardown — dead axios save deleted, 4× maxStats formula DRY'd, GameSystems HP-ratchet removed, frost_shield de-baked; 406 unit · visual 12/12). M2 was decomposed → M2a (done) / M2b / M2c. **NEXT: S2-A-M2b** (build axis A7: allocate-attribute UI + weapon-dmg DRY + loot→bucket routing · talent→4-Aspect-trees A4) → M2c (InputManager `active`-gate migration) → M3 (stakes loop + `dangerLevel` bridge + loot juice) → M4 (perf + widen-the-gates) → S2-B Aspects. QA cadence (spec §7): per-stream reality audits + widen-the-gates.



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

