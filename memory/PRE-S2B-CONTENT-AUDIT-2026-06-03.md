# Pre-S2-B Content-Variety + Signature-Fires + Coherence Audit

> **Date:** 2026-06-03 · **Mode:** READ-ONLY (no source edited) · **Scope:** Crafty (React 19 / R3F / zustand voxel action-RPG), source = `frontend/src`.
> **Runs BEFORE S2-B** (the 4 Aspects: Wildheart beast-transform / Voidhand gravity / Soulbind capture-creatures / Elemancer reactive-terrain).
> **Purpose:** surface where CONTENT BREADTH is thin and which signatures don't fire in real gameplay, so S2-B builds on honest ground.
> **QA cadence anchors:** blind-spot #7 content-variety · #8 signature-fires · #9 coherence (`docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` §7; `docs/superpowers/specs/crafty-coherence-pillars.md`).
> **Verification:** every file:line below was opened/grepped in source this session. Two finder claims were found inaccurate and are **corrected inline** (marked ⚠️CORRECTION).

---

## 1. Executive summary

The **systems are real; the content authorship is deferred** — and that is the honest state going into S2-B. Crafty's engine spine (ECS spawn/AI worker, A* pathfinding, terrain generation, adaptive music state-machine, spell/melee VFX) all *work* and fire in real gameplay. But the **content layered on top of those systems is template-thin in three of the five dimensions**: the bestiary is a 6-instance box-template swap (color + bounding-box proportions, 3 AI patterns across 5 hostiles), the world is one height-noise surface with material tints (3 biomes + ocean, ONE structure type, near-zero above-ground landmarks, 100%-identical subsurface), and audio is a procedurally-sophisticated façade over thin content (one arpeggiator voice + pad loop, 15 SFX buffers reused across every context — the same "hit" for player-melee AND mob-attack AND projectile-impact). On the **signature-fires** axis the news is good: the one historically-latent signature (obsidian boss-danger mood) is now correctly bridged to gameplay (`AdvancedGameFeatures.jsx:204`), and the audit found **no remaining built-but-never-fired signatures** in prod. On **coherence**, the gate has clean CUT targets distinct from scheduled scaffolds, but it is **not yet calibration-verified** and must not govern any destructive cut until it passes the 100%-must-NOT-cut bound. **Net:** S2-B is buildable on this ground, but the Aspects will land in a world that currently reads as an empty voxel grid populated by color-swapped boxes scored by a single looping arpeggio — so the Aspect work must carry a deliberate, scheduled **content-identity pass** (bestiary + per-Aspect audio motif) or the four signatures will fire into a vacuum.

---

## 2. Per-dimension findings

### 2.1 Mob / bestiary variety (QA #7) — **template-swap, content deferred**

The mob roster is a 6-instance template-swap: color-only variation on a shared voxel-box body, with stat/size deltas. The SYSTEM works; CREATURE IDENTITY is deferred. Verified against `SimplifiedNPCSystem.jsx` and `workers/ai.worker.js` (the finder cited `ai.worker.js` at root; the real path is `world/terrain.worker.js` for terrain and the AI worker is `workers/ai.worker.js` — both confirmed).

