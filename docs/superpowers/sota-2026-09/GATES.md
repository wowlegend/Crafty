# Crafty check inventory — classified against the 2026-09 gate principles

*Read-only audit, 405 check files, generated 2026-09-22. Scope A–F enumerated one row each; G aggregated by directory.*

## Executive summary

**Denominator correction first.** The lane brief said 375 check files. The real count is **405**:
A gates 181 · B script-tests 18 · C e2e 20 · D ci-scripts 21 ·
E visual probes 29 · F visual diff 1 · G colocated 135. Everything except group E sums to 376, so the
brief's 375 is that sum less one: **the 29 visual probes were the population left out of the count**, and
they are the group with the weakest receipts (4/29) in the whole suite.

### THE HEADLINE NUMBER

**113 of 405 check files (27%) were added by a commit carrying a `Mutation-Proof:` trailer.**
Counting the twelve more that narrate a mutation in a comment instead: **125/405 (30%)**.

That number is generous in three ways, and each one matters:

1. **148 proof lines exist in all of git history, for 113 files.** 28 commits added more gate files than they
   stated proofs for, so **31 of those 113 files are covered by a proof line that was also carrying a sibling**.
   The number of files with a *dedicated* killability receipt is at most **82 / 405 = 20%**.
2. **A trailer is a sentence, not a receipt.** `mutation-proof-trailer.mjs` says so in its own header: *"The
   trailer is not verified to be TRUE — nothing can do that mechanically."* It proves an author was asked.
3. **The 106 gates in `.source-grep-ledger.json` have ZERO proof lines between them** — all of them predate
   the enforcer, and the enforcer only fires on new files and assertion rewrites. The largest, weakest
   population in the repo is the one the receipt regime cannot reach.

### Verdict distribution

| verdict | n | share |
|---|---:|---:|
| KEEP | 122 | 30% |
| ENHANCE | 208 | 51% |
| CONVERT | 51 | 12% |
| DELETE | 24 | 5% |

### Provenance tiers (the numerator of the one rule)

| tier | meaning | n | share |
|:-:|---|---:|---:|
| 0 | reality — the author cannot author it (pixels, a real browser, git history, built bytes) | 59 | 14% |
| 1 | withheld — a frozen ledger/baseline fixed before the change | 22 | 5% |
| 2 | cross-authored — a different source of answers than the code | 80 | 19% |
| 3 | self-authored — code and check in one pass | 244 | 60% |

**244 files (60%) are tier 3, and 194 of those carry no killability receipt at all.**
Under the one rule — provenance × killability — that product is zero. That is the shape of most of this suite.

### R9 target class

| target | n | share | note |
|---|---:|---:|---|
| invariant | 70 | 17% | strongest — a law over all inputs |
| coupling | 64 | 15% | two knobs must agree |
| spec-anchor | 69 | 17% | an artifact that predates the code |
| example | 202 | 49% | catches only the bug already imagined |

### Per-group receipt rate — read this as the map of where the value is

| group | files | receipt | tier 0-1 | verdicts |
|---|---:|---:|---:|---|
| A | 181 | 53/181 (29%) | 7/181 (3%) | ENHANCE 56 · CONVERT 51 · KEEP 50 · DELETE 24 |
| B | 18 | 17/18 (94%) | 4/18 (22%) | KEEP 17 · ENHANCE 1 |
| C | 20 | 5/20 (25%) | 20/20 (100%) | ENHANCE 15 · KEEP 5 |
| D | 21 | 17/21 (80%) | 15/21 (71%) | KEEP 17 · ENHANCE 4 |
| E | 29 | 4/29 (13%) | 29/29 (100%) | ENHANCE 25 · KEEP 4 |
| F | 1 | 1/1 (100%) | 1/1 (100%) | KEEP 1 |
| G | 135 | 28/135 (20%) | 5/135 (3%) | ENHANCE 107 · KEEP 28 |

**B (script-tests) is the best group in the repo and D (CI scripts) is second** — 17/18 and 17/21 receipt,
and their fixtures are *the actual readings from real failures* (`probe-honesty.test.js` pins the 2026-08-05
measurements that fooled `touch-probe.mjs`). That is tier-0 provenance plus demonstrated sufficiency: the
instrument is shown returning its NEGATIVE verdict, which is the check people skip.

**E (visual probes) is the worst by receipt (4/29) and G (colocated, 28/135) is the worst by volume.**

---

## The specific holes, with file:line

### R3a — empty-denominator PASS (a verdict quantified over a collection that can be zero)

The repo knows this failure: `visual-denominator-gates.test.js:37` carries
`expect(checked, 'the states list is EMPTY — the gate would pass over everything').toBeGreaterThan(0)`,
and `diff.test.js:300` carries `expect(density.length, 'no frame was measured').toBe(STATES.length)`.
Those two are the *only* zero-guards in the repo that EXIT. Everywhere else the guard is a printed number.

| where | the hole |
|---|---|
| `frontend/scripts/ci/i18n-adoption.mjs:113` | `scan()` globs `src/**/*.jsx`. An empty glob → `now = {}`, `errors = []` → prints `✓ i18n-adoption: 0 occurrences across 0 files, none new` and exits 0. **No zero-guard.** |
| `frontend/scripts/ci/i18n-adoption.mjs:178-180` | Worse than empty: files that VANISH from the frozen ledger are collected into `gone` and routed to the **success** branch (`— improved, re-freeze with --write`). Deleting the whole `src/ui` tree reads as an IMPROVEMENT. This is R4 DEGRADED: it reads as success. |
| `frontend/scripts/ci/cli-guard.mjs:131` | Emits the denominator (`${checked} script(s) checked`) but never asserts it. `walkDir` returning zero `.mjs` files prints `✓ cli-guard: 0 script(s) checked` and exits 0. R3a says the guard must EXIT, not print. |
| `frontend/scripts/ci/gate-shape.mjs:304` | Same shape, on the repo's own anti-decoration lint. `checked === 0` prints `✓ gate-shape: 0 assertions verified` and exits 0. |
| `frontend/scripts/ci/measure.mjs:64` | `walk(join(APP,'src'))` with no zero-guard before the comparison. |
| `frontend/scripts/ci/i18n-dead-keys.mjs:55` | Has a real denominator assert (`DENOMINATOR MISMATCH` on the tally sum) — **the correct shape, and the only one of its kind in group D.** But it never exits 1 on dead keys, so it is an instrument, not a gate; its header does not say so. |
| `frontend/tests/visual/diff.test.js:178` (`for (const state of STATES)`) | If `VISUAL_STATES` were empty there would be zero `it()` blocks and the ratchet would assert `expect(0).toBe(0)` → PASS. The population is guarded *elsewhere* (`visual-denominator-gates.test.js`), which is correct, but the coupling is undeclared in this file. |
| `frontend/tests/gates/pilgrim-quest-gates.test.js:15` | `expect(QUEST_LIST.some(q => q.type === 'distance')).toBe(false)` — `.some()` over an empty list is `false`, so the assertion passes when `QUEST_LIST` is empty. Asserting the ABSENCE of a member via `.some()` is always empty-denominator-satisfiable. |
| `frontend/tests/gates/beast-reveal-camera-gates.test.js:62` | `.every(Number.isFinite)` over `position` — `.every()` on an empty array is `true`. |
| `frontend/src/devtest/perfScenarios.test.js:44` | `expect(ev.every(e => e.type === 'hurl')).toBe(true)` — same shape, passes on an empty event list. |
| `frontend/tests/gates/baseline-trailer-gates.test.js:61-67` | Four `.some(re => re.test(...))` assertions over `BASELINE_PATHS` / `SOURCE_PATHS`; an empty pattern list makes the `.toBe(false)` half pass for the wrong reason. (The `.toBe(true)` half is a real positive control — this file is close to right.) |

