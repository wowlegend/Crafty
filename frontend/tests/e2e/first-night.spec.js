import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HEARTH_Y, HEARTH_FIRE } from '../../src/world/homeAnchor.js';
import { HALF_CYCLE_UNITS, CYCLE_UNITS } from '../../src/game/dayNight.js';
import { EYE_HEIGHT_M, SWING_APEX_OVER_BODY_M } from '../../src/combat/swingOrigin.js';
import { installNoticeLog, isHornKey } from '../../scripts/visual/_firstNight.mjs';
import { BEATS, AWAITS, compareReds, redLine, unitsOf } from './_firstNightAwaits.js';
import { respawnCases, caseHolds, roseRight, distances } from './_firstNightRespawn.js';
import { marches, READINGS } from './_firstNightMarch.js';
import { skySteps, firstCut, medianFrameSec } from './_firstNightSky.js';

// THE FIRST NIGHT, PLAYED (the W3-A task script's U0: docs/superpowers/plans/2026-11-01-w3a-first-night-tasks.md; the
// brief's acceptance 1; DECISIONS 2026-11-01 (W3-A PR C) items 482 and 485-492). Eight beats, each its own test of 120 s
// or less on the running game, each driving the verb it is about with real input (a key, a click) and reading a PRESENCE
// before it reads the beat, so a dead instrument fails as itself and never reads as the beat:
//
//   (a) kindle    a fresh profile's brazier is cold at Start; a real G within 3 m lights it
//   (b) horn      at the clock's crossing, one horn, and none on a load into night; the compass wedge within 2 degrees of
//                 the siege's bearing ahead and pinned to the strip's edge behind; wave 1 placed from that bearing, and
//                 marching on the Hearth (10 m closer in 20 s, closing at every 5 s step, and nearer it than the player,
//                 who stands 32 m off the line, where a hunter would turn to them)
//   (c) beast     a real R on a full bar: the camera 3 m or more behind the body from 1.2 s to roarSec, held to the end
//                 and back at the eye within 1 s of it; playerPosition within 1 m of the body throughout
//   (d) regen     health flat to 4.0 s of calm, then 5 HP/s or more; a hit at 3 s restarts the clock
//   (e) captain   the Ashen Captain's kill (a real click) brings day within 6 s, a dawn rush with no sky cut, the reward
//                 once, the payoff in order, and the bloom's swell
//   (f) respawn   a death 12 m from a lantern and 32 m from the Hearth rises within 3 m of the lantern; a death nearer the
//                 Hearth than the standing lantern rises at the Hearth (so a rule that prefers any lantern fails); with
//                 the lantern mined, a death beside its place rises at the Hearth
//   (g) ward      the Forge sells the lantern at its price; placed, the player 40 m away: 200 ambient attempts put none
//                 within 16 m of it and some at 16-30 m; mined, some within 16 m
//   (h) lend      night 1, the roar unlocked, the bar at 40 when wave 3 is placed: it reads 100 and the line shows once;
//                 on night 2, wave 3 comes and lends nothing
//
// RED FIRST, AND HOW EACH BEAT TURNS ON (tests/e2e/_firstNightAwaits.js holds the record). A beat listed in AWAITS is
// skipped in CI and run with FIRST_NIGHT_AWAITING=1. Then every check it makes is reached: a red is recorded and the beat
// goes on, past a missing feature on a STAND-IN where one leaves nothing to read (a bearing, two husks, a captain, a
// lantern's place, each named in the log; a stand-in only ever follows a red, so it can never make a beat green), and the
// run must show exactly the reds the record holds, one per check, each matching its reason. Anything else fails it: a
// SETUP or PRESENCE line, a timeout, a red the record does not hold, a recorded red that did not show, a beat that shows
// none. A beat with no entry runs on every CI sha as a hard gate and stops at its first red. The record names each red's
// unit, and tests/scripts/first-night-awaits.test.js (every unit run, so every CI sha) fails while a listed red belongs
// to a unit that has landed, so the unit that lands a feature rewrites or deletes its reds in the same commit. The repo
// had no mechanism for a red-first instrument waiting on its feature (tests/e2e has only @local-only, which CI greps out
// for a different reason): DECISIONS item 482.
//
// THE CONTRACT THE NEXT PHASES BUILD TO, read here and nowhere else in this file, all from the DEV store
// (window.useGameStore) as the task script names them: `hearthLit` (U1, D2), `siege` with `bearings` (radians, the
// compass convention: 0 north, -Z, clockwise), `wave` (waves placed so far), `night` and `captainId` (U1, N4-N6a),
// `lanterns` (U1's index of placed lanterns, [{ x, y, z }]), `getVerbMods().roarSec`, `bloomSpikeUntil` (D3's swell: the
// store's own bloom window, 300 ms or more past the kill); the compass pip of kind `siege` (`[data-compass-pip="siege"]`,
// U3), whose centre sits within 12 px of the strip's edge when the bearing is behind; the hotbar slot
// `[data-hotbar-block="lantern"]` (L2); the Forge offer `goods:lantern`, bought through the store's `buyForgeOffer` that
// the Forge's Buy button calls (L3; forge.spec.js drives the card itself by real clicks); the notification keys
// `notice.siege.*` (the horn), `notice.hearthLends` (R1) and the dawn payoff's `notice.dawn*` then a key naming the
// lantern (D3), counted once per notice by the stack's `data-notification-id`; and the DEV hook `ambientAttempts(n)`
// (N2-N3), which runs the ambient spawner's own attempt n times from the player's live position, places nothing (so the
// mob cap and the 3-per-second budget are not spent), and returns one entry per attempt: the [x, z] it would place a
// hostile at, or null where the attempt places none. A unit that builds one under another name changes the reader here,
// in the commit that lands it.
//
// NOT CHECKED HERE: the night as played (scripts/visual/first-night.mjs plays it in real time on a production build, and
// a reviewer judges its clip); WebKit and touch (beat (a)'s Talk tap and B1's touch-hold sector are the brief's by-hand
// acceptance 3); the horn's SOUND (the horn and the numbered siege notice fire on the same crossing, and this counts the
// notice; S1's sound log can replace it); the Respawn button's own pointer-lock request, which a headless page refuses,
// so the gate is held again after it the way startPlayActive holds it (each beat's subject is where the player rises).

