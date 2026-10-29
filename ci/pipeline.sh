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
# The workflow runs `bash ci/pipeline.sh --tier=fast`. The pre-push hook runs `--tier=push`, and the
# pre-commit hook runs `--tier=commit`. Neither restates a step, so neither can disagree. The
# one-definition shape is Inkbloom's.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# THE TIERS, and the one question that decides which a gate belongs to: WHAT DOES IT READ, AND WHEN?
#
#   commit  the STAGED change               -> pre-commit. The static gates, plus only the unit tests that
#                                              statically import a staged file (`vitest related`).
#   push    reads a COMMIT RANGE            -> pre-push. opsec-scan, then queue-ledger, artifact-currency and
#                                              registry-append-only: a runner on a squashed ref cannot
#                                              reconstruct the range, so these belong to the chokepoint that
#                                              has it. registry-append-only runs in the fast tier too, on the
#                                              base the event names, which CI has. opsec-scan is here because
#                                              the push PUBLISHES, and CI sees the content only once it is on
#                                              GitHub. Nothing else: CI runs the static gates, unit suite, build
#                                              and bundle budget on the exact sha, and main moves only on that
#                                              sha's `ci ok`, so a local run repeated them at a cost in SSD
#                                              writes (DECISIONS 2026-10-28 item 24).
#   certify the WORKING TREE, whole         -> by hand, on demand: the static gates, the unit suite, build and
#                                              bundle budget, i.e. CI's offline steps, for a local result
#                                              before CI. No hook calls it and nothing waits for it.
#   fast    the exact sha, in CI            -> GitHub Actions: the certify steps, then the ones that need the
#                                              NETWORK or a BROWSER. `npm audit` and `prod-smoke` must never sit
#                                              on an edit path: a registry outage or a flaky browser reddening
#                                              someone's commit is precisely how a gate gets bypassed, and a
#                                              bypassed gate is worth less than no gate (R5).
#
# WHAT THE LIGHT LOCAL TIERS COST: no commit and no push carries a unit, build or bundle result of its own. A
# commit runs only the unit tests that statically import what it stages; the first full result for a pushed sha is
# that sha's CI run, and main moves only on a sha whose `ci ok` passed.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# WHAT IT DELIBERATELY CANNOT COVER, because a green run is not a claim that the game works
#
#   - HOW CRAFTY LOOKS. Looks are read by a person on the eye-level lookbook (scripts/visual/lookbook.mjs,
#     real GPU), which no caller runs. A green pipeline says nothing about how Crafty LOOKS.
#   - E2E. The Playwright suite runs only in CI, sharded, as jobs beside this pipeline's. main's branch
#     protection requires `ci ok` on the exact sha, and `ci ok` needs every e2e shard, so no local tier
#     asks for an e2e receipt (DECISIONS 2026-10-28 item 13(b)).
#
# Exit: 0 = every tier step passed · 1 = a step failed (the failing step is named).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/frontend"
# Every step runs with GIT_* scrubbed (run_scrubbed, below): a hook's GIT_DIR must never reach a step's git.
. "$ROOT/ci/git-env.sh"

TIER="push"
CODE_CHANGED=""
SHA_CERTIFIED=""
for a in "$@"; do case "$a" in --tier=*) TIER="${a#--tier=}" ;; --code-changed=*) CODE_CHANGED="${a#--code-changed=}" ;; --sha-certified=*) SHA_CERTIFIED="${a#--sha-certified=}" ;; esac; done
# --code-changed=false: CI's change-scope job (frontend/scripts/ci/change-scope.mjs) found only docs changed since a
# commit whose `ci ok` passed, so the fast tier skips prod-smoke, the one browser step here (the e2e job is skipped
# by ci.yml itself). ONLY the exact word `false` skips; absent, `true`, empty or anything else runs it (fail SAFE).
# The CI step also exports CODE_CHANGED, and the unit suite this pipeline runs inherits it and executes this file under
# test. The reset above is what keeps a docs-only run from changing what that suite tests: the flag decides, an
# inherited CODE_CHANGED never does.
# --sha-certified=true: change-scope found this run is a push to main of a sha whose `ci ok` already passed in another
# run, so the fast tier skips its six slow steps (the unit suite, build, bundle budget, knip, npm audit, prod-smoke) and
# keeps the quick gates and registry-append-only, whose base here is main's previous tip, which that run never read.
# ONLY the exact word `true` skips; reset above like CODE_CHANGED, so an inherited SHA_CERTIFIED decides nothing.
if [ -n "$SHA_CERTIFIED" ] && [ "$TIER" != "fast" ]; then
  printf '\033[31m✖ pipeline: --sha-certified is only meaningful with --tier=fast\033[0m\n' >&2; exit 2
fi
case "$TIER" in
  commit|push|fast|certify) ;;
  *) printf '\033[31m✖ pipeline: unknown tier %s (expected commit|push|fast|certify)\033[0m\n' "$TIER" >&2; exit 2 ;;
esac

fail=0
failed_steps=""
say() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
step() { # step <name> <cmd...>
  local name="$1"; shift
  say "$name"
  if run_scrubbed "$@"; then
    return 0
  fi
  fail=1
  failed_steps="$failed_steps
  ✖ $name"
  return 1
}

cd "$APP"

# Node 24.2+ before any step: below it every gate's import.meta.main guard is undefined and each gate passes unrun.
node scripts/ci/node-floor.mjs || exit 1

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: PUBLISH GUARD — runs FIRST in every tier. This repo is PUBLIC and Vercel auto-deploys every
# push, so a leak is unrecoverable: force-push does not erase history on GitHub.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
step "opsec-scan (a PUBLIC repo must not publish the operator machine)" node scripts/ci/opsec-scan.mjs --all

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# THE OFFLINE CORE — deterministic, GPU-free, machine-independent. The static gates run on the commit, in certify and
# in CI; the unit suite, build and bundle budget in certify and CI only (the commit runs `vitest related` instead).
# The push runs none of it.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$TIER" = "push" ]; then
  printf '\n\033[2m── skipped (push tier): doc-currency, eslint, gate-shape, registry-dedupe, the unit suite, build, bundle byte budget — CI runs them on this sha; `--tier=certify` runs them here\033[0m\n'
