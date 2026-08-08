# Crafty — Decision Record

> **What this is.** The answer to a defect the 2026-07-27 audit found in the process itself:
> `KEVIN-REVIEW-BATCH.md` had grown to ~146 entries over eight weeks with exactly 6 marked resolved, all
> dated 2026-06-02/03/13. Nothing in the preceding six weeks was ever marked answered, so there was no way
> to tell what had been decided from what had merely not been read. A queue with no exit is a backlog that
> looks like a decision process.
>
> **The protocol.** KEVIN-REVIEW-BATCH stays the INBOX — the loop appends there. This file is the OUTBOX:
> every decision, who made it, when, why, and what shipped. An entry here is the closing record; the batch
> entry it answers is marked `→ DECIDED (see DECISIONS.md)`. A decision is never silently reversed — a
> reversal is a NEW dated entry that names the one it supersedes.
>
> **Authority.** Kevin's standing grant (2026-06-10, expanded 2026-07-20) lets the loop decide anything
> inside the master plan, self-gated by the charter. Entries marked **[LOOP]** were decided under that
> grant; **[KEVIN]** entries were decided by the owner directly. Anything irreversible or outward-facing
> stays Kevin's regardless.

---

## 2026-08-02 — the audit batch (items ①–⑨), decided under the standing grant

Kevin's instruction, verbatim: *"what do you recommend for all the punted / awaiting decision questions?
do all you decide to be best."* So these are loop decisions with the owner's explicit delegation, recorded
here rather than assumed.

### ① Where `perf-siege.spec.js` lives — **[LOOP] Excluded from CI, kept at full strength locally.**
It is a perf probe. `ci.yml`'s own policy note has excluded perf probes since the day CI shipped, because
"the median quantizes to the host vblank, so a cloud runner's number is meaningless" — and this spec was
sitting inside the e2e job in violation of that policy, failing every run for three weeks. It passes on real
hardware (1.4m, heapGrowth 0, no runtime errors).
**Why not just lower the frame floor:** that floor IS the product claim (the render loop stays live under
siege). Lowering it to go green is the reward-hack the charter forbids. Tagged `@local-only` and excluded
via `--grep-invert` **in the workflow**, where the exclusion is visible, rather than hidden in
`playwright.config.js`. Shipped `8ac8d07`.

### ② The knip ignore and the undeclared rapier dependency — **[LOOP] Declared it; deleted the ignore.**
`.knip.json` carried `ignoreDependencies: ["@dimforge/rapier3d-compat"]`, added by `d3e86cf` in the same
commit whose message ends "npx knip now reports ZERO issues".
**Verified before acting, and the review's framing was wrong:** the package is not imported by `src/` at
all — its only importers are `scripts/bench/bull-physics-bench.mjs` and
`tests/integration/beast-collider-rapier.test.js`. So it belongs in **devDependencies**, not dependencies.
Pinned **exact `0.19.2`, no caret**, because `@react-three/rapier` pins that exact version and the
integration test states in its own header that it drives "the same build the app ships" — a caret would let
npm hoist a second copy and the test would silently exercise different WASM than production. Shipped
`32625c0`.

### ③ The 7 ungated visual states — **[LOOP] All promoted into `STATES`.**
Seven of 31 captured frames (23%) were captured AND baselined but absent from `STATES`, so they asserted
nothing: the 4 WILDHEART beast frames (committed 2026-06-17 as "review artifacts", never promoted, no hold
ever recorded) and the 3 forced-tier frames (held since 2026-06-22).
**Reasoning:** a baseline says "do not let this change without noticing"; it does not say the look is final.
Holding a frame out of `STATES` to preserve the option of changing it later buys nothing — it was already
changeable, just unguarded. If the art direction changes, the gate goes red, the frame is reviewed, and it
is re-baselined. That is the process working.
**This immediately paid for itself** — see the 2026-08-02 capture-determinism entry below.

### ④ The 3 HIGH advisories — **[LOOP] `npm audit fix`, and the escalation was overstated.**
All three (brace-expansion, js-yaml, postcss) are dev-only; `npm audit --production` reported 0 before and
after. All carried `fixAvailable` inside already-approved semver ranges. `package.json` is **byte-identical**
before and after (diffed) — the proof it was a lockfile refresh, not the dependency decision it had been
escalated as for weeks. Now 0 vulnerabilities. Shipped `32625c0`.

