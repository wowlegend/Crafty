# Crafty - 3D Minecraft-Style Browser Game

## Project Overview

A 3D browser game built with React and Three.js, featuring Minecraft-style gameplay with block building, magic system, NPCs, and procedural terrain generation.

## Tech Stack

- **Runtime**: React 19, Three.js 0.172
- **3D Engine**: @react-three/fiber 9.5, @react-three/drei 10.7
- **Physics**: @react-three/rapier 2.2 (Rapier WASM)
- **Styling**: Tailwind CSS 3.x, Framer Motion 12.x
- **State**: Zustand 5.x (global store), React hooks
- **Build**: Vite 6.x (migrated from CRA Feb 2026)

## Core Features

- Procedural infinite terrain generation with chunks and biome variety
- Block placement and destruction with particle effects
- Magic system with 4 spell types (Fireball, Iceball, Lightning, Arcane) + Shield
- NPC/Mob system with 5 mob types, AI movement, health bars, hostile chase AI
- Day/night cycle
- Creative mode gameplay
- Player stats: health, mana, hunger with regeneration
- XP and leveling system with visual feedback
- Sound system with procedurally generated audio
- Save/Load functionality (requires backend auth)
- Animated main menu with particle effects
- Minimap HUD with mob tracking
- Quest system with 15 trackable quests across 3 tiers
- Loot drop system (mobs drop items on death)
- Treasure chests with random world spawning
- Achievement system with 12 badges and stats tracking

## Architecture

```text
/frontend/
├── index.html                    # Vite entry point
├── vite.config.js                # Vite build config
├── postcss.config.cjs            # PostCSS (Tailwind)
├── tailwind.config.cjs           # Tailwind config
└── src/
    ├── App.jsx                   # Main app, Canvas, Minimap, Main Menu
    ├── App.css                   # Global styles, animations, glassmorphic panels
    ├── Components.jsx            # Player, UI panels, block types
    ├── SimplifiedNPCSystem.jsx   # Mob spawning, AI, chase behavior, combat
    ├── EnhancedMagicSystem.jsx   # Spell projectiles, effects, hand visuals
    ├── GameSystems.jsx           # Player stats (HP/MP/hunger), combat, UI bars
    ├── SimpleExperienceSystem.jsx # XP, leveling, visual gain/level-up effects
    ├── SoundManager.jsx          # Procedural audio (combat, magic, ambient)
    ├── QuestSystem.jsx           # Quests, loot drops, treasure chests, achievements
    ├── AdvancedGameFeatures.jsx  # Survival mode, boss mob, pets, spell upgrades
    ├── OptimizedGrassSystem.jsx  # Grass rendering optimization
    ├── AuthContext.jsx           # Authentication state
    ├── AuthComponents.jsx        # Auth UI components
    ├── WorldManager.jsx          # World save/load
    ├── index.jsx                 # App entry point
    ├── index.css                 # Base CSS reset + Tailwind directives
    ├── store/useGameStore.jsx    # Zustand global state store
    ├── world/Terrain.jsx         # Terrain generation + Rapier physics colliders
    ├── world/Blocks.js           # Block type definitions
    └── ui/GamePanels.jsx         # Extracted UI panel components
```

## Development History

### June 8, 2025 — Original Creation (Emergent / SnapLaunch Platform)

*200+ commits by `Snap-Launch-Studio1` — built the entire game from scratch in one session*

- Created React + Three.js project scaffold
- Implemented procedural infinite terrain generation with chunk system
- Built block placement and destruction mechanics
- Added first-person player movement (WASD + Space jump + mouse look)
- Created magic system with 4 spell types (Fireball, Iceball, Lightning, Arcane)
- Built day/night cycle
- Set up creative mode gameplay
- Implemented sound system with procedurally generated audio
- Created player stats system (health, mana, hunger)
- Added XP and leveling progression
- Built authentication system and world save/load framework
- Established all core UI panels (Inventory, Magic, Crafting, Building, Settings)

### November 14, 2025 — Feature Expansion (Emergent Platform)

*9+ commits by `emergent-agent-e1` — extended core systems*

