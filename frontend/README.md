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

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump |
| Mouse | Look |
| F | Cast spell |
| 1-4 | Select spell |
| Q | Claim quest |
| E | Inventory |
| M | Magic |
| C | Crafting |
| B | Building |
| ESC | Settings |
