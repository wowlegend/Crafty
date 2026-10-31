import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { stepXPOrb, oldestOverBound, BANKED, MAX_XP_ORBS } from '../game/xpOrbStepper';
import { xpOrbsQuery } from './_npcShared';
import { worldDelta } from '../game/worldClock.js';
import { floorUnderPoint } from '../game/mobFloor.js';

// XPOrbSystem -- XP-orb magnet/pull + collect side-effects (physics is the pure game/xpOrbStepper.js).
// Extracted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.6); behavior unchanged. The shared
// xpOrbsQuery comes from ./_npcShared (A1.5).
export const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, frameDelta) => {
    const delta = worldDelta(frameDelta); // orbs hang through a hitstop (R2.6)
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;
    const groundYAt = (x, z, y) => floorUnderPoint(store.getMobFloor, store.getMobGroundLevel, x, z, y);

    // The pool's bound: past MAX_XP_ORBS the oldest are banked at once (see the stepper's header).
    const cut = oldestOverBound(xpOrbsQuery.entities, MAX_XP_ORBS);
    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const step = cut && cut.has(entity) ? BANKED : stepXPOrb(entity, delta, {
        playerPos,
        groundYAt, // the floor of the air gap the drop is in, not the column top (R7.9)
      });
      if (step.collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        // An expired orb is banked where the player is not: no text at its spot and no pickup chime for a pickup that
        // was not made. The XP bar is the report.
        if (!step.expired) {
          if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
          playPickup();
        }
        ecs.remove(entity);
      }
    }
  });

  return null;
};