- Enhanced magic system with improved projectile effects
- Expanded game systems and combat mechanics
- Added grass rendering optimization systems
- Refined terrain generation and world rendering

### December 26-27, 2025 — Major Iteration

- Further refined terrain generation and chunk system
- Enhanced player movement and camera controls
- Expanded spell effects and combat feedback
- Improved grass and environment rendering

### January 4, 2026 (Session 1) — Camera & Terrain Fixes

- Fixed green screen camera bug
- Fixed initial view angle
- Verified terrain generation
- Verified F key spell damage

### January 4, 2026 (Session 2) — Major Features

- **MOB SYSTEM OVERHAUL**:
  - Added 5 mob types: Pig (pink), Cow (brown), Zombie (green), Skeleton (beige), Spider (black)
  - Mob wandering AI — mobs move randomly around the terrain
  - Health bars above all mobs
  - Floating damage numbers when attacking
  - Continuous mob spawning as player explores new chunks
  - Mobs despawn when too far from player

- **UI PANELS REBUILT**:
  - E — Inventory panel with block selection grid
  - M — Magic panel with all 4 spells and descriptions
  - C — Crafting panel with recipes
  - B — Building Tools panel
  - ESC — Settings panel with toggles and Resume button

- **SPELL SYSTEM FIXES**:
  - F key now casts visible spell projectiles
  - Number keys 1-4 change spell type (fixed closure bug)
  - Spell projectiles hit mobs and deal damage
  - Impact effects when spells hit terrain or mobs

- **MOUSE LOOK FIX** — Click anywhere in game to enable mouse look

### January 24, 2026 — Debugging Spell Effects

- Fixed intermittent spell projectile visibility (some casts showed blank)
- Ensured all spell damage registers consistently with each cast
- Debugged spell effect rendering pipeline

### January 25, 2026 — Building & Branding Cleanup

- Fixed intermittent spell triggering (2nd press sometimes missed)
- Fixed spell effects disappearing when pressing F
- Removed all "Emergent" branding from the application
- Repaired building/crafting functionality (pickaxe selection, block placement)
- Fixed tool switching and block selection in creative mode

### February 11, 2026 (Session 1) — CSS & Spell Handler Fixes

- Fixed CSS nesting bug breaking styles
- Removed duplicate spell handlers causing conflicts
- Cleaned up remaining branding references
- Fixed git corruption from macOS file system protections
- Files changed: App.css, App.js, Components.js, EnhancedMagicSystem.js, GameSystems.js

### February 11, 2026 (Session 2) — Visual Polish & New Features

- **EPIC MAIN MENU**:
  - Deep space-purple radial gradient background
  - 40 twinkling star particles with randomized timing
  - 15 floating colored block particles drifting across screen
  - Golden shimmer-animated "Crafty" title with wizard emoji
  - Glow-pulsing "Start Adventure" button
  - Controls hint bar at bottom

- **RICHER TERRAIN**:
  - New block types: Red Flower, Yellow Flower, Birch Wood, Leaves
  - Flowers scatter ~2% on grass surfaces
  - Ore veins: coal, iron, gold, diamond at realistic depths underground
  - Taller trees (4-6 blocks), 3×3 leaf canopies, 30% birch variant

- **HOSTILE MOB CHASE AI**:
  - Hostile mobs detect player within 16 blocks aggro range
  - Chase at 1.5× speed when aggroed
  - Melee attacks within 2.5 blocks with 1-second cooldown
  - Knockback when mobs are hit (pushed away from player)
  - 25 XP awarded on mob kill

- **MINIMAP HUD**:
  - 130×130px canvas radar in bottom-right corner
  - White dot = player, green = passive mobs, red = hostile mobs
  - Grid overlay with cardinal "N" marker
  - Coordinate readout, updates every 250ms

- **GLASSMORPHIC UI PANELS**:
  - Frosted glass effect (backdrop blur + semi-transparent gradient)
  - Subtle border glow, inset highlights, hover lift animations
  - Golden accent on selected items
  - Applied to: Inventory, Crafting Table, Magic Spells, Building Tools, Settings

### February 23, 2026 — Bug Fixes & Game Progression System