| Sev | Finding | Evidence (verified) | Recommendation |
|---|---|---|---|
| **MAJOR** | All 6 mobs render from one box-template; only proportion + color vary | `SimplifiedNPCSystem.jsx:65–72` `MOB_TYPES` — every type carries only `color`, `health`, `speed`, `damage`, `xp`, `passive`, `bodySize`, `headSize`. `MobModel` (from line 75) renders box body + head + procedural legs for all. No mesh/silhouette/primitive variation beyond xyz-scaling. | Post-S2-B3 (Soulbind) bestiary pass: distinct silhouette archetypes (quadruped / bipedal / insectoid / ovoid), geometry beyond boxes (horns, beaks, carapace), creature-specific animation motion + timing. |
| **MAJOR** | Behavior = 3 patterns across 5 hostile types | `ai.worker.js:232–273` — `skeleton` → archery retreat/strafe (232–251); `spider` → leap-charge (252–263); **all else** (zombie + future) → standard melee fallback (264–273). Shared A*, aggro, cover-seeking (172–228). Attacks are stat-only deltas (skeleton 15 proj, spider 8 leap, zombie 10 melee). | Bestiary pass: 2–3 AI archetypes per creature; type-specific state (alert-timer / pack-cohesion) as new ECS components or worker fields. |
| **MAJOR** | Passive mobs (pig/cow/villager) indistinguishable except villager dialogue + color | `MOB_TYPES:66–67,71` pig/cow/villager all `passive:true`, health-only deltas (50/80/120). Villager-only branch: dialogue (`98–105`) + green eyes + nose. Pig & cow share identical wander/no-attack/walk. | Bestiary: pig → skittish fast-flee; cow → herd-cohesion; villager → keep merchant role + add idle gestures. |
| **MAJOR** | Attack/ability variety is stat-based, not animation/pattern-based | `ai.worker.js` attacks push `{id, type:'melee'|'projectile'|'leap', damage:N}` (248, 258, 261, 270). No wind-up, telegraph, per-creature sequencing; melee is instant-hit-on-cooldown. | Author 2–3 ability-use patterns per hostile + procedural wind-up + per-creature telegraph color + per-creature attack sound. |
| MINOR | Spider has 8-leg radial geometry but a 4-leg-style gait (no paired-leg reciprocal motion) | Spider leg gen creates radial legs; walk anim applies a single sin-wave with `+i` offset, not paired alternation (`i%2` phase split). Reads as "generic 8-leg thing." | Re-phase to alternating pairs; add spider idle vs walk. Content-richness detail that lands on "reads as insect." |
| MINOR | Loot drop is uniform across mob types (no treasure-identity coherence) | `MOB_TYPES:65–72` carry **no `drops` field**; loot is system-driven via `store.onMobKill(type, pos)`. A pig and a skeleton drop the same rarity-beam loot. | Encode per-creature `drops` so loot-type matches creature identity (hunt-X-for-Y intuition). Game-design coherence, not just visual. |
| MINOR | Procedural leg animation has zero per-creature tuning (swing freq/amp/idle) | All creatures share the same swing frequency + amplitude + IK height-snap; no `animationParams` on `MOB_TYPES`. | Extend `MOB_TYPES` with `{swingFreq, swingAmp, idleSway, landStiffness}` for biomechanical distinctness. |

**Honest verdict:** the bestiary is the **single biggest content-identity gap** and it sits directly under three of the four Aspects (Wildheart transforms INTO beasts, Soulbind CAPTURES creatures, Elemancer fights ON terrain). Color-swapped boxes will undercut all three.

---

### 2.2 Landscape / biome variety (QA #7) — **one noise surface with material tints**

Verified against `world/terrain.worker.js`. World gen produces 3 biomes + ocean via temperature/moisture/continent noise, but visual/structural distinction is surface-tint-only; subsurface is 100% identical; above-ground landmarks are absent.