const OPT_IN = process.env.FIRST_NIGHT_AWAITING === '1';
const BEAT_BUDGET_MS = 120000;
const REVEAL_SEC = 1.2; // the task script's B1 window: the held view from 1.2 s, fixed here so B1's rewrite cannot move it
const SECTOR_DEG = 30; // a wave placed "from one bearing": within this of it, 20 m or more out
const STAND_OFF_M = 32; // where (b) stands, square to the bearing: past every aggro range (game/mobArchetypes.js, 28 at most)
const ATTEMPTS = 200;
const RUSH_UNITS_PER_SEC = 60; // the task script's N6a: the dawn rush steps the clock 60 units a 1 s tick

const BRAZIER = [2.4, HEARTH_Y + 0.5, 2.4]; // Terrain.jsx HomeAnchorRender: the brazier group on the plinth
const BRAZIER_FIRE = [BRAZIER[0], BRAZIER[1] + HEARTH_FIRE.height, BRAZIER[2]];
// Where (f) and (g) stand to place the lantern, inside the ground streamed around the spawn (two chunks at the suite's low
// tier; a stand at 52 m east found none loaded). The placement lands about 1.5 m north of it; that place is the stand-in.
const LANTERN_STAND = [20, 4];
const LANTERN_STAND_IN = Object.freeze({ x: 20, y: null, z: 2.5 });
const xz = (p) => (Array.isArray(p) ? (p.length === 3 ? [p[0], p[2]] : p) : [p.x, p.z]);
/** Ground-plane distance between two points, each [x, z], [x, y, z] or { x, z }. */
const flat = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);
const deg = (rad) => (rad * 180) / Math.PI;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/** The ground point `r` m from the Hearth on compass `bearing` (radians: 0 north, -Z, clockwise). */
const onBearing = (bearing, r) => ({ x: r * Math.sin(bearing), z: -r * Math.cos(bearing) });

/** The instrument's failure, never a beat's red: it can see what the beat needs. */
function presence(ok, why) {
  if (!ok) throw new Error(`PRESENCE: ${why}`);
}

const declared = [];

/**
 * One beat. Listed in AWAITS: skipped unless opted in, then run to its end with every red recorded, and compared with
 * the record. Not listed: a gate, stopping at its first red. `body(page, ctx)`: `ctx.red(check, ok, why)` returns `ok`;
 * `ctx.standIn(what)` carries an awaiting beat past a red it just recorded.
 */
function beat(id, title, body) {
  declared.push(id);
  const awaits = AWAITS[id];
  const name = `(${id}) ${title}`;
  if (awaits && !OPT_IN) {
    test.skip(name, () => {});
    return;
  }
  test(name, async ({ page }, testInfo) => {
    test.setTimeout(BEAT_BUDGET_MS);
    const reds = [];
    const ctx = {
      red(check, ok, why) {
        if (ok) return true;
        const line = redLine(id, check, why);
        if (!awaits) throw new Error(line);
        reds.push(line);
        console.log(`[first-night] ${line}`);
        return false;
      },
      standIn(what) {
        if (!awaits || reds.length === 0) throw new Error(`STAND-IN (${id}): ${what}, with no red before it: a stand-in only carries an awaiting beat past a red`);
        console.log(`[first-night] (${id}) stand-in: ${what}`);
        testInfo.annotations.push({ type: 'stand-in', description: what });
      },
    };
    await body(page, ctx);
    if (!awaits) return;
    const problem = compareReds(id, awaits, reds);
    if (problem) throw new Error(problem);
    for (const line of reds) testInfo.annotations.push({ type: 'red, as recorded', description: line });
    console.log(`[first-night] (${id}) ${reds.length} of ${awaits.length} reds as recorded (awaits ${unitsOf(awaits).join(', ')})`);
  });
}

// --- in-page readers and drivers (page functions are serialised: each is self-contained) ---

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

/** What the clock waits on (game/dayNight.js shouldAdvanceClock), for a failure that names why it did not move. */
const readClockGates = () => {
  const s = window.useGameStore.getState();
  return { gameTime: s.gameTime, worldBuilt: s.isSpawnChunkLoaded === true, active: window.__craftyTest.call('readIntents').active === true,
    alive: s.isAlive, hidden: document.hidden, spawnProtectedMs: Math.max(0, 5000 - (Date.now() - (s._spawnTime || 0))) };
};

/** The body's translation. */
const readBody = () => {
  const t = window.useGameStore.getState().playerRigidBodyRef?.current?.translation?.();
  return t ? [t.x, t.y, t.z] : null;
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
  if (!rb || !Number.isFinite(gy)) return { why: `SETUP: no body or no ground at ${x.toFixed(1)}, ${z.toFixed(1)}` };
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

/** The notices shown since `mark` (a count of the log), by key, each once (scripts/visual/_firstNight.mjs installNoticeLog). */
const noticesSince = (page, mark) => page.evaluate((m) => window.__fnNotices.slice(m).map((n) => n.key), mark);
const noticeMark = (page) => page.evaluate(() => window.__fnNotices.length);

/** IN THE PAGE: log every notice RAISED on the one channel (the store's addNotification, which QuestSystem publishes
 *  and may publish again) into window.__fnRaised, by key. The horn is counted here, not on screen: a load rebuilds the
 *  world, and a notice raised while the HUD waits for it can end its 4 s life unseen, so a horn on a load read 1 in two
 *  runs and 0 in a third through the toasts. The other notice checks read what is shown. */
const installNoticeCalls = () => {
  const raised = (window.__fnRaised = []);
  const wrap = (s) => {
    const fn = s.addNotification;
    if (typeof fn !== 'function' || fn.__fnRaised) return;
    const logged = (message, ...rest) => {
      raised.push({ key: typeof message === 'string' ? message : null, at: performance.now() });
      return fn(message, ...rest);
    };
    logged.__fnRaised = true;
    window.useGameStore.setState({ addNotification: logged });
  };
  wrap(window.useGameStore.getState());
  window.useGameStore.subscribe(wrap);
  return typeof window.useGameStore.getState().addNotification === 'function';
};
const raisedSince = (page, mark) => page.evaluate((m) => window.__fnRaised.slice(m).map((n) => n.key), mark);
const raisedMark = (page) => page.evaluate(() => window.__fnRaised.length);

/** A clock crossing, the way play makes one: the store's own writer set `units` before the boundary, then the ticker. */
async function crossFrom(page, boundary, units) {
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), boundary - units);
}