**Selftest gap:** no gate in the repo has an EMPTY-INPUT canary. `_gate-ratchet.mjs`'s `ratchetDiff([], [])`
returns `{added:[], stale:[]}` — a clean pass over nothing — and `tests/scripts/gate-ratchet.test.js` does
not exercise that case.

### R2 — absence-of-known-bad-string assertions

**109 instances** across the corpus (`.not.toMatch` / `.not.toContain`; 77 of them regex-literal, inside
group A alone). These are the class that can never go red again once the string is gone.

The clearest example is the whole of `frontend/tests/gates/title-screen-brand-gates.test.js:6-15` —
six of its eight assertions are `not.toMatch(/menu-particle/)`, `/shimmer-text/`, `/glow-button/`,
`/pixel-font/`, `/bg-purple-600/`, and a hard-coded old gradient string. They describe a title screen that
was deleted a year ago. The two positive assertions (`/TitleDiorama/`, `/<Button/`) are satisfied by any
mention, including in a comment.

`frontend/tests/gates/look-sensitivity-gate.test.js:12` is the worst-shaped of them, for a different
reason: it CONCATENATES two source files (`const scene = read('GameScene.jsx') + read('render/PointerLook.jsx')`)
and then asserts over the union. `expect(scene).not.toMatch(/PointerLockControls/)` is an absence claim
over a synthetic string that belongs to neither file, and the gate cannot say which file satisfied any of
its positive assertions either.

`gate-shape.mjs` explicitly declines to check negated assertions, and says why in its own header:
*"Negated assertions have a real vacuity failure of their own (one whose pattern can never match anything
anywhere always passes), but it is a different check."* **That check was never built.** All 109 are unchecked.

### R6 — assertions satisfiable by a COMMENT, and what `gate-shape.mjs` actually covers

`scripts/ci/gate-shape.mjs` is a genuinely good instrument — AST comment-blanking, polarity-aware,
multi-target, with three of its own false-accusation scars documented inline. It reports
`✓ gate-shape: 388 assertions verified against code-only source; 106 source-grep gates (ratchet holding)`.

**Here is what that 388 is a fraction of.** Positive source-text assertions in `tests/gates/`:

| form | n | checked by gate-shape? |
|---|---:|---|
| `toMatch(/regex/)` positive | 449 | yes, where the target resolves |
| `toMatch('string')` / template | 13 | **no** — requires a `RegExpLiteral` node |
| `toContain('string')` positive | 33 | **no** — only `toMatch` is collected |
| `not.toMatch` / `not.toContain` | 88 | **no** — declined by design, see R2 |
| **total positive** | **495** | **388 reached = 78%** |

So **107 positive source-text assertions (22%) are never examined, and the lint prints no skip count.**
A silent skip is a pass. Concretely, **26 gate files containing 61 positive regex assertions are never
opened by it at all** because their target path never resolves — the largest are:

`siege-warning-gates` (8) · `spell-cast-level-wire-gates` (7) · `recipes-gates` (5) · `place-puff-gates` (4) ·
`touch-dodge-gates` (3) · `subject-on-screen-gates` (3) · `mob-aggro-audio-gate` (3) ·
`compass-hearth-gates` (3) · `boss-melee-spark-gates` (3).

`gate-shape.mjs` has three `continue` statements that swallow a gate silently
(`:212` unparseable/no patterns, `:230` no resolvable target, `:241` unreconstructable regex). Each is
individually defensible — the header explains that false accusations are the worse failure — and together
they produce a numerator with no denominator, which is the exact defect the same author diagnosed in
`_gate-ratchet.mjs` ("the gate printed 115 beside a frozen `_count` of 116").

**The `toContain` blind spot has a named victim.** `frontend/tests/gates/heightat-single-source.test.js`
is an anti-drift gate whose whole job is to stop a formula being hand-copied. Its assertions are
`expect(worker).toContain('computeHeight')` and `expect(climate).toContain('heightAt')` (lines 21-24).
Both are satisfied by a comment, neither is checked by `gate-shape.mjs`, and the real coupling — that
`climate.js` and `heightAt.js` return the SAME height for the same input — is computable and is not computed.
The file's own header says the last drift happened *because* "the formula was hand-copied" and the
"characterization test pins it" claim was false. The replacement makes the same class of claim.

Other comment-satisfiable positives found: `ally-eyes-gate.test.js:73` (`toContain('#ff0000')`),
`save-slot-ownership-gates.test.js:196`, `capture-preflight.test.js:148,169`,
`density-ratchet.test.js:103,131`, `gate-ratchet.test.js:62,65`.

### R8b — fixtures naming a real external thing that can move silently

31 instances. The load-bearing ones:

| where | the moving thing |
|---|---|
| `frontend/package.json` `engines.node` `>=24.0.0 <25` + `tests/scripts/node-runtime-declared.test.js` | pins a runtime version in two places; the test asserts the declaration, not the running version |
| `frontend/scripts/ci/prod-smoke.mjs` | drives a real `puppeteer` Chromium; the version is whatever npm resolved |
| `frontend/tests/visual/baseline/*.png` (31 frames) | the oracle is a rasteriser artifact. `diff.test.js:56-78` now READS `baseline/.capture-meta.json` provenance and REPORTS a renderer mismatch without asserting — **correct call, documented reason** (asserting it would mandate a reflexive 31-PNG re-baseline) |
| `frontend/scripts/ci/_density-ratchet.mjs:33` `DENSITY_HEADROOM = 1.8` | the file says outright it is "CALIBRATED FROM ONE RUN … a guess at the variance, not a measurement of it" |
| `frontend/tests/e2e/*.spec.js` | Playwright fixtures naming `data-testid` strings that live only in JSX |

### R10 — named exceptions / whitelists / allowlists

**Zero constant-named allowlists found** (`ALLOW*`, `WHITELIST`, `EXEMPT`, `KNOWN_`). That is genuinely
clean. What exists instead is the *ratchet* pattern — `.source-grep-ledger.json` (106 entries),
`.density-ledger.json` (31 frames), the i18n adoption ledger, `gate-table`, `queue-ledger` — which is the
right shape for an exception population: it may shrink freely and never grow.

R10 says *delete the exception, do not correct it*, and this ratchet **did** get worked down —
116 → 115 → 113 → 110 → 106 across four commits on 2026-08-11/12, each one converting greps to behaviour.
That is the principle working. **It has not moved since 2026-08-12** — six weeks, against a suite that
added files in that window. A ratchet that stops falling is an allowlist with better manners, and this one
stopped 106 short of zero.

### R11 — silent skips

