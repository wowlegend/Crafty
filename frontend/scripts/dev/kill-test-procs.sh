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
# OWNERSHIP, NOT AGE, DECIDES WHAT IS A LEAK (2026-09-22). This sweep used to refuse only when a matching
# process was YOUNGER than 3 minutes, and its age check never even looked at puppeteer's Chrome. So a visual
# capture running for 15 minutes — a live run, doing its job — read as stale and was killed mid-frame: a
# session lost a 31-frame A/B capture that way, by sweeping up after a 2-minute e2e run beside it. Age is a
# proxy for "abandoned"; the real property is whether anything still OWNS the process.
#
# So: for every matching process, walk up its parents past other matching processes (a Chrome helper to its
# Chrome, `vite` to its `npm exec vite` wrapper) to the first NON-matching ancestor — the owner. If the chain
# reaches launchd (PID 1), the runner that started it is gone: it is an ORPHAN, a true leak, and it is killed.
# If the owner is a live process (capture.mjs, the Playwright runner, a shell), the run is live and it is left
# alone — and the owner is NAMED, so a hung runner is visible rather than silently swept. `--force` kills
# everything matching, as before.
#
# ONE EXCEPTION THE REAL BROWSER FORCES, found by reading a live capture's process table before trusting the
# test: Chrome's crashpad handlers double-fork on purpose, so they sit at PPID 1 while their Chrome is alive,
# and their argv names a SHARED crash database, not the instance. Nothing ties one to its Chrome. So a PPID-1
# crashpad handler is left alone while ANY matching browser is owned by a live run, and swept otherwise.
#
# KTP_PATTERN / KTP_BROWSER / KTP_CRASHPAD override the matches (extended regexes) — for the test that
# drives this script on processes of its own; never needed in normal use.

set -e

PATTERN="${KTP_PATTERN:-Crafty/frontend/node_modules/.bin/vite|npm exec vite --port|ms-playwright/(chromium|webkit|firefox)|cache/puppeteer/chrome}"
BROWSER="${KTP_BROWSER:-cache/puppeteer/chrome|ms-playwright/}"
CRASHPAD="${KTP_CRASHPAD:-chrome_crashpad_handler}"
FORCE=0
[ "$1" = "--force" ] && FORCE=1

cmd_of() { ps -o command= -p "$1" 2>/dev/null || true; }
is_test_proc() { cmd_of "$1" | grep -qE "$PATTERN"; }

owner_of() {  # the first NON-matching ancestor of PID: 1 = orphaned, 0 = vanished mid-scan
  p=$1; depth=0
  while [ "$depth" -lt 64 ]; do
    pp=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)
    if [ -z "$pp" ]; then echo 0; return; fi
    if [ "$pp" = "1" ] || [ "$pp" = "0" ]; then echo 1; return; fi
    if is_test_proc "$pp"; then p=$pp; else echo "$pp"; return; fi
    depth=$((depth + 1))
  done
  echo 0
}

# One pass: classify every matching process, then signal the leaks. Re-derived from scratch each pass — a
# killed parent re-parents its children to launchd, so the second pass sees orphans the first could not.
sweep_pass() {  # $1 = signal
  orphans=""; crashpads=""; left=0; owners=""; live_browser=0
  for pid in $(pgrep -f "$PATTERN" 2>/dev/null || true); do
    if [ "$FORCE" = "1" ]; then orphans="$orphans $pid"; continue; fi
    owner=$(owner_of "$pid")
    if [ "$owner" = "1" ]; then
      if cmd_of "$pid" | grep -qE "$CRASHPAD"; then crashpads="$crashpads $pid"; else orphans="$orphans $pid"; fi
    elif [ "$owner" != "0" ]; then
      left=$((left + 1))
      if cmd_of "$pid" | grep -qE "$BROWSER"; then live_browser=1; fi
      case " $owners " in *" $owner "*) ;; *) owners="$owners $owner" ;; esac
    fi
  done
  if [ "$live_browser" = "1" ]; then
    for pid in $crashpads; do left=$((left + 1)); done
    held_crashpads=$crashpads
  else
    orphans="$orphans $crashpads"; held_crashpads=""
  fi
  for pid in $orphans; do
    if kill "-$1" "$pid" 2>/dev/null; then
      case " $killed " in *" $pid "*) ;; *) killed="$killed $pid" ;; esac
    fi
  done
}

before=$(uptime | sed 's/.*averages*//')
killed=""
sweep_pass TERM
sleep 1
sweep_pass KILL   # anything that ignored SIGTERM, and children re-adopted when their parent died
swept=$(echo $killed | wc -w | tr -d ' ')

alive=$(pgrep -f "$PATTERN" 2>/dev/null | wc -l | tr -d ' ')
printf '✓ test-proc cleanup: swept %s orphaned process(es); %s still alive\n' "$swept" "$alive"
printf '  load before:%s  after: %s\n' "$before" "$(uptime | sed 's/.*averages*//')"
if [ "$left" -gt 0 ]; then
  printf '  LEFT ALONE: %s process(es) owned by a LIVE run — not a leak while the owner lives:\n' "$left"
  for o in $owners; do
    printf '    owner %s: %s\n' "$o" "$(ps -o command= -p "$o" 2>/dev/null | cut -c1-140)"
  done
  if [ -n "$held_crashpads" ]; then
    printf '    +%s crashpad handler(s) at PPID 1, kept while a live browser exists (they cannot be tied to one)\n' "$(echo $held_crashpads | wc -w | tr -d ' ')"
  fi
  printf '  If an owner is hung rather than running, stop IT; --force kills everything matching.\n'
fi
