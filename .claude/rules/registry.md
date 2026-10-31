---
paths:
  - "memory/registry.jsonl"
  - "frontend/scripts/ci/registry-*.mjs"
  - "frontend/tests/scripts/registry-*.test.js"
  - "docs/superpowers/registry-v2-*.jsonl"
---
# The registry: one list of open work

`memory/registry.jsonl` is the one home for open work, one JSON object per line. The gates check every rule here
that has an id (S0-S11 in `frontend/scripts/ci/registry-harvest.mjs`, R1-R4 in `registry-append-only.mjs`); the
reasons are DECISIONS 2026-10-31 (registry v2) items 361-368.

## A row

| Field | On | What it says |
|---|---|---|
| `id` | every row | Never renamed or reused. A new row takes its source's prefix: `REVIEW:<lane>:<slug>`, `AUDIT:...`, `LANE:<name>`, `TRIAGE:<slug>`. |
| `key` | every row | The id, or for a split part the id it was split from (`key/<part>`). |
| `planUnit` | every row | Where it was found. Never reassigned: who owns it now is `lane`. |
| `title` | every row | What is wrong or wanted, in plain words, at most 160 characters. No history. |
| `kind`, `severity`, `playerVisible`, `owner`, `state` | every row | The values below. A `bug` is always `playerVisible`. |
| `area` | open rows | The part of the game or repo; it says which rule file and reviewer apply. |
| `lane` | open rows | An open row of kind `lane`. A lane row has no lane. |
| `acceptance` | open rows | One line, 20 to 240 characters, naming the check that makes it done. Not the title. |
| `blockedBy`, `reopens` | optional | Ids: rows that must close first; the closed row this one is a regression of. |
| `evidence` | every row | Where it was seen (`path:line @sha8`, a CI run). Re-read it at HEAD before trusting it. |
| `note` | optional | Dated facts, a merged duplicate's facts, a reason. At most 1,500 characters. |
| `opened`, `updated` | every row | YYYY-MM-DD. Every edit moves `updated` to the day of the edit. |
| `resolution`, `closedBy` | closed rows | How it ended, and its proof (below). |

No other field: an unknown one fails the gate.

## Values

- kind: `bug`, `feature`, `debt`, `instrument`, `flake`, `decision`, `process`, `lane`
- area: `combat`, `world`, `physics`, `input`, `render`, `audio`, `ui`, `save`, `progression`, `perf`, `harness`, `docs`, `public`
- severity: `HIGH`, `MED`, `LOW`, `unrated`
- owner: `command session`, `Kevin`, `AB Command`
- state: `open`, `in-flight`, `closed`
- resolution: `done`, `duplicate`, `superseded`, `obsolete`, `wont-fix`, `false-positive`

A bug is wrong for a player now; a feature is promised and not built; debt has no player effect today; an instrument
is a check that is missing, blind or not yet run (a surviving mutant, a device or ear run); a flake is one test case
failing on unchanged code; a decision closes on a DECISIONS item. Severity is player harm times reach: HIGH when a
player loses progress, a save or the way forward on a common path; `unrated` only in `LANE:triage`.

## Lanes are rows

The standing lanes are `LANE:triage` (bulk intake only, at most 7 days by HEAD's commit date), `LANE:backlog`
(accepted, not scheduled; `orient` lists rows not updated in 60 days, and nothing closes on age), `LANE:flakes` and
`LANE:kevin` (his device, ear, money, sign-ins, external sends, decisions reserved to him). A plan or fix lane gets
its own row. **A lane closes only when no open row names it, so a lane that lands moves or closes its leftovers in
the same change.**

## Closing a row

| resolution | closedBy | The note must also say |
|---|---|---|
| done | the commit sha(s) `abc1234, def5678`, a DECISIONS item, or `PR #N` when that PR was the task | |
| duplicate | `duplicate:<id>`, a row not itself a duplicate | (its facts move into that row as "From <id>: ...") |
| superseded | `superseded:<id>[,<id>]`, a DECISIONS item, or a commit | |
| obsolete | the commit that removed the subject, or a DECISIONS item | on an item: "Obsolete: " and the grep that finds nothing |
| wont-fix | a DECISIONS item, or `PR #N` closed unmerged | "Won't fix: " and a reason a skeptic accepts |
| false-positive | a DECISIONS item | "False positive: " and the backticked command that shows it |

A DECISIONS item is `DECISIONS <date> [(<tag>)] item[s] N` and must name exactly one item; a sha must be on HEAD's
history. A Kevin row closes only as a duplicate of another Kevin row, or done or superseded on an item that names him.
**Closed is final:** a regression is a new row with `reopens`, and a closed row may change only its closure, note,
kind, area, lane and acceptance.

## Writing a row

1. Write a row only for work you will not do in this change. One row per root cause, never per sighting.
2. Search first: `cd frontend && npm run orient -- --registry area` (or `lane`, `kind`, `owner`). A new sighting
   of a known problem goes into that row's note.
3. Fill kind, area, severity, lane and acceptance when you write it. A harness LOW is fixed or dropped unless it
   guards a MED or HIGH player class (reset plan section 5).
4. Append new rows at the end: the file merges by union, and `registry-dedupe.mjs` collapses a row a merge left twice.
