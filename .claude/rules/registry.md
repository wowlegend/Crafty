---
paths:
  - "memory/registry.jsonl"
  - "frontend/scripts/ci/registry-*.mjs"
  - "frontend/tests/scripts/registry-*.test.js"
  - "docs/superpowers/registry-v2-*.jsonl"
---
# The registry: one list of open work

`memory/registry.jsonl` is the one home for open work, one JSON object per line. A rule below that names a gate in
parentheses fails that gate when it is broken: S0-S11 check the tree (`frontend/scripts/ci/registry-harvest.mjs`, every
unit run) and R1-R4 check a change (`registry-append-only.mjs`, on push and in CI). A rule that names none is advisory:
nothing checks it. The reasons are DECISIONS 2026-10-31 (registry v2) items 361-368.

## A row

| Field | On | What it says |
|---|---|---|
| `id` | every row | Unique (S1), and never removed (R1). A new row takes its source's prefix: `REVIEW:<lane>:<slug>`, `AUDIT:...`, `LANE:<name>`, `TRIAGE:<slug>`. |
| `key` | every row | The id, or for a split part the id it was split from, as `key/<part>` with a lower-case slug for the part (S2). |
| `planUnit` | every row | Where it was found; who owns it now is `lane`. Frozen once the row is closed (R4); on an open row, advisory. |
| `title` | every row | What is wrong or wanted, in plain words, at most 160 characters (S11), frozen once closed (R4). No history. |
| `kind`, `severity`, `playerVisible`, `owner`, `state` | every row | The values below (S2). A `bug` is always `playerVisible` (S9). |
| `area` | open rows | The part of the game or repo (S3); it says which rule file and reviewer apply. |
| `lane` | open rows | An open row of kind `lane` (S3, S4); an in-flight row's lane is in flight (S4). A lane row has no lane (S3). |
| `acceptance` | open rows | One line of 20 to 240 characters that is not the title (S3), naming the check that makes it done (advisory). |
| `blockedBy`, `reopens` | optional | Ids of rows (S2, S8): rows that must close first; the closed row this one is a regression of. |
| `evidence` | every row | Where it was seen (`path:line @sha8`, a CI run). Re-read it at HEAD before trusting it. |
| `note` | optional | Dated facts, a merged duplicate's facts, a reason. At most 1,500 characters (S11). |
| `opened`, `updated` | every row | YYYY-MM-DD (S2). An edit moves `updated` forward: a changed row fails when its `updated` is missing, moved back, or more than a day older than the head commit's date (R3). |
| `resolution`, `closedBy` | closed rows | How it ended, and its proof (below). An open row has neither (S3). |

No other field (S0).

## Values

- kind: `bug`, `feature`, `debt`, `instrument`, `flake`, `decision`, `process`, `lane`
- area: `combat`, `world`, `physics`, `input`, `render`, `audio`, `ui`, `save`, `progression`, `perf`, `harness`, `docs`, `public`
- severity: `HIGH`, `MED`, `LOW`, `unrated`
- owner: `command session`, `Kevin`, `AB Command`
- state: `open`, `in-flight`, `closed`
- resolution: `done`, `duplicate`, `superseded`, `obsolete`, `wont-fix`, `false-positive`

A bug is wrong for a player now; a feature is promised and not built; debt has no player effect today; an instrument
is a check that is missing, blind or not yet run (a surviving mutant, a device or ear run); a flake is one test case
failing on unchanged code; a decision closes on a DECISIONS item. Which kind and area a row gets is advisory. Severity
is player harm times reach: HIGH when a player loses progress, a save or the way forward on a common path. `unrated`
is allowed only on an open row in `LANE:triage` (S10).

## Lanes are rows

The standing lanes are `LANE:triage` (bulk intake: a row there fails once its `opened` is more than 7 days before
HEAD's commit date (S10), so it takes new rows, not old ones moved in), `LANE:backlog` (accepted, not scheduled;
`orient` counts the rows not updated in 60 days, and nothing closes on age), `LANE:flakes` and `LANE:kevin` (his device,
ear, money, sign-ins, external sends, decisions reserved to him). A plan or fix lane gets its own row. A lane row
closes only when no open row names it (S4). Nothing ties a PR's landing to its lane row: the landing change moves or
closes the lane's leftovers and closes the lane row (advisory; a lane row left open after its PR lands is not seen).