| where | the skip |
|---|---|
| `frontend/tests/gates/visual-denominator-gates.test.js:63` | `if (names.length < VISUAL_STATES.length) return;` — a partial capture returns GREEN with **no print**. The reason given is sound (the freshness gate owns that case) but the skip is invisible in the output. |
| `frontend/tests/e2e/tier-downgrade-reclaim.spec.js:70` | `test.skip(` |
| `frontend/scripts/ci/gate-shape.mjs:212,230,241` | three silent `continue`s (see R6) |
| `frontend/scripts/ci/_density-ratchet.mjs:86` | `if (!densities.length) continue;` — a frame with no observations is dropped from the merge silently. `densityVerdict`'s `missing` list catches it downstream, which is the save. |
| `frontend/scripts/ci/artifact-currency.mjs:164`, `runtime-reach.mjs:168,193`, `coverage-zero.mjs:60`, `flaky-report.mjs:96,103` | `process.exit(0)` on a missing input. Three of these are explicitly labelled *"a report, never a gate"* in their own headers — **that is R5 fail-open chosen deliberately and written down, which is the principle being met, not broken.** |

### R12 — inherited-state reads (a test reading state it did not set)

**28 files.** 19 of them are group-E probes (`scripts/visual/*-probe.mjs`) that call
`window.useGameStore.getState()` to read the world the boot sequence produced, and never set it. For a
probe this is arguably the point — it is observing reality — but it means every probe's output depends on
whatever `_boot.mjs` left behind, and **nothing asserts what that was**. The nine outside E are the ones
to fix first:

`tests/gates/capture-rest-gates.test.js:155` · `tests/gates/spatial-sfx-bus-gates.test.js:27` ·
`tests/gates/touch-tray-gate.test.js:23` · `tests/gates/hud-slice-reachability.test.jsx:23` ·
`tests/e2e/hud-layout.spec.js:37` · `tests/e2e/panel-overflow.spec.js:24` ·
`tests/e2e/tier-downgrade-reclaim.spec.js:32` · `tests/e2e/touch-controls.spec.js:36` ·
`tests/e2e/world-rebuild-after-load.spec.js:39` · `scripts/ci/prod-smoke.mjs:129`

Contrast `tests/e2e/equipment-stats.spec.js:15`, which does it right: it CLEARS the chest slot first
(*"for a deterministic baseline (starting loadout may vary)"*), then measures a delta it set up.

### Would still pass if the feature under test were DELETED

This is the `.source-grep-ledger.json` population, and the answer is structural rather than per-file:
**68 of the 106 ledger gates never import the module they guard.** They read it as text. Deleting the
implementation and leaving a comment that names the symbol keeps them green — which is exactly the
`input-abstraction-gates` defect of 2026-07-27 that `gate-shape.mjs` was built for. `gate-shape` closes
the *comment* half of that hole for 78% of positive assertions; it does not close the *deletion* half at
all, because a regex over source text cannot tell the difference between a live call and a dead one.

---

## The 10 worst offenders

Ranked by (breadth of claim) × (zero killability) × (how much the label promises):

1. **`frontend/tests/gates/.source-grep-ledger.json` — the 106-gate population itself.** Zero proof lines
   between them; 68 never import their subject; the ratchet has never moved off 106. This is ~28% of the
   whole suite and its expected killability is close to zero.
2. **`frontend/scripts/ci/gate-shape.mjs`** — the repo's own anti-decoration lint. Reaches 388 of 495
   positive source-text assertions (78%), skips 26 files entirely, prints no skip count, and passes on an
   empty population. The enforcer of R6 has an R3/R11 hole.
3. **`frontend/scripts/ci/i18n-adoption.mjs:113,177`** — empty-glob PASS, and a vanished-file path routed
   to the SUCCESS branch. R4 DEGRADED: deletion reads as improvement.
4. **`frontend/tests/gates/modal-static-gates.test.js`** — 16 of 16 assertions are regex over JSX text, and
   the claim is *accessibility* (`role="dialog"`, `aria-modal`, `aria-label`). jsdom + `getByRole('dialog')`
   is available in this repo and used elsewhere. Highest claim-to-evidence ratio in the corpus.
5. **`frontend/tests/gates/look-sensitivity-gate.test.js:12`** — concatenates two source files and asserts
   over the union, including an ABSENCE (`not.toMatch(/PointerLockControls/)`) that belongs to neither file.
   Cannot report which file satisfied it; cannot be anchored (R6).
6. **`frontend/tests/gates/heightat-single-source.test.js:21-24`** — an anti-drift gate against hand-copying
   a formula, implemented as `toContain` on two file texts. Comment-satisfiable, outside `gate-shape`'s
   check by construction, and the real invariant (both samplers agree) is one import away.
7. **`frontend/tests/gates/title-screen-brand-gates.test.js`** — 6 of 8 assertions are absences of CSS class
   names from a design that no longer exists. Necessity without sufficiency, permanently.
8. **`frontend/tests/e2e/smoke.spec.js:28`** — `expect(max - min).toBeGreaterThan(20)` (line 28) over 0-255 luminance.
   An absolute unitless floor: a frame rendering only the sky gradient passes "the canvas is not blank".
   The most-cited E2E in the repo, and its shape check is its weakest assertion.
9. **Group E as a class — 25 of 29 probes with no receipt, 19 reading `getState()` they never set.**
   `probe-honesty.test.js` covers `_probe.mjs`'s *helpers* superbly; the other 27 probes' own drive logic is
   ungated. A probe that silently drives nothing still writes a PNG, and that PNG becomes the baseline.
10. **Group G as a class — 107 of 135 colocated tests with no receipt, 116 of 135 tier 3, 83 of them in
    `src/game` alone.** This is R9's warning in numbers: the suite grows where growth is cheapest.

Runner-up worth naming: **`frontend/scripts/ci/cli-guard.mjs:131`** prints its denominator and does not
assert it — the near-miss version of #2, in a file whose whole subject is a gate that silently stopped running.

---

## The single structural change that would most raise this suite's value

**Make the killability receipt a PER-FILE artifact that the suite reads, instead of a per-commit sentence
that only a reviewer reads — and let the gate-table print the un-receipted count as a first-class number.**

Concretely: a `Mutation-Proof:` block *inside each check file* (a one-line trailer comment naming the
mutation and the observed RED), plus one CI script that (a) parses it, (b) refuses a check file that has
none, ratcheted exactly like `.source-grep-ledger.json`, and (c) **emits the denominator** —
`N/{tot} check files carry a receipt` — on every run, green or red.

Why this one and not the obvious alternative (convert the 106 source-grep gates):

