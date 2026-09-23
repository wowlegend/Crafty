# Crafty vs the state of the art — September 2026 (external baseline)

**Provenance.** Produced 2026-09-22 by a delegated read-only research agent (primary sources: `gh api`,
`npm view`, the three r186 source tree). It is the answer to QUEUE's closed-loop problem: every other
work list in this directory was written by the same sessions that do the work, so it can only rank
what we already thought of. **Rank new work by this file, not only by our own backlog.**

**What was re-verified by the orchestrating session, same day (not just reported):**

| Claim | How checked | Result |
|---|---|---|
| Greedy-merge key is block type + face dir only; AO sampled at merged-quad corners | `src/world/mesher.js` merge loop (`mask[...] === val`, `val = blockType \| dirFlag << 8`) and the AO corner loop (`cu`, `cu + w - 1`, `cv`, `cv + h - 1`) | ✅ confirmed — AO and biome both absent from the key |
| Block texture array: nearest, no mipmaps | `src/world/proceduralTextures.js` `createBlockTextureArray` tail | ✅ confirmed (`minFilter = NearestFilter`, `generateMipmaps = false`) |
| Hitstop freezes only the player | `src/Components.jsx` `hitstopScale` multiplies the KCC move only | ✅ confirmed |
| three current = 0.186.0, fiber current = 9.8.0, Crafty installed 0.172.0 | `npm view three version`, `npm view @react-three/fiber version`, `node_modules/three/package.json` | ✅ confirmed |
| r186 ships `SunLight` (CSM on WebGL); r186 removed `PCFSoftShadowMap` | agent: tag r186 `examples/jsm/lights/SunLight.js`, `WebGLShadowMap.js:99-101` | agent-verified, not re-run here |
| "No dodge, parry or i-frames" | `src/game/dodge.js` (`isDodgeInvincible`), `Components.jsx` dodge state `iframeDuration: 0.2`, consumed by the store's damage path (`isPlayerInvincible`) | ❌ **FALSE — corrected 2026-09-22.** A dodge with a 0.2 s i-frame window exists and gates incoming damage; only PARRY is absent. The agent's grep missed it. Recommendation #3 below is narrowed accordingly. |

Everything under "inference or unverified" below is exactly that. Line numbers are as of HEAD `7351c3bd`.

## 1. What Crafty has today

| Capability | Crafty today | Evidence |
|---|---|---|
| Renderer | WebGL2 via R3F `<Canvas>`, native AA off; three 0.172.0 (caret stops below 0.173 — effectively pinned) | `GameScene.jsx:157-168` |
| Shadows | One directional light, map 512/1024/2048 by tier, ortho box ±(renderDistance+0.5)×16, follows player, texel-snapped; `PCFSoftShadowMap` via R3F's `shadows` default; no cascades | `quality.js:20-32`, `GameScene.jsx:135-153`, `Atmosphere.jsx:157-170,263,350-381` |
| AO | Per-corner vertex AO (0fps) sky-tinted, plus half-res N8AO on med/high. **Defect:** AO not in the merge key, so a merged quad interpolates 4 corner samples across its whole span; no quad-diagonal flip | `mesher.js:104-127,205-229`, `Terrain.jsx:150-162`, `GameScene.jsx:335-342` |
| Sky | 3-stop gradient dome, procedural stars + moon; no scattering; **no clouds anywhere** | `Atmosphere.jsx:89-145` |
| Water | 220 m plane, 96×96, Gerstner re-displaced **on the CPU main thread every frame**; toon Fresnel + crest foam; no reflection/refraction/shore foam | `Ocean.jsx:1-30,76-93` |
| Fog | `FogExp2` + height fog patched into global ShaderChunks + terrain aerial haze 38→165 m | `Atmosphere.jsx:18-40,306-308`, `Terrain.jsx:185-189` |
| AA | SMAA only, placed **before** `<ToneMapping>` (edge detect on HDR) | `GameScene.jsx:333,368-369` |
| Post chain | N8AO → GodRays → HueSat → BrightnessContrast → Bloom → SMAA → ToneMapping → Noise → Vignette | `GameScene.jsx:333-376` |
| Streaming / LOD | 16×16×256 chunks, renderDistance 2/3/4 → ~32-64 block radius; no LOD; far plane 500 | `Terrain.jsx:9,33,740-755` |
| Textures | Procedural 32×32 `DataArrayTexture`, 16 layers, nearest, no mips; roughness 0.85, no normal maps | `proceduralTextures.js:202-212` |
| Foliage | Instanced lit grass, GPU wind + bend, stride 2, cap 50/chunk | `OptimizedGrassSystem.jsx` |
| Characters | Primitive boxes, 2-band toon, inverted-hull outline; no glTF/skinning | `MobToonMaterial.jsx` |
| Mob AI | Worker 3D A* on a **9×9 local grid**; per-archetype aggro/cooldown/leash; ~380 ms escapable windup | `ai.worker.js:30,142,199-218,330-352` |
| Combat feel | Tiered hitstop but **player-motion only**; shake/kick/knockback/telegraphs; a **dodge with 0.2 s i-frames** exists (`game/dodge.js`); no parry | `Components.jsx:1135-1140`, `game/dodge.js` |
| Save | JSON in `localStorage` (sync, ~5 MB); no IndexedDB/OPFS | `game/worldSaves.js` |

