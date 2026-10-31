import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { stepXPOrb, cutXPOrbs } from '../game/xpOrbStepper';
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

    // The pool's bound: past it the orbs out of reach are banked at once and any the player is standing in are collected in
    // hand (see the stepper's cutXPOrbs).
    const cut = cutXPOrbs(xpOrbsQuery.entities, playerPos);
    let bankedXP = 0;
    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const step = (cut && cut.get(entity)) || stepXPOrb(entity, delta, {
        playerPos,
        groundYAt, // the floor of the air gap the drop is in, not the column top (R7.9)
      });
      if (step.collected) {
        if (step.expired) {
          // Banked where the player is not: no text at its spot and no pickup chime for a pickup that was not made. What a
          // frame banks is granted once and told once, so a return trip past a pile is one line, not one per orb.
          bankedXP += entity.amount;
        } else {
          if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
          if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
          playPickup();
        }
        ecs.remove(entity);
      }
    }
    if (bankedXP > 0) {
      if (GameMethods.grantXP) GameMethods.grantXP(bankedXP);
      if (store.addNotification) store.addNotification(`+${bankedXP} XP`, 'loot');
    }
  });

  return null;
};