| Sev | Finding | Evidence (verified) | Recommendation |
|---|---|---|---|
| **MAJOR** | 3 biomes (+ocean), visually identical depth-structure | `terrain.worker.js:378–402` — `continent`/`moisture`/`temperature` noise (378–380); ocean `continent < -0.15` (388); Desert `temp>0.7 && moisture<0.3 → sand(4)` (398–399); Snow `temp<0.3 → snow(5)` (401–402); else Grassland. Distinction is **surface block only**; below surface → identical stone everywhere. | Sub-surface materials per biome (sandstone/clay, packed-ice, shale), biome-specific ore distribution, biome palette shift. S3+ (not S2 critical path). |
| **MAJOR** | Absent: above-ground landmarks / POIs | `terrain.worker.js:155–221` — **only structure = dungeons** (`DUNGEON_BLUEPRINT:155`, `isDungeonChunk:204`, stamping at 210–221), buried deep, small, sparse. Zero towers/spires/arches/waterfalls/canyons/boulders. No navigation cues, no curated geography. | Ship 5–10 curated landmark classes regionalized by biome, seeded deterministically, late-S2/early-S3. This is what grounds the Aspects in a *place*. |
| **MAJOR** | Vegetation is sparse + non-distinct | `terrain.worker.js:465–488` — only trees (`surfaceY>28 && vegRandom<0.02`, height 4–7) on grassland + cacti (height 2–4) on desert. 2% density → lonely stick-forests. Zero flowers/shrubs/groundcover/subtypes. | 3–5× density + 3–4 tree subtypes + groundcover + biome-specific flora. |
| **MAJOR** | Ocean is featureless (largest biome, emptiest) | `terrain.worker.js:388–394` — ocean is a flat water plane (block 9) below Y-clamp. No beaches/cliffs/reefs/underwater silhouette. | 2–3 coastal region types (sandy beach / rocky cliff / underwater silhouette). S3+, but ~20–30% of surface area is currently null. |
| MINOR | Caves procedurally hollow but structurally featureless | `caveNoise > caveThreshold` (422–425, threshold 0.3 near surface / 0.45 deep) + `applyCellularAutomata` (238–290) smoothing + `spawnSupportBeams` (292) repeating one wood-beam pattern. No chambers/shafts/vertical drama; gameplay-empty (no loot/challenge today). | Authored chamber types + varied supports + mini-features. S3+ scaffolding. |
| MINOR | Biome gen is noise-only, no named regions | `terrain.worker.js:378–402` point-by-point noise; gradual transitions, no zones/names. Player says "to the east," not "the Ice Spires." | Design question for S3 narrativization: author a region map (5–8 named clusters) or accept seamlessness-over-memorability. |
| INFO | Quantified current state | 4 biomes (Grassland/Desert/Snow/Ocean); 1 structure type (dungeon); 2 vegetation types (tree/cactus) at 2% each; near-zero landmarks; 100% subsurface identical. | ADEQUATE for S2-B launch (navigable, water, dungeons, biome tints); a world-design pass is required by S3-start for COHESION. |

**Honest verdict:** the world is *functional* but reads as a noise generator, not a designed geography. The Aspects "could be anywhere because nowhere is distinct" — this shapes (does not block) S2-B; landmark + region work is properly S3.

---

### 2.3 Audio variety (QA #7) — **procedural façade, thin content**

Verified against `SoundManager.jsx`. Music is functionally adaptive (3 mood chord sets + BPM scaling with danger) but sonically monotonous; SFX is 15 buffers reused across all contexts.

| Sev | Finding | Evidence (verified) | Recommendation |
|---|---|---|---|
| **MAJOR** | Music = single arpeggiator voice + pad loop; no progression, no context motifs | `SoundManager.jsx:5–16` `DAY/NIGHT/BOSS_CHORDS`; `244+` `startArpeggiator` (one pluck voice, rotating 2-chord cycle); pad loop `105–193` always-on. BPM lookup `{110, 130, 150}` via `getArpeggiatorBpm` (`213+`). No motif/progression/session-arc. | Per-Aspect motif identity + adaptive biome layering + siege-escalation orchestration. |
| **MAJOR** | SFX = 15 buffers, infinite reuse (no instance distinctness) | `generateSounds` (`401+`) creates 15 buffers; `playSound(name, rate)` applies only a 0.6–1.4× playback-rate scalar (pitch, not timbre/identity). Same `hit` fires for player-melee AND mob-attack AND projectile-impact; same `swing` for all attackers. | **Immediate (cheap):** split player-`hit` from enemy-`hit` (pitch ±2–3 semitones). **S2-B:** per-Aspect + per-action sound passport, pre-generated + namespaced. |
| **MAJOR** | Arpeggiator is binary (on the instant a hostile spawns; off 1.8s after last dies); no intro/outro stinger, no micro-variation | Activates when `activeHostiles>0 \|\| bossActive` (`342`); discrete BPM; fixed pattern, no sub-bar variation. | Add 1–2 bar intro/outro stinger on first/last-hostile events + micro-pattern variation every ~32 bars. ~50 LOC. |
| MINOR | Synth pad LFO is inaudible (0.08 Hz ≈ one breath / 12.5s) + static filter | `SoundManager.jsx:130` `pad.lfo.frequency = 0.08`; filter shape fixed. Subliminal. | Bump LFO to 0.3–0.8 Hz, or replace with a filter envelope. ~3 LOC, high listening impact. |
| MINOR | Combat sounds not keyed to weapon-type or damage-class | `playSound`/`playSpatialSound` calls pass name + rate only, no context object. Sword-swing == staff-swing == mob-swipe. | Extend API with a context object + pre-gen weapon-specific variants. Defer impl to S3 (post weapon-types), but **establish the API hook in S2-A** to avoid a later refactor. |
| MINOR | Boss audio = `bossActive` selects `BOSS_CHORDS` but no boss motif/percussion/fanfare emerges | `SoundManager.jsx:140–142,175–177,282–284` select `BOSS_CHORDS`; BPM 150. Same arpeggiator + pad, just a darker chord set. | Boss-motif suite (intro stinger + percussion layer + resolution cue) themed per boss. |
| MINOR | No elemental-flavor SFX (fire/ice/lightning/arcane share one magic sound) | `magicCast/magicHit/magicExplosion/magicCharge` are element-agnostic; only the visual sparks are element-colored. | Element-sound passport (4 variants × 3 SFX types). **Content-variety dependency for Wildheart (S2-B1) + Elemancer (S2-B4).** |

