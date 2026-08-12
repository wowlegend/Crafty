// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// EVERY CAPTURE-GATED ANIMATION RESETS TO A DECLARED POSE. IT DOES NOT MERELY STOP.
//
// `if (isCaptureMode()) return;` freezes an animation WHEREVER IT HAD GOT TO. The harness enables
// capture only after the page has booted (capture.mjs calls enterCapture once __craftyTest.ready()
// resolves), and boot takes a different length of time in every process — so the frozen phase is
// RUN-DEPENDENT and the capture faithfully locks it in.
//
// MEASURED 2026-08-09, and this is why the gate exists rather than a comment:
//   - the diorama canvas exists BEFORE enterCapture fires in 3/3 probe runs, so it really does animate;
//   - the un-frozen window is 1682 / 7292 / 9975 / 10391 / 10431 ms across runs — a 6.2x spread;
//   - pairwise menu diff TRACKS pairwise window gap, Pearson r = 0.842 over 10 pairs;
//   - floor 0.155% at a 40ms window gap, rising to 0.59-0.84% at 8.3-8.7s gaps.
// So the freeze phase IS the menu residual, and the observed 0.36-0.98% range was a SAMPLE, not a
// ceiling: nothing bounds two runs that freeze far apart in phase.
//
// DriftCamera was fixed for this in 04148c8. The mascot idle and the mote ring were not, and they live
// in the same canvas. This gate covers the general rule, not the one instance.
//
// WHY "DECLARED VALUES" AND NOT t=0. The gems are the reason. Their JSX declares intensity 8.5 / 11 and
// the idle multiplies by `pulse = 0.82 + sin(t*2.4)*0.18`, whose PEAK is 1.0 — so the declared value is
// the pulse PEAK, not the t=0 value (0.82 -> 6.97 / 9.02). Resetting to t=0 would dim both gems and
// force a re-baseline of `title-mascot` as well as `menu`. Resetting to the DECLARED values leaves
// `title-mascot` byte-identical, because in MascotStudio the mascot mounts with capture ALREADY on, so
// its useFrame returns on frame 1 and the JSX values stand untouched. That is exactly why title-mascot
// measures 0.0000% run-to-run today while menu measures 0.455%.
//
// BEHAVIOURAL, not a source grep: the coupling test RENDERS the mascot and reads the intensity props
// the primitives actually receive, so a JSX edit that drifts from the pure seam still fails.
let captureOn = true;
const emissiveIntensities = [];

vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  useFrame: () => {},
}));
vi.mock('../../src/devtest/captureMode', () => ({ isCaptureMode: () => captureOn }));
vi.mock('../../src/render/mascots/voxelKit', () => ({
  Cube: () => null,
  Ink: () => null,
  Emissive: (props) => {
    emissiveIntensities.push(props.intensity);
    return null;
  },
}));

const { MascotCraftyHero, mascotIdlePose, MASCOT_REST } =
  await import('../../src/render/mascots/MascotCraftyHero.jsx');
const { dioramaMoteSpin, dioramaMotePositions, MOTE_COUNT } = await import('../../src/render/TitleDiorama.jsx');

describe('capture determinism: the mascot idle RESETS to its declared pose', () => {
  it('returns the same pose for any clock value in capture mode', () => {
    const a = mascotIdlePose(true, 0);
    expect(mascotIdlePose(true, 3.7), 'capture pose varied with the clock').toEqual(a);
    expect(mascotIdlePose(true, 41.2)).toEqual(a);
    expect(mascotIdlePose(true, 9876.5)).toEqual(a);
  });

  it('the capture pose IS the declared rest pose', () => {
    expect(mascotIdlePose(true, 12.3)).toEqual({ ...MASCOT_REST });
  });

  it('still animates in normal play — the fix must not freeze the mascot for real players', () => {
    expect(mascotIdlePose(false, 1.1)).not.toEqual(mascotIdlePose(false, 2.9));
    expect(mascotIdlePose(false, 1.1).gemIntensity).not.toBe(mascotIdlePose(false, 2.9).gemIntensity);
  });

  it('body and hat rest at the animation CENTRE, so entering capture is not a visual jump', () => {
    // sin(0) = 0 for both, so t=0 is the neutral pose for these two channels.
    expect(mascotIdlePose(false, 0).bodyY).toBeCloseTo(MASCOT_REST.bodyY, 10);
    expect(mascotIdlePose(false, 0).hatTipZ).toBeCloseTo(MASCOT_REST.hatTipZ, 10);
  });

  it('the gems rest at the pulse PEAK, which is NOT the t=0 value', () => {
    // The distinction the whole fix turns on. If these ever became equal, "declared values" and "t=0"
    // would collapse into the same thing and the reason for choosing one would be lost.
    expect(mascotIdlePose(false, 0).gemIntensity).toBeLessThan(MASCOT_REST.gemIntensity);
    const peak = Math.max(
      ...Array.from({ length: 2000 }, (_, i) => mascotIdlePose(false, i / 100).gemIntensity)
    );
    expect(peak).toBeCloseTo(MASCOT_REST.gemIntensity, 2);
  });

  it('the JSX declares the same intensities the rest pose claims', () => {
    // Coupling guard: the pure seam and the markup must not drift apart. Same reason CAPTURE_CAM is
    // shared with the <Canvas camera> prop instead of being written twice.
    emissiveIntensities.length = 0;
    captureOn = true;
    render(<MascotCraftyHero />);
    expect(emissiveIntensities.length, 'the mascot never rendered — the voxelKit mock is wrong')
      .toBeGreaterThan(0);
    expect(emissiveIntensities, 'gem intensity in JSX does not match MASCOT_REST')
      .toContain(MASCOT_REST.gemIntensity);
    expect(emissiveIntensities, 'gem-core intensity in JSX does not match MASCOT_REST')
      .toContain(MASCOT_REST.gemCoreIntensity);
  });
});

