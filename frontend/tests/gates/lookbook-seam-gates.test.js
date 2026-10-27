import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { PerspectiveCamera, Vector3, MathUtils } from 'three';
import {
  parseLookbookParam,
  timeOfDayForCycle,
  installLookbookSeam,
  lookbookPose,
  applyLookbookPose,
  subscribeLookbook,
  lookbookPinned,
  _resetLookbookForTest,
} from '../../src/render/lookbookSeam.js';
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
 * Mutation-Proof: via scripts/dev/mutate.sh, 8 tests, each observed RED unless stated:
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
 *   I0 identity (a comment edit in lookbookSeam.js) SURVIVED, twice.
 *
 * BLIND SPOT: that Components.jsx's Player useFrame applies the pose to the LIVE camera (and stops applying it on
 * clear), that the hands really hide, and that index.jsx installs the seam, are the e2e's
 * (tests/e2e/lookbook-seam.spec.js). The probe's own logic is tests/gates/lookbook-plan-gates.test.js.
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
    expect(Object.keys(open.__craftyLookbook).sort()).toEqual(['clear', 'info', 'play', 'pose', 'setCycle']);
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
