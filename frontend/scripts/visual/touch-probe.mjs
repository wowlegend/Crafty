// touch-probe.mjs — VERIFY-BEFORE-ASSERT the iPad/iPhone touch controls on a real touch viewport, the
// FULL real-player path from the title screen. The headless visual harness uses a desktop PINNED camera
// and never exercises touch — the exact blind spot that hid the dead mouse-look. This emulates iPhone 13
// AND removes the Pointer-Lock API (iOS Safari has no pointer lock), then plays the game the way a real
// player does: tap "Start Adventure" → the world must become PLAYABLE (no lock to fall back on) → drive
// the LEFT (move) + RIGHT (look) zones with real touch and assert the player moves + camera rotates.
// Screenshots the touch HUD to /tmp/crafty-touch/ so I can LOOK at it. Exit 0 only if every check passes.
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer';
import { serveVite, probePort } from './_serve.mjs';
import { tapTestId as honestTap } from './_probe.mjs';

const PORT = probePort(import.meta.url);
const OUT = '/tmp/crafty-touch';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
const done = async (c) => { await shutdown(browser); process.exit(c); };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

try {
  await waitReady();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.emulate(KnownDevices['iPhone 13']);   // touch + mobile viewport + iOS UA → isTouchDevice() true
  // iOS Safari has NO Pointer Lock. Remove it so the probe can't accidentally pass via a desktop-only path.
  await page.evaluateOnNewDocument(() => {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch {}
    document.exitPointerLock = () => {};
  });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

  // 0) precondition — touch emulated + NO pointer lock (faithful iOS)
  const env = await page.evaluate(() => ({ mtp: navigator.maxTouchPoints, coarse: matchMedia('(any-pointer: coarse)').matches, noLock: !document.body.requestPointerLock, w: innerWidth, h: innerHeight }));
  check('touch emulated + pointer-lock removed (iOS-faithful)', (env.mtp > 0 || env.coarse) && env.noLock, JSON.stringify(env));
  await page.screenshot({ path: `${OUT}/touch-0-title.png` });

  // 1) REAL ENTRY — tap the title-screen "Start Adventure" button (the only cold-start path a player has).
  //    Grab the element HANDLE, not stale coords: the button mounts + animates in via framer-motion, so a
  //    fixed-coordinate tap can race the entrance animation (or a lazy overlay) and miss — handle.tap()
  //    re-resolves the live center at tap time. (This raciness caused a false "cold-start dead" alarm.)
  let startHandle = null;
  for (let i = 0; i < 24 && !startHandle; i++) {
    await delay(250);
    const h = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((el) => /start adventure/i.test(el.textContent || '')) || null);
    startHandle = h.asElement();
    if (!startHandle) await h.dispose();
  }
  check('title screen shows "Start Adventure"', !!startHandle, startHandle ? '' : 'no Start Adventure button found');

  // 2) THE BUG GATE — after tapping Start Adventure the game must become PLAYABLE on touch (active gate
  //    open). On touch there is no pointer-lock to set `active`, so menu→play must be bridged some other
  //    way. Playable = the in-game Action verb button (renders only when active) OR the Tap-to-Play overlay
  //    (explicit second-tap activation). Retry the entry tap so a single missed/animation-raced tap can't
  //    masquerade as a real cold-start failure (the gate must be deterministic to be trustworthy).
  let playable = false, tapToPlay = false;
  for (let attempt = 0; attempt < 3 && !playable; attempt++) {
    if (startHandle) { try { await startHandle.tap(); } catch {} }
    for (let i = 0; i < 12 && !playable; i++) {
      await delay(250);
      const st = await page.evaluate(() => ({
        action: !!document.querySelector('[data-testid="touch-action"]'),
        tap: !!document.querySelector('[data-testid="touch-tap-to-play"]'),
      }));
      tapToPlay = st.tap;
      if (st.tap) { // explicit Tap-to-Play activation gesture — tap it (the designed touch entry)
        const r = await page.evaluate(() => { const b = document.querySelector('[data-testid="touch-tap-to-play"]'); const x = b.getBoundingClientRect(); return { x: Math.round(x.x + x.width / 2), y: Math.round(x.y + x.height / 2) }; });
        await page.touchscreen.tap(r.x, r.y); await delay(300);
      }
      playable = st.action || await page.evaluate(() => !!document.querySelector('[data-testid="touch-action"]'));
    }
  }
  check('Start Adventure leads to a PLAYABLE touch game (menu→play bridged)', playable, playable ? (tapToPlay ? 'via Tap-to-Play overlay' : 'menu dismissed straight to play') : 'STUCK on title — touch cold-start is DEAD');
  await page.screenshot({ path: `${OUT}/touch-1-after-start.png` });

  if (!playable) { // can't test the surface if we can't even enter — report and bail
    console.log('\nTOUCH CHECKS FAILED (cold-start blocked) — screenshots in ' + OUT);
    done(2);
  }

  // Let the player spawn + the physics body initialize before driving movement: the diorama streams in,
  // and moving before the KCC/rigidbody exists throws Rapier `setTranslation` -> Δpos=0, a false move-fail.
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 12000 }).catch(() => {});
  await delay(3500);

  // 3) MOVE — LEFT-zone joystick drag = walk. Intent persists once set, so hold it while the player moves.
  //    Retry once so a single physics-not-ready tick can't masquerade as a dead joystick.
  const W = env.w, H = env.h;
  const snap = () => page.evaluate(() => {
    const s = window.useGameStore.getState();
    const p = s.playerPosition; const c = s.gameCamera; // gameCamera is the exact camera touch-look mutates
    return { pos: p ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2) } : null, yaw: c ? +c.rotation.y.toFixed(3) : null };
  });
  let moveDelta = 0;
  for (let attempt = 0; attempt < 2 && moveDelta <= 0.5; attempt++) {
    const before = await snap();
    await page.touchscreen.touchStart(W * 0.25, H * 0.62);
    await page.touchscreen.touchMove(W * 0.25, H * 0.40);
    await page.touchscreen.touchMove(W * 0.25, H * 0.38);
    await delay(1500);
    const moved = await snap();
    await page.touchscreen.touchEnd();
    moveDelta = before.pos && moved.pos ? Math.hypot(moved.pos.x - before.pos.x, moved.pos.z - before.pos.z) : 0;
    if (moveDelta <= 0.5) await delay(800);
  }
  check('LEFT-zone joystick moves the player', moveDelta > 0.5, `Δpos=${moveDelta.toFixed(2)}`);

  // 4) LOOK — RIGHT-zone drag rotates the camera (delta-based; a few moves accumulate yaw).
  const lookBefore = await snap();
  await page.touchscreen.touchStart(W * 0.72, H * 0.5);
  for (let i = 1; i <= 7; i++) { await page.touchscreen.touchMove(W * 0.72 + i * 16, H * 0.5); await delay(50); }
  await delay(150);
  const looked = await snap();
  await page.touchscreen.touchEnd();
  const yawDelta = lookBefore.yaw != null && looked.yaw != null ? Math.abs(looked.yaw - lookBefore.yaw) : 0;
  check('RIGHT-zone drag rotates the camera', yawDelta > 0.03, `Δyaw=${yawDelta.toFixed(3)}`);
  await page.screenshot({ path: `${OUT}/touch-2-playing.png` });

  // 5) VERB — the Action hit-area taps without throwing (performVerb smoke)
  let verbOk = false;
  const actionBtn = await page.$('[data-testid="touch-action"]');
  if (actionBtn) { try { await actionBtn.tap(); verbOk = true; } catch { verbOk = false; } }
  check('Action verb button taps without error', verbOk, '');

  // 6) X3 — does a tap on the HOTBAR reach its onClick, or does the full-screen touch layer swallow it?
  //    This claim sat UNCONFIRMED in STATUS §E-bis since 2026-07-13 because the first attempt to check it
  //    re-invented the harness and never got into the game. It is checked HERE, in the probe that already
  //    solves cold-start, exactly as that note advised. Verdict is behavioural — the store's selectedBlock
  //    either changes or it does not — so it cannot be satisfied by a code reading.
  const hb = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('[data-hotbar-block]')];
    return { count: slots.length, selected: window.useGameStore.getState().selectedBlock, blocks: slots.map((s) => s.dataset.hotbarBlock) };
  });
  const target = hb.blocks.find((b) => b !== hb.selected);
  let hotbarOk = false, hotbarDetail = 'hotbar not in DOM';
  if (hb.count && target) {
    const r = await page.evaluate((b) => { const el = document.querySelector(`[data-hotbar-block="${b}"]`); const q = el.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; }, target);
    await page.touchscreen.tap(r.x, r.y);
    await delay(500);
    const after = await page.evaluate(() => window.useGameStore.getState().selectedBlock);
    hotbarOk = after === target;
    hotbarDetail = `tapped "${target}" (was "${hb.selected}") -> selected "${after}"${hotbarOk ? '' : ' — TAP SWALLOWED by the full-screen touch layer'}`;
  }
  check('HOTBAR tap selects that block on touch (X3)', hotbarOk, hotbarDetail);
  await page.screenshot({ path: `${OUT}/touch-3-final.png` });

  // 7) X1 / X2a / X2b — the three touch features shipped 2026-08-03 that NO HUMAN AND NO PROBE had ever
  //    driven. They carry jsdom render gates, but jsdom proves markup, not that a thumb can reach a control
  //    in a real browser at 390x844 — and the loop spent nine iterations calling this probe "the only lived
  //    check X1/X2a/X2b have" when it did not check them at all. It does now.
  //
  //    The Aspect ring HIDES locked verbs (correct, and unit-gated), so with a fresh save there is no toggle
  //    to tap. Unlock all four first — this is setup, not the assertion.
  await page.evaluate(() => window.useGameStore.setState({
    unlockedTalents: { wildheart_roar: 1, voidhand_grasp: 1, soulbind_snare: 1, elemancer_imbue: 1 },
  }));
  await delay(400);

  // Tap by COORDINATES, not handle.tap(). These hit-targets are transparent (opacity:0) overlays and
  // puppeteer's clickablePoint() heuristic rejects them ("Node is either not clickable or not an Element"),
  // which is a property of the harness, not of the control — a real thumb lands on them fine. The hotbar
  // check above already uses this pattern for the same reason.
  // 2026-08-05: this used to check only that the element had non-zero SIZE, then tap its centre and return
  // true. Size is not reachability. It tapped an Aspect sector whose centre is the SPELL TOGGLE's box and
  // reported success, and two registry lines were written from that reading ("the ring does not close",
  // "touch-spells leaves the DOM") — neither true. The shared helper now verifies the tap point is actually
  // occupied by the named element and is on screen, and returns WHY when it is not. `lastTapWhy` carries
  // that reason into the check messages, because a probe that cannot say why a tap did not happen is how a
  // LAYOUT defect gets recorded as a BEHAVIOURAL one.
  let lastTapWhy = '';
  const tapTestId = async (id) => {
    const v = await honestTap(page, id);
    lastTapWhy = v.ok ? '' : v.why;
    if (!v.ok) console.log(`   [tap refused] ${v.why}`);
    return v.ok;
  };
  const countTestIdPrefix = (prefix) =>
    page.evaluate((p) => document.querySelectorAll(`[data-testid^="${p}"]`).length, prefix);

  // X1 — the ring must OPEN and offer one sector per unlocked Aspect.
  const ringToggled = await tapTestId('touch-aspects');
  const sectors = ringToggled ? await countTestIdPrefix('touch-aspect-') : 0;
  check('ASPECT RING opens and offers every unlocked verb (X1)', ringToggled && sectors === 4,
    ringToggled ? `${sectors} sector(s) rendered, expected 4` : 'no touch-aspects toggle in the DOM');

  // X2a — each open sector carries its own cooldown sweep. The arithmetic is unit-tested; what could only
  // be checked here is that the elements actually exist in a real render.
  const sweeps = await countTestIdPrefix('aspect-sweep-');
  check('COOLDOWN sweep renders per sector (X2a)', sweeps === 4, `${sweeps} sweep element(s), expected 4`);
  if (ringToggled) await page.screenshot({ path: `${OUT}/touch-4-aspect-ring-open.png` });

  // Every sector must be ON SCREEN. A ring laid out around a toggle near the right edge can place a sector
  // partly or wholly outside a 390px viewport, where no thumb can reach it — the control would look
  // present in the DOM and be unreachable in the hand.
  const offscreen = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-testid^="touch-aspect-"], [data-testid^="touch-spell-"]')) {
      const q = el.getBoundingClientRect();
      if (q.left < 0 || q.top < 0 || q.right > innerWidth || q.bottom > innerHeight) {
        out.push(`${el.dataset.testid}@${Math.round(q.left)},${Math.round(q.top)} ${Math.round(q.width)}x${Math.round(q.height)}`);
      }
    }
    return out;
  });
  check('every ring sector is reachable on a 390x844 screen', offscreen.length === 0,
    offscreen.length ? `OFF-SCREEN: ${offscreen.join(' | ')} (viewport 390x844)` : 'all sectors within the viewport');

  // Tapping a sector must CLOSE the ring, or it eats the next tap.
  let ringClosed = false, closeDetail = 'no sectors to tap';
  if (sectors > 0) {
    const first = await page.evaluate(() => document.querySelector('[data-testid^="touch-aspect-"]').dataset.testid);
    const tapped = await tapTestId(first);
    const still = await countTestIdPrefix('touch-aspect-');
    ringClosed = still === 0;
    // If the tap never landed, this says NOTHING about whether the ring closes — do not let an unreachable
    // control be reported as a broken behaviour. That conflation is exactly what happened on 2026-08-05.
    closeDetail = ringClosed ? `tapped ${first}`
      : tapped ? `tapped ${first} but ${still} sector(s) still open — it will eat the next tap`
        : `INCONCLUSIVE — the tap never reached ${first}, so ring-close was never exercised. ${lastTapWhy}`;
  }
  check('ASPECT RING closes after a selection (X1)', ringClosed, closeDetail);

  // X2b — the STRONGEST of the three: a spell tap must change the store, exactly like Digit1-4 does.
  const spellBefore = await page.evaluate(() => window.useGameStore.getState().activeSpell);
  const spellToggled = await tapTestId('touch-spells');
  const spellCount = spellToggled ? await countTestIdPrefix('touch-spell-') : 0;
  if (spellToggled) await page.screenshot({ path: `${OUT}/touch-5-spell-picker-open.png` });
  let spellOk = false;
  let spellDetail = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="touch-spells"]');
    if (!el) return 'no touch-spells element in the DOM at all';
    const q = el.getBoundingClientRect();
    return `touch-spells at ${Math.round(q.width)}x${Math.round(q.height)} @${Math.round(q.left)},${Math.round(q.top)} (viewport ${innerWidth}x${innerHeight})`;
  });
  // Carry the REFUSAL REASON into the verdict. Without it this reported "present but untappable", which
  // reads as a defect in the control when the real cause was another control sitting on top of it.
  if (!spellToggled && lastTapWhy) spellDetail = `${spellDetail} — ${lastTapWhy}`;
  if (spellCount > 0) {
    const targetSpell = await page.evaluate((was) => {
      const ids = [...document.querySelectorAll('[data-testid^="touch-spell-"]')].map((e) => e.dataset.testid.replace('touch-spell-', ''));
      return ids.find((i) => i !== was) ?? null;
    }, spellBefore);
    if (targetSpell) {
      await tapTestId(`touch-spell-${targetSpell}`);
      const after = await page.evaluate(() => window.useGameStore.getState().activeSpell);
      spellOk = after === targetSpell;
      spellDetail = `${spellCount} spell(s) offered; tapped "${targetSpell}" (was "${spellBefore}") -> active "${after}"`;
    }
  }
  check('SPELL PICKER tap changes the active spell (X2b)', spellOk, spellDetail);

  const allOk = results.every((r) => r.ok);
  console.log(`\n${allOk ? 'ALL TOUCH CHECKS PASS' : 'TOUCH CHECKS FAILED'} — screenshots in ${OUT}`);
  done(allOk ? 0 : 2);
} catch (e) { console.error('TOUCH-PROBE ERROR:', e); done(1); }
