# FINAL EDIT PLAN — Crafty governance surfaces
Verified at `HEAD = 7d30ee2` (2026-08-07). Every line/number below re-checked live for this plan; where a lens disagreed with a reviewer I state the winner and why.

**Governing discovery that reorders everything:** `.githooks/pre-push` now runs **TEN** gates — `grep -cE "printf '\\\\n▶" .githooks/pre-push` = **9**, plus `mutation-proof-trailer` at `:73`. The tenth, `artifact-currency` (`:101`), landed in HEAD and appears **zero times** in `.agent/AGENTS.md`, `LOOP-CHARTER.md`, and `LOOP-KERNEL-PROMPT.md` (`grep -c` = 0/0/0). Five of six reviewers certified the old count; R1 certified the gate table "FULLY ACCURATE — all 36 cells" while its headline was already wrong. Only R2's arithmetic matches live.

**Second governing discovery:** `frontend/scripts/ci/doc-anchors.mjs:120-125` resolves compound citations (`charter §2.5` = §2, list item 5) **permissively** — it passes if the leading `§2` exists. Renumbering or dropping a numbered list item is therefore a **silent** breakage. Live inbound compound cites: `SOTA-INITIATIVE.md:112` and `memory/CHANGELOG.md:63` → `charter §2.5`; `memory/ROADMAP.md:15` → `charter §2.4`. Plus bare-anchor cites that pin headings: `§0-A` `§0-B` `§1.5`(×2) `§3` `§4` `§5`(×6) `§6`(×2) `§6.4`(×3) `§8`(×2). **Precondition for any §-renumbering commit:** `grep -rnoE '(charter|kernel|CHARTER|AGENTS)[^.§]{0,20}§ ?[0-9A-Za-z.-]+' --include='*.md' . | grep -v node_modules | grep -v /archive/`. A green push is not evidence.

---

## 1. CORRECTIONS — ordered by blast radius

### C1 · `.agent/AGENTS.md:121, :130, table :133-146` — **TEN gates, and one row is missing**
Says: "**NINE gates authorize a push**" and "`grep -cE …` *(7 → 8 with cli-guard)*".
True: grep returns **9**; +`mutation-proof-trailer` = **10**. `artifact-currency` has no table row. This is the section's **third** undercount ("three" → "Six" → "NINE"), and it rotted one commit after four reviewers read it.

