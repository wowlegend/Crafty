---
paths:
  - "frontend/tests/**"
  - "frontend/scripts/**"
  - "frontend/src/**/*.test.js"
  - "frontend/src/**/*.test.jsx"
---
# Writing a gate, test, or probe in Crafty

This fires because you are editing a thing whose whole job is to GO RED. `CLAUDE.md` "Invariants" states the
rule in one line (read a gate's denominator, not its tick); the rule is read at orientation, and the mistake happens
here, forty tool calls later, so the full version lives here, where it fires at the moment you can act on it. The
generated table of every gate and where it runs is at the end of this file.

## The one defect this project keeps shipping

**A thing that reports PASS/DONE over input it never examined.** Every instance:

| what reported success | what it never examined |
|---|---|
| `gate-shape` — 97 assertions | 42% of the gate corpus, skipped (re-measured 2026-08-13: **388** assertions, **106** source-grep gates of **181** files) |
| `doc-currency` — "✓ PASSED" | every bare, non-backticked path |
| a test placed in `tests/visual/` | itself — vitest excluded that dir until 2026-10-28, so it never ran |
| `quest-rewards-gates` | the save-corrupting bug it stayed green through |
| `esc-pause-probe` | the second ESC press, where the bug lived |
| `tapTestId` | whether the tap landed on the element it named |
| the `setActive` structural gate | satisfiable by the COMMENT explaining the import |
| a source gate asserting `for (const dir of sources)` | the SECOND occurrence of that pattern (an existence pre-check) — it stayed green under the exact mutation it named |
| a WCAG contrast gate's reference values | all achromatic (black/white/grey) — a mutation replacing the luminance coefficients with a plain average stayed GREEN |
| a `text-text-inverse` usage scan | two of the three ways a gold background is declared here, reporting four false positives on correct code |
| `dodge-latch`, green for two years | a world. `startPlay`'s swallowed wait meant it ran BEFORE terrain existed, so the 20 mobs gated on the same flag never spawned and nothing could kill the player — the green measured the absence of the game (2026-08-13) |
| the CI e2e job's `upload-artifact` | every failure it was meant to preserve — the path was `playwright-report/`, which no configured reporter creates, so three `trace.zip` files per red run were written to `test-results/` and discarded (2026-08-13) |

Read the count, never the tick.

## The second defect: shipped, compiling, gated green, and never RUNNING

Distinct from the one above — there the instrument was blind; here the instrument was fine and the FEATURE
was never reached. Four in a single day (2026-08-05), caught by nothing:

| commit | what shipped green | what was actually true |
|---|---|---|
| `fddf7d4` | two achievements | nothing ever called `updateLevel` — dead on arrival |
| `34f11b0` | mob grass-bending | never worked; 81 chunks were driving it |
| `869f71e` | the grass mote layer | rendered at the world ORIGIN, not with its chunk |
| `8a5e008` | quest-log + claim keybinds | live, and advertised NOWHERE in the UI |

`knip` sees the export used. A source-grep gate sees the line exist. `npm run build` sees it compile. None of
them sees whether the thing RUNS in the game.

**So: prove the entry point is REACHED in the running app — a real-input E2E, a live probe, or a log line you
watched fire — not that the call site compiles.** If you cannot reach it, that IS the finding. Ask what would
still pass if the feature were simply deleted; if the answer is "everything", you have not tested the feature.

## Before you commit a gate or probe

0. **The gate comes first.** When a feature falls in a gated class, extend or write its gate first and watch it go
   red on the current code, then build until it is green. A gate written after the build has only ever seen it pass.

1. **State the denominator, and assert it.** Print `N things checked` and fail when `N` is 0 or below the
   ratchet. A loop that silently enumerated nothing reports a clean pass. `expect(checked).toBe(<expected>)`
   is one line and it is the difference between a measurement and a decoration.

2. **Assert a PRESENCE before you assert an ABSENCE.** "The player did not move", "0 elements matched",
   "no error was thrown" mean nothing until the same instrument, in the same run, has shown it can see the
   positive case. Use `assertBaseline` from `scripts/visual/_probe.mjs`. A dead instrument and a real
   absence produce identical readings.

3. **MUTATION-PROVE IT.** Break the behaviour the gate guards; it must go RED. Restore from a `cp` backup —
   **never `git checkout <file>`**, which nukes untracked work and reverts tracked. A gate green on day one
   against unfixed code is a rubber stamp and the slice is void.

3b. **YOUR REFERENCE VALUES MUST VARY ALONG EVERY AXIS THE FORMULA WEIGHTS.** Citable anchors feel like the
   rigorous part of a gate, which is exactly why people stop thinking once they pass — but a reference set
   is a SAMPLE, and one drawn entirely from a degenerate point measures the sum of the weights and never
   their distribution. The WCAG contrast gate anchored on black, white and grey; all three are ACHROMATIC,
   so replacing the 0.2126/0.7152/0.0722 luminance coefficients with a plain channel average left every
   assertion GREEN. Fixed by adding pure primaries against white, which pin each coefficient individually
   (under an average, red-on-white reads 2.74:1 instead of 4.00:1). **Ask: what WRONG implementation
   produces these same numbers?** Squares cannot detect a transposed width/height either; same shape.

3c. **A DETECTOR THAT FALSE-POSITIVES GETS WIDENED, NOT EXEMPTED.** The `text-text-inverse` scan flagged
   four correct sites because gold is declared three ways here — a Tailwind class, an inline `--ui-accent`
   gradient, and on the PARENT element — and the first draft knew one. The fix is to teach the detector the
   other two, after checking every hit by hand. An exemption list is a place to hide real defects, and this
   file already records that shape under "the compound-row exemption names only codes a real row covers".

4. **Do not assert on a proxy.** Source text is not behaviour; an element existing is not an element being
   reachable; a dispatched event is not a received one. If the assertion can be satisfied by a comment, it
   is satisfied by a comment — anchor structural gates to the syntactic form, not a bare token.

4b. **COUNT YOUR PATTERN'S OCCURRENCES BEFORE TRUSTING IT, AND WHEN THE MUTATION STAYS GREEN, STOP
   TIGHTENING.** A source gate asserted a ledger-freezing script contains `for (const dir of sources)` to
   prove it reads every run directory. It passed — and kept passing when the read loop was mutated to
   `[sources[0]]`, because a SECOND loop over `sources` (an existence pre-check) matched. A text match
   cannot tell which occurrence is load-bearing, so a better regex answers the wrong question. **The fix
   is to make the SUBJECT DRIVABLE**: `--baseline=` / `--out=` seams let a test execute the tool on
   synthetic fixtures where the answer is known by construction, and the blind assertion was deleted
   rather than patched. Where executing really is too expensive, anchor to a **SLICE** bounded by unique
   landmarks (`cap.slice(stageStart, nextFinally)`), never to the whole file — a slice cannot match an
   unrelated site.

4c. **A PRODUCER/CONSUMER SPLIT HIDES AN UNTESTED PRODUCER.** A capture-freshness check was HANDED a
   `skipped` array, so its nine unit tests said nothing about whether the capture harness ever filled one —
   deleting `skippedGated.push(...)` left the entire suite green, inside the commit that added it. When
   a value crosses a seam, ask the two questions separately: what proves the consumer HANDLES it, and
   what proves the producer EMITS it. Only the first is usually written.

4d. **A SWALLOWED WAIT RELOCATES THE TEST INTO A DEGENERATE WORLD — that is its second cost, and the
   one nobody names.** The known cost of `.catch(() => {})` on a readiness wait is that a real
   precondition failure surfaces later, naming nothing: `_boot.js startPlay()` swallowed a 45s
   world-build wait, and `imbue-latch` died on CI as a flat 15s timeout three attempts running with
   only docs changed. The UNNAMED cost is that while the wait is being skipped, the code runs in a
   state where everything gated on that same flag is ABSENT. `SpawnerSystem.jsx:94` gates all 20
   hostile spawns on the very `isSpawnChunkLoaded` the wait was swallowing — so every spec using that
   helper ran in a world with no terrain and therefore no mobs. `dodge-latch` had been green on
   exactly that basis; making the wait strict moved it into a live world, mobs killed the player, and
   the input gate correctly refused the press. **The old green was measuring the absence of the game.**
   So when you remove a swallow, do not only ask what failure was hidden — **grep the flag for its
   OTHER consumers**, and treat every test that depended on the swallow as unproven until re-run.

4e. **ASSERT ON THE GATES ALONGSIDE THE SUBJECT.** `expect(dodge).toBe(true)` cannot distinguish a
   broken latch from a refused press. `Components.jsx:366` gates on `active` AND `isAlive`, so CI
   reported *"Shift no longer arms a dodge at all — the instrument is dead, or the verb is"* when the
   verb was fine and the player was dead. Read the subject WITH its preconditions and put them in the
   failure message; a one-line change turns an accusation into a diagnosis.

5. **When a probe substitutes an API for a real gesture, say what that changes.** `esc-pause-probe` used
   `document.exitPointerLock()` in place of the native ESC. Per MDN those two paths differ in exactly the
   respect the bug depended on, so the probe was structurally incapable of seeing it — while reporting PASS.

6. **Open the image.** A green jsdom suite passed a PAUSED overlay rendering dark-brown-on-black. Rendered
   output is judged by looking at it.

## Where things go

- **`tests/gates/**` — behavioural gates.** Adding one requires a `Mutation-Proof:` trailer
  (`scripts/ci/mutation-proof-trailer.mjs`). A gate here that calls `readFileSync` joins the frozen
  source-grep population (`tests/gates/.source-grep-ledger.json`, **106** as of 2026-08-13) which may FALL
  and never RISE — so a new source-reading gate sited here reds the commit and CI (`gate-shape`; the push no longer
  runs it).
- **`tests/scripts/**` — checks whose subject IS a file.** (`ls frontend/tests/scripts/*.test.js | wc -l`
  — the count is deliberately not written here; this line said "16" and the next edit typed "18" against
  an actual 17, in the file whose subject is numbers that rot): config, tooling and
  repo-shape checks that must read source or JSON by their nature (`supply-chain`, `probe-ports`,
  `node-runtime-declared`, `social-preview`, `vite-console-drop`, `text-inverse-usage`,
  `kill-test-procs`, …). Note `kill-test-procs.test.js` does NOT read the subject's source — it EXECUTES
  the script against fixture processes, which is why it lives here despite being a behavioural test. Siting a check here keeps it out of the frozen population — **say so in
  the file when you do it**, and never site something here merely to dodge the ratchet or the trailer.
  The test is whether the subject is BEHAVIOUR (gates/) or a FILE'S CONTENT (scripts/). Split when both:
  the WCAG work put the arithmetic in `tests/gates/` and the usage scan in `tests/scripts/`.

- `scripts/ci/*.mjs` counts as a GATE path too, with the same trailer requirement.
- **Prove heavy suites on CI, not here** (SSD order, Kevin 2026-10-28; `CLAUDE.md` "SSD-light lanes"). The push
  runs no unit suite or build, and CI runs everything on the exact sha. A mutation run needs only the spec it names
  (`scripts/dev/mutate.sh`); a throwaway copy for one is `cp -c -R` of the worktree with `frontend/node_modules`
  symlinked, never `git clone` + `npm ci`; a local e2e or lookbook run only for a look question that needs a real GPU,
  one at a time.
- **Check the compositor before planning browser work:** in the page, count `requestAnimationFrame` callbacks over
  about 3 s. A window that presents no frames makes every probe read as broken; expect to lose it mid-run, so do the
  browser work first while it is open. As of 2026-10-28 no helper does this for you (`_serve.mjs`, `_probe.mjs` and
  `lookbook.mjs` checked).
- Probes go in `scripts/visual/`, use `_serve.mjs` for the vite+browser lifecycle and `_probe.mjs` for
  honest taps and baselines. **Anything you launch, you kill** — close the browser in a `finally`, kill the
  vite process GROUP, then sweep `scripts/dev/kill-test-procs.sh`.
- Prefer Playwright's `webServer` config over a hand-started dev server — it owns its own lifecycle, so
  there is nothing to forget to kill. Hand-started means hand-killed, in the same turn.
- **Ports are ALLOCATED, not chosen.** `serveVite(probePort(import.meta.url))` — the frozen basename→port
  table lives in `scripts/visual/_serve.mjs`. Never write a literal; a probe that forgets to register gets
  an error naming its own file instead of a silent collision. This replaced hand-picked constants after
  FIFTEEN probes were found sharing six ports (4196 claimed by four of them), and every probe binds
  `--strictPort`, so a collision kills the second on bind and reads as a broken probe. Managed harness
  ports outside the table: e2e 4179, prod-smoke 4180.
- **A listening localhost port CAN mint a browser tab that outlives the process — but you cannot tell.**
  OBSERVED ONCE, 2026-08-09: a `vite preview` on 4180 opened a Crafty tab in Kevin's OWN Chrome, which
  kept running the R3F render loop and the Rapier physics step at **75% of a core** long after the server
  was correctly killed. Three later capture runs on 4178 the same day minted NOTHING. So the mechanism is
  NOT "any port always surfaces" — that was a generalisation from n=1, written here as if it were
  measured, and Kevin caught it.
- **You have no instrument for this, and THAT is the rule.** `close-preview-tabs.sh` enumerates cmux
  SURFACES only; it reported "no orphan preview tabs found" both when a tab existed and when none did. Its
  denominator excludes the real browser BY DESIGN, because a sweeper that reaches into Kevin's Chrome would
  be far worse than a tab left open. **So killing the server is not provably the end of the cleanup, and
  you cannot assert either way.** Say "a local run bound port N; I cannot see whether a tab was left" —
  never "close the tab" (an unverified instruction) and never "all clean" (an unverified all-clear).
  Prefer running these in CI, where there is no cmux and no browser at all.

## The DEV/PROD split — and a claim of mine that was already false when I wrote it

**CORRECTION 2026-08-13.** This section originally opened "Every harness in this repo drives the DEV
server ... the build Vercel serves is loaded by nothing." That was FALSE when written.
`scripts/ci/prod-smoke.mjs` loads the PRODUCTION build (`serveVite(PORT, { preview: true })`) and runs
as a CI gate — a step of `ci/pipeline.sh`'s fast tier, which the CI gates job runs (a docs-only change skips it,
with a printed line; this pointer named a `ci.yml` line until the step moved). I read an older line in `CLAUDE.md`, repeated it,
and never ran `ls`. The gate's own docblock says "nothing has ever LOADED it", because it was written
to CLOSE that gap: I quoted the problem statement of the fix as if it were current state.

