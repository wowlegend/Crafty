#!/bin/sh
# PostCompact — tell the freshly-compacted agent which rule files exist and why it cannot see them.
#
# `.claude/rules/*.md` carrying `paths:` frontmatter is a NATIVE Claude Code feature that injects a rule
# ONLY when a file matching its glob is touched. That conditionality is the whole point — a rule fires at
# the moment of the mistake rather than being skimmed at orientation — but it has a cost nobody had
# written down: after a compaction the agent has no idea they exist, so it cannot go and read one
# deliberately before writing a gate, a mesher change or an input handler.
#
# Emits additionalContext, the one channel that survives the compaction boundary. Pure advisory: never
# blocks, and exits 0 even if the rules directory is missing.
#
# The globs are read out of each file's YAML list rather than hard-coded, because a hard-coded copy would
# rot exactly like every other hand-maintained count in this repo. The first version used a single-line
# `sed` and reported every rule as "unscoped" — confidently wrong information, in the one channel that
# survives a compaction. The pipe-test is therefore part of this script's contract, not a nicety.
DIR="${CLAUDE_PROJECT_DIR:-/Users/kz/Code/Crafty}/.claude/rules"
[ -d "$DIR" ] || { printf '{}'; exit 0; }

LIST=$(for f in "$DIR"/*.md; do
  [ -f "$f" ] || continue
  b=$(basename "$f")
  p=$(awk 'BEGIN{inp=0} /^paths:/{inp=1;next} inp&&/^---/{exit} inp&&/^[[:space:]]*-/{s=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",s); gsub(/"/,"",s); printf "%s ", s}' "$f")
  printf -- '- %s -> %s\\n' "$b" "${p:-unscoped}"
done)
[ -n "$LIST" ] || { printf '{}'; exit 0; }

printf '{"hookSpecificOutput":{"hookEventName":"PostCompact","additionalContext":"PATH-SCOPED RULES EXIST AND ARE NOT IN YOUR CONTEXT.\\nThey auto-inject ONLY when you touch a file matching their glob, so after a compaction you cannot see them and will not know to look:\\n%s\\nRead the matching one BEFORE writing a gate, probe, mesher or input change — not after it goes red."}}' "$LIST"