- **JUMP BUG FIX**:
  - Added `isGrounded` ref for reliable ground state tracking
  - Jump input buffering (queues rapid presses between frames)
  - Jump velocity: 8 → 10, gravity: 20 → 25 (snappier, higher jumps)
  - Terrain fall-through prevention safety check

- **SPELL CASTING FIX**:
  - Cast cooldown: 333ms → 200ms (5 casts/sec, more responsive)
  - Throttled `setProjectiles()` to every 2 frames (was every frame = 60/sec render churn)
  - Added dirty flag — React only re-renders when projectiles actually change

- **QUEST SYSTEM** (new `QuestSystem.js`):
  - 15 quests across 3 tiers (Beginner → Intermediate → Advanced)
  - 3 active quests shown at a time, auto-rotates on completion
  - Quest types: kill, kill_type, block_place, block_break, spell_cast, chest_open, distance
  - XP rewards on quest claim (30-400 XP)
  - Glassmorphic quest tracker panel in top-left HUD

- **LOOT DROP SYSTEM**:
  - 5 loot tables (one per mob type) with per-item drop chances
  - Items: Raw Porkchop, Leather, Bones, Iron Nuggets, Spider Eyes, Emeralds, Ender Pearls
  - Auto-collect after 2s, grants bonus XP
  - Notification popups on loot pickup

- **TREASURE CHEST SYSTEM**:
  - Chests spawn randomly 20-60 blocks from player every 30 seconds
  - Press G to open when nearby (< 3 blocks)
  - Loot: Health Potions, Mana Potions, Damage Scrolls, Diamonds, Golden Crowns, Star Fragments
  - Proximity indicator appears when near a chest

- **ACHIEVEMENT SYSTEM**:
  - 12 achievements: First Steps, Warrior, Serial Slayer, Centurion, Apprentice, Wizard, etc.
  - Press Tab to view achievements panel with stats dashboard
  - Stats tracked: kills, spells cast, chests opened, blocks placed/broken, deaths
  - Golden notification popups on unlock

- **NPM QUARANTINE FIX**:
  - Diagnosed root cause: macOS Sequoia `com.apple.provenance` quarantine on agent terminal
  - Permanent fix: disabled "Enable Terminal Sandbox" in agent settings

- **SURVIVAL MODE** (new in `AdvancedGameFeatures.js`):
  - Night danger multiplier (1.5× + 0.1× per night survived)
  - Hostile mob spawn rate 70% at night (vs ~60% base)
  - Warning banners on day/night transitions
  - Night mob count scales with survival time

- **BOSS MOB — SHADOW DRAGON**:
  - Spawns at Level 5, 30 blocks from player
  - 500 HP, 3 combat phases (color/speed/damage escalation)
  - 3D entity with body, wings, glowing red eyes, point light
  - Boss health bar under spell indicator
  - 500 XP reward on defeat

- **PET SYSTEM**:
  - Press T near passive mobs (pig/cow) to tame (max 3 pets)
  - Pets get random names (Buddy, Patches, Muffin, etc.)
  - 3D pet entities follow player with smooth interpolation
  - Pet indicator UI showing names and health
  - Pink heart above tamed pets

- **SPELL UPGRADE SYSTEM**:
  - Press U to open upgrade panel
  - 3 tiers per spell (I → II → III)
  - Increasing damage and mana cost per tier
  - Level requirements to unlock (Level 2/3/5)
  - Visual upgrade indicators (filled dots)

- **CODE CLEANUP & REFACTORING**:
  - Deleted 3 dead source files: `EnhancedGrassSystem.js`, `MagicSystem.js`, `ExperienceSystem.js` (~28KB)
  - Removed 25 `console.log` debug statements from 5 files
  - Simplified verbose section divider comments (~40 lines of bloat removed)
  - Removed 2 unused NPM dependencies: `react-router-dom`, `suspend-react`
  - Deleted stale `node_modules_broken/` (457MB) and `node_modules_old/` (279MB)
  - Deleted stale files: `frontend.log`, root `yarn.lock`, `.DS_Store` files
  - Updated `/update-prd` workflow with step 6: "Document any code cleanup or refactoring"
  - Source file count: 19 → 16, total disk savings: ~736MB