What IS true, and is the useful part: the probes and the e2e suite drive the DEV server, so they
say nothing about the shipped bundle. `prod-smoke` covers boot/render/GL-alive on prod;
it does not diff pixels. Two different coverages, and only the second gap is real.

The numbers below stand — they were measured, not inferred:

| | LCP | render delay |
|---|---:|---:|
| dev (`vite`) | 1,559 ms | 1,556 ms |
| **production (`vite preview`)** | **237 ms** | 233 ms |

So any performance claim measured against the dev server is ~6.6x wrong, in the flattering direction for
a fix and the alarming one for a baseline.

**And the production console carries 256 WebGL errors per load** — `GL_INVALID_OPERATION:
glBlitFramebuffer` in two alternating forms, per frame, until Chrome emits *"too many errors, no more
errors will be reported to the console for this context"* and stops. Two consequences: 256 is a FLOOR
rather than a count, and **once muted, a genuine GL error later in that context is silenced too** — the
noise disables the very channel any console-error watcher relies on.

**Do NOT "fix" this in a dev-server probe.** It would never load the frame where this happens. The
probe that loads the production build ALREADY EXISTS —
`scripts/ci/prod-smoke.mjs`, a CI gate — so the work is to teach THAT about this error class, not to
write a new one. (This line previously claimed the probe was missing. It was not.)

