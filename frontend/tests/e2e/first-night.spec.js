import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HEARTH_Y, HEARTH_FIRE } from '../../src/world/homeAnchor.js';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { EYE_HEIGHT_M } from '../../src/combat/swingOrigin.js';
import { TRANSFORM_CAM_SEC } from '../../src/game/transformCam.js';

// THE FIRST NIGHT, PLAYED (the W3-A task script's U0: docs/superpowers/plans/2026-11-01-w3a-first-night-tasks.md; the
// brief's acceptance 1; DECISIONS 2026-11-01 (W3-A PR C) item 482). Eight beats, each its own test of 120 s or less on
// the running game, each driving the verb it is about with real input (a key, a click) and reading a PRESENCE before it
// reads the beat, so a dead instrument fails as itself and never reads as the beat:
//
//   (a) kindle    a fresh profile's brazier is cold at Start; a real G within 3 m lights it
//   (b) horn      from 10 units before dusk: one horn, the compass wedge within 2 degrees of the siege's bearing, wave 1
//                 closing 10 m on the Hearth within 20 s
//   (c) beast     a real R on a full bar: the camera 3 m or more behind the body from 1.2 s to roarSec, back at the eye
//                 within 1 s of the form's end; playerPosition within 1 m of the body throughout
//   (d) regen     health flat to 4.0 s of calm, then 5 HP/s or more; a hit at 3 s restarts the clock
//   (e) captain   the Ashen Captain's kill (a real click) brings day within 6 s, the dawn reward once, the payoff in order,
//                 and no sky cut during the rush
//   (f) respawn   a death 40 m from a lantern rises within 3 m of it; with none, at the Hearth
//   (g) ward      a lantern, the player 40 m away: 200 natural spawn attempts put 0 hostiles within 16 m of it; mined,
//                 some appear
//   (h) lend      night 1, the roar unlocked, the bar at 40 when wave 3 is placed: it reads 100 and the line shows; on
//                 night 2, no lend
//
// RED FIRST, AND HOW EACH BEAT TURNS ON. Every beat waits for the units that build it (AWAITS below). A beat listed there
// is SKIPPED by default, so CI stays green while the feature is unbuilt, and is RUN with FIRST_NIGHT_AWAITING=1, where it
// must fail with exactly the red recorded for it: a "RED (x): ..." line matching its `reason`. A different failure (a
// SETUP or PRESENCE line, a timeout, a red for another reason) fails that run, and so does a beat that passes while still
// listed, so the record cannot drift from the code. The unit that lands a beat's feature deletes its AWAITS entry in the
// same commit, and from then the beat runs on every CI sha as a hard gate; a unit that moves a beat's red without turning
// it on (N5 before U3, say) rewrites its `reason` to the new red. The repo had no mechanism for a red-first instrument
// waiting on its feature (tests/e2e has only @local-only, which CI greps out for a different reason), so this one is new:
// DECISIONS item 482.
//
// THE CONTRACT THE NEXT PHASES BUILD TO, read here and nowhere else in this file, all from the DEV store
// (window.useGameStore) as the task script names them: `hearthLit` (U1, D2), `siege` with `bearings` (radians, the
// compass convention: 0 north, -Z, clockwise), `wave` (waves placed so far), `night` and `captainId` (U1, N4-N6a), `lanterns`
// (U1's index of placed lanterns, [{ x, y, z }]), `getVerbMods().roarSec`; the compass pip of kind `siege`
// (`[data-compass-pip="siege"]`, U3); the hotbar slot `[data-hotbar-block="lantern"]` (L2); the notification keys
// `notice.hearthLends` (R1) and the dawn payoff's `notice.dawn*` then a key naming the lantern (D3); the DEV hook
// `ambientAttempts(n, [x, z])` that drives the ambient spawner's own attempt n times and returns the hostiles it placed
// (N2-N3). A unit that builds one under another name changes the reader here, in the commit that lands it.
//
// NOT CHECKED HERE: the night as played (scripts/visual/first-night.mjs plays it in real time on a production build, and
// a reviewer judges its clip); WebKit and touch (beat (a)'s Talk tap and B1's touch-hold sector are the brief's by-hand
// acceptance 3); the horn's SOUND (the horn and the numbered siege notice fire on the same crossing, and this counts the
// notice; S1's sound log can replace it).