fi
if [ "$TIER" != "push" ]; then
  step "doc-currency (a canonical doc citing a path that no longer exists)" node scripts/ci/doc-currency.mjs
  step "eslint (crash-class bugs; no-unused-vars is an error)" npm run --silent lint
  step "gate-shape (no assertion satisfiable by a COMMENT)" node scripts/ci/gate-shape.mjs
  step "registry-dedupe (a registry id a merge left twice)" node scripts/ci/registry-dedupe.mjs --check
fi
if [ "$TIER" = "commit" ]; then
  # The list is taken here, with the hook's environment intact (ci/git-env.sh says why); only the step is scrubbed.
  # A git failure leaves no list, which the step reports as COULD NOT CHECK rather than as nothing staged.
  STAGED_LIST="$(mktemp "${TMPDIR:-/tmp}/crafty-staged-XXXXXX")" || STAGED_LIST=""
  if [ -n "$STAGED_LIST" ] && ! staged_frontend_files "$ROOT" >| "$STAGED_LIST"; then rm -f "$STAGED_LIST"; fi
  step "vitest related (the unit tests that statically import a staged file)" node scripts/ci/related-tests.mjs --staged-list "$STAGED_LIST"
  rm -f "$STAGED_LIST"
fi
if [ "$TIER" = "certify" ] || [ "$TIER" = "fast" ]; then
  if [ "$SHA_CERTIFIED" = "true" ]; then
    printf '\n\033[2m── skipped (--sha-certified=true): unit + static gates, build, bundle byte budget — this sha passed them in the run that certified it\033[0m\n'
  else
    step "unit + static gates (vitest)" npm run --silent test:unit
    step "build" npm run --silent build
    step "bundle byte budget" node scripts/ci/bundle-budget.mjs
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: PUSH — commit-shaped gates. They read a COMMIT RANGE, which a CI runner on a squashed or
# rebased ref cannot reconstruct meaningfully, so they belong to the chokepoint that has the real range.
# artifact-currency's drift is a report, never a refusal (DECISIONS 2026-10-28 item 12); only its three
# tree-defect checks fail a run, and they guard the Command Record's as-of stamp at every landing.
# registry-append-only runs in CI as well, on the event's base: a registry row deleted instead of closed is
# invisible to a tree check, so it needs a range, and pre-push hands it this push's (PUSH_RANGES).
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$TIER" != "push" ]; then
  printf '\n\033[2m── skipped (%s tier): queue-ledger, artifact-currency, registry-append-only — they read a COMMIT RANGE (the fast tier runs registry-append-only on every CI run, below)\033[0m\n' "$TIER"
fi
if [ "$TIER" = "push" ]; then
  step "queue-ledger (a finding with no marker)" node scripts/ci/queue-ledger.mjs
  step "artifact-currency (page sources, Queued pills, as-of stamps; drift is reported only)" node scripts/ci/artifact-currency.mjs
  step "registry-append-only (a registry row deleted instead of closed, on the pushed range)" node scripts/ci/registry-append-only.mjs
fi

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# WHAT THE HOOK OWNS, AND WHY THIS FILE DOES NOT CLAIM IT
#
# `mutation-proof-trailer` reads the COMMIT RANGES BEING PUSHED, which arrive on
# the hook's stdin as refspecs and exist nowhere else — not in the tree, not in a runner's checkout, not
# in this script's environment. The hook runs it itself, once per pushed ref, before this file is
# called. "One definition" means no step is stated TWICE, not that every step lives here; a step this
# file cannot honestly execute would be a second, weaker copy. First draft of this pipeline did claim
# them, reading a `$RANGE` that was a leaked loop variable from an earlier loop in the hook.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# TIER: CI-ONLY — knip, npm audit and prod-smoke need the network or a browser, so they must never sit in a
# developer's push path. A registry outage or a flaky browser reddening someone's push is how a gate gets
# bypassed. The registry-append-only step at the end of this block is in CI for a different reason: it needs
# neither, only a range, which the event names.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$TIER" = "fast" ]; then
  if [ "$SHA_CERTIFIED" = "true" ]; then
    printf '\n\033[2m── skipped (--sha-certified=true): knip, npm audit, prod-smoke — this sha passed them in the run that certified it\033[0m\n'
  else
    step "knip (unused files / exports / deps)" npm run --silent knip
    step "npm audit (high + critical)" npm audit --audit-level=high
    if [ "$CODE_CHANGED" = "false" ]; then
      printf '\n\033[2m── skipped (fast tier, --code-changed=false): prod-smoke — only docs changed since a commit CI passed, so the bundle is that commit'"'"'s\033[0m\n'
    else
      step "prod-smoke (the bundle that actually ships boots and renders)" node scripts/ci/prod-smoke.mjs
    fi
  fi
  # The event names the base (a push's before, a pull request's base sha, else the merge-base with origin/main), and the
  # gates job checks out full history, so every CI run can read the registry at both ends.
  step "registry-append-only (on every CI run, against the event's base)" node scripts/ci/registry-append-only.mjs
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[32m✓ pipeline (%s): every step passed\033[0m\n' "$TIER"
  exit 0
fi
printf '\033[31m✖ pipeline (%s) FAILED:%s\033[0m\n' "$TIER" "$failed_steps"
exit 1
