# Active Plan: Camera Gimbal Lock & Boss Spell Hits Fix with Visual Polish

## Goal
Resolve two critical bugs (camera gimbal lock when looking straight up at sky boss, and magic spells passing through flying boss Shadow Dragon) and enhance visuals using high-fidelity `<EffectComposer>` bloom, vignette, noise, and improved emissive materials.

## Active Tasks
1. [x] Implement camera pitch limit and polar look limits in `GameScene.jsx` and `Components.jsx`.
    - [x] Set `minPolarAngle` and `maxPolarAngle` in `<PointerLockControls>` inside `GameScene.jsx`.
    - [x] Add pitch clamp rotation guard inside `Components.jsx`.
2. [x] Implement flying boss projectile collision sweep in `EnhancedMagicSystem.jsx`.
    - [x] Check if boss is active and fetch boss position.
    - [x] Perform distance threshold hit registration.
    - [x] Apply boss damage, spatial hit sound, and spawn particle explosion on success.
3. [x] Activate and optimize `<EffectComposer>` pipeline (`Bloom`, `Noise`, `Vignette`) in `GameScene.jsx`.
4. [x] Upgrade visual feedback and material properties of the Shadow Dragon Boss in `AdvancedGameFeatures.jsx`.
5. [x] Run automated tests (`npm run build`) to verify bundling.
6. [x] Checkpoint via Git.