const OPT_IN = process.env.FIRST_NIGHT_AWAITING === '1';
const BEAT_BUDGET_MS = 120000;

/** Each beat still waiting for its feature: the units that turn it on, and the red it shows until then. */
const AWAITS = Object.freeze({
  a: { units: 'D2 (the cold Hearth and the kindle)', reason: /the brazier is lit at Start/ },
  b: { units: 'N5 and U3 (the siege marches; the wedge)', reason: /no siege at the crossing/ },
  c: { units: 'B1 (the held beast and the eye point)', reason: /the camera is back at the eye/ },
  d: { units: 'V2 (regeneration on calm)', reason: /no regeneration/ },
  e: { units: 'N6a and D3 (the captain, the dawn rush, the payoff)', reason: /no siege, so no captain/ },
  f: { units: 'L2 and N8 (the lantern; respawn at a light)', reason: /no lantern slot on the hotbar/ },
  g: { units: 'L2, L3 and N2 (the lantern; the ward)', reason: /no lantern slot on the hotbar/ },
  h: { units: 'R1 (the Hearth lends the roar)', reason: /no siege, so no wave 3/ },
});

const BRAZIER = [2.4, HEARTH_Y + 0.5, 2.4]; // Terrain.jsx HomeAnchorRender: the brazier group on the plinth
const BRAZIER_FIRE = [BRAZIER[0], BRAZIER[1] + HEARTH_FIRE.height, BRAZIER[2]];
const HEARTH = [0, 0]; // the Hearth's anchor on the ground plane (world/homeAnchor.js: the plinth at the origin)
// Where (f) and (g) stand to place the lantern: 20 m east of the Hearth, so the stand 40 m west of it is 20 m west of the
// Hearth and both lie inside the ground streamed around the spawn (a stand at 52 m east found none loaded).
const LANTERN_STAND = [20, 4];
const xz = (p) => (p.length === 3 ? [p[0], p[2]] : p);
/** Ground-plane distance between two points, each [x, z] or [x, y, z]. */
const flat = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);

/** The beat's own failure: the line AWAITS matches. */
function red(id, ok, why) {
  if (!ok) throw new Error(`RED (${id}): ${why}`);
}
/** The instrument's failure, never a beat's red: it can see what the beat needs. */
function presence(ok, why) {
  if (!ok) throw new Error(`PRESENCE: ${why}`);
}

/** One beat: skipped while it awaits its feature, unless opted in; then it must show exactly its recorded red. */
function beat(id, title, body) {
  test(`(${id}) ${title}`, async ({ page }, testInfo) => {
    const awaits = AWAITS[id];
    test.skip(Boolean(awaits) && !OPT_IN, awaits ? `awaits ${awaits.units}; FIRST_NIGHT_AWAITING=1 runs it red` : '');
    test.setTimeout(BEAT_BUDGET_MS);
    if (!awaits) {
      await body(page, testInfo);
      return;
    }
    let err = null;
    try {
      await body(page, testInfo);
    } catch (e) {
      err = e;
    }
    if (!err) throw new Error(`(${id}) is GREEN while AWAITS still lists it (${awaits.units}): delete its entry, so CI gates it`);
    const line = String(err.message || err).split('\n')[0];
    if (!line.startsWith(`RED (${id}): `) || !awaits.reason.test(line)) {
      throw new Error(`(${id}) failed, but not with its recorded red (${awaits.reason}): ${line}`, { cause: err });
    }
    testInfo.annotations.push({ type: 'red, as recorded', description: line });
    console.log(`[first-night] ${line} (awaits ${awaits.units})`);
  });
}

// --- in-page readers and drivers (page functions are serialised: each is self-contained) ---

