# Active Plan — the LIVE CURSOR

> **📍 REPO LAYOUT (compaction-resilient):** TWO-LEVEL repo. ROOT `/Users/kz/Code/Crafty/` holds `.git`,
> `docs/superpowers/`, `memory/`, `.superpowers/` (gitignored mockups). APP `/Users/kz/Code/Crafty/frontend/`
> holds `src/`, `tests/`, `package.json` — **run npm/tests from `frontend/`; source is `frontend/src/`; docs +
> memory are at the ROOT, one level ABOVE `frontend/`.** Bash cwd drifts and resets on compaction → use
> ABSOLUTE paths; **NEVER assert a file is "gone/missing" from a relative `ls`/`find`** (the false-absence trap
> — it bit twice on 2026-06-01).

> ## 🧭 DOC ROLE — this file owns THE CURSOR ONLY
> **It holds exactly one thing: the single unit of work in flight right now, and the next one.**
> - **Where we are / the full open-work registry / what's next** → **`memory/STATUS.md`** (the source of truth).
> - **How the loop operates** → `docs/superpowers/LOOP-CHARTER.md`.
> - **History** → `memory/CHANGELOG.md`. **Map of all docs** → `docs/superpowers/INDEX.md`.
>
> This file used to duplicate status, handoffs, and per-slice detail. That scatter is over. Keep it SHORT.

---

## 📍 THE CURSOR — 2026-08-12 · draining the 88-finding holistic-review queue

**THE ONE UNIT IN FLIGHT: `docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md`, 30 open of 88.**
58 closed. Re-read the file for the live count: `grep -c '^- ▢'`.

**THE TRIAGE IS DONE AND IS THE EXPENSIVE PART — DO NOT REDO IT.** A 16-agent pass read all 88 against
live HEAD, each partition asserting its own denominator (8 x 11). Its full output, with the per-finding
FIX / GATE / MUTATION design and the adversarial ruling on each, is saved at
`/private/tmp/claude-501/-Users-kz-Code/c7297111-afb7-46c9-83b3-6edc09ed7f41/scratchpad/triage88.json`
(420KB, all 88 with attacks). **That path is session-scoped tmp and will NOT survive a reboot** — if it is
gone, the workflow can be re-run from
`/Users/kz/.claude/projects/-Users-kz-Code-Crafty/c7297111-afb7-46c9-83b3-6edc09ed7f41/workflows/scripts/crafty-88-triage-full-wf_15b6af81-536.js`.
Post-attack verdicts: 59 LIVE, 12 ALREADY-FIXED, 9 STALE-CITE (defect real, line moved), 8 NOT-A-DEFECT.

**THE RHYTHM THAT WORKS:** take 3-6 findings, verify each against the file yourself (the triage is a
hypothesis per item, not a verdict), fix, mutation-prove EACH, run `npm run lint; echo $?` +
`npx vitest run` + `npm run build`, one commit for the batch, then a separate `chore(queue): stamp`
commit that flips `- ▢` to `- ▣✓ <sha>`. `queue-ledger` enforces that every finding carries a marker.

**WHAT KEEPS HAPPENING, so expect it rather than rediscovering it:**
- **The fix is routinely larger than the finding.** A `__proto__: {}` filed as a no-op test literal was
  hiding a live prototype-chain hole in `sanitizeSettings`. A conditional `if (...) expect(...)` in the
  climate test had gone blind — made unconditional it failed at once, because its probe coord had drifted.
- **Mutations that touch the line without reproducing the SHAPE stay green.** It has happened four times
  in this drain. When one stays green, the mutation is the finding, not the code.
- **Trace consumer graphs with QUOTED grep patterns.** An unquoted `--include=*.js` failed under zsh and
  returned zero external refs for every symbol, which would have deleted a live export.
