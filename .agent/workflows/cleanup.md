---
description: full comprehensive codebase cleanup and simplification
---

# Full Codebase Cleanup

Run a comprehensive cleanup across the entire Crafty project. Scan ALL folders and file types — not just source code.

## Phase 1 — Identify Dead Source Files

// turbo

1. **List all source files** and check which are actually imported:

   ```bash
   cd frontend/src
   for f in *.jsx; do
     base=$(basename "$f" .jsx)
     count=$(grep -rl "$base" . --include="*.jsx" --include="*.js" 2>/dev/null | wc -l)
     echo "$base: $count refs"
   done
   ```

2. Check subdirectories too (`store/`, `ui/`, `world/`):

   ```bash
   for f in store/*.jsx ui/*.jsx world/*.jsx world/*.js; do
     base=$(basename "$f" | sed 's/\.\(jsx\|js\)$//')
     count=$(grep -rl "$base" . --include="*.jsx" --include="*.js" 2>/dev/null | wc -l)
     echo "$base: $count refs"
   done
   ```

3. **Any file with 0-1 references** (except `index.jsx` and `App.jsx`) is a dead file candidate.

## Phase 2 — Remove Debug Logs

// turbo
4. **Count console.log statements per file**:

   ```bash
   grep -rc "console\.log" frontend/src/ --include="*.jsx" --include="*.js" | grep -v ":0$" | sort -t: -k2 -rn
   ```

1. **Remove all `console.log` lines** (keep `console.warn` and `console.error`).

2. **Verify build**: `cd frontend && npx vite build`

## Phase 3 — Clean NPM Dependencies

1. **Check each dependency** — search if it's imported in src/:

   ```bash
   cd frontend/src
   for dep in axios lucide-react zustand framer-motion; do
     count=$(grep -rl "$dep" . --include="*.jsx" --include="*.js" | wc -l)
     echo "$dep: $count imports"
   done
   ```

2. **Uninstall unused deps**: `npm uninstall <package_name>`

## Phase 4 — Clean Stale Build Artifacts

// turbo
3. **Find and delete stale items**:

   ```bash
   find . -name ".DS_Store" -delete
   find . -name "*.log" -not -path "*/node_modules/*"
   rm -rf frontend/build/
   find . -type d -empty -not -path "*/.git/*" -not -path "*/node_modules/*"
   ```

## Phase 5 — Audit Config & Root Files

1. **`.gitignore`** — Check for duplicate sections, irrelevant framework rules
2. **`package.json`** — Stale scripts, outdated metadata
3. **`vite.config.js`** — Remove stale CRA/webpack comments
4. **`tailwind.config.cjs` / `postcss.config.cjs`** — Fix stale content paths
5. **`index.html`** — Verify SEO tags, correct script entry
6. **`README.md`** — Replace any CRA boilerplate, reflect current stack
7. **Hidden dotfiles**:

   ```bash
   find . -maxdepth 3 -name ".*" -not -path "*/.git/*" -not -path "*/node_modules/*" | sort
   ```

8. **Empty directories** — Delete any (e.g., `public/` after Vite migration)

## Phase 6 — Simplify Comments

1. Replace verbose `// ====` dividers with single-line comments
2. Remove comments that restate the code
3. Keep comments that explain **WHY**

## Phase 7 — Code Quality Audit (Advanced)

These checks go beyond basic cleanup into code quality and architecture:

1. **Large file audit** — Files >500 lines should be considered for splitting:

   ```bash
   cd frontend/src
   wc -l *.jsx **/*.jsx **/*.js 2>/dev/null | sort -rn | head -15
   ```

   Consider breaking up any file >500 lines into focused modules.

2. **`window.*` global pollution audit** — Count global variables per file:

   ```bash
   cd frontend/src
   grep -c "window\." *.jsx **/*.jsx 2>/dev/null | grep -v ":0$" | sort -t: -k2 -rn
   ```

   High counts indicate tight coupling via globals. Document which globals exist and consider consolidating into a shared event bus or Zustand store.

3. **Bundle size analysis** — Check for oversized chunks:

   ```bash
   cd frontend && npx vite build 2>&1 | grep -E "\.js|\.css"
   ```

   If any chunk >1MB gzipped, consider:
   - `React.lazy()` + dynamic `import()` for code splitting large panels
   - Splitting vendor deps via `build.rollupOptions.output.manualChunks`

4. **Unused CSS audit** — Scan for CSS classes not referenced in JSX:

   ```bash
   # Extract class names from CSS
   grep -oP '\.[\w-]+' frontend/src/App.css | sort -u > /tmp/css_classes.txt
   # Check each against JSX files
   while read cls; do
     name=$(echo "$cls" | sed 's/^\.//')
     count=$(grep -rl "$name" frontend/src/ --include="*.jsx" 2>/dev/null | wc -l)
     if [ "$count" -eq 0 ]; then echo "UNUSED: $cls"; fi
   done < /tmp/css_classes.txt
   ```

5. **Duplicate logic audit** — Search for repeated patterns:
   - Multiple components defining the same constants (spell colors, mob types)
   - Copy-pasted event handler patterns
   - Multiple files importing the same set of hooks

6. **React performance patterns** — Verify:
   - `React.memo()` on frequently-rendered child components
   - `useCallback` for functions passed as props
   - `useMemo` for expensive calculations (chunk generation, etc.)
   - No state updates in render-path code

## Phase 8 — Verify and Document

1. **Verify build**: `cd frontend && npx vite build`
2. **Test dev server**: `cd frontend && npm run dev`
3. **Run `/update-docs`** to document all cleanup in the CHANGELOG

## Checklist

- [ ] Dead source files removed
- [ ] console.log statements removed
- [ ] Unused NPM dependencies uninstalled
- [ ] Stale build artifacts deleted
- [ ] `.gitignore` cleaned
- [ ] `package.json` reviewed
- [ ] Config files reviewed (vite, tailwind, postcss)
- [ ] `index.html` reviewed
- [ ] `README.md` updated for current stack
- [ ] Hidden dotfiles audited
- [ ] Empty directories removed
- [ ] Verbose comments simplified
- [ ] Large files (>500 lines) flagged or split
- [ ] `window.*` globals documented
- [ ] Bundle size checked
- [ ] Unused CSS removed
- [ ] Duplicate logic consolidated
- [ ] React perf patterns verified (memo, useCallback, useMemo)
- [ ] `npx vite build` passes with 0 errors
- [ ] PRD updated with cleanup details
tails
