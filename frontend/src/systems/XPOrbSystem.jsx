import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { stepXPOrb } from '../game/xpOrbStepper';
import { xpOrbsQuery } from './_npcShared';

// XPOrbSystem -- XP-orb magnet/pull + collect side-effects (physics is the pure game/xpOrbStepper.js).
// Extracted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.6); behavior unchanged. The shared
// xpOrbsQuery comes from ./_npcShared (A1.5).
export const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const collected = stepXPOrb(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
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