### ⑤ The `ai.worker` inline mirrors — **[LOOP] DEFERRED, with the premise corrected in place.**
The mirrors' justification ("this classic Worker cannot import") is false — `terrain.worker.js` imports ten
modules and is a worker — and their sync gates are drift-blind: an injected divergence producing
21,655/200,000 behavioural mismatches left all four assertions green.
**✅ SHIPPED 2026-08-02 (`815c007`), as its own unit with the probe paid.** The premise is now disproven by
construction rather than argument: the built worker is 3.71 kB with **zero bare imports**, because Vite
inlines them regardless of the construction form. AIWorkerSystem moved to the `?worker` import that
`terrain.worker.js` has always used; the three modules are imported directly; the telegraph block became the
imported `attackPhase` machine instead of a hand-rolled copy of its transitions.

The three sync gates were **rewritten, not deleted** — behavioural halves kept (mob-los gained a case), and
the mirror-pinning halves replaced with import-specifier anchors plus "no local copy has grown back". Both
are syntactic, so `gate-shape.mjs` confirms a comment cannot satisfy them. Mutation-proven against the real
historical bug: re-pointing `steerGoalCell` at `(playerX, playerZ)` — the archer-kite regression — turns the
gate RED.

**Rule 3 paid in full:** the sustained night-siege probe ran against the refactored worker — 13 frames over
12.4s of saturated siege, zero fatal runtime errors, heapGrowth 0. Mobs path and attack through that worker
for the whole window, so an import failure or a throw would have surfaced there.

The eslint crash-class gate also caught an undefined local mid-refactor (removing the mirror left
`startXGrid`/`startZGrid` dangling downstream). That gate exists because four ReferenceErrors once shipped
to main; this is the first time it has caught one BEFORE a push rather than after.

*Original deferral rationale, kept for provenance:* it was the one item that changes mob behaviour at
runtime, and Rule 3 says a green headless gate is not a lived result — so it needed a lived probe and its
own unit rather than riding in a tranche of harness fixes. The false premise is
corrected in the source comments now so nobody re-derives it.

### ⑥ i18n adoption — **[LOOP] Shipped a ratchet, not the full sweep.**
98 keys at full en/zh-CN parity, and 109 hardcoded user-facing strings across 23 files — five of them in
files that import i18n and hardcode anyway. The gate measured the dictionary; the product was half-English.
**Why a ratchet and not a zero-target:** 109 occurrences cannot be fixed in one commit, and a gate demanding
that would be switched off within a day. Per-file counts are frozen; they may shrink freely, and a count
that grows or a new file appearing fails the suite. Enforceable on day one, converges monotonically.
Mutation-proven. Shipped `a79677d`. The 109-string sweep itself is now ordinary loop work.

### ⑦ This file — **[LOOP] Created, with the protocol at the top.**

### ⑧ `world-rebuild-after-load` in CI — **[LOOP] Kept in CI. Calibrated — and the calibration proved me wrong.**
Unlike ①, this is a correctness test for a critical bug (Load World permanently destroys the terrain), so it
belongs in CI. Its recovery window was a fixed 60s that encoded one machine, and I judged the CI red to be a
slow-runner false negative: 30 of 50 chunks recovered, presumably still climbing. So the window is now derived
from the machine's own measured initial-stream throughput, and the 80%-recovery assertion is untouched.
Shipped `8ac8d07`.

**Then the calibration falsified the hypothesis it was built on, which is the useful part.** With 101s, 134s
and 150s budgets across three attempts, the count settles at **exactly 30** every time against a 49–50
baseline. It does not creep. A slow machine gives a slow climb; this is a deterministic **plateau**.

**Revised reading: this is probably a real bug the fast laptop has been hiding.** The original defect
(`requestedChunks` never drained after a load → nothing re-requested → world gone) was fixed by clearing the
set in the `load_modifications_done` handler. A reproducible ~19-chunk deficit suggests the recovery is
*partial*, not slow — plausibly keys whose worker replies were in flight across the clear stay marked
requested and are never re-requested. On a fast box that window is a chunk or two and rounds away above the
80% bar; on a slow box it is ~20 and the bar catches it.

