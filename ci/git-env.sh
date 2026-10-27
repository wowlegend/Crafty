# shellcheck shell=bash
# ci/git-env.sh — sourced by ci/pipeline.sh. bash 3.2.
#
#   run_scrubbed <cmd...>   run a command with EVERY GIT_* variable removed from its environment, and return its
#                           exit status
#
# WHY. Git exports GIT_DIR, GIT_INDEX_FILE and friends to every hook it runs, and the hooks run this pipeline. In a
# linked worktree GIT_DIR is ABSOLUTE, so any git a step runs, or any git a test inside the unit step runs, finds the
# REAL repository through it instead of the one its cwd sits in. Observed 2026-10-27: a fixture suite run from a
# lane's hook re-initialised the main checkout `core.bare = true`. pre-push unset three named variables; pre-commit
# unset none. This removes every GIT_* name `env` lists, not a list of the dangerous ones: the set git exports grows,
# and a gate's exception list is where the next defect lives (tests/scripts/_isolatedGit.js does the same for tests).
#
# ci/write-receipt.sh is NOT run through it, because it must see git's GIT_INDEX_FILE to certify the index being
# committed; it sources this file only to LOCATE its tree scrubbed (an absolute GIT_DIR makes git take the cwd as the
# toplevel). Proven by tests/scripts/git-env-scrub.test.js and tests/scripts/write-receipt.test.js.
run_scrubbed() {
  (
    for v in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done
    "$@"
  )
}
