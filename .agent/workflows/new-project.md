---
description: "[GENERAL] scaffold a new Vite + React project with proper structure"
---

# New Vite + React Project Setup

Use this to start any fresh project with the correct foundation. Avoids the common pitfalls of CRA or manual setup.

## 1. Scaffold with Vite

// turbo

```bash
npx -y create-vite@latest ./ --template react
```

## 2. Install Core Dependencies

```bash
npm install zustand framer-motion lucide-react
```

Add only what you need for the specific project:

- **3D**: `npm install three @react-three/fiber @react-three/drei`
- **Physics**: `npm install @react-three/rapier`
- **HTTP**: `npm install axios`
- **Styling**: `npm install -D tailwindcss postcss autoprefixer`

## 3. Set Up Folder Structure

```bash
mkdir -p src/{components,store,hooks,utils,styles}
```

- `components/` — React UI components
- `store/` — Zustand stores
- `hooks/` — Custom hooks
- `utils/` — Pure helper functions
- `styles/` — CSS files

## 4. Create Zustand Store

```bash
cat > src/store/useAppStore.jsx << 'EOF'
import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Add your state here
}));
EOF
```

## 5. Set Up .gitignore

Use this minimal, clean template:

```text
node_modules/
build/
dist/
*.env
*.env.*
!*.env.example
.DS_Store
*.pem
npm-debug.log*
.idea/
.vscode/
/coverage
*.tsbuildinfo
```

## 6. Set Up Agent Workflows

```bash
mkdir -p .agent/workflows
```

Copy over reusable workflows:

- `cleanup.md` — Full codebase cleanup
- `update-prd.md` — PRD documentation
- `pre-commit.md` — Quality gate before commits
- `upgrade-deps.md` — Safe dependency upgrades

## 7. Create PRD

```bash
mkdir -p memory
cat > memory/PRD.md << 'EOF'
# Project Name

## Project Overview
[Brief description]

## Tech Stack
- **Build**: Vite
- **UI**: React 19
- **State**: Zustand

## Core Features
- [Feature list]

## Development History
### [Date] — Initial Setup
- Scaffolded project with Vite + React
EOF
```

## 8. Verify

// turbo

```bash
npx vite build 2>&1 | tail -5
```
