# Crafty — 3D Minecraft-Style Browser Game

A magical 3D browser game built with React 19 + Three.js, featuring block building, magic spells, NPCs, quests, and procedural terrain.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build    # → frontend/build/
npm run preview  # preview production build
```

## Tech Stack

- **Runtime**: React 19, Three.js 0.172
- **3D**: @react-three/fiber 9.5, @react-three/drei 10.7
- **Physics**: @react-three/rapier 2.2 (TrimeshCollider terrain)
- **Build**: Vite 6.4
- **Styling**: Tailwind CSS 3.x, Framer Motion 12.x
- **State**: Zustand 5.x

## Controls

**Read them from `src/game/keyMap.js`, which is the single source of truth**, or from the in-game controls
panel, which a gate checks against that file in both directions.

This section used to hand-copy the table, and by 2026-08-09 it listed 11 bindings against 17 live ones —
silently omitting `G H L R T U V X Z`. That is the same defect `8a5e008` fixed inside the game: an
advertised key with no handler is a lie, and a handler advertised nowhere is a feature the player never
finds. `keyMap.js` exists precisely so the two can never disagree, and a second hand-maintained copy out
here — governed by no gate, referenced by no doc — reintroduces the drift the SoT was built to end.

Movement is WASD + Space to jump + mouse to look; everything else, read from the file.

## Documentation & Architecture

This repository uses a structured 4-piece Agentic Memory framework. For deep contextual history, active development plans, and codebase architecture, refer to the `../memory/` directory:
- [ARCHITECTURE.md](../memory/ARCHITECTURE.md): Component decay, React strategies, and math laws.
- [CHANGELOG.md](../memory/CHANGELOG.md): Reverse-chronological historical updates.
- [ROADMAP.md](../memory/ROADMAP.md): Priority list for future enhancements.
