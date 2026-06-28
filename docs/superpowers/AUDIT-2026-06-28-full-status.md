# Crafty — Exhaustive Status Audit (2026-06-28)

> Answers Kevin's 4 questions: (Q1) status of everything? (Q2) is every plan/spec/enhancement/fix thoroughly complete? (Q3) is every line of code reviewed? (Q4) is there thorough E2E + visual validation on every feature/click/UI/progression/combat/vibe?
>
> **Method:** a hardened multi-agent workflow — 18 plan/spec/backlog auditors + 15 code-review buckets (all 224 source files) + 3 adversarial verifiers + coverage mapping of 18 feature domains (10 completed by agents before a session-usage-limit; the other 8 assessed from the test inventory) — plus the controller's own first-hand work: live review of 16 of 28 visual baseline frames and direct source-verification of the top bugs. Founding rule applied throughout: **a green headless gate proves code-presence, not lived result.** 159 plan/doc items + 129 code findings + 185 features classified.

## Ground truth (live, this session)
- `vitest`: **1728 / 1728 pass** · `vite build`: clean · `eslint`: clean · `knip`: clean. The headless harness is fully green.

---

## Q1 — Status of everything

Crafty is a **mature, deployed, internally-coherent R3F voxel action-RPG** (≈224 source files / 27.8 K LOC, auto-deploying to crafty-sand.vercel.app). The W1–W4 "Comprehensive SOTA Rebuild" is code-complete; Phase A ("fix everything" — the entire 39-agent 2026-06-20 review backlog) is done; Phase B feature build-out (B1–B7) shipped. The loop is in **idle-hold awaiting Kevin**. The game is **NOT "fully done"** — the project's own docs say so. The remaining work clusters in three buckets: (a) **Kevin-gated taste/eye/ear** items the loop deliberately won't touch headless; (b) a **deferred S4** frontier (multiplayer + monetization); (c) a real, **never-closed E2E/gameplay-flow testing hole** plus a handful of live bugs the headless gates can't see.

---

## Q2 — Is every plan/spec/enhancement/fix thoroughly complete? → **NO (but ~70% verified-done)**

159 plan/spec/backlog items classified against live code:

| Status | Count |
|---|---|
| COMPLETE-VERIFIED (code present + tested) | 109 |
| PARTIAL | 18 |
| PARKED-DEFERRED (Kevin / S4) | 16 |
| NOT-DONE | 9 |
| SUPERSEDED (by the rebuild) | 7 |

