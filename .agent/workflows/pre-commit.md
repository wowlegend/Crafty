---
description: "[GENERAL] run before any git commit to catch problems early"
---

# Pre-Commit Quality Gate

Run these checks before committing to catch regressions early. Applies to any Vite + React project.

// turbo-all

## 1. Build Check

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

Build must pass with 0 errors.

## 2. Debug Log Check

```bash
grep -rc "console\.log" frontend/src/ --include="*.jsx" --include="*.js" | grep -v ":0$" | sort -t: -k2 -rn
```

Must return empty (0 console.log statements).

## 3. System Junk Check

```bash
find . -name ".DS_Store" -not -path "*/node_modules/*" -not -path "*/.git/*"
```

Delete any found: `find . -name ".DS_Store" -delete`

## 4. Dead Commented-Out Code

```bash
# Check for large commented-out blocks (>5 consecutive // lines)
cd frontend/src
for f in *.jsx **/*.jsx; do
  count=$(grep -c "^[[:space:]]*//" "$f" 2>/dev/null)
  if [ "$count" -gt 10 ]; then echo "REVIEW: $f ($count comment lines)"; fi
done
```

Review any file with >10 comment-only lines.

## 5. Bundle Size Regression

```bash
cd frontend && npx vite build 2>&1 | grep -E "\.js|\.css" | head -5
```

Compare CSS and JS sizes against last known good build. Flag if JS gzip > 1.3MB or CSS gzip > 7KB.