To look, no new dependency required — `chrome-devtools` is installed globally (see
`~/.claude/projects/-Users-kz-Code/memory/reference_chrome_devtools_cli.md` for flags and the privacy
defaults, which are ON by default and want turning off):

```
npm run build && npx vite preview --port <free> --strictPort --outDir build   # kill it afterwards
chrome-devtools start --isolated=true --headless=true --no-usage-statistics --no-performance-crux
chrome-devtools new_page http://localhost:<free>
chrome-devtools performance_start_trace --reload=true --autoStop=true
chrome-devtools list_console_messages
chrome-devtools stop
```

`@playwright/test` is the repo's one browser library (prod-smoke, the probes, the lookbook and e2e all use
it) and reaches the same CDP, so a committed probe uses that rather than adding a tool to the gate path. Required
`chrome-devtools` CLI params are POSITIONAL, not flags.

## The meta-rule

When an error class recurs *despite being documented*, the next fix does not belong in a document. Put it in
the shared instrument, where it cannot be forgotten: `_serve.mjs` ended the process-leak class; `_probe.mjs`
ends the dishonest-tap class. A helper is used at the moment of the mistake. A paragraph is read before it.

## Every gate and where it runs

<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->
**17 gates; 6 run on a commit, 5 on a push, 13 in CI.** Generated by `gate-table.mjs` from `ci/pipeline.sh`
and `.githooks/pre-push`; edit it, never the table. A bare name runs as `node scripts/ci/<name>.mjs` from `frontend/`.
A push runs no unit suite, build or bundle: CI runs them on the exact sha (DECISIONS 2026-10-28 items 23, 24).

