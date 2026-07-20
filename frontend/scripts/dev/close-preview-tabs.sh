#!/bin/sh
# close-preview-tabs.sh — close ORPHANED cmux localhost/dev preview tabs, SAFELY.
#
# WHY (Kevin, 2026-07-14): cmux opens a browser PREVIEW SURFACE for every localhost port it detects.
# E2E / capture / ad-hoc probe servers create them; when the server dies the surface LINGERS as a husk.
# They pile up (30+ observed in one Crafty workspace) and clog the browser / CPU / RAM. kill-test-procs.sh
# kills the PROCESSES; it does not touch the cmux SURFACES. This is its surface-level companion.
#
# ⚠️ THE FOOTGUN THIS SCRIPT EXISTS TO NEUTRALIZE (near-fatal, 2026-07-14):
#   `cmux close-surface` with an UNRESOLVED --surface falls back to closing $CMUX_SURFACE_ID — the
#   CALLER'S OWN tab. An autonomous loop iteration self-decapitated its own Claude Code session this way
#   (exit 0, "OK", session gone). This script is built so self-close is IMPOSSIBLE:
#     1. SELF = $CMUX_SURFACE_ID is captured up front; a surface is excluded by its UUID if it == SELF,
#        regardless of the `* ` selected-marker column shift (parse the UUID, don't trust field position).
#     2. Only surfaces whose TITLE is an explicit preview title are considered — matched with shell `case`
#        GLOBS (literal "Crafty | Magical" / "localhost:"), never an awk regex (where `\|` de-escapes into
#        an alternation and matches an agent tab titled "Crafty game" — a bug the first version shipped).
#     3. Every close passes a RESOLVED UUID AND overrides $CMUX_SURFACE_ID to that SAME dead UUID for the
#        call, so even a total fall-through hits the dead tab, not us.
#     4. After every close, SELF is re-verified. If SELF EVER vanishes, ABORT (and the loop runs in the
#        CURRENT shell via a heredoc — not a pipe subshell — so `exit` actually stops the script).
#
# MANUAL / explicitly-invoked tool. The autonomous loop must NOT auto-run --close (a destructive CLI whose
# default target is the caller is not fired unattended — LOOP-CHARTER §6.4). Default mode LISTS only.
#
# Usage:
#   sh close-preview-tabs.sh            # LIST orphan preview tabs (never closes) — safe default
#   sh close-preview-tabs.sh --close    # close them, one at a time, verifying self-survival after each

set -eu

MODE="list"
[ "${1:-}" = "--close" ] && MODE="close"

SELF="${CMUX_SURFACE_ID:-}"
if [ -z "$SELF" ]; then
  echo "close-preview-tabs: \$CMUX_SURFACE_ID is empty — refusing to run (cannot guarantee self-safety)."
  exit 1
fi
command -v cmux >/dev/null 2>&1 || { echo "close-preview-tabs: no cmux CLI on PATH — nothing to do."; exit 0; }

echo "close-preview-tabs: SELF surface = $SELF (protected — never a target)"

UUID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'

# Emit TSV rows (workspace \t uuid \t title) for orphan preview surfaces only, SELF excluded by UUID.
list_dead() {
  ws=$(cmux workspace list 2>/dev/null | grep -oE 'workspace:[0-9]+' | sort -u)
  for w in $ws; do
    panes=$(cmux list-panes --workspace "$w" 2>/dev/null | grep -oE 'pane:[0-9]+' || true)
    for p in $panes; do
      cmux list-pane-surfaces --workspace "$w" --pane "$p" --id-format both 2>/dev/null | while IFS= read -r line; do
        uuid=$(printf '%s\n' "$line" | grep -oiE "$UUID_RE" | head -1)
        [ -z "$uuid" ] && continue
        [ "$uuid" = "$SELF" ] && continue            # NEVER self — by UUID, marker-shift-proof
        title=${line#*"$uuid"}                        # everything after the UUID
        case "$title" in
          *"localhost:"*|*"127.0.0.1:"*|*"Crafty | Magical"*)
            printf '%s\t%s\t%s\n' "$w" "$uuid" "$title" ;;
        esac
      done
    done
  done
}

# True iff SELF still exists somewhere.
self_alive() {
  for w in $(cmux workspace list 2>/dev/null | grep -oE 'workspace:[0-9]+' | sort -u); do
    if cmux list-pane-surfaces --workspace "$w" --id-format both 2>/dev/null | grep -qi "$SELF"; then
      return 0
    fi
  done
  return 1
}

DEAD=$(list_dead || true)
N=$(printf '%s' "$DEAD" | grep -c . || true)

if [ "$N" -eq 0 ]; then
  echo "close-preview-tabs: no orphan preview tabs found. Nothing to do."
  exit 0
fi

echo "close-preview-tabs: found $N orphan preview tab(s):"
printf '%s\n' "$DEAD" | awk -F'\t' '{ printf "  %s  %s  %s\n", $1, $2, $3 }'

if [ "$MODE" = "list" ]; then
  echo "close-preview-tabs: dry-run (LIST) — re-run with --close to close them."
  exit 0
fi

# --- close mode: current-shell loop (heredoc, not a pipe) so `exit` actually aborts ---
closed=0
while IFS="$(printf '\t')" read -r w uuid title; do
  [ -z "${uuid:-}" ] && continue
  [ "$uuid" = "$SELF" ] && { echo "REFUSING: target == SELF — skipping."; continue; }
  CMUX_SURFACE_ID="$uuid" cmux close-surface --surface "$uuid" --workspace "$w" >/dev/null 2>&1 || true
  if ! self_alive; then
    echo "close-preview-tabs: ‼️  SELF vanished after closing $uuid — ABORTING."
    exit 2
  fi
  closed=$((closed + 1))
  echo "  closed $uuid ($title )"
done <<EOF
$DEAD
EOF

echo "close-preview-tabs: done — closed $closed tab(s). SELF ($SELF) intact."
