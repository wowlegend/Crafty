#!/bin/sh
# Kill LEAKED test processes from this project. Safe to run any time.
#
# WHY (Kevin, 2026-07-13): browser/E2E/capture work spawns headless Chromium + vite dev servers. If a probe
# script throws, or a run is interrupted, those DO NOT die with it — they linger. On 2026-07-13 a session had
# leaked SEVEN vite servers and a headless Chromium spinning at 622% CPU (six cores), which drove the machine
# load average to 25 and made the visual-capture gate time out — a "flaky gate" that was actually self-inflicted.
#
# SAFETY: this ONLY matches (a) vite servers under THIS repo's node_modules and (b) Playwright's own browser
# binaries in its cache dir. It can NEVER touch Kevin's real Chrome/Brave/Safari — those live in /Applications
# and do not match these patterns. Read the patterns before adding to them.

#
# ⚠️ DO NOT RUN THIS WHILE A TEST IS ACTIVELY RUNNING. It is a blanket killer: if a capture, an e2e run, or a
# background workflow agent is driving a browser right now, this will SABOTAGE it mid-probe. (I did exactly
# that on 2026-07-13 — killed a live workflow agent's browser while "tidying up".) Run it at SESSION-CLOSE, or
# when the box is idle, or when you have confirmed the survivors are stale. Pass --force to skip the guard.

set -e

# Guard: refuse to run if a browser process is YOUNG (< 3 min) — that almost certainly means a live run.
#
# TWO macOS TRAPS, both of which silently broke the first version of this guard (fixed 2026-07-14):
#   1. `ps -eo etimes=` is NOT supported on macOS — it errors with `etimes: keyword not found`, so the
#      awk `$1` was never an age at all. macOS gives `etime`, formatted [[DD-]HH:]MM:SS. A raw MM:SS
#      value read as seconds makes a 2-minute-old process look 9 hours old (I nearly killed a live
#      16-agent fleet on that misread).
#   2. Grepping `ps` output for a pattern MATCHES THE MATCHER — awk's own command line contains the
#      pattern string, and it is 0 seconds old, so the guard always saw a "young" process and refused
#      to run, every time, forever. `pgrep` does not match itself; use it.
age_secs() {  # [[DD-]HH:]MM:SS -> seconds
  echo "$1" | awk -F: '{ d=0; h=0;
    if ($1 ~ /-/) { split($1, a, "-"); d=a[1]; $1=a[2] }
    if (NF == 3) { h=$1; m=$2; s=$3 } else { m=$1; s=$2 }
    print ((d*24 + h) * 60 + m) * 60 + s }'
}
if [ "$1" != "--force" ]; then
  young=0
  # `|| true` on EVERY pgrep: a no-match pgrep exits 1, and under `set -e` that aborts the whole command
  # substitution — so a failing FIRST pgrep silently swallowed the second one's PIDs, the guard saw an
  # empty list, and it happily killed a live dev server. (Same class as `grep -c` returning 1 on no match.)
  for pid in $(pgrep -f "ms-playwright/" 2>/dev/null || true; \
               pgrep -f "Crafty/frontend/node_modules/.bin/vite" 2>/dev/null || true); do
    et=$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')
    [ -n "$et" ] || continue
    # if-form, NOT `[ ... ] && x=1` — under `set -e` a false test as the last command in the body
    # exits the script with status 1.
    if [ "$(age_secs "$et")" -lt 180 ]; then young=$((young + 1)); fi
  done
  if [ "$young" -gt 0 ]; then
    printf '✋ REFUSING: %s test process(es) started in the last 3 minutes — a run is probably LIVE.\n' "$young"
    printf '   Killing now would sabotage an active capture / e2e / workflow agent mid-probe.\n'
    printf '   Wait for it to finish, or re-run with --force if you are sure they are stale.\n'
    exit 0
  fi
fi

before=$(uptime | sed 's/.*averages*//')

# (a) vite dev servers started from THIS project (capture.mjs, playwright webServer, ad-hoc probes)
pkill -f "Crafty/frontend/node_modules/.bin/vite" 2>/dev/null || true
pkill -f "npm exec vite --port" 2>/dev/null || true

# (b) Playwright's headless browsers (its own cache path — never a user-installed browser)
pkill -f "ms-playwright/chromium" 2>/dev/null || true
pkill -f "ms-playwright/webkit" 2>/dev/null || true
pkill -f "ms-playwright/firefox" 2>/dev/null || true

sleep 1

vite=$(pgrep -f "Crafty/frontend/node_modules/.bin/vite" 2>/dev/null | wc -l | tr -d ' ')
pw=$(pgrep -f "ms-playwright/" 2>/dev/null | wc -l | tr -d ' ')

printf '✓ test-proc cleanup: %s vite / %s playwright still alive\n' "$vite" "$pw"
printf '  load before:%s  after: %s\n' "$before" "$(uptime | sed 's/.*averages*//')"

if [ "$vite" != "0" ] || [ "$pw" != "0" ]; then
  printf '  NOTE: survivors are likely an ACTIVE run (a workflow agent, a capture, an e2e in flight).\n'
  printf '        Do not force-kill blindly — you may sabotage a live test.\n'
fi
