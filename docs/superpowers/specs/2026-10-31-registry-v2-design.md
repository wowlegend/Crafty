# Registry v2: one list for open work, and the rubric for cleaning it up

Design for Kevin's ask of 2026-10-31 ("a total review / cleanup of that registry jsonl ... a SOTA and future-proof
single list from now on"). It covers the schema, the rubric the reviewers apply to every row, and the gates that
keep the list clean. Its machine-readable twin stayed with the review's working files; what landed is the gate code
(`frontend/scripts/ci/registry-harvest.mjs`, `registry-append-only.mjs`) and DECISIONS 2026-10-31 (registry v2) items
361-368, which record where the landing departs from this design. Measured at main `a150a93a` against the frozen
snapshot, `git show a150a93a:memory/registry.jsonl`.

**Read-Before-Architect check.** I have read `frontend/scripts/ci/registry-harvest.mjs`, `registry-append-only.mjs`,
`registry-dedupe.mjs` and `registry-floors.json`; the registry readers in `command-record.mjs` (`registryRow`),
`scripts/dev/orient.mjs` (`registryCounts`), `doc-currency.mjs`, `gate-table.mjs`, `read-order.mjs` and
`cold-takeover-eval.mjs`; `.gitattributes` (the registry merges by union); the reset plan's row 30 and its section 5;
DECISIONS 2026-10-28 (W1-H) item 9, which set the current schema; the deep audit's counts, lane order and duplicates
sections; the cursor; and the last 200 rows plus a sample from every prefix. They cover how a row is written,
merged, deduplicated, counted and shown to Kevin. This design extends them with five fields, a closed field set,
lanes as rows, a typed `closedBy`, and checks added to the two existing gate scripts. It adds no new gate script.

---

## 1. Goal frame

- **Goal.** A single list that a fresh successor can act on without reading history. Each open row says what is
  wrong in plain words, how bad it is for a player, who owns it now, and what "done" means. Each closed row says how
  it closed, with proof a skeptic can check.
- **Metric.** It is not the open count. Lowering the count by closing rows on guesses is the obvious way to game it.
  The metric is three numbers that must all hold at once:
  1. Every open row passes the v2 schema: kind, area, a rated severity, an open lane row and a checkable acceptance.
  2. Zero orphans: no open row names a lane that has landed.
  3. Zero unproven closures: every `closedBy` resolves (the sha is on main, the DECISIONS item exists, the pointer
     names a real row), and every triage closure carries its proof in the row.
- **Strategy, derived from the metric.** Make the schema small enough that a gate can check all of it. Make lanes
  rows, so the orphan check reads the same file. Make closure evidence typed, so a gate can resolve it. A reviewer
  closes a row only with a command's output (section 5.4), and an independent verifier re-checks every closure.
- **Anti-attack.** Here is what breaks if this succeeds too literally, and what counters each:

  | Attack | Counter |
  |---|---|
  | Mass closing on assumptions | `verified` confidence is required for every CLOSE (section 5.4). A second-model verifier re-checks every closure of a HIGH, MED, playerVisible or Kevin row, and a sample of the rest. |
  | Severity deflation | Every downgrade of a playerVisible row states its harm and reach in one line. The verifier checks every downgrade. |
  | `LANE:backlog` becoming the new junk drawer | A backlog row still needs a severity and an acceptance. The Command Record prints the backlog count and its oldest `updated` date. |
  | Boilerplate acceptance ("fixed") | The gate checks length and that the acceptance is not the title. The rubric bans "investigate", "fix it" and "done when resolved". |
  | Over-merging distinct bugs | A duplicate needs the same root cause and the same fix, named as code paths, not a similar symptom. |
  | Dropping harness LOWs that guard real classes | The `harnessLow` policy keeps any row that guards a MED or HIGH player class. |

---

## 2. What the registry is today (measured at a150a93a)

Commands: `node -e` over the snapshot, `git merge-base --is-ancestor` for every sha in `closedBy`, and `grep` over
DECISIONS. The task text says 447 open and 316 closed. The file holds 767 rows: 441 open, 326 closed, 0 in flight.