/** Every notification the page adds, by key, in order (installed before boot). */
const installNoticeKeys = () => {
  window.__fnNotices = [];
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        for (const el of [n, ...n.querySelectorAll('[data-notification-key]')]) {
          const key = el.getAttribute?.('data-notification-key');
          if (key) window.__fnNotices.push({ key, at: performance.now() });
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
};

/** The brazier's point lights (within 0.6 m of its fire point) and the brightest one's intensity. */
const brazierLight = (fire) => {
  const out = { count: 0, intensity: null };
  const p = { x: 0, y: 0, z: 0 };
  window.__threeScene?.traverse((o) => {
    if (!o.isPointLight) return;
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    p.x = e[12]; p.y = e[13]; p.z = e[14];
    if (Math.hypot(p.x - fire[0], p.y - fire[1], p.z - fire[2]) > 0.6) return;
    out.count += 1;
    out.intensity = Math.max(out.intensity ?? 0, o.intensity);
  });
  return out;
};

/** The night as the store holds it (the contract above), with the vitals the beats read. */
const readNight = () => {
  const s = window.useGameStore.getState();
  const own = (k) => (s[k] === undefined ? null : JSON.parse(JSON.stringify(s[k])));
  return {
    gameTime: s.gameTime, isDay: s.isDay, nightCount: s.nightCount, ember: s.ember, health: s.playerHealth, maxHealth: s.maxHealth,
    alive: s.isAlive, lastRewardedNight: s.lastRewardedNight, siege: own('siege'), hearthLit: own('hearthLit'), lanterns: own('lanterns'),
  };
};

/** The body's translation, the camera's position, and the store's playerPosition. */
const readBody = () => {
  const s = window.useGameStore.getState();
  const t = s.playerRigidBodyRef?.current?.translation?.();
  const c = window.__threeCamera;
  const pp = s.playerPosition;
  return { body: t ? [t.x, t.y, t.z] : null, cam: c ? c.position.toArray() : null, pp: pp ? [pp.x, pp.y, pp.z] : null };
};

/** Remove every live hostile within `r` m of the camera, as a kill by an ally (no XP to the player). */
const clearHostiles = (r) => {
  const cam = window.__threeCamera;
  let n = 0;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (m.passive || !(m.health > 0) || Math.hypot(m.x - cam.position.x, m.z - cam.position.z) > r) continue;
    window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
    n += 1;
  }
  return n;
};

/** Stand the body at [x, z] on the ground there (the column's top), stopped, facing compass `heading` degrees. */
const standAt = ({ x, z, heading = 0, pitch = 0 }) => {
  const s = window.useGameStore.getState();
  const rb = s.playerRigidBodyRef?.current;
  const gy = s.getMobFloor?.(x, z, 120);
  if (!rb || !Number.isFinite(gy)) return { why: `SETUP: no body or no ground at ${x}, ${z}` };
  rb.setTranslation({ x, y: gy + 1.2, z }, true);
  rb.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
  const c = window.__threeCamera;
  c.rotation.order = 'YXZ';
  c.rotation.set((pitch * Math.PI) / 180, (-heading * Math.PI) / 180, 0);
  c.updateMatrixWorld();
  return { at: [x, gy, z] };
};

/** Drawn frames, `n` of them. */
const frames = (n) => new Promise((resolve) => {
  let left = n;
  const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

/** A clock crossing, the way play makes one: the store's own writer set `units` before the boundary, then the ticker. */
async function crossFrom(page, boundary, units) {
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), boundary - units);
}

async function enterPlay(page) {
  await page.addInitScript(installNoticeKeys);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.__threeScene
    && window.GameMethods?.damageMob && window.useGameStore.getState().playerRigidBodyRef?.current && window.useGameStore.getState().getMobFloor,
  null, { timeout: 60000 }).catch((e) => { throw new Error(`SETUP: the body, the camera or the mob hooks never came up: ${e.message}`); });
}

/** Into night 1 by a real crossing, from 5 units before dusk; returns the night as it reads just after. */
async function intoNightOne(page) {
  const start = await page.evaluate(readNight);
  presence(start.isDay === true && start.nightCount === 0, `a returning profile's world does not start in day 0: ${JSON.stringify(start)}`);
  await crossFrom(page, HALF_CYCLE_UNITS, 5);
  await page.waitForFunction(() => window.useGameStore.getState().isDay === false, null, { timeout: 15000 })
    .catch(() => { throw new Error('PRESENCE: the clock never crossed into night from 5 units before dusk: is it running?'); });
  const night = await page.evaluate(readNight);
  presence(night.nightCount === 1, `the crossing did not count night 1: ${JSON.stringify(night)}`);
  return night;
}