/** A real crossing of `boundary` from `units` before it, with the input gate held first (the clock runs only while
 *  it is open); waits for the phase it leads into, and names the clock's gates when it never comes. */
async function crossInto(page, boundary, units, isDay, what) {
  await startPlayActive(page);
  await crossFrom(page, boundary, units);
  await page.waitForFunction((d) => window.useGameStore.getState().isDay === d, isDay, { timeout: 15000 })
    .catch(async () => { throw new Error(`PRESENCE: the clock never crossed into ${what} from ${units} units before it: ${JSON.stringify(await page.evaluate(readClockGates))}`); });
}

async function stand(page, at) {
  const stood = await page.evaluate(standAt, at);
  presence(!stood.why, stood.why);
  await page.evaluate(frames, 10);
  return stood.at;
}

async function enterPlay(page) {
  await page.addInitScript(installNoticeLog);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.__threeScene
    && window.GameMethods?.damageMob && window.useGameStore.getState().playerRigidBodyRef?.current && window.useGameStore.getState().getMobFloor
    && Array.isArray(window.__fnNotices),
  null, { timeout: 60000 }).catch((e) => { throw new Error(`SETUP: the body, the camera, the mob hooks or the notice log never came up: ${e.message}`); });
  await page.waitForFunction(() => typeof window.useGameStore.getState().addNotification === 'function', null, { timeout: 30000 })
    .catch(() => { throw new Error('SETUP: the notification channel was never published'); });
  presence(await page.evaluate(installNoticeCalls), 'the notice channel could not be wrapped for its log');
}

/** Into night 1 by a real crossing, from 5 units before dusk; returns the night as it reads just after. */
async function intoNightOne(page) {
  const start = await page.evaluate(readNight);
  presence(start.isDay === true && start.nightCount === 0, `a returning profile's world does not start in day 0: ${JSON.stringify(start)}`);
  await crossInto(page, HALF_CYCLE_UNITS, 5, false, 'night 1');
  const night = await page.evaluate(readNight);
  presence(night.nightCount === 1, `the crossing did not count night 1: ${JSON.stringify(night)}`);
  return night;
}

/** From inside night `n`, on to just after wave 3's place in the night (380 units in, Move C); whether wave 3 came. */
async function toWaveThree(page, n) {
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), (2 * n - 1) * HALF_CYCLE_UNITS + 375);
  const came = await page.waitForFunction((night) => {
    const siege = window.useGameStore.getState().siege;
    return (siege?.wave ?? 0) >= 3 && (siege?.night ?? night) === night;
  }, n, { timeout: 15000 }).then(() => true, () => false);
  return { came, night: await page.evaluate(readNight) };
}

/** The living hostiles not in `seen`, with each one's place, distance and compass bearing from the Hearth. */
const newHostiles = (seen) => window.__craftyTest.call('readMobs')
  .filter((m) => !m.passive && m.health > 0 && !seen.includes(m.id))
  .map((m) => ({ id: m.id, x: m.x, z: m.z, r: Math.hypot(m.x, m.z), bearing: (Math.atan2(m.x, -m.z) * 180) / Math.PI }));

/** Where each of `ids` stands now: its distance to the Hearth and to the player, by id. */
const distancesOf = (ids) => {
  const t = window.useGameStore.getState().playerRigidBodyRef.current.translation();
  const out = {};
  for (const m of window.__craftyTest.call('readMobs')) {
    if (ids.includes(m.id) && m.health > 0) out[m.id] = { dH: Math.hypot(m.x, m.z), dP: Math.hypot(m.x - t.x, m.z - t.z) };
  }
  return out;
};

/** The siege pip on the compass strip: its centre's offset from the strip's middle in degrees (the strip spans PI,
 *  Compass.jsx FOV), its place in px, and whether it sits within 12 px of either edge; null when it is not drawn. */
const readWedge = () => {
  const track = document.querySelector('[data-testid="compass-track"]')?.getBoundingClientRect();
  const pip = document.querySelector('[data-compass-pip="siege"]');
  if (!track || !pip || getComputedStyle(pip).visibility === 'hidden' || getComputedStyle(pip).display === 'none') return null;
  const r = pip.getBoundingClientRect();
  const x = r.left + r.width / 2 - track.left;
  return { off: (x / track.width - 0.5) * 180, x, width: track.width, atEdge: x <= 12 || x >= track.width - 12 };
};

/** Face compass `bearing` (radians), level. */
async function face(page, bearing) {
  await page.evaluate((h) => { const c = window.__threeCamera; c.rotation.order = 'YXZ'; c.rotation.set(0, -h, 0); c.updateMatrixWorld(); }, bearing);
  await page.evaluate(frames, 10);
}

/** Save the live world through the autosave's own action, set its clock into night `nightCount`, and load it. */
const loadIntoNight = ({ gameTime, nightCount }) => {
  const g = () => window.useGameStore.getState();
  const t = g().playerRigidBodyRef?.current?.translation?.();
  if (!t) return { why: 'SETUP: no body to save' };
  g().saveActiveWorld({ x: t.x, y: t.y, z: t.z });
  const id = localStorage.getItem('crafty_active_world');
  const blob = id ? JSON.parse(localStorage.getItem(`crafty_world_save_${id}`) || 'null') : null;
  if (!blob) return { why: 'SETUP: saveActiveWorld wrote no world blob' };
  blob.game_state = { ...blob.game_state, gameTime };
  blob.progression = { ...blob.progression, nightCount };
  g().loadWorldData(blob);
  return { ok: true };
};

/** Arm the next mousedown (a capture listener on window, ahead of the game's own) to turn the camera to mob `id` and
 *  read whether the light swing's cone holds it (apex over the body, the camera's flattened facing, 4.5 m, 90 degrees,
 *  as tests/e2e/_meleeTarget.js reads it) into window.__fnAim. */
const armAimAt = ({ id, apex }) => {
  window.__fnAim = null;
  window.addEventListener('mousedown', () => {
    const m = window.__craftyTest.call('readMobs').find((e) => e.id === id);
    const body = window.useGameStore.getState().playerRigidBodyRef?.current?.translation?.();
    const cam = window.__threeCamera;
    if (!m || !body) { window.__fnAim = { found: false }; return; }
    cam.lookAt(m.x, m.y + 0.8, m.z);
    cam.updateMatrixWorld();
    const d = new cam.position.constructor();
    cam.getWorldDirection(d);
    d.y = 0;
    d.normalize();
    const inCone = window.GameMethods.checkMobsInMeleeCone({ x: body.x, y: body.y + apex, z: body.z }, { x: d.x, y: 0, z: d.z }, 4.5, Math.PI / 2)
      .some((e) => e.id === id);
    window.__fnAim = { found: true, inCone, m: +Math.hypot(m.x - body.x, m.z - body.z).toFixed(2), active: window.__craftyTest.call('readIntents').active === true };
  }, { capture: true, once: true });
};

