# Crafty SOTA campaign — 2026-09-22

Kevin's standing goal (verbatim): *"enhance Crafty to be cutting edge SOTA and future-proof too
(as of today sep.22), do it extremely well. you have full autonomy. ... you should enumerate and
treat every single historical punted / still-remaining bug or decision. and the gates skill /
acceptance test principles evolved a lot too, review and enumerate every single existing gate /test
first, prune / enhance them all. don't miss anything. also of utmost importance is how Crafty looks,
and gameplay, do these extremely well."*

This file is the EXTERNAL REFERENCE OF RECORD the Verify Gate audits against. Rows are added by the
enumeration phase and never silently dropped: a row leaves only as DONE-WITH-EVIDENCE, PUNTED (with
reason) or MISSED (named).

## Measured starting state (2026-09-22, commands in the row)

| Population | Count | Command |
|---|---:|---|
| `tests/gates/*.test.js*` | 181 | `ls frontend/tests/gates/*.test.js* \| wc -l` |
| of which source-grep (frozen ledger) | 106 | `.source-grep-ledger.json _count` |
| `tests/scripts/*.test.js` | 18 | `ls frontend/tests/scripts/*.test.js \| wc -l` |
| all `frontend/tests/**` test files | 292 | `find frontend/tests -name '*.test.js*' \| wc -l` |
| colocated `src/**/*.test.js*` | 135 | `find frontend/src -name '*.test.js*' \| wc -l` |
| e2e specs | 20 | `ls frontend/tests/e2e/*.spec.js \| wc -l` |
| `scripts/ci/*.mjs` | 21 | `ls frontend/scripts/ci/*.mjs \| wc -l` |
| `scripts/visual/*.mjs` (probes) | 29 | `ls frontend/scripts/visual/*.mjs \| wc -l` |
| gated visual frames | 31 | `ls frontend/tests/visual/baseline/*.png \| wc -l` |
| open-markers across 9 doc surfaces | 537 | `grep -ciE 'OWED\|PARKED\|...' per surface` |

Last CI on main: `success` @ 46a3601. HEAD `ceef70a4`. Last Crafty work before this: 2026-08-13
(~40 days of drift; two Sep 19-20 commits came from other sessions).

## The governing finding (before any work)

`gate-shape-kz` R9 says **volume is not the variable** and that the scarce factor for an agent is
**ACCEPTANCE AUTHORITY** — where the criterion came from — not E2E scope. Crafty is the exact shape
R9 describes: enormous assertion volume, and a criterion set almost entirely authored by the same
agent in the same pass as the code. `PROVENANCE tier 3 with no killability receipt is decoration.`

So the gate work here is NOT "add more tests". It is: classify every existing check by provenance
tier and demonstrated killability, delete the decorative ones, and move the surviving budget to the
tier that can actually catch a defect — acceptance criteria that predate the implementation, and
invariants the author did not write.

## Phases

- **P0** — plan + inventory scaffold. (this file)
- **P1** — ENUMERATE (read-only, fan-out): gate/test inventory · open-items ledger · visual state ·
  future-proofing/dep drift.
- **P2** — PRUNE + ENHANCE gates against R1-R12.
- **P3** — TREAT every enumerated punted bug/decision.
- **P4** — LOOKS + GAMEPLAY (Kevin: "of utmost importance").
- **P5** — RSI/flywheel persistence at each ~300k context boundary (Crafty + Agentic-Brain).

## Ledger

Populated by P1. See `GATES.md`, `OPEN-ITEMS.md`, `LOOKS.md`, `FUTUREPROOF.md` in this directory.