- The conversion is 106 files of work and raises provenance from tier 3 to tier 3. A behavioural test
  written in the same pass as the code it tests is still self-authored. It removes the *comment-satisfiable*
  defect, which is real, and leaves the *killability* factor untouched — and killability is the factor that
  is at zero for {100*(tot-strict)//tot}% of this suite.
- The receipt regime already exists, is already enforced at the one place a rule in this repo survives (the
  commit message — `mutation-proof-trailer.mjs` documents exactly why that channel works), and its only
  structural weakness is that **the receipt is not attached to the thing it certifies**. 31 of 113 receipted
  files share a proof line with a sibling precisely because the attachment is by commit, not by file.
- It converts the headline number from an archaeology exercise (parsing 1,857 commits, as this audit had to)
  into a number the suite prints about itself. R3 says emit the denominator; right now the suite's most
  important denominator is the one number nothing in it can state.

The second-order effect is the point: once every check file must name the mutation that reds it, the
**sufficiency** half gets forced. "Deleted the assert → RED" is a necessity proof and would be visibly weak
next to "halved the damage → RED". That is the check the brief says people skip, and a per-file receipt is
where it becomes visible.

### What this audit does NOT check (R7)

- **It never ran the suite.** Every verdict here is from reading source, git history, and one read-only
  `gate-shape.mjs` run. No mutation was performed, so *every* killability claim in this document is inferred
  from an author's sentence or from the absence of one — including the 82-file "dedicated receipt" figure.
- **The per-row `tier` / `target` / `verdict` columns are mechanical**, derived from import shape, assertion
  polarity, and name tokens. They are an instrument with no positive control of its own (R8), and the
  ~20 rows I read by hand were chosen because they looked worst, not at random.
- **Groups E and C were classified largely by structure, not by reading each file.** E's tier-0 rating is
  earned by *what they drive* (a real browser), not by what they assert — most assert nothing at all,
  by design.
- **`git log` attribution is by commit, not by hunk.** A file modified in a trailer-bearing commit was
  counted as receipted only if it was ADDED there; the 212-file "touched by a trailer commit" number is
  reported nowhere in this summary because it is not evidence.

---

## A. `frontend/tests/gates/` — 181 files

### A · DELETE (24) — ⚠️ DO NOT EXECUTE AS WRITTEN. RECLASSIFY FIRST.

> **Verified 2026-09-22, after this section was written: several of these are the ONLY guard for a real
> property, and deleting them would unguard it while making the corpus look cleaner.**
>
> - `hud-stat-wire-gates.test.js` is named in `frontend/tests/e2e/_boot.js` as the committed guard for
>   exactly what the e2e layer deliberately does NOT assert: *"live in-game HUD-DOM assertions are
>   intentionally NOT in this suite … covered by the static wiring gate (tests/gates/hud-stat-wire-gates)"*.
> - `look-sensitivity-gate.test.js` is named in `.claude/rules/input-and-pointer-lock.md` as what pins
>   drei's `PointerLockControls` staying ABSENT — the component whose removal that whole rule file exists
>   to protect.
>
> **This section swept for a SHAPE ("pure source-text grep, no module imported") and issued a verdict on
> it.** That is `gate-authoring.md` rule 13, added the same day: *a sweep finds the shape you named; a
> property guard finds the property.* A weak grep that is the last thing watching a property is a
> **CONVERT**, never a DELETE — the grep is bad evidence for a claim that still needs some.
>
> **Procedure before touching any row here:** grep the filename across `.claude/`, `.agent/`, `docs/`,
> `frontend/src/` and `frontend/tests/` excluding itself. If anything cites it as the guard for a
> property, it is a CONVERT. If nothing does, and the property is genuinely covered elsewhere, it is a
> DELETE — and say WHERE it is covered in the deleting commit, so the next reader can check the claim.
>
> This is the fourth verdict in this enumeration found false on contact (after a fabricated
> `game/damageSource.js` path, advice to commit absolute symlinks into a public repo, and a file census
> short by 92). **Treat the candidate list as reliable and every verdict as a hypothesis.**



| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/gates/biome-ambience-gates.test.js` | Biome-ambience gate (interleave) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/biome-flora-gates.test.js` | Biome-flora wiring gate (Phase B M1) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/biome-foliage-gates.test.js` | Biome foliage gate (World-M4a) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/block-debris-gates.test.js` | block-break debris — rapier 2.2 InstancedRigidBodies API | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/boss-melee-spark-gates.test.js` | M6 #3 boss-melee sparks (verb-consistency with the mob path) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/death-fx-gates.test.js` | W2-T5 death FX wiring | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/fade-in-keyframe-gates.test.js` | M6 #6 animate-fade-in keyframe defined (was a silent no-op) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/heartbeat-stable-interval-gates.test.js` | HeartbeatAudio — interval re-arms only on the danger bucket change | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/heightat-single-source.test.js` | heightAt single-source (anti-drift gate) | 2 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/hud-stat-wire-gates.test.js` | HUD stat-bar wiring — context-key integrity | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/landmarks-gates.test.js` | Landmark gate (World-M6) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/locomotion-audio-gates.test.js` | Locomotion audio gate (interleave) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/look-sensitivity-gate.test.js` | look-sensitivity wires mouse + touch + settings | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/mob-aggro-audio-gate.test.js` | mob aggro-snarl audio is wired (enemy-presence cue) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/modal-static-gates.test.js` | #52 S1 modals use the shared Modal primitive | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/nametags-gates.test.js` | nametags gates | 3 | — | spec-anchor | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/npc-routine-gates.test.js` | npc ambient routine wiring | 3 | — | spec-anchor | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/ocean-depth-tint-gates.test.js` | Ocean voxel-water render path is retired (W2-T2) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/ocean-mesher-no-water-faces.test.js` | W2-T2 mesher no longer emits water faces (Ocean.jsx owns water) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/proc-music-mute-gates.test.js` | proc-music mute lock (PROC_MUSIC_GAIN) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/radial-minimap-gates.test.js` | radial-minimap gates | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/spell-cast-level-wire-gates.test.js` | #51 S1 cast-wire (gameplay cast reads leveled damage) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/title-screen-brand-gates.test.js` | W2-T3 title screen is the cinematic 3D vista on bold-flat tokens | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |
| `tests/gates/wand-economy-gates.test.js` | B7 wand-economy wiring (the wand is consumed at cast) | 3 | — | example | pure source-text grep, no module imported: a comment naming the symbol satisfies it |

### A · CONVERT (51)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/gates/allegiance-gates.test.js` | allegiance gates (S2-B3-M3) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/archer-kite-steer-gates.test.js` | archer kite — Step-3 steers toward the tactical target (worker inline-mirror sync) | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/aspect-sfx-gates.test.js` | Aspect SFX wiring gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/atmosphere-isolation-gates.test.js` | S1-D-M3 studio-fixture mote isolation | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/audio-resume-gates.test.js` | SFX Slice 3 — audio resumes on the entry gesture, independent of music | 3 | — | invariant | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/beast-noremesh-gates.test.js` | beast-form no-re-mesh gate | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/biome-table-gates.test.js` | Biome table gate (World-M3) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/blight-marker-gates.test.js` | S9b Blight Heart compass marker | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/boot-chrome-gate.test.js` | boot chrome (index.html shipped <head>) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/boss-lair-gates.test.js` | S9b.2 boss relocated to the Blight Heart lair | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/bundle-split-gates.test.js` | M6 #20 bundle code-split (manualChunks vendor split, zero-stutter preserved) | 2 | — | spec-anchor | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/camera-kick-gate.test.js` | camera-kick profiles are all dispatched (game-feel) | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/chrome-brand-conformance-gates.test.js` | W2 chrome brand conformance — App.jsx + MenuSystem.jsx free of removed off-brand patterns | 3 | in-file | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/danger-bridge-gates.test.js` | boss → obsidian dangerLevel bridge | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/daynight-audio-gates.test.js` | day/night transition audio is wired | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/daynight-clock-gates.test.js` | day/night clock pause + determinism contract (static gate) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/dynamic-light-gates.test.js` | dynamic-light gate | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/elemancer-noremesh-gates.test.js` | elemancer no-re-mesh gate | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/equipment-dry-gates.test.js` | equipment DRY gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/hands-render-gates.test.js` | W2-T6 stylized FPV hands (character render language) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/home-anchor-gates.test.js` | Home Anchor (the Hearth) gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/hub-render-gates.test.js` | hub render gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/hud-declutter-gates.test.js` | hud declutter gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/input-abstraction-gates.test.js` | S2-A-M1 input-intent abstraction boundary | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/kill-attribution-gates.test.js` | kill-attribution gates (S2-B3-M1) | 3 | — | invariant | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/loot-juice-gates.test.js` | loot drop-beam (rarity-legible) wiring | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/m1-bugfix-gates.test.js` | M1 bug cluster | 2 | — | spec-anchor | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/master-bus-gates.test.js` | SFX Slice 2 — the whole mix routes through the master bus | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/music-gates.test.js` | music overhaul | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/npc-spawn-gates.test.js` | npc spawn + AI-skip gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/ocean-coastline-gates.test.js` | Ocean + coastline gates (World-M2) | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/place-puff-gates.test.js` | block-place puff is wired | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/progression-source-gates.test.js` | progression single-source gates | 2 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/quest-persistence-gates.test.js` | quest persistence wiring gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/reward-audio-gates.test.js` | reward-beat audio is wired | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/save-consolidation-gates.test.js` | save consolidation gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/shrine-chest-gates.test.js` | S8c-bis Slice 1 — a reward chest spawns at each shrine | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/shrine-marker-gates.test.js` | S8b nearest-shrine compass marker | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/siege-gates.test.js` | night siege state (single dangerLevel authority) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/spatial-sfx-bus-gates.test.js` | W1 — spatial SFX route through the master bus | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/spawn-legibility-gates.test.js` | spawn legibility gates | 3 | — | spec-anchor | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/static-gates.test.js` | static gates | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/terrain-quest-callback-gates.test.js` | M6 block place/break advance quests + achievements (dead-wire fix) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/touch-purity-gates.test.js` | touchMath.js purity (M0 contract — node-testable, no framework) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/touch-wiring-gates.test.js` | touch wiring gates (M1) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/trauma-wired-gates.test.js` | M1 trauma core is wired | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/ui-sounds-gate.test.js` | UI panel-open/close foley is wired | 3 | — | coupling | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/verb-router-gates.test.js` | verb-router seam gates (#72) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/vfx-extraction-gates.test.js` | S3-M3: the leaf VFX renderers extracted to render/ | 3 | — | spec-anchor | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/voidhand-noremesh-gates.test.js` | voidhand no-re-mesh gate | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |
| `tests/gates/weather-density-gate.test.js` | weather density (mount-time bug regression gate) | 3 | — | example | reads the module as TEXT while the module is importable — drive it instead |

### A · ENHANCE (56)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/gates/ability-bar-gates.test.js` | ability-bar cooldown mirror wiring | 2 | in-file | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/ally-eyes-gate.test.js` | W1 — hostile eyes, as a truth table rather than a token search | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/arcane-pierce-gates.test.jsx` | B8 nearestDamageable — excludeIds skips already-hit mobs | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/aspect-trees-gates.test.js` | aspect-trees panel gates | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/attack-telegraph-gates.test.js` | attack-telegraph gates (M2 #4) | 3 | — | invariant | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/blight-monolith-gates.test.js` | blight-heart monolith gates (M4 #8) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/block-id-gates.test.js` | R4a — block id round-trip (the hotbar must not lie) | 2 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/boss-killblock-gates.test.jsx` | B2h applyBossDamage — the pure updater | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/character-render-gates.test.js` | M2b static gates | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/coin-sink-gates.test.js` | spendCoins store action | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/combat-keybind-gates.test.js` | the express bindings route the right verb | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/combat-log-gates.test.js` | combat log — the ring buffer, driven rather than grepped | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/compass-hearth-gates.test.js` | bearingToMarker (pure compass math) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/crafting-grid-escrow-gates.test.jsx` | B3d crafting-grid escrow — closing the panel must not destroy what is in the grid | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/crafting-recipe-match-gates.test.jsx` | B3a crafting matcher — the sword tree exists again | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/crystal-wallet-gates.test.jsx` | B3b crystalWallet — the canonical accessor reads the rendered bucket | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/death-beats-gates.test.js` | death-weight dissolve gates (M2 #7 S1) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/dusk-warning-gates.test.js` | day-phase math (pure) | 1 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/element-impact-gates.test.js` | M5 element-at-impact gates | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/error-boundary-gates.test.js` | the crash screen appears when something crashes | 3 | — | coupling | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/eslint-crash-class.test.js` | eslint crash-class gate (no-undef + react/jsx-no-undef across src/) | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/fireball-range-gates.test.js` | B8 fireball range — the default spell hits at range | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/friend-foe-gates.test.jsx` | B1 friend/foe — the hub questgivers are not target practice | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/grass-revival-gates.test.js` | grass revival 1a -- worker emits grass-tops | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/loot-coverage-gates.test.js` | loot-coverage gate: every hostile mob drops something real | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/mob-los-sync-gates.test.js` | mob LOS — off-grid endpoints are clamped | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/modal-a11y.test.jsx` | #52 Modal primitive (a11y + focus) | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/night-ratchet-gates.test.jsx` | B2f night-ratchet — the siege advances only on a real clock crossing, never on a load | 1 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/objective-tracker-gates.test.js` | spawn-direction ObjectiveTracker | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/ore-drop-gates.test.js` | S6 Slice 3 — mined ore drops its (craftable) item | 2 | in-file | invariant | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/perf-config-gates.test.js` | S2-A-M4a T1: renderDistance tier lever is WIRED | 1 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/pilgrim-quest-gates.test.js` | S8c pilgrim quest (reach a shrine) | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/quest-kill-match-gates.test.jsx` | B6 questMatches — the pure predicate | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/quest-log-gates.test.js` | the quest log DISPLAYS the narrative fields it exists for | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/quest-lore-gates.test.js` | quest lore wiring | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/quest-multiclaim-gates.test.jsx` | R1 — quest multi-claim (one Q press, two completed quests) | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/quest-tracker-touch.test.jsx` | QuestTracker — touch HUD declutter | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/recipes-gates.test.js` | the crafting recipe set | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/repeatable-quest-gates.test.js` | makeRepeatableQuest (pure end-game bounty) | 3 | — | invariant | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/save-slot-ownership-gates.test.js` | B2a save-slot ownership — an autosave may not overwrite a world it never opened | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/settings-a11y-gates.test.js` | settings a11y gates (M3 #3 S1 -- feedback-intensity slider) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/siege-warning-gates.test.js` | siegeWarning (pure) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/spell-color-unify-gates.test.js` | B2 spell-color unify — one token set (theme/tokens MAGIC is the SoT) | 2 | — | coupling | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/spell-mastery-load-gates.test.jsx` | B2e spell mastery survives a load | 2 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/spell-mastery-ui-gates.test.js` | #51 S2 — the Spell Mastery section is real and reachable | 2 | — | coupling | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/spell-motion-gates.test.js` | spell motion-grammar wiring (v7-S3.1) | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/spell-shape-gates.test.js` | W2-T4 spellVfx renders distinct per-element geometry | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/spell-vfx-gates.test.js` | S1-D-M1 spell-VFX spine | 1 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/survival-quests-gates.test.js` | survival-progression quests | 2 | — | example | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/target-frame-gates.test.js` | target-frame gates | 2 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/touch-dodge-gates.test.js` | touch dodge — driven, not grepped (M3 #6 S4) | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/touch-entry-gate.test.js` | the title screen offers a way in at all | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/touch-tray-gate.test.js` | touch tray openers drive the real store | 2 | — | coupling | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/touch-xp-readout.test.jsx` | SimpleExperienceBarTouch — compact touch level/XP readout | 3 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |
| `tests/gates/trade-fresh-prev-gates.test.js` | block trade computes from prev, and prev alone | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/gates/victory-audio-gate.test.js` | the victory climax actually fires its sting | 2 | — | coupling | hybrid: real behaviour present, but source-text assertions still carry part of the verdict |

### A · KEEP (50)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/gates/achievement-double-unlock-gates.test.jsx` | achievements unlock exactly once per batch | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/artifact-currency-gates.test.js` | artifact-currency threshold | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/aspect-hint-gate.test.jsx` | just-in-time Aspect-unlock hint — behaviour, not source text | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/aspect-ring-gates.test.jsx` | X1 — the Aspect ring makes the four verbs reachable on touch | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/attack-windup-bank-gates.test.js` | B4b — a windup cannot be banked across de-aggro | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/baseline-trailer-gates.test.js` | baseline-trailer: rewriting the visual oracle requires a stated reason | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/gates/beast-reveal-camera-gates.test.js` | beast reveal camera — the shot must contain the beast | 1 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/boss-entrance-gates.test.jsx` | E4 — arriving at the lair lands a beat, not just a toast | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/boss-persistence-gates.test.js` | B2g — the boss fight survives a reload | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/boss-persistence-hook-gates.test.jsx` | B2g — the hook is seeded from the RESTORED store, not from the config | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/build-footprint-gates.test.js` | buildFootprint — shape | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/capture-clock-gates.test.js` | captureClock — time as a function of FRAME INDEX, not wall time | 1 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/capture-dpr-gates.test.jsx` | capture determinism: the title diorama pins dpr under capture | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/capture-glow-gates.test.jsx` | CaptureNullGlow — visibility tracks the flag, not the last render | 3 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/capture-guard-timing-gates.test.jsx` | DuskWarning — the guard must be inside the interval, not at setup | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/capture-phase-reset-gates.test.jsx` | capture determinism: the mascot idle RESETS to its declared pose | 3 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/capture-rest-gates.test.js` | bossCaptureReset — the dragon holds a DECLARED pose, not the one it happened to reach | 3 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/chest-transfer-a11y.test.js` | chest transfer tiles are keyboard-operable | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/commit-msg-gate.test.js` | commit-msg gate — what owes a proof | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/coverage-zero-gates.test.js` | partitionCoverage — and proof it can distinguish the two answers | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/death-deferral-gates.test.jsx` | a kill DEFERS removal behind the dissolve | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/detile-parity-gates.test.js` | de-tile — the JS and the GLSL are the same formula | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/diff-density-gates.test.js` | maxWindowDensity — localised change, and proof it can see it | 3 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/flaky-report-gates.test.js` | summarizeFlaky | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/free-placement-gates.test.js` | B3c resolvePlacement — the pure rule | 2 | in-file | example | behavioural with a stated killability receipt |
| `tests/gates/gear-compare-gates.test.jsx` | gearStatRows — the comparison is over the UNION of both stat sets | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/height-fog-instancing-gates.test.js` | height fog — the world Y of an INSTANCE | 3 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/hud-hotbar-gates.test.jsx` | the HUD slice exposes every handler the HUD calls | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/hud-slice-reachability.test.jsx` | selectHudState — every key a mounted component gates on must be IN the slice | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/hurt-feel-gates.test.js` | E-ter — an incoming hit freezes, graded by what it cost | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/initial-chest-once-gates.test.jsx` | the initial chest spawns ONCE per session, not once per empty board | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/inventory-flat-bucket-gates.test.js` | M5 #15 — every acquisition path lands in the RENDERED bucket | 2 | in-file | invariant | behavioural with a stated killability receipt |
| `tests/gates/level-achievement-gates.test.jsx` | B6c — the level achievements can actually unlock | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/mesher-geometry-gates.test.js` | greedy mesher — geometry contract | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/mob-archetype-gates.test.js` | E3 — the leash is per-type: who keeps coming, and who gives up | 3 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/mob-bank-coverage.test.js` | every mob type banks a declared amount — no silent fallback | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/mob-flash-restore-gates.test.js` | rememberAuthoredColor / restoreAuthoredColor — per-material, not per-group | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/mob-senses-gates.test.js` | B4 — height is real cover, driven through the actual worker | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/new-world-reset-gates.test.js` | startNewWorld resets quest progress; loadWorldData still tolerates old saves | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/prod-smoke-gates.test.js` | prod-smoke: the noise filter keeps its teeth | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/quest-rewards-gates.test.jsx` | B4 quest rewards — the full bundle actually LANDS (behavioral) | 2 | in-file | example | behavioural with a stated killability receipt |
| `tests/gates/quest-stats-guard-gates.test.js` | _statsOr — coerce the FIELDS, not just the container | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/recipe-output-gates.test.js` | recipes — every output is an item the game can actually deliver | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/recipe-output-usable.test.js` | every recipe output resolves to something the game can actually use | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/runtime-reach-gates.test.js` | urlToSrcPath — map a dev-server URL back to a repo path | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/scene-space-gates.test.js` | isWorldSpaceParent — is this parent actually at the world origin, unrotated and unscaled? | 3 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/gates/subject-on-screen-gates.test.js` | subjectVerdict — a capture may not write a picture of the wrong thing | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/gates/text-contrast-gates.test.js` | WCAG contrast — the arithmetic | 2 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/gates/touch-panel-focus-gates.test.jsx` | touch focus gate — a world-opened panel must stop look-drag routing | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `tests/gates/visual-denominator-gates.test.js` | visual gate: the denominator is asserted, not assumed | 2 | trailer | coupling | behavioural with a stated killability receipt |

## B. `frontend/tests/scripts/` — 18 files

### B · ENHANCE (1)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/scripts/measure.test.js` | measure — the size authority | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |

### B · KEEP (17)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/scripts/boot-start-play-active.test.js` | startPlayActive | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/capture-preflight.test.js` | capture preflight — browser frame production | 2 | in-file | example | behavioural with a stated killability receipt |
| `tests/scripts/cli-guard.test.js` | cli-guard — flags an exporting script that runs on import | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/density-ledger-measured.test.js` | the density ledger knows how much of itself is unmeasured | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/density-ratchet.test.js` | local-density ratchet — a measurement that reaches a verdict | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/doc-anchors.test.js` | sectionIds — what a document actually defines | 3 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/freeze-density.test.js` | freeze-density, driven end to end | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/gate-ratchet.test.js` | gate-shape ratchet — the frozen population must be the live one | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/mutation-proof-trailer.test.js` | mutation-proof trailer — scope | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/node-runtime-declared.test.js` | the required node runtime is declared, and agrees with CI | 2 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/probe-honesty.test.js` | tapVerdict — a tap is only honest if it can REACH the thing it names | 2 | trailer | invariant | behavioural with a stated killability receipt |
| `tests/scripts/probe-ports.test.js` | probe ports are allocated centrally, one per probe | 2 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/queue-ledger.test.js` | queue-ledger — marker classification | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/social-preview.test.js` | social preview tags point at something a scraper can actually render | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/supply-chain.test.js` | the supply chain is scanned at all | 2 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/scripts/text-inverse-usage.test.js` | the inverse token is not applied outside a gold fill | 3 | trailer | example | behavioural with a stated killability receipt |
| `tests/scripts/vite-console-drop.test.js` | the vite config drops console in production only | 2 | trailer | example | behavioural with a stated killability receipt |

## C. `frontend/tests/e2e/` — 20 files

*Every file here is tier 0 by scope — a real Chromium, the real bundle. The question for this group is
not scope but ACCEPTANCE: where did the criterion come from. Marked `example` below means the expected
value was read off the implementation.*

### C · ENHANCE (15)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/e2e/beast-form.spec.js` | beast-form: a valid element transforms, and exit clears it (no-permanent-beast invariant) | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/day-night-cycle.spec.js` | day/night: crossing a half-cycle boundary flips isDay (both directions, no false flip) | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/equip-roundtrip.spec.js` | equip -> swap -> unequip conserves items (displaced gear returns to inventory) | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/equipment-stats.spec.js` | equipping armor raises the effective armor stat by the item value | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/gameplay-flow.spec.js` | XP grant levels the player up (and full-heals, per the documented design) | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/hud-layout.spec.js` | B5 — the HUD health/mana bars are visible and vertically stacked | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/hunger-starvation.spec.js` | hunger: consumeHunger drains and clamps at 0; feedPlayer refills and clamps at 100 | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/mana-economy.spec.js` | mana: useMana gates spends (afford -> deduct+true, over-budget -> reject+unchanged); restore cla | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/perf-siege.spec.js` | survives a sustained night-siege without freezing or throwing (perf probe B) | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/save-load.spec.js` | save -> reload restores progression, loot, coins, and the win-state | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/smoke.spec.js` | boots, renders a non-blank canvas, and enters play with no runtime errors | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/soft-death-protections.spec.js` | spawn protection: damage is ignored within the 5s window, then lands after it expires | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/tier-downgrade-reclaim.spec.js` | a high->low tier downgrade actually releases chunks | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/touch-controls.spec.js` | B7 — the touch joystick knob renders a visible fill + border | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `tests/e2e/world-rebuild-after-load.spec.js` | the world REBUILDS after Load — chunks come back and the ground is solid again | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |

### C · KEEP (5)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/e2e/build-placement.spec.js` | block placement | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/e2e/dodge-latch.spec.js` | dodge intent latch | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/e2e/height-fog-instancing.spec.js` | height fog reads each INSTANCE own world Y, on a real GPU | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/e2e/imbue-latch.spec.js` | elemancer imbue latch | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `tests/e2e/panel-overflow.spec.js` | B5 — the Progression panel header + close button are reachable | 0 | in-file | invariant | behavioural with a stated killability receipt |

## D. `frontend/scripts/ci/` — 21 files

### D · ENHANCE (4)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `scripts/ci/bundle-budget.mjs` | REAL bundle-byte budget gate. | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/ci/doc-currency.mjs` | DOC-CURRENCY LINT — mechanical enforcement that the docs still describe reality. | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/ci/gate-shape.mjs` | GATE-SHAPE LINT — mechanical proof that a "gate" is not decoration. | 1 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/ci/measure.mjs` | MEASURE — the single authority for every repo number a governing doc quotes. | 3 | — | example | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |

### D · KEEP (17)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `scripts/ci/_density-ratchet.mjs` | THE LOCAL-DENSITY RATCHET — turning a measurement that judged nothing into one that does. | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/_gate-ratchet.mjs` | The source-grep ratchet's comparison, as a pure function so it can be tested without running the | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/artifact-currency.mjs` | ARTIFACT CURRENCY — the published page the operator READS is a deliverable, and it has now gone | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/baseline-trailer.mjs` | BASELINE TRAILER — governance for the ORACLE, which had none. | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/cli-guard.mjs` | CLI-GUARD — a script that EXPORTS must not run its CLI when someone imports it. | 3 | trailer | example | behavioural with a stated killability receipt |
| `scripts/ci/commit-msg-gate.mjs` | COMMIT-MSG GATE — the same mutation-proof demand as pre-push, moved to where the message is stil | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/coverage-zero.mjs` | ZERO-COVERAGE REPORT — which src/ modules are executed by NO test at all. | 3 | trailer | example | behavioural with a stated killability receipt |
| `scripts/ci/doc-anchors.mjs` | doc-anchors.mjs — a cross-doc SECTION citation must point at a section that exists. | 3 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/flaky-report.mjs` | FLAKY-SPEC REPORT — which e2e specs needed a retry to pass. | 3 | trailer | invariant | behavioural with a stated killability receipt |
| `scripts/ci/gate-table.mjs` | GATE TABLE — generate the "what authorizes a push" table in .agent/AGENTS.md from the HOOK ITSEL | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/i18n-adoption.mjs` | i18n ADOPTION RATCHET. | 1 | in-file | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/i18n-dead-keys.mjs` | i18n-dead-keys.mjs — the COMMAND the next copy deletion is supposed to consume. | 2 | trailer | coupling | behavioural with a stated killability receipt |
| `scripts/ci/mutation-proof-trailer.mjs` | MUTATION-PROOF TRAILER — the enforcer for the rule this repo states three times and never checke | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/prod-smoke.mjs` | PROD SMOKE — load the artifact that actually ships. | 0 | trailer | invariant | behavioural with a stated killability receipt |
| `scripts/ci/queue-ledger.mjs` | QUEUE LEDGER — every finding in the queue-of-record carries its own marker, or the count is goin | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/read-order.mjs` | READ ORDER — one canonical orientation order, generated into all three surfaces that state it. | 1 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/ci/runtime-reach.mjs` | RUNTIME REACHABILITY — which src modules the RUNNING GAME executed during the E2E playthrough. | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |

## E. `frontend/scripts/visual/` — 29 probe files

*These assert nothing by design; they produce the pixels that group F asserts over. That is a correct
separation. The defect is that only `_probe.mjs` has an honesty gate (`tests/scripts/probe-honesty.test.js`),
so the other 27 can drive nothing and still write a plausible PNG.*

### E · ENHANCE (25)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `scripts/visual/_serve.mjs` | _serve.mjs — shared vite + browser lifecycle for the visual probe scripts (charter §6.4 hygiene) | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/visual/capture.mjs` | Spawns `vite dev`, drives the app to known states via window.__craftyTest | 0 | — | invariant | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/visual/dayphase-probe.mjs` | dayphase-probe.mjs — LOOK probe (M6 #10): the day-phase dial is capture-SUPPRESSED (returns null | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/death-probe.mjs` | LOOK probe (M2 #7 S2): force the rebuilt DeathScreen overlay + screenshot it. isAlive is a store | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/drive-elemancer.mjs` | One-shot judge driver for the elemancerShowcase card (M6 T4). Mirrors capture.mjs's | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/drive-mobs.mjs` | One-shot judge driver for the mobShowcase card (M6 T4). Mirrors capture.mjs's | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/esc-pause-probe.mjs` | esc-pause-probe.mjs (W1 Task 3) — LIVE-LOOK the ESC / boot / no-flash UX after deleting the lega | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/grass-probe.mjs` | LOOK probe (M4 #5): a GROUND-LEVEL capture over the spawn grass terrain to eyeball the revived | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/grass-swatch-probe.mjs` | S9 OWNER TASTE CALL — render the grass colour ladder for Kevin to pick from. | 0 | — | spec-anchor | no killability receipt anywhere (no Mutation-Proof trailer at add, no red-first note) |
| `scripts/visual/hands-probe.mjs` | hands-probe.mjs — drive the REAL game (non-capture) to first-person and screenshot the FPV HANDS | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/heldf-probe.mjs` | heldf-probe.mjs (W1 Task 10) — LIVE behavioral probe for the KeyF triple-conflict resolution. | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/hub-probe.mjs` | hub-probe.mjs — drive the REAL game (non-capture) to the Hearth and screenshot the frontier-outp | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/hud-probe.mjs` | hud-probe.mjs — LIVE-LOOK at the W3 M-HUD.3 AbilityBar (bottom-center cooldown-sweep action bar) | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/look-e2e.mjs` | look-e2e.mjs — the GATE that was missing when desktop mouse-look silently died: a real-browser | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/magic-panel-probe.mjs` | magic-panel-probe.mjs (W1 Task 14) — LIVE-LOOK the M-key Magic panel after wiring the previously | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/mobdeath-probe.mjs` | mobdeath-probe.mjs -- W2-T5 LIVE-LOOK for the hue-preserving mob DEATH burst. | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/ocean-probe.mjs` | ocean-probe.mjs — clean (HUD-hidden) views of the OCEAN/COAST read for the ocean milestone. The | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/pov-probe.mjs` | pov-probe.mjs — drive the REAL game (non-capture) to the PLAYER'S EYE and screenshot what the pl | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/quest-log-probe.mjs` | quest-log-probe.mjs — LIVE-LOOK at the M-NARRATIVE.3 QuestLog panel (L). Capture-suppressed (a m | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/settings-probe.mjs` | LOOK probe (M3 #3): force the SettingsPanel open + screenshot it. showSettings is a store field  | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/soulbind-eyes-probe.mjs` | soulbind-eyes-probe.mjs (W1 Task 11) — LIVE-LOOK the bound-ally eye gate. Drives the DEV-only | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/spawn-legibility-probe.mjs` | spawn-legibility-probe.mjs — drive the REAL game (non-capture) to confirm the M-HUD.10 FarBeacon | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/spell-elements-probe.mjs` | spell-elements-probe.mjs — W2-T4 LIVE-LOOK for the per-element spell silhouettes. | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/storm-probe.mjs` | storm-probe.mjs — LIVE-LOOK (W4-T8): the storm sky-darken. The mood boost is store-driven (the | 0 | — | spec-anchor | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |
| `scripts/visual/touch-probe.mjs` | touch-probe.mjs — VERIFY-BEFORE-ASSERT the iPad/iPhone touch controls on a real touch viewport,  | 0 | — | invariant | capture probe — produces evidence, asserts nothing (correct by design; the assertion lives in F) |

### E · KEEP (4)

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `scripts/visual/_probe.mjs` | _probe.mjs — shared HONESTY primitives for the visual/interaction probes. | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/visual/freeze-density.mjs` | FREEZE THE LOCAL-DENSITY RATCHET from a real capture pair. | 0 | trailer | coupling | behavioural with a stated killability receipt |
| `scripts/visual/make-og-image.mjs` | make-og-image.mjs — build public/og-image.png, the social share card. | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |
| `scripts/visual/pause-resume-probe.mjs` | pause-resume-probe.mjs — LIVED proof for Kevin's 2026-08-05 report: "press ESC to bring up the | 0 | trailer | spec-anchor | behavioural with a stated killability receipt |

## F. `frontend/tests/visual/` — the diff gate + density ratchet

| file | claims | tier | receipt | target | reason |
|---|---|:-:|:-:|:-:|---|
| `tests/visual/diff.test.js` | visual capture freshness (item #12 fail-loud) | 0 | in-file | coupling | behavioural with a stated killability receipt |

**F is the best-shaped check in the repo.** It carries, in one file: a real zero-guard that EXITS
(`expect(density.length).toBe(STATES.length)`), a `missing` guard for frames that leave the corpus, an
`unfrozen` guard for frames that enter it, provenance attribution read off `baseline/.capture-meta.json`,
a two-pass consistency assert (`expect(again).toBe(diff)` — the artifact must describe the number that
failed), a documented fail-open choice for renderer drift, and an in-file record of the mutation that
caught its own inverted ratchet direction. Its remaining weakness is the one listed under R3a: the
population `STATES` is guarded in a different file, and nothing in `diff.test.js` says so.


## G. `frontend/src/**/*.test.js(x)` — 135 colocated tests, aggregated by directory

| directory | files | receipt | tier 0-1 | tier 3 | invariant | example | verdicts |
|---|---:|---:|---:|---:|---:|---:|---|
| `src/game` | 83 | 11 | 4 | 72 | 28 | 49 | ENHANCE 72 · KEEP 11 |
| `src/input` | 10 | 3 | 0 | 7 | 1 | 8 | ENHANCE 7 · KEEP 3 |
| `src/world` | 10 | 3 | 0 | 9 | 1 | 6 | ENHANCE 7 · KEEP 3 |
| `src/audio` | 6 | 1 | 0 | 5 | 2 | 3 | ENHANCE 5 · KEEP 1 |
| `src/devtest` | 6 | 1 | 0 | 6 | 0 | 5 | ENHANCE 5 · KEEP 1 |
| `src/render` | 6 | 3 | 1 | 5 | 2 | 4 | KEEP 3 · ENHANCE 3 |
| `src/combat` | 5 | 2 | 0 | 4 | 0 | 5 | ENHANCE 3 · KEEP 2 |
| `src/i18n` | 2 | 2 | 0 | 1 | 0 | 0 | KEEP 2 |
| `src/systems` | 2 | 1 | 0 | 2 | 0 | 2 | KEEP 1 · ENHANCE 1 |
| `src/ui` | 2 | 0 | 0 | 2 | 1 | 1 | ENHANCE 2 |
| `src/utils` | 2 | 0 | 0 | 2 | 0 | 2 | ENHANCE 2 |
| `src` | 1 | 1 | 0 | 1 | 0 | 1 | KEEP 1 |

**Denominator: 135 files.** 28 carry a receipt.
`src/game` alone is 83 files — 61% of the group and 21% of the entire suite —
and it is where the cheapest tier grows fastest.

The 28 receipted files here are the good ones and they cluster: `src/input` (touch/pointer), `src/game`
(quest claim, settings persist, world saves, loot juice, day phase), `src/i18n` (key reachability),
`src/world` (cave CA, ocean visibility, dawn survival). Every one of them was written against a defect
that had already shipped, which is why it has a receipt.

---

*Generated by a read-only pass over 405 files: source scan, `git log` over 1,857 commits for trailer
attribution, and one `node scripts/ci/gate-shape.mjs` run. No file in the repo was modified.*

