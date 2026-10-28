import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { PerspectiveCamera, Vector3, MathUtils, Object3D } from 'three';
import { EffectComposer, EffectPass, VignetteEffect, ToneMappingEffect } from 'postprocessing';
import { World } from 'miniplex';
import {
  parseLookbookParam,
  timeOfDayForCycle,
  installLookbookSeam,
  lookbookPose,
  applyLookbookPose,
  subscribeLookbook,
  lookbookPinned,
  yawForHeading,
  headingOf,
  hostileReach,
  _resetLookbookForTest,
} from '../../src/render/lookbookSeam.js';
import { createPassTimer, installPassTimer } from '../../src/render/passTimer.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getActiveSnapshot, resetInput } from '../../src/input/inputState.js';
import { cycleFraction } from '../../src/game/dayPhase.js';
import { CYCLE_UNITS } from '../../src/game/dayNight.js';
import { contextLossCount, glInfo, _resetGlDiagnosticsForTest } from '../../src/render/glDiagnostics.js';

/**
 * THE LOOKBOOK SEAM (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md, part a). The lookbook probe shoots
 * the PRODUCTION bundle with motion on, so it cannot use the DEV test bridge or capture mode; this is the one
 * prod-reachable door it gets: `window.__craftyLookbook`, installed only for `?lookbook=1`, and inert until a script
 * calls it. What it must get right, each driven here against the REAL module it touches:
 *
 *   - the gate: the exact parameter value, nothing looser, and NOTHING installed without it;
 *   - the pose: a real three.js camera ends at the position, looking at the target, level (no roll), at the fov, with
 *     the projection matrix rebuilt — and a NaN pose is refused rather than handed to the camera;
 *   - the time: the programme's four times are DAWN-origin cycle fractions (game/dayPhase.cycleFraction) while the
 *     store's setTimeOfDay takes a MIDNIGHT-origin value — the easiest thing here to get silently wrong. Driven on the
 *     real store: the cycle lands within one game unit, isDay agrees, and the siege counter does not move (a direct
 *     set, never a clock crossing — setGameTime would count a night);
 *   - the input gate: play() flips the REAL inputState gate, which is what hides the title menu without pointer lock;
 *   - the subscription the Player uses to hide the first-person hands while a pose is set.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 9 tests, each observed RED unless stated:
 *   L1 plausible-wrong: any value of the parameter opens the seam (`!== null`) -> "parses only the exact value"
 *   L2 no cycle conversion (the dawn-origin fraction passed straight to setTimeOfDay) -> the conversion, setCycle, info
 *   L2b plausible-wrong: the conversion the wrong way (`f - 0.25`) -> the same three
 *   L3 the up vector not levelled -> "pins a real camera ... level"
 *   L4 updateProjectionMatrix skipped -> the same test (projection element 5)
 *   L5 pose validation reduced to Array.isArray -> "the seam validates"
 *   L6 the install not gated on the parameter -> "installs window.__craftyLookbook only with the parameter"
 *   L7 play() a no-op -> "play() makes the REAL input gate live"
 *   L8 subscribers never notified -> "subscribers ... hear every pose and clear"
 *   L9 plausible-wrong: setCycle through the clock writer setGameTime -> "no siege night counted" (0.48 -> 0.55 crossed)
 *   L10 plausible-wrong: setCycle echoes the request -> RED. The four programme times all land exactly on the
 *       game-unit grid, so 0.3001 was added BEFORE the run to make this killable (argued, not observed surviving).
 *   L11 plausible-wrong: the pose fov ignored (75 written) -> SURVIVED while the test posed at 75; RED at fov 50
 *   F3a pose() returns the live _pose -> "pose() and info() hand back COPIES"
 *   F3b info().pose is the live _pose -> the same test
 *   F3c plausible-wrong: a shallow copy ({ ...p }, the arrays shared with the live pose) -> the same test
 *   F3d plausible-wrong: an unposed copy is an empty shell, not null -> the same test
 *   F3e plausible-wrong: the copy rebuilds the fov from the default (75) -> the same test, posed at fov 50 (at 75 it would survive)
 *   I0 identity (a comment edit in lookbookSeam.js) SURVIVED, twice.
 *
 * BLIND SPOT: that Components.jsx's Player useFrame applies the pose to the LIVE camera (and stops applying it on
 * clear), that the hands really hide, and that index.jsx installs the seam, are the e2e's
 * (tests/e2e/lookbook-seam.spec.js); so are stand(), look() and clearHostiles() against the running game (its 2b), on
 * the DEV server. That the PRODUCTION bundle installs the seam and can load the pass timer's chunk is prod-smoke's
 * (scripts/ci/prod-smoke.mjs seamVerdict). Nothing here shows the timer's numbers are GPU execution times: the fake
 * context below decides them. The probe judges each real window instead (scripts/visual/_lookbook.mjs passSummary,
 * `plausible`). The probe's own logic is tests/gates/lookbook-plan-gates.test.js.
 */

