#!/bin/sh
# SessionStart(compact) — re-orient a freshly compacted agent: which tree it is in, what is in flight, whether its
# local gates run, and which path-scoped rule files exist that it cannot see.
#
# THE CHANNEL. Until 2026-10-27 this was `post-compact-rules.sh`, registered on PostCompact and emitting
# `additionalContext`. PostCompact has no such field — Claude Code 2.1.311's binary carries `additionalContext` for
# 12 events and PostCompact is not one of them (refute F9; `claude-code.d.ts` ClassicResultFields agrees) — so the
# reminder never reached the model. SessionStart carries it, and its `compact` matcher fires on the session that
# resumes after a compaction. Registered in .claude/settings.json.
#
# WHY THE RULES LIST. `.claude/rules/*.md` with `paths:` frontmatter inject ONLY when a matching file is touched.
# After a compaction the agent has no idea they exist, so it cannot read one deliberately before writing a gate, a
# mesher change or an input handler. The globs are read out of each file's YAML list, which spans several lines:
# the first version read them with a single-line `sed` and reported every rule as "unscoped".
#
# CONTRACT (tests/scripts/session-start-compact.test.js runs a byte-identical copy of this file in a fixture repo):
#   stdin   the hook JSON — read and discarded
#   stdout  {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}, or {} when there is
#           nothing to say or anything fails
#   exit    always 0: advisory, never blocks
# ROOT comes from git, located from THIS FILE, never from CLAUDE_PROJECT_DIR and never from a hard-coded home path,
# so a lane's hook reads the lane. The JSON is built by node's JSON.stringify with the text passed through the
# environment: interpolating text into a JSON string broke on any heading or git line holding `"` or `\`.
#
# THE NONCE. The first context line is `compact-context nonce <N>`, N read from /dev/urandom, and N is also
# written to <git-common-dir>/crafty-compact-nonce. Nothing in the repo holds N, so finding it in a transcript
# after the compact boundary, in an entry that is not a tool result, can only mean this output reached the model.

cat >/dev/null 2>&1

# A hook run from inside one of git's own hooks would inherit GIT_DIR and friends and read the caller's repository.
for v in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$ROOT" ]; then printf '{}'; exit 0; fi
DIR="$ROOT/.claude/rules"
if [ ! -d "$DIR" ]; then printf '{}'; exit 0; fi

RULES=$(for f in "$DIR"/*.md; do
  [ -f "$f" ] || continue
  b=$(basename "$f")
  p=$(awk 'BEGIN{inp=0; out=""} /^paths:/{inp=1; next} inp&&/^---/{exit} inp&&/^[[:space:]]*-/{s=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",s); gsub(/"/,"",s); out = (out=="" ? s : out " " s)} END{printf "%s", out}' "$f")
  printf -- '- %s -> %s\n' "$b" "${p:-unscoped}"
done)
if [ -z "$RULES" ]; then printf '{}'; exit 0; fi

N=$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')
COMMON=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$COMMON" ] && [ -n "$N" ]; then printf '%s\n' "$N" >| "$COMMON/crafty-compact-nonce" 2>/dev/null; fi

BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
STATUS=$(git -C "$ROOT" status -sb 2>/dev/null | head -3)
HEADING=$(grep -m1 '^## ' "$ROOT/memory/ACTIVE_PLAN.md" 2>/dev/null)
HP=$(git -C "$ROOT" config --get core.hooksPath 2>/dev/null)
if [ -z "$HP" ]; then
  HOOKS='local gates are OFF: core.hooksPath is unset, so no commit or push hook runs in this tree'
elif [ "$HP" = ".githooks" ]; then
  HOOKS="hooks: this tree's own .githooks"
else
  HOOKS="this tree runs the hooks at $HP, not its own"
fi

CTX=$(printf 'compact-context nonce %s\ntree: %s (branch %s)\n%s\nACTIVE_PLAN cursor: %s\n%s\nPATH-SCOPED RULES EXIST AND ARE NOT IN YOUR CONTEXT. They auto-inject ONLY when you touch a file matching their glob, so after a compaction you cannot see them:\n%s\nRead the matching one BEFORE writing a gate, probe, mesher or input change, not after it goes red.' \
  "$N" "$ROOT" "${BRANCH:-unknown}" "$STATUS" "${HEADING:-(none)}" "$HOOKS" "$RULES")

if ! command -v node >/dev/null 2>&1; then printf '{}'; exit 0; fi
OUT=$(CRAFTY_COMPACT_CONTEXT="$CTX" node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.CRAFTY_COMPACT_CONTEXT}}))' 2>/dev/null)
if [ -z "$OUT" ]; then OUT='{}'; fi
printf '%s' "$OUT"
exit 0
