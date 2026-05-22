# Crafty - 3D Minecraft-Style Browser Game

## Project Overview

A 3D browser game built with React and Three.js, featuring Minecraft-style gameplay with block building, magic system, NPCs, and procedural terrain generation.

## Tech Stack

- **Runtime**: React 19, Three.js 0.172
- **3D Engine**: @react-three/fiber 9.5, @react-three/drei 10.7
- **Post-Processing**: @react-three/postprocessing 2.16
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
    ├── utils/combat.js           # Decoupled math solvers for RPG combat (melee, spell, armor)
    ├── workers/ai.worker.js      # Web Worker for CPU-heavy AI pathfinding
    ├── world/Terrain.jsx         # Terrain generation + Rapier physics colliders
    ├── world/Blocks.js           # Block type definitions
    ├── ui/GamePanels.jsx         # Extracted UI panel components
    └── ui/DebugOverlay.jsx       # Premium glassmorphic diagnostics & developer console overlay
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
## RPG Overhaul Architecture (SOTA Systems)

### 1. 3D Voxel-Height Aware Pathfinding Worker
To maintain 60+ FPS gameplay, all CPU-heavy pathfinding calculations are offloaded to a dedicated Web Worker (`ai.worker.js`).
- **Dynamic Local Voxel Grids**: For every active, aggroed hostile, the main thread samples a 9x9 local terrain height grid via Rapier physics raycasts (`getMobGroundLevel`). This compact array is sent to the worker, avoiding the high cost of serializing global voxel maps.
- **Voxel A* Solver**: Inside the worker, a custom 3D A* search is executed over the 9x9 grid, calculating 8-way diagonal pathways, slope scaling (caps climbs at 1.25 blocks), and gap-jumping.
- **Pack Alert Aggro Linking**: Mobs within a 12-unit radius are linked; alerting one mob pulls nearby pack cohorts into the combat cycle synchronously.

### 2. Stateful 3-Phase Epic Boss Event (Shadow Dragon)
The Shadow Dragon boss event is designed to be highly immersive and visually spectacular while keeping main-thread overhead near zero.
- **Direct Mesh Ref Mutations**: The fireball projectiles, boss rotations, and expanding Lava Zone meshes are updated imperatively in the `useFrame` game loop using Three.js mutable references, completely bypassing React virtual DOM diffing.
- **State Machine Transitions**:
  - *Phase 1 (Flight Mode)*: Boss circles at Y=+13 units, launching home-targeted falling fireballs.
  - *Phase 2 (Grounded Rage)*: Boss lands, executing melee charges and Knockback Roars (applying physics impulses directly to the player capsule core).
  - *Phase 3 (Enraged Fire)*: Boss spawns Skeleton Cohorts, turns glowing red, and emits expanding damage-over-time Lava Zones with custom shader-like opacity fades.

### 3. Keyboard Pet Commands Interface
A dedicated pet command system (T key) allows the player to dynamically direct their tamed entities.
- **Follow Mode**: Pets circle the player orbitally, maintaining a close visual perimeter.
- **Stay Mode**: Pets anchor themselves to the current coordinates and guard the zone.
- **Attack Mode**: Pets sweep for active hostile entities (prioritizing the Shadow Dragon) and charge them to draw aggro and deal damage.

## AI Structural Laws