const fakeWin = (search) => ({ location: { search } });
const deps = () => ({ store: useGameStore, setActive, getActive: getActiveSnapshot, cycleOf: cycleFraction, glInfo, contextLosses: contextLossCount });
const HEARTH = { position: [13, 81, 13], lookAt: [0, 51, 0] };

beforeEach(() => {
  _resetLookbookForTest();
  _resetGlDiagnosticsForTest();
  resetInput();
  useGameStore.setState({ gameTime: 0, isDay: true, nightCount: 0 });
});
afterEach(() => {
  _resetLookbookForTest();
  resetInput();
});

describe('the gate: ?lookbook=1 exactly, and nothing installed without it', () => {
  it('parses only the exact value', () => {
    const yes = ['?lookbook=1', '?a=2&lookbook=1', 'lookbook=1'];
    const no = ['', '?lookbook=0', '?lookbook', '?lookbook=true', '?lookbookx=1', '?xlookbook=1', null, undefined];
    for (const s of yes) expect(parseLookbookParam(s), `"${s}" should open the seam`).toBe(true);
    for (const s of no) expect(parseLookbookParam(s), `"${s}" must not open the seam`).toBe(false);
  });
  it('installs window.__craftyLookbook only with the parameter', () => {
    const closed = fakeWin('?perf=A');
    expect(installLookbookSeam(closed, deps())).toBe(false);
    expect(closed.__craftyLookbook).toBeUndefined();
    const open = fakeWin('?lookbook=1');
    expect(installLookbookSeam(open, deps())).toBe(true);
    expect(Object.keys(open.__craftyLookbook).sort()).toEqual(['clear', 'clearHostiles', 'info', 'look', 'passTimes', 'play', 'pose', 'setCycle', 'stand']);
    // Installing changes nothing by itself: no pose is set until a script asks.
    expect(lookbookPose()).toBeNull();
    expect(lookbookPinned()).toBe(false);
  });
});

describe('the pose', () => {
  it('pins a real camera at the position, looking at the target, level, at the fov, with the projection rebuilt', () => {
    const cam = new PerspectiveCamera(60, 16 / 10, 0.1, 500);
    cam.up.set(1, 0, 0); // a rolled camera: the pin must level it, as capture's does
    cam.position.set(-5, 5, -5);
    // fov 50, not the game's default 75: a pin that ignored the pose's fov and wrote 75 would pass at 75.
    applyLookbookPose(cam, { ...HEARTH, fov: 50 });
    expect(cam.position.toArray()).toEqual([13, 81, 13]);
    const looking = cam.getWorldDirection(new Vector3());
    const wanted = new Vector3(0, 51, 0).sub(new Vector3(13, 81, 13)).normalize();
    expect(looking.dot(wanted), 'the camera does not look at the target').toBeGreaterThan(0.9999);
    const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    expect(Math.abs(right.y), 'the pinned view is rolled').toBeLessThan(1e-9);
    expect(cam.fov).toBe(50);
    // elements[5] of a perspective projection is 1 / tan(fov / 2): stale if updateProjectionMatrix was skipped.
    expect(cam.projectionMatrix.elements[5]).toBeCloseTo(1 / Math.tan(MathUtils.degToRad(50) / 2), 6);
  });

  it('the seam validates, defaults the fov to the game\'s 75, and clear() hands the camera back', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    expect(() => w.__craftyLookbook.pose({ position: [1, 2, NaN], lookAt: [0, 0, 0] })).toThrow(/position/);
    expect(() => w.__craftyLookbook.pose({ position: [1, 2, 3], lookAt: [0, 0] })).toThrow(/lookAt/);
    expect(lookbookPose(), 'a refused pose must leave nothing set').toBeNull();
    w.__craftyLookbook.pose(HEARTH);
    expect(lookbookPose()).toEqual({ position: [13, 81, 13], lookAt: [0, 51, 0], fov: 75 });
    w.__craftyLookbook.clear();
    expect(lookbookPose()).toBeNull();
  });

  it('pose() and info() hand back COPIES: writing NaN into what they return cannot reach the live pose (F3)', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    // fov 50, not the default 75: a copy that rebuilt the fov from the default would pass at 75.
    const expected = { position: [13, 81, 13], lookAt: [0, 51, 0], fov: 50 };
    // A copy that is empty or null would pass the mutation checks below, so first: what comes back IS the pose.
    const returned = w.__craftyLookbook.pose({ ...HEARTH, fov: 50 });
    expect(JSON.parse(JSON.stringify(returned)), 'pose() must return the pose it set').toEqual(expected);
    // Validation runs on the way IN (finite3); a returned live object is a way round it, one assignment from a NaN
    // camera that PositionTracker would then publish as playerPosition.
    returned.position[0] = NaN;
    returned.lookAt[1] = Infinity;
    returned.fov = NaN;
    expect(lookbookPose(), 'writing into the object pose() returned changed the live pose').toEqual(expected);
    const seen = w.__craftyLookbook.info().pose;
    expect(JSON.parse(JSON.stringify(seen)), 'info().pose must report the live pose').toEqual(expected);
    seen.position[2] = NaN;
    seen.lookAt[0] = NaN;
    seen.fov = NaN;
    expect(lookbookPose(), 'writing into info().pose changed the live pose').toEqual(expected);
    // With no pose, both report null rather than an empty shell.
    w.__craftyLookbook.clear();
    expect(w.__craftyLookbook.info().pose).toBeNull();
  });

  it('subscribers (the Player hiding its hands) hear every pose and clear', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    const seen = [];
    const off = subscribeLookbook(() => seen.push(lookbookPinned()));
    w.__craftyLookbook.pose(HEARTH);
    w.__craftyLookbook.clear();
    expect(seen).toEqual([true, false]);
    off();
    w.__craftyLookbook.pose(HEARTH);
    expect(seen.length, 'an unsubscribed listener still heard the pose').toBe(2);
  });
});

