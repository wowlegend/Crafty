# Roadmap & Future Enhancements

*(Validated via Swarm Code Review & Puppeteer Browser Verification - April 6, 2026)*

### Phase 8: The "Juice" & Game Feel (Visual Polish)
- [x] **Target Block Outlining**: Render a subtle 3D wireframe box around the block currently targeted by the Rapier raycast.
- [x] **Block Breaking Particles**: Spawn physics-enabled colored cube particles when a block is destroyed.
- [ ] **Player Animation**: Add a swinging hand/weapon model and subtle camera view-bobbing.
- [ ] **Lighting**: Enable Day/Night mapped directional shadows and subtle SSAO for a modern voxel look.

### Phase 9: Visceral Combat & ECS Enhancements
- [ ] **Hitstop & Camera Shake**: Add 50ms micro-freezes and violent camera shakes on heavy combat hits.
- [ ] **Advanced AI Behaviors**: Add skeletal projectile attacks (arrows) and spider leap attacks via Miniplex ECS systems.
- [ ] **Procedural Mob Animations**: Add leg swing animations based on horizontal velocity vectors in the ECS movement loop.

### Phase 10: The "Fun" Loop (Mechanics & Depth)
- [ ] **Deep Cave Systems**: Add 3D "Worm" or "Swiss Cheese" noise subtraction to the `terrain.worker.js` to generate cavern networks.
- [ ] **Biomes & Foliage Decorators**: Add 3D trees and scattered biome layers (Desert, Snow, Forest) in the terrain worker before meshing.
- [ ] **Crafting Logic**: Implement functional 3x3 crafting grid logic in the UI converting raw materials.
- [ ] **Hotbar Scrolling**: Bind Mouse Scroll Wheel events to cycle active hotbar slots.

### Phase 11: Audio Overhaul
- [ ] **Asset Replacement**: Migrate from basic Web Audio API oscillators to high-quality `.mp3`/`.ogg` spatial sound assets for footsteps, mining clinks, and combat impacts.