Replace `:121`:
```
**TEN gates authorize a push, and this doc used to name only three of them.** Until 2026-08-02 this section
```
Replace `:130`:
```
`grep -cE "printf '\\\\n▶" .githooks/pre-push` *(9 as of 2026-08-07) plus `mutation-proof-trailer`, which
```
Insert as the 4th table row (hook order: 73 · 99 · 100 · **101** · 102 · 103 · 108 · 109 · 110 · 111):
```
| artifact-currency | `node scripts/ci/artifact-currency.mjs` | ✅ | — | the published Artifact page drifting from HEAD — nudges below the drift ceiling, hard-fails above it (source of truth: `docs/superpowers/.artifact-sync.json`; read the ceiling from the script, never from here) |
```
Then reorder the two mis-ordered rows so the table reads in hook order: `doc-currency` **before** `queue-ledger`. (R1's proposed swap used pre-`artifact-currency` line numbers 99-110 and would leave the table wrong.)
**Then land A1** — this row will rot again otherwise.

### C2 · `docs/superpowers/LOOP-KERNEL-PROMPT.md:134-136` — harness "is FIXED"
Says: "`npm run visual:capture` — the harness is FIXED as of `75191ef`, runs ~5min to a clean end".
True: `memory/STATUS.md:429+` — "15 of 31 frames differ" on identical code, `beast-*` at 69–72%, "COMPOSITOR STATUS — intermittent … 63 rAF frames/1.2s earlier … **0 frames/1.2s later the same session**", "the owed re-baseline is BLOCKED on this." `75191ef` fixed the `close()`-hang, not determinism. Highest-consequence line in the corpus: re-injected verbatim on every firing.

**Reject R2's replacement** — it hard-codes `15 of 31`, `69–72%`, `menu 2.6%` into the cold-recovery source and re-rots on the next measurement (rule-efficacy O4). Use:
```
Capture-verify EVERY render-affecting slice (`npm run visual:capture`) — but the harness is NOT a trustworthy
oracle. `75191ef` fixed the close()-hang, NOT determinism. **`memory/STATUS.md` §B-race owns the harness's
current measured state; read it before trusting any diff, and do not transcribe its numbers here.** Check the
compositor (rAF count, ~3s) BEFORE planning browser work, expect to lose it mid-run, and do browser work
FIRST while the window is open. **Read the frame with your own eyes.** Re-baseline stays Kevin's call.
```

### C3 · `.agent/AGENTS.md:152` — "Visual gate is deterministic"
Same falsification as C2, in the **only always-loaded** surface. Replace:
```
- Visual gate: capture-determinism is the DESIGN (forced `high` tier; anims gated on `isCaptureMode()`;
  seeded RNG; frozen clocks — and the check must be INSIDE the interval callback, since the harness flips
  capture mode after mount). **It is not currently ACHIEVED** — `memory/STATUS.md` §B-race is the live
  measurement; re-read it rather than carrying this sentence's summary. Re-baseline + human review per
  intended look change.
```

### C4 · `.agent/AGENTS.md:200-204` — two false claims in the post-compaction anchor
Says: "This file is the **ONLY** one auto-loaded" and "Order matches `LOOP-CHARTER.md` §0-A **so the two documents cannot disagree**."
True: `.claude/rules/r3f-pointer-lock-voxel-meshing.md` has **no `paths:` frontmatter** (line 1 is `# R3F Pointer Lock…`), so it is unscoped. And the orders differ three ways: AGENTS inserts `DECISIONS.md` at #5 (absent from §0-A), demotes `INDEX.md` 5→6, and drops `SOTA-INITIATIVE.md` (§0-A #6). The kernel runs a **third** order that demotes STATUS to #3.

**Reject R6's "delete the list, point at §0-A."** False-deletion lens: this list is item #8 of the shipped plan of record — *"AGENTS named STATUS.md ZERO times before this"* (`6412bb6`) — and AGENTS is the only surface re-injected after `/compact`. A pointer re-creates the fixed defect. Take R1's shape (fix in place), with the divergence made explicit:
```
This file is auto-loaded on every task and is the only surface re-injected after a `/compact` — so it has to
name the others. (`.claude/rules/` also loads: `r3f-*.md` is unscoped so it loads always; `gates-and-probes.md`
is path-scoped and fires only on gate/test/script edits.) **Until 2026-08-03 this file never mentioned
`memory/STATUS.md` at all**, which pointed a freshly-compacted agent at the cursor and never at the registry.
`LOOP-CHARTER.md` §0-A is canonical; this is that order plus one Crafty addition at #5.

1. **`git main`** — the code is the only truth that cannot lie.
2. **`memory/STATUS.md`** — where we are · the open-work REGISTRY · what's next. **THE source of truth.**
3. **`memory/ACTIVE_PLAN.md`** — the live cursor: the ONE unit in flight.
4. **`docs/superpowers/LOOP-CHARTER.md`** — how the loop operates (+ `LOOP-KERNEL-PROMPT.md`, the durable
   copy of the `/loop` prompt and the cold/git-only recovery source).
5. **`docs/superpowers/DECISIONS.md`** — what has already been decided; `KEVIN-REVIEW-BATCH.md` is the
   append-only INBOX and structurally cannot tell you what is settled. *(Not in §0-A — added here because
   the charter names it the decisions OUTBOX.)*
6. **`docs/superpowers/INDEX.md`** — the doc map. A stale doc is a live trap.
7. **`SOTA-INITIATIVE.md`** — DIRECTION only. Its §3 status block is FROZEN at 2026-06-18.
```
Also delete the kernel's competing list (`LOOP-KERNEL-PROMPT.md:55-63`) → see R5 relocation below, and land **A3** (parity checker) so this cannot diverge a fourth time.

### C5 · `.agent/AGENTS.md:179` — a retired gate still live in the auto-loaded doc
Says: "HARD GATE — an approved design/spec before implementation". `LOOP-CHARTER.md:327-329` retired it: *"replaced by the self-gate … Kevin reviews ASYNC."* An agent that never opens the charter blocks on a gate that no longer exists. Replace the clause with:
```
a committed design/spec BEFORE implementation — SELF-gated per LOOP-CHARTER §4 (Kevin's pre-loop hard gate is
superseded; he reviews async via KEVIN-REVIEW-BATCH + CHANGELOG);
```

### C6 · `docs/superpowers/LOOP-CHARTER.md:153` — ORIENT hands you the forbidden git flag
Says `git -C /Users/kz/Code/Crafty status --short`. Both other docs mandate `-sb` and explain why (`AGENTS.md:220`, `LOOP-KERNEL-PROMPT.md:32`). This is in the step read **every iteration**. Replace:
```
   `cd /Users/kz/Code/Crafty && git fetch && git status -sb && git log --oneline -8` (`-sb`, not `-s`: plain
   `-s` suppresses the `## main...origin/main [behind N]` line, so you cannot see you are stale)
```

### C7 · `docs/superpowers/LOOP-CHARTER.md:234-235` — GameScene "~914"
`wc -l frontend/src/GameScene.jsx` = **299**. Components is 1325 (not ~1297), and three files ≥900 the sentence implies dissolved are live (`useGameStore.jsx` 1096, `Terrain.jsx` 997, `QuestSystem.jsx` 931). Handled inside the §2 compression (X1) — **do not re-type any LOC**; point at the generated block.

### C8 · `.agent/AGENTS.md:70` — `touch-probe.mjs` called a "deterministic gate"
`grep -c touch-probe .githooks/pre-push .github/workflows/ci.yml frontend/package.json` = 0/0/0. It is a manual probe; the committed guard is `frontend/tests/gates/quest-tracker-touch.test.jsx`. Replace the phrase with:
```
`scripts/visual/touch-probe.mjs` MANUAL probe (in neither pre-push nor CI; the committed guard is `tests/gates/quest-tracker-touch.test.jsx`)
```

### C9 · `.agent/AGENTS.md:54-55` + the MEASURED block — the guard is weaker than advertised
Says "This list is checked EXACTLY by `doc-currency`". `doc-currency.mjs:191` — `const key = (l) => l.map((f) => f.file)…`; `f.loc` is **never read**. Live proof: doc says `Terrain.jsx` 992, `measure.mjs` emits **997**, `doc-currency` still exits 0. Whole block is stale (doc 275/31,032/117 vs live **276/31,071/118**), held green only by the ±10% band, which the LOC list does not get.
Replace `:54-55` with:
```
  Its MEMBERSHIP is checked exactly by `doc-currency`; the LOC beside each name and the counts above sit under
  a ±10% band, so they drift silently. Regenerate before trusting a specific number:
  `node frontend/scripts/ci/measure.mjs --write`.
```
Then run `node frontend/scripts/ci/measure.mjs --write` as the **last** edit of the pass, and land **A2** (compare `loc` too) so the manual remedy stops being needed.

### C10 · `.agent/AGENTS.md:46` — a hand-typed number *inside* the anti-hand-typed-number paragraph
Says the mesher extraction dropped `terrain.worker.js` "from 936 to **694** LOC". Live `wc -l` = **692**; `measure.mjs`'s `split('\n').length` convention = 693. Neither is 694. Fix to `936 → 692`. Missed by all six reviewers.

### C11 · `docs/superpowers/LOOP-KERNEL-PROMPT.md:133` — knip does not run at push
Says "Full suite + eslint + build + **knip** + pre-push each push". `grep -c knip .githooks/pre-push` = 0; knip is CI-only (`ci.yml`). The same sentence enumerates 4 of 10. Replace:
```
Full suite + eslint + build + pre-push each push (pre-push runs TEN checks — count them, never recall them:
`grep -cE "printf '\\\\n▶" .githooks/pre-push` plus `mutation-proof-trailer`, which runs earlier and outside
that pattern). `knip` is CI-only.
```

### C12 · `docs/superpowers/LOOP-KERNEL-PROMPT.md:138` — dead path, in a file that orders "absolute paths always"
`ls specs/crafty-coherence-pillars.md` → missing. Real path `docs/superpowers/specs/crafty-coherence-pillars.md`. `doc-currency` is structurally blind (its `CODEPATH_RE`/`BAREPATH_RE` alternation is `memory|docs|frontend|src|\.agent|scripts|tests` — no `specs`). The charter's copy at `:292` is already correct; this is kernel-only. Fix the path.

### C13 · Count corrections — apply now, then mechanize
All verified stale. Fix each **as a command, not a number** (charter §8 rule 2), then land **A2**:

| site | says | live | replace with |
|---|---|---|---|
| `AGENTS.md:173` | "The **7** primitives" | 9 | "The UI primitives live in `src/ui/primitives/` (read the set from its `index.js`)" |
| `LOOP-CHARTER.md:182` | "**20** as of 2026-06-15" | 31 | "`ls tests/visual/baseline/*.png \| wc -l`" |
| `LOOP-CHARTER.md:321` | "**11** specs" | 16 | "`ls frontend/tests/e2e/*.spec.js \| wc -l`" |
| `LOOP-CHARTER.md:256-257` | "**84 of 136** gate files" | 116 / 148 | "read the frozen population from `frontend/tests/gates/.source-grep-ledger.json` (`_count`)" |
| `LOOP-CHARTER.md:18, :60` | "**142** docs" | 144 | drop the figure at both sites; leave the single count in `INDEX.md` where it is the subject |
| `LOOP-CHARTER.md:448-449` | "an actual **29.5k / 264**" | 31,071 / 276 | past-tense + date it; note the block is now GENERATED |
| `LOOP-KERNEL-PROMPT.md:66` | "~146 entries with 6 resolved" | quotation of a dated source | "as of the 2026-07-27 audit … and it has grown since (`grep -cE '^## ' …`)" |
| `LOOP-KERNEL-PROMPT.md:146` | "~25 more in the queue" | 24/25 closed | "the probe-hygiene class is CLOSED — only `scripts/visual/spawn-legibility-probe.mjs` remains, on ad-hoc port 4197" |
| `LOOP-KERNEL-PROMPT.md:166` | "the 215-finding queue is DEEP" | 120▣ / 95▢ | "`node frontend/scripts/ci/queue-ledger.mjs`" |
| `AGENTS.md:67` | "GameScene 933→**304**" | 299 | past-tense history; fix to 299 or drop the pair |

### C14 · `docs/superpowers/LOOP-CHARTER.md:265-266` **and `:39-40`** — flagship example is past-tense
Both state in present tense that `quest-rewards-gates.test.js` asserts `toMatch(/store\.addCoins\(r\.coins\)/)`. The file is `.test.**jsx**`, was rewritten `926751ef` / 2026-07-13, and the `addCoins` matches are comment lines quoting its dead self. Convert both to past tense with the sha, keep the live example (`bundle-split-gates.test.js`, which still ships).

### C15 · `docs/superpowers/LOOP-CHARTER.md:429, :433` — one denominator, two numbers, four lines apart
"996 loop commits" vs "in 999 commits". Live: `--since=2026-06-10 --until=2026-08-03` = **1045**; all-time = 1544. Neither reconstructs. Replace both with the command: `git rev-list --count --since=2026-06-10 --until=2026-08-03 HEAD`. This sits directly above §8 rule 2 ("A number is computed, or it is deleted").

### C16 · `docs/superpowers/LOOP-CHARTER.md:436-437` — §8 says the rule has "zero checkers"
It has one: `.githooks/pre-push:73`, `mutation-proof-trailer.mjs`, run **first**, and §3 of the same file already carries the `[MECH:]` pointer. Also "stated three times across two files" is wrong — live grep: charter 7, kernel 4, AGENTS 2, rules 3. Keep the past tense, name the enforcer, replace the count with `git log --format=%b | grep -c '^Mutation-Proof:'` (currently 26).

### C17 · `docs/superpowers/LOOP-CHARTER.md:433` — the "mechanism, not diligence" thesis has a counterexample
"zero `.state/` writes" is filed under rules obeyed ~100% *because* mechanically checkable. There is no mechanism: `grep -n state .gitignore` → no match; no hook or CI step touches it; `git status --short` right now shows `M .state/compaction-events.jsonl` and `?? .state/session-truth.jsonl` uncommitted. That rule is obeyed by **diligence**. Move it out of the mechanism bullet into the diligence bullet, or gitignore `.state/` in the same commit and keep it. Missed by all six reviewers; it is the evidence for §8's central claim.

### C18 · `.agent/AGENTS.md:17, :65-66, :161, :173` — four stale descriptors
- `:17` `SOTA-INITIATIVE.md` labelled "MASTER PLAN v2 (**LIVING**; S2-B → S3 → S4)". Its own header: "DIRECTION-canonical … **§3 is FROZEN as of 2026-06-18** … S0/S1/S2/S2-B and S3 are DONE". → `MASTER PLAN v2, DIRECTION ONLY (§3 status FROZEN 06-18; S0-S3 DONE, S4 Kevin-gated)`.
- `:65-66` miniplex "load-bearing for **mobs/loot/XP only**". `grep -rln "ecs/world" frontend/src/ | grep -v '\.test\.'` = **15** files incl. grass, minimap sync, nametags, element zones, hurl, squad AI. Keep "NARROW slice", replace "only" with the grep.
- `:161` names 2 of the rule file's **4** globs (it also fires on `frontend/src/**/*.test.js` and `.jsx` — ~118 colocated files). Fix to all four.
- `:173` "attribution is **owed** → a Credits screen" — `src/ui/CreditsScreen.jsx` exists and is wired (`MenuSystem.jsx:11,187`; `GamePanels.jsx:808`; `App.jsx:649`; `panelState.js:15`). → "DISCHARGED by `src/ui/CreditsScreen.jsx` (Settings → Credits)".

### C19 · `docs/superpowers/LOOP-CHARTER.md:409` + `§6.5` — CI badge and the missing published surface
`:409` "**CI badge** green (once CI exists — §V6)". CI exists since 2026-07-13; `README.md:5` carries the badge. Replace the conditional and add the caveat that `cancelled` renders as not-failure — confirm via `gh run list`, never the image.
§6.5 step 2 (`:402-404`) omits `docs/superpowers/LOOP-PROGRESS.html`, which the kernel calls a session-close obligation and which is **12 commits stale right now** (`1b776ca`). Add it to the ritual, and note the sibling that now HAS a gate: `artifact-currency` tracks `era-review.html` only (live: "1 commit behind, published fd447fa, HEAD 7d30ee2"). Update in place via the URL in `.artifact-sync.json`; a fresh publish strands the bookmark. **Then land A4.**

### C20 · `docs/superpowers/LOOP-KERNEL-PROMPT.md:57-58, :65-68` — two unactionable pointers
- The PRIMARY queue still carries `terrain.worker.js:912` as `▢`; the file is 692 lines and holds **zero** winding coords (`grep -c "c0 = \["` → 0, vs 6 in `mesher.js`). Fixed at `d676069`. Add the standing caveat: *"the mesher extraction (`71c24ca`) invalidated a whole file's cites at once — resolve every finding's file:line against live HEAD before working it; if the fix shipped, mark it `▣✓ <sha>` in the same commit."*
- "check DECISIONS.md before reversing anything" + seven SETTLED items: `grep -niE 'bloom|ocean|melee|cast|affix|audience|hybrid|ember|blight' docs/superpowers/DECISIONS.md` → **one** hit (`:185`, Ocean, still under *open* items). The world-design HYBRID decision lives at `KEVIN-REVIEW-BATCH.md:610`. Add the dated caveat: the kernel's SETTLED list is the operative record until backfilled.

### C21 · `.claude/rules/r3f-pointer-lock-voxel-meshing.md` — half-false and actively harmful
- `:16` names `terrain.worker.js` as the mesher's home. Winding lives at `frontend/src/world/mesher.js:148/155/169/176/190/197`.
- `:6` claims "all six coordinate permutations" then lists **four** — `+X` and `-X` are absent, and they are exactly the axes most recently broken (`d676069`, "side-face UVs transposed on five of six directions").
- `:12-13` reasons about drei's `PointerLockControls`, which is **gone** (no such import survives; `src/input/pointerLook.js:1` "replaces drei `<PointerLockControls>`"), and prescribes routing fallback locks through a wrapper — precisely the optimistic-relock pattern `src/ui/panelState.js:42-57` was written to eliminate after it left Kevin frozen and killed on 2026-08-05. Per MDN, a relock immediately after the ESC gesture is *guaranteed* refused; only a clickable surface recovers.
Content fix ships with the split — see **R1** below.

---

## 2. DELETIONS — survived the false-deletion lens

| target | evidence it is obsolete |
|---|---|
| `LOOP-CHARTER.md:38-43` (§0-B.1, mutation-proof restatement) | §3 carries the same rule **with** the `[MECH:]` pointer; `.githooks/pre-push:73` confirms the enforcer runs first. No `§0-B.<n>` compound citation exists anywhere — only bare `charter §0-B` (`CHANGELOG.md:1252`, `ACTIVE_PLAN.md:434`), which survives. Renumbering inside §0-B is invisible to `doc-anchors`. ~800 B. |
| `LOOP-CHARTER.md:63-66` (§0-B.7, never-weaken restatement) | Same rule at §3:270-273 and `LOOP-KERNEL-PROMPT.md:104-106` (the strictest copy). Same anchor argument. ~430 B. |
| `.claude/rules/r3f-pointer-lock-voxel-meshing.md:20-40` | §3.8/3.9/3.10 are verbatim Agentic-Brain overlay stubs ("No demotions yet") for coding/**investing**/**insurance** — 21 of 40 lines, zero Crafty content. Confirmed **not** synced: no `.claude/rules` mapping in `~/Code/Agentic-Brain/maintenance/sync.sh`, so a local edit will not be clobbered. **R5's range `20-41` is correct; R6's `30-45` overruns a 40-line file** — use R5's. |
| `.agent/AGENTS.md:184` (`react-perf-audit-kz`) | Present only at `~/Code/Agentic-Brain/skills-**archive**/react-perf-audit-kz`; absent from `~/Code/Agentic-Brain/skills/` and `~/.claude/skills/`, and from the live skills list. A constitution naming an uninstallable skill teaches that the list is decorative. Restore the skill *or* delete the line. |
| `LOOP-CHARTER.md:310` (#74 WILDHEART roar) | An open work item in the constitution. `memory/STATUS.md:821` already carries it ("STILL OPEN: no ROAR"). §6 (`:340-349`) deleted this document's backlog on the rule that two copies of a work list mean one is quietly wrong; this is the survivor of that class. Keep the "audio is a first-class axis, the loop owns the call" sentence; delete the item. |
| `LOOP-CHARTER.md:230` + `:103` (`plans/2026-06-17-crafty-W{1,2,3,4}-*.md`) | All four live at `docs/archive/2026-Q2/plans/`; `docs/superpowers/plans/ \| grep -c 2026-06-17` = 0. `doc-currency.mjs:91` skips any candidate matching `/[*?<>|]/`, and its path regexes require a `memory\|docs\|frontend\|src\|\.agent\|scripts\|tests` prefix — a bare `plans/…` glob is **doubly** invisible. `:230` dies with the §2 compression; **`:103` must be corrected in place** to the archive path. |
| `LOOP-CHARTER.md:227-228` (#72/#69 as blocking prereqs) | `docs/superpowers/plans/2026-06-10-crafty-72-verb-router.md:3` banner "✅ SHIPPED (2026-06-10)"; the four-Aspect spine shipped 06-10/11 (`STATUS.md:33-34`). Dies inside X1. |
| `LOOP-CHARTER.md:240-245` ("Verified P0" audio items) | `src/audio/masterBus.js` exists with `createDynamicsCompressor()`; `SoundManager.jsx` calls `.resume()` at 3 sites; `INDEX.md:72` marks the audit "mostly harvested". Dies inside X1. |
| `LOOP-CHARTER.md:246-247` (mine STATE-REVIEW for work) | `INDEX.md:88` classifies it "HISTORICAL … do NOT treat as current"; `#32` already satisfied (vitest `^3.2.4`). Dies inside X1. |

**Not deleted (lens said KEEP — do not re-propose):** §2's rung ordinals 4 and 5; the §4 Kevin roster; the §0-B.2 research citation; `AGENTS.md`'s read-order list; `AGENTS.md:155-163` (the DENOMINATOR paragraph); the §6 and §6.4 headings. See §6.

---

## 3. RELOCATIONS — right rule, wrong surface

### R1 · SPLIT `.claude/rules/r3f-pointer-lock-voxel-meshing.md` into two paths-scoped files
It currently has **no frontmatter**, so it loads on every session (2,958 B of always-on budget) while describing files an agent is usually not editing — and it bundles two concerns that share no file, so no single glob can be right.

**`.claude/rules/voxel-mesher-winding.md`**
```yaml
---
paths:
  - "frontend/src/world/mesher.js"
  - "frontend/src/world/terrain.worker.js"
  - "frontend/src/world/Terrain.jsx"
  - "frontend/tests/gates/mesher-geometry-gates.test.js"
---
```
Body: keep the `FrontSide` rationale and the four verified corner sets (they are bit-exact against `mesher.js:169/176/190/197`), **add the two missing directions** — Right (+X) `mesher.js:148` `[x+1,y,z] [x+1,y+w,z] [x+1,y+w,z+h] [x+1,y,z+h]`; Left (−X) `:155` `[x,y,z+h] [x,y+w,z+h] [x,y+w,z] [x,y,z]` — add the u/v axis-mapping table (`d===1` transposes: +Y is the only face whose `c0→c1` spans `h`), the UV split at `mesher.js:247-251`, and the gate pointer `npx vitest run tests/gates/mesher-geometry-gates.test.js`.

**`.claude/rules/pointer-lock-and-resume.md`**
```yaml
---
paths:
  - "frontend/src/input/**"
  - "frontend/src/ui/panelState.js"
  - "frontend/src/MenuSystem.jsx"
  - "frontend/src/InputManager.jsx"
  - "frontend/src/GameScene.jsx"
  - "frontend/src/App.jsx"
  - "frontend/src/HUD.jsx"
  - "frontend/src/Components.jsx"
---
```
Body: drei PLC is GONE, `pointerLook.js` is deliberately lenient (`:32` `if (!document.pointerLockElement) return;`), so the canvas-vs-body distinction no longer freezes look; the real hazard is the guaranteed-refused post-ESC relock; recovery is **state-derived** (`shouldShowResumeOverlay`, `panelState.js:60`), never another relock-and-hope; feed new panel flags into `isAnyPanelOpen`; gates are `tests/integration/esc-resume-recovery.test.jsx` + `scripts/visual/pause-resume-probe.mjs`.

⚠️ **Precondition:** verify one edit under each glob actually fires the rule before trusting three new files. All three reviewers asserting load semantics did so from self-report, and no session in this batch observed a *scoped* rule firing on edit. R5's original draft also used a bare filename with no wildcard (`"frontend/src/App.jsx"`) — no working example in this environment does that; if it fails, fall back to `frontend/src/**/*.jsx` + a body-level scope note.

### R2 · NEW `.claude/rules/src-editing.md` — the largest uncovered surface
```yaml
---
paths:
  - "frontend/src/**/*.jsx"
  - "frontend/src/**/*.js"
---
```
`grep -rl useFrame frontend/src | wc -l` = **53**, and Game-Loop-Isolation is marked **CRITICAL** in `AGENTS.md:169` where it is read at orientation — the exact "read at orientation ≠ salient forty tool calls later" failure `gates-and-probes.md:9-11` was created to fix. **Move** (do not copy) from `AGENTS.md:169-170` and `LOOP-KERNEL-PROMPT.md:128-133`: Game-Loop-Isolation (transient refs / `.getState()` / miniplex; never a selector subscription or `setState` in a frame callback), AST-safe edits, capture-determinism (`isCaptureMode()` check **inside** the interval callback), NO mid-combat re-mesh (P4 hard veto), zero-emoji in `src/`, tokens-not-hex, and the green-gate≠lived-result rule (A5). Leave a one-line pointer in AGENTS. **Take R5's version over R4's** — R4's adds the file without deleting the source, leaving two copies.

### R3 · NEW `.claude/rules/queue-and-registry.md`
```yaml
---
paths:
  - "docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md"
  - "memory/STATUS.md"
  - "docs/superpowers/DECISIONS.md"
  - "docs/superpowers/KEVIN-REVIEW-BATCH.md"
---
```
The queue-marker rule is enforced (`pre-push:100`, `queue-ledger.mjs`) but stated only in session-start surfaces; `grep -nE '▣|⊘|DISMISS|marker'` over LOOP-CHARTER returns **zero hits**. Carry: markers written in the same commit as the fix (`▣✓ <sha>` / `▢` / `⊘ DISMISSED — <reason> — \`<command>\``); a dismissal is a claim (7 of 29 self-dismissed gates later mutation-proved green); never "category X COMPLETE" until marked == total; verify a registry line against live code before working **or repeating** it; a reversal is a NEW dated DECISIONS entry naming what it supersedes. **Also carry the retraction protocol here** (see A5) — not as charter prose.

### R4 · `LOOP-CHARTER.md §6.4` (browser hygiene) → compress to a pointer; **canonical stays `.agent/AGENTS.md`**
The rule exists in four places (`AGENTS.md:72-117`, `LOOP-CHARTER.md:351-386`, `LOOP-KERNEL-PROMPT.md:142-151`, `gates-and-probes.md:63-66`) and the **always-loaded copy is the one missing the process-GROUP SIGKILL rule** — the actual bug class.
**Reject R6's "move canonical into `gates-and-probes.md`."** False-deletion lens is decisive: that rule fires on *edits*, and both incidents it encodes involved **zero** edits under `frontend/scripts/**` — the 2026-07-13 leak came from *running* capture/e2e (`kill-test-procs.sh:4-7`: seven vite servers, Chromium at 622% CPU, load 25), the cmux self-decapitation was a bare Bash call, and the rule's own named artifact `frontend/dbg-*.mjs` matches none of the globs. AGENTS is at 54% of the 40k ceiling; there is no size pressure justifying the trade.
Actions: **(a)** add to `AGENTS.md:88-89` the missing mechanism — *"spawn vite `detached` and SIGKILL the process GROUP (`process.kill(-server.pid,'SIGKILL')`); a plain `server.kill()` reaps only the npx wrapper and ORPHANS the vite child holding the port. Copy `frontend/scripts/visual/_serve.mjs`."* **(b)** add Puppeteer to `AGENTS.md:95` and to the diagnostic grep at `:98` (`kill-test-procs.sh:69-77` sweeps `~/.cache/puppeteer/chrome`; AGENTS omits it). **(c)** fix `AGENTS.md:91-96` — the doc says run the sweep "any time the box feels slow", the script's own header (`:14-16`) forbids running it while a test is active; retarget to SESSION-CLOSE and note `--force` exists. **(d)** compress charter §6.4 to a pointer (X6), keeping only the `close()`-timeout + force-kill mechanism and the cmux footgun. **(e)** restore into `gates-and-probes.md` the dropped *"prefer Playwright's `webServer` (self-managing)"* — the prevention half.

### R5 · Kernel read order + probe-hygiene prose
- Delete `LOOP-KERNEL-PROMPT.md:55-63`'s competing numbered list; replace with *"Then read in the order given by LOOP-CHARTER §0-A, with the v9 work queue (`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md`) slotted after ACTIVE_PLAN."* STATUS must not be "the SECONDARY queue" in the one surface re-injected every firing.
- `:143-147` teaches the detached-spawn / group-SIGKILL / timed-close pattern in prose, four days after `frontend/scripts/visual/_serve.mjs` made it importable (`grep -rln '_serve' frontend/scripts` → 20+ probes). `grep -c '_serve.mjs' LOOP-KERNEL-PROMPT.md` = 0. **Reject R2's ~1,400 B expansion** — it grows the 15,708 B cold-recovery file. Replace with 3 lines naming `_serve.mjs`/`_probe.mjs` and the two managed ports (4178 capture / 4179 e2e), and put the full checklist in `gates-and-probes.md`, whose glob already covers where new probes get written.

### R6 · `doc-currency` must be able to see `.claude/rules/**`
`doc-currency.mjs:35-44` CANONICAL has nine entries, none under `.claude/`. Append the four rule files. **In the same commit**, add `\.claude` to the alternation in **both** `CODEPATH_RE` (`:58`) and `BAREPATH_RE` (`:66`) — otherwise `AGENTS.md:161`'s pointer at the rules dir stays unlinted and R1's split would silently dangle it.
⚠️ Do **not** mark C21 (the mesher pointer) closed by this: `doc-currency` tests `existsSync`, and `terrain.worker.js` exists. The gate goes green over the exact stale line.

---

## 4. COMPRESSIONS — `LOOP-CHARTER.md` only
**Before: 43,273 B. After: ~35,300 B.** (~40,000-char salience threshold cleared with ~4.7 KB headroom.)

> **R3's byte budget targets the wrong file for *attention*** — the charter is read on demand at iteration start; `.agent/AGENTS.md` (21,556 B) plus any unscoped rule file are the ones paid for on every turn. Do these compressions for legibility and threshold compliance, and do R1/R2 for attention.

| # | target | action | Δ bytes |
|---|---|---|---|
| **X1** | `:223-248` §2 ladder (2,340 B) | **Keep the `## 2.` heading and ordinals 4 and 5** — `SOTA-INITIATIVE.md:112` and `CHANGELOG.md:63` cite `charter §2.5` (the interleave mandate), `ROADMAP.md:15` cites `charter §2.4`, and `doc-anchors` resolves compounds permissively so a renumber is silent. **Reject R3's delete and R6's 5-rung rewrite** — both destroy rungs 4-5 and redirect `§2.5` from "interleave ≥1 SOTA-experience unit every 2–3 milestones" to "hygiene", green. Rewrite rung 4 in place ("S3 de-monolith is a DEBT LANE; read the ≥900 set from `.agent/AGENTS.md`'s generated block, never from here"), keep rung 5 verbatim, excise rungs 3/6/7's dead content, note at the top that the live ladder is the kernel's MISSION. Update the three citing lines in the same commit. | −1,390 |
| **X2** | `:180-182` §1 step 5 VERIFY (2,375 B) | Names 3 of 10 gates and hardcodes "20" states while forbidding hardcoding. → point at the pre-push count command + `.agent/AGENTS.md` §Build/Test/Gates; state count from `ls tests/visual/baseline/*.png \| wc -l`. | −1,200 |
| **X3** | `:192-200` §1.5 LIVE-PROBE (1,150 B) | Third copy (kernel rules 3 + the capture line). Compress to the four named probes + the 6% `pixelmatch` metric (`tests/visual/diff.test.js:43`) + the world-SHAPE blind spot. **Keep the `§1.5` heading — cited by `CHANGELOG.md:2040` and `KEVIN-REVIEW-BATCH.md:645`.** | −250 |
| **X4** | `:252-269` §3 mutation block (1,728 B) | Keep as the statement of record (it carries the `[MECH:]`); trim the case narrative to CHANGELOG. | −830 |
| **X5** | `:270-273` never-weaken | Compress; mark explicitly *"no deterministic checker — advisory"* per §8 rule 1. | −140 |
| **X6** | `:351-386` §6.4 (3,220 B) | → `[MECH:]` header + the two mechanisms nothing else names (`close()` 8s race + force-kill; cmux `close-surface` footgun) + a pointer to `AGENTS.md`. **Keep the `## 6.4` heading — cited by `STATUS.md:914`, `CHANGELOG.md:879`, `ACTIVE_PLAN.md:503`.** | −2,320 |
| **X7** | `:340-349` §6 tombstone (791 B) | 8 of 10 lines are archaeology. → 3 lines pointing at `STATUS.md` §2 D/E/F and §5 item 6. **Keep the `## 6.` heading — `ACTIVE_PLAN.md:245`, `STATUS.md:1056`.** | −440 |
| **X8** | `:311-316` §4 Kevin roster | **Keep the enumeration** — I read all 195 lines of `DECISIONS.md`; **none** of the seven SETTLED items is in it (only `:185` Ocean, still open). Redirecting the constitution's only in-repo roster to an empty outbox is a net loss. Compress the prose, add R2's caveat. | −150 |
| **X9** | `:289-295` pillars + reference-lock | Third copy; add the operative fact the charter omits — P4's two invariants are the **only** hard vetoes. | −250 |
| **X10** | `:217-221` CONTINUE | The `~60–150s` cadence exists **only** here (kernel `:166-168` has no fast-path figure). **Move it into the kernel in the same commit**, then delete. | −300 (+150 kernel) |
| **X11** | `:44-49` §0-B.2 | Merge the rule into §3 — **carrying the arXiv 2606.26300 citation and the 28.6%→0.6% / 40%→61% figures**, which exist nowhere else in the repo and are the entire warrant for the independent-evaluator rule. | −200 |
| **X12** | `:38-43` §0-B.1 · `:63-66` §0-B.7 | Delete (see §2). | −1,230 |
| — | §8 corrections, §6.5 LOOP-PROGRESS line, `[MECH:]`/`[ADVISORY]` tags | additions | +800 |

**Net −7,900 → ~35,300 B.** Do **not** add the queue-marker block to §3 (rejected below) or the retraction protocol to §8 (relocated to R3).

---

## 5. ADDITIONS — each names the failure it prevents

### A1 · `frontend/scripts/ci/gate-table.mjs` — generate the gate table
**Prevents:** the undercount that has now happened three times ("three" → "Six" → "NINE" → live TEN), including *inside the paragraph written to stop it*, and certified accurate by the reviewer who checked hardest, one commit before it rotted. Existing surfaces do not prevent it: `doc-currency` checks paths and section anchors, not table contents; `.githooks/pre-push` and `.github/workflows/ci.yml` are outside CANONICAL **and** outside every rule glob.
**Shape:** parse `printf '\n▶ <name>` from `.githooks/pre-push` (+ the pre-pattern `mutation-proof-trailer` invocation) and step `name:`s from `ci.yml`; emit rows between `<!-- BEGIN GATES -->` / `<!-- END GATES -->` in `AGENTS.md`; `doc-currency` re-derives and fails on drift — the exact contract `measure.mjs` already has.

### A2 · Extend the MEASURED pattern to every count
**Prevents:** ~15 findings in this batch that are one defect. Every proposed remedy today is either a fresh hand-typed number (rots identically) or "run this command" (charter §8 rule 2 has said exactly that since 2026-08-03 and rotted anyway, *in its own paragraph*).
**Shape:** one generator emitting visual states (`ls tests/visual/baseline/*.png`), e2e specs, gate-file count + source-grep share (`.source-grep-ledger.json._count` already holds 116), primitives (`src/ui/primitives/index.js`), doc count, queue split (`queue-ledger.mjs` already computes it). **Plus the one-line fix at `doc-currency.mjs:191`** — include `f.loc` in `key()` so the ≥900 LOC values are checked, not just membership (that is why `Terrain.jsx 992` sits against a live 997 with a green push).

### A3 · Read-order parity checker
**Prevents:** three documents, three orders, one of them asserting they "cannot disagree". Charter §8 rule 1 demands an enforcer; every proposal in this batch picks a winner **in prose**, which is the pathology §8 diagnoses. ~15 lines: parse the numbered read-order list from `AGENTS.md`, `LOOP-CHARTER §0-A` and the kernel; fail on mismatch. Cheaper than any of the rewrites it retires.

### A4 · Generalize `artifact-currency.mjs` to a second source
**Prevents:** `LOOP-PROGRESS.html` going stale — 25 commits, then 96, then **12 right now**, while STATUS and CHANGELOG stayed immaculate and Kevin had to ask. HEAD `7d30ee2` is the template and no reviewer cited it: *"the published page went stale a THIRD time — give it a gate, not another promise."* Three prose promises failed; one gate worked. R2 proposes prose for the *other* ungated surface. `.artifact-sync.json` → array of `{url, source, syncedSha}`; ~10 lines.

### A5 · `.githooks/commit-msg` — the free slot, spent correctly
**Prevents:** the mutation-proof hole. `mutation-proof-trailer.mjs:56` uses `--diff-filter=A` — **added files only** — so *rewriting a vacuous gate demands no proof*, and that is exactly where it has failed: `91530be` ("my first replacement was vacuous too") and `03c4297` ("the 'proof' for it was vacuous") are both edits.
**Two-part fix, in order:** (i) **code first** — add `M` to the filter for `GATE_PATHS`, making the mistake unrepresentable, then delete the prose that warns about it; (ii) `commit-msg` hook rejecting a commit touching `frontend/tests/gates/**` or `frontend/scripts/ci/**` (added **or modified**) without a `Mutation-Proof:` trailer — same check as pre-push, moved to where the message can still be cheaply edited. **Reject R6's AI-footer `commit-msg` hook** — that rule has 100% measured compliance (`git log --format=%B | grep -ciE 'Co-Authored-By: Claude|Generated with'` = 0); spend the slot on the check that actually fails. *(`ls .claude/` = `rules` only — this project has no `settings.json` and therefore zero Claude Code hooks; `core.hooksPath=.githooks` is verified, so `commit-msg` is a free slot.)*

### A6 · Green-gate ≠ lived result — into `AGENTS.md` and R2's rule file
**Prevents:** the most common defect class in the recent log, caught by nothing: `fddf7d4` (two achievements dead on arrival — nothing called `updateLevel`), `34f11b0` (mob grass-bending never worked; 81 chunks drove it), `869f71e` (mote layer rendered at world origin, not with its chunk), `8a5e008` (two live bindings advertised nowhere). knip sees the export used; a source-grep gate sees the line exist. `AGENTS.md:70` gets as far as "verify against live code + the gates" — which points *at* the gates, not past them. Text: *"prove the entry point is REACHED in the running app — real-input E2E, a live probe, or a log line you watched fire — not that the call site compiles."*

### A7 · `[MECH: <path>]` / `[ADVISORY]` tag pass over all three big docs
**Prevents:** mistaking emphasis for coverage. Charter §8 rule 1 has never been applied to the corpus it governs. Enforced today: mutation-proof, queue-ledger, doc-currency, artifact-currency, eslint, gate-shape, cli-guard, unit, build, bundle-budget, knip. Unenforced **and unlabelled**: browser hygiene (all four copies), Game-Loop-Isolation, AST-safe edits, capture-determinism, no-mid-combat-re-mesh, reference-lock, LIVE-PROBE, the §2 ladder, the §6.5 ritual, no-`git add -A`, the §1 procedure. The tag is the deliverable: it turns "is this covered?" from a judgment into a grep, and hands the next mechanism tick a ranked list. Budgeted at +800 B in X-table.

---

## 6. REJECTED — killed by a lens; do not re-propose

| proposal | lens | why |
|---|---|---|
| Delete or 5-rung-rewrite `LOOP-CHARTER §2` (R3, R6) | false-deletion | `charter §2.5` (`SOTA-INITIATIVE:112`, `CHANGELOG:63`) and `§2.4` (`ROADMAP:15`) are live; `doc-anchors` head-matching makes a renumber **silent**. R6's version redirects §2.5 from the SOTA interleave mandate to "hygiene", green. Already adjudicated at `LOOP-DOC-SOTA-PLAN-2026-07-27.md:29`: *"'delete §5 and §6 outright' is too blunt."* Ordinals are an API. |
| Replace `AGENTS.md` read order with a pointer to §0-A (R6) | false-deletion | The list is shipped fix #8 (`6412bb6`) — *"AGENTS named STATUS.md ZERO times before this"* — placed in the only post-compaction surface. A pointer re-creates the fixed defect. Fix in place (C4). |
| Move canonical browser hygiene into `gates-and-probes.md` (R6) | false-deletion | Both encoded incidents involved **zero** edits under `frontend/scripts/**` (running capture/e2e; a bare `cmux` call), and the rule's own artifact `frontend/dbg-*.mjs` matches no glob. AGENTS at 54% of ceiling — no size pressure. |
| Redirect §4's Kevin roster to `DECISIONS.md` (R3) | false-deletion | All 195 lines read: **none** of the seven SETTLED items is there. Points at an empty outbox. |
| Delete `LOOP-CHARTER §0-B.2`'s research citation (R6 merge) | false-deletion | arXiv 2606.26300 + 28.6%→0.6% / 40%→61% exist nowhere else in the repo; the kernel's merge target carries neither. Merge the rule, carry the citation. |
| Delete `LOOP-CHARTER:236` B4-v1.5 (R3) | false-deletion | Unresolvable ≠ nonexistent — deleting **erases** a Kevin-gated deferral. Relocate to `memory/STATUS.md §H KEVIN-ONLY`. |
| Delete `LOOP-CHARTER:332-333` "~146 entries" (R6) | false-deletion | §8 rule 2 explicitly sanctions *"a dated past-tense scar"*; the source (`DECISIONS.md:4-5`) dates it. Stamp the date; deleting removes the evidence for the structural claim. |
| Delete `LOOP-CHARTER:217-221` CONTINUE cadence (R3) | false-deletion | The kernel has **no** fast-path figure — deleting removes the ~60–150s default outright. Move first, then delete (X10). |
| Compress `AGENTS.md:155-163` DENOMINATOR paragraph (R1) | false-deletion | `gates-and-probes.md:9-11` opens by citing it as its own warrant. Compressing it breaks the rule file's stated basis. (R1's other two bloat targets, `:40-48` and `:121-131`, are fine.) |
| Add a queue-marker block to `LOOP-CHARTER §3` (R3) | rule-efficacy | The rule is already enforced at `pre-push:100`. Restating an enforced rule in the constitution is precisely what `LOOP-CHARTER:454` forbids. Goes in R3's rule file instead. |
| Add a retraction protocol as `§8 rule 4` (R6) | rule-efficacy | The defect is real (5 self-retractions in 25 commits) but charter prose has ~0% measured adherence for unenforced rules — §8's own audit is the evidence. Relocate to `.claude/rules/queue-and-registry.md`. |
| Expand `LOOP-KERNEL-PROMPT:143-147` probe hygiene (+1.4 KB) (R2) | rule-efficacy | Grows the cold-recovery file to teach a pattern `_serve.mjs` already makes unrepresentable for importers. Residual risk is hand-rolled new probes — under `frontend/scripts/**`, already globbed. |
| Add a "3b" prose rule for vacuous-gate replacements (R5) | rule-efficacy | Wrong layer: fix `--diff-filter=A` → `AM` (A5(i)). Both known failures post-date the prose rule. |
| Reorder the gate table's two rows and call it done (R1 #12) | claim-verification | Cited pre-`artifact-currency` line numbers 99-110 (live: 102-111) and leaves the table missing a row and the headline wrong. Subsumed by C1 + A1. |
| Certify the gate table "FULLY ACCURATE — 36 cells" (R1) | claim-verification | False at HEAD. The cells were individually right; the **denominator** was wrong — the repo's own `feedback_gate_coverage_count_audit` failure, inside a review of that failure. |
| Delete `r3f-*.md` lines **30-45** (R6) | claim-verification | The file is **40 lines**; stubs start at **20**. R6's range overruns and deletes the wrong span. Use R5's `20-40`. |
| Mark C21 (stale mesher pointer) closed by adding `.claude/rules` to `doc-currency` (R5, R6) | rule-efficacy | `doc-currency` tests `existsSync`; `terrain.worker.js` exists (692 LOC). Green over the exact stale line. Ship R6 anyway for future deletions, but the mesher fix is manual. |
| `commit-msg` hook enforcing the AI-footer ban (R6) | rule-efficacy | 100% measured compliance across the entire loop window; re-verified zero. Spend the slot on the mutation-proof trailer. |