describe('the time of day: dawn-origin cycle fractions onto the real store', () => {
  it('the conversion: noon, dawn, midnight, dusk', () => {
    expect(timeOfDayForCycle(0.25)).toBeCloseTo(0.5, 12); // cycle noon -> setTimeOfDay noon (midnight-origin)
    expect(timeOfDayForCycle(0)).toBeCloseTo(0.25, 12); // dawn
    expect(timeOfDayForCycle(0.75)).toBeCloseTo(0, 12); // midnight
    expect(timeOfDayForCycle(0.5)).toBeCloseTo(0.75, 12); // dusk
  });

  it('setCycle lands each programme time within one game unit, with isDay right and no siege night counted', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    // The four programme times all land exactly on a game unit; 0.3001 does not, so it is what proves setCycle
    // reports where the store LANDED rather than echoing the request.
    const times = [0.30, 0.48, 0.55, 0.75, 0.3001, 0.30];
    for (const c of times) {
      const got = w.__craftyLookbook.setCycle(c);
      const s = useGameStore.getState();
      expect(Math.abs(cycleFraction(s.gameTime) - c), `asked for ${c}, the store sits at ${cycleFraction(s.gameTime)}`).toBeLessThanOrEqual(1 / CYCLE_UNITS);
      expect(got, 'setCycle must report the cycle it actually landed on').toBeCloseTo(cycleFraction(s.gameTime), 12);
      expect(s.isDay, `isDay at cycle ${c}`).toBe(c < 0.5);
    }
    expect(useGameStore.getState().nightCount, 'a time jump counted a siege night').toBe(0);
  });
});

describe('play() and info()', () => {
  it('play() makes the REAL input gate live; info() reads back what the probe records per shot', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    expect(getActiveSnapshot()).toBe(false);
    expect(w.__craftyLookbook.play()).toBe(true);
    expect(getActiveSnapshot(), 'play() did not flip the input gate').toBe(true);
    w.__craftyLookbook.setCycle(0.55);
    w.__craftyLookbook.pose(HEARTH);
    useGameStore.setState({ qualityTier: 'med', frameCap: 60, isSpawnChunkLoaded: true, isAlive: true });
    const info = w.__craftyLookbook.info();
    expect(info).toMatchObject({
      active: true, isDay: false, isAlive: true, tier: 'med', frameCap: 60, contextLosses: 0, gl: null, worldBuilt: true,
      pose: { position: [13, 81, 13], lookAt: [0, 51, 0], fov: 75 },
    });
    expect(info.cycle).toBeCloseTo(0.55, 2);
  });
});