- **Fixing one half of a paired gate exposes the other half.** The forward keybind gate used a bare
  substring; anchoring it to `X.code === 'Y'` flagged KeyF, which turned out to be handled as `e.code`
  — so the REVERSE gate, parsing `event.code`, had been blind to every handler on a differently-named
  event object. When you tighten one direction of an invariant, re-read the other.
- **A token grep over a file whose own COMMENTS contain the token is not a gate.** Hit twice here:
  saveSchema.js explains `questState` in prose, and QuestSystem imports `loreFor`. Strip comments, or
  move the claim to something that executes.
- **A `Mutation-Proof:` trailer must start with exactly that token and a colon** — the commit-msg hook
  parses it. Writing "Mutation-Proof, three directions:" was rejected, and because the commit failed, the
  chained `git rev-parse HEAD` then stamped two queue rows with the PREVIOUS commit's sha. Un-stamp, fix
  the trailer, re-stamp. Do not chain a stamp onto a commit that can be rejected.
- **A name-level grep says "used"; only the consumer GRAPH says "read".** GameSystems selected
  attributes/equipment/getEffectiveAttributes, which GamePanels uses constantly — from its OWN store
  slice, referencing the context zero times. Trace the path, not the token.
- **Never gate verification on a pipeline's exit status.** `npm run lint | tail -2 && ...` shipped a
  commit with lint RED, because `tail` exits 0. Check `$?` of the command itself.

**AFTER THE 88:** Phase C's remaining conversions are DELIBERATELY STOPPED — batches 2/4/5/6 of
`docs/superpowers/plans/2026-08-11-crafty-phase-c-suppression-conversion.md` move ~0 pixels the 6% gate
can resolve. The one open harness item worth doing is Batch 0.1: `diff.test.js` writes its contact sheet
and diff PNG only when the GLOBAL gate reds, so a density-only failure leaves nothing to open.

**✅ THE HARNESS HALF IS DONE (`ccebde0`).** The clock is COMMANDED, not free-running: `setCaptureFrame(n)`
sets the phase absolutely and freezes it, `shot()` pins before the stability wait, and the run now reports
its own denominator to stdout AND to `.capture-meta.json`. Live proof, not a green gate: a full capture
reports **`phase: 31/31 frames pinned at 90 (1.50s virtual); 0 shot outside capture mode`**, and a browser
probe found 74 grass chunk materials all carrying the declared time.

**⚠️ THE ONE UNIT IN FLIGHT — `explore-day` IS NOT SETTLED WHEN IT IS SHOT, and the number is far worse
than anyone knew.** The local-density ratchet fired on its FIRST real run: `explore-day` concentrated
**30.35% of a 128px window** at (448,416) against 9.30% frozen — while the global gate passed it at
1.625%. Cropped both frames and looked: the baseline carries a dense distant treeline, the current run is
visibly thinner, several trees simply absent. That is this repo's twice-diagnosed chunk-streaming
signature ("run 1 carries a distant tree canopy run 2 lacks"), and it has been diagnosed BY HAND both
times because a global percentage cannot see it.

**Do NOT widen the ratchet to make this green.** The gate is correct and the frame is wrong.
`waitForStableFrame` runs inside `shot()` and still is not catching a late chunk arrival on this pose.
Two samples of `explore-day`'s local density now exist — 5.13% and 30.35% — so the variance is not a
tolerance to be tuned, it is a defect to be fixed. Fix the settle, then re-freeze from two agreeing runs.

**ALSO OWED:** the baseline rewrite for `90ecf44`'s sibling — the sky-arch beacon fix (`landmark.png`
moved 0.014% / 0.78% local, so the beacon IS now rendering, having never rendered for anyone before).
That re-baseline is blocked behind the settle fix, because re-baselining from an unsettled run freezes
the unsettled state.

**AND A GAP THE RATCHET EXPOSED IN ITS OWN REVIEW PATH:** `diff.test.js` writes the contact sheet and the
diff PNG only when the GLOBAL gate reds. A density-only failure therefore produces no image to look at —
I had to hand-crop to diagnose this one. Batch 0.1 of the conversion plan is exactly that fix.

