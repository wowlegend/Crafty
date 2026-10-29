// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * A TREASURE CHEST THAT COMES OR GOES RE-RENDERS THE SUN'S SHADOW (render/shadowSchedule.js).
 *
 * The shadow map renders on demand: at once when the world's meshes change, otherwise when the sun steps, the frustum
 * centre moves or a dynamic caster (a mob, ally, pickup, the boss, the beast form, a held phantom block) is present.
 * A chest casts a shadow and is none of those, so with no mob loaded a chest that spawned cast nothing and one that left
 * kept its shadow until the next sun step. This mounts world/Terrain.jsx's chest renderer through R3F
 * (tests/gates/_r3f.jsx) and reads the world epoch the schedule compares as the store's chest list changes.
 * BLIND SPOT: that Atmosphere then sets needsUpdate is shadowDue's, gated in shadow-schedule-gates.
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
// drei's own build reaches a second copy of R3F, whose hooks see no Canvas; the ink outline draws nothing here anyway.
vi.mock('@react-three/drei', () => ({ Outlines: () => null }));
// world/Terrain.jsx starts its terrain worker at import, and jsdom has no Worker; nothing here talks to it.
vi.stubGlobal('Worker', class { postMessage() {} addEventListener() {} removeEventListener() {} terminate() {} });
const { mountR3F } = await import('./_r3f.jsx');
const { TreasureChestsRender } = await import('../../src/world/Terrain.jsx');
const { shadowWorldEpoch } = await import('../../src/render/shadowSchedule.js');
const { useGameStore } = await import('../../src/store/useGameStore');

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  useGameStore.setState({ treasureChestsList: [] });
});

describe('the chest renderer marks the shadow world changed', () => {
  it('when a chest spawns and when it is taken, and not on a frame where the list is the same', async () => {
    useGameStore.setState({ treasureChestsList: [] });
    r = await mountR3F(<TreasureChestsRender />);
    await r.step(1);
    const quiet = shadowWorldEpoch();
    await r.step(3);
    useGameStore.setState({ treasureChestsList: [...useGameStore.getState().treasureChestsList] });
    await r.step(1);
    expect(shadowWorldEpoch(), 'the same chests marked the world changed').toBe(quiet);

    useGameStore.setState({ treasureChestsList: [{ id: 'c1', position: [3, 51, 4] }] });
    await r.step(1);
    let chests = 0;
    r.three().scene.traverse((o) => { if (o.isMesh && o.castShadow) chests += 1; });
    expect(chests, 'SETUP: the chest did not mount as a shadow caster').toBe(1);
    const spawned = shadowWorldEpoch();
    expect(spawned, 'a chest spawned and the shadow was not asked to render').toBeGreaterThan(quiet);

    useGameStore.setState({ treasureChestsList: [] });
    await r.step(1);
    expect(shadowWorldEpoch(), 'a chest was taken and its shadow was left standing').toBeGreaterThan(spawned);
  });
});
