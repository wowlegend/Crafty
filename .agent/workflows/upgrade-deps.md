---
description: "[GENERAL] safely upgrade major dependencies without breaking the project"
---

# Safe Dependency Upgrade

Use this workflow when upgrading React, Three.js, or any major dependency. Prevents cascading peer dependency failures.

## 1. Create a Safety Branch

```bash
git checkout -b upgrade/<dep-name>
```

## 2. Check Current Peer Dependencies

// turbo

```bash
cd frontend && npm ls --all 2>&1 | grep -i "peer dep\|ERESOLVE\|invalid" | head -20
```

Document any existing peer dep warnings before making changes.

## 3. Upgrade One Dependency at a Time

For each dep:

```bash
npm install <package>@latest
npx vite build 2>&1 | tail -5
```

Build must pass **after each individual upgrade**. If it fails, check:

- Changelog for breaking API changes
- Peer dependency requirements of the new version
- Named vs default exports (e.g., Zustand v4→v5: `import create` → `import { create }`)

## 4. Check for React-Specific Breakage

- `React.StrictMode` in dev causes double-mount — disable if physics/audio breaks
- `forwardRef` changes between React 18 and 19
- `useEffect` cleanup timing may differ

## 5. Check Build System Implications

- If upgrading build tool (CRA→Vite, Webpack→Vite):
  - `process.env.REACT_APP_*` → `import.meta.env.VITE_*`
  - Move `index.html` if needed (CRA: `public/`, Vite: project root)
  - Rename config files to `.cjs` if `"type": "module"` in package.json

## 6. Post-Upgrade Verification

```bash
npx vite build 2>&1 | tail -5
npm run dev  # smoke test in browser
```

## 7. Update Documentation

- Run `/wrapup` to update tech stack section
- Update workflow files if build commands changed
- Update `.gitignore` if new artifacts are generated
- Update `README.md` with new commands if applicable
