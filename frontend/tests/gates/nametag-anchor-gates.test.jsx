// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import React from 'react';

// THE MOUNTED NAMETAG STANDS WHERE eliteLook.js SAYS (W3-A PR A round 2). tests/gates/elite-clearance-gates.test.js proves
// nametagY clears every hostile's silhouette, crest and banner; this proves render/Nametags.jsx PLACES the tag there: it
// mounts the real Nametags through R3F's own reconciler (tests/gates/_r3f.jsx), with drei's <Billboard> and <Text> as
// plain groups, puts mobs in the real ECS world beside the player, steps a frame, and reads each tag's position.
// A rank set after the tag first drew (a stage, a late spawn field) moves it on the next frame.
// BLIND SPOT: no pixels; whether the tag reads over a crest is judged on the lookbook's elite frames.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 2 tests, each RED, an identity mutant SURVIVED:
//   K11a the tag at a fixed 2.4 m again -> "every tag stands at nametagY"
//   K11b the height worked out once, never on a rank change -> "a rank set after"

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('@react-three/drei', async () => {
  const R = await import('react');
  return {
    Billboard: ({ children }) => R.createElement('group', null, children),
    Text: R.forwardRef(function Text(_props, ref) { return R.createElement('group', { ref }); }),
  };
});
const { mountR3F } = await import('./_r3f.jsx');
const { Nametags } = await import('../../src/render/Nametags.jsx');
const { ecs } = await import('../../src/ecs/world.js');
const { useGameStore } = await import('../../src/store/useGameStore');
const { mobEntity } = await import('../../src/game/mobTypes.js');
const { nametagY, NAMETAG_Y } = await import('../../src/night/eliteLook.js');

const added = [];
const addMob = (type, x, elite) => {
  const e = mobEntity(type, `${type}-${x}`, new THREE.Vector3(x, 10, 0));
  if (elite) e.elite = elite;
  added.push(ecs.add(e));
  return e;
};
afterEach(() => { for (const e of added.splice(0)) ecs.remove(e); });

/** The world position of the tag drawn for `entity`: the tag group that follows it (its x, its z). */
function tagOf(h, entity) {
  const hits = [];
  h.three().scene.traverse((o) => {
    if (o.type === 'Group' && o.visible && o.parent?.parent === h.three().scene && o.position.x === entity.position.x && o.position.z === entity.position.z) hits.push(o);
  });
  return hits;
}

describe('the mounted nametag stands at nametagY', () => {
  it('every tag stands at nametagY over its mob: a crest and a crown raise it, a low mob keeps 2.4 m', async () => {
    useGameStore.setState({ playerPosition: { x: 0, y: 10, z: -4 } });
    const mobs = [addMob('spider', -6), addMob('zombie', -3, 'ember'), addMob('zombie', 0, 'captain'), addMob('moss_brute', 3), addMob('emberhusk', 6, 'captain')];
    const h = await mountR3F(<Nametags />);
    await h.step(1);
    for (const e of mobs) {
      const tags = tagOf(h, e);
      expect(tags.length, `${e.type} ${e.elite ?? 'plain'}: one tag drawn over it`).toBe(1);
      expect(tags[0].position.y - e.position.y, `${e.type} ${e.elite ?? 'plain'}: the tag's height`).toBeCloseTo(nametagY(e), 6);
    }
    expect(nametagY(mobs[0]), 'the presence twin: the spider keeps 2.4 m').toBe(NAMETAG_Y);
    expect(nametagY(mobs[1]), 'the ember zombie\'s crest raises its tag').toBeGreaterThan(NAMETAG_Y);
    await h.unmount();
  });

  it('a rank set after the tag first drew moves the tag on the next frame', async () => {
    useGameStore.setState({ playerPosition: { x: 0, y: 10, z: -4 } });
    const e = addMob('zombie', 0);
    const h = await mountR3F(<Nametags />);
    await h.step(1);
    const plain = tagOf(h, e)[0].position.y - e.position.y;
    expect(plain, 'the plain zombie').toBeCloseTo(nametagY(e), 6);
    e.elite = 'ember';
    await h.step(1);
    const crested = tagOf(h, e)[0].position.y - e.position.y;
    expect(crested, 'the zombie, an ember elite now').toBeCloseTo(nametagY(e), 6);
    expect(crested, 'the crest raised the tag').toBeGreaterThan(plain);
    await h.unmount();
  });
});
