import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';

// NO E2E EVER PLACED A BLOCK — in a voxel BUILDING game whose core loop is "build by day, survive by
// night". That gap is why the Building Tools panel could sit inert, advertised on four entry surfaces,
// without anything noticing: the verb it modifies was never exercised end to end.
//
// This spec drives the REAL placement verb through `GameMethods.terrainVerbs.place`, the same closure the
// mouse router calls, against a real booted world. It is the reachability proof for the multi-block
// footprint wiring — a unit test of `buildFootprint` proves the maths, and only this proves Terrain
// actually consults it.
test.describe('block placement', () => {
  test.setTimeout(180000);

  test('placing with a multi-block mode writes MORE than one block', async ({ page }) => {
    await bootDev(page);
    await startPlay(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.place && window.__threeCamera, null, { timeout: 60000 });

    const result = await page.evaluate(async () => {
      const store = window.useGameStore.getState();
      // Give the player material and pick a placeable block, so the per-cell debit is not the thing
      // under test here — running out of material is a separate, deliberate behaviour.
      store.setSelectedBlock('stone');
      store.addToInventory('stone', 200);

      // A SYNTHETIC HIT, not a raycast. `place(h)` only reads h.hitPoint and h.normal, and what is under
      // test here is whether it consults buildingMode — not whether the physics raycast finds a face.
      // Three earlier runs of this spec failed inside castBuildRay (window.GameMethods missing, then the
      // camera aimed at open air, then no collider hit at all), every one of them the TEST being wrong.
      // Constructing the hit removes that whole class of flake and tests exactly the thing the finding is
      // about. Vector3 comes from an existing instance, so no THREE import is needed in page context.
      // The cells are in the sky (y SKY_Y and up), where every cell is air: a placement fills only a cell the worker
      // holds empty (DECISIONS 2026-10-31 item 230), and `place` resolves once the worker has answered.
      const cam = window.__threeCamera;
      if (!cam) return { ok: false, why: 'no window.__threeCamera — cannot build a Vector3' };
      const V = cam.position.constructor;
      const SKY_Y = 200;
      const mkHit = (dx) => ({
        hitPoint: new V(Math.floor(cam.position.x) + 0.5 + dx, SKY_Y + 0.5, Math.floor(cam.position.z) + 0.5),
        normal: { x: 0, y: 1, z: 0 },
      });
      const hit = mkHit(0);

      const before = window.useGameStore.getState().worldBlocks.size;

      // SINGLE first: the control. If this does not place exactly one, the multi-block number below
      // means nothing.
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      await window.GameMethods.terrainVerbs.place(hit);
      const afterSingle = window.useGameStore.getState().worldBlocks.size;

      const hit2 = mkHit(8); // a fresh, well-separated cell so the two footprints cannot overlap
      window.useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
      await window.GameMethods.terrainVerbs.place(hit2);
      const afterCube = window.useGameStore.getState().worldBlocks.size;

      return { ok: true, singleDelta: afterSingle - before, cubeDelta: afterCube - afterSingle };
    });

    expect(result.ok, result.why || '').toBe(true);
    expect(result.singleDelta, 'single mode did not place exactly one block — the control failed').toBe(1);
    expect(
      result.cubeDelta,
      'cube mode placed the same as single — Terrain is not reading buildingMode, i.e. the panel is still inert'
    ).toBeGreaterThan(1);
  });

  test('the per-cell debit still governs — a multi-block place cannot go free', async ({ page }) => {
    // The economy guard. Placing was once free while mining granted +1, which gutted the economy
    // (placementEconomy.js, B3c); a multi-block mode must not reopen that door by debiting once and
    // placing many. Every placement is costed (DECISIONS 2026-10-28 W1-H item 4): there is no free mode.
    await bootDev(page);
    await startPlay(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.place && window.__threeCamera, null, { timeout: 60000 });

    const result = await page.evaluate(async () => {
      const cam = window.__threeCamera;
      if (!cam) return { ok: false, why: 'no window.__threeCamera — cannot build a Vector3' };
      const V = cam.position.constructor;
      // Well-separated cells: `placed` is measured as a worldBlocks size delta, so overlapping
      // footprints would silently under-count. In the sky, where every cell is air (the first test's note).
      const mkHit = (dx) => ({
        hitPoint: new V(Math.floor(cam.position.x) + 0.5 + dx, 200 + 0.5, Math.floor(cam.position.z) + 0.5),
        normal: { x: 0, y: 1, z: 0 },
      });
      const S = () => window.useGameStore.getState();
      const inv = () => (S().inventory?.blocks?.stone) || 0;
      const setStone = (n) => window.useGameStore.setState((s) => ({ inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: n } } }));

      S().setSelectedBlock('stone');
      window.useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });

      const run = async (dx) => {
        const invBefore = inv();
        const blocksBefore = S().worldBlocks.size;
        const answered = await window.GameMethods.terrainVerbs.place(mkHit(dx));
        return { spent: invBefore - inv(), placed: S().worldBlocks.size - blocksBefore, answered, left: inv() };
      };

      setStone(200);
      const full = await run(40);

      // The interesting case: material runs out PART-WAY through the footprint. The action must place
      // what it can afford, debit exactly that, and floor at zero — not refuse, and not go free.
      setStone(5);
      const partial = await run(80);

      return { ok: true, full, partial };
    });

    expect(result.ok, result.why || '').toBe(true);

    expect(result.full.placed, 'placed nothing despite full material — the harness, not the economy, failed').toBe(27);
    expect(result.full.answered, 'the place verb\'s answer is not the cells the store recorded').toBe(27);
    expect(result.full.spent, 'placed more blocks than it paid for — the free-placement exploit is back').toBe(27);

    expect(result.partial.placed, 'ran out of material and placed nothing — it should place what it can afford').toBe(5);
    expect(result.partial.spent, 'a partly-affordable footprint did not debit exactly what it placed').toBe(5);
    expect(result.partial.left, 'inventory did not floor at zero').toBe(0);
  });

  test('the Delete Tool\'s left click takes back the blocks the player placed, each paid as itself, and leaves the ground', async ({ page }) => {
    // The Delete Tool removes only the player's own blocks (DECISIONS 2026-10-31 item 271), through the same mine closure
    // the mouse router calls (`GameMethods.terrainVerbs.mine`) and the worker's batched edit: no unit gate reaches
    // Terrain.jsx's wiring of that closure. Synthetic hits, as above, in the sky where every cell is air.
    await bootDev(page);
    await startPlay(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.mine && window.GameMethods?.terrainVerbs?.place && window.__threeCamera, null, { timeout: 60000 });

    const result = await page.evaluate(async () => {
      const cam = window.__threeCamera;
      if (!cam) return { ok: false, why: 'no window.__threeCamera — cannot build a Vector3' };
      const V = cam.position.constructor;
      const S = () => window.useGameStore.getState();
      const verbs = window.GameMethods.terrainVerbs;
      const SKY_Y = 200;
      const x = Math.floor(cam.position.x) + 20, z = Math.floor(cam.position.z);
      const cube = [];
      for (let dx = -1; dx <= 1; dx++) for (let y = SKY_Y; y <= SKY_Y + 2; y++) for (let dz = -1; dz <= 1; dz++) cube.push(`${x + dx}_${y}_${z + dz}`);
      const placeHit = { hitPoint: new V(x + 0.5, SKY_Y, z + 0.5), normal: { x: 0, y: 1, z: 0 } };
      const mineHit = (y) => ({ hitPoint: new V(x + 0.5, y + 1, z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new V(0, -1, 0),
        targetedX: x, targetedY: y, targetedZ: z, targetCoords: `${x}_${y}_${z}` });

      S().setSelectedBlock('stone');
      window.useGameStore.setState((s) => ({ buildingMode: 'cube', buildSize: 3, inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 27 } } }));
      const placed = await verbs.place(placeHit);
      // The Delete Tool at size 3 on the cube's top face: its removal grows down through the 27.
      window.useGameStore.setState({ buildingMode: 'delete', buildSize: 3 });
      const taken = await verbs.mine(mineHit(SKY_Y + 2));
      const recordedAir = cube.filter((k) => S().worldBlocks.get(k) !== 0);
      const stoneBack = S().inventory.blocks.stone;
      // Generated ground deep under the same column: the tool leaves it.
      const ground = await verbs.mine(mineHit(10));
      const groundRecorded = S().worldBlocks.has(`${x}_10_${z}`);
      // The worker holds air where the cube was: the same cube places again, all of it.
      window.useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
      const again = await verbs.place(placeHit);
      return { ok: true, placed, taken, recordedAir, stoneBack, ground, groundRecorded, again };
    });

    expect(result.ok, result.why || '').toBe(true);
    expect(result.placed, 'SETUP: the cube was not placed through the place verb').toBe(27);
    expect(result.taken, 'the Delete Tool\'s left click did not take the 27 blocks the player placed').toBe(27);
    expect(result.recordedAir, 'a taken block is not recorded as air').toEqual([]);
    expect(result.stoneBack, 'the taken blocks were not paid back as themselves').toBe(27);
    expect({ ground: result.ground, recorded: result.groundRecorded }, 'the Delete Tool took generated ground').toEqual({ ground: 0, recorded: false });
    expect(result.again, 'the worker still holds a block where the Delete Tool took the cube').toBe(27);
  });
});