**RESOLVED 2026-08-02 — and my second diagnosis was wrong too.** Instrumenting the recovery trajectory and
letting CI answer it settled it. All three attempts climb steadily (`2→12→25→30`) and flatline at 30 for
60–100s. That is the shape of a streamer **finishing**, not one stalling.

Root cause is a **test defect**, not a game bug. `GameScene.jsx:185` mounts a drei `<PerformanceMonitor>`
whose `onDecline` steps the quality tier down, and `TIERS.renderDistance` is 4/3/2 → boxes of 81/49/25
chunks, re-read by the streamer every tick. Re-streaming a world right after a load is the heaviest thing
this game does, so on a 2-core runner the monitor declines med→low *during* the measured window. The
streamer then correctly refills the 5×5=25 box; 30 is that plus the stragglers `cullDist = renderDistance + 2`
deliberately keeps. The test was comparing a med-tier baseline against a low-tier recovery — two different
worlds — and calling the difference a defect.

The target is now computed from the tier **as it stands at assertion time**. The 80% bar is untouched, and
the bug the spec exists for is still caught: it parks the count at zero, which fails against every tier's box.

**Three diagnoses, two wrong, and the tooling caught both** — the calibration falsified "it's just slow",
and the trajectory falsified "it's a partial recovery". Worth keeping as the pattern: each fix was built so
that being wrong would be visible, which is why being wrong twice cost one CI run rather than a refactor.

**New lead found in passing (not actioned):** a local run reported `baseline 81 @low`. The tier was `low` —
whose box is 25 — while **81 chunks stayed resident**, because `cullDist = renderDistance + 2` culls only
beyond ±4, i.e. retains a 9×9 box regardless of tier. So a downgrade from high→low stops *loading* new
chunks but frees nothing already loaded. On the machine the downgrade exists to protect, memory and draw
calls stay at high-tier levels. Queued.

### ⑨ CI itself — **[LOOP] Sharded, so it can conclude at all.**
It had concluded `success` **zero times in 88 runs** (86 cancelled, 2 failed) because the e2e job exceeded
its own 25-minute budget every run, and a timed-out job renders as `cancelled` — indistinguishable from a
run superseded by a newer push. Sharded 3× in `70e432e`; the first sharded run produced this repo's first
`success` on an e2e job. Sharding did not fix the tests — it made their results visible, which is how ①, ⑧
and the smoke-budget bug were found at all.

---

## 2026-08-02 — [LOOP] Capture determinism: weather was never frozen

Not from the batch — found because of decision ③.

Promoting the 7 frames turned up a failure in a frame that was *already* gated: `landmark`, at 6.29% then
6.27% against a 6% threshold, reproducible, with **zero `src/` changes since it last passed**. Every signal
pointed at the dependency bump from ④ having shifted the renderer.

It had not. Opening the two PNGs side by side took a minute and showed the actual cause: the current capture
had caught a **dynamic rain storm** — rain streaks, a darkened sky, and an "Atmospheric shift…" toast in the
corner. `WeatherSystem` cycles clear↔storm on a 90-second interval, and a full capture takes over four
minutes, so it fires two or three times mid-run. **Every outdoor frame has been a coin flip against its
baseline for as long as the gate has existed**, depending on where in the cycle it landed.

The audio side of that same interval was already capture-gated, with a comment citing "the T8 long-interval
lesson" — the hazard was known and the fix had been applied to one of the callback's two effects.

Two things worth keeping:
1. **The check must be INSIDE the interval callback.** `isCaptureMode()` is a runtime flag the harness flips
   through a test-bridge hook *after* mount, not a URL parameter — so a guard at `useEffect` setup always
   reads false. The first fix was written that way, and the re-run returned a byte-identical 6.27% with the
   toast still in frame. Verified fixed only after moving the check inside.
2. **A pixel percentage is not a diagnosis.** It cannot distinguish "the renderer changed" from "the scene
   did". The failure message now says to open both frames first and lists the non-render causes in the order
   they actually bite.

---