/** Place hostiles of `type` at each [x, z] through the store's published spawnMob; the ids it added. */
const placeHostiles = ({ at, type }) => {
  const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
  for (const [x, z] of at) window.useGameStore.getState().spawnMob?.(x, z, type);
  return window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id)).map((m) => m.id);
};

// --- the beats ---

test.describe('a fresh profile', () => {
  test.use({ profile: 'fresh' });

  beat('a', 'kindle: no brazier light at Start, and a real G within 3 m lights it', async (page, { red }) => {
    await enterPlay(page);
    const lit = await page.evaluate(brazierLight, BRAZIER_FIRE);
    presence(lit.count === 1, `the brazier's light is not in the scene exactly once (${lit.count} point lights at its fire)`);
    red('cold', lit.intensity === 0, `the brazier is lit at Start (intensity ${lit.intensity}): there is nothing to kindle`);
    // The kindle: 2 m south of the brazier, facing it (north, -Z), the real G.
    await stand(page, { x: BRAZIER[0], z: BRAZIER[2] + 2, heading: 0 });
    const lightNow = () => page.evaluate(brazierLight, BRAZIER_FIRE);
    const before = (await lightNow()).intensity;
    const litBefore = (await page.evaluate(readNight)).hearthLit;
    await page.keyboard.press('g');
    let after = await lightNow();
    for (let i = 0; i < 25 && !(before === 0 && after.intensity > 0); i++) {
      await page.waitForTimeout(200);
      after = await lightNow();
    }
    red('kindle', before === 0 && after.intensity > 0,
      `G 2 m from the brazier lit no cold brazier: intensity ${before} before the press and ${after.intensity} after (a kindle reads 0, then more)`);
    // The store's own word, cold before the press and lit after it: a Hearth the store already called lit (U1's default,
    // which D2 makes cold for a fresh profile) was kindled by nothing.
    const hearthLit = (await page.evaluate(readNight)).hearthLit;
    red('lit', litBefore === false && hearthLit === true,
      `the store does not say the Hearth went from cold to lit with the kindle (hearthLit ${JSON.stringify(litBefore)} before the press, ${JSON.stringify(hearthLit)} after)`);
  });
});

beat('b', 'horn: one at the crossing and none on a load, the wedge on the bearing, wave 1 marching on the Hearth', async (page, { red, standIn }) => {
  await enterPlay(page);
  await page.evaluate(clearHostiles, 60);
  const mark = await raisedMark(page);
  const seen = await page.evaluate(() => window.__craftyTest.call('readMobs').map((m) => m.id));
  // 10 units before dusk, by the store's own clock writer (a set inside the day half crosses nothing), then the ticker.
  await crossInto(page, HALF_CYCLE_UNITS, 10, false, 'night 1');
  await page.waitForTimeout(3000);
  const night = await page.evaluate(readNight);
  presence(night.nightCount === 1, `the crossing did not count night 1: ${JSON.stringify(night)}`);
  const crossingHorns = (await raisedSince(page, mark)).filter(isHornKey).length;
  const stated = night.siege?.bearings?.[0];
  const sieged = red('siege', Number.isFinite(stated), `no siege at the crossing: the store holds ${JSON.stringify(night.siege)}`);
  let bearing = stated;
  if (!sieged) {
    standIn('a bearing of 0 (north) for the wedge, the stand and wave 1');
    bearing = 0;
  }
  // The wedge, ahead and then behind.
  await face(page, bearing);
  const ahead = await page.evaluate(readWedge);
  red('wedge', ahead !== null && Math.abs(ahead.off) <= 2,
    `facing the bearing, the compass wedge is ${ahead === null ? 'not drawn' : `${ahead.off.toFixed(1)} degrees off it`}`);
  await face(page, bearing + Math.PI);
  const behind = await page.evaluate(readWedge);
  red('pinned', behind !== null && behind.atEdge,
    `with the bearing behind the player, the compass wedge is ${behind === null ? 'not drawn' : `${behind.x.toFixed(0)} px into a ${behind.width.toFixed(0)} px strip, not pinned at an edge`}`);
  // Stand square to the bearing, where a hunter turns to the player and a marcher keeps on to the Hearth: the first
  // column with a floor, STAND_OFF_M or a little more out, on either side, within 6 degrees of square.
  const squares = [];
  for (const r of [STAND_OFF_M, STAND_OFF_M + 3, STAND_OFF_M + 6]) {
    for (const side of [1, -1]) for (const off of [0, 6, -6]) squares.push({ ...onBearing(bearing + side * (Math.PI / 2 + (off * Math.PI) / 180), r), heading: deg(bearing) });
  }
  let stoodSquare = null;
  for (const at of squares) {
    const s = await page.evaluate(standAt, at);
    if (!s.why) { stoodSquare = s.at; break; }
  }
  presence(stoodSquare !== null, `SETUP: no column with a floor square to the bearing, ${STAND_OFF_M}-${STAND_OFF_M + 6} m out (${squares.length} tried)`);
  await page.evaluate(frames, 10);
  const placed = await page.evaluate(newHostiles, seen);
  const fromBearing = placed.filter((m) => m.r >= 20 && Math.abs(wrapDeg(m.bearing - deg(bearing))) <= SECTOR_DEG);
  red('sector', sieged && fromBearing.length >= 2 && fromBearing.length >= 0.75 * placed.length,
    `no wave-1 hostile came from the siege's bearing: ${sieged
      ? `${fromBearing.length} of ${placed.length} new hostiles within ${SECTOR_DEG} degrees of ${deg(bearing).toFixed(0)} and 20 m out`
      : 'no bearing to read (the store holds no siege)'}`);
  let wave = sieged ? fromBearing.map((m) => m.id) : [];
  if (!sieged) {
    // 28 m out: inside the ground streamed around the stand (two chunks at the suite's low tier; 50 m out had none).
    standIn('two husks placed 28 m out on that bearing by the store\'s spawnMob, as wave 1');
    const p = onBearing(bearing, 28);
    wave = await page.evaluate(placeHostiles, { at: [[p.x - 2, p.z], [p.x + 2, p.z]], type: 'zombie' });
    presence(wave.length > 0, 'SETUP: spawnMob placed no stand-in husk 28 m out');
  }
  // Read every 5 s for 20 s: what counts as a march is tests/e2e/_firstNightMarch.js marches, gated on its own.
  const samples = [await page.evaluate(distancesOf, wave)];
  for (let k = 1; k < READINGS; k++) {
    await page.waitForTimeout(5000);
    samples.push(await page.evaluate(distancesOf, wave));
  }
  const rows = wave.map((id) => ({ id, at: samples.map((s) => s[id] ?? null) }));
  const marched = rows.filter((m) => marches(m.at));
  red('march', wave.length > 0 && marched.length >= Math.ceil(wave.length / 2),
    `no wave-1 hostile marched on the Hearth (10 m closer to it in 20 s, closing at every 5 s step, and ending nearer it than the player): ${JSON.stringify(rows.map((m) => [m.id,
      m.at.map((s) => s && [+s.dH.toFixed(1), +s.dP.toFixed(1)])]))}`);
  // Never on a load: back to day by the store's own phase write, then the live world saved and loaded into night 1.
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.waitForFunction(() => window.useGameStore.getState().isDay === true, null, { timeout: 5000 })
    .catch(() => { throw new Error('PRESENCE: setTimeOfDay(0.5) did not bring day back before the load'); });
  await page.waitForTimeout(500);
  const loadMark = await raisedMark(page);
  const shownLoadMark = await noticeMark(page);
  const loaded = await page.evaluate(loadIntoNight, { gameTime: HALF_CYCLE_UNITS + 120, nightCount: 1 });
  presence(!loaded.why, loaded.why);
  await page.waitForFunction(() => window.useGameStore.getState().isDay === false, null, { timeout: 10000 })
    .catch(() => { throw new Error('PRESENCE: the load of a night save did not put the world in night'); });
  await page.waitForTimeout(3000);
  const loadHorns = (await raisedSince(page, loadMark)).filter(isHornKey).length;
  const shownOnLoad = (await noticesSince(page, shownLoadMark)).filter(isHornKey).length;
  red('horn', crossingHorns === 1 && loadHorns === 0,
    `the horn sounded ${crossingHorns} time${crossingHorns === 1 ? '' : 's'} at the crossing and ${loadHorns} time${loadHorns === 1 ? '' : 's'} on a load into night (once at the crossing, never on a load; on screen after the load: ${shownOnLoad})`);
});

