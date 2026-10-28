#!/bin/sh
# Write the green-tree receipt that pre-push honours — but ONLY for a tree that was actually tested.
#
#   sh ci/write-receipt.sh --tree
#     print the index tree, when the working tree matches the index on every pipeline input. The certify tier runs
#     this BEFORE its first step and hands the answer back at the end.
#     exit 0 printed · 1 REFUSED (the working tree is not the index) · 3 COULD NOT (write-tree failed)
#   sh ci/write-receipt.sh <receipt-dir> <tier> <start-tree>
#     after a green run, check again, and write <receipt-dir>/<tree>, holding `<tree> <tier> <utc>`, only when the
#     tree is still <start-tree>. One file per tree, so receipts written by different lanes never evict each other,
#     and none is pruned: a tree hash names its content, so an old file never speaks for a different tree. pre-push
#     honours only a `certify` receipt (ci/pipeline.sh --tier=certify).
#     exit 0  receipt written and read back
#     exit 1  REFUSED: the working tree is not the index, or the index is not the tree the run started on
#     exit 2  usage: no receipt directory, tier or start tree
#     exit 3  COULD NOT write (write-tree failed, or the file did not land)
#
# WHY THE TREE IS TAKEN TWICE. Every step the pipeline runs (eslint, vitest, vite build, doc-currency) reads the WORKING
# TREE, and the certify tier is meant to run in the background, so the tree can move under it. Read only at the end,
# a commit, checkout or merge made while the steps ran was certified as a tree no step had read (W2-C review, finding
# 1). A tree that is the same at both ends, and clean at both, is the tree the steps read.
#
# A refusal costs nothing but time: no receipt means pre-push certifies the commit in full, in a fresh
# worktree of exactly what is being pushed. So this fails toward the slow, correct path.
#
# WHAT COUNTS AS "DIFFERS" — the pipeline's INPUTS, declared rather than excepted:
#   - any unstaged change to a tracked file, anywhere.
#   - any untracked, non-ignored file under a directory a step reads (INPUT_ROOTS). An untracked test in
#     frontend/src/ runs under vitest yet is not in the commit — the same defect by another door.
#     Untracked files OUTSIDE these roots (editor/agent config at the root) are read by no step.
#
# BLIND SPOTS: a file edited and restored between the two reads (the tree matches at both ends, and a step may have
# read the edit). A step that starts reading a new top-level directory makes INPUT_ROOTS stale, and nothing here will
# notice; tests/scripts/write-receipt.test.js pins the list against the tracked top-level directories.

set -u

# THE TOPLEVEL IS FOUND WITH GIT_* SCRUBBED; THE TREE IS READ WITH THE CALLER'S. With an absolute GIT_DIR and no
# GIT_WORK_TREE (what git hands a linked worktree's hooks), git takes the CURRENT directory as the top of the work tree,
# and pipeline.sh runs this from frontend/; discovery from the cwd (run_scrubbed, ci/git-env.sh) finds the real
# toplevel. The reads below keep the caller's environment, so a caller that names an index (GIT_INDEX_FILE) has that
# index certified; certify, run by hand, names none.
. "$(dirname "$0")/git-env.sh" || exit 3
ROOT=$(run_scrubbed git rev-parse --show-toplevel) || exit 3
cd "$ROOT" || exit 3

INPUT_ROOTS="frontend ci .githooks docs memory .github"

# Prints the index tree, or says on stderr why it will not.
tested_tree() {
  # shellcheck disable=SC2086
  DIRTY=$( { git diff --name-only -- .; git ls-files --others --exclude-standard -- $INPUT_ROOTS; } 2>/dev/null )
  if [ -n "$DIRTY" ]; then
    N=$(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')
    printf '\033[33m  receipt REFUSED: the tested working tree is not the index (%s path(s) differ, e.g. %s)\033[0m\n' \
      "$N" "$(printf '%s\n' "$DIRTY" | head -1)" >&2
    printf '\033[33m  the gates ran against unstaged/untracked content — the push will certify the commit in full\033[0m\n' >&2
    return 1
  fi
  T=$(git write-tree 2>/dev/null || true)
  if [ -z "$T" ]; then
    printf '\033[33m  receipt NOT written: git write-tree failed — the push will certify in full\033[0m\n' >&2
    return 3
  fi
  printf '%s\n' "$T"
}

if [ "${1:-}" = "--tree" ]; then
  tested_tree
  exit $?
fi

RECEIPT_DIR="${1:-}"
TIER="${2:-}"
START="${3:-}"
if [ -z "$RECEIPT_DIR" ] || [ -z "$TIER" ] || [ -z "$START" ]; then
  echo "usage: sh ci/write-receipt.sh <receipt-dir> <tier> <start-tree>   (or --tree, before the run)" >&2
  exit 2
fi

TREE=$(tested_tree) || exit $?
if [ "$TREE" != "$START" ]; then
  printf '\033[33m  receipt REFUSED: the index tree changed during the run (%.10s at the start, %.10s now) — a commit, checkout or merge was made while the steps ran, so no step is known to have read it\033[0m\n' \
    "$START" "$TREE" >&2
  exit 1
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
