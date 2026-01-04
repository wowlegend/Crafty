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
- Magic system with spell casting (Fireball, Iceball, Lightning, Arcane)
- NPC/Mob system with combat
- Day/night cycle
- Creative mode gameplay
- Save/Load functionality (requires backend auth)

## Architecture
```
/app/frontend/src/
├── App.js                    # Main app, game state, Canvas setup
├── Components.js             # Terrain, Player, UI, Magic hands
├── SimplifiedNPCSystem.js    # Mob spawning and combat
├── EnhancedMagicSystem.js    # Advanced magic effects
├── OptimizedGrassSystem.js   # Grass rendering optimization
├── SimpleExperienceSystem.js # XP and leveling
├── SoundManager.js           # Audio management
├── AuthContext.js            # Authentication state
└── WorldManager.js           # World save/load
```

## What's Been Implemented

### January 4, 2026
- **FIXED: Green Screen / Camera Bug** - Camera was spawning at y=18 inside terrain blocks. Now spawns at y=30 and falls to proper terrain surface.
- **FIXED: Initial View** - Added slight upward camera pitch so player sees sky and horizon on spawn.
- **VERIFIED: Terrain Generation** - Chunks generate correctly as player moves. RENDER_DISTANCE = 4 chunks.
- **VERIFIED: Mob Spawning** - Mobs spawn correctly on terrain surface using getMobGroundLevel + 1.
- **VERIFIED: F Key Spell Damage** - Pressing F casts spell and damages nearby mobs within 5 unit radius.
- **VERIFIED: Player Movement** - WASD movement works, player stays on terrain surface.

### Previous Sessions (Restored)
- Menu system with working Start button
- Instanced rendering for performance optimization
- Magic hand effects with wand
- Combat system (click and F key)
- Experience/Level system
- Health and hunger UI

## Known Issues (Remaining)
- P2: Codebase has unused/abandoned files (*.old, *_FIXED.js patterns may exist)
- P2: PointerLock security error in some preview environments (handled with try-catch)

## Future Enhancements (P3)
1. Sound effects and background music
2. Quest system
3. Better mob AI
4. More block types
5. Refactor Components.js into smaller modules

## Testing Status
- ✅ Camera spawning - PASS
- ✅ Terrain generation - PASS  
- ✅ Mob spawning - PASS
- ✅ F key spell damage - PASS
- ✅ WASD movement - PASS

## Key Configuration
- CHUNK_SIZE: 16 blocks
- RENDER_DISTANCE: 4 chunks
- Terrain height range: 12-22
- Player height offset: 1.6 units
- Initial spawn: (0, 30, 0) - falls to terrain
