# ELEMANCER M6 — The Look Implementation Plan

> **REVIEW DELTAS (2-lens adversarial workflow wf_ddeb669c-4b9, applied before T1):** (1) MOUNT at the
> GameScene SCENE ROOT beside GPUSparkSystem — NOT Components (ElementZoneSystem sits inside the player's
> RigidBody; a transformed parent carries world-positioned rings) and NOT App (DOM layer). (2) PRIME
> instanceColor at mount (r172 lazy-creates it on first setColorAt — unguarded needsUpdate throws every
> frame in the empty state = every baseline). (3) The flat orientation is BAKED INTO THE GEOMETRY
> (geometry.rotateX) — the rotated-parent option swizzles world positions; STRUCK. (4) The dawn char-diff
> gets a 2-FRAME GRACE after the isDay edge (the renderer mounts before the bridge in tree order — it
> would consume the flip while zones are still alive, then scorch-stamp every burning zone next frame).
> ACCEPTED + recorded: annihilation/evict also leave char (fire was there); SFX replays on dedupe-refresh
> (the player did cast). Resolved: StatBar delta = FILL += resonance:'bg-resonance', ICON_COLOR +=
> resonance:'text-resonance' (StatBar.jsx:9-10). depthWrite:false on BOTH pools; char mounts BEFORE
> rings (normal under additive); char y+0.04 vs ring y+0.06. The central capture claim VERIFIED SOUND
> (the registry provably empty in all 13 states; the deterministic cast carries no imbueKind and never
> moves; now-substitution matches the GPUSparkSystem/EnhancedMagicSystem precedent exactly).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §2/§3 M6.
> **REFERENCE-LOCK (charter §look):** the committed visual language is the design §2 + the LIVE element
> palette — zone decals are EMISSIVE ADDITIVE GROUND RINGS in the element colors (fire `#FF7A3C` /
> ice `#6FC8FF` / lightning `#FFE066` / arcane `#B36BFF`, theme/tokens MAGIC palette), toneMapped false,
> breathing gently; char = matte ink scorch (the toon-outline ink family `#1A1A1A`-ish); the white-gold
> `#F5D76E` stays the PLAYER-side identity (reticle/bar) — the world-side zones speak ELEMENT colors.
> Judged in-world via the showcase card (the sky-studio family).
> **THE CAPTURE STANCE (the load-bearing call):** gate the LOGIC, not the RENDER. The bridge
> (ElementZoneSystem) is already capture-gated, so `getLiveZones()` is ALWAYS EMPTY in normal captures —
> the 13 baselines are safe with an UN-gated renderer. That un-gated renderer is exactly what lets the
> showcase card inject zones (spawnZone straight into the live registry) and still draw them in capture.
> The breathing pulse must freeze under capture (drive it from a `now` that the showcase passes as fixed).

**Goal:** Zones become visible, audible, and judged: element-colored breathing ground rings + permanent-for-the-night char scorch + four synth SFX + the Resonance bar + the elemancerShowcase judge card.

**Architecture:** `world/ElementZoneRenderSystem.jsx` — TWO always-mounted InstancedMesh pools (count-0 mounted): the ZONE pool (24 × flat ring, per-instance color/scale, additive, opacity pulsing by `Math.sin(now * rate + id)`; the resonant kind pulses ~2× faster — the rune reads as ALIVE) and the CHAR pool (16 × flat disc, matte near-black, normal blending, opacity ~0.5). Per frame: write zone instances from `getLiveZones().zones` (kind→palette color; radius→scale); consume `stepZones`' expired — NO: expiry is the BRIDGE's tick; instead the bridge exports a tiny one-shot list… SIMPLEST HONEST SEAM: the render system OWNS char — it diffs the zone ids it drew last frame vs now; a burning id that VANISHED (and isDay didn't flip) leaves a char instance at its last pos (ring-buffer, oldest-overwritten). Dawn clears both (the same isDay edge the bridge uses). SFX: a spawn-moment one-shot per kind played by the BRIDGE at spawnZone success (`store.playSpatialSound` — the bind/squad frame-safe precedent); four new all-synth buffers in SoundManager (the #74 named-buffer registry): `ignite` (filtered noise whoosh + crackle), `freeze` (descending crystalline shimmer), `zap` (bright sawtooth snap), `rune` (a soft consonant hum swell). The Resonance HUD bar = the SoulBar twin (kind `resonance`, icon `magic`, gated on `elemancer_imbue` talent + resonance > 0, label `IMBUE!` when ≥ ZONE_COST — the GRAB!/SNARE! family). The showcase: `elemancerShowcase` hook (App.jsx, lane x=200, the sky-studio family): clear mobs, spawn the FOUR zones in a row by calling spawnZone directly into getLiveZones() (GAP ~7 so dedupe/annihilation/amplify rules don't interact), fixed camera looking down the row at a shallow angle (zones are GROUND decals — the camera needs ~25-35° declination to read them), capture-first.