describe('capture determinism: the diorama mote ring RESETS to zero rotation', () => {
  it('is exactly 0 in capture, whatever the clock says', () => {
    expect(dioramaMoteSpin(true, 0)).toBe(0);
    expect(dioramaMoteSpin(true, 12.5)).toBe(0);
    expect(dioramaMoteSpin(true, 4321.9)).toBe(0);
  });

  it('still spins in normal play', () => {
    expect(dioramaMoteSpin(false, 10)).not.toBe(0);
    expect(dioramaMoteSpin(false, 10)).not.toBe(dioramaMoteSpin(false, 25));
  });

  it('zero is the spin ORIGIN, so entering capture is not a visual jump', () => {
    expect(dioramaMoteSpin(false, 0)).toBe(0);
  });

  // ABSORBED FROM tests/render/title-diorama-gates.test.js, deleted 2026-08-12.
  //
  // That file made three claims by source-grep: that TitleDiorama contains `Canvas`, that it mentions
  // `isCaptureMode`, and that it matches /LightMotes|motes/i — which the word "motes" in its own COMMENT
  // satisfies. The first two are already covered far more strongly by suites that RENDER the component
  // (capture-dpr-gates reads the dpr prop the Canvas actually receives) and that drive the capture
  // branch (the three blocks above, plus titleCameraPose). Only the mote FIELD itself had nothing
  // behavioural behind it, so it gets a real assertion here rather than a grep somewhere else.
  it('the mote field is a fixed, deterministic ring — no randomness anywhere in it', () => {
    const a = dioramaMotePositions();
    const b = dioramaMotePositions();
    expect(a).toHaveLength(MOTE_COUNT);
    expect(MOTE_COUNT, 'the field emptied out — the menu frame loses its motes entirely').toBeGreaterThan(0);
    expect(a, 'the mote layout differs between two calls — a Math.random crept in and the menu frame can never be byte-stable').toEqual(b);
  });

  it('the motes are distinct and inside the diorama box, not stacked at the origin', () => {
    // The grass-mote layer once rendered at the world origin instead of with its chunk (869f71e), which
    // compiled, gated green, and was invisible. A position list that is all-zeros or all-identical is the
    // same defect, and "the file mentions motes" cannot see either.
    // The extent is a SQUARE of half-width 6, not a circle of radius 6: x and z sweep at different
    // rates (sin(i*2.4) against cos(i*1.7)), so the ring is a Lissajous figure and the corner reaches
    // 6*sqrt(2). Asserting a radius of 6 here failed on a real mote at 8.33 — bounding each AXIS is
    // what the layout actually promises.
    const p = dioramaMotePositions();
    const unique = new Set(p.map((v) => v.join(',')));
    expect(unique.size, 'the motes are stacked on top of each other').toBe(p.length);
    for (const [x, y, z] of p) {
      for (const v of [x, y, z]) expect(Number.isFinite(v), `a mote is at a non-finite coordinate: ${x},${y},${z}`).toBe(true);
      expect(Math.abs(x), 'a mote sits outside the diorama box on X').toBeLessThanOrEqual(6.001);
      expect(Math.abs(z), 'a mote sits outside the diorama box on Z').toBeLessThanOrEqual(6.001);
      expect(y, 'a mote is below the plinth').toBeGreaterThan(0);
    }
    // And the field genuinely SPREADS — a layout collapsed near the origin passes every bound above.
    expect(Math.max(...p.map(([x, , z]) => Math.hypot(x, z))), 'the ring collapsed toward the origin').toBeGreaterThan(4);
  });
});