/** From inside night 1, on to just after wave 3's place in the night (380 units in, Move C), and wait for it. */
async function toWaveThree(page) {
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), HALF_CYCLE_UNITS + 375);
  await page.waitForFunction(() => (window.useGameStore.getState().siege?.wave ?? 0) >= 3, null, { timeout: 15000 }).catch(() => {});
  return page.evaluate(readNight);
}

// --- the beats ---

test.describe('a fresh profile', () => {
  test.use({ profile: 'fresh' });

  beat('a', 'kindle: no brazier light at Start, and a real G within 3 m lights it', async (page) => {
    await enterPlay(page);
    const lit = await page.evaluate(brazierLight, BRAZIER_FIRE);
    presence(lit.count === 1, `the brazier's light is not in the scene exactly once (${lit.count} point lights at its fire)`);
    red('a', lit.intensity === 0, `the brazier is lit at Start (intensity ${lit.intensity}): there is nothing to kindle`);
    // The kindle: 2 m from the brazier, facing it, the real G.
    const stood = await page.evaluate(standAt, { x: BRAZIER[0], z: BRAZIER[2] + 2, heading: 180 });
    expect(stood.why, stood.why).toBeUndefined();
    await page.evaluate(frames, 10);
    await page.keyboard.press('g');
    await expect.poll(async () => (await page.evaluate(brazierLight, BRAZIER_FIRE)).intensity, { timeout: 5000 })
      .toBeGreaterThan(0).catch(() => red('a', false, 'a real G 2 m from the cold brazier did not light it'));
    red('a', (await page.evaluate(readNight)).hearthLit === true, 'the brazier lit and the store does not say the Hearth is lit');
  });
});

beat('b', 'horn: one horn, the wedge on the bearing, wave 1 closing on the Hearth', async (page) => {
  await enterPlay(page);
  await page.evaluate(clearHostiles, 60);
  const mark = await page.evaluate(() => window.__fnNotices.length);
  const before = new Set(await page.evaluate(() => window.__craftyTest.call('readMobs').map((m) => m.id)));
  // 10 units before dusk, by the store's own clock writer (a set inside the day half crosses nothing), then the ticker.
  await crossFrom(page, HALF_CYCLE_UNITS, 10);
  await page.waitForFunction(() => window.useGameStore.getState().isDay === false, null, { timeout: 15000 })
    .catch(() => { throw new Error('PRESENCE: the clock never crossed into night from 10 units before dusk'); });
  await page.waitForTimeout(3000);
  const night = await page.evaluate(readNight);
  presence(night.nightCount === 1, `the crossing did not count night 1: ${JSON.stringify(night)}`);
  const horns = (await page.evaluate((m) => window.__fnNotices.slice(m).map((n) => n.key), mark)).filter((k) => /^notice\.siege/.test(k));
  red('b', horns.length === 1, `${horns.length} siege horns (numbered notices) at one crossing: ${JSON.stringify(horns)}`);
  red('b', night.siege && Array.isArray(night.siege.bearings) && night.siege.bearings.length > 0,
    `no siege at the crossing: the store holds ${JSON.stringify(night.siege)}`);
  // The wedge: face the bearing, then read the pip's place on the strip (Compass.jsx: the strip spans FOV = PI).
  const bearing = night.siege.bearings[0];
  await page.evaluate((h) => { const c = window.__threeCamera; c.rotation.order = 'YXZ'; c.rotation.set(0, -h, 0); c.updateMatrixWorld(); }, bearing);
  await page.evaluate(frames, 10);
  const wedge = await page.evaluate(() => {
    const track = document.querySelector('[data-testid="compass-track"]')?.getBoundingClientRect();
    const pip = document.querySelector('[data-compass-pip="siege"]');
    if (!track || !pip || getComputedStyle(pip).visibility === 'hidden') return null;
    const r = pip.getBoundingClientRect();
    return ((r.left + r.width / 2 - track.left) / track.width - 0.5) * 180; // degrees off the heading
  });
  red('b', wedge !== null && Math.abs(wedge) <= 2, `the compass wedge is ${wedge === null ? 'not drawn' : `${wedge.toFixed(1)} degrees`} off the siege's bearing`);
  // Wave 1: hostiles placed since the crossing, each one's distance to the Hearth now and 20 s on.
  const fresh = () => page.evaluate((seen) => window.__craftyTest.call('readMobs')
    .filter((m) => !m.passive && m.health > 0 && !seen.includes(m.id)).map((m) => ({ id: m.id, d: Math.hypot(m.x, m.z) })), [...before]);
  const first = await fresh();
  red('b', first.length > 0, 'wave 1 placed no hostile in the 3 s after the crossing');
  await page.waitForTimeout(20000);
  const later = new Map((await fresh()).map((m) => [m.id, m.d]));
  const closed = first.filter((m) => later.has(m.id) && m.d - later.get(m.id) >= 10);
  red('b', closed.length > 0, `no wave-1 hostile closed 10 m on the Hearth in 20 s: ${JSON.stringify(first.map((m) => [m.id, m.d.toFixed(1), later.get(m.id)?.toFixed(1)]))}`);
});

