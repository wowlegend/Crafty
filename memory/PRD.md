# Crafty - 3D Minecraft-Style Browser Game

## Project Overview
A 3D browser game built with React and Three.js, featuring Minecraft-style gameplay with block building, magic system, NPCs, and procedural terrain generation.

## Tech Stack
- **Frontend**: React, Three.js, @react-three/fiber, @react-three/drei
- **Styling**: Tailwind CSS, Framer Motion
- **State**: React hooks, Context API

## Core Features
- Procedural infinite terrain generation with chunks
- Block placement and destruction
- Magic system with 4 spell types (Fireball, Iceball, Lightning, Arcane)
- NPC/Mob system with 5 mob types, AI movement, health bars
- Day/night cycle
- Creative mode gameplay
- Save/Load functionality (requires backend auth)

## Architecture
```
/app/frontend/src/
├── App.js                    # Main app, game state, Canvas setup
├── Components.js             # Terrain, Player, UI panels, Magic hands
├── SimplifiedNPCSystem.js    # Mob spawning, AI, combat, damage numbers
├── EnhancedMagicSystem.js    # Spell projectiles and effects
├── OptimizedGrassSystem.js   # Grass rendering optimization
├── SimpleExperienceSystem.js # XP and leveling
├── SoundManager.js           # Audio management
├── AuthContext.js            # Authentication state
└── WorldManager.js           # World save/load
```

## What's Been Implemented

### January 4, 2026 (Session 2) - Major Features
- **MOB SYSTEM OVERHAUL**:
  - Added 5 mob types: Pig (pink), Cow (brown), Zombie (green), Skeleton (beige), Spider (black)
  - Mob wandering AI - mobs move randomly around the terrain
  - Health bars above all mobs
  - Floating damage numbers when attacking
  - Continuous mob spawning as player explores new chunks
  - Mobs despawn when too far from player

- **UI PANELS REBUILT**:
  - E - Inventory panel with block selection grid
  - M - Magic panel with all 4 spells and descriptions
  - C - Crafting panel with recipes
  - B - Building Tools panel
  - ESC - Settings panel with toggles and Resume button
  
- **SPELL SYSTEM FIXES**:
  - F key now casts visible spell projectiles
  - Number keys 1-4 change spell type (fixed closure bug)
  - Spell projectiles hit mobs and deal damage
  - Impact effects when spells hit terrain or mobs

- **MOUSE LOOK FIX** - Click anywhere in game to enable mouse look

### January 4, 2026 (Session 1)
- Fixed green screen camera bug
- Fixed initial view angle
- Verified terrain generation
- Verified F key spell damage

## Controls
| Key | Action |
|-----|--------|
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

## Mob Types
| Type | Color | Health | Behavior |
|------|-------|--------|----------|
| Pig | Pink | 50 | Passive |
| Cow | Brown | 80 | Passive |
| Zombie | Green | 100 | Hostile |
| Skeleton | Beige | 80 | Hostile |
| Spider | Black | 60 | Hostile |

## Spell Types
| Spell | Key | Damage | Effect |
|-------|-----|--------|--------|
| Fireball | 1 | 50 | Fire projectile with gravity |
| Iceball | 2 | 40 | Ice projectile with gravity |
| Lightning | 3 | 75 | Fast electric strike |
| Arcane | 4 | 60 | Mystical energy blast |

## Testing Status
- ✅ Mob variety (5 types)
- ✅ Mob movement AI
- ✅ E key Inventory
- ✅ M key Magic panel
- ✅ C key Crafting panel
- ✅ B key Building panel
- ✅ ESC key Settings
- ✅ F key spell casting
- ✅ Spell selection (1-4)
- ✅ Mob health bars
- ✅ Damage numbers
- ✅ Continuous spawning
- ✅ Controls help panel

## Key Configuration
- CHUNK_SIZE: 16 blocks
- RENDER_DISTANCE: 4 chunks
- Terrain height range: 12-22
- Player height offset: 1.6 units
- Initial spawn: (0, 30, 0)
- Max mob distance: 100 units (despawn beyond)
