#!/bin/bash
# mutate.sh — apply ONE deliberate defect to a subject file, run ONE spec, restore, report.
#
#   sh scripts/dev/mutate.sh <subject> <spec> <expected-test-count> <label> <old> <new>
#
#   exit 0  RED       — the spec caught the mutant (the gate reacts to this defect)
#   exit 1  SURVIVED  — the spec stayed green on a broken subject: THE GATE HAS A HOLE
#   exit 3  COULD NOT CHECK — no verdict; never read this as a pass
#
# WHY THIS FILE EXISTS. The 2026-09-22 SOTA session ran ~100 mutations to put a killability receipt on
# every gate it touched, through a harness that lived in a session scratchpad and would have been reaped
# with it. The most-used instrument of the session was the one thing not in the repo. It is here now so
# the next session proves its gates instead of rebuilding the prover.
#
# EVERY GUARD BELOW WAS EARNED BY A FAILURE OF THE PREVIOUS VERSION:
#
#  - IT OWNS ITS BACKUP. The scratchpad version required the caller to `cp` the subject first. One restore
#    failed with a single easily-missed line while the RED verdict printed normally underneath, the
#    subject stayed mutated (a water guard deleted from mesher.js), and the next mutation stacked on top
#    of it. A precondition the caller can forget is a precondition that will be forgotten.
#  - IT RESTORES ON INTERRUPT. A killed run used to leave the subject mutated (gate-shape R8c).
#  - THE ANCHOR MUST BE UNIQUE. A non-unique `old` is refused, not "first match replaced": the occurrence
#    you meant may not be the load-bearing one, which is how a mutation lands in a comment and survives.
#  - THE MUTATION MUST TAKE. The written file is read back; a no-op write is COULD NOT CHECK, never a
#    survivor.
#  - THE DENOMINATOR IS READ FROM BOTH vitest SHAPES. vitest prints per-test lines only when something
#    fails; an all-pass run prints a compact "(N tests)". Counting only per-test lines read 0 on a green
#    run and reported a SURVIVING mutant as "could not check" — hiding the exact outcome this exists for.
#  - A RED VERDICT IS CONFIRMED AGAINST A GREEN BASELINE. If the spec is already red on the untouched
#    subject, every mutant scores "caught" and the campaign reports a perfect result that means nothing.
#    Paid only on RED results, which are the only ones the baseline can invalidate.
#
# Keep mutations PLAUSIBLE-WRONG (halve a constant, flip a comparison, drop one branch), not just deletions:
# a gate that reds when damage is deleted and stays green when damage is halved has only proven necessity.
set -u
cd "$(dirname "$0")/../.." || exit 3

SUBJ="${1:-}"; SPEC="${2:-}"; EXPECT="${3:-}"; LABEL="${4:-}"; OLD="${5:-}"; NEW="${6-}"
if [ -z "$SUBJ" ] || [ -z "$SPEC" ] || [ -z "$EXPECT" ] || [ -z "$LABEL" ] || [ -z "$OLD" ]; then
  echo "usage: mutate.sh <subject> <spec> <expected-test-count> <label> <old> <new>" >&2; exit 3
fi
[ -f "$SUBJ" ] || { echo "  [3] $LABEL — subject not found: $SUBJ"; exit 3; }

BAK="$(mktemp "${TMPDIR:-/tmp}/mutate-bak.XXXXXX")" || exit 3
OUT="$(mktemp "${TMPDIR:-/tmp}/mutate-out.XXXXXX")" || exit 3
cp "$SUBJ" "$BAK" || { echo "  [3] $LABEL — could not back up $SUBJ"; exit 3; }

restore() {
  if ! cp "$BAK" "$SUBJ" || ! cmp -s "$BAK" "$SUBJ"; then
    echo "  [3] $LABEL — RESTORE FAILED. $SUBJ IS STILL MUTATED. Restore it before anything else: cp $BAK $SUBJ" >&2
    exit 3
  fi
  rm -f "$BAK" "$OUT" "${JSON:-}"
}
trap 'restore' EXIT
trap 'exit 3' INT TERM

python3 - "$SUBJ" "$OLD" "$NEW" <<'PY' || { echo "  [3] $LABEL — anchor missing or not unique"; exit 3; }
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text()
old, new = sys.argv[2], sys.argv[3]
n = s.count(old)
if n != 1:
    sys.stderr.write(f"ANCHOR x{n}\n"); sys.exit(1)
p.write_text(s.replace(old, new, 1))
if p.read_text() == s:
    sys.stderr.write("mutation did not change the file\n"); sys.exit(1)
PY

# THE COUNT AND THE RED TITLES COME FROM VITEST'S JSON REPORTER, never from its human-readable output. Until
# 2026-10-27 this grepped the default reporter's "   ✓ " / "(N tests)" lines; vitest 4 stopped printing either when
# stdout is not a TTY, and every mutation — the identity one too — read "collected 0" (COULD NOT CHECK: it failed
# closed, which is the only reason it was noticed rather than believed). A machine-readable verdict does not move
# with a reporter's cosmetics.
JSON="$(mktemp "${TMPDIR:-/tmp}/mutate-json.XXXXXX")" || exit 3
run_spec() {
  rm -f "$JSON"
  npx vitest run "$SPEC" --reporter=json --outputFile="$JSON" > "$OUT" 2>&1
}
# Prints the collected test count on line 1, then one failed test title per line.
read_json() {
  node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(r.numTotalTests ?? 0); for (const f of r.testResults || []) for (const a of f.assertionResults || []) if (a.status === "failed") console.log(a.title); } catch { console.log(0); }' "$JSON"
}

run_spec; RC=$?
N=$(read_json | head -1)
if [ "$N" -ne "$EXPECT" ]; then echo "  [3] $LABEL — COULD NOT CHECK: collected $N of $EXPECT"; exit 3; fi

if [ "$RC" -eq 0 ]; then
  echo "  [GREEN — MUTANT SURVIVED] $LABEL"
  exit 1
fi

REDLINES="$(read_json | tail -n +2 | sed -E 's/^/         /')"
cp "$BAK" "$SUBJ" || exit 3
run_spec; BASE=$?
if [ "$BASE" -ne 0 ]; then
  echo "  [3] $LABEL — the spec is RED on the UNMUTATED subject, so this RED proves nothing"; exit 3
fi
echo "  [RED] $LABEL"
[ -n "$REDLINES" ] && echo "$REDLINES"
exit 0