| Gate | commit | push | CI | Stops |
|---|:--:|:--:|:--:|---|
| mutation-proof-trailer: `node scripts/ci/mutation-proof-trailer.mjs <range>` | — | ✅ | — | a commit that adds a gate or changes its assertions with no `Mutation-Proof:` trailer |
| opsec-scan: `node scripts/ci/opsec-scan.mjs --all` | ✅ | ✅ | ✅ | a home path, credential shape or agent attribution reaching this public repo |
| doc-currency | ✅ | — | ✅ | a dangling path, § or `CLAUDE.md` heading citation in a canonical doc or rule file, a stale generated block, a lock label, `CLAUDE.md` over 12,000 bytes |
| eslint: `npm run lint` | ✅ | — | ✅ | crash-class bugs and dead code (`no-unused-vars` and `no-undef` are errors) |
| gate-shape | ✅ | — | ✅ | an assertion a comment could satisfy; the source-grep gate count may only fall |
| registry-dedupe: `node scripts/ci/registry-dedupe.mjs --check` | ✅ | — | ✅ | a `memory/registry.jsonl` id a merge left twice (`registry-dedupe.mjs` collapses it) |
| vitest related: `node scripts/ci/related-tests.mjs --staged-list "$STAGED_LIST"` | ✅ | — | — | a staged change that breaks a unit test statically importing it |
| unit + static gates: `npm run test:unit` | — | — | ✅ | the whole vitest suite: `tests/**` and colocated `src/**/*.test.js` |
| build: `npm run build` | — | — | ✅ | broken JSX or imports |
| bundle byte budget: `node scripts/ci/bundle-budget.mjs` | — | — | ✅ | a chunk past its byte ceiling |
| queue-ledger | — | ✅ | — | a queue finding with no `▣✓/▢/⊘` marker, or a dismissal with no proof command |
| artifact-currency | — | ✅ | — | an unusable operator-page source, a falsified Queued pill, a wrong as-of stamp |
| registry-append-only | — | ✅ | ✅ | a `memory/registry.jsonl` row deleted or reopened, edited without moving its `updated`, or closed and then changed outside its closure |
| knip: `npm run knip` | — | — | ✅ | an unused file, export or dependency |
| knip production: `npm run knip:production` | — | — | ✅ | a file or export only tests or tooling reach: code the shipped game never runs (`@internal` marks a deliberate test seam) |
| npm audit: `npm audit --audit-level=high` | — | — | ✅ | a HIGH or CRITICAL advisory (CI only: it needs the registry) |
| prod-smoke | — | — | ✅ | the production build failing to boot, render or keep a GL context |
<!-- END GATES -->