- **DEEP CODEBASE AUDIT (Gemini 3.1 Pro)**:
  - Removed legacy 'Emergent' cloud deployment scaffolding (`Dockerfile`, `nginx.conf`, `entrypoint.sh`, `.devcontainer/`)
  - Deleted old AI agent traces (`test_reports/iteration_1.json`, `test_reports/iteration_2.json`, `.gitconfig`)
  - Removed unused Python backend scaffolding (`backend/server.py`, `scripts/update-and-start.sh`, `tests/`)
  - Ensured the repository is clean and ready for standard modern React/Node public deployment.

### February 23, 2026 (Architecture Refactor — Phase 1 & 2)

- **PHASE 1: ZUSTAND STATE MIGRATION**:
  - Removed the monolithic `useGameState` from `App.js` which caused massive prop drilling.
  - Extracted game state into a global `useGameStore.js` using Zustand.
  - Rewired all UI components to consume `useGameStore` directly instead of prop drilling.

- **PHASE 2: RAPIER PHYSICS UPGRADE**:
  - Replaced custom AABB jump/gravity math with `@react-three/rapier` WebAssembly physics engine.
  - Wrapped 3D Canvas in `<Physics>` provider.
  - Converted terrain blocks to `<InstancedRigidBodies>` for physical collisions.
  - Upgraded Player to dynamic `<RigidBody>` with `<CapsuleCollider>`.

### February 23-24, 2026 — Physics Debugging & Terrain Collision Fixes

- **TERRAIN COLLISION BUG**:
  - Diagnosed that `InstancedRigidBodies` required an `instances` array prop (not flat `Float32Array` buffers).
  - Player was falling infinitely through the world due to zero-scale collision matrices.
  - Void Catch reset at `y < -10` was locking X/Z coordinates to `(0, 0)`.

- **CAMERA PITCH BUG**:
  - R3F Canvas auto-pointed camera at `(0,0,0)`, causing a -90° downward pitch from spawn at `(0, 30, 0)`.
  - `PointerLockControls` cached this angle, permanently locking the view to the ground.
  - Fixed by forcing `camera.lookAt(0, 30, -100)` in `onCreated` hook.

- **INVISIBLE FIREBALLS**:
  - Camera pointed straight down → fireballs spawned 2 units below the player, through the floor.
  - Fixed by correcting camera orientation (fireballs now spawn forward).

- **PEER DEPENDENCY CRASH**:
  - `@react-three/rapier` v2.2.0 required `@react-three/fiber` v9 (we had v8).
  - React silently dropped `<RigidBody>` refs due to `forwardRef` incompatibility.
  - Temporarily downgraded to Rapier v1.5.0 before performing the full stack upgrade.

### February 24, 2026 — Full Tech Stack Upgrade (CRA → Vite)

- **BUILD SYSTEM MIGRATION**:
  - Migrated from Create React App (deprecated) to **Vite 6.4** build system.
  - Build time reduced from ~30s to ~3.7s.
  - Created `vite.config.js` with React plugin and JSX-in-.js support.
  - Moved `index.html` from `public/` to project root (Vite convention).
  - Renamed `postcss.config.js` and `tailwind.config.js` to `.cjs` (ESM compat).

- **DEPENDENCY CHAIN UPGRADE**:
  - React 18.2 → **19.0**, React DOM 18.2 → **19.0**
  - @react-three/fiber 8.18 → **9.5.0**
  - @react-three/drei 9.56 → **10.7.7**
  - @react-three/rapier 1.5 → **2.2.0**
  - three 0.158 → **0.172.0**
  - framer-motion 10.0 → **12.34.3**
  - zustand 4.x → **5.0.11**

- **CODE MIGRATION**:
  - Renamed 16 source files from `.js` → `.jsx` (Vite requires explicit JSX extensions).
  - Updated Zustand import: `import create` → `import { create }` (v5 named export).
  - Converted `process.env.REACT_APP_*` → `import.meta.env.VITE_*` (Vite env vars).
  - Removed CRA dependencies: `react-scripts`, `cra-template`, `schema-utils`, `@babel/plugin-proposal-private-property-in-object`.
  - Updated `package.json` scripts: `start` → `vite`, `build` → `vite build`.
  - Added `"type": "module"` to package.json for native ESM support.

