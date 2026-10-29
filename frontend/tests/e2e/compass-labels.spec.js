import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// NO TWO COMPASS LABELS OVERPRINT (STATUS G-ledger 38/b; MASTERPIECE seen: the compass labels overprint each other,
// HOME over NPC). Real-GPU frames showed HOME and a Hearth NPC's labels printed one over the other when the player stood
// out from the Hearth looking back at it. This poses exactly that: the player is stood on the line from HOME (the world
// origin) through Mara the Smith, 22 m beyond her, and turned to face HOME, so both markers sit within a few degrees of
// each other on the strip. Then it reads every label the strip shows and asserts no two boxes intersect, with both pips
// on the strip (the posed precondition, read first: two markers far apart would pass trivially).
//
// The layout under test is ui/compassLayout.js (unit-tested in src/ui/compassLayout.test.js); this is its seam with the
// running game: the real marker builder over the live ECS, the measured label widths, the strip's own width.
// NOT RUN LOCALLY (no local e2e): its browser mutant, the old layout with no yield, is argued from the unit test's
// two-marker case, which goes red under that mutant.

test('HOME and Mara a few degrees apart: both pips shown, no two labels overlap', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-testid="compass-track"]')),
    { timeout: 30000, message: 'SETUP: no compass strip on screen — the HUD is not mounted' }).toBe(true);

  // Mara spawns with the hub NPCs once the spawn chunk is in (SpawnerSystem's 500 ms check).
  let mara = null;
  await expect.poll(async () => {
    mara = await page.evaluate(() => window.__craftyTest.call('readMobs').find((m) => m.role === 'smith') || null);
    return !!mara;
  }, { timeout: 30000, message: 'SETUP: Mara never spawned at the Hearth' }).toBe(true);

  const stood = await page.evaluate(({ x, z }) => {
    const d = Math.hypot(x, z) || 1;
    const px = x + (x / d) * 22, pz = z + (z / d) * 22;
    const s = window.useGameStore.getState();
    const rb = s.playerRigidBodyRef?.current;
    if (!rb) return { why: 'no player body' };
    const gy = s.getMobGroundLevel?.(px, pz);
    rb.setTranslation({ x: px, y: (Number.isFinite(gy) ? gy : 60) + 2, z: pz }, true);
    rb.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
    return { px, pz };
  }, mara);
  expect(stood.why, `SETUP: ${stood.why}`).toBeUndefined();
  await page.waitForTimeout(1500); // the body settles and the camera follows it
  await page.evaluate(() => {
    const cam = window.__threeCamera;
    cam.lookAt(0, cam.position.y, 0);
  });
  await page.waitForTimeout(800); // a few HUD ticks: texts written, widths measured, slots moved

  const strip = await page.evaluate(() => {
    const shown = (el) => getComputedStyle(el).visibility === 'visible';
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom }; };
    const labels = [...document.querySelectorAll('[data-compass-label]')].filter(shown)
      .map((el) => ({ id: el.getAttribute('data-compass-id'), kind: el.getAttribute('data-compass-label'), text: el.textContent, ...box(el) }));
    const pips = [...document.querySelectorAll('[data-compass-pip]')].filter(shown)
      .map((el) => ({ kind: el.getAttribute('data-compass-pip'), ...box(el) }));
    const pp = window.useGameStore.getState().playerPosition;
    return { labels, pips, player: pp ? [pp.x, pp.z] : null };
  });
  const home = strip.pips.find((p) => p.kind === 'home');
  const npc = strip.pips.find((p) => p.kind === 'npc');
  console.log(`compass-labels: ${strip.labels.length} labels shown ${JSON.stringify(strip.labels.map((l) => [l.text, Math.round(l.x), Math.round(l.right)]))}; pips ${JSON.stringify(strip.pips.map((p) => [p.kind, Math.round(p.x)]))}; player ${JSON.stringify(strip.player)}`);
  expect(home && npc, `SETUP: HOME and the NPC are not both on the strip: ${JSON.stringify(strip)}`).toBeTruthy();
  expect(Math.abs(home.x - npc.x), `SETUP: HOME and the NPC are not close on the strip: ${JSON.stringify({ home, npc })}`).toBeLessThan(12);
  expect(strip.labels.some((l) => l.kind === 'home'), 'HOME lost its label to a lower-priority marker').toBe(true);

  const overlaps = [];
  for (let i = 0; i < strip.labels.length; i++) {
    for (let j = i + 1; j < strip.labels.length; j++) {
      const [a, b] = [strip.labels[i], strip.labels[j]];
      if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) overlaps.push(`${a.text} x ${b.text}`);
    }
  }
  expect(overlaps, 'compass labels overprint each other').toEqual([]);
});
