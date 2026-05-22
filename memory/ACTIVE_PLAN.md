# Active Plan: SOTA Combat Juice, Evolving Soundscapes & High-Fidelity Visuals

## Goal
Implement a premium, state-of-the-art interactive layer including:
1. Squash & tilt flinch animations for mobs on hit.
2. Flat circular impact shockwave ring propagation.
3. Spell-specific dynamic gradient color floating damage numbers.
4. Color-shifting indicator hands with dynamic glow and casting channel vibrations.
5. Day/night responsive environmental fog color and density shifts.
6. Warm, multi-voice procedural synth pad soundscape with evolving Lydian, Dorian, and augmented chord progressions.

## Active Tasks
1. [x] **Phase 1: Combat Juice & Impact VFX**
    - Add squash and tilt flinch animations to `MobModel` inside `SimplifiedNPCSystem.jsx` using `lastHit`.
    - Implement `ImpactShockwaves` ring expansion inside `SimplifiedNPCSystem.jsx`.
    - Upgrade `DamageNumber` canvas rendering in `SimplifiedNPCSystem.jsx` to support dynamic gradient colors/fonts based on spell type.
    - Update `damageMob` signature in `CombatSystem`/`SimplifiedNPCSystem.jsx` to accept `type`.
    - Update `EnhancedMagicSystem.jsx` (and other hit-registration files) to pass spell-specific hit types.
2. [x] **Phase 2: Hand Glow & Spell Casting Vibrations**
    - Modify `<StableMagicHands>` in `Components.jsx` to implement vibrant spell-specific color-shifting indicators.
    - Add hand vibration/channeling movement inside the hand updates.
3. [ ] **Phase 3: Dynamic Environmental Fog**
    - Modify `GameScene.jsx` to smoothly shift `<fog>` or `<fogExp2>` color and density bounds between day and night based on `gameState.isDay`.
4. [ ] **Phase 4: Procedural Synth Pad Soundscape**
    - Upgrade `playBackgroundMusic` inside `SoundManager.jsx` to synthesise warm, multi-voice FM synth pads.
    - Program Day chords (Lydian), Night chords (Dorian), and Boss chords (augmented/climbing).
    - Implement smooth parameters and transitions between moods.
5. [ ] **Verification & Validation**
    - Run production compiler `npm run build` inside `frontend/` directory.
    - Verify game builds cleanly with no dependency or type conflicts.