**AFTERWARDS: choose the remaining suppression->substitution conversions by MEASURED PIXEL
DELTA, not by plausibility.** That instruction comes from the first conversion failing on exactly that
axis, and it is the finding worth more than the wiring.

**WHERE WE ARE.** The full-source audit queue is DRAINED — `docs/superpowers/AUDIT-2026-08-09-full-source.md`
is 108 of 108 closed, zero open, every finding mutation-proven. Two findings that surfaced outside the 108
are closed too. The height-fog claim I recorded as unverified is now verified on a real GPU
(`frontend/tests/e2e/height-fog-instancing.spec.js` + `frontend/tests/e2e/_fog-probe.html`).

**WHY PHASE C IS THE PICKUP POINT, and it is not a new idea.** Git says the 108-finding audit INTERRUPTED
Phase C mid-stride: `97ea38c` (step 1, the deterministic frame clock) and `7d743d6` (step 2, step-then-shoot)
landed at 08:40 and 09:00 on 08-09, and the audit doc landed immediately after. So this is the work that was
already in flight, resumed — not a pivot.

**THE GAP, VERIFIED BY READING THE CODE RATHER THAN THE PLAN.** `7d743d6` is titled "step-then-shoot" and
its own body says "wired to the test bridge as a hook so the harness can drive it". It touched exactly three
files — `frontend/src/App.jsx`, `frontend/src/devtest/captureClock.js`, and that module's gate. **The harness
never calls it.** `capture.mjs` is 766 lines and contains zero references to `stepCaptureFrames`. The
primitive and the bridge hook exist; the caller does not. That is this repo's own most-repeated defect class
— shipped, compiling, gated green, never RUN — sitting inside the harness built to catch it.