beat('c', 'beast: a real R on a full bar holds the camera behind the body for the form, and the eye point stays put', async (page) => {
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.evaluate(clearHostiles, 40);
  const roarSec = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ ember: 100, unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1 } });
    return s.getVerbMods().roarSec;
  });
  presence(Number.isFinite(roarSec) && roarSec > 2, `no roar length to hold the form for: ${roarSec}`);
  // A frame log: the camera, the body and the eye point, from before the press to after the form ends.
  await page.evaluate(() => {
    const log = window.__fnFrames = [];
    const step = () => {
      const s = window.useGameStore.getState();
      const t = s.playerRigidBodyRef?.current?.translation?.();
      const c = window.__threeCamera;
      const e = c.matrixWorld.elements;
      if (t) log.push({ at: performance.now(), form: !!s.beastFormActive, cam: c.position.toArray(), body: [t.x, t.y, t.z],
        fwd: [-e[8], -e[10]], pp: s.playerPosition ? [s.playerPosition.x, s.playerPosition.z] : null });
      if (!window.__fnFramesDone) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const pressAt = await page.evaluate(() => performance.now());
  await page.keyboard.down('r');
  await page.waitForFunction(() => window.useGameStore.getState().beastFormActive === true, null, { timeout: 30000 })
    .catch(() => { throw new Error('PRESENCE: R held on a full bar with the roar unlocked never committed the beast form'); });
  await page.keyboard.up('r');
  await page.waitForFunction(() => window.useGameStore.getState().beastFormActive === false, null, { timeout: (roarSec + 4) * 1000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => { window.__fnFramesDone = true; return window.__fnFrames; });
  const start = log.find((f) => f.form);
  const end = [...log].reverse().find((f) => f.form);
  presence(start && end, `the frame log never saw the form: ${log.length} frames`);
  const s = (f) => (f.at - start.at) / 1000;
  const behind = (f) => {
    const d = [f.cam[0] - f.body[0], f.cam[2] - f.body[2]];
    return { m: Math.hypot(d[0], d[1]), back: d[0] * f.fwd[0] + d[1] * f.fwd[1] < 0 };
  };
  // The reveal's pull-back, from the press (the charge may start it) to the end of its window: the log can see a camera behind.
  const reveal = log.filter((f) => f.at >= pressAt && s(f) < TRANSFORM_CAM_SEC).map((f) => behind(f).m);
  presence(reveal.length > 0 && Math.max(...reveal) >= 2, `the reveal never pulled the camera back 2 m (max ${Math.max(0, ...reveal).toFixed(2)} m): the log cannot see a camera behind`);
  const held = log.filter((f) => f.form && s(f) >= TRANSFORM_CAM_SEC + 0.05 && s(f) <= roarSec - 0.1);
  const lost = held.find((f) => { const b = behind(f); return !(b.m >= 3 && b.back); });
  red('c', held.length > 0 && !lost, lost
    ? `the camera is back at the eye at ${s(lost).toFixed(2)} s of a ${roarSec} s form (${behind(lost).m.toFixed(2)} m from the body)`
    : 'no frame inside the form after the reveal');
  const after = log.filter((f) => f.at > end.at && (f.at - end.at) / 1000 >= 1);
  const home = after[0] ? Math.hypot(after[0].cam[0] - after[0].body[0], after[0].cam[1] - (after[0].body[1] + EYE_HEIGHT_M), after[0].cam[2] - after[0].body[2]) : null;
  red('c', home !== null && home < 0.3, `1 s after the form ended the camera is ${home?.toFixed(2)} m from the eye`);
  const drift = log.filter((f) => f.form && f.pp).map((f) => flat(f.pp, [f.body[0], f.body[2]]));
  red('c', Math.max(...drift) <= 1, `playerPosition left the body by ${Math.max(...drift).toFixed(2)} m during the form`);
});

beat('d', 'regen: flat to 4 s of calm, then 5 HP/s or more; a hit at 3 s restarts the clock', async (page) => {
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.evaluate(clearHostiles, 40);
  // (d) presses no verb: its subject is the calm clock. The hits come through damagePlayer, the action every attack calls.
  const hit = (amount) => page.evaluate((a) => {
    const s = window.useGameStore.getState();
    const c = window.__threeCamera.position;
    s.damagePlayer(a, 'zombie', [c.x + 1, c.y, c.z]);
    return { at: performance.now(), health: window.useGameStore.getState().playerHealth };
  }, amount);
  await page.evaluate(() => window.useGameStore.setState({ playerHealth: 60 }));
  const sample = (ms) => page.evaluate(async (span) => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < span) {
      out.push({ at: performance.now(), health: window.useGameStore.getState().playerHealth });
      await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  }, ms);
  const first = await hit(10);
  presence(first.health === 50, `the hit did not land (health ${first.health} after 10 from 60): no clock to read`);
  const calm = await sample(7000);
  const at = (h) => (h.at - first.at) / 1000;
  const early = calm.filter((h) => at(h) < 3.9);
  red('d', early.every((h) => h.health === 50), `health moved before 4 s of calm: ${JSON.stringify(early.map((h) => [at(h).toFixed(1), h.health]))}`);
  const a = calm.find((h) => at(h) >= 4.1), b = [...calm].reverse()[0];
  const rate = a && b && at(b) > at(a) ? (b.health - a.health) / (at(b) - at(a)) : 0;
  red('d', rate >= 5, `no regeneration: ${rate.toFixed(1)} HP/s from 4.1 s to ${b ? at(b).toFixed(1) : '?'} s of calm (health ${a?.health} -> ${b?.health})`);
  // The restart: a fresh hit, then another 3 s later; nothing comes back until 4 s after the second.
  await page.evaluate(() => window.useGameStore.setState({ playerHealth: 60 }));
  const one = await hit(5);
  await page.waitForTimeout(3000);
  const two = await hit(5);
  const restart = await sample(3800);
  red('d', restart.every((h) => h.health === two.health), `a hit at 3 s did not restart the clock: ${JSON.stringify(restart.map((h) => [((h.at - one.at) / 1000).toFixed(1), h.health]))}`);
});

beat('e', 'captain: his kill by a real click brings day within 6 s, the reward once, the payoff in order, no sky cut', async (page) => {
  await enterPlay(page);
  await intoNightOne(page);
  const night = await toWaveThree(page);
  red('e', night.siege && night.siege.captainId != null, `no siege, so no captain at wave 3: the store holds ${JSON.stringify(night.siege)}`);
  const captain = await page.evaluate((id) => window.__craftyTest.call('readMobs').find((m) => m.id === id) ?? null, night.siege.captainId);
  presence(captain && captain.health > 0, `the captain ${night.siege.captainId} is not a live mob`);
  // Stand 2 m from him, facing him, at 1 HP, and kill him with a real left click; then watch the sky every frame.
  const stood = await page.evaluate(standAt, { x: captain.x, z: captain.z + 2, heading: 0, pitch: -10 });
  expect(stood.why, stood.why).toBeUndefined();
  await page.evaluate((id) => {
    const e = window.__craftyTest.call('readMobs').find((m) => m.id === id);
    if (e && e.health > 1) window.GameMethods.damageMob(id, e.health - 1, 'physical', 'ally'); // to 1 HP: the click kills
  }, captain.id);
  const mark = await page.evaluate(() => window.__fnNotices.length);
  await page.evaluate(() => {
    const log = window.__fnSky = [];
    const step = () => {
      const sky = window.__craftyTest.call('readSkyLight');
      log.push({ at: performance.now(), sunY: sky?.sunDirY ?? null, day: window.useGameStore.getState().isDay });
      if (!window.__fnSkyDone) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.mouse.move(640, 400);
  await page.mouse.click(640, 400);
  const killedAt = Date.now();
  await page.waitForFunction(() => window.useGameStore.getState().isDay === true, null, { timeout: 6000 })
    .catch(() => red('e', false, 'the captain\'s kill did not bring day within 6 s'));
  red('e', Date.now() - killedAt <= 6000, 'day came later than 6 s after the kill');
  await page.waitForTimeout(3000);
  const sky = await page.evaluate(() => { window.__fnSkyDone = true; return window.__fnSky; });
  // A cut is the sun's height jumping more than a sixth of its night-to-day swing in one frame (60 units at once is 18
  // degrees of the cycle; the followed rush moves about 1 unit a frame).
  const steps = sky.slice(1).map((f, i) => Math.abs((f.sunY ?? 0) - (sky[i].sunY ?? 0)));
  red('e', Math.max(0, ...steps) < 0.15, `the sky cut during the rush: the sun's height jumped ${Math.max(...steps).toFixed(3)} in one frame`);
  const after = await page.evaluate(readNight);
  red('e', after.lastRewardedNight === 1, `the dawn reward is not counted once for night 1 (lastRewardedNight ${after.lastRewardedNight})`);
  const keys = await page.evaluate((m) => window.__fnNotices.slice(m).map((n) => n.key), mark);
  const dawn = keys.findIndex((k) => /^notice\.dawn/.test(k));
  const lantern = keys.findIndex((k) => /lantern/i.test(k));
  red('e', keys.filter((k) => /^notice\.dawn/.test(k)).length === 1 && dawn >= 0 && lantern > dawn,
    `the payoff is not one dawn notice and then the lantern line: ${JSON.stringify(keys)}`);
});

beat('f', 'respawn: a death 40 m from a lantern rises within 3 m of it; with none, at the Hearth', async (page) => {
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  const placed = await placeLantern(page, 'f');
  const die = async (at) => {
    const stood = await page.evaluate(standAt, at);
    expect(stood.why, stood.why).toBeUndefined();
    await page.evaluate(frames, 20);
    await page.evaluate(() => window.useGameStore.getState().damagePlayer(99999, 'zombie'));
    await expect(page.getByTestId('death-respawn'), 'PRESENCE: a lethal hit showed no respawn button').toBeVisible({ timeout: 10000 });
    await page.getByTestId('death-respawn').click();
    await page.waitForFunction(() => window.useGameStore.getState().isAlive === true, null, { timeout: 10000 });
    await page.waitForTimeout(1500);
    return (await page.evaluate(readBody)).body;
  };
  const rose = await die({ x: placed.x - 40, z: placed.z });
  red('f', flat(rose, [placed.x, placed.z]) <= 3, `a death 40 m from the lantern rose ${flat(rose, [placed.x, placed.z]).toFixed(1)} m from it`);
  await mineLantern(page, placed);
  const home = await die({ x: placed.x - 40, z: placed.z });
  red('f', flat(home, HEARTH) <= 4, `with no lantern the player rose ${flat(home, HEARTH).toFixed(1)} m from the Hearth`);
});

beat('g', 'ward: 200 natural spawn attempts put no hostile within 16 m of a lantern; mined, some appear', async (page) => {
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0));
  const placed = await placeLantern(page, 'g');
  const stood = await page.evaluate(standAt, { x: placed.x - 40, z: placed.z });
  expect(stood.why, stood.why).toBeUndefined();
  const attempts = (n) => page.evaluate(({ k, at }) => {
    const hook = window.__craftyTest.call('ambientAttempts', k, at);
    return Array.isArray(hook) ? hook : null;
  }, { k: n, at: [placed.x, placed.z] });
  const warded = await attempts(200);
  presence(warded !== null, 'SETUP: no ambientAttempts hook to drive the ambient spawner (N2-N3 add it)');
  const near = (list) => list.filter((m) => Math.hypot(m.x - placed.x, m.z - placed.z) <= 16).length;
  red('g', near(warded) === 0, `${near(warded)} of ${warded.length} hostiles from 200 attempts stood within 16 m of the lantern`);
  await mineLantern(page, placed);
  const open = await attempts(200);
  red('g', near(open) > 0, `with the lantern mined, 200 attempts put no hostile within 16 m (${open.length} placed): the ward reads nothing`);
});

beat('h', 'lend: on night 1 a lit Hearth fills the bar to 100 as wave 3 is placed, with its line; on night 2 it does not', async (page) => {
  await enterPlay(page);
  await page.evaluate(() => {
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1 } });
  });
  await intoNightOne(page);
  await page.evaluate(() => window.useGameStore.setState({ ember: 40 }));
  const mark = await page.evaluate(() => window.__fnNotices.length);
  const one = await toWaveThree(page);
  red('h', one.siege && one.siege.wave >= 3, `no siege, so no wave 3 to lend at: the store holds ${JSON.stringify(one.siege)}`);
  red('h', one.ember === 100, `wave 3 of night 1 left the bar at ${one.ember}, not 100`);
  const lines = (await page.evaluate((m) => window.__fnNotices.slice(m).map((n) => n.key), mark)).filter((k) => k === 'notice.hearthLends');
  red('h', lines.length === 1, `the lend's line showed ${lines.length} times`);
  // Night 2: through dawn and the day by the clock's own crossings, the bar at 40 again at wave 3.
  await crossFrom(page, 2 * HALF_CYCLE_UNITS, 5);
  await page.waitForFunction(() => window.useGameStore.getState().isDay === true, null, { timeout: 15000 });
  await crossFrom(page, 3 * HALF_CYCLE_UNITS, 5);
  await page.waitForFunction(() => window.useGameStore.getState().nightCount === 2, null, { timeout: 15000 });
  await page.evaluate(() => window.useGameStore.setState({ ember: 40 }));
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), 3 * HALF_CYCLE_UNITS + 375);
  await page.waitForFunction(() => (window.useGameStore.getState().siege?.wave ?? 0) >= 3 && window.useGameStore.getState().siege?.night === 2, null, { timeout: 15000 });
  red('h', (await page.evaluate(readNight)).ember === 40, 'night 2 lent the roar too');
});