**Honest verdict:** audio is the cheapest high-impact win on this list — the split-player-vs-enemy-hit fix is ~5 LOC for a large feedback gain, and the per-Aspect motif/element-SFX work is a **named dependency** for two of the four Aspects.

---

### 2.4 Signature-fires-in-prod (QA #8) — **clean; the one latent gap is FIXED**

Verified against `AdvancedGameFeatures.jsx`, `App.jsx`, `store/useGameStore.jsx`. Most signatures are properly wired; the historically-latent obsidian danger mood now has a real production writer; **no built-but-never-fired signatures remain**.

| Sev | Finding | Evidence (verified) | Status |
|---|---|---|---|
| **FIXED** | Obsidian (boss) danger mood — was zero-trigger (S1-A5 gap), now bridged | `AdvancedGameFeatures.jsx:204` `useGameStore.getState().setDangerLevel(bossActive ? 2 : 0)` — **this is the SOLE production writer.** Verified by `grep setDangerLevel`: the only other writers are `App.jsx:234` (a `registerTestHook` dev hook) and `App.jsx:241,271,297` (capture-mode clears to 0). Store setter at `useGameStore.jsx:76`. | **Closed — no action.** Verify visually in playtest (spawn boss → obsidian mood fires). |
| INFO | Light motes — always-on per-mood, gameplay-driven (read mood every frame) | Mounted in GameScene, reads mood for tint/opacity. | Green. Verify motes shift day→dusk→obsidian. |
| INFO | God-rays — always-on at med/high quality tier (not mood-tied) | drei `<GodRays>`, quality-tier gated. | Green. Render-quality baseline, not a state-change signature. |
| INFO | Weather (rain/snow/clear) — autonomous 90s loop, not gameplay-tied | Time-based interval; tier-gated particle counts. | Green. Continuous background system, not a state-change signature. |
| INFO | Spell VFX (impacts/telegraphs/sparks/bloom/shake) — wired to spell-cast | Spell impact triggers GPU sparks + `triggerBloomSpike` + camera-shake; telegraphs at cast-start. | Green. Fires reliably in gameplay. |
| INFO | Melee feedback (sparks/shake/hitstop/crit) — gameplay-driven | Mob-damage hooks trigger shake + sparks on hit. | Green. |
| MINOR | Day↔night mood — wired to time-of-day, floors night at dusk (not obsidian) | `Atmosphere` reads `isDay` → `moodTarget`; mood.js maps night → mood ≥ 1 (dusk). | Green + **by design**: only the boss (dangerLevel 2) triggers obsidian, not night alone (`AdvancedGameFeatures.jsx:48–54` comment). |
| MINOR | Bloom spike — spell impacts only; melee = shake+sparks (design choice) | `triggerBloomSpike(80)` on spell impact; melee does not bloom. | Green. Melee-bloom is an S2-B cosmetic decision, not a gap. |
| MINOR | Night siege escalation — delivered via spawn-ramp (`siegeParams`) + dusk mood, not an explicit obsidian write | `AdvancedGameFeatures.jsx:48–54` explicitly documents this; `game/dayNight.js` `siegeParams` scales spawn count + health by night-count. | Green + **by design**. Night = dusk mood + harder enemies; obsidian stays the BOSS signature. |
| MINOR | Boss music — keyed on `bossActive` state (correct), not on `dangerLevel` | `bossActive` selects `BOSS_CHORDS` in SoundManager; `dangerLevel` is a render/mood knob, not the game-state authority. | Green. Correct separation of concerns. |

