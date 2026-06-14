# Crafty S2 — Game Design / Core Loop (design of record)

> **✅ APPROVED + IN PROGRESS (the active S2 reference). Progress (2026-06-09):** S2-A foundation ✅ merged · S2-B1 WILDHEART ✅ COMPLETE + merged (`458bbb5`) · **S2-B2 VOIDHAND — design approved + M1 done** (on `main`) · S2-B3 SOULBIND + S2-B4 ELEMANCER not started. Aspect sequence: Wildheart✅ → **Voidhand (M1✅)** → Soulbind → Elemancer. This is the LIVE master spec for S2; the status line below is the original authoring state.
>
> **Status:** ✅ SHIPPED — the S2 design of record; built out under the loop SELF-GATE (charter §5 replaced the Kevin HARD GATE). The four-Aspect spine completed 2026-06-11. *(Historical "at authoring" note follows.)*
> **Status (at authoring):** DESIGN — awaiting Kevin's spec review (the master-plan HARD GATE: no S2 implementation before an approved design). Authored 2026-06-02 via `superpowers:brainstorming` after a grounded multi-agent analysis (real-code core-loop teardown + audit distill + live 2026 comp research + 3 + 7 ideated signature directions, each adversarially critiqued).
>
> **Decisions locked with Kevin (2026-06-02):** (1) **Foundation-first** — build a signature-agnostic core loop (S2-A) before any signature. (2) The signature is a **suite of four Aspects** — VOIDHAND / WILDHEART / SOULBIND / ELEMANCER — built **sequentially, each deep before the next**. (3) **Lead = WILDHEART** (lowest-risk, highest-WOW validation), then VOIDHAND → SOULBIND → ELEMANCER.
>
> Companion analysis (do not re-derive): `memory/REALITY-AUDIT-2026-05-30.md`, `memory/MONETIZATION-VIRALITY-SCAN-2026-05-30.md`, the signature mockups in `.superpowers/s2-signature-mockups/` (gitignored: `board-1..7-*.png` + `matrix.png`).

---

## 1. Goal (what S2 is for)

Make Crafty **fun + cohesive + SOTA *as a game*** (S1 made it look SOTA). The honest current state, verified against the real code (not the over-claiming docs):

