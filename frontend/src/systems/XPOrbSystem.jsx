import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { stepXPOrb } from '../game/xpOrbStepper';
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

    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const collected = stepXPOrb(entity, delta, {
        playerPos,
        groundYAt, // the floor of the air gap the drop is in, not the column top (R7.9)
      }).collected;
      if (collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
        playPickup();
        ecs.remove(entity);
      }
    }
  });

  return null;
};