**NOT-DONE (9):**
- **R1 block-break debris BROKEN** — rapier-2.2 API mismatch (see Q3 HIGH #2); fix written, held for a live probe.
- **Gameplay-flow E2E untested** — the single biggest hole: RPG mechanics have **no end-to-end assertions**.
- **E2E tooling installed-then-unused** — `@playwright/test` (WebKit) + `@react-three/test-renderer` were installed 2026-06-15 and **never wired**.
- **E2E coverage gaps** — no frame-rate-under-load / memory-leak / thermal gating; no real WebKit-iOS or Firefox run.
- **i18n #73** — full zh-CN game-content pass BLOCKED (only ~49 UI-chrome keys translated; entire gameplay corpus is English).
- **bossSystem dropped loot-rarity / unregistered boss-reward** — the final win reward can be unidentifiable common junk.
- **Coherence-gate not calibration-verified** (PRE-S2B audit), **shareable-moment / clip / photo-mode tooling** (a named commercial blocker), and the FYI taste/a11y cluster.

**PARTIAL (18, highlights):**
- **W4 weather** — the plan's Weather component was not built as specced (storm = a dusk-mood reuse; grep hits are comments); **affixes.js is built + unit-tested but DEAD-wired** (zero consumers in src).
- **S9 Blight-Heart win-state** — missing the persisted `gameWon` flag + save persistence.
- **Bloom threshold violation** — `GameScene.jsx:912 luminanceThreshold=0.65`, below the spec lock.
- **De-monolith incomplete** — 2 god-files remain (Components.jsx 1341, GameScene.jsx ~930).
- **Mob/boss art** — only slice-1 (arms); full silhouette/proportion/animation rebuild outstanding.
- **Touch M3** — radial Aspect-verb wheel MISSING (verb-sprawl unresolved).
- **W1–W4 + B1/B2/B3/B5** — code-complete + gates green but **Kevin's live-eye/playtest verification is owed** (founding-rule risk).

**PARKED-DEFERRED (16):** S4 multiplayer+monetization (B8), tooling (serena MCP / cloud reviewer / dep-bump), ocean GPU migration, proc-music delete, S4b de-island, tier/perf calibration, forced-med/low visual baselines, named-region world design, monetization model.

---

## Q3 — Is every line of code reviewed? → **MOSTLY (yes, freshly — and it's broadly clean)**

This audit **re-reviewed all 224 source files** (15 buckets, full reads), explicitly closing the gap from the 2026-06-20 review — **22 files modified after 2026-06-20** (Phase B + biome flora + fixes) were unreviewed by that pass and are now covered. **129 findings: 3 HIGH (adversarially CONFIRMED), 26 MEDIUM, 100 LOW.** No CRITICAL. The architecture is sound (Game-Loop-Isolation, capture-determinism, seeded RNG, resource hygiene applied consistently); defects cluster in per-frame allocation, undisposed three.js resources, and lifecycle edges.

**The 3 CONFIRMED HIGH bugs (real, reachable in normal play, headless-invisible):**
1. **`HUD.jsx:548` — player health bar is permanently broken.** It reads `gameSystems.health`, but the context only exposes `playerHealth` → `StatBar` defaults to 0 → **the bar shows `0/100` regardless of real HP** (the adjacent mana bar uses the correct key, confirming the fix: `health={gameSystems.playerHealth}`). *New since 06-20.*
2. **`BlockParticleSystem.jsx` — block-break debris is dead + throws.** Uses removed rapier-2.2 array props (`positions/rotations/scales`, no `instances`) → 0 rigid bodies → `api.current.at(idx).setTranslation` throws a TypeError **on every block mined** (console spam + no debris). *I verified this directly in source.*
3. **`ai.worker.js:263,271` — melee attacks drop `id`+`position`.** Both melee payloads omit them (projectile/leap branches include them) → **HUD threat-direction arrow never fires for melee** and melee SFX play at world origin. (The damage still lands.) *This was item #6 in the 06-20 queue — still unfixed.*

**Notable MEDIUM (26):** `HUD.jsx:478` compass rebuilds its DOM via per-frame `innerHTML`; `Components.jsx` Player `useFrame` allocates `THREE.Vector3` every frame; `bossSystem.js` runs side-effects inside a `setBossHealth` updater + 3 uncleared `setTimeout`s; `Ocean.jsx` per-frame CPU displacement of 9409 verts; `MobModel.jsx` per-frame full-subtree `traverse()` per mob; `TradingInterface` stale-closure absolute-set trade bug; `terrain.worker.js` transposed greedy-mesher UVs + linear-vs-sRGB debris color; **`Iceball freeze/slow` is UNIMPLEMENTED** (`case freeze: break`).

**Caveat:** "every line reviewed" is true for *this static read*, but review ≠ runtime correctness — see Q4 + the critic.

---

## Q4 — Thorough E2E + visual validation on every feature/click/UI/progression/combat/vibe? → **NO (this is the weakest area)**

Across 185 features in the 10 fully-audited domains, validation depth is:

| Validation level | Features | % |
|---|---|---|
| UNIT-ONLY | 67 | 36% |
| CODE-PRESENCE-GATE (static) | 56 | 30% |
| VISUAL-CAPTURE (1 of 28 pinned PNGs) | 24 | 13% |
| LIVE-E2E-PROBE (drives the real game) | 20 | 11% |
| NONE | 17 | 9% |
| **FULL (unit + gate + visual + live)** | **1** | **0.5%** |

So **~75% of features have no visual and no live validation** — they're proven to *exist in code*, not to *work or look right*. The test surface is wide (1728 unit + 28 pinned visual states + ~23 puppeteer probes) but the probes mostly capture **world-look/HUD-presence**, not **gameplay flow**. The headless harness structurally cannot fire pointer-locked keyboard/mouse, so it never exercises the actual playing of the game. Concretely, the following have **NO E2E and NO visual** validation:

- **Core loop interactions:** mine block / place block (click) + ore-to-inventory pickup; consumable "Use" click → heal/destroy; coin→potion merchant buy; talent-node unlock click + locked states; attribute-allocate buttons; **respawn** click + pointer re-lock; world save/load/delete UI; quest claim ("Q") + progress bars advancing on real events; chest open ("G").
- **All four Aspects' *lived* interactions & HUD bars** (Wildheart roar/morph choreography + Ferocity bar; Voidhand grab/hurl/slam + Kinetic bar; Soulbind snare/fuse/squad-AI + Soul bar; Elemancer imbue/zones + Resonance bar) — pure logic is unit-tested, but the in-game feel/visual is capture-suppressed and probe-less.
- **Combat feel:** trauma shake, hitstop, camera-kick, damage-direction glow, telegraph windups — all gate-only/inert.
- **Spell secondaries:** fireball DoT, arcane pierce/lifesteal = zero tests; **iceball freeze = unimplemented**; chain-lightning arc = geometry-unit-only.
- **8 domains never audited by an agent this run** (session-limit): World-biome/ocean, Day/Night/Siege/Weather, UI/HUD, UI panels, Audio, Touch/Input, NPCs/Hub/Mobs, Game-feel — but the inventory shows the same pattern (unit + gate heavy; UI panels do have VISUAL-CAPTURE baselines; audio is inherently Kevin's-ear; touch has 1 live probe + mobile.png).

**Controller's own visual read (16 of 28 baselines viewed):** *Strong* — title screen, dusk/night (moon+embers), ocean coast, loot tiers, inventory/achievements UI, mob silhouette distinctness. *Taste gaps Kevin would flag* — the **Hearth hub reads sparse** (not visibly "living/populated"), the **player avatar reads monstrous** (green + red eyes), the **boss closeup is underwhelming** (purple box-imp, not a Shadow Dragon), the **FPV viewmodel is a bare dark box** (not gloved hands), the **new B3 shrine has no baseline at all**, and the **daytime grade is flatter than the "warm magic-hour" intent**.

---

## Prioritized gap list

**BLOCKING (real live bugs — small fixes):**
1. HUD health bar `0/100` — one-line key fix + a HUD-context test.
2. Block-break debris throw — rapier-2.2 `instances` migration + scale-decay (fix drafted; needs a block-break probe to verify).
3. Melee `id`+`position` payload — 2-line parity fix; **delete the gate that locks in the bug** (`attack-telegraph-gates.test.js:31` asserts the buggy shape verbatim).

**HIGH:**
4. Wire the 2 installed E2E substrates (Playwright/WebKit + r3f test-renderer) and write the first **gameplay-flow E2E** (mine→pickup→craft→equip→cast→kill→loot→quest-claim→level→respawn). This is the founding-hole.
5. bossSystem loot-rarity / win-reward registration + the `gameWon` persisted flag (S9 close-out).
6. Resolve the 18 PARTIALs that are pure code (affixes wiring or deletion; bloom-threshold lock; W4-weather decision).

**MEDIUM:** the 26 MED perf/lifecycle findings (compass innerHTML, per-frame allocations, bossSystem timers/updater, Ocean/MobModel per-frame cost, TradingInterface stale-closure, iceball-freeze implement-or-remove); finish de-monolith (2 god-files) or formally close it.

**KEVIN-ONLY (cannot be automated):** the holistic live playtest (#44); the B1/B2/B3/B5 + rebuild eye/ear sign-offs; the taste gaps above (hub liveliness, avatar, boss art, viewmodel, day grade); S4 scope; monetization model.

---

## What even THIS audit cannot see (completeness critic)
Reading code + pinned frames cannot judge: real-device **frame-rate under load / memory growth / thermal** (iPad/phone); **touch finger-feel**; **audio mix quality**; **game balance & fun**; whether the **lived visuals** actually read as SOTA in motion; localStorage/save **security & corruption-recovery**; bundle size & supply-chain (dep-bump deferred). All of these require a **live human playtest** — which is exactly the #44 item the project has been waiting on. The audit's own coverage was also partial (8 of 18 coverage domains fell to a session-usage-limit; verdicts there are inventory-inferred, not agent-deep).

---

### Bottom line
Nothing is "thoroughly complete + every-line-reviewed + fully E2E/visually-tested" — that bar is not met, and honestly never was the loop's reachable state without a human in the loop. But the gap is **well-bounded**: 3 small live bugs, one genuine E2E hole, a known PARTIAL/parked backlog, and a set of taste calls only Kevin can make. The code is broadly clean and the headless harness is green; the missing layer is *lived validation*.
