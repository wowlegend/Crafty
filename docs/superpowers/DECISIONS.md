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
**Not deferred because it is wrong; deferred because it is the one item here that changes mob behaviour at
runtime, and Rule 3 says a green headless gate is not a lived result.** It needs a lived probe of mob
pathing after the change, and it should not be bundled into a tranche of harness fixes where a regression
would be hard to attribute. Queued as the next unit with the full plan recorded. The false premise is
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
