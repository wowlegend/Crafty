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
- `pre-commit.md` — Quality gate before commits
- `upgrade-deps.md` — Safe dependency upgrades

## 7. Create Modular Memory Structure

Instead of a monolithic PRD, use the modern 4-file memory structure.

```bash
mkdir -p memory
```

Create `memory/ARCHITECTURE.md` (The Blueprint):
```bash
cat > memory/ARCHITECTURE.md << 'EOF'
# Project Name
## Tech Stack
- **Build**: Vite
- **UI**: React 19
- **State**: Zustand
## Core Features
- [Feature list]
EOF
```

Create `memory/CHANGELOG.md` (The Past):
```bash
cat > memory/CHANGELOG.md << 'EOF'
# Changelog & Development History
### [Date] — Initial Setup
- Scaffolded project with Vite + React
EOF
```

Create `memory/ROADMAP.md` (The Future):
```bash
cat > memory/ROADMAP.md << 'EOF'
# Roadmap & Future Enhancements
## Phase 1
- [ ] First feature to build
EOF
```

Create `memory/ACTIVE_PLAN.md` (The Present):
```bash
cat > memory/ACTIVE_PLAN.md << 'EOF'
# Active Plan

*This file is a volatile, read/write scratchpad for the current active feature or refactor.*
*When starting a new complex task, the AI should outline the step-by-step plan here with checkboxes `[ ]`.*
*As work progresses, the AI checks off boxes `[x]`. If a session breaks, the next agent can resume from the first unchecked box.*
*When the feature is complete and merged, this file is cleared or overwritten with the next plan.*

## Current Task: None
*Ready for the next directive.*
EOF
```

## 8. Verify

// turbo

```bash
npx vite build 2>&1 | tail -5
```
>&1 | tail -5
```