**Honest verdict:** this is the **healthiest dimension**. The S1 reality-audit gap is genuinely closed by a real production writer (not a dev hook), and the always-on atmosphere systems (motes, god-rays, weather) correctly need no gameplay trigger. The only open item is a **playtest confirmation** that the boss-spawn → obsidian path fires visually.

---

### 2.5 Coherence-gate calibration (QA #9) — **clean targets; gate NOT yet calibration-verified**

Verified against `WorldManager.jsx`, `SimplifiedNPCSystem.jsx`, `GameSystems.jsx`, `input/inputState.js`, `game/talentTree.js`, `store/useGameStore.jsx`, and the coherence pillars (`crafty-coherence-pillars.md` §"3 BLOCKING bounds"). The gate has clean CUT candidates distinct from scheduled scaffolds — but per the pillars' own bound #1, it is **inadmissible until it passes a blind calibration run at 100% on the must-NOT-cut negatives.**

⚠️**CORRECTION (load-bearing):** the finder claimed `talentTree.js` nodes all carry `effect: null`. **This is inaccurate.** `game/talentTree.js:13–39` shows every node has a *wired* `effect: { stat, perRank }` (e.g. line 13 `effect: { stat: 'strength', perRank: 3 }`), folded into stats today via `foldTalentEffects` (tasks #45–48 COMPLETE). The nodes are **passive stat-bonus nodes that already function** — NOT empty stubs. The SCAFFOLD-KEEP verdict still holds, but for a *different* reason: the **Aspect SIGNATURE ABILITIES** (Wildheart transform / Voidhand gravity / etc.) are the unbuilt scaffold, NOT these stat nodes. Do not let the gate cut these as "null-effect orphans" — they are live.

#### CUT candidates (the gate SHOULD flag)

| Sev | Candidate | Evidence (verified) | Disposition |
|---|---|---|---|
| **MAJOR** | Dead axios cloud-save paths (S4-deferred, never wired) | `WorldManager.jsx:42,73,126,153,180` — `axios.get/post/delete` to `${BACKEND_URL}/api/worlds` (`31`), each wrapped in try-catch falling back to localStorage. Comments at `72,125` flag "S4: cloud sync — backend not yet implemented; local-first is the live path." Cloud endpoint is never actually reachable. | **QUARANTINE to git-branch** (reversible). Mark as pre-S4 deferred behind a flag; let S4 re-wire fresh. ⚠️ Tension with SCAFFOLD-KEEP #3 below — Kevin decides keep-skeleton-for-S4 vs clean-now. |
| **MAJOR** | Miniplex React wrapper duplication (`useEntities`) | `SimplifiedNPCSystem.jsx:50–62` — `useEntities` mirrors miniplex queries into `useState` via `onEntityAdded/Removed` subscriptions → re-renders on every entity add/remove. **Violates P4 game-loop isolation** (CLAUDE.md CRITICAL + pillars P4). | **DEEPEN not CUT** — replace with transient `.entities` reads in `useFrame`. The ECS itself is KEEP; only the React bridge is incoherent. |
| **MAJOR** | GameSystems redundant context bridge | `GameSystems.jsx:8–31` defines `GameSystemsContext` wrapping store actions (`damagePlayer`/`healPlayer`/etc.) + re-exports via context; `GameSystemsProvider` mounts it but no live consumer calls `useGameSystems()`. No-op fallback value is a smell. Store methods are available directly via `getState()`. | **CUT the context layer** (or DEEPEN if a real cross-cutting concern emerges). Today it is ceremony without a feature boundary. |
| MINOR | Reserved `interact` intent placeholder | `input/inputState.js:32–34,37` — `INTENT_KEYS` includes `'interact'`, explicitly commented "RESERVED forward-placeholder… no producer/consumer yet — kept so the touch layer has the key." | **SCAFFOLD-KEEP** — this is a correct forward-placeholder (S2-B/S3 wires it). **Mis-classifying this as CUT proves the gate is over-aggressive** — it is the primary calibration test. |

#### SCAFFOLD-KEEP candidates (the gate MUST NOT cut)

| Candidate | Evidence (verified) | Why protected |
|---|---|---|
| ASPECT_TREES structure (4 Aspect branches) | `game/talentTree.js:9–39` — voidhand/wildheart/soulbind/elemancer branches with `id`/`name`/`limit`/`prereq`/`effect`. ⚠️ effects are **wired** (not null), folding into stats today. | On the S2 plan (§3-A4; tasks #45–47 done). The **signature-ability** layer is the scaffold; the stat nodes are live. MUST NOT cut. |
| `dangerLevel` bridge writer | `store/useGameStore.jsx:76` + `AdvancedGameFeatures.jsx:204`. | A5 in S2 spec; **now wired** (no longer inert). MUST NOT cut. |
| S4-deferred cloud sync | `WorldManager.jsx:72,125` "S4: cloud sync" comments; local-first is the live path. | Intentional design deferral (SOTA §4). MUST NOT cut the *intent* — but the dead axios *calls* (CUT #1) are the quarantine target. Kevin clarifies skeleton-keep vs clean-now. |
| Miniplex ECS for mob/loot/XP | `ecs/world.js` + `SimplifiedNPCSystem.jsx:8,23–24` `mobsQuery`/`xpOrbsQuery`/`lootDropsQuery`, read transiently in `useFrame`. Load-bearing (A*, mob/loot rendering). | NARROW but **not dead** (SOTA's "vestigial" caveat is a partial truth). KEEP + DEEPEN. The gate must cut `useEntities` (CUT #2) while preserving the queries. |
| `interact` intent (also above) | `input/inputState.js:32–34`. | Forward-placeholder; calibration canary. |

#### Calibration verdict

Per `crafty-coherence-pillars.md` bound #1, the gate is **inadmissible until** a blind calibration run returns: (a) the 4 known-good CUTs (dead axios, baked frost_shield, 4× maxStats, dual getItemEmoji) ALL = CUT; (b) the scheduled scaffolds + ≥2 shipped-coherent keepers + ≥2 ambitious-half-built cases NONE = CUT; (c) **100% on the must-NOT-cut negatives.** This guards against repeating the 2026-05-19 Translation-Engine 99.2%-false-positive validator failure. The generator-cannot-vote rule + a mandatory adversarial third role + reversible/budgeted cuts (bound #2) + a per-session CUT-rate circuit-breaker apply. **The gate is NOT yet calibration-verified and MUST NOT govern any destructive cut until it is.**

---

## 3. What S2-B must account for (prioritized)

**BLOCKS / SHAPES the Aspects (do before or alongside the Aspect they gate):**

1. **Bestiary content-identity pass — gates Wildheart (B1), Soulbind (B3), Elemancer (B4).** Three of four Aspects act *on creatures or in their habitat*; transforming into / capturing / fighting-near color-swapped boxes undercuts all three. Schedule a bestiary pass **post-B3 (Soulbind)** per the finder, but treat creature silhouette + per-creature AI archetype as a B1/B3 *dependency*, not a polish afterthought.
2. **Per-Aspect + element audio motif — gates Wildheart (B1) + Elemancer (B4).** Element-agnostic magic SFX + a single arpeggiator make element/Aspect choice audio-silent. **Establish the namespaced sound-passport API in S2-A**; implement Wildheart roar-set in B1 and the 4-element passport by B4. (Per-Aspect music motif hooks: **Wildheart** = beast-growl roar-set [4 element growls off one formant base] + primal-percussion layer; **Voidhand** = low-freq gravity-pulse on grab + descending whoosh on hurl; **Soulbind** = high sparkle on capture + 3-voice fusion chorus; **Elemancer** = per-element cast timbre [fire crackle / ice chime / lightning buzz / arcane hum].)
3. **`useEntities` → transient-read DEEPEN — touches the ECS that all mob-spawning Aspects use.** It violates P4 game-loop isolation today; B1/B3 will add entity churn (transforms, captured pets) that amplifies the re-render cost. Fix the bridge before piling more entity types onto it.

**DEFERRABLE to S3 (shapes cohesion, does not block B1–B4):**

4. World-design pass: 5–10 curated landmark classes + region map + 3× vegetation density + ocean coastal variety + cave structure. Makes Aspect-lore geographically rooted ("Wildheart's roost in the Ice Spires"). Properly S3 Phase-0.
5. Biome subsurface differentiation + per-biome ore. S3+.
6. Weapon-type / damage-class sound context (impl S3; API hook in S2-A).

**CHEAP IMMEDIATE WINS (do now, ~5–50 LOC each, high feedback value):**

7. Split player-`hit` vs enemy-`hit` SFX (~5 LOC, large combat-feedback gain).
8. Synth-pad LFO 0.08 → 0.3–0.8 Hz or filter envelope (~3 LOC, pad feels alive).
9. Arpeggiator intro/outro stinger + ~32-bar micro-variation (~50 LOC, breaks the loop-detection threshold).

---

## 4. Coherence-gate calibration verdict (summary)

- **CUT targets (reversible/quarantine only):** dead axios cloud transport (`WorldManager.jsx`), `useEntities` wrapper → DEEPEN (`SimplifiedNPCSystem.jsx:50–62`), `GameSystemsContext` bridge (`GameSystems.jsx:8–31`). Plus the 3 prior known-good CUTs not re-audited here (baked frost_shield, 4× maxStats, dual getItemEmoji).
- **SCAFFOLD-KEEP (must-NOT-cut negatives):** ASPECT_TREES (`talentTree.js:9–39`, effects WIRED — ⚠️correction), `dangerLevel` bridge (now live), S4 cloud-sync *intent*, miniplex mob/loot/XP queries, `interact` intent placeholder.
- **Is the gate safe to govern cuts? NO — not yet.** It is **inadmissible** until a blind calibration run hits 100% on the must-NOT-cut negatives, with generator-cannot-vote + adversarial-reviewer + reversible/budgeted cuts + a CUT-rate circuit-breaker. Until then, treat all CUT candidates above as **proposals for Kevin/adversarial review, not authorized cuts.**

---

## 5. Decisions for Kevin (content-scope / taste calls)

1. **Bestiary depth & timing.** Confirm the bestiary identity pass lands **post-S2-B3 (Soulbind)** — or pull silhouette+AI-archetype work *forward* as a B1 dependency, given Wildheart transforms into beasts? (Cost: distinct creature models vs color-swap.)
2. **World landmarks: S2 or S3?** The Aspects currently "could be anywhere because nowhere is distinct." Keep landmark/region work in S3 Phase-0, or seed 1–2 signature landmarks per biome *now* so Aspect-lore has a home?
3. **Named regions — yes/no?** Author a region map (5–8 named clusters; trades seamlessness for memorability) for S3 narrativization, or keep pure-noise seamless geography?
4. **Dead axios: keep skeleton for S4 reuse, or clean now?** (Tension between CUT #1 and SCAFFOLD-KEEP #3 — same code, two readings. Quarantine-to-branch is reversible either way.)
5. **Audio scope for S2-B.** Approve the per-Aspect motif + element-SFX passport as a *named B1/B4 dependency* (not deferrable polish)? And greenlight the 3 cheap immediate wins (player/enemy hit split, pad LFO, arpeggiator stinger)?
6. **Monetization (logged, S4):** unchanged — cosmetic-led + transparent battle-pass + optional convenience, no randomized gacha (legal lines: no gacha-to-minors, COPPA). Kevin's call in S4, not a coherence pillar.