// The compass bearing a direction faces, worked out from the direction alone (north is -Z, east +X), so the seam's
// matrix-element arithmetic is checked against geometry rather than against a copy of itself.
const compassOf = (dir) => ((Math.atan2(dir.x, -dir.z) * 180) / Math.PI + 360) % 360;
const forward = (cam) => cam.getWorldDirection(new Vector3());
const fakeBody = (at = { x: 0, y: 60, z: 0 }) => ({
  t: { ...at },
  v: { x: 1, y: -3, z: 0.5 },
  setTranslation(p) { this.t = { ...p }; },
  setLinvel(v) { this.v = { ...v }; },
  translation() { return this.t; },
});

describe('the eye level: stand() and look() frame what a player sees', () => {
  afterEach(() => useGameStore.setState({ gameCamera: null, playerRigidBodyRef: null }));

  it('yawForHeading faces the HUD compass bearing, and headingOf reads it back', () => {
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    cam.rotation.order = 'YXZ';
    for (const h of [0, 37, 90, 120, 180, 240, 300]) {
      cam.rotation.set(0, yawForHeading(h), 0);
      cam.updateMatrixWorld();
      expect(compassOf(forward(cam)), `yawForHeading(${h}) faces another bearing`).toBeCloseTo(h, 6);
      expect(headingOf(cam), `headingOf misreads a camera facing ${h}`).toBeCloseTo(h, 6);
    }
    cam.rotation.set(0, yawForHeading(90), 0);
    cam.updateMatrixWorld();
    expect(forward(cam).x, 'heading 90 must face east, +X').toBeCloseTo(1, 6);
  });

  it('look() turns the live game camera: the bearing the compass shows, the pitch, and no roll', () => {
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    useGameStore.setState({ gameCamera: cam });
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    expect(w.__craftyLookbook.look({ heading: 120, pitch: -10 }), 'look() must return the bearing it set').toBeCloseTo(120, 6);
    const f = forward(cam);
    expect(compassOf(f)).toBeCloseTo(120, 6);
    expect(f.y, 'pitch -10 must look down by 10 degrees').toBeCloseTo(Math.sin(MathUtils.degToRad(-10)), 6);
    const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    expect(Math.abs(right.y), 'the look is rolled').toBeLessThan(1e-9);
    const info = w.__craftyLookbook.info();
    expect(info.heading).toBeCloseTo(120, 6);
    expect(info.pitch).toBeCloseTo(-10, 6);
  });

  it('look() validates, refuses a pitch the Player would clamp away, and needs the camera', () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    expect(() => w.__craftyLookbook.look({ heading: 0 }), 'look() with no game camera').toThrow(/camera/);
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    useGameStore.setState({ gameCamera: cam });
    w.__craftyLookbook.look({ heading: 240 });
    expect(() => w.__craftyLookbook.look({ heading: NaN })).toThrow(/heading/);
    expect(() => w.__craftyLookbook.look({ heading: 10, pitch: 86 })).toThrow(/pitch/);
    expect(w.__craftyLookbook.look({ heading: 10, pitch: 85 })).toBeCloseTo(10, 6);
    w.__craftyLookbook.look({ heading: 240 });
    expect(() => w.__craftyLookbook.look({ heading: 10, pitch: '5' })).toThrow(/pitch/);
    expect(headingOf(cam), 'a refused look moved the camera').toBeCloseTo(240, 6);
  });

  it('stand() moves the player body and stops it; info() reports the body, the eye and what hangs off the camera', () => {
    const rb = fakeBody();
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    cam.position.set(3, 54.6, -4);
    const hands = new Object3D();
    cam.add(hands);
    useGameStore.setState({ gameCamera: cam, playerRigidBodyRef: { current: rb } });
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    expect(w.__craftyLookbook.stand({ position: [3, 52.5, -4] })).toEqual([3, 52.5, -4]);
    expect(rb.t).toEqual({ x: 3, y: 52.5, z: -4 });
    expect(rb.v, 'stand() left the body moving').toEqual({ x: 0, y: 0, z: 0 });
    expect(() => w.__craftyLookbook.stand({ position: [1, NaN, 0] })).toThrow(/position/);
    expect(rb.t, 'a refused stand moved the body').toEqual({ x: 3, y: 52.5, z: -4 });
    const info = w.__craftyLookbook.info();
    expect(info.body).toEqual([3, 52.5, -4]);
    expect(info.eye).toEqual([3, 54.6, -4]);
    expect(info.cameraNodes, 'the camera and the hands on it').toBe(2);
    cam.remove(hands);
    expect(w.__craftyLookbook.info().cameraNodes, 'the count must fall when the hands leave the camera').toBe(1);
    useGameStore.setState({ playerRigidBodyRef: null });
    expect(() => w.__craftyLookbook.stand({ position: [0, 60, 0] })).toThrow(/body/);
    expect(w.__craftyLookbook.info().body).toBeNull();
  });

  it('hostileReach: the nearest live hostile in 3D and the count within 8 m, ignoring the passive, NPCs and the dead', () => {
    const at = (x, y, z, more = {}) => ({ health: 50, passive: false, position: { x, y, z }, ...more });
    const entities = [
      null,
      at(0, 0, 0.5, { passive: true }),
      at(0.4, 0, 0, { isNPC: true }),
      at(0, 0.2, 0, { health: 0 }),
      { health: 50, passive: false },
      at(0, 2, 0),
      at(7.9, 0, 0),
      at(6, 0, 6.02),
    ];
    expect(hostileReach(entities, [0, 0, 0])).toEqual({ nearestM: 2, within8m: 2 });
    expect(hostileReach([], [0, 0, 0])).toEqual({ nearestM: null, within8m: 0 });
  });

  it('info() measures hostiles from the eye, and reports null when the build hands the seam no mob query', () => {
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    cam.position.set(0, 54, 0);
    useGameStore.setState({ gameCamera: cam, playerRigidBodyRef: { current: fakeBody({ x: 0, y: 52.8, z: 0 }) } });
    const zombie = { health: 100, passive: false, position: { x: 0, y: 54, z: 3 } };
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, { ...deps(), hostiles: () => [zombie] });
    expect(w.__craftyLookbook.info().hostiles, 'measured from the body, not the eye').toEqual({ nearestM: 3, within8m: 1 });
    _resetLookbookForTest();
    const bare = fakeWin('?lookbook=1');
    installLookbookSeam(bare, deps());
    expect(bare.__craftyLookbook.info().hostiles).toBeNull();
  });

  it('clearHostiles() removes the live hostiles within the radius of the eye from a real ECS world, and nothing else', () => {
    const world = new World();
    const mobs = world.with('isMob', 'position', 'type');
    const mob = (x, z, more = {}) => world.add({ isMob: true, type: 'zombie', health: 100, passive: false, position: { x, y: 54, z }, ...more });
    const near = [mob(1, 0), mob(0, 2), mob(-3, 0), mob(0, -11.5)];
    const keep = [mob(0, 12.5), mob(20, 0), mob(1, 1, { passive: true, type: 'cow' }), mob(0, -1, { isNPC: true }), mob(2, 2, { health: 0 })];
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    cam.position.set(0, 54, 0);
    useGameStore.setState({ gameCamera: cam });
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, { ...deps(), hostiles: () => mobs.entities, removeEntity: (e) => world.remove(e) });
    expect(w.__craftyLookbook.clearHostiles(), 'the default radius is 12 m').toBe(near.length);
    for (const e of near) expect(mobs.entities, `a hostile at ${e.position.x}, ${e.position.z} survived`).not.toContain(e);
    for (const e of keep) expect(mobs.entities, `${e.type} at ${e.position.x}, ${e.position.z} was removed`).toContain(e);
    expect(w.__craftyLookbook.clearHostiles({ radius: 25 }), 'the radius is honoured').toBe(2);
    expect(() => w.__craftyLookbook.clearHostiles({ radius: NaN })).toThrow(/radius/);
    useGameStore.setState({ gameCamera: null, playerRigidBodyRef: null });
    expect(() => w.__craftyLookbook.clearHostiles()).toThrow(/player/);
    _resetLookbookForTest();
    const bare = fakeWin('?lookbook=1');
    installLookbookSeam(bare, deps());
    expect(() => bare.__craftyLookbook.clearHostiles()).toThrow(/mob query/);
  });

  it('stand() and look() refuse while a pose is set, and work again after clear()', () => {
    const rb = fakeBody();
    const cam = new PerspectiveCamera(75, 1.6, 0.1, 500);
    useGameStore.setState({ gameCamera: cam, playerRigidBodyRef: { current: rb } });
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    w.__craftyLookbook.pose(HEARTH);
    expect(() => w.__craftyLookbook.look({ heading: 90 })).toThrow(/clear\(\) first/);
    expect(() => w.__craftyLookbook.stand({ position: [5, 52, 5] })).toThrow(/clear\(\) first/);
    expect(rb.t, 'a refused stand moved the body').toEqual({ x: 0, y: 60, z: 0 });
    w.__craftyLookbook.clear();
    expect(w.__craftyLookbook.look({ heading: 90 })).toBeCloseTo(90, 6);
    expect(w.__craftyLookbook.stand({ position: [5, 52, 5] })).toEqual([5, 52, 5]);
  });
});

