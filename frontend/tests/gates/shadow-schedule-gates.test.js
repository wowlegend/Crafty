import { describe, it, expect } from 'vitest';
import {
  createShadowSchedule, shadowDue, SHADOW_MAX_HZ, SUN_STEP_DEG, markShadowWorldChanged, shadowWorldEpoch,
} from '../../src/render/shadowSchedule.js';
import { resetShadowForConfig } from '../../src/render/shadowReset.js';
import { sunArcDirection, MOOD_SCALARS } from '../../src/render/mood.js';
import { DAY_LENGTH_SECONDS } from '../../src/game/dayNight.js';

/**
 * THE SUN'S SHADOW RE-RENDERS ON DEMAND, NEVER ABOVE 30 Hz (plan 2026-10-27-crafty-steady-cool, item h; refute F2).
 *
 * The directional light's 2048^2 shadow map (high) re-rendered every frame — every terrain chunk and every caster drawn
 * again into it, 60 or 120 times a second, standing still or not. three r172 skips a light whose
 * `shadow.autoUpdate === false && shadow.needsUpdate === false` (WebGLShadowMap.js:110), so Atmosphere now sets
 * needsUpdate only when this schedule says a render is due:
 *   - IMMEDIATELY when the world's meshes changed (a chunk mounted, remeshed or left — a placed block must cast within
 *     two frames), and on a tier change (shadowReset forces it itself);
 *   - otherwise when the sun has turned SUN_STEP_DEG (0.5 deg) since the LAST RENDER, the snapped frustum centre moved,
 *     or a dynamic caster is present — and never more than SHADOW_MAX_HZ (30) times a second.
 * F2: the sun's steps alone are about 723 renders a cycle (measured below with the real arc, not the refute's estimate),
 * so their rate follows the day length. HONESTLY: the player's own hands, the loaded square's mobs and villagers are a dynamic caster almost all the
 * time, so in play the saving is the 30 Hz cap (half the shadow renders at 60 fps); the static path pays off only when
 * nothing moves.
 * BLIND SPOT: the dynamic-caster SIGNAL (camera moved, ECS mobs/allies/loot, boss, beast, phantom) is Atmosphere's and is
 * not driven here; the e2e for it is not written in this lane (see the plan's open items).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/shadowSchedule.js and src/render/shadowReset.js, receipts in the
 * commit:
 *   S1 no rate cap                                                  -> RED expected (the 30 Hz case)
 *   S2 plausible-wrong: the sun step measured frame to frame          -> RED expected (slow drift never renders)
 *   S3 plausible-wrong: a world change waits for the rate cap         -> RED expected (the two-frame case)
 *   S4 the sun step ignored                                          -> RED expected (the static-scene sun case)
 *   S5 the centre check ignored                                      -> RED expected (the centre case)
 *   S6 shadowReset no longer forces an update                        -> RED expected
 *   S0 identity (a comment edit)                                     -> must SURVIVE
 */
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const SUN = unit([-55, 48, -52]);
// A great circle through SUN, so `deg` is the true angle turned (a rotation about Y moves an elevated sun by less).
const PERP = unit([SUN[2], 0, -SUN[0]]); // horizontal, perpendicular to SUN
const alongArc = (deg) => {
  const a = (deg * Math.PI) / 180;
  return SUN.map((x, i) => x * Math.cos(a) + PERP[i] * Math.sin(a));
};
const frame = (o) => ({ now: 0, sunDir: SUN, centre: { x: 0, z: 0 }, worldEpoch: 0, dynamic: false, ...o });