**Tech Stack:** getLiveZones (M4); ZONE_DEFS palette mapping; the GPUSparkSystem instanced patterns; SoundManager's generate*Sound registry (#74); StatBar kind chain (tokens already carry `resonance` from M5); the soulbindShowcase hook precedent (App.jsx, x=160).

---

### Task 1: the render system (zone rings + char)

**Files:** Create `frontend/src/world/ElementZoneRenderSystem.jsx`; Modify `frontend/src/App.jsx` or Components mount site (beside ElementZoneSystem); extend `frontend/tests/gates/elemancer-noremesh-gates.test.js` GATED += the render file

- [ ] **Step 1:** the component: two InstancedMesh refs (ZONE_POOL=24 ringGeometry(0.72, 1, 32) / CHAR_POOL=16 circleGeometry(0.9, 24)), both `frustumCulled={false}`, materials: zone = meshBasicMaterial additive toneMapped:false transparent vertexColors-off (per-instance via instanceColor) / char = meshBasicMaterial color '#141414' transparent opacity 0.5 normal-blend depthWrite:false; both rotated flat (rotation-x -PI/2 on a parent group or baked per-matrix). useFrame: read `getLiveZones().zones`; for i<count: compose the matrix at zone.pos (y + 0.06 epsilon), scale = zone.radius × (1 + 0.06·sin(now·rate + zone.id)) with rate = kind==='resonant' ? 5 : 2.2; setColorAt from the PALETTE map {burning:'#FF7A3C', frozen:'#6FC8FF', conductive:'#FFE066', resonant:'#B36BFF'}; mesh.count = zones.length; instanceMatrix/instanceColor needsUpdate. CHAR diff: a Map ref of id→{pos, kind} drawn last frame; ids that vanished with kind==='burning' AND !isDay-flip push into a char ring-buffer (cap 16, oldest-overwritten); char instances render from the buffer; the isDay edge clears the buffer. CAPTURE: do NOT gate the draw; freeze the pulse — `const now = isCaptureMode() ? 0 : state.clock.getElapsedTime()`.
- [ ] **Step 2:** mount beside `<ElementZoneSystem />`; gate list += the file (NO forbidden tokens in comments).
- [ ] **Step 3: full battery** (the 13 baselines must hold — liveZones is empty in every capture path) **→ commit** `feat(elemancer-m6): zones become visible — the instanced ring pool + the char scorch diff (logic gated, render free)`

### Task 2: the four synth SFX + the spawn-moment wiring

