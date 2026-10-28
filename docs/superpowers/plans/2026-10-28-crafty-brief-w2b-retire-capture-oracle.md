# Brief: W2-B, retire the capture oracle (2026-10-28)

**Plan:** `2026-10-28-crafty-sota-reset.md`, row 4 and lane W2-B (Wave 2). **Decision:** DECISIONS 2026-10-28 (W1-H)
item 1. **Status:** unstarted. Starts after the light and colour lane (#5) lands, because that lane still edits the
capture states it is told to drop. **Owner:** the command session.

## What the player gets

Nothing visible, and that is the point. The 31 SwiftShader frames under `frontend/tests/visual/baseline/` stop being the
look oracle, so every later look change is judged on the eye-level lookbook (W1-D), which shows what a player sees: hands,
HUD, weather, mobs, motion. About 131 `isCaptureMode()` calls in `frontend/src` (measured 2026-10-28,
`rg -c "isCaptureMode\(" src`) stop being needed for new work and leave shipped code over time.

## Scope

**Delete:** `scripts/visual/capture.mjs`; the `visual:capture`, `visual:baseline` and `test:visual` npm scripts and
`vitest.visual.config.js`; `tests/visual/diff.test.js`; the density ratchet (`scripts/ci/_density-ratchet.mjs`,
`scripts/visual/freeze-density.mjs`, `tests/visual/.density-ledger.json` and their tests); `scripts/ci/baseline-trailer.mjs`
with its pipeline step, gate-table row and tests; `tests/gates/visual-denominator-gates.test.js`; every baseline PNG
except `menu.png`.

**Keep:** `tests/visual/baseline/menu.png`, until W2-H's media pipeline replaces the og-image source
(`scripts/visual/make-og-image.mjs:34`, `tests/scripts/social-preview.test.js:6`). Capture mode itself stays as a test
tool: e2e specs use `enterCapture` to freeze the world for a deterministic read. Only assertions ABOUT capture output go.

**Not in scope:** removing `isCaptureMode()` branches from `src/` (each goes when its subject moves, plan row 48);
the probes under `scripts/visual/` (plan row 39 deletes the stale ones with puppeteer).

## Files it owns

`frontend/scripts/visual/capture.mjs`, `freeze-density.mjs`, `frontend/scripts/ci/baseline-trailer.mjs`,
`_density-ratchet.mjs`, `frontend/tests/visual/**`, `frontend/vitest.visual.config.js`, the `test:visual` family in
`frontend/package.json`, the baseline-trailer step in `ci/pipeline.sh` (a one-line removal, coordinated with whoever
holds `ci/*` then), and the gate tables the generators write into `CLAUDE.md`.

## Acceptance

- `rg -l "capture\.mjs|baseline-trailer|density-ratchet|freeze-density" frontend ci .githooks .github` returns only
  `make-og-image.mjs` (the kept `menu.png` path) or nothing.
- The pipeline, `npm run test:unit`, `npm run build`, `doc-currency` and knip are green; the generated gate table in
  `CLAUDE.md` has one row fewer and `doc-currency` agrees.
- **Live:** nothing changes on https://crafty-game.vercel.app. Every look PR after this one attaches lookbook before and
  after frames; the PR template or the lane briefs say so.
- Each deleted gate's failure history was read first (`gh run list` plus `git log -S` on its name) and the commit says
  what it last caught (plan row 35's rule).

## One-way doors

None in the game. The baselines are git history and come back with `git show`. The og-image source is the one live
dependency, which is why `menu.png` stays.

## Registry rows this lane closes

None of its own. The oracle rows (QUEUE Q09-Q11, Q16, Q37-Q40, OI-09 to OI-13, OI-18, OI-27, OI-28, ACTIVE_PLAN T10,
MASTERPIECE 0e) were closed as cancelled by the decision itself. The taste sign-offs (`OPEN_ITEMS:OI-68/a`, the v7
spell look; `/b`, the D art pass) stay open: after this lane they are judged on lookbook frames, and this lane takes
none of those frames.

---

## Task script

Run from `frontend/` unless a path says otherwise. Re-verify every file:line at lane start; other lanes move code.

### Task 0: Inventory and failure history (no code change)

- [ ] `rg -l "capture\.mjs|visual:capture|visual:baseline|test:visual|baseline-trailer|density-ratchet|freeze-density|visual-denominator|\.density-ledger" . ../ci ../.githooks ../.github ../CLAUDE.md`
      and save the list to the lane's scratch directory. Every hit is either deleted below or edited below; none is left.
- [ ] For `baseline-trailer` and `visual-denominator-gates`: `gh run list --workflow=ci.yml --limit 200 --json conclusion,headSha`
      plus `git log --format='%h %s' -S'baseline-trailer'`. Record in the commit body what each gate last caught.
- [ ] List the e2e specs that read capture output rather than use capture as a freeze:
      `rg -n "baseline|capture\.png|VISUAL_STATES|visualStates" tests/e2e`. Those assertions go in Task 3.

### Task 1: The og-image source keeps working (red first)

- [ ] Extend `tests/scripts/social-preview.test.js` with one assertion that `make-og-image.mjs` resolves its source to an
      existing file. Run `npx vitest run tests/scripts/social-preview.test.js`: GREEN today.
- [ ] Mutant: rename `tests/visual/baseline/menu.png` aside (`mv`, then `mv` back). The test must go RED. Record it as
      a `Mutation-Proof:` trailer line.
- [ ] Commit: `test(social): the og-image source is checked to exist before the baselines go`.

### Task 2: Delete the harness

- [ ] Delete `scripts/visual/capture.mjs`, `scripts/visual/freeze-density.mjs`, `scripts/ci/_density-ratchet.mjs`,
      `vitest.visual.config.js`, `tests/visual/diff.test.js`, `tests/visual/.density-ledger.json`,
      `tests/visual/baseline/.capture-meta.json` and every PNG in `tests/visual/baseline/` except `menu.png`.
- [ ] Delete the tests that only test those files (`tests/scripts/density-ledger-measured.test.js`,
      `tests/scripts/density-ratchet.test.js`, `tests/scripts/freeze-density.test.js`, `tests/scripts/capture-preflight.test.js`,
      `tests/gates/visual-denominator-gates.test.js`). Open each first: a test that also checks something still shipped
      keeps that part, moved.
- [ ] Remove the `visual:capture`, `visual:baseline` and `test:visual` scripts from `package.json`, and the
      `'capture.mjs': 4178` entry from the port table in `scripts/visual/_serve.mjs` (`tests/scripts/probe-ports.test.js`
      checks that table against the files). `assertBrowserProducesFrames` lives in `capture.mjs`; if the lookbook needs a
      preflight, move it to `_serve.mjs` with its test rather than deleting it.
- [ ] `npm run lint && npm run test:unit && npx knip`: green. knip names any helper the deletion orphaned
      (`scripts/visual/_serve.mjs` ports, `_probe.mjs` helpers); delete or keep each with its remaining caller named.
- [ ] Commit: `chore(visual): retire the capture oracle; looks are accepted on eye-level lookbook frames (DECISIONS W1-H 1)`.

### Task 3: The trailer gate and the e2e assertions

- [ ] Delete `scripts/ci/baseline-trailer.mjs`, `tests/gates/baseline-trailer-gates.test.js`, its step in
      `ci/pipeline.sh`, and its description in `scripts/ci/gate-table.mjs` `DESCRIPTIONS`. Regenerate:
      `node scripts/ci/gate-table.mjs --write`.
- [ ] Remove the capture-output assertions found in Task 0 from their e2e specs; keep every other assertion in those
      specs. Run the touched specs in CI (a `land/` branch push), not locally.
- [ ] `node scripts/ci/doc-currency.mjs` and the full pipeline: green.
- [ ] Commit with a `Mutation-Proof:` trailer for the pipeline change: show that a pipeline still calling the deleted
      script fails (`bash ../ci/pipeline.sh` with the step restored and the script absent), then restore.

### Task 4: Docs that name the oracle

- [ ] `CLAUDE.md` "visual" rows and the capture-determinism bullets: replace with one line naming the lookbook as the
      look acceptance surface. If W2-J (row 29) holds `CLAUDE.md`, hand it the text instead.
- [ ] `.claude/rules/gates-and-probes.md`: drop the capture-specific rows that no longer apply.
- [ ] Commit: `docs(visual): the lookbook is the look acceptance surface`.

### Task 5: Land

- [ ] Merge into `land/<date>`, push, wait for `ci ok` on that exact sha, fast-forward main, push.
- [ ] Live check: https://crafty-game.vercel.app boots (prod-smoke covers it); nothing visible changed.
