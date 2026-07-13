# Crafty — STATUS (THE single source of truth)

> **READ THIS FIRST. This file is CANONICAL for "where are we / what's next".**
> Every other doc is subordinate for status purposes. If any other file disagrees with this one about
> what is done or what is next, **this file wins** and the other file is stale (fix it in the same tick).
>
> **Doc roles (the map — do not scatter status across these again):**
>
> | Surface | Owns | Does NOT own |
> |---|---|---|
> | **`memory/STATUS.md`** (this) | Where we are · the open-work REGISTRY · what's next | history, direction, taste |
> | `memory/ACTIVE_PLAN.md` | The LIVE cursor — the one unit in flight right now | the registry (points here) |
> | `memory/CHANGELOG.md` | History (reverse-chron). Append-only | current status |
> | `memory/ARCHITECTURE.md` | The current code blueprint | status, plans |
> | `SOTA-INITIATIVE.md` | DIRECTION / vision / the S-ladder | status (its §3 is FROZEN — see below) |
> | `docs/superpowers/LOOP-CHARTER.md` | The loop's constitution (how it works) | what's next |
> | `docs/superpowers/KEVIN-REVIEW-BATCH.md` | Kevin's decision/eyeball queue | anything the loop can decide |
> | `docs/superpowers/INDEX.md` | The MAP of every doc + its status tag | content |
> | `docs/superpowers/{specs,plans}/` | Per-milestone design + build contracts | global status |
>
> **Rule:** a milestone completing updates **STATUS.md + CHANGELOG + the plan-doc banner** — and nothing else
> needs touching. That is the whole point of this file.

---

## 1. Where Crafty actually is (2026-07-13)

Crafty is a **mature, deployed, internally-coherent R3F voxel action-RPG** (~224 source files / ~28K LOC,
auto-deploying to crafty-sand.vercel.app). **The masterplan's spine is complete.**

**DONE (verified against code, not docs):**
- **S0** reality audit · **S1** art direction + render recipe + the locked bold-flat UI · **S2** game design
- **S2-B — the four-Aspect spine**: Wildheart (beast-transform) · Voidhand (kinetic grab/hurl) · Soulbind
  (capture/squad/fuse) · Elemancer (element-zone chemistry). All shipped 2026-06-10/11.
- **S3 engine/platform**: de-monolith done (SimplifiedNPCSystem 934→183, GameScene 933→304; Components ~1330
  is a *documented irreducible* Player useFrame controller, not an accidental god-file) · touch/mobile built
  (iPad/iPhone, iOS cold-start bridged) · perf tiers.
- **The 2026-06-17 W1–W4 Comprehensive Rebuild**: purge/fix → the look (warm magic-hour grade, toon ocean,
  cinematic title, de-islanded continent) → living frontier (RPG HUD, Hearth outpost, 4 named NPCs, quest
  chain + log) → polish (movement feel, weather, affix model, boot chrome).
- **Ember Frontier + Blight-Heart climax** — a real win-state (the answer to "what is the point").
- **v6** (tech-debt + de-monolith) · **v7** (weather bugs + all-4-spell SOTA VFX redesign).
- Gates today: **~1936 unit · 24-state visual · 11 e2e specs · eslint/knip/build clean.**

**The honest bar:** the plan's own end-state is "SOTA taste sign-off + S4 (multiplayer + monetization)".
S4 is at **literal zero** and is **Kevin's call**. Product-wise this is a **1–2 hour demo with excellent
moment-to-moment feel**. The single-player game is essentially feature-complete; what remains is the
registry below plus Kevin's decisions.

**⚠️ The finding that reframes everything (2026-06-28 audit, still true):** of **185 features, exactly ONE
(0.5%) has full validation; ~75% have NO visual and NO live validation.** The 11 e2e specs assert **store
transitions via the test bridge** (`grantXP`, `useMana`, `equip`) — **not one fires a real click or keypress.**
Nothing proves the game is *playable*. This is the class that shipped a dead desktop mouse-look, a dead iOS
cold-start, a permanently `0/100` health bar, and the F-key confusion — all of them "green".

**And it is worse than untested — some gates are VACUOUS.** `quest-rewards-gates.test.js` asserts
`expect(qs).toMatch(/store\.addCoins\(r\.coins\)/)` — it proves *the line exists in the source*, not that it
*runs*. It sat green while a live bug stole quest rewards and corrupted the save (see R1). A gate that greps
source text is not a gate.

---

## 2. THE REGISTRY — every open item (the loop's definition of done)

Legend: **[LOOP]** = full loop authority · **[KEVIN]** = needs him · `▢` open · `▣` in flight · `▣✓` done

