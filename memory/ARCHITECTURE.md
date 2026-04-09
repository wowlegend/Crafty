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