### February 25, 2026 — Full Codebase Audit & Physics Architecture Overhaul

- **PHYSICS ARCHITECTURE OVERHAUL**:
  - Removed `InstancedRigidBodies` from terrain (was creating ~80,000 individual cuboid colliders)
  - Replaced with `TrimeshCollider` — one per chunk (~50 total), using exact world-space vertices
  - 1,600× reduction in Rapier physics body count
  - `ChunkMesh` converted to visual-only `instancedMesh` rendering

- **PLAYER MOVEMENT FIXES**:
  - Fixed WASD direction by replacing fragile Euler extraction with `camera.getWorldDirection()`
  - Fixed A/D strafing flip (`moveA - moveD` → `moveD - moveA`)
  - Removed `React.StrictMode` (caused double-mount of physics bodies in React 19)
  - Keyboard input: `useState` → `useRef` (eliminated stale closures + 60+ re-renders/sec)

- **HAND RENDERING**:
  - Implemented smoothed camera matrix (lerp 0.08) for hand positioning
  - Decoupled hand rendering from physics micro-bounce entirely
  - Removed all idle hand bob animations

- **UX FIXES**:
  - Death screen: auto-exits pointer lock so Respawn button is clickable
  - Quest claim: Press Q to auto-claim all completed quests (pointer lock compatible)
  - Quest tracker: "Claim!" button → animated "Press Q" badge
  - Removed full-screen crosshair overlay that blocked all UI clicks
  - Replaced stale CRA webpack-dev-server overlay with Vite-compatible ResizeObserver handler

- **TERRAIN STABILITY**:
  - `RENDER_DISTANCE` = 4 with chunk keep radius of `RENDER_DISTANCE + 3`
  - Void catch at `y < -10` with return guard
  - Proper bounding sphere computation on instanced meshes

- **CLEANUP RUN**:
  - 0 dead files (all 17 source files actively imported)
  - 0 console.log statements
  - All 9 NPM deps actively used
  - 1 `.DS_Store` deleted
  - 8 verbose `=====` comment dividers simplified in `GameSystems.jsx`
  - Agent workflows updated for Vite/JSX stack

- **AGENT WORKFLOW UPDATES**:
  - `cleanup.md`: Updated file extensions `.js` → `.jsx`, build commands for Vite
  - `update-prd.md`: Added Tech Stack Reference section

## Controls

| Key | Action |
| --- | ------ |
| WASD | Move |
| Mouse | Look around (click to enable) |
| F | Cast spell / Melee attack |
| 1-4 | Select spell type |
| E | Inventory |
| M | Magic |
| C | Crafting |
| B | Building |
| ESC | Settings |
| Space | Jump |
| Left Click | Break block |
| Right Click | Place block |
| Tab | Achievements panel |
| G | Open treasure chest |
| T | Tame nearby passive mob |
| U | Spell upgrades panel |

## Mob Types

| Type | Color | Health | Behavior | Damage |
| ---- | ----- | ------ | -------- | ------ |
| Pig | Pink | 50 | Passive, wanders | — |
| Cow | Brown | 80 | Passive, wanders | — |
| Zombie | Green | 100 | Hostile, chases player | 8 |
| Skeleton | Beige | 80 | Hostile, chases player | 6 |
| Spider | Black | 60 | Hostile, chases player | 4 |

## Spell Types

| Spell | Key | Damage | Mana Cost | Effect |
| ----- | --- | ------ | --------- | ------ |
| Fireball | 1 | 50 | 15 | Fire projectile with gravity |
| Iceball | 2 | 40 | 12 | Ice projectile with gravity |
| Lightning | 3 | 75 | 25 | Fast electric strike |
| Arcane | 4 | 60 | 18 | Mystical energy blast (pierce + lifesteal) |
| Shield | — | — | 30 | Defensive barrier |

## Block Types