### A. Confirmed live bugs
- ▣✓ **R1 — FIXED + SHIPPED `926751e` (2026-07-13).** RED-first: 3 behavioral tests reproduced it exactly
  (`expected [30] to equal [30,120]` = the 2nd reward swallowed · `expected ['zombie_slayer'] to equal
  ['first_blood','zombie_slayer']` = the save corrupted · first_blood re-offered at progress 0). Fixed with a
  PURE reduction (`src/game/questClaim.js reduceClaim()`) + live refs (the synchronous truth within a tick);
  no closure mutation, no nested setState; a repeat dispatch provably cannot double-pay.
  **AND it exposed a harmful gate:** the old `quest-rewards-gates.test.js` was a SOURCE-GREP that stayed GREEN
  through the whole bug and went RED the moment it was fixed (a variable got renamed) — **anti-correlated with
  correctness.** Replaced with a behavioral gate; mutation-proven. unit 1936→1938, 303 files green.
  *~~Original diagnosis kept below for the record.~~*
- ~~▢ **R1 [LOOP] Quest multi-claim steals rewards + corrupts the save.**~~ `QuestSystem.jsx:236-280` mutates the
  closure var `claimedQuest` from *inside* the `setQuests` updater and reads it after; on a 2nd claim in the
  same tick React has pending lanes → the updater is not eager → `claimedQuest` stays null → **reward never
  granted**. And `new Set([...completedQuestIds, questId])` reads a **stale closure** → claim #2 **erases
  quest #1** from `completedQuestIds` (re-offered; bounty seq miscounts). Reachable: `InputManager.jsx:136-140`
  — the **Q key claims EVERY completed quest in one synchronous `forEach`**, and quests complete in pairs
  routinely (one zombie kill advances `first_blood` AND `zombie_slayer`). *Fix RED-first.*
- ▢ **R2 [LOOP]** Repo-wide sweep for the same anti-pattern: any closure var mutated inside a setState updater;
  any `setX()` called inside a `setY(prev => ...)` body. Fix only hits with a real multi-dispatch caller.
- ▢ **R3 [LOOP]** `tests/e2e/smoke.spec.js` canvas-**detach** race — three `<Canvas>` mounts exist
  (`GameScene.jsx:125`, `render/TitleDiorama.jsx:60`, `render/mascots/MascotStudio.jsx:75`) and
  `locator('canvas').first()` races the title→play transition. Bind the game canvas explicitly. **Do not widen
  the 60s timeout.**

### B. Verification truth (the structural gap)
- ▢ **V1 [LOOP] Vacuous-gate audit.** Classify EVERY file in `frontend/tests/gates/` (~57) as BEHAVIORAL
  (executes code, asserts outcome) vs VACUOUS (regex over source). Replace/augment every vacuous one.
  **Mutation-prove each**: break the behavior → the gate must go RED.
- ▢ **V2 [LOOP] Input-driven E2E harness ("Playable Truth").** The gap IS closable: `input/inputState.js`
  documents `setActive(v)` as the abstract input-live gate that *"replaces the scattered
  `document.pointerLockElement` checks"* — every verb reads `getInput().active`, **not pointer-lock**. So
  Playwright can flip it via `devtest/testBridge.js` and fire **real** keys/clicks. (The input-abstraction layer
  from S2-A-M1 was built for exactly this and never used for testing.)
- ▢ **V3 [LOOP]** On that harness: **verb-truth** (LMB=mine · LMB-on-mob=melee · RMB=cast/place · F=cast ·
  T=melee · 1-4=select), **HUD-truth** (bars render real state — the `0/100` class), **click-truth**
  (consumable Use→heal · talent unlock · craft · quest claim · chest open · respawn).
- ▢ **V4 [LOOP]** Real **bundle-BYTE** gate. Today `bundle-split-gates.test.js` only regexes `vite.config.js`
  for `/manualChunks/` and asserts **zero bytes** against a ~4.5MB bundle. Read `dist/assets/*`, assert a
  committed budget, assert three/rapier/r3f stay split.
- ▢ **V5 [LOOP]** Seeded sim RNG + **state-hash replay gate**. The sim is non-deterministic (**107
  `Math.random` sites**; mulberry32 lives only in captureMode/perfProbe) → a sim regression cannot be
  reproduced or bisected. Per-subsystem seeded streams + an FNV-1a golden hash → bisect to first diverging tick.
- ▢ **V6 [LOOP]** **CI + pre-push hook.** VERIFIED: **no `.github/workflows`, no `core.hooksPath`** — while
  Vercel auto-deploys **every push**. A red push ships to the live demo today.

