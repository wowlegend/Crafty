// S2-B1-M2: engine-side CPU cost of the boulder-bull capsule vs the base capsule. Drives the same
// Rapier WASM the app ships, with a dense static cluster around the player, timing N KCC sweeps +
// world steps per shape. Headless (no GPU) -> this is the PHYSICS-cost delta, not the GPU FPS (which
// is the real-device check). Run: node scripts/bench/bull-physics-bench.mjs
import RAPIER from '@dimforge/rapier3d-compat';
import { BASE_CAPSULE, BEAST_FORMS } from '../../src/game/beasts.js';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
// dense cluster: a 12x4x12 grid of static cuboids around the player (~576 colliders) + a floor
let clusterN = 0;
for (let x = -6; x < 6; x++) for (let y = 0; y < 4; y++) for (let z = -6; z < 6; z++) {
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x * 1.0, y * 0.8 + 0.5, z * 1.0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45), b);
  clusterN++;
}
const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2.5, 0));
const col = world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), rb);
const cc = world.createCharacterController(0.05);
cc.enableAutostep(1.05, 0.2, true);
cc.enableSnapToGround(0.5);

function bench(form, iters) {
  col.setShape(new RAPIER.Capsule(form.halfHeight, form.radius));
  // warm up
  for (let i = 0; i < 200; i++) { cc.computeColliderMovement(col, { x: 0.02, y: -0.05, z: 0.01 }); world.step(); }
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) { cc.computeColliderMovement(col, { x: 0.02, y: -0.05, z: 0.01 }); world.step(); }
  return performance.now() - t0;
}

const ITERS = 4000;
const base = bench(BASE_CAPSULE, ITERS);
const bull = bench(BEAST_FORMS.ice, ITERS);   // widest radius
const golem = bench(BEAST_FORMS.arcane, ITERS); // tallest/most massive
const fmt = (ms) => `${ms.toFixed(1)}ms (${(ms / ITERS * 1000).toFixed(1)}us/sweep)`;
console.log(`cluster=${clusterN} static colliders · ${ITERS} sweeps each`);
console.log(`  base  [${BASE_CAPSULE.halfHeight},${BASE_CAPSULE.radius}]  ${fmt(base)}`);
console.log(`  bull  [${BEAST_FORMS.ice.halfHeight},${BEAST_FORMS.ice.radius}]  ${fmt(bull)}   x${(bull/base).toFixed(2)} vs base`);
console.log(`  golem [${BEAST_FORMS.arcane.halfHeight},${BEAST_FORMS.arcane.radius}]  ${fmt(golem)}   x${(golem/base).toFixed(2)} vs base`);