- **State Management**: When bridging React UI state with imperative 3D game loops (@react-three/fiber), prefer Zustand's `useStore.getState()` over globals or polling for fast, non-reactive reads. Absolutely NEVER store non-serializable functions (like `damageMob` or `grantXP`) in Zustand; use the dedicated `GameMethods.js` module.
- **Component Design**: Proactively decompose massive monolithic React orchestrator components into specialized layers (e.g., `GameScene`, `HUD`, `InputManager`) to prevent re-render cascading. Use `useShallow` when subscribing to Zustand stores in UI layers.
- **3D Interaction**: For accurate block placement in 3D environments, always use physics engine raycasting (e.g., Rapier's `world.castRay`) for precise intersections. Throttle these raycasts spatially and temporally to avoid 60Hz CPU spikes.
- **GPU Offloading**: When animating hundreds of similar objects (e.g., grass swaying), never compute matrix math in a CPU `useFrame`. Always use `InstancedMesh` combined with custom `onBeforeCompile` vertex shaders.
- **Physics Pooling**: Never mount and unmount `<RigidBody>` components dynamically during high-frequency events (like block breaking). Use `<InstancedRigidBodies>` and manipulate the transform matrices of a fixed pool of hidden bodies to simulate spawning.

## Interactive SOTA Overhaul (May 2026)

### 1. Visceral Combat Impact Engine
To achieve SOTA browser-game combat feel, a comprehensive impact pipeline is implemented in `SimplifiedNPCSystem.jsx`:
- **Directional Squash & Tilt**: Mob geometries dynamically squash on the Y axis (peak at 15%) and stretch on the XZ plane, coupled with a 0.2 radian directional tilt away from the incoming hit vector. The deformation decays using high-frequency spring-dampers (`Math.exp(-delta * 12)`).
- **Pooled Expanding Shockwaves**: Flat circular rings spawn on hit coordinates, scaling to 4.5 units and fading opacity over 300ms. Color-coded per damage type (orange: Fire, cyan: Lightning, gold: Arcane, white: Melee).
- **Canvas-Gradient Floating Damage**: floating billboard text sprites render high-contrast dynamic linear gradients matched to spell colors (e.g., yellow-red for Fireball, cyan-blue for Lightning).

### 2. Spell-Casting Hands & Aura Visuals
The player hands `<StableMagicHands>` in `Components.jsx` are upgraded with immersive visual feedback:
- **Channeling Vibrations**: Subtle high-frequency viewport vibrations (0.005 units at 65-95 Hz) are applied during casting to communicate raw power.
- **Dynamic Casting PointLights**: Real-time `<pointLight>` source lights up the left hand during attack frames, throwing colored light bounces onto the surroundings.
- **Pulse-Pulsed Aura**: Persistent aura pulses are driven at speed-factor 12 during casting and speed-factor 3 when idle.

### 3. Atmospheric Day/Night Fog
Dynamic atmospheric immersion in `GameScene.jsx`:
- **Responsive FogEXP2**: A dedicated `<EnvironmentalFog />` component smoothly lerps scene fog color (`#e0f7fa` $\leftrightarrow$ `#0a0a23`) and density (`0.007` $\leftrightarrow$ `0.025`) as the sun rises/sets.
- **Seamless Skybox Blending**: Copies the active fog color directly to `scene.background` on every frame, achieving perfect camera horizon blending.

### 4. 4-Voice Procedural FM Synth Pad
A premium, continuous soundscape synthesizer is built in `SoundManager.jsx`:
- **Hybrid Timber**: Employs sawtooth and triangle oscillators with warm low-pass filters.
- **Filter Sweeps**: Filter cutoff is swept continuously by a slow 0.08 Hz LFO.
- **Step-Scheduled Transitions**: Rotates chord progressions every 8 seconds with 3.5 seconds of portamento exponential glide. Dynamic chord libraries: Lydian progression (Day), mysterious Dorian progression (Night), and augmented chords (Boss).

## SOTA Visuals, Volumetric Weather & Cavern Acoustics (May 2026)

### 1. Interactive GPU Grass Displacement
To render high-fidelity, high-performance foliage, `OptimizedGrassSystem.jsx` utilizes an instanced mesh with vertex-level displacement:
- **Global Uniform Binding**: The player's 3D coordinates from the Zustand store are bound as a global uniform `playerPosition` into the shared grass material.
- **Quadratic Bending Shaders**: In the `onBeforeCompile` vertex shader, the distance from each instance to the player is calculated. Vertices are pushed away dynamically using a quadratic falloff equation, allowing grass to bend naturally as the player walks through it.

### 2. Bioluminescent Liquid Wave Shaders
Procedural fluid surface dynamics are compiled inside `Terrain.jsx`:
- **Shared Material Architecture**: All terrain chunks share a single custom standard material (`terrainMaterial`), reducing draw calls and context pressure.
- **Wave Displacement**: An `onBeforeCompile` hook filters water vertices (`color.b > 0.6 && color.r < 0.15`) in the vertex shader, displacing height dynamically using high-frequency procedural wave equations.
- **Night Bioluminescence**: In the fragment shader, a pulsating neon-blue glow is blended during Night cycles (`1.0 - timeOfDay`), driven by time-pulsed noise equations.

### 3. Volumetric Weather Systems & Night Fireflies
Immersive atmospheric weather is implemented via a `<WeatherSystem />` canvas component in `GameScene.jsx`:
- **Instanced Bounding Boxes**: Animates 500 stretched raindrop boxes and 300 snow quads in a 40m bounding box centered on the player.
- **Terrain Colliders**: Particles query `getMobGroundLevel` to snap, splatter, and reset upon hitting the ground, avoiding underground particle clipping.
- **Night Fireflies**: Spawns 40 glowing yellow-green firefly particles orbiting organically around the player at Night, fading out during the Day.

### 4. Cavern Acoustics & Depth-Based Reverb
Procedural Web Audio routing is added to `SpatialAudioController` (`GameScene.jsx`):
- **Delay-Feedback Graph**: Routes spatial sounds into a lowpass filter, delay node (240ms), feedback gain loop (35% decay), and a dedicated wet gain controller.
- **Depth-Based Modulation**: Continually monitors camera height. When the player descends underground (`y < 10`), the feedback wet gain scales up to produce a haunting cavern echo.

## SOTA 3D Greedy Voxel Mesher (May 2026)

To support state-of-the-art visuals, dense graphics, and flawless 60+ FPS performance, `terrain.worker.js` incorporates a highly optimized, high-fidelity **3D Greedy Voxel Meshing** compiler:
- **Background Web Worker Thread**: Offloads all heavy geometry calculations to a dedicated worker thread, keeping the main render thread free of GC pauses or CPU bottlenecks.
- **Slice-and-Sweep Strategy**: Sweeps each chunk along the X, Y, and Z axes. At each slice step, it evaluates visibility between adjacent blocks (culling solid-to-solid faces, while keeping solid-to-air, solid-to-water, and water-to-air faces).
- **Coplanar Quad Merging**: A 2D greedy sweep combines adjacent matching coplanar voxel faces into singular larger rectangular quads. A pre-allocated reusable mask buffer (`Uint16Array(4096)`) prevents GC stutters.
- **CCW Winding Maps**: Formulates accurate counter-clockwise (CCW) vertex coordinates and normal vectors for all 6 faces to preserve correct lighting computations.
- **Liquid Separability**: Keeps water blocks isolated from solid blocks during merging to preserve procedural fluid shader vertices and wave dynamics.