describe('shadowDue', () => {
  it('the first frame renders; a still, empty scene then renders nothing for 10 s', () => {
    const s = createShadowSchedule();
    expect(shadowDue(s, frame({ now: 0 }))).toBe(true);
    let renders = 0;
    for (let t = 16.67; t < 10000; t += 16.67) if (shadowDue(s, frame({ now: t }))) renders += 1;
    expect(renders, 'a static scene kept re-rendering its shadow').toBe(0);
  });

  it('dynamic casters re-render at most 30 times a second at 60 fps', () => {
    expect(SHADOW_MAX_HZ).toBe(30);
    const s = createShadowSchedule();
    let renders = 0;
    for (let i = 0; i < 60; i++) if (shadowDue(s, frame({ now: (i * 1000) / 60, dynamic: true }))) renders += 1; // 60 frames = 1 s
    expect(renders, `dynamic casters rendered the shadow ${renders} times in 1 s`).toBeLessThanOrEqual(30);
    expect(renders, 'the cap starved the shadow').toBeGreaterThanOrEqual(29);
  });

  it('the sun step is measured from the LAST RENDER, so a slow drift still renders every 0.5 deg', () => {
    expect(SUN_STEP_DEG).toBe(0.5);
    const s = createShadowSchedule();
    shadowDue(s, frame({ now: 0 }));
    const fired = [];
    for (let i = 1; i <= 12; i++) {
      if (shadowDue(s, frame({ now: i * 100, sunDir: alongArc(i * 0.11) }))) fired.push(i);
    }
    expect(fired, 'a 0.11 deg-per-frame drift rendered at the wrong steps').toEqual([5, 10]);
  });

  it('a moved frustum centre renders (within the cap)', () => {
    const s = createShadowSchedule();
    shadowDue(s, frame({ now: 0 }));
    expect(shadowDue(s, frame({ now: 10, centre: { x: 0.07, z: 0 } })), 'inside the 30 Hz window').toBe(false);
    expect(shadowDue(s, frame({ now: 40, centre: { x: 0.07, z: 0 } }))).toBe(true);
  });

  it('a world change renders IMMEDIATELY, even inside the 30 Hz window (a placed block shows within two frames)', () => {
    const s = createShadowSchedule();
    shadowDue(s, frame({ now: 0, dynamic: true }));
    expect(shadowDue(s, frame({ now: 16.67, dynamic: true, worldEpoch: 1 }))).toBe(true);
    expect(shadowDue(s, frame({ now: 33.3, dynamic: false, worldEpoch: 1 })), 'the same epoch rendered twice').toBe(false);
  });

  it('the world epoch is bumped by the chunk meshes (markShadowWorldChanged)', () => {
    const e0 = shadowWorldEpoch();
    markShadowWorldChanged();
    expect(shadowWorldEpoch()).toBe(e0 + 1);
  });

  it("with nothing moving, the REAL sun arc's 0.5 deg steps over the game's day are under 2 renders a second", () => {
    const noon = MOOD_SCALARS.explore.sunPos;
    const s = createShadowSchedule();
    let renders = 0;
    const FPS = 60, CYCLE_S = DAY_LENGTH_SECONDS;
    for (let i = 0; i < CYCLE_S * FPS; i++) {
      const now = (i * 1000) / FPS;
      if (shadowDue(s, frame({ now, sunDir: unit(sunArcDirection(noon, i / (CYCLE_S * FPS))) }))) renders += 1;
    }
    const hz = renders / CYCLE_S;
    console.log(`[shadow-schedule] ${renders} sun-step renders over a ${CYCLE_S} s day: ${hz.toFixed(2)} Hz`);
    expect(renders, 'renders per cycle (the step, not the day length, sets this)').toBeGreaterThan(650);
    expect(renders, 'renders per cycle (the step, not the day length, sets this)').toBeLessThan(800);
    expect(hz, `${renders} renders over a ${CYCLE_S} s day`).toBeLessThan(2);
  });
});

describe('a tier change still forces a render', () => {
  it('resetShadowForConfig drops the map AND asks for a render (autoUpdate is off now)', () => {
    let disposed = 0;
    const shadow = { map: { dispose: () => { disposed += 1; } }, camera: { updateProjectionMatrix() {} }, autoUpdate: false, needsUpdate: false };
    resetShadowForConfig(shadow);
    expect(disposed).toBe(1);
    expect(shadow.map).toBeNull();
    expect(shadow.needsUpdate, 'a tier change left the new map unrendered').toBe(true);
  });
});