// --- the lantern, for (f) and (g): chosen on the hotbar by a real click, placed by a real right click ---

async function placeLantern(page, id) {
  presence((await page.locator('[data-hotbar-block]').count()) > 0, 'the hotbar shows no slot at all: no lantern slot could be read');
  const slot = page.locator('[data-hotbar-block="lantern"]');
  red(id, (await slot.count()) === 1, 'no lantern slot on the hotbar: block 16 is not in the game');
  await page.evaluate(() => window.useGameStore.getState().addToInventory('lantern', 1));
  await slot.click();
  const stood = await page.evaluate(standAt, { x: LANTERN_STAND[0], z: LANTERN_STAND[1], heading: 0, pitch: -50 });
  expect(stood.why, stood.why).toBeUndefined();
  await page.evaluate(frames, 20);
  await page.mouse.click(640, 400, { button: 'right' });
  await page.waitForFunction(() => (window.useGameStore.getState().lanterns?.length ?? 0) === 1, null, { timeout: 5000 })
    .catch(() => red(id, false, 'a real right click with the lantern selected placed none'));
  return (await page.evaluate(readNight)).lanterns[0];
}

async function mineLantern(page, at) {
  const stood = await page.evaluate(standAt, { x: at.x, z: at.z + 2, heading: 0, pitch: -40 });
  expect(stood.why, stood.why).toBeUndefined();
  await page.evaluate(frames, 20);
  await page.mouse.click(640, 400);
  await page.waitForFunction(() => (window.useGameStore.getState().lanterns?.length ?? 0) === 0, null, { timeout: 8000 })
    .catch(() => { throw new Error('PRESENCE: a real left click 2 m from the lantern did not mine it'); });
}