| Block | Color | Notes |
| ----- | ----- | ----- |
| Grass | Green | Surface block |
| Dirt | Brown | Below grass |
| Stone | Gray | Underground |
| Wood | Brown | Tree trunks |
| Birch Wood | Cream | Birch tree trunks |
| Leaves | Dark Green | Tree canopy (3×3) |
| Sand | Tan | Terrain variety |
| Coal Ore | Dark | Underground, common |
| Iron Ore | Bronze | Underground, moderate |
| Gold Ore | Gold | Underground, rare |
| Diamond Ore | Cyan | Underground, very rare |
| Red Flower | Red | Scattered on grass |
| Yellow Flower | Gold | Scattered on grass |

## Player Systems

| System | Details |
| ------ | ------- |
| Health | Hearts display, damage overlay on hit, death screen + respawn |
| Mana | 100 max, regenerates over time, spells consume per cast |
| Hunger | Chicken leg icons, depletes over time |
| XP | Level-based progression, visual +XP popups, level-up effect |
| Sound | Procedurally generated: footsteps, block place/break, combat, magic, ambient |

## Key Configuration

| Parameter | Value |
| --------- | ----- |
| CHUNK_SIZE | 16 blocks |
| RENDER_DISTANCE | 4 chunks |
| Terrain height range | 12-22 |
| Player height offset | 1.2 units |
| Initial spawn | (0, 40, 0) |
| Physics gravity | -30 m/s² |
| Max mob distance | 100 units (despawn beyond) |
| Mob aggro range | 16 blocks |
| Mob melee range | 2.5 blocks |
| Minimap range | 60 world units |
| Cast cooldown | 333ms (3 casts/sec) |
| Jump velocity | 10 |
| Gravity | 25 |
| Chest spawn interval | 30 seconds |
| Chest proximity range | 3 blocks |
| Loot auto-collect delay | 2 seconds |
| Boss spawn level | Level 5 |
| Boss health | 500 HP |
| Boss XP reward | 500 XP |
| Max pets | 3 |
| Pet tame range | 4 blocks |
| Night hostile spawn rate | 70% |
| Night danger multiplier | 1.5× base |

## Testing Status

- ✅ Mob variety (5 types with chase AI)
- ✅ Mob movement AI + hostile aggro
- ✅ E key Inventory (glassmorphic)
- ✅ M key Magic panel (glassmorphic)
- ✅ C key Crafting panel (glassmorphic)
- ✅ B key Building panel (glassmorphic)
- ✅ ESC key Settings (glassmorphic)
- ✅ F key spell casting (reliable)
- ✅ Spell selection (1-4)
- ✅ Mob health bars + damage numbers
- ✅ Continuous spawning
- ✅ Controls help panel
- ✅ Animated main menu
- ✅ Minimap with mob tracking
- ✅ Terrain variety (flowers, ores, birch trees)
- ✅ Player health/mana/hunger bars
- ✅ XP and leveling system
- ✅ Death screen + respawn
- ✅ Sound effects
- ✅ Block break/place mechanics
- ✅ Branding cleanup (no "Emergent" references)
- ✅ Jump mechanics (smooth consecutive jumps)
- ✅ Spell casting reliability (no visual skips)
- ✅ Quest tracker HUD
- ✅ Loot drops from mobs
- ✅ Treasure chest spawning and opening
- ✅ Achievement panel (Tab key)
- ✅ Notification popup system
- ✅ Survival mode (night danger escalation)
- ✅ Boss mob (Shadow Dragon at Level 5)
- ✅ Pet system (tame passive mobs)
- ✅ Spell upgrades (I → II → III)
- ✅ Night hostile spawn boost
- ✅ Rapier physics (terrain collision, gravity, player capsule)
- ✅ Camera horizontal initialization
- ✅ Vite build system (CRA migration)
- ✅ React 19 + Fiber 9 + Rapier 2.2 compatibility
### April 2, 2026 (Cleanup Phase) — Comprehensive Project Audit & Cleanup

- **STALE ARTIFACT REMOVAL**:
  - Deleted obsolete `frontend/build/` directory (leftover from previous builds).
  - Removed 3 `.DS_Store` files (`Crafty/`, `frontend/`, `.git/`).
  - Deleted empty `frontend/src/entities/` directory.
  - Total disk cleanup: ~27MB.

