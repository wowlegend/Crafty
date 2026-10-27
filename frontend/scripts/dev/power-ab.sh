#!/bin/sh
# power-ab.sh — ONE ARM of a GPU / CPU power A/B for Crafty's PRODUCTION build, for the OPERATOR to run on his Mac.
#
# WHO RUNS IT: Kevin, at his own terminal. powermetrics needs root, so this asks for the sudo password ONCE, before it
# launches anything, and uses root for powermetrics ONLY; vite and the browser run as you. No agent runs this script.
#
# WHAT ONE RUN DOES (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md, part c; roadmap move 2(g)):
#   1. serves the production build with vite preview and opens ONE fixed scenario in a visible Chromium window
#      (scripts/visual/lookbook.mjs --hold): a fresh profile (a new world at dawn), 1280x800 at dpr 2, Start Adventure
#      clicked, the player at spawn facing the way it spawns, the frame cap at its default 60. Leave the window alone.
#   2. waits WARMUP seconds (shaders compile, the quality governor settles);
#   3. samples `powermetrics --samplers cpu_power,gpu_power,thermal` once a second, SAMPLES times (default 120);
#   4. prints the mean and median per rail (scripts/dev/power-summary.mjs) and keeps the raw log beside it.
#
# THE A/B is two runs, one per build, with everything else the same (same Mac, ON MAINS POWER, same display, lid open,
# nothing else heavy running — powermetrics measures the whole chip), then one compare. The exact commands, from a
# clean checkout (no uncommitted changes), where <A> is the baseline commit (refute F12: the post-0a deploy) and B is
# what you have checked out now:
#
#   cd ~/Code/Crafty/frontend
#   git switch --detach <A> && npm run build && rm -rf ~/crafty-power-ab/build-A && mkdir -p ~/crafty-power-ab && cp -R build ~/crafty-power-ab/build-A && git switch -
#   npm run build
#   sh scripts/dev/power-ab.sh before --build-dir ~/crafty-power-ab/build-A
#   sh scripts/dev/power-ab.sh after
#   node scripts/dev/power-summary.mjs ~/crafty-power-ab/before-*/powermetrics.txt ~/crafty-power-ab/after-*/powermetrics.txt
#
# (Arm A is served from a copy so the script and the probe always come from the current checkout, whatever commit A
# is.) If a label was used before, the glob matches several runs: name the run directories instead.
#
# OPTIONS: --samples N (default 120) · --warmup S (default 20) · --build-dir DIR (default build/) ·
#          --out-root DIR (default ~/crafty-power-ab) · --headless (no window; the renderer may not be the real GPU).
#
# WHAT IT CANNOT TELL YOU. powermetrics' own help calls its power figures estimates, fit for comparing builds of one
# app on one machine and not for comparing machines. The scenario stands still at spawn; it says nothing about combat
# or the siege. The day clock runs (a fresh world starts at dawn, and the whole run is ~3 minutes, past noon), the
# same way for both arms. A second arm on a build without the lookbook seam enters play by the click alone, and the
# scenario log says so.
#
# Exit 0 = measured and summarised · 3 = COULD NOT MEASURE, named.

set -u
cd "$(dirname "$0")/../.." || exit 3   # the app directory (frontend/)

LABEL="${1:-}"
case "$LABEL" in
  ''|-*) echo "usage: sh scripts/dev/power-ab.sh <label> [--samples N] [--warmup S] [--build-dir DIR] [--out-root DIR] [--headless]" >&2; exit 3 ;;
esac
case "$LABEL" in
  *[!A-Za-z0-9._-]*) echo "power-ab: COULD NOT MEASURE — label '$LABEL' must be letters, digits, '.', '_' or '-'" >&2; exit 3 ;;
esac
shift

SAMPLES=120
WARMUP=20
BUILD_DIR="build"
OUT_ROOT="$HOME/crafty-power-ab"
HEADED="--headed"
while [ $# -gt 0 ]; do
  case "$1" in
    --samples) SAMPLES="${2:-}"; shift 2 ;;
    --warmup) WARMUP="${2:-}"; shift 2 ;;
    --build-dir) BUILD_DIR="${2:-}"; shift 2 ;;
    --out-root) OUT_ROOT="${2:-}"; shift 2 ;;
    --headless) HEADED=""; shift ;;
    *) echo "power-ab: COULD NOT MEASURE — unknown option '$1'" >&2; exit 3 ;;
  esac
done
case "$SAMPLES$WARMUP" in
  *[!0-9]*|'') echo "power-ab: COULD NOT MEASURE — --samples and --warmup take whole numbers" >&2; exit 3 ;;
esac
[ "$SAMPLES" -ge 10 ] || { echo "power-ab: COULD NOT MEASURE — need at least 10 samples (power-summary refuses fewer)" >&2; exit 3; }

