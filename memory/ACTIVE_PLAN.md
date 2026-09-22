## CURSOR — 2026-09-22 (SOTA campaign, session 2). READ THIS FIRST.

Kevin's standing `/goal` (still armed): enhance Crafty to cutting-edge SOTA + future-proof, full
autonomy, enumerate and treat EVERY historical punted bug/decision, review+prune EVERY gate against the
evolved gate-shape principles, and **looks + gameplay are of utmost importance**. Persist RSI insights
each ~300k context.

### ⚠️ RESUME HERE — 2026-09-22, 94% context, git DOWN

**ONE COMMAND UNBLOCKS EVERYTHING: `sudo xcodebuild -license accept`** (Kevin's, needs sudo). Until then
PATH `git` and `/usr/bin/python3` refuse. Working substitutes: `/opt/homebrew/bin/git` (2.55.0),
`/opt/homebrew/bin/python3` (3.14.7 — use it for `append-episode`, which is shebang-pinned to the broken
one; AB SOTA is shipping a polyglot fallback as Q27). Do NOT push around it: the pre-push hook calls PATH
git and a silently-degraded hook is the bypass these gates exist to stop.

**NEXT MOVES, in order:**
1. `git add -A && git commit` the B2 + gate work (~21 files), push, watch CI.
2. Wire the grass biome id: `OptimizedGrassSystem` must pass a biome multiplier to `bladeTint(x,z,mul)` —
   the composition is DONE and tested, only the id plumbing through the worker's grass-top payload is
   missing. Until then blades and ground disagree.
3. Resume the census: `node frontend/scripts/ci/gate-census.mjs --top 40` — **32 files at 0/5**.
4. QUEUE.md B3–B5 (boss emissive-through-armour, 10-biome read, AO-as-shadow) untouched.

**GATE CONVERSIONS DONE (all 0/5 -> 5/5, all mutation-proven):** verb-router, hud-stat-wire (renders the
real provider), daynight-clock (drives fake timers), nametags, ocean-mesher (meshes a one-third-water
chunk and inspects the output).

**CENSUS SHARPENED TWICE BY USING IT:** `executes` missed `await import(...)`; `zeroGuard` missed any
numeric floor other than 0 (that one alone moved the corpus 106 -> 182 of 484, i.e. ~76 gates were already
better than the census credited). A census that undercounts the better form steers authors to the weaker.

**HARNESS FIX:** `scratchpad/mut.sh` now REFUSES to mutate without a restore artifact and verifies the
restore byte-for-byte. It had silently left `mesher.js` mutated (water guard deleted) while printing a
normal RED verdict, and the next mutation stacked on top. Episode written.

### ⚠️ UNCOMMITTED AT FLUSH — git is DOWN, work is on disk only

**BLOCKER: `sudo xcodebuild -license accept`.** Kevin's Xcode update repointed xcode-select, so
`/usr/bin/git` and `/usr/bin/python3` refuse. PATH `git` is broken; `/opt/homebrew/bin/git` (2.55.0) and
`/opt/homebrew/bin/python3` (3.14.7) still work. Do NOT push around it — the pre-push hook calls PATH git,
and a silently-degraded hook is the bypass these gates exist to stop.

**1 commit unpushed** (`9c52cd02`, fully gated — all 9 pipeline steps verified to have run).
**Uncommitted: B2 BIOME TINTS, COMPLETE AND GREEN** (lint clean, build clean, 3319/3319 tests pass).

B2 (QUEUE.md Q14) — six of ten biomes shared `surfaceBlock: 1` and rendered pixel-identical at ground
level; all ten declared a `tint` with ZERO consumers. Wired end to end:
- `world/biomeTable.js` — `BIOME_NAMES` / `BIOME_ID` / `BIOME_TINT_RGB` DERIVED from BIOMES (never typed,
  so they cannot desync); `hexToRgb01`; `tintPreservingLuminance`. Each entry stamped with its own `name`
  at module init so `pickBiome`'s `{...BIOMES.x}` carries identity without touching its branch ladder.
- `world/terrain.worker.js` — per-COLUMN `biomeIds` Uint8Array(256) filled at the existing pickBiome call;
  cached in a `biomeChunks` Map parallel to `chunks` (which stores a raw Uint8Array indexed directly
  elsewhere, so changing its shape would have broken every consumer). Evicted in LOCKSTEP with
  `chunks.delete`/`.clear` — an un-evicted parallel map would be a leak I introduced myself.
  Recorded BEFORE the beach override: that swaps the surface BLOCK to sand, it does not change the biome.
- `world/mesher.js` — biome id baked into `color.g`, the channel the file itself called "now unused".
  Zero extra bytes, no new attribute. Column read off `c0` (the greedy loop has no x/z scalars) and
  CLAMPED not masked: a far-edge corner at 16 would wrap to column 0 under `& 15`.
- `world/Terrain.jsx` — `uniform vec3 uBiomeTint[10]`, precomputed CPU-side at
  `BIOME_TINT_STRENGTH = 0.35`, applied as ONE multiply after the AO line. No GLSL twin of the maths.

**WHY LUMINANCE-PRESERVING IS THE LOAD-BEARING CHOICE:** a plain `c * tint` darkens every biome (all ten
tints have luminance < white), which on a LOCKED bold-flat direction reads as dirt. Normalising to unit
luminance means strength shifts HUE only — verified, multiplier luminance = 1.0000 at every strength.

**STILL OWED on B2:** `OptimizedGrassSystem.jsx` tints blades independently (`bladeTint(x,z)`), so the
blades and the ground they grow from will DISAGREE until it reads the same table. QUEUE.md B2 says do them
in the same commit — so do that before committing, or state the disagreement.
Also: a gate for the wiring (worker→mesher→shader). `tests/scripts/biome-tint.test.js` covers the pure
table only (7 cases, 4 mutations) and says so as its blind spot.

**Gate loosened, deliberately:** `biome-table-gates` pinned the literal
`let { surfaceBlock, secondaryBlock } = pickBiome(...)`. Q14 needed the biome NAME, so the call split in
two and the gate fired — correctly. Rewritten to assert the PROPERTY (pickBiome called with the climate
triple; surfaceBlock arrives via `let`; the beach reassignment still present) rather than re-pinning a new
literal, which would just move the brittleness one edit into the future.

### SESSION LOG — 2026-09-22, perf + gates stretch (10 commits, UNPUSHED at time of writing)

**Why unpushed:** `e2e-freshness` is STALE because `src/` changed. Running the suite clears it; that run
was started at the end of this stretch. Nothing is wrong with the commits — the gate is doing its job.

**PERF — three render-cost defaults, none visible to any of the 17 gates.**
- `<EffectComposer>` had NO `multisampling` prop. The package default is 8 on a HalfFloatType target
  (read from the installed dist), i.e. an 8x multisampled RGBA16F buffer at full canvas resolution,
  blit-resolved every frame. ~236 MB at dpr 2 — NOT the ~471 MB first written: a real ANGLE Metal / M3 Max
  context grants MAX_SAMPLES 4, so the requested 8 was always clamped. Never intended: the Canvas sets `antialias: false
  // Post-processing handles AA` and `<SMAA/>` is four lines below. Now `multisampling={0}`.
- `flipflops={3}` on PerformanceMonitor froze adaptation for the session (drei's default is Infinity and
  its sampler opens `if (api.fallback) return;`). Removed. **NAMED, NOT FIXED:** frame rate is not COST —
  a machine at 100% GPU holding 60fps sits in the [50,90] dead zone forever and never declines.
- `godRaySamples: 100` at `high`, never cost-budgeted. Measured live: `navigator.deviceMemory` is 32 on a
  secure context (NOT clamped to 8 — I claimed that and was wrong) and cores 14, so `selectTier` returns
  `high` on Kevin's laptop. Now 60, the value `med` has shipped since S1-D-M3.

**LOOKS — the shadow frustum was pinned to spawn.** The sun had no `target`, so three.js aimed it at the
world ORIGIN, with a hardcoded +/-100 ortho box. The world streams indefinitely, so past ~100 units from
spawn the whole world silently lost sun shadows. Now follows the player, texel-snapped (stops shadow
crawl), with the extent DERIVED from `(renderDistance + 0.5) * CHUNK` — 72 at high, which is ~14 px/unit
against the old ~10. Sharper shadows at identical cost, and correct everywhere.

**THE CHROME TAB.** `_serve.mjs` omitted `--no-open` on the preview branch only, and `vite.config.js`
declares `server: { open: true }`; vite resolves `preview.open ?? server.open`. So every `vite preview`
launched Kevin's real Chrome. Fixed. This is the mechanism `.claude/rules/gates-and-probes.md` recorded as
unknowable after seeing it once on :4180.

**THE GL STORM IS FIXED — AND NOT BY US.** Measured on real ANGLE Metal (M3 Max), production build, full
chain including N8AO halfRes: **0 GL errors over 1672 frames**. Controlled pair — 0 with
`multisampling={0}` AND 0 with the package default — so the MSAA path is uninvolved and my "prime suspect"
hypothesis is REFUTED, not merely unconfirmed. The fix was upstream: postprocessing 6.39.5 (078a6d1).
Posted as verification to pmndrs/postprocessing#750 and as a data point to N8python/n8ao#53.
**Three dead instruments caught on the way**, each by its own control: (1) `prod-smoke` runs
`--use-angle=swiftshader` in CI too, and SwiftShader cannot emit this error, so its seeded 0 was
meaningless; (2) a tab opened in Kevin's Chrome read `visibility: hidden` / `rafTest: 0` — a hidden tab
renders nothing, so 0 errors over 0 frames; (3) CDP evaluate timeouts from putting a 60s wait inside a 45s
call. The GL ledger in prod-smoke remains a SwiftShader-path regression guard only; that limit is written
into the file.

**THE 11.8 GB TAB — JS EXONERATED, GPU IMPLICATED, NOT CONFIRMED.** 90 heap samples over 58s show a GC
sawtooth bounded 70-140 MB at -0.4 MB/s. The JS heap does not leak, so the process-level figure is
GPU-side. `EffectComposer.setSize` reallocates input/output buffers, `<AdaptiveDpr>` is mounted, and
PerformanceMonitor moves `dprCap` — so every resize reallocated that ~236 MB target. Coherent mechanism,
NOT proven: GPU memory is unreadable from a page and `renderer.info` is unreachable in the prod bundle
(four accessors tried). The GL error ledger, seeded by CI from a real browser, is what will adjudicate it.

**GATES.** `scripts/ci/gate-census.mjs` replaces the one-shot audit whose verdicts were 4-for-4 wrong on
contact. It scores all 480 check files on five machine-determinable dimensions and REFUSES to issue a
disposition (a test asserts it never prints DELETE). First reading: executes 85% · receipt 3% ·
denominator 52% · zeroGuard 22% · blindSpot 6%; **37 files score 0/5**. Two converted so far, both 0/5 ->
5/5: `verb-router-gates` (now imports the router, drives the loaded-chest branch that prevents a misclick
destroying a chest) and `hud-stat-wire-gates` (now RENDERS the provider instead of regex-parsing its
object literal — the file `_boot.js` names as its sole guard and the audit wanted deleted).
`prod-smoke` now polls `gl.getError()` per frame instead of scraping a console Chrome MUTES after ~256
errors — closing OI-06 and OI-08, ratcheted rather than thresholded because SwiftShader cannot supply the
number.

**OWED, and none of it hidden:**
- ~35 remaining 0/5 gates. Run `node frontend/scripts/ci/gate-census.mjs --top 40` for the live list.
- **Real-browser confirmation of every perf claim.** SwiftShader caps samples at 4 and reports 0 GL
  errors, so it cannot settle the `glBlitFramebuffer` question. CI is the instrument.
- **Visual re-baseline**, already owed since postprocessing 6.39.1 -> 6.39.5; the shadow change adds to it.
- **KEVIN DECISION — `dprCap` 2 -> 1.75.** The biggest remaining lever (~23% off all 9 post passes) and
  the ONLY one that changes visible sharpness. Not taken silently.

### RESOLVED 2026-09-22 — child's name, fix-forward (Kevin's call)

- **DONE.** The name was in 24 tracked files / 49 lines of a PUBLIC repo, two of them pairing it with the
  age. Kevin ruled fix-forward. Renamed across every tracked file in one pass: the design-constraint name
  `<name>-floor` -> `kid-floor`, `<name> (8)` -> `an 8-year-old`, and the save-slot test fixture
  `"<name>'s Castle"` -> `"Skyhold Keep"`. Every occurrence in `src/` was a COMMENT (esbuild strips them)
  and in `tests/` a FIXTURE, so nothing behavioural moved and the production bundle was never affected
  (verified: 0 hits in `build/assets`).
- **History NOT rewritten, deliberately.** It is in ~1,900 commits, and a force-push does not erase
  anything on GitHub without a Support GC plus deletion of every fork — so the cost is real and the
  benefit is not. Fix-forward is the honest scope.
- **Enforced, not just fixed:** `scripts/ci/opsec-scan.mjs` now carries a `child-name` BLOCK rule, which
  is never ratcheted. Re-entry reds the push before it can reach a public remote.

### IN FLIGHT — ONE STEP LEFT, and main is SAFE (the commit exists locally, push is blocked)

`86f592ec` is committed but NOT pushed: the pipeline correctly refuses it on two rows of
`frontend/tests/scripts/supply-chain.test.js`. Those assertions are YAML-shaped —
`/run:\s*npm audit\b/` and `/- name: [^\n]*[Aa]udit[^\n]*\n\s*run:/` — and `npm audit` now lives in
`ci/pipeline.sh` as `step "npm audit (high + critical)" npm audit --audit-level=high`. The file-read was
already re-pointed to read ci.yml AND the pipeline concatenated (`ciDefinition()`); only the two REGEXES
still assume YAML.

FINISH IT: widen those two patterns to accept either surface's shape — the invariant is "an audit step
exists, it is NAMED, and it carries a THRESHOLD", not "a YAML key called run". Then
`bash ci/pipeline.sh --tier=push` must be fully green, and push. Do NOT relax the threshold assertion;
that is the part with teeth.

Everything else in the unification is DONE and verified: both callers invoke `ci/pipeline.sh`,
`gate-table.mjs` generates from the pipeline (not from a caller), pipeline step lines and table rows
both read 15 (asserted by comparing counts, after the generator's own regex silently dropped 3 indented
push-tier steps and wrote "9 gates"), and the trailer gates stay with the hook because only a push has
the refspecs they read.

### THE CI UNIFICATION — why it existed (his explicit ask; cause of his CI-failure emails)

`ci/pipeline.sh` and `frontend/scripts/ci/e2e-freshness.mjs` are WRITTEN and PROVEN but the two callers
are **NOT yet rewired**. Finish this first:
1. `.githooks/pre-push` lines 109-123 → replace the inline gate list with `bash ci/pipeline.sh --tier=push`
   (keep the per-commit worktree + certification loop around it; `CRAFTY_PUSH_RANGE` is the seam).
2. `.github/workflows/ci.yml` gates job → `bash ci/pipeline.sh --tier=fast`.
3. Regenerate the gate table (`node frontend/scripts/ci/gate-table.mjs --write`) — `gate-table.mjs`
   parses the HOOK, so it must learn the pipeline's step list or the generated block goes stale.
WHY: the hook ran 13 gates and ci.yml ran a DIFFERENT set. A damage-model change passed every gate the
hook knows and broke an E2E spec only the workflow runs. Two lists drift; one must BE the build.
e2e-freshness is the receipt (21 specs × ~20min is too slow to run per-push): content-keyed on
`src/**` + `tests/e2e/**`, fail-CLOSED on stale, fail-OPEN on absent.

### DONE THIS SESSION (all pushed, all mutation-proven)

- `e68dc194` postprocessing 6.39.5 exact. **The sun is back** — controlled pair on ONE renderer: outdoor
  day frames 10.7-38.6% changed, `explore-night` 0.022%, pure-UI 0.000%. Second finding: 6.39.1 was
  WASHED OUT (its godrays pass hazed the whole frame), so the pin was costing contrast everywhere.
- `de7795cd` **a pack of six dealt the damage of one** — `lastDamageTime` was one global number. Now
  per-attacker; `ai.worker.js` already stamped the entity id and the call site discarded it.
- `f5a792aa` **LMB on a chest destroyed it and everything inside** (`mine()` deletes, drops nothing).
- `21308d2e` `killability-ledger.mjs` — 12th gate. **5 of 471 check files carry a receipt (1.1%)**;
  ratcheted at 466 so debt falls, never rises.
- `a0613e43` + `de814119` `opsec-scan.mjs` — public-repo publish guard, ratcheted (423 accepted
  home-path lines). It blocked its own first push on its own fixtures: right direction, wrong target.
- `00f1daf7` e2e cooldown spec re-pointed. Stale branches deleted (both verified 0-ahead of main).
- `.claude/settings.json`: statusLine/subagentStatusLine moved to `settings.local.json` — vibe-island
  had INJECTED an absolute `$HOME/...` path into a tracked file on its own.

### BLOCKED, measured

**Visual re-baseline.** Needs a clean capture pair; machine had 1.3GB free of 36GB (the run that died
had 3.3GB and its own preflight called that too little). So the 31-frame oracle still depicts 6.39.1's
washed-out look while main renders 6.39.5 — **the visual gate is currently mis-aimed**. Re-run
`scratchpad/cap-pair-clean.sh` (it ASSERTS `complete:true` + provenance, which the first pair did not —
a dead run leaves the previous build's frames in `current/` and 31 files look like a complete capture).

### NOT STARTED — the bulk of the goal

`docs/superpowers/sota-2026-09/` holds the enumeration: `GATES.md` (24 DELETE / 51 CONVERT / 208
ENHANCE verdicts), `OPEN-ITEMS.md`, `FUTUREPROOF.md`, `QUEUE.md` (ranked, Q01-Q60).
Untreated: the gate prune itself · C3-C5 gameplay (boss second appearance, talent-tree choice, 5 mob
movement arms) · B1-B5 looks (sun arc, 10 biomes reading as 10, boss emissive-through-armour, AO as
shadow) · Phase 26 sky.
**Treat QUEUE.md as a hypothesis, not a spec** — three of its concrete claims were false in the
dangerous direction (a fabricated module path, advice to commit absolute symlinks, a census off by 92).

---

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

## 📍 CURSOR — 2026-08-13 (night). CI GREEN. Two decisions waiting on Kevin.

Everything below this block from the earlier 08-13 session still stands; this is what is newest.

**CI is green** (run 31741478286, all 5 jobs) after fixing a real race, not a flake: headless Chromium
refuses the world-ready auto-pointer-lock, and that refusal clears the `active` input gate 44ms after
`isSpawnChunkLoaded` flips, so a `forcePlay` landing on the wrong side of it made an input-gated verb
permanently unreachable. Fixed by `startPlayActive` (`frontend/tests/e2e/_boot.js`) — strict world wait,
re-assert until the gate HOLDS, named throw. Commits `314c024` `39b5642` `eabeb9e` `81f4bc9` `b0147d5`.

**KEVIN-GATED, do not self-decide — both recorded in `docs/superpowers/DECISIONS.md` (2026-08-13 night):**
1. **three r174.** MEASURED with a presence control: it takes the production bundle's `glBlitFramebuffer`
   storm from 6 to 0, confirming the upstream maintainer's root-cause theory on
   pmndrs/postprocessing#750. NOT landed: it changes the whole look (19 of 31 frames over gate, 99%+
   local density, visibly more saturated sky), so it needs a full reviewed re-baseline — a LOOK
   judgement, Kevin's call. Fully reverted; 0.172.0 / 6.39.1 installed.
   **Still unanswered: whether r174 fixes the SUN.** The global change makes it unseparable without a
   controlled r174 + 6.39.1 vs r174 + 6.39.4 pair. Run that pair before claiming either way.
2. **Reply to #750** — drafted at `docs/superpowers/upstream-750-reply-draft.md`, NOT posted. A public
   upstream comment is outward-facing.

**Free finding worth acting on independently of both:** `scripts/ci/prod-smoke.mjs` filters on
`m.type() === 'error'`, but the GL storm arrives as `warning` — so the production gate is structurally
blind to the error class it exists to watch. Widening it is cheap and is NOT gated on the r174 decision.

---

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

DONE 2026-08-13 — **doc gardening COMPLETE across all 5 doc surfaces.** 92 findings from ~330 claims:
README+`.claude/rules` `748cb36` · ARCHITECTURE `113661b` (18) · STATUS `5be4474` (9) · ROADMAP
`f7214d6` (10) · AGENTS `3e004ba` (10, incl. regenerating MEASURED + fixing read-order.mjs the
GENERATOR after I hand-edited its output and doc-currency caught it).

ONLY REMAINING: **3 artifact pages ~25 commits behind** — `sota-audit`, `era-review`, `loop-progress`
(`node frontend/scripts/ci/artifact-currency.mjs` lists them with URLs). NOTE: sota-audit does NOT carry
my prod-smoke error — it already says "production-bundle smoke job" correctly. Refresh them for currency,
not for correction.

IN FLIGHT — **doc gardening from a 6-agent audit. ~330 claims checked, 92 issues (41 FALSE / 41 STALE /
10 IMPRECISE).** Findings dump: `/private/tmp/claude-501/.../scratchpad/findings.txt` (session-scoped —
if gone, re-run the workflow at
`~/.claude/projects/-Users-kz-Code-Crafty/<session>/workflows/scripts/crafty-doc-audit-wf_9b19ac41-373.js`).

DONE: README (`748cb36`, incl. two errors of MINE — a 300x arithmetic slip and the prod-bundle claim
below), `.claude/rules/gates-and-probes.md` (`748cb36`), ARCHITECTURE 18 fixes (`113661b`).

REMAINING, in priority order:
- **STATUS 19 issues** — the rot is concentrated in MEASURED counts: 264 files/29.5K LOC (now 306/34,447),
  2114 tests (now 3189), 136 gates/116 source-grep/"85% assert TEXT" (now 181/106 = 59%), 15 e2e (now 20),
  ledger frozen at 115 (now 106), and the determinism block at lines 447/458 falsified by the 2026-08-13
  pair. Its qualitative findings held up well — only the numbers rotted.
- **ROADMAP 14** — incl. "de-monolith DONE [5 god-files -> 2]" (still 5 >=900 LOC), a [COMPLETED]
  "Persistent World Saving ... to the database" that is localStorage-only, and a header dated June 11.
- **AGENTS 10** — incl. line 139 "none is reproducible" about the Chromium-147 determinism numbers,
  disproven the same day (ZERO frames crossed the 6% gate on 151).
- **3 artifact pages ~21 commits behind** (`sota-audit`, `era-review`, `loop-progress`) — and sota-audit
  additionally carries my WRONG "first time anything loaded the production bundle" claim, which must be
  corrected there, not just here.

BLOCKED — **postprocessing is PINNED at 6.39.1 and cannot move. Upstream regression, fully isolated
2026-08-13.** 6.39.4 is the current `latest`, so there is no newer release to take.

**What breaks:** under 6.39.4, `GodRaysEffect` stops compositing the sun entirely. Isolated by ablation
(godRays disabled at every tier, sun material untouched, ONE variable moved). Blue channel sampled at
y=4 across x=95..165, identical in both spell-lightning and spell-arcane:

```
6.39.1, GodRays ON   213,214,215,195,196,197,198,198,199,200,200,201,223,224,224   deep dip = bright disc
6.39.4, GodRays ON   214,215,215,216,217,217,218,219,220,220,221,222,223,224,225   NO dip  = sun absent
6.39.4, GodRays OFF  214,215,215,213,212,212,213,213,214,216,217,219,223,224,225   shallow dip = mesh only
```

The sun returns the moment the EFFECT is removed, so the mesh renders fine — it is the effect's
compositing that fails.

**What it is NOT** (each cost a 33-minute capture, so do not retry them): the sun material. Setting
`depthTest`/`depthWrite` false, and separately `transparent`+`depthWrite` false (the vendor's documented
contract), produced BYTE-IDENTICAL output — the same 15 sample values in both frames. Two different
material configs, indistinguishable pixels: the material is not the lever. And `GodRaysEffect`'s render
path is byte-identical between 6.39.1 and 6.39.4 — only the composer's depth plumbing changed (one shared
depth attachment -> separate InputDepth/OutputDepth/stable textures, which is a correct fix for the
glBlitFramebuffer error).

**Still worth doing regardless:** our light source violates the documented contract ("must not write depth
and has to be flagged as transparent"). It is not the cause, but it is wrong, and fixing it is free.

**Cost of the pin:** the glBlitFramebuffer warning class stays. Invisible to players; a missing sun is not.

**Not yet done — NEEDS KEVIN:** filing this upstream at github.com/pmndrs/postprocessing. The reproduction
is complete (versions, ablation, pixel measurements) but filing is public posting and wants his say-so.

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