**WHAT THAT COSTS TODAY.** Live census: **218 `isCaptureMode()` references across 65 files, 27 of them bare
early-returns.** The gated frames depict a build with weather, mob AI, NPC routines, particles and spawning
switched off, so nothing that only manifests in MOTION can regress against the oracle. Both primitives that
substitution needs now exist — substituted TIME (`captureClock.js`) and substituted RANDOMNESS
(`captureMode.js`'s seeded per-key streams) — so the only thing standing between the oracle and a moving
world is a harness that steps the clock to a declared frame before it shoots.

**ORDER, AND IT MATTERS — recorded in `docs/superpowers/DECISIONS.md` before the work, not discovered during
it.** Step-then-shoot goes FIRST. SwiftShader renders at roughly 1 fps, so waiting wall-clock time advances
the virtual world by almost nothing; un-suppressing a subsystem without stepping produces frames that are
stable, still, and exactly as uninformative as the suppression they replaced.

**WHAT THE FIRST CONVERSION TAUGHT, AND IT GOVERNS THE REST.** Grass wind was converted from a hard `0`
to the declared phase. It works — 74 materials carry it — and it bought **almost nothing at the gate**:
full capture against baseline reads explore-day 0.281%, ocean-coast 0.108%, explore-day-med 0.106%,
everything else lower, against a **6%** threshold and an explore-day self-diff already measured at 0.210%.
The blades move; the pixels do not move enough for the gate to resolve it, so a total regression of the
wind model would still pass. **A subsystem is not worth converting because it moves, but because its
motion moves pixels the threshold can see.** A global 6% threshold cannot resolve a small-amplitude,
wide-area change — which is a finding about the GATE, and the strongest argument yet for region-scoped
assertions on the frames that matter.

**BUDGET HONESTLY.** Every conversion changes what a frame DEPICTS, so each owes a baseline re-capture;
`baseline-trailer` forbids bundling that rewrite with the `src/` change that caused it, so it is two commits
per batch and `npm run test:visual` is manual at ~12 minutes. Batch conversions by WHICH FRAMES they move,
not by which file they live in.

**THEN, NOT BEFORE: V1 — the gate corpus.** `frontend/tests/gates/.source-grep-ledger.json` freezes 116
source-grep gates; the ratchet lets that number fall and never rise. `memory/STATUS.md` carries V1 with
~80 of them never classified. The empirical case for doing it: in the audit session NINE of these went RED
at a FIX rather than at a defect — one because a comment was added above the line it matched, one asserting
an identifier that was wrong for the entire life of the bug it claimed to guard. Classification first
(STRUCTURAL-CORRECT / VACUOUS / BRITTLE), then seam extraction for the ones that need it. **A source-grep is
the CORRECT tool for a classic Worker that cannot import** — do not mass-rewrite the structural ones.

**WORKING RULES THAT COST ME TIME, kept here rather than relearned:**
- A mutation must reproduce the defect's SHAPE, not merely touch its line. Five mutations stayed green in
  the audit session and every one of them was a defect in the test, not evidence the code was safe.
- Anchors must be STRUCTURAL and asserted unique (`s.count(old) == 1`). A non-unique anchor silently edited
  a different site; a line-based regex deleted an import because the symbol appeared in it.
- Refresh the three operator pages every ~10 commits. `artifact-currency` blocked two pushes in one session
  because "refresh at session close" let them reach 31 commits behind.
- Restore a mutation from a `cp` backup. **Never `git checkout <file>`** — it nukes untracked work.
- Superseded cursors live in `memory/archive/ACTIVE_PLAN-superseded-2026-07-to-08.md`. This file had SEVEN
  of them stacked up, back to 2026-07-13, while its own preamble said it owns the cursor only. Do not mine
  the archive for what is next.

## IN FLIGHT — 2026-08-13 (resume here)

**1. VISUAL RE-BASELINE (capture A running in background at time of writing).**
- WHY: puppeteer 25.6.0 moved bundled Chromium **147 → 151**, so every committed baseline was captured on
  a renderer four majors old. It is ALSO the only way to replace the **29 of 31 floor-clamped
  density-ledger entries** with measurements (`_unmeasured` in `frontend/tests/visual/.density-ledger.json`).
- PROCEDURE: two captures on identical code, quiet machine, review frames by eye, then
  `node scripts/visual/freeze-density.mjs`. Preconditions written in that file's header.
- Run A frames land in `/tmp/.../scratchpad/rbA/`; run B in `rbB/`. Compare A-vs-B for real run-to-run
  variance, and A-vs-baseline for the Chromium delta.
- COMMIT DISCIPLINE: `Baseline-Review:` trailer required; must NOT be bundled with any `frontend/src/` edit.
- NOTE: I contaminated one earlier attempt by writing into `tests/visual/current/` while a capture owned
  it, and crashed two others by running the test suite during a capture. Do neither.

**2. PR #13 HELD, NOT ABANDONED.** Fully green (the dead re-exports it tripped on are removed). Merge it
AFTER the re-baseline — a dependency change mid-capture contaminates the pair.

**3. DOC REVIEW IN PROGRESS** (`CLAUDE.md` = `.agent/AGENTS.md`, plus `.claude/rules/*.md`). Verified drift
found so far, all understated:
- `isCaptureMode()` guards: doc says ~112, live is **127**
- raw `Math.random()`: doc says 73 in 19 files, live is **72 in 20**
- gates-and-probes.md says gate-shape covers "97 assertions / 42% skipped"; live is **388 assertions, 106
  source-grep gates of 181 files (59%)**
- source-grep ratchet: doc says 113/115, live is **106**
- The whole capture-determinism measurement block (13 byte-identical, menu 0.455%, explore-day 0.210%,
  "measured 2026-08-09") is INVALIDATED by the Chromium bump and must not be restated as current.

### RE-BASELINE RESULT (2026-08-13) — measured, not yet committed

Two clean captures on Chromium 151 (A 31/31, B 30/30, 0 crashes, ~1786s each). Frames preserved in the
session scratchpad `rbA/` and `rbB/`.

**1. The Chromium bump was a non-event.** 17/31 byte-identical against the Chrome-147 baselines, ZERO
frames over the 6% gate, worst `explore-day` 0.153% global. My earlier claim that 147->151 invalidated
the oracle was OVERSTATED and is corrected here.

**2. True run-to-run variance (A vs B, identical code AND renderer):** 22/30 byte-identical.
`explore-day` 30.35% local / 1.536% global · `ocean-coast` 3.70% local · `hearth` 1.89% ·
`explore-night-low` 1.88% · `explore-day-low` 1.81% · `biome-snow` 1.54%.

**3. THE ocean-coast QUESTION IS ANSWERED, by the harness's own instrumentation.** `capture.mjs` emits
`WARN: frame never stabilized after 34 polls (8.5s) -> THIS FRAME IS NOT DETERMINISTIC and re-baselining
it would freeze noise` on exactly THREE frames, in BOTH runs independently: **ocean-coast, landmark,
explore-day-med**. Its ratchet failure is inherent instability, not a regression.

**4. WHAT LANDED (2026-08-13), and what is still owed**

DONE — `e077dc9` the ledger is FROZEN from this pair. Unmeasured **29 -> 23**, ratcheted in
`density-ledger-measured.test.js`. `ocean-coast` now sits at a measured **6.7%** instead of the 2%
floor constant, which is the fix its own failure message prescribed. Its ratchet failure is resolved
by MEASUREMENT, not by raising the floor.

DONE — `43ee407` the freezer itself was broken in three ways, each proven RED first: it demanded TWO
captures in its docblock while reading ONE hardcoded directory (so every ledger it ever produced was
single-sample); it aborted the whole freeze if one frame was missing from one run; and regenerating
the ledger reddened the gate whose failure message tells you to regenerate it. It now takes N run
dirs, merges at the WORST run, records per-frame sample counts, and generates `_unmeasured`.

DONE — `e077dc9` `explore-day` is REFUSED, not frozen. It varies 5.13%-30.35% local, which would
freeze at 54.7% — past the point where an allowance is a gate. The freezer keeps such a frame at its
previous value, records it in `_ungateable`, and ABORTS if a new frame has nothing to fall back on.

DONE — `eb7d089` a capture that SKIPS a gated frame no longer reports itself complete. NOTE the
correction: I claimed the stale frame was kept SILENTLY; it was not — the freshness predicate's mtime
rule reds by name, verified by reconstructing the exact `current/` state and running the real gate.

OWED — **a capture pair on a QUIET machine.** `79068f7` raised `shot()`'s stability requirement from
2 consecutive stable frames to 5 (the terrain wait already demands 6 for the same reason). It is a
HYPOTHESIS: proving a flakiness fix needs several post-change runs, and the machine was at load 21 on
14 cores with three other sessions' node processes pinned near 100%. Capture crashes in that band and
a load-skewed capture that SUCCEEDS is worse than none. When it runs:
- expect frames to be MORE complete than baselines shot under the old wait; that red is a real signal
  and calls for a deliberate re-baseline with a `Baseline-Review:` trailer, NOT for treating it as noise.
- `explore-day` stays in `_ungateable` until a pair shows its variance has actually fallen.
- Do NOT re-baseline `ocean-coast`, `landmark`, `explore-day-med` — the capture explicitly warns that
  re-baselining a frame it declared non-deterministic freezes noise.

DONE — **PR #13 merged** (`5848d64`, CI fully green including all three e2e shards — the first
complete e2e validation on main since this session started; five earlier runs were cancelled by my own
successive pushes). Kevin moved `Bash(gh pr merge*)` from `deny` to `allow` in `~/.claude/settings.json`
on 2026-08-13, so merging is no longer blocked.

