#!/bin/sh
# Write the green-tree receipt that pre-push honours — but ONLY for a tree that was actually tested.
#
#   sh ci/write-receipt.sh <receipt-path>
#   exit 0  receipt written and read back
#   exit 1  REFUSED: the working tree the pipeline just tested is not the index being committed
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
#   - any unstaged change to a tracked file, anywhere, EXCEPT `.state/`: tracked, rewritten continuously by
#     the operator's session harness, and read by no pipeline step (grep ci/ and frontend/scripts/ci/ for
#     a `.state/` path: none). Without this one exclusion no receipt could ever be written in the checkout
#     the harness runs in, and the optimisation would silently become dead.
#   - any untracked, non-ignored file under a directory a step reads (INPUT_ROOTS). An untracked test in
#     frontend/src/ runs under vitest yet is not in the commit — the same defect by another door.
#     Untracked files OUTSIDE these roots (editor/agent config at the root) are read by no step.
#
# BLIND SPOT: a step that starts reading a new top-level directory makes INPUT_ROOTS stale, and nothing
# here will notice. tests/scripts/write-receipt.test.js pins the list against the directories the
# pipeline actually cd's into or names; widen both together.

set -u

RECEIPT="${1:?usage: sh ci/write-receipt.sh <receipt-path>}"
ROOT=$(git rev-parse --show-toplevel) || exit 3
cd "$ROOT" || exit 3

INPUT_ROOTS="frontend ci .githooks docs memory .agent .github"

# shellcheck disable=SC2086
DIRTY=$( { git diff --name-only -- . ':(exclude).state'; git ls-files --others --exclude-standard -- $INPUT_ROOTS; } 2>/dev/null )
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

# VERIFY THE ARTIFACT, NEVER THE INTENT: read the file back. A receipt CLAIMED but absent is a silent lie
# about what was checked; an earlier version printed "certified" on a write that had just failed.
if printf '%s commit %s\n' "$TREE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >| "$RECEIPT" 2>/dev/null &&
   [ "$(cut -d' ' -f1 "$RECEIPT" 2>/dev/null)" = "$TREE" ]; then
  printf '\033[2m  receipt: tree %.10s certified — a push of this tree skips the offline core\033[0m\n' "$TREE"
  exit 0
fi
printf '\033[33m  receipt NOT written to %s — the push will certify in full\033[0m\n' "$RECEIPT"
exit 3