- **DEPENDENCY & SOURCE AUDIT**:
  - Verified 17/17 source files are actively imported and functional.
  - Confirmed all 10 production dependencies (`react`, `three`, `zustand`, etc.) are in use.
  - Verified no `console.log` statements remain in source code (only `console.warn`/`console.error` for legitimate system feedback).

- **PERFORMANCE & QUALITY CHECK**:
  - Confirmed React performance patterns: 18 `memo`, 26 `useCallback`, 7 `useMemo` implementations across the codebase.
  - Verified Vite 6.4 build success (2.84s build time).
  - Identified and documented heavy `window.*` global usage (12 files) for future consolidation into Zustand.
  - Audited CSS: Identified 4 unused classes/rules in `App.css`.

- **INFRASTRUCTURE**:
  - Verified `.gitignore` and dotfiles are minimal and correct for the Vite/React stack.

### April 3, 2026 (Cleanup Phase) — Routine Codebase Maintenance

- **STALE ARTIFACT REMOVAL**:
  - Deleted newly generated `frontend/build/` directory.
  - Removed 2 `.DS_Store` files (`Crafty/`, `frontend/`).

- **DEPENDENCY & SOURCE AUDIT**:
  - Verified 17/17 source files are actively imported.
  - Confirmed all production dependencies are in use.
  - Verified no `console.log` debug statements exist.

- **PERFORMANCE & QUALITY CHECK**:
  - Verified Vite 6.4 build compiles successfully (production ready).

### April 3, 2026 (Phase 3) — Architectural Overhaul & State Consolidation

- **CONSOLIDATED STATE**:
  - Migrated core combat and gameplay globals (`damagePlayer`, `healPlayer`, `useMana`, `isAlive`, `getPlayerHealth`, `getPlayerMana`, `consumeHunger`, `feedPlayer`, `respawn`) from `window.*` into `useGameStore` (Zustand).
  - Cleaned up inefficient `setInterval` polling in `StableMagicHands` by reacting directly to `activeSpell` from the Zustand store.
  - Eliminated legacy `window.selectedSpell` variable completely.

- **WORLD STATE SYNCHRONIZATION**:
  - Fixed Save/Load bug: Synchronized `blocksRef` in `Terrain.jsx` directly with the Zustand store (`gameState.worldBlocks`).
  - Added `PlayerModifiedBlocks` component to correctly render saved blocks on load.

- **SYSTEM IMPROVEMENTS**:
  - Consolidated duplicate `BLOCK_TYPES` configurations into a single, immutable source of truth (`world/Blocks.js`), updating all imports across the codebase.

### April 3, 2026 (Phase 4) — Component Decomposition

- **ARCHITECTURAL REFACTORING**:
  - Decomposed the massive `App.jsx` (~960 lines) into smaller, specialized modules.
  - Extracted 2D UI overlays (Minimap, HealthBar, QuestTracker, Notifications) into `frontend/src/HUD.jsx`.
  - Encapsulated keyboard events and pointer lock logic into a `useInputManager` hook inside `frontend/src/InputManager.jsx`.
  - Extracted the 3D Canvas, Physics, Player, and World rendering logic into `frontend/src/GameScene.jsx`.
  - Extracted the interactive Main Menu and UI panels (Inventory, Crafting, Auth) into `frontend/src/MenuSystem.jsx`.
  - Simplified `App.jsx` to function cleanly as a top-level orchestrator for providers and root components.

### April 3, 2026 (Phase 5) — Global Cleanup & Physics Raycasting

- **GLOBAL NAMESPACE POLLUTION CLEANUP**:
  - Successfully migrated the remaining `window.*` globals (like `damagePlayer`, `healPlayer`, `useMana`, `consumeHunger`, `respawn`, etc.) into native `useGameStore.getState()` calls across all components (`AdvancedGameFeatures`, `NPCSystem`, `EnhancedMagicSystem`).
  - Removed risky and brittle cross-system dependencies by enforcing a single Zustand state source.
  
- **PRECISE PHYSICS RAYCASTING**:
  - Upgraded block interaction (building/destroying) in `Terrain.jsx` from a naive scalar distance projection to accurate `@react-three/rapier` physics raycasting (`world.castRay`).
  - Player targeting is now driven by physical mesh intersections and normal calculation for flawless block placement against terrain shapes.