### C. Authorized-but-never-built (a stale gate — Kevin already decided)
- ▢ **C1 [LOOP] Control-scheme Option-A enhancements.** Charter 2026-06-28 decision-of-record: Kevin picked
  Option A; F=cast/T=melee shipped; the four enhancements are **"AUTHORIZED loop work"** — the loop wrongly
  carried them as `[KEVIN-GATED]`. **All four verified unbuilt:** (1) **verb-telegraph reticle** — the crosshair
  shows which verb the click will fire (`input/verbRouter.js` already exports a pure
  `routeMouseVerb(button, ctx)`; the reticle is "render what it already predicts" → TDD red-first);
  (2) **hold-Alt force-build** (zero `altKey` in src); (3) **persistent control legend** — today only an
  **8-second auto-fade** (`HUD.jsx:191`), *literally the undiscoverability bug the spec names*;
  (4) **full key-rebinding**.

### D. Art (Kevin DE-GATED this 2026-07-13: "have a go as you decide best")

**⚠️ Judged by LOOKING at the rendered baselines, not by reading the code.** A specs agent read the source and
concluded "there is no unbuilt mob/boss ART item in any spec — the art is done." **The pixels say otherwise for
the boss.** This is the founding sin again: *code-presence ≠ lived result.* Always open the PNG.

- ▢ **D1 [LOOP] THE BOSS IS THE ART EMERGENCY.** `boss-closeup.png` reads as a **flat purple box with a box
  head, two grey stick-wings, two vestigial horn nubs and lavender dot-eyes** — a toy imp, *cheaper-looking than
  the trash mobs*, and it is **the payoff of the entire run**. `DRAGON_FEATURES` (horns/tail/back-ridge) DO exist
  in code (iter-172) and still don't read.
  **Root cause found:** `game/bossConfig.js:6` sets the body `color: '#4B0082'` — **bright indigo, not obsidian**
  — and phase-1 emissive is the same hue, so the emissive washes the entire mass to cartoon purple. Dread =
  **dark mass + hot glowing detail**; this is all glow, no mass.
  **Fix vector:** near-black obsidian body (the `#111029` the design intends) + phase-colored *emissive detail*
  (veins/eye-slits/edge-rim) rather than a phase-colored *body*; a real dragon silhouette in the bold-flat voxel
  vocabulary the mobs already prove works (neck + snout + membraned wings + tail + legs + mass); scale up.
- ✅ **D2 — MOBS ARE GOOD. DO NOT TOUCH THE ART.** `mob-bestiary.png` reads well: distinct silhouettes at a
  glance (spider sprawl · duskhound ears+tail · ribbed skeleton · crested emberhusk · horned cow · shouldered
  moss-brute), coherent bold-flat language, clean ink outlines. The mob-distinctness spec T1–T4 fully shipped.
  **Their real gap is BEHAVIOR, not art** → see E3: 10 distinct-looking creatures share **3 AI brains**; the
  moss-brute *looks* like a tank and *plays* like a zombie. **The art has out-run the AI.**