**Files:** Modify `frontend/src/SoundManager.jsx` (4 generate fns + registry entries, the #74 shape); Modify `frontend/src/world/ElementZoneSystem.jsx` (the bridge plays at spawn success)

- [ ] **Step 1:** SoundManager: `generateIgniteSound` (0.45s: bandpass-filtered noise burst, 800→300Hz sweep + 3 crackle ticks), `generateFreezeSound` (0.5s: descending sine arpeggio 1400→700Hz with shimmer detune), `generateZapSound` (0.18s: sawtooth 220Hz + noise snap, fast decay), `generateRuneSound` (0.7s: two soft sines a fifth apart, slow attack/swell). Registry: `sounds.current.ignite = ...` etc. (the named-buffer pattern).
- [ ] **Step 2:** the bridge: after `spawnZone` returns a zone (NOT null — annihilation is silent steam v1): `store.playSpatialSound(SFX_BY_KIND[z.kind], [z.pos.x, z.pos.y, z.pos.z], 1, 30)` with SFX_BY_KIND = {burning:'ignite', frozen:'freeze', conductive:'zap', resonant:'rune'}. (The bridge already holds `store`; playSpatialSound is the frame-safe precedent.)
- [ ] **Step 3: battery → commit** `feat(elemancer-m6): the four element voices — ignite/freeze/zap/rune (all-synth, spawn-moment)`

### Task 3: the Resonance bar

**Files:** Modify `frontend/src/HUD.jsx` (the SoulBar twin + its mount in the bar stack)

- [ ] **Step 1:** `ResonanceBar` = the SoulBar copy-shape: `resonance = useGameStore((s) => s.resonanceBanked)`, `hasImbue = (s.unlockedTalents?.['elemancer_imbue'] ?? 0) > 0`; null when locked/zero; `<StatBar kind="resonance" value={resonance} max={RESONANCE_MAX} icon="magic" label={resonance >= ZONE_COST ? 'IMBUE!' : null} showValue className="w-44" />`. VERIFY StatBar's FILL/ICON maps include `resonance` (the kind chain: StatBar may hold per-kind classes — twin the soul entries). Mount beside `<SoulBar />`.
- [ ] **Step 2: battery** (capture saves lack the talent — baselines hold, the SoulBar precedent) **→ commit** `feat(elemancer-m6): the Resonance bar — the build-verb bank reads in the HUD`

### Task 4: the elemancerShowcase card + the judge

**Files:** Modify `frontend/src/App.jsx` (the hook, beside soulbindShowcase); judge artifacts to `.superpowers/s2b4-elemancer-refs/`

- [ ] **Step 1:** the hook (the soulbindShowcase stencil, lane OX=200, OY=146, OZ=-8): clear mobs; `enterCaptureMode({ camera: { position: [OX, OY + 7, OZ + 13], lookAt: [OX, OY, OZ] } })` (the ~28° declination so ground rings read); spawn the four zones via `spawnZone(getLiveZones(), { kind, pos: { x: OX + (i-1.5)*7, y: OY, z: OZ } }, 0)` for [burning, frozen, conductive, resonant] (GAP 7 > every radius sum — no rule interactions); ALSO push 2 char instances? NO — char comes from live expiry; the card judges the four LIVE looks (char gets judged in-game by Kevin, KRB cue).
- [ ] **Step 2:** drive headlessly (the proven sequence: goto / ready / enterCapture / start / settle / call hook / settle / screenshot) → JUDGE: four distinct element colors? rings read as ground-anchored? the rune's faster pulse frozen-but-distinct (scale differs at now=0 — acceptable)? iterate ONCE.
- [ ] **Step 3:** KRB: the M6 before/after cue + the char-scorch in-game judge ask.
- [ ] **Step 4: full battery → commit** `feat(elemancer-m6): the elemancerShowcase card — the four zones judged in a row`

### Task 5: close-out — spec §3 M6 row ✅ · this plan SHIPPED · ACTIVE_PLAN → M7 (reagent blocks + balance + 🏆 the Aspect close; the charter interleave check is DUE at the Aspect boundary — feel @61).

## Self-review
- Spec coverage: the M6 row (decal pool ✓T1, char ✓T1, the rune look ✓T1 [the faster-pulse + violet distinctness], SFX ✓T2, the showcase ✓T4) + the bar (design §2 HUD) ✓T3. The design's "frost plates" (walkable Rapier cuboids) are NOT in M6 — they were the experience lens's showpiece; the committed design §2 lists them under the ICE zone verb. HONEST REDUCTION recorded: v1 frozen zones = slow-fields (shipped M4); the walkable plate prop is FOLDED INTO M7's reagent/objects task or parked at the Aspect close as a v1.5 — decided at M7 planning (the pre-agreed first-cut clause covers it).
- Placeholders: none — geometries/colors/rates/caps are concrete; the one VERIFY (StatBar kind maps) is a locate-then-twin against the named soul entries.
- Type consistency: PALETTE/SFX_BY_KIND keyed by the four ZONE_DEFS kinds; getLiveZones() is the M4 export; spawnZone(reg, spec, now) signature matches M3.