## 2026-06-15 → 06-29 — **[KEVIN]** decisions-of-record, MIGRATED here 2026-08-07 from `LOOP-CHARTER.md` §0-C

**Why they moved.** They were embedded inside ~5.5 KB of *superseded mandate narrative* in the charter —
06-17 rebuild, 06-20 "fix everything then build everything", 06-28 post-audit, 06-29 tech-debt/de-monolith —
which charter §0-A already declares "now HISTORY", promising their decisions-of-record survive. So the charter
was carrying dead process instructions in a file read EVERY iteration, purely as packaging for these lines.
The narrative is history and lives in `memory/CHANGELOG.md` + git; the decisions are the durable part and this
file is their designed home. **Nothing here is reversed, weakened, or reworded to change meaning** — the
charter now names them and points here.

- **World-design direction = HYBRID (option C)** (Kevin 2026-06-13, `KEVIN-REVIEW-BATCH.md:610` item 11).
  Infinite procedural wilds for the survival/explore loop, PLUS a crafted "home" anchor, a handful of signature
  silhouette landmarks, genuine biome distinctness, and oceans that are a *place* (depth, beaches, something out
  there) rather than blue blocks. Rejected: (A) endless wilds alone — weak memorability; (B) finite crafted
  island — caps the explore loop. Spec `specs/2026-06-13-crafty-world-design-hybrid.md`. Two loop-chosen
  defaults inside it, reversible: the home anchor is a quiet solo **"Hearth"** (lodge + brazier + pier, NO NPCs)
  rather than an inhabited hamlet, and **deep oceans stay friendly-explorable — no drowning/oxygen timer**
  (matches the broad-audience pillar).
  *This is the item the kernel's SETTLED list named and this file did not have: it was recorded only in the
  append-only INBOX, which structurally cannot say whether something was settled.*
- **World/game direction — "The Ember Frontier, gated toward a Blight Heart climax"** (Kevin-confirmed
  2026-06-15). Outward *see-it-go-to-it* exploration on the built landmark + compass rails; the Shadow Dragon
  moved from its ~25-block ambush to a single fixed, foreshadowed far-edge lair = a real WIN-STATE plus endless
  post-climax handoff. Source `plans/2026-06-15-crafty-world-purpose-sota.md`. **Reversing this is genuinely
  Kevin; affirming a sub-direction inside it is loop authority.**
- **Grade LOCK REVERSAL** (Kevin 2026-06-17). The restrained-NEUTRAL grade lock is **reversed** —
  glowier/warmer is AUTHORIZED (ocean = toon Caribbean water-plane; title = cinematic 3D vista; W3 =
  living-frontier MAX; spells = 4 distinct silhouettes). The Ember-Frontier direction above still stands; the
  rebuild changed LOOK, not direction.
- **Control scheme = Option A, `F` = cast spell, `T` = melee** (Kevin 2026-06-28, shipped `74fd858`). Magic is
  the marquee feature, so it gets the primary verb. The Option-A enhancements (verb-telegraph reticle,
  hold-Alt force-build, persistent control legend, full key-rebinding) are authorized loop work. The touch
  Aspect-verb radial wheel is DEFERRED to a Kevin playtest.
- **Bloom `luminanceThreshold` 0.65 (glowier) is INTENDED** (Kevin 2026-06-28). It SUPERSEDES the older ≥0.85
  spec. **Do not "fix" it** — reconcile the stale spec note instead.
- **`grantXP` full-heal on level-up is INTENDED** (Kevin 2026-06-28). Leave it.
- **E2E = `@playwright/test` gameplay-flow specs** (`npm run test:e2e`, `tests/e2e/`) on the dev test-bridge +
  the headless-safe `forcePlay` hook, kept SEPARATE from the puppeteer visual gate (Kevin 2026-06-28).
  Design-of-record `specs/2026-06-28-crafty-control-scheme-design.md`.
- **Audience is BROAD** (Kevin 2026-06-04, also in coherence-pillars P5): kids → young adults → adults, "blur
  the lines". Marcus (8) is A user, **not a depth-lowering floor** — intensity, real stakes and hard modes are
  allowed; age-8 legibility is a design virtue, never a ceiling.
