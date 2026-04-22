# Roadmap & Future Enhancements

*(Validated via Swarm Code Review & Puppeteer Browser Verification - April 19, 2026)*

### Phase 8: Flawless Execution (Zero-Stutter Architecture)
*Performance must be secured before adding heavy graphics or physics.*
- [x] **Strict Object Pooling (New)**: Complete elimination of `useFrame` memory allocations for spells and particles to stop Garbage Collection micro-stutters.
- [x] **Web Worker AI Pathfinding (New)**: Offload all 3D grid navigation and collision checks to the worker thread to unblock the main React thread.
- [x] **Shader Pre-Compilation (New)**: A beautiful, cinematic loading sequence that guarantees zero mid-game compilation hitches when looking at new materials.

### Phase 9: The "Juice" & Game Feel (Visual Polish & Visceral Impact)
*Making the core combat and movement loop addictive. Sequenced from player-camera outward to the world.*
- [x] **Target Block Outlining**: Render a subtle 3D wireframe box around the block currently targeted by the Rapier raycast.
- [x] **Block Breaking Particles**: Spawn physics-enabled colored cube particles when a block is destroyed.
- [x] **Player Animation**: Add a swinging hand/weapon model and subtle camera view-bobbing.
- [x] **Hotbar Scrolling**: Bind Mouse Scroll Wheel events to cycle active hotbar slots.
- [x] **Hitstop & Camera Shake**: Add 50ms micro-freezes and violent camera shakes on heavy combat hits.
- [x] **Dynamic FOV Momentum (New)**: FOV dilation linked to physical velocity vectors (falling, sprinting).
- [x] **Procedural Mob Animations**: Add leg swing animations based on horizontal velocity vectors in the ECS movement loop.
- [x] **Procedural IK Mob Animation (New)**: Upgrade the procedural leg swings to dynamically snap to varying voxel heights via Inverse Kinematics.

### Phase 10: High-Craft Graphics & Rendering (WebGPU/R3F 9.5 Standard)
*Layering visuals in exact rendering pipeline order (Light -> Materials -> Post).*
- [x] **Lighting**: Enable Day/Night mapped directional shadows and subtle SSAO for a modern voxel look.
- [x] **Dynamic Sky & CSM Shadows (New)**: Physically based scattering for sun/moon, paired with Cascaded Shadow Maps for razor-sharp, distant rendering.
- [x] **PBR Material Upgrade (New)**: Transition blocks from `meshLambertMaterial` to Physically Based Rendering (PBR) with roughness and metallic properties.
- [x] **Post-Processing Stack (New)**: Volumetric God Rays and Temporal Anti-Aliasing (TAA) for a flawless voxel aesthetic.

### Phase 11: Spatial Audio & Foley (Acoustic Realism)
*Completing the sensory immersion.*
- [x] **Asset Replacement**: Migrate from basic Web Audio API oscillators to high-quality `.mp3`/`.ogg` spatial sound assets for footsteps, mining clinks, and combat impacts. (Upgraded procedural generators + 3D Positional Audio).
- [x] **Dynamic Material Foley (New)**: Footsteps and impacts read the targeted voxel type (Stone vs. Grass vs. Wood) to trigger specific high-fidelity assets.
- [x] **Acoustic Reverb Zones (New)**: Deep Y-level coordinates trigger a subtle low-pass filter and reverb for cavernous atmospheres.

### Phase 12: Expanded Mechanics & Depth (Production-Ready)
*Executing the final structural depth features.*
- [x] **3x3 Crafting Logic**: Pattern-matching recipe engine (Stone Pickaxe, Sword, Torch).
- [x] **Advanced AI Behaviors**: Skeletal archery and spider leap attacks via worker-driven action state.
- [x] **Deep Cave Systems**: 3D Simplex "Swiss Cheese" noise subtraction and vertex-based Ambient Occlusion (AO).
- [x] **BiomeSystem & Foliage**: Temperature/Moisture-based biomes (Forest, Desert, Snow) with procedural trees and cacti.
- [x] **Collectable Blocks**: Breaking blocks now correctly adds them to the player's inventory based on their material ID.

### Technical Debt (Discovered during April 18, 2026 Audit)
- [x] **Monolithic Files**: Refactor massive >500 line files (`EnhancedMagicSystem.jsx`, `QuestSystem.jsx`, `AdvancedGameFeatures.jsx`) to improve maintainability and React rendering performance.
- [x] **Ruthless Codebase Cleanup**: Executed AST-based dead code removal via `knip` and applied `React.memo` optimizations to monolithic UI components.