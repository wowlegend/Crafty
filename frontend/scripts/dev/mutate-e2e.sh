#!/bin/bash
# mutate-e2e.sh — apply ONE deliberate defect to a subject file, run ONE Playwright spec, restore, report.
# The e2e twin of mutate.sh (vitest). Same contract, same guards, and three more that an e2e run needs:
#
#   sh scripts/dev/mutate-e2e.sh <subject> <spec> <label> <old> <new> [--identity]
#
#   exit 0  RED        — the spec caught the mutant                   (--identity: the identity mutant SURVIVED)
#   exit 1  SURVIVED   — the spec stayed green on a broken subject     (--identity: it went RED — the batch is noise)
#   exit 3  COULD NOT CHECK — no verdict; never read this as a pass
#
# WHY IT EXISTS. The frame-cap campaign (2026-09-26) ran its e2e mutants through a script in a session scratchpad —
# the exact shape mutate.sh's header records as a lost instrument. It is here so the next e2e gate is proven the same
# way, and so the three lessons below are in the instrument instead of in a transcript:
#
#  - A SETUP FAILURE IS NOT A KILL. On a loaded machine a spec can fail before it reaches its subject (the world never
#    built; the renderer drew under 1 fps). A spec that states its preconditions writes "SETUP:" into the failure
#    message; this reads it and reports COULD NOT CHECK. The first frame-cap batch scored five mutants RED this way,
#    every one on a precondition — and the verdicts would have gone into a commit trailer.
#  - RUN AN IDENTITY MUTANT IN EVERY BATCH (--identity): a comment or whitespace edit, which changes nothing the spec
#    can see. It must SURVIVE. If it goes red, the batch measured flakiness, not detection, and none of its kills
#    count. In the same campaign an identity mutant going red was how a real leak in the SHIPPED code was found — a
#    control that fails is information about the subject as often as about the harness.
#  - A TEST TIMEOUT IS NOT A KILL EITHER (2026-10-27, found by both arms of the review bake-off). Playwright's "Test
#    timeout of Nms exceeded" names no step: it fires as readily on a slow world as on a mutant, so it reports COULD NOT
#    CHECK. This under-counts kills that only show as a hang — make such a spec fail FASTER, with a named message,
#    rather than reading the timeout as detection. _boot.js tags bootDev's wait SETUP for the same reason, and extends
#    the test budget when E2E_WORLD_TIMEOUT lengthens the world wait (it used to pre-empt the SETUP rethrow).
#  - IT SWEEPS. Every run kills this repo's leftover vite servers and Playwright browsers (kill-test-procs.sh), so a
#    batch of eight does not stack eight headless Chromiums.
#
# No baseline re-run on RED (mutate.sh does one): an e2e run costs minutes, so the identity mutant in the same batch,
# under the same load, is the control instead. Pass E2E_WORLD_TIMEOUT through the environment on a loaded machine.
#
# DO NOT run this while anything else serves the dev server or edits frontend/src: the mutation is served live.
set -u
cd "$(dirname "$0")/../.." || exit 3

SUBJ="${1:-}"; SPEC="${2:-}"; LABEL="${3:-}"; OLD="${4:-}"; NEW="${5-}"; MODE="${6:-}"
if [ -z "$SUBJ" ] || [ -z "$SPEC" ] || [ -z "$LABEL" ] || [ -z "$OLD" ]; then
  echo "usage: mutate-e2e.sh <subject> <spec> <label> <old> <new> [--identity]" >&2; exit 3
fi
[ -f "$SUBJ" ] || { echo "  [3] $LABEL — subject not found: $SUBJ"; exit 3; }
[ -f "$SPEC" ] || { echo "  [3] $LABEL — spec not found: $SPEC"; exit 3; }

# A SERVER ALREADY ON THE E2E PORT IS REUSED (playwright.config: reuseExistingServer when not CI), so the spec would
# test THAT server's tree — a sibling worktree's unmutated source — and every mutant would read SURVIVED (ultrareview
# 2026-10-27, U6). Refuse before mutating anything. The probe is e2e-freshness's own, which checks BOTH loopback
# addresses: vite on macOS binds [::1] only.
PORT=$(grep -oE 'const PORT = [0-9]+;' playwright.config.js | grep -oE '[0-9]+')
[ -n "$PORT" ] || { echo "  [3] $LABEL — could not read the e2e port from playwright.config.js"; exit 3; }
if node --input-type=module -e "import { portInUse } from './scripts/ci/e2e-freshness.mjs'; process.exit((await portInUse($PORT)) ? 0 : 1);"; then
  echo "  [3] $LABEL — COULD NOT CHECK: something already listens on the e2e port $PORT; the spec would reuse it and test its tree, not this mutant. Stop it first (sh scripts/dev/kill-test-procs.sh, or the sibling's run)."
  exit 3
fi

BAK="$(mktemp "${TMPDIR:-/tmp}/mutate-e2e-bak.XXXXXX")" || exit 3
OUT="$(mktemp "${TMPDIR:-/tmp}/mutate-e2e-out.XXXXXX")" || exit 3
cp "$SUBJ" "$BAK" || { echo "  [3] $LABEL — could not back up $SUBJ"; exit 3; }

restore() {
  if ! cp "$BAK" "$SUBJ" || ! cmp -s "$BAK" "$SUBJ"; then
    echo "  [3] $LABEL — RESTORE FAILED. $SUBJ IS STILL MUTATED. Restore it before anything else: cp $BAK $SUBJ" >&2
    exit 3
  fi
  sh scripts/dev/kill-test-procs.sh > /dev/null 2>&1
  rm -f "$BAK" "$OUT"
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

npx playwright test "$SPEC" --reporter=line --retries=0 > "$OUT" 2>&1
FAILED=$(grep -oE '^ +[0-9]+ failed' "$OUT" | tr -dc '0-9')
PASSED=$(grep -oE '^ +[0-9]+ passed' "$OUT" | tr -dc '0-9')
FIRST_ERR="$(grep -m1 'Error:' "$OUT" | sed -E 's/^ +//' | cut -c1-240)"

if grep -qE 'Test timeout of [0-9]+ms exceeded' "$OUT"; then
  echo "  [3] $LABEL — COULD NOT CHECK: the test ran out of its time budget, which names no step"
  echo "         $FIRST_ERR"; exit 3
fi
if grep 'Error:' "$OUT" | grep -q 'SETUP:'; then
  echo "  [3] $LABEL — COULD NOT CHECK: the spec failed a precondition, not its subject"
  echo "         $FIRST_ERR"; exit 3
fi
if [ -z "$FAILED" ] && [ -z "$PASSED" ]; then
  echo "  [3] $LABEL — COULD NOT CHECK: no Playwright verdict in the output"; tail -5 "$OUT" | sed 's/^/         /'; exit 3
fi

if [ "$MODE" = "--identity" ]; then
  if [ -n "$FAILED" ]; then
    echo "  [IDENTITY WENT RED — THIS BATCH IS NOISE] $LABEL"
    echo "         $FIRST_ERR"; exit 1
  fi
  echo "  [IDENTITY SURVIVED] $LABEL"; exit 0
fi

if [ -z "$FAILED" ]; then
  echo "  [GREEN — MUTANT SURVIVED] $LABEL"; exit 1
fi
echo "  [RED] $LABEL"
echo "         $FIRST_ERR"
exit 0
