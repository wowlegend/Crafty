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

## 2026-08-13 (night) — [LOOP] three r174 KILLS the GL-error storm, and is still NOT landing tonight

Kevin, going to sleep: *"if the upgrade works, then do it."* It does not work in the sense that clears the
bar I set before measuring, so it is not landed. Both halves below are measured, with controls.

**Where this came from.** `vanruesc` replied to our upstream report (pmndrs/postprocessing#750, labelled
`investigating`) within hours. They could NOT reproduce the missing sun on three r172 — but they DO see the
`glBlitFramebuffer: Read and write depth stencil attachments cannot be the same image` error we had filed
SEPARATELY as a production-bundle finding, and traced it to a three.js depth-texture-cloning bug fixed in
r174 (mrdoob/three.js#30585). Their claim: postprocessing's `e19bfa3` triggers a bug that lives in older
`three`. So two findings we had been treating as unrelated are one root cause.

### ① Does r174 fix the GL storm — **YES, measured, with a presence control.**
Identical probe, identical 12s window, production bundle both times:

| build | `glBlitFramebuffer` messages |
|---|---:|
| three 0.172.0 + postprocessing 6.39.1 (committed state) | **6**, both message forms |
| three 0.174.0 + postprocessing 6.39.4 | **0** |

The control matters and is the reason this is stated as fact: a zero from an instrument never shown to
produce a non-zero is not evidence. **`prod-smoke.mjs` cannot see this class at all** — it filters on
`m.type() === 'error'` and these arrive as `warning`, so the repo's own prod gate is structurally blind to
the error storm it was written to watch. That is a real gap and it is now written down.

### ② Does r174 let us unpin postprocessing — **UNRESOLVED, and it is not the blocker.**
Not answered, because the question is moot until ③ is decided: `explore-day` shows no sun disc at that
camera angle in EITHER build, so the frame that would answer it has to be identified first.

### ③ Why it is not landing — **the upgrade changes the whole look.**
`three` r174 against the committed baselines: **19 of 31 frames over gate**, many at 99%+ local density
(`explore-day` 99.70% vs a 9.30% ceiling; `spell-iceball` 99.90%; `ocean-depth` 99.19%). Comparing the two
`explore-day` frames by eye, the r174 sky is materially more saturated — this reads as a global colour or
tone-mapping change, not a regression in one subsystem.

So landing it requires rewriting all 31 baselines. **That is a judgement about how the game should LOOK,
which is Kevin's call, not a correctness fix the loop can self-gate** — and a bundled engine-bump +
re-baseline is exactly the shape `baseline-trailer` exists to stop (ten of the last twelve baseline
rewrites were bundled, which is how four monster baselines became pictures of an empty mountain).

It also sits against a live decision-of-record: `c1d933e` deliberately blocks 0.x MINOR bumps for the
engine stack in dependabot, because for 0.x the MINOR position is the breaking one. This measurement is
evidence FOR that policy, not against it.

**State: fully reverted.** `package.json` + `package-lock.json` restored from backup, `npm ci` re-run,
three 0.172.0 / postprocessing 6.39.1 confirmed installed, git tree clean. Nothing about this experiment
is committed except this entry.

**Owed to Kevin in the morning — two separable decisions, do not bundle them:**
1. Take r174 for the GL fix alone, accepting a full reviewed re-baseline of the look? (High value: the
   storm currently MUTES the GL channel, so a genuine later error in that context is silenced.)
2. Reply to #750 with the measurement above. Drafted, NOT posted — posting to a public upstream issue is
   outward-facing and stays Kevin's.

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

## 2026-08-08 — the capture determinism bar was the wrong instrument (research-settled)

**[LOOP] Pending execution, evidence recorded.** Kevin asked for research rather than another fix
attempt, and it settled the question.

Chromium does **not** guarantee deterministic rendering. Playwright maintainer, microsoft/playwright#22620:
*"In general, Chromium does not guarantee consistent rendering for the same inputs, so you should be
prepared that some pixels might be different."* #23654 asks the same-machine/same-driver question
precisely; the answer is that determinism is *intended* and has long-standing bugs (crbug 919955).

**So the `< 0.15%` run-to-run bar demanded a property the browser does not promise.** It was my own
estimate (~2x a then-observed 0.083%), never a derived requirement, and it blocked a genuinely-owed
re-baseline for a day. No production visual-regression suite gates on exact equality — Playwright, Percy,
BrowserStack and reg-suit all expose `maxDiffPixels`/`maxDiffPixelRatio`, and the consistent guidance is
**do not use one threshold for everything**.

Order of execution, deliberately fix-before-tolerance:
1. `--deterministic-mode` + `--font-render-hinting=none` (Chromium `headless/public/switches.h`), measured.
2. Per-frame tolerances re-derived in their own commit with this evidence — tight for the 30 static
   frames, ~1% for `menu`'s live 3D diorama. Rule 4 permits fixing a genuinely-wrong gate WITH
   justification; it forbids relaxing one quietly, which is why this is written down before it is done.
3. The owed re-baseline (S9, S9b, grass B, ocean) in one commit.

**Not to be read as "the fixes were unnecessary."** Both shipped: an adaptive `dpr={[1,2]}` range
reaching capture, and a camera frozen mid-drift. Both were real bugs and both stay.

Full sourcing: `~/.claude/projects/-Users-kz-Code/memory/reference_chromium_render_determinism.md`.

## 2026-08-09 — SOTA audit: step 1 of the 2026-08-08 plan is dead, and the dpr pin was inert

**[LOOP] Supersedes the execution order in "2026-08-08 — the capture determinism bar was the wrong
instrument".** That entry's *finding* stands unchanged — Chromium does not guarantee deterministic
rendering, and the `< 0.15%` bar demanded a property the browser does not promise. Its *plan* does not.

A 42-agent audit (8 research lanes, 32 adversarial verifications, 0 errors) killed two things I had
recorded as settled.

**1. `--deterministic-mode` and `--font-render-hinting=none` do not exist in the binary we launch.**
Step 1 above sourced them from Chromium's `headless/public/switches.h`. They never survive into shipped
Chrome. Verified 2026-08-09 by `strings -a` over the actual framework Puppeteer resolves
(`~/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/…/Google Chrome for Testing Framework`), exact-line
match, **with a presence control** so the instrument had to prove it can return YES:

| flag | exact-line hits | |
|---|---:|---|
| `use-angle` / `disable-gpu` / `headless` | 1 / 1 / 4 | CONTROL — instrument works |
| `deterministic-mode` | 0 | ABSENT |
| `font-render-hinting` | 0 | ABSENT |
| `enable-begin-frame-control` | 0 | ABSENT |
| `run-all-compositor-stages-before-draw` / `disable-partial-raster` / `disable-skia-runtime-opts` | 1 / 1 / 1 | present, INERT here |

They ship only in `chrome-headless-shell`, which left the Chrome binary at M132. Executing step 1 would
have measured nothing and reported "no effect" for the wrong reason — the most expensive kind of null
result, because it looks like evidence. The three present sub-flags are Skia/DOM-raster levers; our
variance is WebGL-canvas pixels, and in-process output is already byte-identical so there is no intra-run
race for them to serialise. **Generalised lesson: a switch in the source tree is not a switch in the
binary. Grep the artifact you actually run.**

**2. The dpr pin was arithmetically inert.** `calculateDpr([1,2])` in installed R3F 9.5.0 is
`Math.min(Math.max(dpr[0], window.devicePixelRatio), dpr[1])`; `capture.mjs:197` sets the viewport with no
`deviceScaleFactor` and Puppeteer defaults it to 1, so `[1,2]` and `1` both resolve to 1.
`tests/gates/capture-dpr-gates.test.jsx` gates a no-op. The prior entry's "both were real bugs and both
stay" is **half-corrected**: the camera fix addressed a real freeze-vs-reset defect; the dpr change is
harmless and may stay, but the CLAIM that it bought 2.7x was wrong — that delta sits inside the metric's
own ~0.6pp spread. Do not cite it as a magnitude anchor.

**The reframe.** Every defect this harness has actually shipped was coverage or content, never tolerance:
four beast-less baselines, 7 of 31 frames baselined but absent from `STATES`, motes at the world origin.
`menu.png` needs 61,440 changed pixels to fail the 6% gate and produces ~10,000 at worst — it cannot go
red. `ocean-coast` at 8.34% is the only red thing. Measured full distribution over a preserved
identical-code pair is three tiers: **13 frames byte-identical**, 16 at 0.002–0.089%, then `explore-day`
0.210% and `menu` 0.455%. The 6% global threshold is therefore ~1000x too loose for the 13 exact frames,
and the gate's live defect is FALSE NEGATIVES on the static frames.

**Largest hole, previously unexamined by anyone: the oracle is ungoverned.** No gate covers
`frontend/tests/visual/baseline/**` — `mutation-proof-trailer.mjs:40` scopes `GATE_PATHS` to
`tests/gates/` and `scripts/ci/`. 79 of 1,603 commits rewrite baselines; **10 of the last 12
baseline-rewriting commits also touch `src/` in the same commit**; no diff artifact exists and `current/`
is gitignored, so a failed run leaves no durable evidence once the terminal scrolls.

**Superseding order of execution:** (0) one-line check of whether the diorama canvas exists when
`enterCapture` fires — `React.lazy` mount order decides whether the phase fix AND `04148c8` are inert;
(1) write the pixelmatch diff PNG on failure; (2) the owed re-baseline in ONE commit; (3) baseline
governance — trailer gate + contact sheet; (4) reset the two remaining animated-phase sites
(`MascotCraftyHero.jsx:37`, `TitleDiorama.jsx:23`) to their declared values; (5) per-frame tolerances,
from n>=10 separate-process captures, never a max-of-three. **One re-baseline, not eight** — eight
findings each independently demand one, and piecemeal that is eight bulk oracle rewrites, which is the
exact mechanism that produced the beast-less baselines.

Also settled and not to be re-proposed: no new browser engine is a viable deterministic WebGL capture
backend (17 candidates, 16 ruled out — Cloudflare's Kitesurf cannot render WebGL and explicitly trades
away pixel fidelity; Firefox hard-disables headless WebGL in source; Servo and Ladybird publish no
determinism claim either way). `pixelmatch`'s `windowSize` is documented on main and exists in NO
published version. Do not migrate capture to Playwright, and do not move the visual gate to CI.

Full audit: `https://claude.ai/code/artifact/036fab8d-57db-409e-80a9-4ca0a3786ba4`

## 2026-08-09 (evening) — capture determinism SOLVED; per-frame tolerances DEFERRED on insufficient n

**[LOOP] Executed.** Closes the plan recorded this morning.

**menu.png is byte-identical across separate processes — 0.0000%.** Pre-fix, same protocol:
0.984 / 0.455 / 0.359 / 0.557%. Byte-identical frames went 13/31 -> 23/30; worst frame 0.4553% ->
0.1899%. The cause was the freeze-vs-reset class: `if (isCaptureMode()) return;` leaves an animation
wherever it got to, and capture is enabled after a boot whose length varies 1.68-10.43 s per process, so
the frozen phase was run-dependent. Fixed for the camera in `04148c8`; the mascot idle and the mote ring
were the two remaining sites (`a5f1be4`), reset to their DECLARED values rather than to t=0 — the gems
decide that, since their pulse PEAKS at the declared intensity.

**CORRECTION to my own morning claim.** I recorded a ~0.155% "floor" that the fix would approach but not
reach. That figure was measured at a 40 ms window gap, so it was itself residual phase difference, not a
floor. Fully reset, the residual is zero. `explore-day` at 0.19% is now the worst frame and it is a
DIFFERENT mechanism — the late-chunk treeline — not this one.

**Re-baseline landed at `6af95b7`**: 19 frames, reviewed in a generated old/new/diff sheet before
promotion, gate re-run AFTER promotion (32/32, 21 frames with no changed pixel). First commit in this
repo's history to pass through `baseline-trailer.mjs`. Baselines now carry provenance.

**PER-FRAME TOLERANCES ARE DEFERRED, and this is a decision rather than a punt.** The audit set the bar at
**n>=10 separate-process captures, explicitly NOT a max-of-three**, and refuted a proposal whose default
was 10x looser than this repo's own bar. I have n=3. Deriving tolerances from three runs would commit
exactly the error that was refuted, and it would do it while the case has WEAKENED: with menu at 0.0000%
and 21 of 31 frames showing no changed pixel, the frames that most need a tight bound are now provably
exact, so the global 6% is wrong by a wider margin than before but the correct replacement is less
obvious, not more.

The calibration mechanism is already in place and running: the windowed diff-density report (`8a2b7f7`)
prints max local density for all 31 frames on every run, asserting nothing. Its first readings show
local/global amplification of **7.3x-62.5x**, which is precisely why a bound derived from the global ratio
cannot be reasoned across to a local one — and why the proposed TAU of 0.10 would have reddened 8 frames,
7 of which pass today. Collect that data over the next ~10 capture runs, then derive.

**Protocol when the data exists:** tier by measured behaviour, not by guess — the byte-identical set gets a
near-zero bound, the trace-noise set a small one, and any frame with genuine 3D motion its own. Rule 4
permits fixing a genuinely-wrong gate WITH justification; it forbids relaxing one quietly, which is why
this is written down before it is done.

---

## 2026-08-09 (evening) — `failOnFlakyTests` DEFERRED on n=1, and instrumented rather than hoped

### The situation. **[LOOP]**
`10a3cca` fixed the two flaky e2e specs (`panel-overflow` — a wait bound tight relative to its own file;
`tier-downgrade-reclaim` — a threshold judged against this machine rather than its design floor). The
obvious follow-through is Playwright's `failOnFlakyTests`, which turns a retry-then-pass into a hard
failure so `retries: 2` can no longer mask a degrading spec.

**Not yet.** Since that fix there has been exactly **one** completed clean CI run on `main` (`2222b22`,
28 specs across 3 shards, 0 flaky; the run at `6af95b7` was `cancelled` by supersession and carries no
signal). Flipping a gate on a single observation is precisely the error corrected four commits earlier in
`03e61d4`, where an n=1 tab sighting had been written up as a mechanism. Doing it again in the same hour,
to a gate that reds the tree, would be worse.

There is also a real cost the other way. The retries are not decoration: these specs drive software-WebGL
Chromium on a shared runner, and `failOnFlakyTests` converts machine weather into a red tree. That is the
self-decaying-gate shape — a gate that goes red from conditions rather than defects teaches everyone to
ignore it, and then it protects nothing.

### The decision. **[LOOP] Instrument the flakiness, flip on the record.**
`scripts/ci/flaky-report.mjs` runs after every e2e shard under `if: always()` and prints, per shard, how
many specs it walked and which ones passed only on a retry — REPORT-ONLY, exit 0, same posture as
`coverage-zero.mjs`. The observation window now accumulates *in the run log*, where anyone can count it,
instead of depending on a future session remembering to grep five runs by hand — which is how these two
were found in the first place.

**The flip criterion, so this is a decision and not an intention:** set `failOnFlakyTests: !!process.env.CI`
once **10 consecutive completed CI runs on `main` report 0 flaky across all three shards**. `cancelled`
runs do not count — they carry no signal, and mistaking one for a result is the exact confusion that hid
88 runs' worth of failure in July. If a spec does appear, fix the spec; do not restart the count by
loosening it.

### One thing worth recording about the instrument itself.
Its recursive descent into nested suites is load-bearing, not defensive polish: three e2e files use
`test.describe`, **including `panel-overflow.spec.js`** — one of the two specs this exists to watch. Proven
against a real Playwright artifact rather than a fixture: on a genuine depth-2 report the shipped walker
reports `walked 1`, and the non-recursive mutant reports `walked 0` while still printing "no flaky specs".
A top-level-only walk would have been blind to exactly the spec it was built for, and would have said so in
the language of a clean run. The `walked` denominator and the cross-check against Playwright's own
`stats.flaky` are what make that failure loud instead of reassuring.

---

## 2026-08-09 (late) — the SOTA audit's four "explicitly not checked" items, now checked

The audit closed with an honest limit: *"Explicitly not checked, because no execution was permitted:
whether the gate is ever actually run; whether antialiasing is granted under the software rasteriser; the
diorama's mount order relative to capture-mode entry; any post-fix measurement of the menu residual. Every
'this will help' claim above is mechanism-verified, not outcome-verified."* Kevin asked what to do about
them. Execution is permitted now, so they were measured rather than reasoned about. **[LOOP]**

### ① Is the visual gate ever actually run? — **No, not automatically, and that stays true by decision.**
It is in neither `.githooks/pre-push` nor `ci.yml`; the hook contains only a comment reminding a human to
run it. Measured 733 s (37 s of which is literal sleeps), and every baseline is macOS arm64 against Ubuntu
x86-64 runners, so CI would compare across a published cross-platform pixel-parity problem.

What was *unanswerable* before is answerable now: `tests/visual/baseline/.capture-meta.json` (landed with
the provenance work) stamps `startedAt`/`finishedAt` on every capture. Last run **2026-08-09 04:52:11 ->
05:07:36, 925 s, `complete: true`, `crashes: 0`**, on ANGLE/SwiftShader Vulkan 1.3.0, darwin-arm64. Before
that file existed, "when was this oracle last exercised" had no answer at all — which is the more important
half of the audit's question. The instrument now exists; the scheduling stays manual.

### ② Is antialiasing granted under `--use-angle=swiftshader`? — **Yes: 4x MSAA, and it is honoured.**
Probed with the capture's exact launch flags (throwaway probe, deleted; no port bound): requesting
`antialias: true` returns `granted: true` with `SAMPLES 4`, `MAX_SAMPLES 4`; requesting `false` returns
`SAMPLES 0`. The software rasteriser is not silently ignoring the request in either direction.

**What that explains — and, carefully, what it does not.** Only ONE surface asks for it:
`TitleDiorama.jsx:143` (`antialias: true`), which is the `menu` frame. `GameScene.jsx:125` sets
`antialias: false` because post-processing handles AA. So the single frame with MSAA enabled was the single
noisiest frame, and its diff signature was *"hairline outlines tracing every edge of the mascot"* — exactly
what an MSAA resolve does to a small geometric difference. **AA was the AMPLIFIER, not the cause.** MSAA is
deterministic given identical geometry, and the residual went to 0.0000% once the animated-phase reset
landed with no AA change at all. Recording this so nobody later reads "AA was on" as the diagnosis and
disables it: that would blur the frame without removing a single source of variance.

It also confirms the comparator is configured correctly. `pixelmatch`'s `includeAA` default of `false` is
the antialiasing-AWARE setting (the name reads backwards), and the gate leaves it at the default. Against a
frame that genuinely carries 4x MSAA, that default is the right one and is now measured, not assumed.

### ③ Diorama mount order relative to capture-mode entry — **checked earlier this session**, at Kevin's
explicit instruction, and recorded in the preceding entry's order of execution as step (0). The canvas is
present when `enterCapture` fires, so neither the phase fix nor `04148c8` is inert.

### ④ Post-fix measurement of the menu residual — **done: 0.0000%, byte-identical across separate
processes**, from 0.984/0.455/0.359/0.557%. Evidence in the "capture determinism SOLVED" entry above.

### And one recommendation the audit made that was never separately decided.
Under "Declined on purpose -> Moving the visual gate to CI", the audit kept a carve-out: *"Worth doing
cheaply: a Linux self-consistency job that captures twice and diffs run A against run B, touching no
baseline."* The preceding entry says "do not move the visual gate to CI", which settles the MIGRATION but
not this. Deciding it explicitly rather than letting it evaporate: **[LOOP] declined.** Its signal —
does capture reproduce itself — is now covered twice at a fraction of the cost, by
`assertIntraPageDeterminism` (a standing gate, no baseline, cannot rot) and by the measured 0.0000%
cross-process result. A second ~15-minute Ubuntu job per push, on a platform we ship no baselines for,
would buy a third reading of a question already answered exactly.

---

## 2026-08-09 (late) — Phase C step 1: the deterministic capture CLOCK, and what probing it revealed

### Why suppression was ever the design. **[LOOP]**
Substituting for reality needs two primitives and this repo only ever had one. `captureMode.js` shipped
seeded per-key PRNG streams in `captureRandom`; **nothing ever substituted TIME.** So against 72 clock
reads, any system left running under capture advances by WALL TIME — and boot length varies 1.68-10.43 s
per process, so the frame samples a run-dependent phase. Turning systems OFF was the only way to get a
stable frame, and that is why 116 `isCaptureMode()` sites across 61 files exist, 31 of them early-returns.

`src/devtest/captureClock.js` supplies the missing half: under capture, time is a pure function of HOW
MANY FRAMES HAVE BEEN RENDERED. Two processes reaching frame 90 by different routes read the same clock.
`CAPTURE_DT` is a fixed 1/60 and deliberately NOT the display's refresh rate — reading the monitor would
make Kevin's 120 Hz ProMotion screen and a CI runner render different frames from identical code.

### The non-obvious bug, found before it shipped.
This app mounts **three** `<Canvas>` elements (GameScene, TitleDiorama, MascotStudio), each with its own
render loop. Had each advanced the counter, a frame would cost three ticks — and because the diorama is
`React.lazy`, the RATE would change the instant its chunk resolved. Elapsed time would then depend on when
a network-ish event landed: **the same run-dependent phase the clock exists to remove, reintroduced by its
own fix.** Ticks are deduped on `document.timeline.currentTime`, which by spec advances once per animation
frame and reads identically for every callback within it.

### What probing the running app changed about the plan.
The clock was probed in a real headless browser rather than assumed to work. It ticks — and after **2
seconds of wall time under capture, only 2 frames had elapsed**, i.e. 33 ms of virtual time. That is
SwiftShader's ~1 fps, and it is correct behaviour, but it has a consequence for the rest of Phase C that
was not in the plan:

**A frame-indexed clock alone does not put motion into the frame.** Waiting wall-clock time before a shot
now advances the world by almost nothing, so an un-suppressed system would be captured at its start pose —
deterministic, and just as uninformative as suppression. So the remaining work needs a HARNESS change as
well as per-subsystem edits: **step the clock to a declared frame index, then shoot** (`advance N frames`
→ `shot()`), which makes the captured phase an explicit, reviewable constant instead of an emergent
property of how fast the machine happened to render.

That ordering matters and is recorded before the work rather than discovered during it: converting a
subsystem from suppression to substitution WITHOUT step-then-shoot would produce frames that are stable,
still, and no more informative than today's.

### Also recorded: a leak I caused, and the guard that half-caught it.
The probe called `srv.kill()`; `_serve.mjs` returns `{ server, url, waitReady, shutdown }`. The `finally`
threw and vite was orphaned on port 4181. `kill-test-procs.sh` then REFUSED to sweep — correctly, by
design, because the process was under 3 minutes old and could have been a live run. Killed by PID, port
verified clear, probe deleted. The standing rule earns its place again: hand-started means hand-killed,
and a throwaway probe must use the helper's actual contract rather than a plausible-looking method name.

---

## 2026-08-11 — [KEVIN] full design authority over every feature, advertised or not

Kevin, verbatim: *"for any 'advertised' feature (or non-advertised feature), you should deeply and
holistically evaluate if it's worth keeping / wiring up / or deleting. any feature / characteristic of
this game is up for enhancement / modification / deletion as you decide best. no need to wait for my
decision."*

**This supersedes the 2026-08-11 batching decision.** Thirty-three audit findings were filed to
`KEVIN-REVIEW-BATCH.md` on the grounds that "a feature built, advertised and never wired" is a product
call rather than a bug. That reasoning was correct under the old authority and is now moot: the call is
mine. Those entries stay in the batch file as a RECORD of what was decided and why, but they are no
longer blocked on an answer.

**What the grant does NOT change**, because none of it was about design authority:
- Irreversible or outward-facing actions still stop for Kevin — force-push, external send, money,
  accounts, publishing, a NEW dependency, hard-deleting a referenced file.
- Every deletion still needs the same evidence a fix does: the consumer graph traced, the finding
  mutation-proven, and ARCHIVE-over-DELETE where the artifact has independent value.
- Recorded decisions are not silently reversed. A reversal is a new dated entry naming the one it
  supersedes — this entry being the example.

**The bar I will hold myself to,** since "as you decide best" is the whole instruction and a lazy
reading of it is "delete everything unwired": the question is not *is this code reachable* but *does
this make the game better*. A feature reachable by four entry surfaces and localized into two languages
was someone's intent; deleting it is a real cost, not a tidy-up. Wiring costs build time and adds
surface to maintain. I will state which of the two I chose and why, per feature, in the commit that
does it — and where a feature is genuinely worth having but too large for the current unit, it goes to
`ROADMAP.md` as a named unit rather than being deleted for convenience or left rotting for honesty.

---

## 2026-08-11 — Phase C step 3: the capture clock becomes a COMMANDED clock

**Supersedes the free-running half of "2026-08-09 (late) — Phase C step 1: the deterministic capture
CLOCK".** That entry stands on everything else: the clock exists, `CAPTURE_DT` is deliberately not the
display refresh rate, and the three-canvas dedupe on `document.timeline.currentTime` is correct. What is
reversed is one sentence — *"under capture, time is a pure function of HOW MANY FRAMES HAVE BEEN
RENDERED"*. That is exactly what made the phase run-dependent.

### The premise that was wrong, measured rather than argued. **[LOOP]**
`advanceCaptureFrame` runs from `CaptureClockTicker`, mounted in all three `<Canvas>` elements, so the
counter climbs once per RENDERED frame. The harness then waits wall-clock time before each shot, on a
renderer managing about 1 fps. So "frame index at shot time" is a function of how many frames the machine
drew — which is the machine, not the code. Probed on ONE box, identical code, identical schedule, five
sample points, two runs:

| | phase samples |
|---|---|
| run 1 | 6, 10, 13, 15, 16 |
| run 2 | 6, 11, 13, 14, 16 |

Two of five diverge without leaving the machine. Across a fast laptop and a CI runner the spread is
unbounded. **This is the same run-dependent phase the clock was built to remove, reproduced one level up,
inside the fix.** It was invisible because it is latent: nothing read the clock, so nothing could vary
because of it. It would have gone live with the first subsystem converted — which is to say, it would
have been discovered as flapping baselines rather than as a design error.

### And a second reason, which is the one that makes freezing necessary rather than tidy.
`shot()` photographs only after `waitForStableFrame` reports two consecutive IDENTICAL frames. A world
animating off a still-ticking clock never produces two identical frames. **A stability wait and a
free-running clock cannot both be satisfied once anything reads the clock** — the world has to be STILL
at the declared phase to be photographable twice. This was not visible while every animated system was
suppressed, because a suppressed world is still by construction.

### The decision. **[LOOP]**
`setCaptureFrame(n)` sets the phase ABSOLUTELY and freezes the clock; `resetCaptureClock()` thaws, so each
captured state is free to tick during its own setup and is then pinned before its shot. `shot()` in
`frontend/scripts/visual/capture.mjs` pins before the stability wait, records what the page actually
returned, and the run prints the denominator and fails on any frame shot at an undeclared phase.
`CAPTURE_PHASE_FRAMES = 90` — 1.5 s of virtual time, one constant rather than a per-state parameter,
because a phase that varies by state is one more thing a baseline diff can disagree about for a reason
nobody remembers.

### What this constrains, and it is a real limit rather than a caveat.
Under a commanded clock the world jumps from 0 to the declared phase in ONE step. That is exact for any
animation which is a closed-form function of absolute time (a shader `time` uniform, a sway, a rotation),
and WRONG for an integrator that accumulates per-frame deltas — 90 small steps and one large step are not
the same trajectory. Stepping an integrator honestly would mean rendering 90 frames per shot at ~1 fps,
i.e. 90 seconds x 31 states, which is not a harness anyone will run.

**So the conversion candidates are closed-form animations, and integrator-driven systems stay
suppressed.** That residue is a correct stopping point, not unfinished work, and it should be stated that
way when the suppression census is worked rather than discovered again per subsystem.

### Also recorded: a commit title that outran its diff.
`7d743d6` is titled "step-then-shoot" and says it wired the hook "so the harness can drive it". It touched
`App.jsx`, `captureClock.js` and that module's gate. `capture.mjs` had zero references to it. The
primitive and the bridge hook shipped; the caller never did, and no gate asserted the CALLER — this
repo's most-repeated defect class, inside the harness built to catch it. `tests/scripts/capture-preflight.test.js`
now asserts it, and the assertion goes red against exactly the `7d743d6` state.
