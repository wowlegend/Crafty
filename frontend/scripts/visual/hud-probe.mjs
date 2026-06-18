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

  // --- M-HUD.9 LIVE-LOOK: controls cheatsheet auto-fade + H-toggle + top-center declutter ---
  // CombatInstructions is DEMOTED from always-on to a store-`showControls` toggle: the HUD auto-shows it
  // on enter, then fades it after ~8s; H re-summons it. The fade timer is capture-SUPPRESSED so this is
  // only observable in the real (non-capture) game. We snapshot three states: (1) onboarding (sheet
  // visible), (2) faded (sheet gone), (3) re-summoned (sheet back). We also assert the top-center is no
  // longer a 3-band stack: the standalone "Spell: ..." band is removed (no element holds the "Spell:"
  // text). Run this BEFORE the mob-swarm steps below so the player is alive + the HUD is mounted (a dead
  // player unmounts the whole gameplay HUD). Saves PNGs to /tmp/crafty-hud/.
  // Detect the sheet by its unambiguous "Controls" header (the CombatInstructions Panel) rather than a
  // class chain that the Panel primitive may transform.
  const sheetVisible = () => page.evaluate(() =>
    [...document.querySelectorAll('div')].some((d) => d.textContent.trim() === 'Controls' && d.className.includes('uppercase')));
  const spellBandPresent = () => page.evaluate(() =>
    [...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Spell:'));
  try {
    // Force showControls true so we capture the onboarding state deterministically even if the 8s
    // onboarding window has already elapsed during the prior AbilityBar burst.
    await page.evaluate(() => window.useGameStore.getState().setShowControls(true));
    await delay(300);
    const onboarding = { showControls: await page.evaluate(() => window.useGameStore.getState().showControls), sheet: await sheetVisible(), spellBand: await spellBandPresent() };
    await page.screenshot({ path: `${OUT}/declutter.png` });
    console.log('shot declutter.png (controls visible) snap=', JSON.stringify(onboarding));

    // fade: drive the store flag false (the same end-state the 8s timer reaches) + LOOK the sheet is gone.
    await page.evaluate(() => window.useGameStore.getState().setShowControls(false));
    await delay(300);
    const faded = { showControls: await page.evaluate(() => window.useGameStore.getState().showControls), sheet: await sheetVisible() };
    await page.screenshot({ path: `${OUT}/declutter-faded.png` });
    console.log('shot declutter-faded.png (controls faded) snap=', JSON.stringify(faded));

    // H re-summons: press KeyH (the InputManager handler toggles showControls) + confirm the sheet returns.
    await page.keyboard.down('KeyH'); await delay(40); await page.keyboard.up('KeyH');
    await delay(300);
    const resummoned = { showControls: await page.evaluate(() => window.useGameStore.getState().showControls), sheet: await sheetVisible() };
    await page.screenshot({ path: `${OUT}/declutter-resummoned.png` });
    console.log('shot declutter-resummoned.png (H re-summoned) snap=', JSON.stringify(resummoned));
    // leave the HUD clean (sheet hidden) for the downstream swarm steps
    await page.evaluate(() => window.useGameStore.getState().setShowControls(false));
  } catch (e) { console.error('DECLUTTER-PROBE step error:', e); }

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

  // --- M-HUD.7 LIVE-LOOK: the TargetFrame unit nameplate (top-center) ---
  // The frame is capture-suppressed and gated on store.targetEntity, which Components.jsx writes off
  // the real aim-cone (camera.getWorldDirection + checkMobsInMeleeCone) ~6.7x/s. Headless pointer-lock
  // + camera aim is flaky, and there is no camera-yaw test hook, so we verify the VISIBLE deliverable
  // two ways: (1) a real-aim best-effort — ring mobs tight around the player so one likely lands in the
  // forward cone and the live mirror populates; (2) a deterministic render check — drive the store
  // mirror directly with a synthetic aimed mob, screenshot the nameplate, then clear it and confirm it
  // disappears. Both shots land in /tmp/crafty-hud/.
  try {
    // (1) real-aim best-effort: a tight ring so >=1 mob sits in the ~PI/8 forward cone within 24m.
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const pp = s.playerPosition || { x: 0, y: 64, z: 0 };
      if (s.spawnMob) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          s.spawnMob(pp.x + Math.cos(a) * 5, pp.z + Math.sin(a) * 5, 'zombie', pp.y);
        }
      }
    });
    await delay(900); // let the ~150ms throttled mirror fire a few times
    const liveAim = await page.evaluate(() => window.useGameStore.getState().targetEntity);
    console.log('M-HUD.7 live aim mirror:', JSON.stringify(liveAim));
    await page.screenshot({ path: `${OUT}/target-frame-live-aim.png` });

    // (2) deterministic render check: synthetic aimed mob -> the nameplate MUST render top-center.
    await page.evaluate(() => {
      window.useGameStore.getState().setTargetEntity({
        id: 9999, type: 'zombie', name: 'zombie', health: 14, maxHealth: 20, isAlly: false,
      });
    });
    await delay(250);
    const shown = await page.evaluate(() => !!window.useGameStore.getState().targetEntity);
    await page.screenshot({ path: `${OUT}/target-frame.png` });
    console.log(`shot target-frame.png targetEntity-present=${shown}`);

    // clear it -> the nameplate MUST disappear (return null).
    await page.evaluate(() => window.useGameStore.getState().setTargetEntity(null));
    await delay(250);
    const cleared = await page.evaluate(() => window.useGameStore.getState().targetEntity === null);
    await page.screenshot({ path: `${OUT}/target-frame-cleared.png` });
    console.log(`shot target-frame-cleared.png targetEntity-null=${cleared}`);
  } catch (e) { console.error('TARGET-FRAME-PROBE step error:', e); }

  // --- M-HUD.8 LIVE-LOOK: the RadialMinimap (circular, bottom-right) ---
  // Capture-suppressed (returns null + the canvas redraw never starts under isCaptureMode), so it is
  // invisible to the diorama baselines; the only way to SEE it is to drive the real game. By now the
  // prior steps have spawned a cluster of live mobs, so the minimap plots mob blips (red/green) inside
  // the rim plus the always-present HOME/SHRINE/BLIGHT destination blips clamped to the rim. We locate
  // the bottom-right minimap container live, let one 250ms canvas redraw land, then clip-screenshot it.
  try {
    await delay(600); // let >=2 canvas redraws (250ms interval) land so blips are painted
    // The radial minimap is a 132x132 2D canvas (the WebGL scene canvas is full-frame 1280x800),
    // so size is an unambiguous, render-state-robust handle even when the class-descendant query is
    // flaky mid-sequence. Query rect + state in ONE evaluate so they are consistent.
    const mmSnap = await page.evaluate(() => {
      const s = window.useGameStore.getState();
      const c = [...document.querySelectorAll('canvas')].find((x) => x.width === 132 && x.height === 132);
      const r = c ? c.getBoundingClientRect() : null;
      return {
        mobCount: (s.mobEntities || []).length, npcCount: (s.npcEntities || []).length, hasCanvas: !!c,
        clip: r ? { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 36 } : null,
      };
    });
    const MM_CLIP = mmSnap.clip || { x: 1116, y: 556, width: 152, height: 172 };
    console.log('RadialMinimap rect:', JSON.stringify(MM_CLIP));
    await page.screenshot({ path: `${OUT}/minimap.png`, clip: MM_CLIP });
    console.log('shot minimap.png mmSnap=', JSON.stringify(mmSnap));
  } catch (e) { console.error('RADIAL-MINIMAP-PROBE step error:', e); }

  // === W3 M-HUD.4: CombatLog corner ticker (bottom-left). Capture-suppressed -> drive the real game:
  // inject a few varied notifications via the store-wired addNotification (QuestSystem.jsx:374 sets it;
  // the same stream the corner toasts use) and screenshot the quiet bottom-left feed. Entries auto-
  // dismiss after a few seconds, so shoot right after adding.
  try {
    await page.evaluate(() => {
      const add = window.useGameStore.getState().addNotification;
      if (add) {
        add('Defeated dire-wolf', 'loot');
        add('Quest Complete: First Light', 'quest');
        add('+25 XP from quest reward', 'reward');
        add('A skeleton archer closes in', 'danger');
      }
    });
    await delay(400);
    await page.screenshot({ path: `${OUT}/combat-log.png` });
    console.log('shot combat-log.png');
  } catch (e) { console.error('COMBAT-LOG-PROBE step error:', e); }

  await browser.close(); done(0);
} catch (e) { console.error('HUD-PROBE ERROR:', e); done(1); }