beat('c', 'beast: a real R on a full bar holds the camera behind the body for the form, and the eye point stays put', async (page, { red }) => {
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
    .catch(() => { throw new Error(`PRESENCE: the beast form did not end within ${roarSec + 4} s of a ${roarSec} s roar`); });
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
  const heldBehind = (f) => { const b = behind(f); return b.m >= 3 && b.back; };
  // The reveal's pull-back, from the press (the charge may start it) to the end of its window: the log can see a camera behind.
  const reveal = log.filter((f) => f.at >= pressAt && s(f) < REVEAL_SEC).map((f) => behind(f).m);
  presence(reveal.length > 0 && Math.max(...reveal) >= 2, `the reveal never pulled the camera back 2 m (max ${Math.max(0, ...reveal).toFixed(2)} m): the log cannot see a camera behind`);
  const held = log.filter((f) => f.form && s(f) >= REVEAL_SEC + 0.05 && s(f) <= roarSec - 0.1);
  const lost = held.find((f) => !heldBehind(f));
  red('held', held.length > 0 && !lost, lost
    ? `the camera is back at the eye at ${s(lost).toFixed(2)} s of a ${roarSec} s form (${behind(lost).m.toFixed(2)} m from the body)`
    : 'no frame inside the form after the reveal');
  const after = log.filter((f) => f.at > end.at && (f.at - end.at) / 1000 >= 1);
  const home = after[0] ? Math.hypot(after[0].cam[0] - after[0].body[0], after[0].cam[1] - (after[0].body[1] + EYE_HEIGHT_M), after[0].cam[2] - after[0].body[2]) : null;
  red('return', heldBehind(end) && home !== null && home < 0.3, heldBehind(end)
    ? `1 s after the form ended the camera is ${home?.toFixed(2)} m from the eye`
    : `the camera was not held to the form's end (${behind(end).m.toFixed(2)} m from the body at its last frame), so there is no return from a held view to read`);
  const drift = log.filter((f) => f.form && f.pp).map((f) => flat(f.pp, [f.body[0], f.body[2]]));
  red('eye', drift.length > 0 && Math.max(...drift) <= 1, `playerPosition left the body by ${Math.max(0, ...drift).toFixed(2)} m during the form (${drift.length} frames)`);
});

beat('d', 'regen: flat to 4 s of calm, then 5 HP/s or more; a hit at 3 s restarts the clock', async (page, { red }) => {
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
  const sample = (ms) => page.evaluate(async (span) => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < span) {
      out.push({ at: performance.now(), health: window.useGameStore.getState().playerHealth });
      await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  }, ms);
  await page.evaluate(() => window.useGameStore.setState({ playerHealth: 60 }));
  const first = await hit(10);
  presence(first.health === 50, `the hit did not land (health ${first.health} after 10 from 60): no clock to read`);
  const calm = await sample(7000);
  const at = (h, from = first) => (h.at - from.at) / 1000;
  const early = calm.filter((h) => at(h) < 3.9);
  const flatEarly = early.length > 0 && early.every((h) => h.health === 50);
  const a = calm.find((h) => at(h) >= 4.1), b = calm[calm.length - 1];
  const rate = a && b && at(b) > at(a) ? (b.health - a.health) / (at(b) - at(a)) : 0;
  red('regen', flatEarly && rate >= 5, !flatEarly
    ? `health moved before 4 s of calm: ${JSON.stringify(early.map((h) => [+at(h).toFixed(1), h.health]))}`
    : `no regeneration: ${rate.toFixed(1)} HP/s from 4.1 s to ${b ? at(b).toFixed(1) : '?'} s of calm (health ${a?.health} -> ${b?.health})`);
  // The restart: a fresh hit, then another 3 s later; nothing comes back until 4 s after the second, then it does.
  await page.evaluate(() => window.useGameStore.setState({ playerHealth: 60 }));
  await hit(5);
  await page.waitForTimeout(3000);
  const two = await hit(5);
  const restart = await sample(5500);
  const moved = restart.find((h) => h.health !== two.health);
  const last = restart[restart.length - 1];
  red('restart', Boolean(moved) && at(moved, two) >= 3.9 && last.health > two.health, moved && at(moved, two) < 3.9
    ? `after a hit at 3 s health moved ${at(moved, two).toFixed(1)} s after it: the clock did not restart`
    : `after a hit at 3 s health held to ${at(last, two).toFixed(1)} s and did not come back (${two.health} -> ${last.health})`);
});