describe('passTimes(): nothing is timed until a script asks', () => {
  it('without a loader it says so', async () => {
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, deps());
    const r = await w.__craftyLookbook.passTimes();
    expect(r.installed).toBe(false);
    expect(r.reason).toMatch(/no pass timer/);
  });

  it('loads the timer on the first call only, never at install, and hands back its report', async () => {
    let loads = 0;
    const w = fakeWin('?lookbook=1');
    installLookbookSeam(w, { ...deps(), loadPassTimer: async () => { loads += 1; return { installPassTimer }; } });
    try {
      expect(loads, 'installing the seam loaded the timer: the power A/B hold would pay for it in one arm').toBe(0);
      expect(await w.__craftyLookbook.passTimes()).toEqual({ installed: true, contexts: [] });
      expect(await w.__craftyLookbook.passTimes({ reset: true })).toEqual({ installed: true, contexts: [] });
      expect(loads, 'the timer was loaded more than once').toBe(1);
    } finally {
      installPassTimer().uninstall();
    }
  });
});

/** A WebGL 2 stand-in with the timer extension. A draw adds its cost to the TIME_ELAPSED query that is open, and
 *  opening a second one throws, as a real context raises INVALID_OPERATION. */
function fakeTimerGl({ ext = true } = {}) {
  const EXT = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  return {
    QUERY_RESULT: 0x8866,
    QUERY_RESULT_AVAILABLE: 0x8867,
    canvas: { width: 2560, height: 1600 },
    queries: [], open: null, disjoint: false, ready: true, begun: 0, drawnMs: 0,
    getExtension(name) { return ext && name === 'EXT_disjoint_timer_query_webgl2' ? EXT : null; },
    createQuery() { const q = { ns: 0 }; this.queries.push(q); return q; },
    beginQuery(target, q) {
      if (target !== EXT.TIME_ELAPSED_EXT) throw new Error(`beginQuery: unexpected target ${target}`);
      if (this.open) throw new Error('INVALID_OPERATION: a TIME_ELAPSED query is already open');
      q.ns = 0; this.open = q; this.begun += 1;
    },
    endQuery(target) {
      if (target !== EXT.TIME_ELAPSED_EXT || !this.open) throw new Error('INVALID_OPERATION: no query open');
      this.open = null;
    },
    draw(ms) { this.drawnMs += ms; if (this.open) this.open.ns += ms * 1e6; },
    getQueryParameter(q, pname) { return pname === this.QUERY_RESULT_AVAILABLE ? this.ready : q.ns; },
    getParameter(pname) { return pname === EXT.GPU_DISJOINT_EXT ? this.disjoint : null; },
  };
}
const segment = (t, gl, label, ms) => { t.begin(label); gl.draw(ms); t.end(); };
const msByLabel = (r) => r.passes.map(({ label, n, meanMs }) => ({ label, n, meanMs }));