DONE — `9a64fc8` **and merging it exposed a defect my own review of it had missed.** I called #13
"dev-deps only, zero render risk"; that reasoning rested on the section name, which is not what the
entry means. `@dimforge/rapier3d-compat` is a direct dep ONLY because it was a phantom import
(`32625c0`); the app reaches physics through `@react-three/rapier`, which pins it EXACTLY at 0.19.2.
While they agree they dedupe to one copy — which is what makes
`tests/integration/beast-collider-rapier.test.js`'s claim to drive "the same build the app ships" true.
The 0.19.3 bump split them (root 0.19.3, a NEWLY NESTED 0.19.2 for the app) and NOTHING failed: bundle
+0.0KB, unit green, e2e unaffected. Only the test's reason for existing was lost, while its comment
went on asserting otherwise. Pin held at what the wrapper demands; Dependabot now ignores this package
at PATCH too (it moves in lockstep with `@react-three/rapier` or not at all); gated in
`supply-chain.test.js`, mutation-proven both ways.

NEXT SESSION — **ROADMAP Phase 26: physically-based sky.** Kevin's call 2026-08-13, deferred until the
current postprocessing work closes. Atmospheric scattering (highest value), volumetric clouds (most
transformative, needs a perf budget agreed BEFORE building — the cost lands on the constrained low/med
tiers), richer light shafts (cheapest — GodRays already runs). Read Phase 26's warning block first: the
sun is a camera-locked billboard serving as GodRaysEffect's light source, bound by a vendor material
contract, and making it real scene geometry is NOT an upgrade.