beat('e', 'captain: his kill by a real click brings day within 6 s, the rush with no sky cut, the reward once, the payoff, the swell', async (page, { red, standIn }) => {
  await enterPlay(page);
  await intoNightOne(page);
  const { night } = await toWaveThree(page, 1);
  let captainId = night.siege?.captainId ?? null;
  if (!red('captain', captainId != null, `no siege, so no captain at wave 3: the store holds ${JSON.stringify(night.siege)}`)) {
    standIn('a husk placed 8 m north of the player by the store\'s spawnMob, as the captain');
    const t = await page.evaluate(readBody);
    [captainId] = await page.evaluate(placeHostiles, { at: [[t[0], t[2] - 8]], type: 'zombie' });
    presence(captainId != null, 'SETUP: spawnMob placed no stand-in captain');
  }
  const captain = await page.evaluate((id) => window.__craftyTest.call('readMobs').find((m) => m.id === id) ?? null, captainId);
  presence(captain && captain.health > 0, `the captain ${captainId} is not a live mob`);
  // Stand 2.5 m south of him at 1 HP and kill him with a real left click, aimed on its own mousedown (the camera can
  // turn between an aim and a click; tests/e2e/talents.spec.js measured it); then watch the sky every frame.
  await stand(page, { x: captain.x, z: captain.z + 2.5, heading: 0 });
  await page.evaluate(armAimAt, { id: captainId, apex: SWING_APEX_OVER_BODY_M });
  await page.evaluate((id) => {
    const e = window.__craftyTest.call('readMobs').find((m) => m.id === id);
    if (e && e.health > 1) window.GameMethods.damageMob(id, e.health - 1, 'physical', 'ally'); // to 1 HP: the click kills
  }, captainId);
  const mark = await noticeMark(page);
  await page.evaluate(() => {
    const log = window.__fnSky = [];
    const step = () => {
      const sky = window.__craftyTest.call('readSkyLight');
      const s = window.useGameStore.getState();
      log.push({ at: performance.now(), cycle: sky?.cycle ?? null, day: s.isDay, bloomAhead: (s.bloomSpikeUntil || 0) - performance.now() });
      if (!window.__fnSkyDone) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.mouse.click(640, 400);
  const aim = await page.evaluate(() => window.__fnAim);
  presence(aim?.found && aim.inCone && aim.active, `SETUP: on the click's own mousedown the captain was not in the swing's reach: ${JSON.stringify(aim)}`);
  await page.waitForFunction((id) => !window.__craftyTest.call('readMobs').some((m) => m.id === id && m.health > 0), captainId, { timeout: 5000 })
    .catch(() => { throw new Error(`PRESENCE: a real left click on the captain at 1 HP, in the swing's reach, did not kill him: ${JSON.stringify(aim)}`); });
  const killedAt = Date.now();
  const dayCame = await page.waitForFunction(() => window.useGameStore.getState().isDay === true, null, { timeout: 6000 }).then(() => true, () => false);
  red('day', dayCame && Date.now() - killedAt <= 6000, 'the captain\'s kill did not bring day within 6 s');
  await page.waitForTimeout(3000);
  const log = await page.evaluate(() => { window.__fnSkyDone = true; return window.__fnSky; });
  const sky = log.filter((f) => Number.isFinite(f.cycle));
  presence(log.length >= 2 && log[0].day === false, `the sky log read ${log.length} frames, the first ${log[0]?.day ? 'by day' : 'unread'}: it cannot see the night end`);
  // A cut is the sky's own clock moving further in one frame than the rush could pan it over that frame's time
  // (tests/e2e/_firstNightSky.js, gated on its own); a rush drawn on too few or too slow frames cannot tell a cut from a
  // pan at all, and says so. Whether day came at all needs only the frames either side of it.
  const rushed = log.some((f) => !f.day) && log.some((f) => f.day);
  const steps = skySteps(sky, CYCLE_UNITS, RUSH_UNITS_PER_SEC);
  if (rushed) {
    const median = medianFrameSec(steps);
    presence(sky.length >= 10 && median !== null && median <= 0.25,
      `the page drew ${sky.length} frames with the sky's own clock, one every ${median?.toFixed(2)} s, through the rush: too few or too slow to tell a cut from a pan`);
  }
  const cut = firstCut(steps);
  red('sky', rushed && !cut, rushed
    ? `the sky cut during the rush: its clock moved ${cut.du.toFixed(0)} units in one ${cut.dt.toFixed(2)} s frame, where a pan moves ${cut.pan.toFixed(0)} at most`
    : `no dawn rush to read: the sky log never saw day (${log.length} frames)`);
  const after = await page.evaluate(readNight);
  red('reward', after.lastRewardedNight === 1, `the dawn reward is not counted once for night 1 (lastRewardedNight ${after.lastRewardedNight})`);
  const keys = await noticesSince(page, mark);
  const dawn = keys.findIndex((k) => /^notice\.dawn/.test(k));
  const lantern = keys.findIndex((k) => /lantern/i.test(k));
  red('payoff', keys.filter((k) => /^notice\.dawn/.test(k)).length === 1 && dawn >= 0 && lantern > dawn,
    `the payoff is not one dawn notice and then the lantern line: ${JSON.stringify(keys)}`);
  const swell = Math.max(0, ...log.map((f) => f.bloomAhead));
  red('swell', swell >= 300, `no bloom swell after the kill: the store's bloom window reached ${swell.toFixed(0)} ms ahead at most (a swell holds 300 ms or more)`);
});

beat('f', 'respawn: rise at the lit light nearest the fall, the lantern only when it is the nearest', async (page, ctx) => {
  const { red, standIn } = ctx;
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.evaluate(clearHostiles, 60);
  let lantern = await placeLantern(page, ctx);
  if (!lantern) {
    standIn(`the place a lantern would stand (${LANTERN_STAND_IN.x}, ${LANTERN_STAND_IN.z}), for the deaths beside it`);
    lantern = LANTERN_STAND_IN;
  }
  const stands = async () => ((await page.evaluate(readNight)).lanterns?.length ?? 0) === 1;
  const [near, hearth, fallback] = respawnCases(lantern);
  for (const c of [near, hearth, fallback]) presence(caseHolds(c, lantern), `the geometry: the ${c.at} is not the nearest lit light to ${JSON.stringify(c.death)} by 6 m`);
  const m = (v) => v.toFixed(1);
  // 1. Beside the lantern, the lantern is the nearest lit light: rise there.
  const standing = await stands();
  const rose1 = await dieAt(page, near.death);
  const d1 = distances(near, rose1, lantern);
  red('near', standing && roseRight(near, rose1, lantern),
    `a death ${m(d1.death.lantern).replace(/\.0$/, '')} m from the lantern and ${m(d1.death.hearth)} m from the Hearth rose ${m(d1.rose.lantern)} m from the lantern${standing ? '' : ' (no lantern stands: its place)'}`);
  // 2. Nearer the Hearth, the lantern still standing: rise at the Hearth, where a rule that prefers any lantern fails.
  const standing2 = await stands();
  const rose2 = await dieAt(page, hearth.death);
  const d2 = distances(hearth, rose2, lantern);
  red('hearth', standing2 && roseRight(hearth, rose2, lantern), standing2
    ? `a death ${m(d2.death.hearth)} m from the Hearth and ${m(d2.death.lantern)} m from the standing lantern rose ${m(d2.rose.hearth)} m from the Hearth`
    : `no lantern stands, so a death nearer the Hearth cannot tell the nearest light from any lantern (rose ${m(d2.rose.hearth)} m from the Hearth)`);
  // 3. Mined, a death beside its place rises at the Hearth, where a rule reading a stale index fails.
  const mined = await mineLantern(page, lantern, ctx);
  const rose3 = await dieAt(page, fallback.death);
  const d3 = distances(fallback, rose3, lantern);
  red('fallback', mined && roseRight(fallback, rose3, lantern), mined
    ? `with the lantern mined, a death beside its place rose ${m(d3.rose.hearth)} m from the Hearth`
    : `no lantern was placed and mined, so a death beside its place cannot show the fallback (rose ${m(d3.rose.hearth)} m from the Hearth)`);
});

beat('g', 'ward: the Forge sells a lantern; placed, 200 ambient attempts put none within 16 m of it; mined, some', async (page, ctx) => {
  const { red, standIn } = ctx;
  await enterPlay(page);
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0));
  // The Forge's price, exactly: 2 coal, 1 iron and 20 coins, spent to nothing, and one lantern in the bag.
  const bought = await page.evaluate(() => {
    const g = () => window.useGameStore.getState();
    const s = g();
    window.useGameStore.setState({ coins: 20, inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, coal: 2, iron: 1, lantern: 0 } } });
    const r = g().buyForgeOffer({ id: 'goods:lantern' });
    const b = g().inventory.blocks;
    return { ok: r.ok === true, reason: r.reason ?? null, lantern: b.lantern ?? 0, coal: b.coal ?? 0, iron: b.iron ?? 0, coins: g().coins };
  });
  const paid = bought.ok && bought.lantern === 1 && bought.coal === 0 && bought.iron === 0 && bought.coins === 0;
  red('forge', paid, bought.reason === 'stale'
    ? 'the Forge sells no lantern: buyForgeOffer(goods:lantern) answered stale'
    : `the Forge's lantern for 2 coal, 1 iron and 20 coins: ${JSON.stringify(bought)}`);
  if (!paid) {
    standIn('a lantern put in the bag by the store\'s addToInventory');
    await page.evaluate(() => window.useGameStore.getState().addToInventory('lantern', 1));
  }
  let lantern = await placeLantern(page, ctx);
  if (!lantern) {
    standIn(`the place a lantern would stand (${LANTERN_STAND_IN.x}, ${LANTERN_STAND_IN.z}), for the attempts around it`);
    lantern = LANTERN_STAND_IN;
  }
  const away = { x: lantern.x - 40, z: lantern.z, heading: 90 };
  const attempts = () => page.evaluate((n) => {
    const out = window.__craftyTest.call('ambientAttempts', n);
    return Array.isArray(out) ? out : null;
  }, ATTEMPTS);
  const within = (list, lo, hi) => list.filter((p) => Array.isArray(p) && flat(p, lantern) >= lo && flat(p, lantern) < hi).length;
  const placedOf = (list) => list.filter((p) => Array.isArray(p)).length;
  const read = (list) => {
    presence(list.length === ATTEMPTS && placedOf(list) >= 20, `the hook answered ${list.length} of ${ATTEMPTS} attempts, ${placedOf(list)} placed: too few to read a ward by`);
    presence(within(list, 16, 30) > 0, 'no attempt reached the ward\'s edge (16-30 m of the lantern): this stand cannot test the ward');
  };
  await stand(page, away);
  const warded = await attempts();
  const hook = red('hook', warded !== null, 'no ambientAttempts hook to drive the ambient spawner (N2-N3 add it)');
  if (hook) read(warded);
  red('ward', hook && within(warded, 0, 16) === 0, hook
    ? `${within(warded, 0, 16)} of ${placedOf(warded)} placements within 16 m of the lantern (${within(warded, 16, 30)} at 16-30 m)`
    : 'no attempts to read the ward by: no ambientAttempts hook');
  const mined = await mineLantern(page, lantern, ctx);
  await stand(page, away);
  const open = hook ? await attempts() : null;
  if (open) read(open);
  red('open', Boolean(open) && mined && within(open, 0, 16) > 0, open
    ? `${mined ? 'with the lantern mined' : 'the lantern not mined'}, ${within(open, 0, 16)} of ${placedOf(open)} placements within 16 m of its place: the ward reads nothing`
    : 'no attempts to read the open ground by: no ambientAttempts hook');
});