## 2. State of the art (primary-sourced)

- **three r186 current (2026-09-08).** Crafty is 14 minors behind (r172, 2024-12-31).
- **r186 `SunLight`** — cascaded sun shadows that work on `WebGLRenderer` (`examples/jsm/lights/SunLight.js`).
- **r186 removed `PCFSoftShadowMap`** — logs and falls back to `PCFShadowMap`. Crafty depends on it implicitly.
- **WebGPURenderer is still "experimental"** per the r186 manual; WebGLRenderer is "recommended for pure WebGL 2", no large new features planned.
- **Newest effects are WebGPU/TSL-only**: SSGI, GTAO, TRAA, SSR+denoise, GodraysNode, volumetric lighting, volume clouds, compute water/particles. Migrating costs every `onBeforeCompile` (6 files), `ShaderMaterial` (7) and the global ShaderChunk patch, plus the whole `@react-three/postprocessing` chain.
- **WebGPU browser reach**: Chrome/Android ARM, Safari macOS+iOS 26, Firefox Win/macOS ARM; Firefox Android flagged, Linux partial → a WebGL2 fallback stays mandatory.
- **pmndrs**: fiber 9.8.0 stable; v10 alpha is where WebGPU/TSL lands; drei 11 alpha; `@react-three/postprocessing` 3.1.2 (needs fiber ≥9.7); postprocessing v7 still beta, peer three `<0.186`.
- **Minecraft Vibrant Visuals** (Bedrock 1.21.90) is the mainstream bar: directional shadows, volumetric fog/shafts, scattering sky, **cloud shadows**, per-biome grading, SSR, caustics, bloom, auto-exposure, TAAU.
- **Veloren**: LISPSM shadows, point-light shadows, **LoD terrain**, cloud shader with scattering. **Hytale** early access 2026-01-13.
- **0fps (2013)** still defines per-vertex voxel AO, including the anisotropy diagonal flip; SSAO layers on top, it does not replace it.

**Inference / unverified:** Hytale and Cube World combat specifics (reviews, not primary); no WebGPU-vs-WebGL voxel frame-time benchmark found; no hitstop specifics for any title.

## 3. Gap analysis