fail() { echo "power-ab: COULD NOT MEASURE — $*" >&2; exit 3; }
[ "$(uname -s)" = "Darwin" ] || fail "powermetrics is macOS-only"
[ "$(id -u)" != "0" ] || fail "run this as yourself, not with sudo: it asks for root only for powermetrics"
[ -x /usr/bin/powermetrics ] || fail "/usr/bin/powermetrics not found"
command -v node >/dev/null 2>&1 || fail "node not found"
[ -f "$BUILD_DIR/index.html" ] || fail "no production build at $BUILD_DIR/index.html — run \`npm run build\` first"

OUT="$OUT_ROOT/$LABEL-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT" || fail "cannot create $OUT"

# What was measured, written before anything runs: the build, the machine, and whether it is on mains power.
{
  echo "label:       $LABEL"
  echo "started:     $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "build dir:   $(cd "$BUILD_DIR" && pwd)"
  echo "index chunk: $(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$BUILD_DIR/index.html" | head -1)"
  echo "checkout:    $(git rev-parse --short HEAD 2>/dev/null) ($(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') uncommitted path(s))"
  echo "macOS:       $(sw_vers -productVersion 2>/dev/null)"
  echo "chip:        $(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
  echo "power:       $(pmset -g batt 2>/dev/null | head -1)"
  echo "samples:     $SAMPLES x 1 s after a ${WARMUP} s warm-up"
} > "$OUT/meta.txt"
cat "$OUT/meta.txt"
if pmset -g batt 2>/dev/null | head -1 | grep -q "Battery Power"; then
  echo "power-ab: WARNING — on battery. macOS throttles differently on battery; plug in for an A/B whose arms compare." >&2
fi

echo "powermetrics needs root. Enter your password once (sudo -v), before anything launches:"
sudo -v || fail "sudo was refused"

HOLD=$((WARMUP + SAMPLES + 40))
# shellcheck disable=SC2086 # HEADED is one flag or nothing
node scripts/visual/lookbook.mjs --hold "$HOLD" $HEADED --build-dir "$BUILD_DIR" --out "$OUT" > "$OUT/scenario.log" 2>&1 &
DRIVER=$!

# shellcheck disable=SC2329 # invoked by the EXIT trap below
cleanup() {
  if kill -0 "$DRIVER" 2>/dev/null; then
    kill -TERM "$DRIVER" 2>/dev/null   # lookbook.mjs closes its browser and vite on TERM
    wait "$DRIVER" 2>/dev/null
  fi
  sh scripts/dev/kill-test-procs.sh >/dev/null 2>&1 || true   # orphans only: it never touches your own browsers
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "waiting for the scenario (the world builds; up to 300 s) ..."
waited=0
until grep -q "LOOKBOOK HOLD READY" "$OUT/scenario.log" 2>/dev/null; do
  if ! kill -0 "$DRIVER" 2>/dev/null; then
    tail -20 "$OUT/scenario.log" >&2
    fail "the scenario exited before play was entered (log: $OUT/scenario.log)"
  fi
  [ "$waited" -lt 300 ] || fail "the scenario was not ready after 300 s (log: $OUT/scenario.log)"
  sleep 2
  waited=$((waited + 2))
done
grep "LOOKBOOK HOLD READY" "$OUT/scenario.log"

echo "warm-up ${WARMUP} s ..."
sleep "$WARMUP"
kill -0 "$DRIVER" 2>/dev/null || fail "the scenario died during the warm-up (log: $OUT/scenario.log)"

echo "sampling powermetrics: $SAMPLES x 1 s ..."
# The shell (you) opens the output file, so it is yours, not root's — deliberately outside sudo.
# shellcheck disable=SC2024
sudo powermetrics --samplers cpu_power,gpu_power,thermal -i 1000 -n "$SAMPLES" > "$OUT/powermetrics.txt" 2> "$OUT/powermetrics.err" \
  || fail "powermetrics failed: $(head -3 "$OUT/powermetrics.err")"
# A scenario that died mid-window measured an idle Mac for part of it: refuse the arm rather than average it in.
kill -0 "$DRIVER" 2>/dev/null || fail "the scenario ended before sampling finished — this arm is not comparable (log: $OUT/scenario.log)"

node scripts/dev/power-summary.mjs "$OUT/powermetrics.txt" > "$OUT/summary.txt" 2>&1
RC=$?
cat "$OUT/summary.txt"
[ "$RC" -eq 0 ] || exit 3
echo
echo "this arm: $OUT"
echo "compare two arms with:"
echo "  node scripts/dev/power-summary.mjs <first arm>/powermetrics.txt $OUT/powermetrics.txt"
exit 0