OWED — **A WEBGL ERROR STORM ON THE PRODUCTION BUNDLE, INVISIBLE TO EVERY GATE HERE.** Found
2026-08-13 by tracing the production build (`vite preview`) with the `chrome-devtools` CLI — the first
time anything in this project has loaded the bundle Vercel actually serves, which CLAUDE.md already
noted no harness does. On every load:

```
128x  GL_INVALID_OPERATION: glBlitFramebuffer: Read and write depth stencil attachments cannot be the same image.
128x  GL_INVALID_OPERATION: glBlitFramebuffer: Depth/stencil buffer format combination not allowed for blit.
  1x  WebGL: too many errors, no more errors will be reported to the console for this context.
```

Per-frame, until **Chrome mutes the context**. So 256 is a FLOOR, not a count — and once muted, a
genuine GL error later in that same context is silenced too. That is the part that matters: the noise
is not merely ugly, it disables the channel `capture.mjs` watches.

`capture.mjs`'s `FATAL_GL_RE` does NOT match it — verified by running the actual regex against the
message string, not by reading it. It looks for `Shader Error|context lost|CONTEXT_LOST_WEBGL|Error
linking program|shader compilation`; none matches `GL_INVALID_OPERATION: glBlitFramebuffer`. Shape
points at the postprocessing stack blitting with a shared depth/stencil attachment.

Also measured, and worth keeping: **production LCP 237ms vs the dev server's 1559ms** (render delay
233ms vs 1556ms, CLS 0.00 both). Any perf reasoning from dev numbers is 6.6x wrong.

Next step is a probe that loads the PRODUCTION build and asserts on its console — the gate that would
have caught this. Do NOT simply widen `FATAL_GL_RE` and call it done: the capture runs the DEV server,
so it would still never see this frame.

OWED — **PR #15 is open ON PURPOSE.** Production deps (react 19.2.8, drei 10.7.8 patch,
framer-motion 12.43.0, postprocessing 6.39.4, zustand 5.0.14). These CAN move pixels and the visual
gate runs in neither the hook nor CI, so it wants a capture run alongside it — not a merge on green.

OWED — `era-review` artifact is 11 commits behind, `loop-progress` 6. Both informational, under the
30-commit hard limit.
