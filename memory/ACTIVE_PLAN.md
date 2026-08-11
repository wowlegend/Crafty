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

## 📍 THE CURSOR — 2026-08-11 · Phase C: the capture harness stops photographing a frozen world

**✅ THE HARNESS HALF IS DONE (`ccebde0`).** The clock is COMMANDED, not free-running: `setCaptureFrame(n)`
sets the phase absolutely and freezes it, `shot()` pins before the stability wait, and the run now reports
its own denominator to stdout AND to `.capture-meta.json`. Live proof, not a green gate: a full capture
reports **`phase: 31/31 frames pinned at 90 (1.50s virtual); 0 shot outside capture mode`**, and a browser
probe found 74 grass chunk materials all carrying the declared time.

**THE ONE UNIT IN FLIGHT: choose the remaining suppression->substitution conversions by MEASURED PIXEL
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
