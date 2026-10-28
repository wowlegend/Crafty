#!/bin/sh
# Write the green-tree receipt that pre-push honours — but ONLY for a tree that was actually tested.
#
#   sh ci/write-receipt.sh <receipt-dir> <tier>
#   writes <receipt-dir>/<tree>, holding `<tree> <tier> <utc>`. One file per tree, so receipts written by different
#   lanes never evict each other, and none is pruned: a tree hash names its content, so an old file never speaks for
#   a different tree. pre-push honours only a `certify` receipt (ci/pipeline.sh --tier=certify).
#   exit 0  receipt written and read back
#   exit 1  REFUSED: the working tree the pipeline just tested is not the index being committed
#   exit 2  usage: no receipt directory, or no tier
#   exit 3  COULD NOT write (write-tree failed, or the file did not land)
#
# WHY THIS IS ITS OWN FILE. The receipt used to be written inline at the end of ci/pipeline.sh, keyed on
# `git write-tree` — the INDEX. But every step the pipeline runs (eslint, vitest, vite build, doc-currency)
# reads the WORKING TREE. With a partial stage (`git add -p`, or one file staged out of three edited) the
# two differ: the pipeline tests tree W, certifies tree I, and pre-push then skips the offline core for I
# — a tree no gate ever ran against. Found by the 2026-09-22 independent review (QUEUE R1.3).
#
# A refusal costs nothing but time: no receipt means pre-push certifies the commit in full, in a fresh
# worktree of exactly what is being pushed. So this fails toward the slow, correct path.
#
# WHAT COUNTS AS "DIFFERS" — the pipeline's INPUTS, declared rather than excepted:
#   - any unstaged change to a tracked file, anywhere. No carve-out: `.state/` (the operator's session
#     harness log, rewritten continuously) used to be excepted here because it was TRACKED; it is ignored
#     and untracked now, so nothing tracked needs an exception, and an exception is where the next defect
#     would live.
#   - any untracked, non-ignored file under a directory a step reads (INPUT_ROOTS). An untracked test in
#     frontend/src/ runs under vitest yet is not in the commit — the same defect by another door.
#     Untracked files OUTSIDE these roots (editor/agent config at the root) are read by no step.
#
# BLIND SPOT: a step that starts reading a new top-level directory makes INPUT_ROOTS stale, and nothing
# here will notice. tests/scripts/write-receipt.test.js pins the list against the directories the
# pipeline actually cd's into or names; widen both together.

set -u

RECEIPT_DIR="${1:-}"
TIER="${2:-}"
if [ -z "$RECEIPT_DIR" ] || [ -z "$TIER" ]; then
  echo "usage: sh ci/write-receipt.sh <receipt-dir> <tier>" >&2
  exit 2
fi
# THE TREE IS FOUND WITH GIT_* SCRUBBED; IT IS CERTIFIED WITH GIT'S OWN. pipeline.sh runs this from frontend/, and in
# a LINKED worktree git hands its hooks an absolute GIT_DIR with no GIT_WORK_TREE, under which git takes the CURRENT
# directory as the top of the work tree: `--show-toplevel` answered frontend/, every tracked path outside it read as
# deleted, and every lane commit's receipt was refused ("1255 path(s) differ", tranche A review, 2026-10-27). So the
# toplevel is located by discovery from the cwd (run_scrubbed, ci/git-env.sh), and every git below runs from that
# toplevel with the hook's variables intact — GIT_INDEX_FILE is the index being committed, which is the point.
# Proven by tests/scripts/write-receipt.test.js ("run from a LINKED WORKTREE's hook").
. "$(dirname "$0")/git-env.sh" || exit 3
ROOT=$(run_scrubbed git rev-parse --show-toplevel) || exit 3
cd "$ROOT" || exit 3

INPUT_ROOTS="frontend ci .githooks docs memory .github"

# shellcheck disable=SC2086
DIRTY=$( { git diff --name-only -- .; git ls-files --others --exclude-standard -- $INPUT_ROOTS; } 2>/dev/null )
if [ -n "$DIRTY" ]; then
  N=$(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')
  printf '\033[33m  receipt REFUSED: the tested working tree is not the index being committed (%s path(s) differ, e.g. %s)\033[0m\n' \
    "$N" "$(printf '%s\n' "$DIRTY" | head -1)"
  printf '\033[33m  the gates ran against unstaged/untracked content — the push will certify the commit in full\033[0m\n'
  exit 1
fi

TREE=$(git write-tree 2>/dev/null || true)
if [ -z "$TREE" ]; then
  printf '\033[33m  receipt NOT written: git write-tree failed — the push will certify in full\033[0m\n'
  exit 3
fi

RECEIPT="$RECEIPT_DIR/$TREE"
# VERIFY THE ARTIFACT, NEVER THE INTENT: read the file back. A receipt CLAIMED but absent is a silent lie
# about what was checked; an earlier version printed "certified" on a write that had just failed.
if mkdir -p "$RECEIPT_DIR" 2>/dev/null &&
   printf '%s %s %s\n' "$TREE" "$TIER" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >| "$RECEIPT" 2>/dev/null &&
   [ "$(cut -d' ' -f1-2 "$RECEIPT" 2>/dev/null)" = "$TREE $TIER" ]; then
  printf '\033[2m  receipt: tree %.10s certified (%s) — a push of this tree skips the offline core\033[0m\n' "$TREE" "$TIER"
  exit 0
fi
printf '\033[33m  receipt NOT written to %s — the push will certify in full\033[0m\n' "$RECEIPT"
exit 3