beat('h', 'lend: on night 1 a lit Hearth fills the bar to 100 as wave 3 is placed, with its line; on night 2 it does not', async (page, { red }) => {
  await enterPlay(page);
  await page.evaluate(() => {
    const s = window.useGameStore.getState();
    window.useGameStore.setState({ unlockedTalents: { ...s.unlockedTalents, wildheart_roar: 1 } });
  });
  await intoNightOne(page);
  await page.evaluate(() => window.useGameStore.setState({ ember: 40 }));
  const mark = await noticeMark(page);
  const one = await toWaveThree(page, 1);
  red('wave3', one.came, `no siege, so no wave 3 to lend at: the store holds ${JSON.stringify(one.night.siege)}`);
  red('lend', one.came && one.night.ember === 100, `wave 3 of night 1 left the bar at ${one.night.ember}, not 100`);
  const lines = (await noticesSince(page, mark)).filter((k) => k === 'notice.hearthLends');
  red('line', lines.length === 1, `the lend's line showed ${lines.length} times`);
  // Night 2: through dawn and the day by the clock's own crossings, the bar at 40 again at wave 3.
  await crossInto(page, 2 * HALF_CYCLE_UNITS, 5, true, 'day 2');
  await crossInto(page, 3 * HALF_CYCLE_UNITS, 5, false, 'night 2');
  presence((await page.evaluate(readNight)).nightCount === 2, 'the crossing into night 2 did not count night 2');
  await page.evaluate(() => window.useGameStore.setState({ ember: 40 }));
  const two = await toWaveThree(page, 2);
  red('night2', two.came && two.night.ember === 40, two.came
    ? `night 2 lent the roar too: the bar at ${two.night.ember} at wave 3`
    : `no wave 3 on night 2 to refuse the lend at: the store holds ${JSON.stringify(two.night.siege)}`);
});