---

## Known gaps this plan does not close
- **No gate was executed** by any of the six reviews, the three lenses, or this plan. Only `measure.mjs`, `doc-currency.mjs` (PASS), `queue-ledger.mjs` (clean) and `artifact-currency.mjs` (1 behind, exit 0) were run. `lint`, `test:unit`, `build`, `knip`, `gate-shape`, `cli-guard`, `bundle-budget`, `test:e2e`, `test:visual` have **unknown** status. Any statement here that "the push stays green" is read off the hook source, not observed.
- **Four of ten gates run in pre-push only** — `queue-ledger`, `cli-guard`, `artifact-currency`, `mutation-proof` — i.e. all three "a claim is not a proof" gates plus the artifact gate, with `git push --no-verify` documented at `pre-push:36` and nothing downstream. That is the coverage-denominator defect applied to the gate system itself; no reviewer looked, and this plan does not fix it.
- **`memory/STATUS.md` (96,957 B) was audited by nobody.** All three governing docs call it THE source of truth and read-order #2; every correction above routes work into it; R2 noted in passing that its §3 still claims the docs reorg is "not started" against a reorg verified complete. The governance stack got five audits; the thing it points at got zero.
- **`.claude/rules` load semantics are inferred, not observed.** Sequence R1/R2/R3 behind one empirical firing test.