- ▢ **D3 [LOOP]** **Player/character** reads *monstrous* — `character-closeup.png` is a green box-man with **red
  eyes** (this game's own *hostile* marker) and **no arms**.
- ▢ **D4 [LOOP]** **FPV viewmodel** — W2 specced *gloved hands*; verify against the live view, not the code.
- Bounds: reference-lock first (charter §4), stay inside the S1-C bold-flat lock + coherence pillars P0–P5
  (below), judge IN-WORLD on the real grade, capture-verify, batch before/after to KEVIN-REVIEW.

### E. Gameplay depth (the 4 milestone levers — loop authority per the 2026-06-20 mandate)
- ▢ **E1 [LOOP]** **Recurring apex threat** — `bossTier` **does not exist**; the boss is a one-shot L5 event.
  The project's own backlog calls this *"the single highest retention lever."*
- ▢ **E2 [LOOP]** **Build-identity talents** — no capstones, no mutually-exclusive picks, **no respec**;
  ~20 flat +stat nodes drain by L18 → no reason for a 2nd run.
- ▢ **E3 [LOOP]** **Mob archetypes** — telegraphs ARE built (380ms windup + gate), but all 10 mob types still
  share **one** behavior tree (beeline+bonk).
- ▢ **E4 [LOOP]** **Cinematic beats** — boss-entrance mood SNAP, dawn/dusk payoff spike.
- Balance/feel constants ship with sensible defaults + a dial, and surface to KEVIN-REVIEW as **FYI, not a block**.

### E-bis. ⛔ THE HARD COHERENCE VIOLATION (highest-priority build item found in the specs audit)

- ▢ **X1 [LOOP] The four Aspects are UNREACHABLE ON TOUCH.** Verified: `grep "roar|grab|snare|imbue"` across
  `ui/TouchControls*.jsx` + `ui/touchTray.js` = **0 hits**. The radial Aspect-verb wheel (touch M3b) was never
  built. So **Wildheart / Voidhand / Soulbind / Elemancer — the entire signature identity of the game — are
  desktop-only.**
  **Why this outranks almost everything else:** it violates **two coherence pillars at once**, and P4 is one of
  the only two HARD vetoes in the whole design system: **P1** = "four Aspects, each deep — the signature", and
  **P4** = "runs great in the web/iPad/mobile+touch envelope" (a *hard frame*, per the master plan §0). The game
  ships its own identity as unreachable on half its stated platforms.
  Build: press-and-hold ⊕ → a ring of the **unlocked** verbs (gate on `unlockedTalents`, mirroring `keyMap.js`'s
  `talent` field) → `setIntent(verb, true)`. **Reuses the entire existing intent path — zero downstream change.**
  Gate: pure sector-hit math (unit, like `input/touchMath.js`) + unlock-gating test + a wheel-open state added to
  the `mobile.png` fixture (`getCaptureOpts().showTouch` already exists). Thumb-reach/ring layout → Kevin's eye.
- ▢ **X2 [LOOP]** Touch has **no cooldown display at all** — `HUD.jsx:590` gates `<AbilityBar>` behind
  `!isTouchUIMode()`. Touch also lacks spell-select (1-4) and a hotbar.

### E-ter. Other spec'd-but-unbuilt (from the full specs audit)

- ▢ **Incoming-hit hitstop** — `damagePlayer` sets `damageFlash` + `screenShake` but **never `hitstopUntil`**,
  and `cameraKick.js` has no `hurt` profile. Hitstop exists only for *outgoing* hits → enemies don't feel dangerous.
- ▢ **Boss entrance has no beat** — `bossSystem.js:44-55` sets a **text notification** and nothing else: no shake,
  no roar, no bloom spike, no mood snap. For the climax of the run. (= E4.)
- ▢ Voidhand **multi-phantom pool** (cap-4) · Soulbind **v2 faction protocol** (mob-vs-mob) · Elemancer **v2
  terrain chemistry** (⚠️ *parked behind the P4 no-mid-combat-re-mesh HARD VETO* — do not unpark without a
  measured trimesh re-cook budget).
- ▢ World **M4b biome palette / M4c topography / M5b seabed / M7 landmarks** (the "deferred refinements").
- ▢ Item **sets / set-bonuses** (affixes exist; sets never built) · `aspect-underbanked` denied-reason ·
  title-screen hint should read from `keyMap` · **WebGPU/TSL migration** (specced, never done — huge blast radius).
- ▢ The **coherence CUT-gate** stays **PARKED by design** (its own bound #1: inadmissible until a blind
  calibration scores 100% on must-NOT-cut negatives). **⇒ The pillars govern what to BUILD; they may NOT be used
  to authorize deletions.**

### F. Perf + polish
- ▢ **F1 [LOOP]** Per-frame allocations still real despite the CHANGELOG's "vein C DONE" claim:
  `Components.jsx:1123` allocates every frame; `Ocean.jsx gerstnerNormal()` returns a fresh array **per vertex
  per frame** (9409 verts, CPU displacement); `MobModel.jsx` does a full-subtree `traverse()` per mob per frame;
  `HUD.jsx:478` compass rebuilds its DOM via **per-frame `innerHTML`** (also restarting the marker CSS anim).
- ▢ **F2 [LOOP]** **Perf-harness honesty** — the median is quantized to the 60Hz vblank, so the M2 "budget" is
  effectively a boolean, and the C−B scenario delta structurally **cancels** the ocean/weather/spell VFX it
  claims to measure.
- ▢ **F3 [LOOP]** **Biome ground-tint** not wired into the terrain shader → all grass biomes look the same at
  ground level (Kevin: "how do different biomes appear?").
- ▢ **F4 [LOOP]** **i18n #73 unblock** — items are keyed by *display name* (name-as-identity), so translating
  breaks identity. The **id/display decouple refactor is pure engineering** and is the actual blocker. Do the
  refactor; the zh-CN content pass itself stays Kevin's go/no-go.

### G. Harness / docs
- ▢ **G1 [LOOP]** Doc-truth: `LOOP-CHARTER.md:225` still advertises `@react-three/test-renderer` as
  *"approved + landed (0f8cad9)"* — commit `8b6e3a44` **REMOVED** it (verified: not in package.json, imported
  nowhere). **That one stale line regenerated a week-sized proposal.** Also: the CHANGELOG "no per-frame allocs
  remain" overclaim; dead `quality.js TIERS.outlineWorldEdge` (zero readers); `SOTA-INITIATIVE.md` §3 stale.
- ▢ **G2 [LOOP]** Doc-currency **lint** (mechanical) + a doc-gardening pass, so staleness fails a gate instead
  of poisoning the next agent.
- ▢ **G3 [LOOP]** **Session-close ritual at the context watermark** — refresh the GitHub remote surfaces
  (README, repo description, CHANGELOG/STATUS) and push, every session.

### H. KEVIN-ONLY (the loop will not touch these)
- ▢ **#44 The holistic playtest.** The perennial one. It gates every taste sign-off: spell look, movement feel,
  storm, **audio mix (your ear)**, real-device touch feel.
- ▢ **S4 — multiplayer + monetization scope.** The plan's last frontier. Servers, accounts, real money, legal.
  The loop will NOT start netcode or payments without your model. (Hard line already recorded: no randomized
  gacha/lootboxes, COPPA, odds-disclosure-if-random.)
- ▢ **Shareable-moment / clip / photo-mode tooling** — a named *commercial* blocker.
- ▢ Final taste sign-offs (the v7 spell look; the art pass in D once it lands).

---

## 3. What's next (the cursor)

**Current campaign: v8 — "Playable Truth + Depth".** Order of attack:
1. **R1** (the live reward-theft bug) — RED-first. It is the proof-of-need for everything below.
2. **V1/V6** (vacuous-gate audit + CI) — stop shipping false confidence.
3. **V2/V3** (input-driven E2E) — close the 0.5%-validation gap at its root.
4. **C1** (control-scheme A) — authorized, unbuilt, rides the same verbRouter seam as V3.
5. **D** (art pass) — newly de-gated.
6. **E** (depth levers) — the retention spine.
7. **F/G** (perf, i18n unblock, doc-currency, session-close ritual).

The live cursor (which single unit is in flight *right now*) lives in `memory/ACTIVE_PLAN.md`.

---

## 4. The coherence pillars (P0–P5) — the bounds on EVERY item above

Full text: `docs/superpowers/specs/crafty-coherence-pillars.md`. Each is an "X even over Y" trade-off.

- **P0** Preserve novel "beyond-SOTA" seeds until proven incoherent → **PARK-AND-WATCH, never an autonomous cut.**
- **P1** Four Aspects, each **DEEP before next** — even over feature breadth. *(The Aspects ARE the identity.)*
- **P2** Cohesive loop: every system feeds fight→loot→build→fight-harder — even over standalone "cool" toys.
- **P3** ONE locked visual/UI language + a readable feedback grammar — even over raw effect count.
- **P4** Runs great in the **web / iPad / mobile + touch** envelope — even over GPU-maximal fidelity.
- **P5** Broad-audience legible (≈8 → adult), zh-CN-ready — even over hardcore gatekeeping. *(Marcus is a user,
  NOT a depth-lowering ceiling — real stakes are allowed.)*

**⛔ The only HARD VETOES in the system are P4's two invariants: (1) NO frequent mid-combat re-mesh;
(2) input via intent-abstraction, NOT `pointerLockElement`.** Everything else is a ranked support
(P1=P2 > P3 > P5≈P4-soft). **Accessibility never vetoes depth. Aesthetic verdicts are quarantined from
autonomous deletion. Default-KEEP under uncertainty; tie → DEEPEN.**

*(Note P4 invariant (2) is also precisely what makes the input-driven E2E harness in §V2 possible — verbs gate on
`getInput().active`, not on pointer-lock. The pillar and the test strategy are the same fact.)*

## 5. Anti-patterns this project has already paid for (do not repeat)

1. **A green headless gate proves code-PRESENCE, not lived result.** The founding rule. It has been violated
   repeatedly and every time Kevin's eyes caught it, not the gates.
2. **A gate that greps source text is not a gate.** (R1 sat green under a regex gate.)
3. **Never weaken/delete/skip a test to go green.** The ratchet is non-negotiable.
4. **Verify-before-assert.** Agent/workflow claims are T3 — this session a subagent fabricated a "RED test
   suite" crisis (it is green 1936/1936). Grep the cited file:line before acting on any claim, including your own.
5. **A stale doc is a live trap** — it regenerates dead work verbatim (see G1).