| Finding | Number | Why it matters |
|---|---|---|
| Rows by prefix | REVIEW 325, STATUS 102, OPEN_ITEMS 92, QUEUE 84, AUDIT 75, ACTIVE_PLAN 41, MASTERPIECE 29, W3B 7, W2J 6, PLAN 4, CI 1, DECISIONS 1 | The prefix records where a row came from. It is the only way rows are grouped today (`command-record.mjs` counts the bug hunt by `id.startsWith('AUDIT:')`). |
| Open rows by `planUnit` | `unmapped` 84; W2-J 44, W2-F 31, W2-D 25, W3-B 21, W3-D 19, W2-I 19, chaos-play 15, ... | 84 open rows have no lane. About 230 more name a lane that has already landed. The count is 233: W1 15, W2 other than W2-M 181, and the closed audit lanes L1, L4, L5 and L11 16, from their closed `AUDIT:lane` rows. It also counts chaos-play 15 and fix/invisible-box 6. Lane status comes from the cursor and those rows, not re-measured with `gh`, and W2-D's 25 may include its unlanded feats. Nobody owns these rows. |
| Open severity | HIGH 16, MED 90, LOW 317, unrated 18 | 72% of open rows are LOW, 198 of them not player-visible. Plan section 5 already says harness LOWs are "fixed or dropped, never ledgered". |
| `dupOf` set but the row still open | 44 of 49 | Known duplicates were marked and left open, so they count twice. |
| Closed rows with no `resolution` | 44 | |
| Closed rows with a legacy `resolution` | cancelled 27, overtaken 16, decided 3, parked 1, harvested 1, split 1 | Seven words for four ideas. `parked` is not a closure at all. |
| `closedBy` shas | 288 cited, 288 resolve and are ancestors of a150a93a | Clean today. Nothing checks it, so a made-up sha would pass. |
| `closedBy` forms | 318 of 326 already fit the v2 grammar (section 4.5) | 8 need rewriting (free text after a date, `PR #N closed <date>`, a document path). |
| DECISIONS item numbers | 1 to 10 repeat across the 2026-10-28 entries; 11 to 336 are unique | A reference needs its date, plus the entry tag for items 1 to 10 on 10-28. |
| Title length | median about 146 characters, longest 603 | Titles carry history and detail that belongs in `note`. |
| Fields in use | 16. The 10 required ones, plus `closedBy`, `resolution`, `note`, `dupOf`, `blockedBy` (1 row), `closedNote` (2 rows) | No gate rejects an unknown field, so fields drift. |

The gates today: `registry-harvest.mjs` checks the schema and that every old-source item has a row, in every unit
run. `registry-append-only.mjs` checks that no id is deleted, on pre-push and in CI. `registry-dedupe.mjs` collapses
ids repeated by a union merge, keeping the copy furthest along (open, then in-flight, then closed). None of them
checks a row's content, an orphan, a closure's evidence, or a reopen.

---

## 3. What mature trackers do, and what fits a single git-tracked file

