// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE SKY RAMPS, IT DOES NOT STEP (review of the light-colour lane, 2026-10-27, HIGH).
 *
 * The game clock is a 1 Hz setInterval (game/useDayNightClock.js: +4 units a second). <Atmosphere> rendered the colour
 * script and the key light straight from it, so in play the whole sky stepped once a second: at dawn and dusk, where the
 * key ramps from 0 to full in about 2.9 s, the light, the exposure and every colour jumped three times. The plan's
 * "a ramp, not a pop" was true of the pure key-light model and false in the running game. render/skyClock.js follows
 * the game clock every frame; Atmosphere renders from it (capture still renders its declared fraction).
 *
 * Two halves, because the property crosses a seam (gates-and-probes 4c):
 *   followSkyClock    the pure rule: between ticks it moves at the clock's own rate, never past it; a jump snaps.
 *   Atmosphere        the REAL useFrame, mounted through R3F's own reconciler (tests/gates/_r3f.jsx), stepped frame by
 *                     frame at dawn with the store's clock advanced by the ticker's own action. Two consecutive frames
 *                     inside one game-second must publish a different key and exposure, on the frame AND on the live
 *                     light; no one frame may carry the tick's whole change; one second later the sky has caught up.
 *
 * DENOMINATORS: 60 frames after the tick (asserted), 6 clock-rule cases.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 2026-10-27 — receipts in the commit:
 *   SC1 Atmosphere renders liveCycle(st.gameTime), the stepped value (the shipped defect) -> wiring RED
 *   SC2 followSkyClock always snaps to the game clock                                    -> rule + wiring RED
 *   SC3 followSkyClock never clamps at the game clock (runs past a paused clock)         -> rule RED
 *   SC4 a backwards step (setTimeOfDay, a load) pans back instead of cutting             -> rule RED
 *   SC5 the follow rate x60 (a few frames close the tick)                                -> rule + wiring RED
 *   SC6 no catch-up: the base rate however far behind                                    -> rule RED (it SURVIVED the
 *       first draft, whose "greater than the base rate" the base rate itself passed on float noise)
 *   SC7 SKY_CLOCK_SNAP under one tick (every tick a cut)                                 -> rule + wiring RED
 *   SC0 identity (a comment edit in skyClock.js)                                         -> SURVIVED
 *   (A first draft also snapped on `gap < 0` explicitly; deleting that SURVIVED, because the clamp to the game clock
 *   already lands a backwards step at once. The redundant branch was deleted, and SC4 is the plausible-wrong version.)
 *
 * BLIND SPOT: nothing is drawn. Whether the running game's light ramps on screen is the e2e's
 * (tests/e2e/light-script.spec.js, the dawn read: the live light's intensity between frames inside one game-second).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { Atmosphere } = await import('../../src/render/Atmosphere.jsx');
const { followSkyClock, makeSkyClock, SKY_CLOCK_SNAP } = await import('../../src/render/skyClock.js');
const { moodRef, skyFrameRef, sampleMood } = await import('../../src/render/mood.js');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { GAME_UNITS_PER_SECOND } = await import('../../src/game/dayNight.js');
const { cycleFraction } = await import('../../src/game/dayPhase.js');
const { exitCaptureMode } = await import('../../src/devtest/captureMode.js');
const { TIERS } = await import('../../src/render/quality.js');

const UPS = GAME_UNITS_PER_SECOND;

describe('followSkyClock: the sky follows the 1 Hz game clock every frame', () => {
  it('between two ticks it moves at the clock\'s own rate, and never past the game clock', () => {
    const c = makeSkyClock();
    expect(followSkyClock(c, 100, 1 / 60)).toBe(100); // first frame: nothing to follow from, so it takes the clock
    expect(followSkyClock(c, 104, 0.25)).toBeCloseTo(101, 9); // a tick: a quarter second later the sky is 1 unit on
    expect(followSkyClock(c, 104, 0.25)).toBeCloseTo(102, 9);
    expect(followSkyClock(c, 104, 0.75)).toBe(104); // caught up, and clamped there
    expect(followSkyClock(c, 104, 5)).toBe(104); // a paused clock is held, never extrapolated past
  });

  it('more than one tick behind, it catches up faster than real time (the lag stays about one tick)', () => {
    const c = makeSkyClock();
    followSkyClock(c, 100, 0);
    const t = followSkyClock(c, 100 + 1.5 * UPS, 0.1); // a tick and a half behind
    // At the base rate it would move 0.1 s x UPS; at the gap's rate, 1.5 times that. (A bare "greater than the base
    // rate" let the base rate itself through on float noise: 100.4 - 100 = 0.40000000000000568.)
    expect(t - 100, 'it moved at the base rate, so a run of early ticks would let the lag grow').toBeGreaterThanOrEqual(1.4 * 0.1 * UPS);
  });

  it('a jump is a cut: a step backwards or wider than SKY_CLOCK_SNAP snaps (setTimeOfDay, a save load)', () => {
    const c = makeSkyClock();
    followSkyClock(c, 500, 0);
    expect(followSkyClock(c, 300, 1 / 60)).toBe(300); // backwards
    expect(followSkyClock(c, 300 + SKY_CLOCK_SNAP + 1, 1 / 60)).toBe(300 + SKY_CLOCK_SNAP + 1); // a forward jump
    expect(SKY_CLOCK_SNAP).toBeGreaterThan(UPS); // one tick is followed, never snapped
  });

  it('a corrupt clock passes through (liveCycle maps it to noon) and the next finite time snaps', () => {
    const c = makeSkyClock();
    followSkyClock(c, 100, 0);
    expect(Number.isNaN(followSkyClock(c, NaN, 1 / 60))).toBe(true);
    expect(followSkyClock(c, 104, 1 / 60)).toBe(104);
  });
});

describe('Atmosphere renders the sky clock: two frames inside one game-second publish different light (dawn)', () => {
  const shadowConfig = { mapSize: [TIERS.low.shadowMapSize, TIERS.low.shadowMapSize], extent: 40, camera: { left: -40, right: 40, top: 40, bottom: -40, near: 0.1, far: 400 } };
  let r = null;
  beforeEach(() => {
    exitCaptureMode();
    moodRef.current = 0;
    // Dawn: the clock's own origin (cycleFraction 0), where the key ramps from 0 at the horizon.
    useGameStore.setState({ gameTime: 0, isDay: true, weatherMoodBoost: 0, dangerLevel: 0, playerPosition: { x: 0, y: 60, z: 0 }, captureStudio: false });
  });
  afterEach(async () => { if (r) await r.unmount(); r = null; });

  const keyLight = (scene) => {
    let k = null;
    scene.traverse((o) => { if (o.isDirectionalLight) k = o; });
    return k;
  };

  it('a ramp, not a pop: every frame after the tick moves the key and the exposure, none carries the tick', async () => {
    r = await mountR3F(<Atmosphere shadowConfig={shadowConfig} />);
    await r.step(1); // the first frame takes the clock: gameTime 0
    const light = keyLight(r.three().scene);
    expect(light, 'SETUP: Atmosphere mounted no directional light').not.toBeNull();
    const at0 = { key: skyFrameRef.current.keyIntensity, exposure: skyFrameRef.current.exposure, live: light.intensity };

    useGameStore.getState().setGameTime((t) => t + UPS); // the ticker's own action: one game-second
    const want = sampleMood(0, cycleFraction(UPS)); // the frame the stepped sky would have jumped to at once
    const at1 = { key: want.keyIntensity, exposure: want.exposure };
    expect(Math.abs(at1.key - at0.key), 'SETUP: the key does not move over this tick, so nothing below can see a step').toBeGreaterThan(0.05);

    const keys = [], exps = [], lives = [];
    for (let i = 0; i < 60; i++) {
      await r.step(1, 1 / 60);
      expect(useGameStore.getState().gameTime, 'SETUP: the store clock moved under the test').toBe(UPS);
      keys.push(skyFrameRef.current.keyIntensity); exps.push(skyFrameRef.current.exposure); lives.push(light.intensity);
    }
    expect(keys.length).toBe(60);

    // Two consecutive frames inside ONE game-second (the store says gameTime 4 for both) publish different light.
    const where = `key ${at0.key.toFixed(4)} -> frames ${keys.slice(0, 3).map((k) => k.toFixed(4)).join(', ')} (the tick's target ${at1.key.toFixed(4)})`;
    expect(keys[1], `the published key did not move between two frames of one game-second: ${where}`).not.toBe(keys[0]);
    expect(exps[1], 'the published exposure did not move between two frames of one game-second').not.toBe(exps[0]);
    expect(lives[1], 'the LIVE light did not move between two frames of one game-second').not.toBe(lives[0]);

    // No one frame carries the tick's change: the largest per-frame step is a small part of the whole.
    const all = [at0.key, ...keys];
    const steps = all.slice(1).map((k, i) => Math.abs(k - all[i]));
    const whole = Math.abs(at1.key - at0.key);
    expect(Math.max(...steps), `one frame carried ${(Math.max(...steps) / whole * 100).toFixed(0)}% of the tick: ${where}`).toBeLessThanOrEqual(whole / 10);

    // One second on, the sky has reached the game clock (the lag is at most one tick).
    expect(keys[59], 'the sky never caught up with the game clock').toBeCloseTo(at1.key, 9);
    expect(exps[59]).toBeCloseTo(at1.exposure, 9);
    expect(lives[59]).toBeCloseTo(at1.key, 9);
  });
});