- The **moment-to-moment juice already exists and is good** — a sub-second strike loop (28 ms hitstop + camera shake + element-typed GPU spark burst + crit numbers + magnetic XP/loot-orb vacuum). This is the asset to build on.
- **But the dopamine cannot compound**, because:
  - the **talent tree is inert** (10 of 11 nodes do nothing);
  - **all RPG progression is lost on reload** (`saveGame` omits level/XP/attributes/equipment/talents — a real latent bug);
  - there is **one** stakes moment (the level-5 boss, which melee literally cannot hit);
  - **building feeds nothing** (the #1 cohesion gap — voxel edit → no system);
  - survival is **toothless** (hunger 0.1/5 s; night just reskins spawns); no authored session arc.

So Crafty today is a **feature-rich sampler**, not a game someone chooses to keep playing. S2 fixes that in two layers: **S2-A** turns the sampler into a genuinely fun, cohesive, persistent action-RPG loop; **S2-B** layers a distinctive, beyond-SOTA **ability identity** (the four Aspects) on top.

### Success metric (how we judge "fun + cohesive", not a proxy)
A playtest passes when, *without instruction*, a new player (and the 8-yo floor, Marcus) will: (a) re-enter for "one more night" because the **next 10 minutes contain a visible improvement** (Diablo-style 3-horizon cascade), (b) make a **build choice that changes how they fight** (Aspect / attribute / gear), and (c) produce a **clip-worthy moment** in a normal session. Machine-checkable proxies are layered under each milestone (the deterministic visual gate + static gates + a real-device FPS number), because the only trustworthy verification surface is a harness that can go red — every doc "SOTA/COMPLETED" label is inadmissible.

---

## 2. Hard constraints (every S2 design choice respects these)

1. **Monolithic god-files.** Combat/AI/loot/boss/pets live tangled in `SimplifiedNPCSystem` (1532) + `AdvancedGameFeatures` (1344) + `EnhancedMagicSystem` (944) + the 704-LOC/238-key Zustand store. De-monolithing is **S3**, not S2 — S2 edits *within* these files along export seams.
2. **The re-mesh kill-risk.** A block edit triggers a whole-chunk re-mesh (the worst per-frame op); real-GPU FPS is **unmeasured** (no `AdaptiveDpr`/`frameloop='demand'`). **No S2 verb may re-mesh terrain frequently mid-combat.** This killed all three original "terrain-as-weapon" directions; the chosen Aspects are engineered to avoid it (WILDHEART/SOULBIND touch zero voxels; VOIDHAND banks edits to the calm + a phantom-chunk fallback; ELEMANCER is gated behind a perf number + an overlay-first build).
3. **Touch is 100% unbuilt** and every verb is Pointer-Lock-gated (dead on iOS). **Every new verb gates on an abstract input intent**, never `pointerLockElement` — so it maps to KB+mouse *and* a future tap/drag/swipe layer. (The touch *UI* is S3; the *abstraction discipline* is day-1 in S2.)
4. **Game-loop isolation (CRITICAL).** Never bind declarative React to high-freq imperative systems (R3F `useFrame`, Rapier) via `useState`/store subscriptions. High-freq state → refs / `getState()` / miniplex queries; Zustand only on transitions (level-up/death/equip).
5. **Platform envelope.** Web + iPad + mobile, no-GPU-to-modest hardware. Loop scope (mob counts, particle/loot budgets, render distance) is device-tier-gated (`quality.js`) and validated against a real number.
6. **Audience + legal.** Floor = Marcus (8, Chinese-speaking): <60 s legible, near-text-free, zh-CN-ready, joyful, kid-safe (soft stakes, no permadeath, no self-frustration trap). Monetization = direct cosmetics + a transparent pass; **NO gacha/lootboxes/pay-to-win** (PEGI-16/COPPA/FTC). Cosmetics are an S4 concern; S2 only ensures the design *opens* a clean cosmetic-VFX surface and never sells power.

---

## 3. S2-A — the signature-agnostic foundation (build FIRST)

The "make it a game" core. Every piece is grounded in a verified-real system and is independent of which Aspect comes later.

| # | Piece | What + why | Grounds on |
|---|---|---|---|
| A1 | **Combat-feel fixes** | Kill the 35 ms busy-wait hitstop → delta-scaled ~2-frame slow-mo; fix the dead boss-music key mismatch (`bossActive` vs `isBossActive`); fix the broken ribbon-trail index. Cheap, high-fun: makes hits land with weight. | existing juice stack |
| A2 | **Core action verbs** | A real **dodge-roll with i-frames** + a **melee swing-cone** + **melee can hit the boss** (fix the asymmetry). The single biggest fun-per-LOC lever; also the verbs the Aspects extend. **Input-abstracted from day 1.** | Rapier KCC (verified) |
| A3 | **Progression persistence FIX** | Local-first autosave of level/XP/attributes/equipment/talents/Aspect-trees (today all evaporate on reload). **The return-hook is dead without this** — do it early. | `saveGame` path |
| A4 | **Wire the talent tree** | Repoint the inert tree to real effects — and structure it as the **four Aspect trees** (the S2-B scaffold), so S2-A leaves a live, meaningful progression surface. | store talent slots |
| A5 | **The session loop with stakes** | **Day** (explore / gather / build-with-intent) → **Night SIEGE** (escalating waves via the existing spawner + day/night danger) → **survive-to-dawn** payoff (loot + level + a build unlock) → re-enter at higher stakes. Closes the no-arc + toothless-survival gaps using systems that all already work. | day/night cycle + spawner (verified) |
| A6 | **Loot juice** | Rarity-beam 3D physical drops (color-graded columns, auto/tap-collect). Looting gratification is the dopamine core. | ECS loot entities + `items.js` rarity registry |
| A7 | **Attribute/equipment build axis** | STR/AGI/INT + an equipment paper-doll → fight → loot → equip → fight harder. | `utils/combat.js` solvers + S1-C UI primitives (StatBar/Slot/Tooltip) |
| A8 | **Input-abstraction layer** | A `getInputState()` intent layer every verb gates on (NOT `pointerLockElement`). Enables the future touch layer + every Aspect's verbs. | net-new (small, foundational) |
| A9 | **Real-device perf number + gate** | A profiling pass + `AdaptiveDpr`/`frameloop='demand'`/per-tier branches; a machine-checkable FPS target on a mid iPad. The audit's #1 risk — unblocks tuning *everything* and is a hard prerequisite for ELEMANCER. | `quality.js` tiers |

**Audit fold-in (from `memory/REALITY-AUDIT-S1-2026-06-02.md` — the S1→S2 reality audit sharpened S2-A with evidence):**
- **A3 is now a COMPREHENSIVE save fix**, not just "the save bug": `saveGame`/`loadWorldData` currently serialize **none** of level/XP/totalXP, attributes, equipment, talents/spellLevels, **chest inventories**, or derived maxHealth/maxMana; position is hardcoded; and **there is no live save trigger**. A3 = a complete, local-first, live-triggered autosave covering all progression + world state, recomputing derived caps on load.
- **A9 gains a hard prerequisite — wire the dead tier config:** `TIERS.renderDistance` and `TIERS.weather` are **dead** (low renders the same 81 chunks as high; WeatherSystem ignores the tier, allocates per-frame, and fires ~600 raycasts/frame in a storm). Low must actually shed these (+ hoist the alloc + early-out when clear) **before** an FPS number is meaningful.
- **A5 gains a `dangerLevel` bridge:** the boss-obsidian mood **never fires in prod** (no gameplay writer of `dangerLevel`). The night-SIEGE / boss-active / HP-pressure must drive `setDangerLevel(1..2)` → the obsidian atmosphere — tying the signature mood to the core loop.
- **"Widen the gates" (QA cadence §7 Layer-4) is a concrete S2-A deliverable:** add forced-med + forced-low visual baselines + a tier-transition invariant test (high→med→low, assert signatures survive) + "config-key is actually consumed" static gates (so dead keys can't pass a monotonicity test while unwired). Plus the medium leak/stale-ref fixes (BloomSpikeDriver tier-change ref; damage-number CanvasTexture dispose-on-unmount; HUD/NPC raw-Tailwind→token).
- The **tier-calibration cluster** (selectTier recalibration + `onIncline` recovery) stays **S3** (needs real-device profiling). Several doc over-claims were corrected (incl. a stale "Chrome caps deviceMemory ≤8" claim — `high` IS reachable on modern desktop Chrome).

**S2-A exit criteria:** the loop is fun + cohesive + persistent on its own (a playtest passes §1's metric with NO Aspect yet), `test:unit` + `test:visual` green, a real FPS number exists (with low actually shedding renderDistance/weather), the save round-trips all progression + chests, and the four (empty) Aspect trees are wired and saved.

---

## 4. S2-B — the four Aspects (the signature ability identity)

One unifying frame: the player specializes into **Aspects**, each a distinct fantasy layered on the S2-A combat, each a node-tree in the A4 progression. You can dabble across Aspects or main one (capped specialization forces identity — the teen/young-adult retention layer). All four manufacture clip-worthy moments and open a cosmetic-VFX surface ("pay to be seen", amplified by S4 co-op). **Built sequentially; each is its own spec → plan → build → verify; each must be deep + shipped + fun before the next.**

**The four Aspects** (one name each — these are descriptors, not extra names; no epithets): 🜂 **Voidhand** — gravity / kinetic (grab & hurl the world) · 🐾 **Wildheart** — transform into element-beasts · 🔗 **Soulbind** — capture & fuse living creatures · 🜔 **Elemancer** — reactive elemental terrain.

### S2-B1 · WILDHEART — beast-transform (LEAD)
Hold a roar → **become an element-beast** (the loaded element picks the form: fire→comet, ice→boulder-bull, lightning→hawk, arcane→golem). Your two attack intents *re-skin* per beast, so skill transfers with zero new menu. A timed Ferocity meter banks in the day, unleashes in the siege.
- **Why lead:** lowest build-risk (**zero voxel edits → never re-meshes**; MED), highest immediate WOW + Marcus-joy, clip-gold → validates "an Aspect on S2-A = fun" cheaply + impressively, and builds the Aspect-meta scaffold the others reuse.
- **Grounds on:** Rapier collider hot-swap, dodge i-frames, the 4 elements, GPU sparks.
- **Hardest part / de-risk:** the collider hot-swap must be **transactional** (a hard restore-invariant on form-exit/death/save — no "permanent-beast" bug) + a real-device FPS check on the high-restitution bull *before* the other three beasts. Prototype the swap behind the visual gate first.

### S2-B2 · VOIDHAND — kinetic / gravity-hand
Grab a chunk of the world, orbit it as a **shield**, **hurl** it to spike a monster into your own siege wall (base-as-anvil). One held block, three verbs (HURL/SLAM/SURF), element-chargeable.
- **Why 2nd:** the combat-anchor + the **strongest cohesion-with-the-foundation** (your day-built wall becomes the weapon's backstop — building *matters* in combat). Re-mesh-avoiding.
- **Grounds on:** the verified 200-cap `InstancedRigidBodies` debris pool, the manual `entity.knockback` path, GPU sparks, the elements.
- **Hardest part / de-risk:** the no-re-mesh promise = bank blocks in the calm + a **phantom-chunk** fallback. Make it a **hard invariant + a static gate**: a combat-state grab NEVER calls the worker's block-edit message. The grab→orbit→hurl state machine spans 3 god-files — extract along export seams.

### S2-B3 · SOULBIND — capture + fuse creatures
Snare a low-HP mob with a ribbon, **soulbind** its living AI body into your squad, **voxel-fuse** two creatures into a hybrid you command in the siege.
- **Why 3rd:** the strongest **retention + commercial** layer (living ownable creatures = the comps' biggest unmonetized vein) — but it needs the combat to exist (to capture mobs), so it follows the combat Aspects.
- **Grounds on:** the A* AI worker, the pet ECS path, the death hook, sparks. **Zero voxel edits.**
- **Hardest part / de-risk:** an allegiance/faction concept in `ai.worker.js` (allies vs hostiles) + fusion-mesh generation. **v1 ships a CURATED prebuilt hybrid roster (lookup, not procedural splicing)** so the fun lands without betting on procedural meshing in the fragile mesher/winding zone.

### S2-B4 · ELEMANCER — reactive elemental terrain (LAST)
Cast at the **blocks**: each voxel carries an element-state; fire burns wood (spreads), ice freezes water (bridge), lightning conducts a wet floor. Chemistry = combat + building payoff + hazard + the AI navmesh, all at once.
- **Why last:** the **boldest fantasy but the one true re-mesh kill-risk.** Gated behind the **S2-A perf number** + an **overlay-first build** (render BURNING as a non-re-meshing decal + damage-flag first; use readable elemental OBJECTS like oil-wood/ice-crystal, not hidden per-voxel bytes; profile on a real iPad *before* adding propagation/re-mesh). **Self-hazard OFF on the youngest tier** so a kid's own fire never punishes them.
- **Grounds on:** `terrain.worker` chunk arrays, element-typed sparks, magic secondaries, A* on the live grid — but re-mesh perf is the gate.

**Folded / parked (considered, not lost):** JUGGERNAUT (charge-dash wrecking-ball) → folds into VOIDHAND's kit as the SURF/dash verb. Glyph-carving (hanzi-glyph casting — a lovely Marcus hook) + sculpt-spells (a built companion) → the two weakest originals; their best ideas can fold into an Aspect as sub-features.

---

## 5. Build sequence + gates

```
S2-A  Foundation ............ fun + cohesive + persistent core; real FPS number; Aspect trees wired
  └─ exit: §1 metric passes with NO Aspect; unit+visual green; FPS target met
S2-B1 WILDHEART (beast) ...... lowest-risk, proves the Aspect pattern; collider-swap restore-invariant gate
S2-B2 VOIDHAND (kinetic) .... combat-anchor + base-as-anvil; "combat-grab never re-meshes" static gate
S2-B3 SOULBIND (creatures) ....... creature/retention layer; curated fusion roster v1; faction-AI
S2-B4 ELEMANCER (terrain) . gated behind the S2-A FPS number + overlay-first; the riskiest, last
```

Each phase: `superpowers:writing-plans` → subagent-driven-development (Opus per task; TDD red-first; the deterministic visual gate + static gates; human-eyeball baselines) → update the 4-piece docs + pre-compact-flush. An Aspect is "done" only when it is deep, shipped, fun-verified, and green — before the next starts.

---

## 6. Risks + mitigations

- **The sampler trap (the audit's original sin).** Four Aspects could re-create "30%-depth everywhere." *Mitigation:* one unifying frame + meta (the Aspect trees), sequential deep-builds (no parallel half-Aspects), capped specialization that forces identity, and each Aspect must pass §1's fun metric before the next.
- **Re-mesh perf death.** *Mitigation:* three of four Aspects touch zero/near-zero terrain; ELEMANCER is gated behind the real FPS number + overlay-first; VOIDHAND's no-re-mesh invariant is a static gate.
- **Building the wrong thing on an unproven foundation.** *Mitigation:* S2-A must independently pass the fun metric before S2-B; WILDHEART (cheapest) validates the Aspect pattern next.
- **Touch/iOS dead-on-arrival.** *Mitigation:* the A8 input-abstraction layer + a day-1 rule that every verb gates on intent, not Pointer-Lock.
- **Monetization back-loaded behind S4 co-op.** Acknowledged: S2 does not depend on cosmetic revenue; it only ensures each Aspect opens a clean, no-P2W cosmetic-VFX surface. The S4 monetization plan goes to KEVIN-REVIEW-BATCH before any store/pricing.

## 7. QA & Hardening Cadence (defense-in-depth, not a deferred mega-audit)

**Principle:** catch errors at introduction, never defer to "one big sweep at S5" — deferral re-creates the Gemini slop-trail (compounding debt + decayed context + forensic-cost explosion), and our automated gates have **structural blind spots** (the mob-outline regression escaped because the visual gate forces `high` tier and nothing checked post-perf-downgrade or save-reload states — Kevin caught it by *playing*, not a gate). So we run layered nets, mostly continuous, with a deeper sweep at each **stream boundary** (end of S2, S3, S4 — not just S5):

| Layer | Cadence | Catches |
|---|---|---|
| **1. Per-task TDD + spec/quality review** | every task | most bugs at introduction (cheapest) — already standard |
| **2. Phase-exit adversarial QA sweep** | end of each milestone (S2-A, each Aspect) | the **gate blind-spot classes** (see below) |
| **3. Stream-boundary reality audit** | end of S2 / S3 / S4 (like S0 was) | compounding tech-debt, real-vs-doc-claimed, perf truth → a living debt ledger |
| **4. Widen the gates (systemic fix)** | once, early in S2-A | close the blind spots: **multi-tier visual capture** (not only forced-`high`) + a **runtime-state matrix** (after a PerformanceMonitor downgrade, after save→reload, after sustained combat for VRAM) |
| **5. Human play-test (Kevin)** | ongoing | what gates structurally can't — the top-signal detector (caught the outline bug + the M1 fidelity divergence) |

**The gate blind-spot checklist (what Layer-2 sweeps target — the classes that escape forced-`high`, capture-only gates):**
1. **Tier/device-gated behavior** — every `quality.js` `q.*` branch: does low/med degrade gracefully + look right, and does a `PerformanceMonitor` downgrade break anything? *(the outline-bug class)*
2. **Runtime-only / post-transition states** the capture suite never enters — after-downgrade, after save→reload, after sustained combat (VRAM growth — CanvasTexture/loot-dispose).
3. **Save/load round-trips** — does state actually survive a reload? *(the progression-save bug)*
4. **Perf under load on a real device** — the audit's #1 risk; unmeasured.
5. **Hallucination / over-claim** — re-verify doc "done/SOTA" claims against code + assert the gates test what they claim.
6. **Cross-system regressions** — a change in one god-file silently breaking another (the monolith risk).
7. **Content variety / instance-sameness (the player-experience lens — added 2026-06-03 after the "projectiles all look the same but colour" gap).** When a system yields N instances (the 4 spells, mob types, loot/rarity beams, biomes, the Aspects, per-action sounds), are they genuinely DISTINCT in shape / motion / behaviour / feel — or just colour/stat swaps off one template? Building the SYSTEM (a VFX pool, a spell pipeline) is NOT the same as authoring distinct CONTENT through it. This is the "sampler trap" at the asset level. Per-phase: enumerate the instances a system produces + judge "would a player feel these are different?" — don't mark a system "done" on the pipeline alone.
8. **Signature-fires-in-prod (added 2026-06-03 after the boss-obsidian/`dangerLevel` gap).** For every signature mood / effect / state (obsidian danger, day↔night, weather, boss music, screen-feel): does a *gameplay* path actually TRIGGER it in real play, or is the only writer a dev/capture/test hook? A built-but-never-fired signature reads as "broken" to a player even though the code + the visual fixture are correct. Grep: each `registerTestHook`/dev-driven signal needs a verified gameplay writer.
9. **Coherence / accretion drift (added 2026-06-03 — the AI-slop antidote; full mechanism in `docs/superpowers/specs/crafty-coherence-pillars.md`).** Does each feature/code/function serve a **vision PILLAR** (P0–P5), or is it AI-accretion slop? Per-feature disposition **CUT / KEEP / DEEPEN / PARK / SCAFFOLD-KEEP** — anchored to a named pillar (objective, not vibes), **default-KEEP under uncertainty**, CUT requires a 3-anchor citation, and a **deterministic accretion ratchet** (net-LOC add/delete, jscpd dup-blocks, Knip dead-exports, god-file cyclomatic delta — flag the TREND, never auto-delete; wire to `cleanup-kz`). *Less-is-more = fewer things each deep+coherent, NOT feature-count minimalism — cut slop, PROTECT+DEEPEN ambition (incl. beyond-SOTA seeds → PARK).* **CADENCE: continuous (plan-time pillar-trace field in `writing-plans` + per-task Layer-1 one-liner) AND full at phase-exit (Layer 2) + stream-boundary (Layer 3) — NOT end-only** (coherence-debt compounds: an off-pillar feature becomes load-bearing). **BLOCKING bounds before it governs any real CUT:** (a) a **calibration run** — must CUT the 4 known slop cases + must NOT cut the scheduled scaffolds/ambitious-half-built (100% on the must-not-cut negatives, or it's the 99.2%-validator trap); (b) **every cut reversible** (quarantine/branch + cooling-off) + a per-session CUT-rate circuit-breaker → HALT to human; (c) the **generating agent cannot vote on its own feature** + a mandatory adversarial reviewer (two same-family AIs agreeing ≠ correlated-bias-proof).

**Finding-triage rule (added 2026-06-03 — the obsidian fix was *found* by the S1 audit but *deferred* inside M3 until Kevin hit it).** Every audit / review / playtest finding gets a `(fix-cost × player-visibility)` tag. **Cheap + player-visible → ship as a STANDALONE fast-fix immediately; NEVER bundle it inside a large deferred milestone.** Detection without impact-triage still ships the bug to the player. Deferred findings are re-triaged each phase-start, not just bundled by which system they touch.

**Builder applies the player/artist lens (not just Kevin's Layer-5 net).** Before declaring any visual/gameplay work "done," the builder PLAYS/LOOKS at it as a player would (capture a real frame, run the actual flow), not only "system built + tests green." Kevin's playtest is the safety net of last resort, not the primary detector — the gaps above (obsidian, projectile-sameness) are exactly what an engineering-only lens misses and a player lens catches first.

This cadence is a **standing practice** for every stream, not an S2-only clause.

## 8. Out of scope (later streams)

- **S3 (engine):** the touch *UI* layer, de-monolithing the god-files, ECS hardening, WebGPU/TSL. (S2 leaves input-abstraction + a perf number as the on-ramp.)
- **S4 (multiplayer + monetization):** co-op (the cosmetic "pay-to-be-seen" amplifier + the social/virality engine TRAPSMITH would need), accounts, persistence backend, the cosmetics + transparent-pass store. Surface the concrete monetization plan to `KEVIN-REVIEW-BATCH.md` before any pricing/store wiring.
- **TRAPSMITH / SKYTURN / PRISM CHORUS:** strong directions not in the initial four Aspects; revisit as later Aspects/modes if the four Aspects land (TRAPSMITH especially as the S4 social/virality layer).

---

## 9. Next step

On Kevin's approval of this spec → `superpowers:writing-plans` for **S2-A** (the foundation) → subagent-driven build. S2-B1 (WILDHEART) is planned only after S2-A merges (it edits the systems S2-A establishes).