- **Linear** has fixed status categories: Backlog, Unstarted, Started, Completed, Canceled, plus a Triage inbox and
  a reserved Duplicate status. Linear's own team files "Could not reproduce" and "Won't Fix" under Canceled. Teams
  can turn on auto-close for issues not updated in a set time ([Issue status](https://linear.app/docs/configuring-workflows)).
  Priority is No priority, Low, Medium, High or Urgent. Linear deliberately offers no custom or finer levels, because
  "adding too many options makes it harder to set priority and leads to diminishing returns"
  ([Priority](https://linear.app/docs/priority)). Triage offers four actions: accept, decline, mark as duplicate, or
  snooze. Marking a duplicate moves the new issue's attachments onto the canonical issue
  ([Triage](https://linear.app/docs/triage)).
- **GitHub Issues** has two states, open and closed. A close carries `state_reason`: `completed`, `not_planned`,
  `duplicate` or `reopened`, plus a `duplicate_issue_id` pointing at the canonical issue
  ([REST issues](https://docs.github.com/en/rest/issues/issues)). An organisation's default issue types are task, bug
  and feature ([issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization)).
  Dependencies are relations ("blocked by" / "blocking"), not a status
  ([dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)).
- **Jira** separates status from resolution. An empty resolution means unresolved. The defaults are Done, Won't do,
  Duplicate and Cannot reproduce. Priorities run Highest to Lowest, each defined by how much it blocks progress.
  Jira also has a Reopened status
  ([Atlassian](https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-statuses-priorities-and-resolutions)).

**Adopted.**
- State stays separate from resolution, as in Jira and GitHub's `state_reason`.
- Duplicate is a typed pointer to one canonical row, and the duplicate's facts move into it, as in Linear.
- One small, fixed severity scale with no custom levels, for Linear's reason.
- A triage inbox with an exit rule.
- Blocked is a relation (`blockedBy`), not a state, as in GitHub.
- A small type set, starting from GitHub's task, bug and feature, extended only where routing or a gate differs.
- Jira's "cannot reproduce" becomes `false-positive`, matching CLAUDE.md's existing rule that a false positive
  closes only with a proof command.

**Rejected, with the reason.**
- Auto-close on age: it closes on an assumption, which the brief forbids.
- A Reopened state: the union merge plus `registry-dedupe` keeps the copy furthest along, so a reopen that races
  any edit of the closed row is silently undone. A regression is a new row with `reopens`.
- Custom in-progress statuses (In Review, Ready to Merge): the PR and CI already hold that state.
- A separate priority beside severity: the programme's order already lives in the lanes.
- Sub-issue trees deeper than one level: lane, then row.

---

## 4. Schema v2

### 4.1 Fields

Each field is kept only if it lets someone make a decision. The field set is closed: an unknown field fails the gate.
That stops a future writer from inventing `status` or `priority` beside `state` and `severity`.

| Field | Required | Meaning | The decision it lets someone make | Gate |
|---|---|---|---|---|
| `id` | all | Stable and unique, never renamed or reused. The prefix is provenance only. | Cite a row from anywhere, forever | S1, R1 |
| `key` | all, until plan row 32 | Harvest key: `id` is `key` or `key/<part>`. New rows set `key = id`. | Proves no old-source item was dropped | harvest |
| `planUnit` | all | Provenance: the unit or review that found the row. Never reassigned. | Count where findings come from, for example the bug hunt | S2 |
| `title` | all | Plain words, at most 160 characters: what is wrong or wanted, as a player or maintainer would notice it. No history, lane tags or round numbers. | Read a view and act without opening `note` | S11 |
| `kind` | all | bug, feature, debt, instrument, flake, decision, process or lane (4.2) | Route the row: which queue, who closes it, what evidence closes it | S2, S9 |
| `area` | open | One of 13 parts of the game or repo (4.3) | Which rule file applies; whether the change needs the runtime-seam reviewer; where to look for a duplicate before writing a row | S3 |
| `severity` | all | HIGH, MED or LOW by player harm times reach (5.3). `unrated` only in `LANE:triage`. | Fix order inside a lane; what the Command Record counts as high | S2, S10 |
| `playerVisible` | all | True when a player on a supported device could notice it without dev tools. `bug` implies true. | Separates game defects from harness rows (plan row 30) | S9 |
| `owner` | all | command session, Kevin or AB Command | Who can close it. Kevin's rows never close on inference. | S9 |
| `state` | all | open, in-flight or closed. Closed is final. | Is someone on it? Is it over? | S2, R2 |
| `lane` | open | The id of an open or in-flight row of kind `lane` | Who owns it now. Is it an orphan? | S4 |
| `acceptance` | open | One line, 20 to 240 characters, naming the check that makes it done | When to close it, and what proof to cite | S3 |
| `blockedBy` | optional | Ids of rows that must close first | What can start now | S8 |
| `evidence` | all | Where it was seen: `path:line @sha8`, a CI run id or a doc line | Re-resolve it at HEAD before trusting it | S2 |
| `note` | optional, at most 1,500 characters | Dated facts, merged duplicate facts, a wont-fix reason, a false-positive proof | Keeps detail out of the title | S11, S5 |
| `opened` | all | Date first written | Age | S2 |
| `updated` | all | Date of the last edit, bumped by every edit | Staleness; whether triage is overdue | R3, S10 |
| `resolution` | closed only | done, duplicate, superseded, obsolete, wont-fix or false-positive | How it ended | S5 |
| `closedBy` | closed only | Typed evidence (4.5) | Check the closure without trusting the writer | S5 to S8 |
| `reopens` | optional | The id of the closed row this row is a regression of | Count fixes that did not hold | S8 |

**Retired.**
- `dupOf` moves into `closedBy` as `duplicate:<id>` when the row closes as a duplicate. On an open row it is either
  confirmed by closing the row, or dropped when the two rows are not the same root cause.
- `closedNote` is appended to `note`.

**Kept under its old name.** `planUnit` keeps its name, because the harvest gate requires it and its meaning
(provenance) differs from `lane` (ownership). Renaming it would rewrite every line for no new decision.

### 4.2 Kinds

| Kind | Means | Routes to / closes with |
|---|---|---|
| `bug` | The game does something wrong for a player now | Fixed by severity inside its lane; a commit plus a gate that went red first |
| `feature` | Something a plan promises that the player does not have yet | The programme's lane order; that lane's commits |
| `debt` | Quality with no player effect today: dead code, duplicated logic, comments or records that say what is not so, unmeasured hot-path allocations | A cleanup lane or the next change to that file. Harness LOWs are fixed or dropped (plan section 5). |
| `instrument` | A check that is missing, blind or wrong: no gate, a surviving mutant, an unmeasured number, a device or ear proof not yet run | The lane that owns the seam it guards; a commit with a `Mutation-Proof:` trailer, or a recorded measurement |
| `flake` | An existing test failing intermittently on unchanged code. One row per test case. | `LANE:flakes`; a fix, or obsolete when the case is deleted |
| `decision` | A question that must be answered before work starts or stops | The owner who decides; a DECISIONS item, never a commit alone |
| `process` | How the project runs: agent practice, repo or account settings, a one-off chore | Often AB Command or Kevin; never blocks a game lane |
| `lane` | A row that owns other rows: a plan lane, an audit fix lane, or a standing lane | Closes only when no open row names it |

No `kevin` kind: `owner` already says Kevin (one home per fact). Kevin's device runs are `instrument` rows in
`LANE:kevin`, and his reserved choices are `decision` rows.

### 4.3 Areas

`combat`, `world`, `physics`, `input`, `render`, `audio`, `ui`, `save`, `progression`, `perf`, `harness`, `docs`,
`public`. They are aligned to `frontend/src`'s directories and to the path-scoped rule files (`physics.md`,
`input-and-pointer-lock.md`, `voxel-mesher.md`, `game-code.md`). Physics, input and render are the runtime seams
where CLAUDE.md asks for a pointed adversarial reviewer. A code comment takes the area of its code. `docs` is for
records and instruction surfaces. The directory mapping is the area list in `.claude/rules/registry.md`.

### 4.4 Lanes are rows

A lane is a registry row of kind `lane`. An open row's `lane` must name a lane row that is not closed.

**Why rows and not a list in a side file.** The orphan check then reads one file. The Command Record's "fix lanes"
and "waiting on you" sections can be generated instead of hand-written: today they mirror registry rows by hand in
`command-record.json`. The pattern already exists: the deep audit wrote its 12 fix lanes as `AUDIT:lane:*` rows.

**Lane rows to create:**
- Standing lanes, which never close:
  - `LANE:triage`: new rows waiting for kind, severity, lane and acceptance; at most 7 days.
  - `LANE:backlog`: accepted work with no scheduled lane.
  - `LANE:flakes`.
  - `LANE:kevin`: device runs, the mix by ear, account steps, external sends, and decisions reserved to Kevin.
- One `LANE:<plan lane>` row for each reset-plan lane that still has open work and no lane row, for example W2-M,
  W3-A, W3-B's second half, W3-C, W3-D and W3-E.

**Existing rows that act as lanes:** `AUDIT:lane:L8-*`, `AUDIT:lane:L10-*`, `AUDIT:lane:L12-*`, `ACTIVE_PLAN:T22`
and `ACTIVE_PLAN:T23`. T22's own reviews must decide whether T22 is done, since `REVIEW:chaos-play:player-can-leave`
closed at `7f9f27ae`.

**Rows of landed lanes.** About 230 open rows name a lane that has landed. Each one is moved to a live lane or
closed. The gate then keeps it that way: closing a lane row fails while any open row still names it.

### 4.5 `closedBy` grammar, by resolution

| Form | Pattern | Allowed for |
|---|---|---|
| commits | `^[0-9a-f]{7,40}(, [0-9a-f]{7,40})*$` | done, superseded, obsolete |
| decision | `DECISIONS <date> [(<entry tag>)] item[s] N[...]` | done (kind decision; owner Kevin), superseded, obsolete, wont-fix, false-positive |
| duplicate | `duplicate:<id>` | duplicate |
| superseded | `superseded:<id>[,<id>...]` | superseded (including a split into part rows) |
| pr | `PR #N` (closed unmerged) | wont-fix |

**Checks:**
- Every sha is an ancestor of HEAD. The CI unit job already checks out with `fetch-depth: 0`.
- A DECISIONS reference identifies exactly one item. Items 1 to 10 repeat across the 2026-10-28 entries, so those
  references need the entry tag.
- `duplicate:` names a real row that is neither the row itself nor itself closed as a duplicate. No chains.
- A wont-fix note opens with `Won't fix:` and a reason of at least 40 characters.
- A false-positive note opens with `False positive:` and holds a backtick-quoted command with its output.
- An obsolete row closed by a decision holds the grep that returns nothing.
- A Kevin row closed done cites a DECISIONS item whose text names Kevin. A Kevin row closed as a duplicate points
  at another Kevin row.

The full regexes and checks are `CLOSED_BY` and `FORMS_BY_RESOLUTION` in `registry-harvest.mjs`.

### 4.6 How old prefixes map, with no id renamed

| Prefix | From | Kind default | Lane default |
|---|---|---|---|
| STATUS (102; 56 open) | STATUS section 2 and the G-ledger | G-ledger: process, instrument or debt (harness). Letter rows by content: R sweeps are debt, V checks instrument, C controls feature, D looks render bug or feature, E-ter feature. #44 and S4: Kevin. | `LANE:backlog` unless a live lane names it |
| OPEN_ITEMS (92; 47 open) | The September audit | By content; many carry `dupOf` to QUEUE rows | Backlog; settle each `dupOf` |
| QUEUE (84; 43 open) | The September ranked queue | By content | Backlog |
| ACTIVE_PLAN (41; 26 open) | Cursor tasks, the owed block, review #8, the bake-off | A T-row with rows hanging off it is a lane; owed bullets by content | The lane each bullet names |
| MASTERPIECE (29; 15 open) | The masterpiece plan | Phase items: feature. "Seen": bug in render. Questions: decision or instrument. | The reset plan's wave lane |
| PLAN, W2J, W3B (17; 17 open) | Lane follow-ups | feature, process or debt (docs) | `LANE:W3-B`, the plan row 57 doc-hygiene lane, or backlog |
| REVIEW (325; 217 open) | Lane reviews | bug, instrument or debt by content. `e2e-flakes` and `unit-flakes`: flake. | An active lane over the same area, `LANE:flakes`, or backlog |
| AUDIT (75; 20 open) | The deep audit | bug. `AUDIT:lane:*`: lane. `AUDIT:critic:*`: instrument. | The audit fix lane while it is open |
| CI, DECISIONS (2; 0 open) | One-offs | instrument, process | history |

After v2, no code reads meaning from an id prefix; it reads `kind`, `lane` or `planUnit`. New rows use the prefix of
their source: `REVIEW:<lane>:<slug>`, `AUDIT:...`, `LANE:<name>`, and `TRIAGE:<slug>` for the cleaner rows this
cleanup writes when it merges several old rows into one.

---

## 5. The disposition rubric

Each reviewer writes one JSON line per snapshot row to `dispositions/<cluster>.jsonl` (format: `rubric.json`
`dispositionRecord`). The migration script, not the reviewer, applies the dispositions (section 8).

### 5.1 Decision order (the first that applies wins)

1. **A closed row** gets a RECLASSIFY check only: fix its resolution and `closedBy`, and add its kind.
2. **A row owned by Kevin** may only be kept; closed as a duplicate of another Kevin row; or closed done or
   superseded on a DECISIONS item that records Kevin. Real-device feel, the audio mix and S4 stay his.
3. **The subject is gone at HEAD:** CLOSE-OBSOLETE.
4. **The behaviour is already true at HEAD:** CLOSE-DONE.
5. **The claim was never true:** CLOSE-FALSE-POSITIVE.
6. **A decision or a later row replaced it:** CLOSE-SUPERSEDED.
7. **Same root cause and same fix as another row:** CLOSE-DUPLICATE.
8. **Not worth doing, for a reason a skeptic accepts:** CLOSE-WONTFIX.
9. **Otherwise KEEP,** rewritten.

### 5.2 Actions and the proof each needs

| Action | Proof (run against a150a93a) | Output |
|---|---|---|
| **KEEP** | The evidence resolved at HEAD, or `read` with a note on what to check | New title (plain words, at most 160 characters); kind, area, severity (with `severityChange` when it moves), playerVisible, lane, acceptance, owner; optional blockedBy and noteAppend; evidence re-pinned `@a150a93a` |
| **CLOSE-DONE** | `git show --stat <sha>` touches the subject, and a file:line or a passing named test at HEAD shows the behaviour | `done`, closed by the sha(s), or a DECISIONS reference for a decision or Kevin row |
| **CLOSE-DUPLICATE** | Both rows' code paths named, showing the same root cause and the same fix | `duplicate:<canonical>`. `mergeInto.noteAppend` carries every fact the canonical lacks, as "From `<id>`: ...". The canonical keeps the higher severity. |
| **CLOSE-SUPERSEDED** | The decision's line, or the replacing row's id and title | `superseded:<ids>`, a DECISIONS reference, or the replacing commit. To fold N rows into one clean row, write the new row in `newRows` and close each old one as superseded by it. |
| **CLOSE-OBSOLETE** | `git grep -n <symbol> a150a93a -- <path>` returns nothing; `git log -S` names the removing commit | `obsolete`, closed by the removing sha |
| **CLOSE-WONTFIX** | The reason, checked | Closed by the triage DECISIONS item; the note opens `Won't fix:` |
| **CLOSE-FALSE-POSITIVE** | A command whose output shows the claim was never true | Closed by the triage DECISIONS item; the note opens `False positive:` and quotes the command and its output |
| **SPLIT** | The parts close separately | `newRows` as `key/<part>`, each part a full v2 row; the original closes as superseded by them |
| **RECLASSIFY** | The closing commit or decision re-read | v2 resolution and `closedBy`, plus kind. If the closure was wrong and the defect is live, the row stays closed and a new open row carries `reopens:<id>`. |

**Choosing the canonical duplicate:**
1. An open row in an active lane.
2. Else, the row whose evidence resolves at HEAD with the most precise file:line.
3. Else, the earliest row in the file.

**Acceptable wont-fix reasons:**
- A LOW harness or debt row under plan section 5 that guards no MED or HIGH player class.
- It would be a gate that cannot fail, such as a source grep (`gate-shape`).
- A decision records the choice not to do it.
- The measured cost exceeds the measured harm, with the numbers in the note.

"Low priority", "old" and "probably fine" are never reasons.

**Legacy resolutions under RECLASSIFY:**
- `cancelled` becomes superseded when a decision removed the need. W1-H item 1 retired the capture oracle and
  closed 27 rows this way. It becomes wont-fix when the decision chose not to do the work.
- `overtaken` becomes obsolete when the closing commit deleted the subject (`05e2077e` dropped the push's e2e
  receipt, and `frontend/scripts/ci/` at a150a93a has no `e2e-freshness.mjs`). It becomes superseded when a later
  design replaced it.
- `decided` becomes done.
- `parked` was never a closure: write a new backlog row with `reopens`, or wont-fix with a reason.
- `harvested` and `split` become superseded by the rows they produced.
- No resolution at all becomes done when its sha fixed the row; otherwise the reviewer judges.

**The obsolete trap.** `git grep hunger a150a93a -- frontend/src` finds only `saveSchema.js`'s tombstone; hunger
left the game in `051e5abc`. So a row about hunger's behaviour is obsolete. A row about the tests of the hunger cut
(`REVIEW:w2f:hunger-e2e-mutants-unrun`) is about those tests, which still exist. Grep for what the row is about.

### 5.3 Severity: player harm times reach

| Harm \ reach | every (every session, or a whole device class) | common (most players within an hour) | rare (an edge few reach) |
|---|---|---|---|
| **loses**: progress, a save, the session or the way forward (crash, softlock, stuck in solid), or a core verb fails | HIGH | HIGH | MED |
| **misleads**: false information, an exploit that trivialises a system, a degraded device class, a look defect on a common frame | MED | MED | LOW |
| **cosmetic**: polish, wording, a rare visual | MED | LOW | LOW |
| **none**: no player effect today | LOW | LOW | LOW |

**For kinds that are not bugs:**
- **instrument:** one step below the class it guards. It is HIGH only when its absence is why a HIGH shipped (the
  chaos-play gate).
- **feature:** HIGH when the current wave's headline rests on it; MED when players would notice it; LOW for polish.
- **flake:** MED when it failed every retry or blocked a landing in the last 10 runs; else LOW.
- **decision:** the severity of the work waiting on it.
- **process:** LOW; MED when it blocks landings; HIGH when it risks a bright line.
- **debt:** LOW, unless it hides a MED or HIGH class from review.
- **lane:** the highest severity among its open rows.

**Calibration examples from the snapshot (illustrations, not rulings):**
- `AUDIT:input:ios-death-crash`: loses, every iOS device: HIGH.
- `AUDIT:verbs:healer-unlimited-instant-heal`: an exploit on a common path: MED.
- `REVIEW:l2:last-played-this-minute`: wording: LOW.
- `REVIEW:e2e-flakes:*` that passed on retry: LOW.

### 5.4 Confidence

- **verified:** a command run against a150a93a decided it, and its decisive output is quoted in `proof`.
- **read:** judged from the row and the documents, without checking the code.
- **unverified:** a guess.

Every CLOSE, and every severity drop on a playerVisible row, needs `verified`. "Probably done" keeps the row open.
Reviewers read code and run git and unit tests. They run no local e2e or lookbook (SSD-light).

### 5.5 Standing policies

- **Harness LOWs:** fix now, or close as wont-fix under plan section 5. Keep the row only if it guards a MED or HIGH
  player class, or if it is a false line in an instruction surface (CLAUDE.md, a rule file, a binding DECISIONS item).
- **Comment rows:** rows about comments that tell history or lie consolidate into one debt row for plan row 54's
  comment pass and lint rule. Examples: `REVIEW:w2g:comments-say-history`, `REVIEW:w3b:comment-history-phrases`,
  `AUDIT:debt:comments-that-lie` and `AUDIT:ultra:ultra-game-logic-5`.
- **Flakes:** one row per test case. Each new sighting is a `noteAppend` with its PR or run id.
- **Device runs:** `REVIEW:l1:ios-device-run`, `REVIEW:l5:device-run` and the others stay separate rows in
  `LANE:kevin`, each with its own steps, so that one session on Kevin's devices clears them all.
- **Reconciliation, after every cluster is disposed:**
  - Collapse duplicate chains to their root, and refuse cycles.
  - A canonical that another cluster closed sends its duplicates back for review.
  - The deep audit's own overlap list (its section 9) is checked against the dispositions.

---

## 6. The gates that keep it clean

No new gate script. The plan's roster target is about ten, and both scripts below already run.

**Tree rules, in `parseRegistry` and a new `checkReferences`** in `registry-harvest.mjs`, run in every unit run by
`tests/scripts/registry-harvest.test.js`. `checkReferences` takes injected `git` and DECISIONS text, so the pure
parse stays pure.

| Id | Fails when |
|---|---|
| S0 | A field outside the v2 set |
| S1 | A line is not JSON with an id, or an id repeats (existing) |
| S2 | A required field is missing or outside its enum |
| S3 | An open or in-flight row lacks lane, area or acceptance (20 to 240 characters, not the title), or carries resolution or `closedBy` |
| S4 | An open row's lane is missing, not of kind lane, or closed (**the orphan check**), or an in-flight row's lane is not in flight |
| S5 | A closed row's `closedBy` does not fit the grammar for its resolution, or the reason or proof note is missing |
| S6 | A `closedBy` sha is not an ancestor of HEAD |
| S7 | A DECISIONS reference does not resolve to exactly one item |
| S8 | A `duplicate:`, `superseded:`, `blockedBy` or `reopens` pointer does not resolve, or a duplicate chains or points at itself |
| S9 | A bug with playerVisible false; a decision closed done without a DECISIONS reference; a Kevin closure outside the rules of 4.5 |
| S10 | `unrated` outside `LANE:triage`, or **a `LANE:triage` row opened more than 7 days before HEAD's committer date** |
| S11 | A title over 160 characters or a note over 1,500 |

**Range rules, in `registry-append-only.mjs`** (pre-push and CI). It already reads the registry at both ends:

| Id | Fails when |
|---|---|
| R1 | A row id is deleted (existing) |
| R2 | A row closed at the base is not closed at the head |
| R3 | A row whose text changed keeps its old `updated` |
| R4 | A row closed at the base changes a field other than resolution, `closedBy`, note, updated, kind, area, lane or acceptance |

R2 also keeps `registry-dedupe.mjs` correct with no change. Its "furthest along wins" rule is only safe if closed
is final.

**The triage window is by commit date, not wall clock.** The same sha always gives the same verdict, so main never
turns red by itself. A new push fails only when a triage row is more than 7 days old. Clearing it is a two-minute
job for the command session, which owns both the triage and the landing. The cost: an unrelated landing can be
held by an overdue row. That is the point of the rule, and the opposite choice is a junk drawer.

**What stays advisory, said so:**
- A `LANE:backlog` row not updated in 60 days is listed by `orient`, not failed. Closing on age is closing on an
  assumption.
- Whether an acceptance is truly checkable is the reviewer's judgment. The gate checks only its form.

**Mutation proof.** Each S and R rule gets a fixture case in `registry-harvest.test.js` or
`registry-append-only.test.js` that fails it. The v1 registry at a150a93a must fail S0 to S4. The migrated registry
must pass. A fake sha, a dangling `duplicate:`, a reopened row and an orphaned row must each turn red. That is the
`Mutation-Proof:` trailer of the landing commit.

**Blind spots, stated.**
- S6 proves a sha exists on main, not that it fixed the row. The verifier checks that it does.
- S7 proves an item exists, not that it says what the row claims.
- Acceptance quality is reviewed, not gated.
- A wrong kind or area passes.

---

## 7. Views, and how the Command Record reads the registry

**No committed views.** Plan section 5's "STATUS §1 ... with a generated registry view" would conflict on every lane
landing, because every lane adds rows, and it would go stale between refreshes. Views are computed when asked:
- `npm run orient` prints one summary line, for example
  `registry 790 rows: 300 open (bug 120, feature 40, ...), 0 in flight, 490 closed; open HIGH 14; waiting on Kevin 12; triage 0 (overdue 0); orphans 0`.
  The numbers above are placeholders.
- `npm run orient -- --registry <lane|kind|area|owner>` prints the open rows grouped, HIGH first. This is the search
  a writer runs before adding a row.
- `command-record.mjs` reads the registry when it writes the page:
  - **Open work:** `N open: H high, M medium, L low; B bugs, F features, U upkeep; K wait on you; C closed.`
    Plain words, per DECISIONS items 280 and 281.
  - **Waiting on you:** generated from the open rows owned by Kevin, by lane, replacing the hand-kept list in
    `command-record.json`.
  - **The fix lanes:** generated from the rows of kind lane, each with its state and its open and closed counts.
  - The bug-hunt count reads `planUnit` instead of `id.startsWith('AUDIT:')`.

---

## 8. Migration plan

1. **Dispose (this workflow).** Reviewers write `dispositions/<cluster>.jsonl` under `rubric.json`. An independent
   verifier re-checks:
   - every CLOSE of a HIGH, MED, playerVisible or Kevin row;
   - every severity drop;
   - at least a third of the LOW closures;
   - every duplicate pair.
   It refutes by running the proof command. Reconciliation (5.5) then runs over the union.
2. **Apply with a script, not by hand.** `frontend/scripts/ci/registry-migrate.mjs` applies the dispositions to
   whatever main's registry is at landing time. It is idempotent.
   - A row whose line differs from the snapshot is skipped and listed for re-review, because a lane edited it
     meanwhile.
   - Rows added after the snapshot are left as they are, and the v2 gate names their missing fields.
   - It creates the lane rows, sets `updated`, moves `dupOf` and `closedNote`, rewrites the 8 legacy `closedBy`
     forms, and never deletes a line.
   - Rows keep their file order, because the union merge depends on appends at the end.
3. **One landing.** In one PR:
   - the gate code (S0 to S11, R2 to R4) and its fixtures;
   - the migrated registry;
   - `orient` and `command-record` reading the new fields;
   - `.claude/rules/registry.md`: under 80 lines, path-scoped to `memory/registry.jsonl`, giving field meanings,
     intake rules and the close grammar. A unit test checks that its value lists match the code's enums.
   - the read-order note for CLAUDE.md, via `read-order.mjs`;
   - a DECISIONS entry.

   Merge main in, re-run the migration, run CI on the exact sha, then fast-forward. Land at a quiet point: no open PR
   edits existing registry rows (`gh pr list` plus `git diff --stat origin/main...<branch> -- memory/registry.jsonl`).
   This avoids union-merge copies that `registry-dedupe` would refuse.
4. **The DECISIONS entry records:**
   - Schema v2. It amends W1-H item 9 and plan row 30's field list, and supersedes plan section 5's generated STATUS
     view, for the reason in section 7.
   - Lanes as rows.
   - The rubric.
   - One item number that every triage wont-fix, false-positive and decision-closed obsolete row cites, with each
     row's own reason in its note.
5. **Then plan row 32.** Retire the old sources (STATUS §2, QUEUE, OPEN-ITEMS, the masterpiece tables). The triage
   will have closed or re-homed their rows, so `registry-harvest`'s extraction half and `registry-floors.json` can
   go. That moves the roster toward the plan's ten, and makes `key` optional.

---

## 9. Intake rules (one more reason it stays a masterpiece)

These go into `.claude/rules/registry.md`. Rules 1, 4, 6 and 7 are checked by the gates; the rest by review.

1. Write a row only for work you will not do in this change.
2. One row per root cause, never per symptom or per sighting.
3. Search open rows by area before writing (`orient -- --registry area`). A new sighting of a known problem goes
   into that row's note.
4. Fill kind, area, severity, lane and acceptance when you write the row. `LANE:triage` is only for bulk intake
   (an audit, a review round) and lasts at most 7 days.
5. Harness LOWs: fix or drop (plan section 5), unless they guard a MED or HIGH player class.
6. Kevin owns a row only for his device, his ear, money, an account sign-in, an external send needing his OK, or a
   decision a source reserves for him (W1-H item 9).
7. Never reopen: a regression is a new row with `reopens`.

---

## 10. Win, Compose, Door, Rails, Threat

- **Win.** Lanes as rows plus the orphan gate turn "who owns this?" from a judgment into a failing check. Landing a
  lane forces its leftovers to be moved or closed in the same change, so the list cannot rot the way it did when
  about 230 rows outlived their lanes. The Command Record's lane and waiting sections then come from the list
  instead of being kept by hand.
- **Compose.**
  - The cleanup and plan row 32 go in sequence: the cleanup makes row 32 cheap, and row 32 retires a gate.
  - Schema and data land in one PR, so the gate is shown red on the old data first.
  - Not either/or: reviewers dispose of rows while the gate code is written, because neither needs the other until
    the landing.
- **Door.**
  - The closed field set and the closedBy grammar can be widened later by a DECISIONS entry. They are two-way.
  - "Closed is final" is the one-way door: once R2 ships, a wrong closure is repaired by a new row, never by
    reopening. That keeps the dedupe rule sound.
  - The id prefixes stay frozen; a new prefix is free to add.
- **Rails.**
  - It holds on every channel the registry touches: unit run, pre-push, CI (with full history), `orient`, the
    Command Record and the cold-takeover eval. `registryCounts` keeps its API and gains fields.
  - The union merge stays. The quiet-point landing is the only coordination this needs.
- **Threat.**
  - A reviewer closes on a sha that fixed something else. Counter: the verifier's `git show --stat` check.
  - The 7-day triage rule holds up a hotfix. Counter: the command session clears triage at each landing.
  - The file grows (708 KB for 767 rows, about 0.9 KB a row). The caps on title and note bound row size. When the
    file passes about 2 MB, closed rows older than 90 days could move to `memory/registry-archive.jsonl`, with both
    gates reading the two files as one id space. This is deferred, and should be a registry row of its own.

## 11. What this design leaves to the reviewers

- Every row's disposition, every canonical choice and every re-rating.
- Which lanes have landed (from the reset plan's lane table and the merged PRs, re-measured with `gh`).
- The exact list of `LANE:<plan lane>` rows needed.
- Whether `ACTIVE_PLAN:T22` and `T23` close.
