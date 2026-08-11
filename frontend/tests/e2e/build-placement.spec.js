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
      const cam = window.__threeCamera;
      if (!cam) return { ok: false, why: 'no window.__threeCamera — cannot build a Vector3' };
      const V = cam.position.constructor;
      const mkHit = (dx) => ({
        hitPoint: new V(Math.floor(cam.position.x) + 0.5 + dx, Math.floor(cam.position.y) - 4 + 0.5, Math.floor(cam.position.z) + 0.5),
        normal: { x: 0, y: 1, z: 0 },
      });
      const hit = mkHit(0);

      const before = window.useGameStore.getState().worldBlocks.size;

      // SINGLE first: the control. If this does not place exactly one, the multi-block number below
      // means nothing.
      window.useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      window.GameMethods.terrainVerbs.place(hit);
      const afterSingle = window.useGameStore.getState().worldBlocks.size;

      const hit2 = mkHit(8); // a fresh, well-separated cell so the two footprints cannot overlap
      window.useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
      window.GameMethods.terrainVerbs.place(hit2);
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
    // placing many. Both branches are asserted, because CREATIVE placement is free BY DESIGN and the
    // default mode is creative — an earlier draft of this spec read that deliberate asymmetry as the
    // exploit returning. Asserting only survival would leave the creative branch free to silently
    // acquire a cost; asserting only creative would let the survival debit silently vanish.
    await bootDev(page);
    await startPlay(page);
    await page.waitForFunction(() => window.GameMethods?.terrainVerbs?.place && window.__threeCamera, null, { timeout: 60000 });

    const result = await page.evaluate(async () => {
      const cam = window.__threeCamera;
      if (!cam) return { ok: false, why: 'no window.__threeCamera — cannot build a Vector3' };
      const V = cam.position.constructor;
      // Well-separated cells: `placed` is measured as a worldBlocks size delta, so overlapping
      // footprints would silently under-count.
      const mkHit = (dx) => ({
        hitPoint: new V(Math.floor(cam.position.x) + 0.5 + dx, Math.floor(cam.position.y) - 4 + 0.5, Math.floor(cam.position.z) + 0.5),
        normal: { x: 0, y: 1, z: 0 },
      });
      const S = () => window.useGameStore.getState();
      const inv = () => (S().inventory?.blocks?.stone) || 0;
      const setStone = (n) => window.useGameStore.setState((s) => ({ inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: n } } }));

      S().setSelectedBlock('stone');
      window.useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });

      const run = (dx) => {
        const invBefore = inv();
        const blocksBefore = S().worldBlocks.size;
        window.GameMethods.terrainVerbs.place(mkHit(dx));
        return { spent: invBefore - inv(), placed: S().worldBlocks.size - blocksBefore, left: inv() };
      };

      S().setGameMode('creative');
      setStone(200);
      const creative = run(0);

      S().setGameMode('survival');
      setStone(200);
      const survival = run(40);

      // The interesting case: material runs out PART-WAY through the footprint. The action must place
      // what it can afford, debit exactly that, and floor at zero — not refuse, and not go free.
      setStone(5);
      const partial = run(80);

      return { ok: true, creative, survival, partial };
    });

    expect(result.ok, result.why || '').toBe(true);

    expect(result.creative.placed, 'the creative control placed nothing — the harness, not the economy, failed').toBe(27);
    expect(result.creative.spent, 'creative placement started charging — the builder sandbox is no longer free').toBe(0);

    expect(result.survival.placed, 'survival placed nothing despite full material').toBe(27);
    expect(result.survival.spent, 'placed more blocks than it paid for — the free-placement exploit is back').toBe(27);

    expect(result.partial.placed, 'ran out of material and placed nothing — it should place what it can afford').toBe(5);
    expect(result.partial.spent, 'a partly-affordable footprint did not debit exactly what it placed').toBe(5);
    expect(result.partial.left, 'inventory did not floor at zero').toBe(0);
  });
});
