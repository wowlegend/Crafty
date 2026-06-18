// hud-probe.mjs — LIVE-LOOK at the W3 M-HUD.3 AbilityBar (bottom-center cooldown-sweep action bar).
// The bar is capture-suppressed (invisible to the diorama visual-regression suite) AND gated on an
// owned Aspect, so the only way to SEE it is to drive the real (non-capture) game, unlock an Aspect
// so the bar renders, fire a real dodge so a conic-gradient sweep wedge is live, and screenshot the
// HUD before the 0.8s dodge cooldown elapses. Saves PNGs to /tmp/crafty-hud/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4194, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-hud';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday for clarity
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000); // let terrain stream + player settle on the ground
  // Unlock the VOIDHAND grab Aspect so the bar renders (owned.length > 1: GRAB + the always-on DODGE).
  await page.evaluate(() => {
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ unlockedTalents: { ...s.unlockedTalents, voidhand_grasp: 1 } });
  });
  // acquire pointer lock (retry — headless flaky) so dodge fires (the SM gates on isLocked)
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  console.log('pointerLock:', locked);
  // The bottom-center AbilityBar band (full-frame is 1280x800; the bar sits at bottom-4 = ~y736-784,
  // centered ~x540-740 for 2 owned slots). Locate it live so the clip is exact, then fall back wide.
  const rect = await page.evaluate(() => {
    // find the bottom-center flex bar by its conic-sweep child container; else null
    const bars = [...document.querySelectorAll('div.absolute.bottom-4')].filter((d) => d.className.includes('left-1/2') && d.className.includes('flex'));
    const b = bars[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.width + 24, height: r.height + 24 };
  });
  const CLIP = rect || { x: 440, y: 700, width: 400, height: 100 };
  console.log('AbilityBar rect:', JSON.stringify(CLIP));
  // baseline (ready state — bar shows GRAB + DODGE, both un-cooled = no sweep wedge)
  await delay(400);
  await page.screenshot({ path: `${OUT}/ability-bar-ready.png`, clip: CLIP });
  console.log('shot ability-bar-ready (clipped, ready)');
  // fire a real dodge (ShiftLeft) -> dodge.lastDodgeTime = now -> the mirror reports remaining ~0.8s.
  // Screenshot a burst across the 0.8s cooldown so at least one frame catches a large sweep wedge.
  await page.keyboard.down('ShiftLeft'); await delay(30); await page.keyboard.up('ShiftLeft');
  const burst = [40, 90, 90, 150, 200];
  for (let i = 0; i < burst.length; i++) {
    await delay(burst[i]);
    const cd = await page.evaluate(() => window.useGameStore.getState().abilityCooldowns?.dodge);
    await page.screenshot({ path: `${OUT}/ability-bar-sweep-${i}.png`, clip: CLIP });
    console.log(`shot sweep-${i} dodge.remaining=${cd?.remaining?.toFixed(3)} ready=${cd?.ready}`);
  }
  // a canonical "the change" frame: the first burst frame is the largest wedge
  await page.screenshot({ path: `${OUT}/ability-bar.png`, clip: CLIP });
  // report the live mirror so I can correlate the pixels with the numbers
  const snap = await page.evaluate(() => {
    const cds = window.useGameStore.getState().abilityCooldowns || {};
    const t = window.useGameStore.getState().unlockedTalents || {};
    return { abilityCooldowns: cds, voidhand_grasp: t.voidhand_grasp, locked: !!document.pointerLockElement };
  });
  console.log('mirror:', JSON.stringify(snap));

  // --- M-HUD.6 LIVE-LOOK: billboarded nametags over live ECS mobs ---
  // Nametags are capture-suppressed (invisible to the diorama baselines) and LOD-culled, so the
  // only way to SEE them is to drive the real (non-capture) game, spawn a few mobs near the player,
  // and screenshot the world. Spawn a small cluster a few metres ahead so the tags sit in-range
  // (HOSTILE_RANGE 30m) and don't all overlap, then capture the full frame.
  try {
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const pp = s.playerPosition || { x: 0, y: 64, z: 0 };
      if (!s.spawnMob) { console.warn('spawnMob not on store'); return; }
      const types = ['zombie', 'skeleton', 'spider', 'villager', 'moss_brute'];
      types.forEach((t, i) => {
        // fan them out ~6m ahead (toward -Z, where the camera looks) so the billboards read distinct
        s.spawnMob(pp.x + (i - 2) * 2.5, pp.z - 6, t, pp.y);
      });
    });
    await delay(1200); // let the membership bridge mount the <Tag> children + a few useFrame ticks
    await page.screenshot({ path: `${OUT}/nametags.png` });
    const ntSnap = await page.evaluate(() => {
      // count live mob entities so the screenshot can be correlated with the tag count
      const reg = window.__craftyTest?.ecsMobCount ? window.__craftyTest.ecsMobCount() : null;
      return { mobCount: reg };
    });
    console.log('shot nametags.png mobSnap=', JSON.stringify(ntSnap));
  } catch (e) { console.error('NAMETAGS-PROBE step error:', e); }

  await browser.close(); done(0);
} catch (e) { console.error('HUD-PROBE ERROR:', e); done(1); }