// --- the lantern, for (f) and (g): chosen on the hotbar by a real click, placed by a real right click, mined by a left ---

async function placeLantern(page, { red }) {
  presence((await page.locator('[data-hotbar-block]').count()) > 0, 'the hotbar shows no slot at all: no lantern slot could be read');
  const slot = page.locator('[data-hotbar-block="lantern"]');
  if (!red('slot', (await slot.count()) === 1, 'no lantern slot on the hotbar: block 16 is not in the game')) {
    red('place', false, 'a real right click with the lantern selected placed none: there was no lantern slot to select');
    return null;
  }
  await page.evaluate(() => { const s = window.useGameStore.getState(); if (!(s.inventory.blocks.lantern > 0)) s.addToInventory('lantern', 1); });
  await slot.click();
  await stand(page, { x: LANTERN_STAND[0], z: LANTERN_STAND[1], heading: 0, pitch: -50 });
  await page.evaluate(frames, 10);
  await page.mouse.click(640, 400, { button: 'right' });
  const placed = await page.waitForFunction(() => (window.useGameStore.getState().lanterns?.length ?? 0) === 1, null, { timeout: 5000 })
    .then(() => true, () => false);
  if (!red('place', placed, 'a real right click with the lantern selected placed none')) return null;
  return (await page.evaluate(readNight)).lanterns[0];
}

async function mineLantern(page, at, { red }) {
  const held = (await page.evaluate(readNight)).lanterns?.length ?? 0;
  if (!red('mine', held === 1, `no lantern in the store's index to mine (it holds ${held})`)) return false;
  await stand(page, { x: at.x, z: at.z + 2, heading: 0, pitch: -40 });
  await page.evaluate(frames, 10);
  await page.mouse.click(640, 400);
  const gone = await page.waitForFunction(() => (window.useGameStore.getState().lanterns?.length ?? 0) === 0, null, { timeout: 8000 })
    .then(() => true, () => false);
  return red('mine', gone, 'a real left click 2 m from the lantern did not mine it');
}

/** Stand at `at`, fall to a lethal hit, press Respawn, and hold the input gate again; where the body rose. The hit
 *  waits out the 5 s a respawn protects the player for (useGameStore damagePlayer, `_spawnTime`), or it is ignored. */
async function dieAt(page, at) {
  await stand(page, at);
  await page.waitForFunction(() => Date.now() - (window.useGameStore.getState()._spawnTime || 0) >= 5200, null, { timeout: 10000 })
    .catch(() => { throw new Error('PRESENCE: the respawn protection never ran out'); });
  await page.evaluate(() => window.useGameStore.getState().damagePlayer(99999, 'zombie'));
  await page.waitForFunction(() => window.useGameStore.getState().isAlive === false, null, { timeout: 3000 })
    .catch(async () => { throw new Error(`PRESENCE: a lethal hit did not kill the player: ${JSON.stringify(await page.evaluate(readClockGates))}`); });
  await expect(page.getByTestId('death-respawn'), 'PRESENCE: a lethal hit showed no respawn button').toBeVisible({ timeout: 10000 });
  await page.getByTestId('death-respawn').click();
  await page.waitForFunction(() => window.useGameStore.getState().isAlive === true, null, { timeout: 10000 })
    .catch(() => { throw new Error('PRESENCE: the Respawn button did not bring the player back'); });
  await page.waitForTimeout(1500);
  const gate = await page.evaluate(() => window.__craftyTest.call('readIntents').active === true);
  console.log(`[first-night] after Respawn the input gate read ${gate ? 'live' : 'shut'}`);
  await startPlayActive(page);
  const body = await page.evaluate(readBody);
  presence(body !== null, 'no body after the respawn');
  return body;
}

// --- the denominator ---

test('the beats: how many gate this sha and how many await their units', () => {
  const awaiting = declared.filter((id) => AWAITS[id]);
  const gating = declared.filter((id) => !AWAITS[id]);
  const reds = awaiting.reduce((n, id) => n + AWAITS[id].length, 0);
  console.log(`[first-night] ${declared.length} beats: ${gating.length} gate this sha (${gating.join(' ') || 'none'}), `
    + `${awaiting.length} await their units (${awaiting.map((id) => `${id}: ${unitsOf(AWAITS[id]).join(' ')}`).join('; ') || 'none'}), `
    + `${reds} reds recorded; ${OPT_IN ? 'FIRST_NIGHT_AWAITING=1: the awaiting beats run, red as recorded' : 'the awaiting beats are skipped (FIRST_NIGHT_AWAITING=1 runs them red)'}`);
  expect(declared, 'the file does not declare each of the eight beats once, in order').toEqual([...BEATS]);
  expect(Object.keys(AWAITS).filter((id) => !BEATS.includes(id)), 'AWAITS lists a beat the file does not have').toEqual([]);
});