describe('the pass timer (render/passTimer.js): GPU ms per segment, a no-op that says why where it cannot time', () => {
  it('is unavailable without the extension, on WebGL 1 and without a context, and then touches nothing', () => {
    const gl = fakeTimerGl({ ext: false });
    const t = createPassTimer(gl);
    expect(t.available).toBe(false);
    expect(t.reason).toMatch(/not exposed/);
    expect(t.begin('scene')).toBe(false);
    t.end();
    t.poll();
    expect(gl.queries.length, 'an unavailable timer created a query').toBe(0);
    expect(t.report()).toMatchObject({ available: false, passes: [] });
    expect(createPassTimer({ getExtension: () => ({}) }).reason).toMatch(/WebGL 1/);
    expect(createPassTimer(null).reason).toMatch(/no WebGL context/);
  });

  it('times back-to-back segments in milliseconds, read only once the GPU has answered', () => {
    const gl = fakeTimerGl();
    const t = createPassTimer(gl);
    expect(t.available).toBe(true);
    gl.ready = false;
    segment(t, gl, 'scene', 4);
    segment(t, gl, 'bloom', 0.5);
    t.poll();
    expect(t.report().passes, 'a result was read before the GPU said it was ready').toEqual([]);
    expect(t.report().pending).toBe(2);
    gl.ready = true;
    t.poll();
    expect(msByLabel(t.report())).toEqual([{ label: 'scene', n: 1, meanMs: 4 }, { label: 'bloom', n: 1, meanMs: 0.5 }]);
    expect(t.report().pending).toBe(0);
  });

  it('refuses to nest: a segment opened inside another is skipped and counted, never sent to the GPU', () => {
    const gl = fakeTimerGl();
    const t = createPassTimer(gl);
    expect(t.begin('outer')).toBe(true);
    expect(t.begin('inner')).toBe(false);
    t.end();
    t.end();
    expect(gl.begun).toBe(1);
    expect(t.report().skipped).toBe(1);
  });

  it('a disjoint event voids every result in flight; timing resumes after it', () => {
    const gl = fakeTimerGl();
    const t = createPassTimer(gl);
    segment(t, gl, 'scene', 4);
    gl.disjoint = true;
    t.poll();
    expect(t.report()).toMatchObject({ disjoint: 1, pending: 0, passes: [] });
    gl.disjoint = false;
    segment(t, gl, 'scene', 3);
    t.poll();
    expect(msByLabel(t.report())).toEqual([{ label: 'scene', n: 1, meanMs: 3 }]);
  });

  it('reports mean, median and max over the window; reset() also discards what was still in flight', () => {
    const gl = fakeTimerGl();
    const t = createPassTimer(gl);
    for (const ms of [1, 10, 2, 3]) segment(t, gl, 'pass', ms);
    t.poll();
    expect(t.report().passes).toEqual([{ label: 'pass', n: 4, meanMs: 4, p50Ms: 2, maxMs: 10, count: 4, sumMs: 16 }]);
    gl.ready = false;
    segment(t, gl, 'pass', 5);
    t.reset();
    gl.ready = true;
    t.poll();
    expect(t.report().passes, 'a segment from before reset() was counted after it').toEqual([]);
  });

  it('measures its window on the wall clock and sums every result in it, past the per-label sample cap', () => {
    const gl = fakeTimerGl();
    let clock = 1000;
    const t = createPassTimer(gl, () => clock);
    t.frame();
    segment(t, gl, 'pass', 7);
    t.poll(); // landed before the window
    t.frame();
    segment(t, gl, 'pass', 9); // in flight across the reset: not part of the window either
    clock = 2000;
    t.reset();
    const frames = 300; // more than the 240 results a label keeps for its mean and median
    for (let i = 0; i < frames; i++) {
      t.frame();
      segment(t, gl, 'scene', 2);
      segment(t, gl, 'pass', 0.5);
      clock += 16;
      t.poll();
    }
    const r = t.report();
    expect(r, 'the window is not the wall time since reset(), or frames are counted per segment').toMatchObject({ frames, framesTimed: frames, windowMs: frames * 16 });
    expect(r.passes).toEqual([
      { label: 'scene', n: 240, meanMs: 2, p50Ms: 2, maxMs: 2, count: frames, sumMs: 600 },
      { label: 'pass', n: 240, meanMs: 0.5, p50Ms: 0.5, maxMs: 0.5, count: frames, sumMs: 150 },
    ]);
  });
});