## Closing a row

| resolution | closedBy | The note must also say |
|---|---|---|
| done | the commit sha(s) `abc1234, def5678`, a DECISIONS item, or `PR #N` when that PR was the task | |
| duplicate | `duplicate:<id>`, a row not itself a duplicate | (its facts move into that row as "From <id>: ...", advisory) |
| superseded | `superseded:<id>[,<id>]`, a DECISIONS item, or a commit | |
| obsolete | the commit that removed the subject, or a DECISIONS item | on an item: "Obsolete: " and the grep that finds nothing |
| wont-fix | a DECISIONS item, or `PR #N` closed unmerged | "Won't fix: " and a reason of at least 40 characters |
| false-positive | a DECISIONS item | "False positive: " and the backticked command that shows it |

The form of `closedBy` and the sentence its note must hold are S5; whether the reason convinces is advisory. A sha must
be on HEAD's history (S6), or on MERGE_HEAD's while a merge is unfinished (the next section), which proves ancestry, not
that it fixed the row. A DECISIONS reference is
`DECISIONS <date> [(<tag>)] item[s] N` and names exactly one item (S7); when two entries of a date share a number, it
names the entry's tag. A `duplicate:` or `superseded:` target is a row other than this one, and a duplicate's target is
not itself a duplicate (S8). A decision closes done only on a DECISIONS item (S9). A Kevin row closes only as a
duplicate of another Kevin row, or done or superseded on a DECISIONS item whose text names him (S9: the gate matches
his name; that he made the decision is the writer's to check).

**Closed is final.** A row closed at a change's base is closed at its head (R2); a regression is a new row whose
`reopens` names the closed row (S8). A closed row that was already v2 at the base (it has a `kind`) may change only its
closure, note, kind, area, lane and acceptance (R4).

## Writing a row

1. Write a row only for work you will not do in this change. One row per root cause, never per sighting.
2. Search first: `cd frontend && npm run orient -- --registry area` (or `lane`, `kind`, `owner`). A new sighting
   of a known problem goes into that row's note.
3. Fill kind, area, severity, lane and acceptance when you write it (S2, S3). A harness LOW is fixed or dropped unless
   it guards a MED or HIGH player class (reset plan section 5; advisory).
4. Append new rows at the end: the file merges by union, and `registry-dedupe.mjs` collapses a row a merge left
   twice, keeping the copy furthest along (closed, then in flight, then open) and dropping the other copy's edits, so
   read what it drops.

## Merging main into a lane

Take main in with a plain two-parent merge (`git merge origin/main`, the way `CLAUDE.md` "Landing" says), and the commit
goes through the hook. A merge commit's pre-commit runs while HEAD is still the lane's own tip, so S6 also counts a sha
that `MERGE_HEAD` reaches, as long as `git rev-parse -q --verify MERGE_HEAD` resolves: the shas main added to the
registry read as on the history before the merge commit exists. The allowance is that narrow. A sha on a branch the
merge does not take in, or on no branch, still fails S6, and so does every sha once `git merge --abort` has run. A
squash merge leaves no `MERGE_HEAD` and an octopus merge reads only its first merged commit, so neither gets the
allowance. A red S6 during a merge therefore means a sha that no branch the merge brings in holds: fix the row, never
`--no-verify`.

## Landing beside the v2 migration

Registry v2 rewrote every row in one change, so a branch cut before it cannot merge its registry edits by union: the
whole file conflicts and comes out twice, and dedupe would keep one copy of each row and drop the other's edits.

- **A branch that lands before v2.** The v2 landing merges main, takes main's registry as it is, and runs
  `registry-migrate.mjs` again. The migration refuses to write a row a lane changed or added that no landing record has
  read: each record in `docs/superpowers/registry-v2-landing.jsonl` names the hash of the row it was written against
  (`against`), a READ record when the merge may stand, and a record whose row changed since is a conflict too.
- **A branch cut before v2 that lands after it.** Merge main, take main's registry
  (`git show origin/main:memory/registry.jsonl >| memory/registry.jsonl`), and write each row edit the branch made again,
  in v2 form; `git diff <merge-base> <the branch's last commit before the merge> -- memory/registry.jsonl` lists them.
  The S rules check the form of the result; that every edit was carried over is advisory. Do not run dedupe on it.
