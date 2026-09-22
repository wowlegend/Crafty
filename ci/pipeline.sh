#!/usr/bin/env bash
# THE PIPELINE. One definition, three callers: GitHub Actions, the pre-push hook, and a human typing
# `ci/pipeline.sh`.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# WHY ONE FILE INSTEAD OF A WORKFLOW YAML AND A HOOK THAT EACH LIST THE STEPS
#
# Because two lists drift, and the drift is invisible until CI mails you about a commit that passed
# locally. That is exactly what happened here on 2026-09-22: `.githooks/pre-push` ran 13 gates and
# `.github/workflows/ci.yml` ran a DIFFERENT set — the hook had mutation-proof-trailer, queue-ledger,
# artifact-currency and cli-guard; the workflow had knip, npm audit, prod-smoke and E2E. A change to the
# damage model was proven green by every gate the hook knows about, and broke an E2E spec that only the
# workflow runs. The local check and the remote check must not be two independently-maintained
# descriptions of "the build": one of them has to BE the build and the other has to call it.
#
# The workflow runs `bash ci/pipeline.sh --tier=fast`. The hook runs `bash ci/pipeline.sh --tier=push`.
# Neither restates a step, so neither can disagree. Shape borrowed from Inkbloom's ci/pipeline.sh, which
# solved this first.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# WHAT IT DELIBERATELY CANNOT COVER, because a green run is not a claim that the game works
#
#   - THE 31-FRAME VISUAL ORACLE. It needs a real GPU-less browser presenting frames and takes ~20
#     minutes; it runs in neither caller today. A green pipeline says nothing about how Crafty LOOKS.
#   - E2E FRESHNESS, not E2E itself. 21 Playwright specs take ~20 minutes, which is too slow for every
#     push, so the push tier asserts that E2E was last run GREEN against the current source tree — the
#     stamp, not the suite. CI runs the real thing, sharded. This is the inverse of Inkbloom's problem:
#     there CI *cannot* run the Studio tiers so the hook must look; here the hook *can* but is too slow
#     to, so it checks the receipt instead.
#
# Exit: 0 = every tier step passed · 1 = a step failed (the failing step is named).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/frontend"

TIER="push"
for a in "$@"; do case "$a" in --tier=*) TIER="${a#--tier=}" ;; esac; done

fail=0
failed_steps=""
say() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
step() { # step <name> <cmd...>
  local name="$1"; shift
  say "$name"
  if "$@"; then
    return 0
  fi
  fail=1
  failed_steps="$failed_steps
  ✖ $name"
  return 1
}

cd "$APP"

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: PUBLISH GUARD — runs FIRST in every tier. This repo is PUBLIC and Vercel auto-deploys every
# push, so a leak is unrecoverable: force-push does not erase history on GitHub.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
step "opsec-scan (a PUBLIC repo must not publish the operator machine)" node scripts/ci/opsec-scan.mjs --all

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: FAST — deterministic, GPU-free, machine-independent. Both callers run all of these.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
step "doc-currency (a canonical doc citing a path that no longer exists)" node scripts/ci/doc-currency.mjs
step "eslint (crash-class bugs; no-unused-vars is an error)" npm run --silent lint
step "gate-shape (no assertion satisfiable by a COMMENT)" node scripts/ci/gate-shape.mjs
step "killability-ledger (a new check must name the mutation that reds it)" node scripts/ci/killability-ledger.mjs
step "cli-guard (an exporting script must not run its CLI on import)" node scripts/ci/cli-guard.mjs
step "unit + static gates (vitest)" npm run --silent test:unit
step "build" npm run --silent build
step "bundle byte budget" node scripts/ci/bundle-budget.mjs

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: PUSH-ONLY — commit-shaped gates. They read a COMMIT RANGE, which a CI runner on a squashed or
# rebased ref cannot reconstruct meaningfully, so they belong to the chokepoint that has the real range.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$TIER" = "push" ]; then
  step "queue-ledger (a finding with no marker)" node scripts/ci/queue-ledger.mjs
  step "artifact-currency (a published page drifting from HEAD)" node scripts/ci/artifact-currency.mjs
  step "e2e freshness (the suite CI runs, receipted against this tree)" node scripts/ci/e2e-freshness.mjs
fi

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# WHAT THE HOOK OWNS, AND WHY THIS FILE DOES NOT CLAIM IT
#
# `mutation-proof-trailer` and `baseline-trailer` read the COMMIT RANGES BEING PUSHED, which arrive on
# the hook's stdin as refspecs and exist nowhere else — not in the tree, not in a runner's checkout, not
# in this script's environment. The hook runs them itself, once per pushed ref, before this file is
# called. "One definition" means no step is stated TWICE, not that every step lives here; a step this
# file cannot honestly execute would be a second, weaker copy. First draft of this pipeline did claim
# them, reading a `$RANGE` that was a leaked loop variable from an earlier loop in the hook.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: CI-ONLY — needs the network or a browser, so it must never sit in a developer's push path. A
# registry outage or a flaky browser reddening someone's push is how a gate gets bypassed.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$TIER" = "fast" ]; then
  step "knip (unused files / exports / deps)" npm run --silent knip
  step "npm audit (high + critical)" npm audit --audit-level=high
  step "prod-smoke (the bundle that actually ships boots and renders)" node scripts/ci/prod-smoke.mjs
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[32m✓ pipeline (%s): every step passed\033[0m\n' "$TIER"
  exit 0
fi
printf '\033[31m✖ pipeline (%s) FAILED:%s\033[0m\n' "$TIER" "$failed_steps"
exit 1