describe('the pass timer through the real EffectComposer.prototype.render', () => {
  /** A composer with the real render loop over: a scene pass, n8ao's unnamed pass, and a real EffectPass. The fake
   *  renderer calls the scene hooks around a draw, as WebGLRenderer.render does. */
  function rig(gl) {
    const renderer = {
      getContext: () => gl,
      setRenderTarget() {},
      render(scene, camera) {
        scene.onBeforeRender(renderer, scene, camera);
        gl.draw(scene.userData.ms ?? 0);
        scene.onAfterRender(renderer, scene, camera);
      },
    };
    const vignette = new VignetteEffect();
    vignette.update = () => gl.draw(0.25);
    const fx = new EffectPass(new PerspectiveCamera(), vignette, new ToneMappingEffect());
    fx.scene.userData.ms = 0.75;
    const composer = Object.create(EffectComposer.prototype);
    Object.assign(composer, {
      renderer,
      passes: [
        { name: 'RenderPass', enabled: true, needsSwap: false, needsDepthBlit: true, render: () => gl.draw(4) },
        { name: 'Pass', configuration: { aoRadius: 1.2 }, enabled: true, needsSwap: true, render: () => gl.draw(1.5) },
        fx,
      ],
      inputBuffer: { texture: {} },
      outputBuffer: { texture: {} },
      copyPass: null,
      depthRenderTarget: {},
      blitDepthBuffer: () => gl.draw(0.125),
    });
    return composer;
  }

  it('times every pass once per frame, an EffectPass as its effects\' updates plus its merged draw, never nested', () => {
    const original = EffectComposer.prototype.render;
    const gl = fakeTimerGl();
    const composer = rig(gl);
    const handle = installPassTimer();
    try {
      // 60 frames of 6 segments is more than the timer keeps in flight, so results must be read as frames go.
      const frames = 60;
      for (let i = 0; i < frames; i++) composer.render(0.016);
      const [ctx, ...others] = handle.report().contexts;
      expect(others).toEqual([]);
      expect(ctx).toMatchObject({ canvas: [2560, 1600], available: true, frames, skipped: 0, disjoint: 0, dropped: 0 });
      const fx = '2:EffectPass(VignetteEffect+ToneMappingEffect)';
      expect(msByLabel(ctx)).toEqual([
        { label: '0:RenderPass', n: frames, meanMs: 4 },
        { label: 'depth blit', n: frames, meanMs: 0.125 },
        { label: '1:N8AO', n: frames, meanMs: 1.5 },
        { label: `${fx} > VignetteEffect.update`, n: frames, meanMs: 0.25 },
        { label: `${fx} > ToneMappingEffect.update`, n: frames, meanMs: 0 },
        { label: `${fx} > draw`, n: frames, meanMs: 0.75 },
      ]);
      expect(handle.report({ reset: true }).contexts[0].passes.length).toBe(6);
      expect(handle.report().contexts[0].passes, 'reset did not start a fresh window').toEqual([]);
    } finally {
      handle.uninstall();
    }
    expect(EffectComposer.prototype.render, 'uninstall() did not restore the composer').toBe(original);
  });

  it('an EffectPass rebuilt over the same effects (sunrise, sunset) is timed once under its new label, never nested', () => {
    const gl = fakeTimerGl();
    const composer = rig(gl);
    const handle = installPassTimer();
    // @react-three/postprocessing builds a new EffectPass over the SAME effect instances whenever the composer's children
    // change, as GameScene's GodRays mount does when the sun crosses the horizon.
    const rebuild = (...effects) => {
      const pass = new EffectPass(new PerspectiveCamera(), ...effects);
      pass.scene.userData.ms = 0.75;
      composer.passes[2] = pass;
    };
    try {
      for (let i = 0; i < 10; i++) composer.render(0.016);
      const [vignette, toneMapping] = composer.passes[2].effects;
      rebuild(vignette, toneMapping);
      handle.report({ reset: true });
      const frames = 10;
      for (let i = 0; i < frames; i++) composer.render(0.016);
      const ctx = handle.report({ reset: true }).contexts[0];
      expect(ctx, 'the rebuilt pass re-wrapped its effects: every update opened a segment inside another').toMatchObject({ frames, skipped: 0 });
      const fx = '2:EffectPass(VignetteEffect+ToneMappingEffect)';
      expect(msByLabel(ctx).filter((p) => p.label.startsWith('2:'))).toEqual([
        { label: `${fx} > VignetteEffect.update`, n: frames, meanMs: 0.25 },
        { label: `${fx} > ToneMappingEffect.update`, n: frames, meanMs: 0 },
        { label: `${fx} > draw`, n: frames, meanMs: 0.75 },
      ]);
      // A second rebuild with a different set (the sun sets again): the labels follow the pass now on the composer.
      rebuild(vignette);
      for (let i = 0; i < frames; i++) composer.render(0.016);
      const later = handle.report().contexts[0];
      expect(later.skipped, 'a second rebuild nested the wrappers again').toBe(0);
      expect(msByLabel(later).filter((p) => p.label.startsWith('2:'))).toEqual([
        { label: '2:EffectPass(VignetteEffect) > VignetteEffect.update', n: frames, meanMs: 0.25 },
        { label: '2:EffectPass(VignetteEffect) > draw', n: frames, meanMs: 0.75 },
      ]);
    } finally {
      handle.uninstall();
    }
  });

  it('where the extension is absent the composer still renders and the report says why', () => {
    const gl = fakeTimerGl({ ext: false });
    const composer = rig(gl);
    const handle = installPassTimer();
    try {
      composer.render(0.016);
      expect(gl.drawnMs, 'the frame was not rendered').toBeCloseTo(4 + 0.125 + 1.5 + 0.25 + 0.75, 9);
      expect(gl.queries.length).toBe(0);
      expect(handle.report().contexts[0]).toMatchObject({ available: false, reason: expect.stringMatching(/not exposed/), passes: [] });
    } finally {
      handle.uninstall();
    }
  });
});