| Capability | Gap | Impact | Cost | Risk |
|---|---|---|---|---|
| Vertex AO correctness | **Major** | LOOKS — crease becomes a many-block gradient | S | Low |
| Texture mipmaps | **Major** | LOOKS — distant shimmer/moiré no post pass fixes | S | Low |
| Shadow coverage (CSM) | Major | LOOKS — no shadows past ±72 u | M | Med |
| PCFSoft dependency | Minor now, trap on upgrade | silent softness change | S | Low |
| View distance / LOD | **Major** | LOOKS + PLAY — world reads small | L | Med |
| Sky / clouds | **Major** | LOOKS — sky is empty | S-M | Low |
| Volumetric fog | Minor-Major | mood depth; cheap version exists | L (WebGPU) | High |
| Water | Minor (+ main-thread perf smell) | flat sheen; per-frame CPU loop | M | Low |
| AA order | ~~Minor~~ — **void**: SMAA before tone mapping is the library's recommended order (see Runners-up) | — | — | — |
| Hitstop scope | **Major**, cheap | PLAY — world keeps moving during the freeze | S | Low |
| Evasion verb | ~~Major~~ — **exists** (dodge + 0.2 s i-frames); parry absent | PLAY — the windup already has an active answer | — | — |
| Pathfinding 9×9 | ~~Minor-Major~~ **worse than stated, FIXED** (`232f0581`, `43154097`) | PLAY — mobs did not stick on walls, they walked UP them (no horizontal collision; the snap lifted them to the top surface). Now they route around, slide, or wait; the snap refuses a climb for every mover | M | Med |
| Save backend | Minor now | quota + sync stalls | M | Low |
| Renderer generation | Future-proofing | newest effects gated on WebGPU | L | **High** |

## 4. Top 5 (impact ÷ cost × risk)

1. ✅ **SHIPPED `1be94a5c`** — **AO (and biome) into the greedy-merge key + 0fps diagonal flip** — worker-only. Shares its change
   site with QUEUE **R1.1** (biome read outside the quad), so they land as ONE change. Verify: floor-beside-wall
   fixture (only the crease row darkens; ≥2 quads), quads/chunk budget over fixed seeds (≤ +25%).
2. **Mipmap the texture array** — keep nearest MAG, mipmapped MIN (+ optional anisotropy). Verify:
   far-band temporal-stability probe (sub-pixel camera jitter, depth > 40 m), plus a gate on `generateMipmaps`.
3. **World hitstop** — one global time-scale read by mob interpolation, VFX ageing and AI tick, not only
   the player's own motion. (The dash-with-i-frames half of the original recommendation rested on a false
   "no dodge" claim — the dodge exists; see the verification table.) Verify: unit (mob visual delta 0 in
   hitstop), and a cap on total freeze per window so multi-hits do not read as lag.
4. **three 0.172 → 0.186 + `SunLight` CSM on WebGL** — set `shadows="percentage"` explicitly first.
   Watch the 6 `onBeforeCompile` files and the global ShaderChunk patch; FUTUREPROOF R1 records a
   postprocessing version that broke the sun. Verify: gates + zero-warning boot + far-caster capture state
   + `perf:m2` within +10%. **Dependency bump → falls under the "new dependency" escalation line: queue for Kevin.**
5. **Clouds + cloud shadows** — mood-tinted noise layer; same noise dims the terrain light term; driven by the
   capture clock so capture stays deterministic. Verify: sky-region-localised capture diff, compiled-program
   sampler gate, < 0.3 ms at high.

Runners-up: far-horizon heightfield impostor (highest LOOKS ceiling, cost L); Gerstner into the vertex
shader; ~~SMAA after ToneMapping~~ — **dismissed 2026-09-22**: the library's own guidance says the opposite.
pmndrs/postprocessing's Effect-Merging wiki (via Context7, queried 2026-09-22) lists the recommended order as
SMAA first, Tone Mapping near the end — which is the order `GameScene.jsx` already has. The "AA order" row in
the gap table rests on the same claim and is void with it.

## 5. Future-proofing flags

- three pinned at 0.172 vs 0.186 — 14 breaking minors owed; postprocessing's peer range is the only upper bound.
- `PCFSoftShadowMap` removed in r186 — pin `shadows="percentage"` BEFORE any upgrade so the change is explicit.
- WebGL post stack is WebGL-only; any WebGPU move replaces it wholesale. **Stay on WebGL** until R3F v10 is
  stable; keep new shader work in small isolated modules so a TSL port stays cheap.
- fiber 9.5 → 9.8, `@react-three/postprocessing` 3.0.4 → 3.1.2 — routine, but R3F caps React < 19.3.
- `localStorage` saves — plan IndexedDB before world blobs grow.