- **Chinese (zh-CN) is a locale TOGGLE with ENGLISH as default** — design copy in English, then routed through
  `t()` so the toggle stays complete. Full content translation is owed (#73) but the game is EN-first.
- **Execution posture: CONTROLLER-SEQUENTIAL for code** (2026-06-28) — TDD → gate → commit → push per item,
  NOT fan-out code-editors: shared god-files rate-limit and conflict (the logged M-HUD lesson). Background
  Workflows are for read-only analysis and adversarial verification.
- **De-monolith is FULL LOOP AUTHORITY** (Kevin 2026-06-29) — it had been parked as Kevin-gated scope/taste at
  iter-175; Kevin explicitly directed it, so it is no longer a genuinely-Kevin item.
- **Still Kevin-gated as of 2026-06-29** (verify against live STATUS before treating any as still gated): zh-CN
  i18n #73, S4 multiplayer/monetization, control-scheme #9, compass #6, touch radial wheel, mob/boss art, W4
  weather, clip/photo-mode, live-eye taste, affixes full wiring. *(Later partly superseded: 2026-07-13 de-gated
  mob/boss art and confirmed the Option-A enhancements — the `[KEVIN-GATED]` tag on them was stale.)*

---

## Older open items, dispositioned

- **Ocean water aesthetic** — **[KEVIN]** Genuinely pure taste, and the coast is lived-verified clean. No
  loop decision; stays in the inbox until Kevin has an opinion. Nothing is blocked on it.
- **Chest LMB mines it (stored inventory lost)** — **[LOOP] Accepted as a real bug, queued as loop work.**
  Losing a chest's contents to a mis-click is data loss, not a balance question; option (a) — LMB opens —
  is the only one that cannot destroy player property. Not bundled here because it is gameplay, not harness.
- **500 ms global damage-lockout / camera-shake decays per frame / mob AI pathfinds in 2D** — **[LOOP]
  Confirmed real, queued by size.** The first two are small and belong in a game-feel unit with a lived
  probe. 3D pathfinding is a project, not a fix, and should be planned before it is started.
- **Preview-tab husks** — resolved; `close-preview-tabs.sh` reports none. The loop will never run `--close`
  itself: its default target is the caller's own session, and an autonomous iteration once used it to
  terminate its own session.

## 2026-08-08 — Kevin removed twelve items from his own desk

**Kevin:** *"is there really a bunch of decisions you need me to make? or can you autonomously decide? and
only leave really important / non-reversible / critical ones for me to decide later."* Then, on the grass
colour specifically: *"decide the grass colour too."*

- **Grass colour** — **[LOOP] Decided: swatch B `#5E8A3E`** (`83054c1`), replacing the blue-green `#4a7c59`
  that read as a different plant from the `#567C35` ground. Measurement ruled A out (13,213 blue-leaning
  pixels vs 11,258) and could **not** separate B from C, so that half was decided on stated reasoning: B is
  +8/+14/+9 on the ground base and keeps tuft and turf in one family, which is what S9 was for; C is
  +25/+32/+21 and re-opens the separation S8/S9b closed. Veto-able, one word.

- **The "Awaiting Kevin" queue was a false ask.** Audited against this file: of thirteen rows, **eight were
  already resolved** and left rendered as questions, and four had already been assigned **[LOOP]** here.
  Exactly one — the ocean water aesthetic — is genuinely Kevin's.

- **`LOOP-KERNEL-PROMPT.md` was the cause and is corrected.** Its "STILL GENUINELY KEVIN" line named
  chest-mining, damage-lockout, camera-shake feel and 3D mob AI as recorded design calls. This file had
  already reassigned all four to **[LOOP]**. The charter states that this record — not the kernel, and not
  the append-only inbox — is what settles ownership, so the kernel line was stale and reading it is what put
  twelve non-Kevin items in front of Kevin. Corrected in the same commit.

- **Standing rule going forward:** a reversible call gets **made** and noted veto-ably. A row survives in an
  Awaiting-Kevin surface only if it is on this file's `[KEVIN]` list, or is irreversible, spends money,
  publishes externally, or adds a new dependency. Any row whose subject is verifiable at HEAD gets verified
  and deleted at session close rather than re-rendered.
