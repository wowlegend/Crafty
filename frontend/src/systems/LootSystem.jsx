import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { isCaptureMode } from '../devtest/captureMode';
import { stepLootDrop, cutLootDrops } from '../game/xpOrbStepper';
import { getItemRarity } from '../data/items.js';
import { rarityBeam } from '../game/lootJuice.js';
import { lootDropsQuery } from './_npcShared';
import { worldDelta } from '../game/worldClock.js';
import { floorUnderPoint } from '../game/mobFloor.js';

// LootSystem -- loot-drop magnet/pull + collect side-effects (physics is the pure game/xpOrbStepper.js
// stepLootDrop). Extracted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.7); behavior
// unchanged. The shared lootDropsQuery comes from ./_npcShared (A1.5).
export const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, frameDelta) => {
    const delta = worldDelta(frameDelta); // loot hangs through a hitstop (R2.6)
    if (!camera) return;
    // Capture-determinism: SETTLE the loot to its declared resting state rather than stopping the loop.
    //
    // The early return froze each drop wherever its parabola had got to, and capture is entered after a
    // boot of run-dependent length -- so "hold their exact spawn position" was only true if the flag
    // flipped on the spawn frame. Any later and the frame recorded a mid-arc pose that varied with
    // machine load, which is the exact class this repo documents: a guard must RESET TO A DECLARED VALUE,
    // never early-return, because stopping an animation leaves it wherever it happened to be.
    if (isCaptureMode()) {
      for (const entity of lootDropsQuery.entities) {
        if (!entity || !entity.position) continue;
        if (entity.velocity && entity.velocity.set) entity.velocity.set(0, 0, 0); // no arc
        entity.magnetized = false;   // no camera pull
        if (Number.isFinite(entity.spawnY)) entity.position.y = entity.spawnY; // the declared rest height
      }
      return;
    }
    const store = useGameStore.getState();
    const playerPos = camera.position;
    const groundYAt = (x, z, y) => floorUnderPoint(store.getMobFloor, store.getMobGroundLevel, x, z, y);

    // The pool's bound: past it the drops out of reach are banked at once and any the player is standing in are collected in
    // hand (see the stepper's cutLootDrops).
    const cut = cutLootDrops(lootDropsQuery.entities, playerPos);
    let banked = 0, bankedXP = 0, bankedItem = null;
    for (const entity of [...lootDropsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js stepLootDrop (S3-M6, byte-equivalent;
      // magnet range 7 / base 40 / floor 3); the component keeps the loot collect side-effects.
      const step = (cut && cut.get(entity)) || stepLootDrop(entity, delta, {
        playerPos,
        groundYAt, // the floor of the air gap the drop is in, not the column top (R7.9)
      });
      if (step.collected) {
        if (store.addToInventory) store.addToInventory(entity.item, 1);
        if (step.expired) {
          // Banked where the player is not (its lifetime ran out, or it is far behind, or the bound cut it): the item and
          // the XP reach them, and the pop, the text and the chime, which belong to a pickup in their hands at a spot they
          // are looking at, do not. What a frame banks is told once, below.
          banked += 1;
          bankedItem = entity.item;
          if (entity.xp > 0) bankedXP += entity.xp;
        } else {
          if (entity.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(entity.xp, entity.item);
          if (entity.xp > 0 && GameMethods.spawnXPText) GameMethods.spawnXPText(entity.xp, entity.position);
          if (store.addNotification) store.addNotification(`Looted: ${entity.item}`, 'loot');
          playPickup();
          // M3c-T2: rarity-tinted pickup pop at the collect point (same color as the drop's beam).
          if (GameMethods.spawnLootPop) GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
        }
        ecs.remove(entity);
      }
    }
    if (banked > 0) {
      if (bankedXP > 0 && GameMethods.grantXP) GameMethods.grantXP(bankedXP, 'Looted');
      if (store.addNotification) store.addNotification(banked === 1 ? `Looted: ${bankedItem}` : `Looted: ${banked} items`, 'loot');
    }
  });

  return null;
};
