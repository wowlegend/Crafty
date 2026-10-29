import { describe, it, expect } from 'vitest';
import {
  LOOKBOOK_CYCLES,
  LOOKBOOK_PLACES,
  TARGETS,
  CHROMIUM_CANDIDATES,
  EYE_HEADINGS,
  EYE_PITCH,
  OBSTRUCTION_M,
  WALK_MS,
  MIN_WALK_M,
  shotPlan,
  eyeShotPlan,
  clipPlan,
  classifyRenderer,
  pickCandidate,
  shotVerdict,
  eyeShotVerdict,
  clipVerdict,
  passSummary,
  contactSheetHtml,
  parseCycles,
  indexChunkOf,
  servedBuildProblem,
  PASS_ARMS,
  PASS_TIMES,
  PASS_REPS,
  passWindowPlan,
  windowMedian,
  passDifferential,
  passVerdict,
  admittedInstruments,
  PASS_CONTROL,
  parseGpuUtil,
  gpuMsPerFrame,
  altDifferential,
  handCount,
  handPixelStats,
  HAND_MASK,
  HANDS_HEADING,
  facing,
} from '../../scripts/visual/_lookbook.mjs';
import { LOOKBOOK_PASS_NAMES } from '../../src/render/passesOff.js';
import { viteArgv } from '../../scripts/visual/_serve.mjs';

/**
 * THE LOOKBOOK PROBE'S JUDGEMENTS (scripts/visual/_lookbook.mjs; plan docs/superpowers/plans/
 * 2026-10-27-crafty-instruments.md). The probe is an instrument — it shoots frames and judges no look — but it makes
 * four decisions that, made wrong, turn its output into a lie that reads as evidence:
 *
 *   1. "this is a real GPU": a SwiftShader frame called real-GPU is exactly the frame the programme stopped trusting.
 *      Anchored on the strings each case actually produces: Chromium's SwiftShader (old and ANGLE-wrapped forms),
 *      Mesa's llvmpipe, ANGLE-on-Metal, WebKit's MASKED "Apple GPU" (hardware: the FAIL-but-right case) and the
 *      generic "WebKit WebGL" that names no device (unknown, never hardware);
 *   2. which Chromium launch to use: the first candidate whose renderer is hardware, never merely the first;
 *   3. the shot set: the programme's four places at its four times — 0.30, 0.48, 0.55, 0.75 of the DAWN-origin cycle
 *      (roadmap move 4) — and all three targets (Chromium desktop, WebKit at both iPad viewports, with touch);
 *   4. whether a shot is VALID: input live (no title menu or resume overlay over the world), the player alive (no death
 *      screen), the clock where it was asked to be (it keeps running — circular distance, so 0.995 vs 0.005 is close),
 *      the world built, no context loss mid-shot.
 * And the contact sheet escapes what it prints: a renderer string is device-supplied text.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on scripts/visual/_lookbook.mjs, 12 tests, one batch, each observed RED:
 *   P1 SwiftShader dropped from the software pattern -> the classifier and both pick tests
 *   P2 plausible-wrong: a string naming no device counts as hardware -> "names no device is unknown", "returns null"
 *   P3 plausible-wrong: the pick takes the first candidate that launched -> both pick tests
 *   P4 plausible-wrong: golden hour 0.48 moved to dusk 0.50 -> the shot-set test
 *   P5 input liveness read only before the shot -> "each failure is named"
 *   P6 the clock tolerance not circular -> "the clock tolerance is circular"
 *   P7 plausible-wrong: the tolerance doubled to 0.02 -> the same test (a 0.0101 drift passed)
 *   P8 the contact sheet's escaping removed -> the contact-sheet test
 *   P9 the software-renderer warning never shown -> the contact-sheet test
 *   P10 the portrait iPad target without touch -> the targets test
 *   P11 a mid-shot context loss not flagged -> "each failure is named"
 *   I0 identity (a comment edit in _lookbook.mjs) SURVIVED.
 * Added with the power A/B's --build-dir (scripts/visual/_serve.mjs viteArgv, now 13 tests), each observed RED:
 *   P12 plausible-wrong: --outDir passed to the dev server too -> "serving a build kept elsewhere"
 *   P13 --outDir never appended -> the same test
 *   I1 identity (a comment edit in _serve.mjs) SURVIVED.
 *
 * BLIND SPOT: nothing here launches a browser. Whether a launch candidate REALLY yields ANGLE-Metal on this Mac is the
 * probe's own recorded output (lookbook.json `chromiumCandidates`), and the frames are judged by eye.
 */

const SWIFTSHADER_ANGLE = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const ANGLE_METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)';

describe('the renderer classifier', () => {
  it('software renderers are software, in every spelling a harness here produces', () => {
    for (const s of [SWIFTSHADER_ANGLE, 'Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa softpipe']) {
      expect(classifyRenderer(s), s).toBe('software');
    }
  });
  it('ANGLE-Metal and WebKit\'s masked "Apple GPU" are hardware', () => {
    expect(classifyRenderer(ANGLE_METAL)).toBe('hardware');
    expect(classifyRenderer('Apple GPU')).toBe('hardware');
    expect(classifyRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('hardware');
  });
  it('a string that names no device is unknown, never hardware', () => {
    for (const s of ['WebKit WebGL', ' webkit webgl ', 'unknown', '', null, undefined, 'no webgl2']) {
      expect(classifyRenderer(s), JSON.stringify(s)).toBe('unknown');
    }
  });
});

describe('the Chromium launch pick', () => {
  it('takes the FIRST candidate whose renderer is hardware, skipping a software one ahead of it', () => {
    const results = [
      { id: 'new-headless', renderer: SWIFTSHADER_ANGLE },
      { id: 'new-headless+metal', renderer: ANGLE_METAL },
      { id: 'headless-shell', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
    ];
    expect(pickCandidate(results).id).toBe('new-headless+metal');
  });
  it('returns null when none is hardware — the caller must refuse to call those frames real-GPU', () => {
    expect(pickCandidate([{ id: 'a', renderer: SWIFTSHADER_ANGLE }, { id: 'b', renderer: 'WebKit WebGL' }, { id: 'c', error: 'launch failed' }])).toBeNull();
    expect(pickCandidate([])).toBeNull();
  });
  it('the candidates: new headless first, a Metal-forced variant, and the headless shell last as the control', () => {
    expect(CHROMIUM_CANDIDATES.map((c) => c.id)).toEqual(['new-headless', 'new-headless+metal', 'headless-shell']);
    expect(CHROMIUM_CANDIDATES[0].launch).toMatchObject({ channel: 'chromium', headless: true });
    expect(CHROMIUM_CANDIDATES[1].launch.args).toContain('--use-angle=metal');
    expect(CHROMIUM_CANDIDATES[2].launch.channel).toBeUndefined();
  });
});

describe('the shot set', () => {
  it('four places x the programme\'s four times = 16 shots per target, each named by place and time', () => {
    expect([...LOOKBOOK_CYCLES]).toEqual([0.30, 0.48, 0.55, 0.75]);
    expect(LOOKBOOK_PLACES.map((p) => p.id)).toEqual(['hearth', 'forest-edge', 'coast', 'snow-terrace']);
    const plan = shotPlan();
    expect(plan).toHaveLength(16);
    expect(new Set(plan.map((s) => s.file)).size, 'two shots share a file name').toBe(16);
    for (const place of LOOKBOOK_PLACES) {
      expect(plan.filter((s) => s.place === place.id).map((s) => s.cycle)).toEqual([0.30, 0.48, 0.55, 0.75]);
    }
    expect(plan[0]).toEqual({ place: 'hearth', cycle: 0.30, file: 'hearth-0.30.png' });
    for (const p of LOOKBOOK_PLACES) {
      expect(p.position.every(Number.isFinite) && p.lookAt.every(Number.isFinite), p.id).toBe(true);
    }
  });
  it('three targets: Chromium desktop, and WebKit at both iPad viewports with touch', () => {
    expect(TARGETS.map((t) => [t.id, t.engine, t.viewport.width, t.viewport.height, t.touch])).toEqual([
      ['chromium-1280x800', 'chromium', 1280, 800, false],
      ['webkit-1180x820', 'webkit', 1180, 820, true],
      ['webkit-820x1180', 'webkit', 820, 1180, true],
    ]);
  });
});

describe('a shot is valid only if it shows the game it claims to show', () => {
  const ok = { active: true, isAlive: true, cycle: 0.48, worldBuilt: true, contextLosses: 0 };
  it('a clean shot is valid', () => {
    expect(shotVerdict({ cycle: 0.48, before: ok, after: { ...ok, cycle: 0.4815 } })).toEqual({ valid: true, why: [] });
  });
  it('each failure is named', () => {
    const cases = [
      [{ before: { ...ok, active: false }, after: ok }, /input not live/],
      [{ before: ok, after: { ...ok, active: false } }, /input not live/],
      [{ before: ok, after: { ...ok, isAlive: false } }, /player dead/],
      [{ before: ok, after: { ...ok, cycle: 0.50 } }, /clock/],
      [{ before: ok, after: { ...ok, worldBuilt: false } }, /world not built/],
      [{ before: ok, after: { ...ok, contextLosses: 1 } }, /context lost/],
    ];
    for (const [c, re] of cases) {
      const v = shotVerdict({ cycle: 0.48, ...c });
      expect(v.valid, JSON.stringify(c)).toBe(false);
      expect(v.why.join('; ')).toMatch(re);
    }
  });
  it('the clock tolerance is circular: midnight-adjacent times either side of the wrap are close', () => {
    expect(shotVerdict({ cycle: 0.995, before: { ...ok, cycle: 0.995 }, after: { ...ok, cycle: 0.003 } }).valid).toBe(true);
    expect(shotVerdict({ cycle: 0.30, before: ok, after: { ...ok, cycle: 0.3101 } }).valid, 'a 0.0101 drift passed').toBe(false);
  });
});

describe('serving a build kept elsewhere (the power A/B\'s other arm: --build-dir)', () => {
  it('vite preview gets --outDir <dir>; without one, or for the dev server, nothing changes', () => {
    expect(viteArgv(4238, true, '/tmp/arm-A/build')).toEqual(['vite', 'preview', '--port', '4238', '--strictPort', '--no-open', '--outDir', '/tmp/arm-A/build']);
    expect(viteArgv(4238, true)).toEqual(['vite', 'preview', '--port', '4238', '--strictPort', '--no-open']);
    // The dev server has no outDir to serve; a stray flag there would be a silent misconfiguration.
    expect(viteArgv(4238, false, '/tmp/arm-A/build')).toEqual(['vite', '--port', '4238', '--strictPort', '--no-open']);
  });
});

describe('the contact sheet', () => {
  it('lists every shot of every target, links each PNG, flags invalid shots and a software renderer, and escapes device text', () => {
    const report = {
      generatedAt: '2026-10-27T12:00:00Z',
      targets: [
        {
          id: 'chromium-1280x800', engine: 'chromium', renderer: 'ANGLE <b>evil</b> & "co"', gpu: 'software',
          shots: [
            { place: 'hearth', cycle: 0.30, file: 'hearth-0.30.png', valid: true, why: [], cycleAtShot: 0.301, tier: 'high', dpr: 1.75, consoleErrors: 0 },
            { place: 'coast', cycle: 0.75, file: 'coast-0.75.png', valid: false, why: ['player dead (death screen)'], cycleAtShot: 0.75, tier: 'med', dpr: 1.5, consoleErrors: 3 },
          ],
          notes: [],
        },
        { id: 'webkit-1180x820', engine: 'webkit', renderer: 'Apple GPU', gpu: 'hardware', shots: [], notes: ['COULD NOT MEASURE: the world never built'] },
      ],
    };
    const html = contactSheetHtml(report);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('src="chromium-1280x800/hearth-0.30.png"');
    expect(html).toContain('src="chromium-1280x800/coast-0.75.png"');
    expect(html).toContain('player dead (death screen)');
    expect(html, 'the device string reached the page unescaped').not.toContain('<b>evil</b>');
    expect(html).toContain('ANGLE &lt;b&gt;evil&lt;/b&gt; &amp; &quot;co&quot;');
    expect(html).toMatch(/SOFTWARE renderer/);
    expect(html).toContain('COULD NOT MEASURE: the world never built');
    expect((html.match(/<figure/g) || []).length, 'one figure per shot').toBe(2);
  });
});

describe('the eye-level set and the walking clips', () => {
  it('three bearings a third of the horizon apart x the four times = 12 shots per target, time-major, named by both', () => {
    expect([...EYE_HEADINGS]).toEqual([0, 120, 240]);
    expect(EYE_PITCH).toBe(0);
    const plan = eyeShotPlan();
    expect(plan).toHaveLength(12);
    expect(new Set(plan.map((s) => s.file)).size, 'two eye shots share a file name').toBe(12);
    expect(plan[0]).toEqual({ heading: 0, cycle: 0.30, file: 'eye-000-0.30.png' });
    expect(plan[3]).toEqual({ heading: 0, cycle: 0.48, file: 'eye-000-0.48.png' });
    for (const c of LOOKBOOK_CYCLES) {
      expect(plan.filter((s) => s.cycle === c).map((s) => s.heading), `bearings at ${c}`).toEqual([0, 120, 240]);
    }
  });

  it('a run refuses a port that serves another build (every worktree\'s lookbook shares the port)', () => {
    // Another chunk is named first, so a reader that takes the first asset instead of the index chunk is seen.
    const page = (chunk) => `<link rel="modulepreload" href="/assets/three-x.js"><script type="module" crossorigin src="/assets/${chunk}"></script>`;
    expect(indexChunkOf(page('index-CmjXxhOu.js'))).toBe('index-CmjXxhOu.js');
    expect(indexChunkOf('<html></html>')).toBeNull();
    expect(servedBuildProblem(page('index-CmjXxhOu.js'), 'index-CmjXxhOu.js')).toBeNull();
    expect(servedBuildProblem(page('index-DuGj5xO_.js'), 'index-CmjXxhOu.js')).toMatch(/index-DuGj5xO_\.js, not this build's index-CmjXxhOu\.js/);
    expect(servedBuildProblem('<html>a vite error page</html>', 'index-CmjXxhOu.js')).toMatch(/no index chunk/);
    expect(servedBuildProblem(page('index-CmjXxhOu.js'), null)).toMatch(/has no index chunk/);
  });

  it('--cycles names the times to shoot, and a mistyped one stops the run instead of shooting another set', () => {
    expect(parseCycles(null)).toBe(LOOKBOOK_CYCLES);
    expect(parseCycles('')).toBe(LOOKBOOK_CYCLES);
    const asked = parseCycles('0.02, 0.25,0.5,0.75');
    expect([...asked]).toEqual([0.02, 0.25, 0.5, 0.75]);
    expect(eyeShotPlan(EYE_HEADINGS, asked).map((s) => s.file).slice(0, 3)).toEqual(['eye-000-0.02.png', 'eye-120-0.02.png', 'eye-240-0.02.png']);
    expect(eyeShotPlan(EYE_HEADINGS, asked)).toHaveLength(12);
    expect(clipPlan(asked).map((c) => c.file)).toEqual(['walk-0.02.mp4', 'walk-0.25.mp4', 'walk-0.50.mp4', 'walk-0.75.mp4']);
    for (const bad of ['1', '1.0', '-0.1', 'dusk', '0.5,', '0.25,0.251', 'NaN']) {
      expect(() => parseCycles(bad), `"${bad}" was accepted`).toThrow(/--cycles/);
    }
  });

  it('four 4 s clips, one per programme time, due south over open plains', () => {
    expect(WALK_MS).toBe(4000);
    expect(MIN_WALK_M).toBe(2);
    expect(clipPlan()).toEqual([
      { cycle: 0.30, heading: 180, ms: 4000, file: 'walk-0.30.mp4' },
      { cycle: 0.48, heading: 180, ms: 4000, file: 'walk-0.48.mp4' },
      { cycle: 0.55, heading: 180, ms: 4000, file: 'walk-0.55.mp4' },
      { cycle: 0.75, heading: 180, ms: 4000, file: 'walk-0.75.mp4' },
    ]);
  });
});

describe('an eye-level shot is valid only if it shows what a player sees', () => {
  const ok = { active: true, isAlive: true, cycle: 0.48, worldBuilt: true, contextLosses: 0, pose: null, cameraNodes: 9, heading: 120.2,
    hostiles: { nearestM: 12, within8m: 0 }, body: [0, 52.95, 0] };
  const base = { cycle: 0.48, heading: 120, stand: [0, 52.95, 0], before: ok, handsBaseline: 2, hud: true };
  it('a clean shot is valid, and the bearing tolerance is circular', () => {
    expect(eyeShotVerdict({ ...base, after: ok })).toEqual({ valid: true, why: [] });
    // 0.5 m from the stand, horizontally: a body that settled onto the ground (lower) is where it was stood.
    expect(eyeShotVerdict({ ...base, after: { ...ok, body: [0.3, 51.5, 0.3] } }).valid, '0.42 m off and 1.45 m lower').toBe(true);
    expect(eyeShotVerdict({ ...base, after: { ...ok, body: [0.4, 52.95, 0.4] } }).valid, '0.57 m off').toBe(false);
    expect(eyeShotVerdict({ ...base, heading: 0, after: { ...ok, heading: 359.5 } }).valid, '359.5 is half a degree from 0').toBe(true);
    expect(eyeShotVerdict({ ...base, after: { ...ok, hostiles: { nearestM: null, within8m: 0 } } }).valid, 'no hostile alive').toBe(true);
  });
  it('a hostile within 3 m of the eye makes the frame a fight, not the view', () => {
    expect(OBSTRUCTION_M).toBe(3);
    const at = (m) => eyeShotVerdict({ ...base, after: { ...ok, hostiles: { nearestM: m, within8m: 1 } } });
    expect(at(3.1).valid, '3.1 m is clear').toBe(true);
    expect(at(2.9).valid, '2.9 m is in the face').toBe(false);
    expect(at(1.4).why.join('; ')).toMatch(/a hostile 1.4 m from the eye/);
    const unchecked = eyeShotVerdict({ ...base, after: { ...ok, hostiles: null } });
    expect(unchecked.valid).toBe(false);
    expect(unchecked.why.join('; ')).toMatch(/hostiles not checked/);
  });
  it('each failure is named, the hero-shot ones included', () => {
    const cases = [
      [{ after: { ...ok, pose: { position: [1, 2, 3], lookAt: [0, 0, 0], fov: 75 } } }, /hero pose/],
      [{ after: { ...ok, cameraNodes: 2 } }, /hands not mounted \(2 nodes; 2 with them hidden\)/],
      // A viewmodel build reports handNodes, and it decides even when the camera's own subtree is large.
      [{ after: { ...ok, cameraNodes: 9, handNodes: 0 }, handsBaseline: 0 }, /hands not mounted \(0 nodes; 0 with them hidden\)/],
      [{ after: ok, handsBaseline: undefined }, /no baseline/],
      [{ after: ok, hud: false }, /HUD not on screen/],
      [{ after: { ...ok, heading: 121.5 } }, /facing 121.5, asked 120/],
      [{ after: { ...ok, heading: null } }, /facing \?/],
      [{ after: { ...ok, isAlive: false } }, /player dead/],
      [{ after: { ...ok, cycle: 0.50 } }, /clock/],
      // stand() never ran or did not take: the body still where the last walk left it, 41 m south.
      [{ after: { ...ok, body: [0, 51, 41.2] } }, /the body 41.20 m from the stand at the shot/],
      [{ after: { ...ok, body: null } }, /the body \? m from the stand/],
      [{ after: ok, stand: null }, /the body \? m from the stand/],
    ];
    for (const [c, re] of cases) {
      const v = eyeShotVerdict({ ...base, ...c });
      expect(v.valid, JSON.stringify(c)).toBe(false);
      expect(v.why.join('; ')).toMatch(re);
    }
  });
  it('a viewmodel build\'s hands count from handNodes, an older build\'s from the camera', () => {
    expect(handCount({ cameraNodes: 1, handNodes: 14 })).toBe(14);
    expect(handCount({ cameraNodes: 1, handNodes: 0 })).toBe(0);
    expect(handCount({ cameraNodes: 9 })).toBe(9);
    expect(handCount({ cameraNodes: 9, handNodes: null })).toBe(9);
    expect(eyeShotVerdict({ ...base, handsBaseline: 0, after: { ...ok, cameraNodes: 1, handNodes: 14 } })).toEqual({ valid: true, why: [] });
  });
});

describe('the hands set: hand pixels are what the hands change, below the horizon, where the hidden frames agree', () => {
  const W = 10, H = 10;
  const frame = (fill) => {
    const b = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(fill(x, y), (y * W + x) * 4);
    return b;
  };
  const grey = () => [40, 40, 40, 255];
  // The hands: an ember block at x 1-3 and x 6-8, rows 6-9 (the lower part of the frame).
  const hand = (x, y) => (y >= 6 && ((x >= 1 && x <= 3) || (x >= 6 && x <= 8)) ? [200, 120, 40, 255] : grey());

  it('counts exactly the changed pixels below fromY, with their mean and median luma and colour', () => {
    const s = handPixelStats(frame(hand), frame(grey), frame(grey), { width: W, height: H });
    expect(HAND_MASK.fromY).toBe(0.55);
    expect(s.checked, 'the rows from fromY down').toBe(50);
    expect(s.pixels).toBe(24);
    expect(s.left).toBe(12);
    expect(s.right).toBe(12);
    const y = 0.2126 * 200 + 0.7152 * 120 + 0.0722 * 40;
    expect(s.meanLuma).toBeCloseTo(y, 6);
    expect(s.medianLuma).toBe(Math.round(y));
    expect(s.meanRGB).toEqual([200, 120, 40]);
    expect(s.share).toBeCloseTo(0.24, 9);
  });

  it('ignores a change above fromY, and a change no larger than the threshold', () => {
    const sky = (x, y) => (y < 5 ? [255, 255, 255, 255] : hand(x, y));
    expect(handPixelStats(frame(sky), frame(grey), frame(grey), { width: W, height: H }).pixels).toBe(24);
    const faint = (x, y) => (y >= 6 ? [40 + HAND_MASK.threshold, 40, 40, 255] : grey());
    expect(handPixelStats(frame(faint), frame(grey), frame(grey), { width: W, height: H }).pixels).toBe(0);
  });

  it('drops a pixel the two hidden frames disagree on, and counts it as unstable', () => {
    const sway = (x, y) => (y === 9 && x === 2 ? [90, 90, 90, 255] : grey());
    const s = handPixelStats(frame(hand), frame(grey), frame(sway), { width: W, height: H });
    expect(s.pixels).toBe(23);
    expect(s.unstable).toBe(1);
  });

  it('refuses frames of the wrong size, and reports no luma over an empty mask', () => {
    expect(() => handPixelStats(new Uint8Array(4), frame(grey), frame(grey), { width: W, height: H })).toThrow(/RGBA/);
    const s = handPixelStats(frame(grey), frame(grey), frame(grey), { width: W, height: H });
    expect(s.pixels).toBe(0);
    expect(s.meanLuma).toBeNull();
    expect(s.medianLuma).toBeNull();
  });

  it('facing: compass 0 is -Z, 90 is +X, pitch tips the vector up', () => {
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    expect(near(facing(0), [0, 0, -1])).toBe(true);
    expect(near(facing(90), [1, 0, 0])).toBe(true);
    expect(near(facing(180), [0, 0, 1])).toBe(true);
    expect(near(facing(0, 90), [0, 1, 0])).toBe(true);
    expect(HANDS_HEADING).toBe(240);
  });
});

describe('a walking clip is valid only if the player walked from the stand, along the bearing', () => {
  const at = (body, more = {}) => ({ active: true, isAlive: true, cycle: 0.30, heading: 180, body, ...more });
  const clip = { cycle: 0.30, heading: 180, stand: [0, 52, 0] };
  it('a walk across the ground is valid and reports how far', () => {
    const v = clipVerdict({ ...clip, start: at([0, 52, 0]), end: at([6, 53, 4.5], { cycle: 0.3133 }), frames: 100 });
    expect(v).toEqual({ valid: true, why: [], movedM: 7.5 });
    const wrap = clipVerdict({ ...clip, heading: 0, start: at([0, 52, 0], { heading: 359.5 }), end: at([0, 52, -6], { heading: 0.5 }), frames: 100 });
    expect(wrap.valid, 'the bearing tolerance is circular').toBe(true);
  });
  it('a walk that did not start at the stand, or not along the bearing, is refused', () => {
    // stand() dropped: each clip after the first starts where the previous walk ended, and still moves metres.
    const unstood = clipVerdict({ ...clip, start: at([0, 51, 48]), end: at([0, 51, 94]), frames: 100 });
    expect(unstood.valid).toBe(false);
    expect(unstood.why.join('; ')).toMatch(/the body 48.00 m from the stand when the key went down/);
    expect(clipVerdict({ ...clip, start: at([0.4, 52, 0.4]), end: at([0.4, 52, 6]), frames: 100 }).valid, '0.57 m off the stand').toBe(false);
    expect(clipVerdict({ ...clip, start: at([0.3, 52, 0.3]), end: at([0.3, 52, 6]), frames: 100 }).valid, '0.42 m off the stand').toBe(true);
    // look() faced the wrong way, or the view turned during the walk.
    const turned = clipVerdict({ ...clip, start: at([0, 52, 0], { heading: 120 }), end: at([5, 52, 3], { heading: 120 }), frames: 100 });
    expect(turned.why.join('; ')).toMatch(/facing 120.0 at the start, asked 180; facing 120.0 at the end, asked 180/);
    expect(clipVerdict({ ...clip, start: at([0, 52, 0]), end: at([0, 52, 6], { heading: 181.5 }), frames: 100 }).why.join('; ')).toMatch(/facing 181.5 at the end/);
    expect(clipVerdict({ ...clip, start: at([0, 52, 0], { heading: null }), end: at([0, 52, 6]), frames: 100 }).why.join('; ')).toMatch(/facing \? at the start/);
  });
  it('each failure is named; distance is horizontal, and the clock is read at the start', () => {
    const cases = [
      [{ start: at([0, 52, 0]), end: at([1.5, 52, 0]), frames: 100 }, /moved 1.50 m/],
      [{ start: at([0, 60, 0]), end: at([0.3, 52, 0.3]), frames: 100 }, /moved 0.42 m/],
      [{ start: at([0, 52, 0], { active: false }), end: at([6, 52, 0]), frames: 100 }, /input not live/],
      [{ start: at([0, 52, 0]), end: at([6, 52, 0], { isAlive: false }), frames: 100 }, /player dead/],
      [{ start: at([0, 52, 0], { cycle: 0.32 }), end: at([6, 52, 0]), frames: 100 }, /clock at 0.3200/],
      [{ start: at([0, 52, 0]), end: at([6, 52, 0]), frames: NaN }, /no video frames/],
      [{ start: at(null), end: at([6, 52, 0]), frames: 100 }, /moved \? m/],
    ];
    for (const [c, re] of cases) {
      const v = clipVerdict({ ...clip, ...c });
      expect(v.valid, JSON.stringify(c)).toBe(false);
      expect(v.why.join('; ')).toMatch(re);
    }
  });
});

describe('the post-pass summary: the game canvas, the scene apart from the post chain, per timed frame, judged against its window', () => {
  // `perFrame` ms on each of `count` frames; a mean over the last 30 that differs from the window's, as the 240-result
  // cap makes it on a long window.
  const pass = (label, perFrame, count = 40) => ({ label, n: 30, meanMs: perFrame * 3, p50Ms: perFrame, maxMs: perFrame * 4, count, sumMs: perFrame * count });
  const title = { canvas: [3000, 2000], available: true, frames: 60, framesTimed: 40, windowMs: 1000, passes: [pass('0:RenderPass', 9)] };
  const game = { canvas: [2560, 1600], available: true, frames: 42, framesTimed: 40, windowMs: 1000, disjoint: 0, skipped: 0,
    passes: [pass('0:RenderPass', 3.25), pass('depth blit', 0.5), pass('1:N8AO', 1.5), pass('2:EffectPass(SMAAEffect) > draw', 0.125)] };
  it('the game canvas, even beside a larger one; the RenderPass is the scene and every other segment the post chain', () => {
    const s = passSummary({ installed: true, contexts: [title, game] }, [2560, 1600]);
    expect(s).toMatchObject({ available: true, reason: null, sceneMs: 3.25, postMs: 2.125, gpuMs: 215, windowMs: 1000, framesTimed: 40, frames: 42, plausible: true });
    expect(s.passes.map((p) => p.label)).toEqual(['0:RenderPass', 'depth blit', '1:N8AO', '2:EffectPass(SMAAEffect) > draw']);
    expect(passSummary({ installed: true, contexts: [game, title] }, null).sceneMs, 'with no game canvas known, the largest').toBe(9);
  });
  it('a pass rebuilt mid-window counts each frame once, under whichever label drew it', () => {
    // Frames 1-25 drew the day pass (with GodRays), 26-40 the night pass: two label sets, never both in one frame.
    const s = passSummary({ installed: true, contexts: [{ ...game, passes: [
      pass('0:RenderPass', 3, 40),
      pass('2:EffectPass(GodRaysEffect+BloomEffect) > BloomEffect.update', 2, 25),
      pass('2:EffectPass(BloomEffect) > BloomEffect.update', 4, 15),
    ] }] }, [2560, 1600]);
    expect(s).toMatchObject({ sceneMs: 3, postMs: 2.75, plausible: true });
  });
  it('more GPU time than the window lasted is IMPLAUSIBLE: the numbers are kept, and flagged', () => {
    const at = (windowMs) => passSummary({ installed: true, contexts: [{ ...game, windowMs }] }, [2560, 1600]);
    expect(at(215).plausible, 'exactly the window').toBe(true);
    const over = at(214);
    expect(over).toMatchObject({ plausible: false, sceneMs: 3.25, postMs: 2.125 });
    expect(over.reason).toMatch(/IMPLAUSIBLE: 215 ms of GPU time in a 214 ms window/);
    const unwindowed = passSummary({ installed: true, contexts: [{ ...game, windowMs: undefined }] }, [2560, 1600]);
    expect(unwindowed, 'a report with no window must not read as plausible').toMatchObject({ plausible: false, sceneMs: null, postMs: null, reason: /no window/ });
    const unsummed = passSummary({ installed: true, contexts: [{ ...game, passes: game.passes.map(({ sumMs, ...p }) => p) }] }, [2560, 1600]);
    expect(unsummed).toMatchObject({ plausible: false, postMs: null, reason: /no window/ });
  });
  it('says why when nothing was timed', () => {
    expect(passSummary({ installed: false, reason: 'no pass timer in this build' }, null)).toMatchObject({ available: false, reason: 'no pass timer in this build', postMs: null, plausible: null });
    expect(passSummary(null, null).reason).toMatch(/not installed/);
    expect(passSummary({ installed: true, contexts: [] }, [2560, 1600]).reason).toMatch(/no composer/);
    const webkit = { canvas: [2360, 1640], available: false, reason: 'EXT_disjoint_timer_query_webgl2 is not exposed by this browser', passes: [] };
    expect(passSummary({ installed: true, contexts: [webkit] }, [2360, 1640])).toMatchObject({ available: false, reason: /not exposed/, postMs: null });
    expect(passSummary({ installed: true, contexts: [{ ...game, passes: [] }] }, [2560, 1600])).toMatchObject({ available: true, postMs: null, reason: /no samples/ });
  });
});

describe('the contact sheet shows the eye-level set and the clips', () => {
  it('a figure per eye shot and a video per clip, invalid ones flagged, post ms or why not, all escaped', () => {
    const html = contactSheetHtml({
      generatedAt: '2026-10-28T12:00:00Z',
      targets: [{
        id: 'chromium-1280x800', engine: 'chromium', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max)', gpu: 'hardware', notes: [],
        shots: [],
        eye: [
          { heading: 0, cycle: 0.30, file: 'eye-000-0.30.png', valid: true, why: [], cycleAtShot: 0.3, tier: 'high', dpr: 2, consoleErrors: 0, passMs: { sceneMs: 3.25, postMs: 4.875, plausible: true } },
          { heading: 120, cycle: 0.75, file: 'eye-120-0.75.png', valid: false, why: ['HUD not on screen'], cycleAtShot: 0.75, tier: 'high', dpr: 2, consoleErrors: 0, passMs: { postMs: null, reason: 'passTimes threw: <oops>' } },
        ],
        clips: [{ cycle: 0.48, heading: 120, file: 'walk-0.48.mp4', valid: true, why: [], movedM: 14.2, frames: 101,
          passMs: { sceneMs: 5.8, postMs: 50.1, plausible: false, reason: 'IMPLAUSIBLE: 41266 ms of GPU time in a <10000> ms window' } }],
      }],
    });
    expect(html).toContain('src="chromium-1280x800/eye-000-0.30.png"');
    expect(html).toContain('src="chromium-1280x800/eye-120-0.75.png"');
    expect(html).toContain('<video src="chromium-1280x800/walk-0.48.mp4"');
    expect(html).toContain('HUD not on screen');
    expect(html).toContain('scene 3.25 ms · post 4.875 ms');
    expect(html, 'an implausible timing was shown as a number with no flag').toContain('post 50.1 ms <span class="bad">IMPLAUSIBLE: 41266 ms of GPU time in a &lt;10000&gt; ms window</span>');
    expect((html.match(/IMPLAUSIBLE/g) || []).length, 'only the implausible timing is flagged').toBe(1);
    expect(html).toContain('walked 14.2 m');
    expect(html, 'a reason reached the page unescaped').not.toContain('<oops>');
    expect(html).toContain('passTimes threw: &lt;oops&gt;');
    expect((html.match(/<figure/g) || []).length, 'one figure per eye shot and clip').toBe(3);
  });
});

/**
 * THE WHOLE-FRAME DIFFERENTIAL (lookbook.mjs --passes; plan docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md). A
 * pass is judged by the whole frame with it on minus off, in interleaved repetitions, on two instruments, by a rule
 * written before the measurement. These pin what that rule says, on windows whose answer is known by construction.
 */
describe('the whole-frame differential and the rule it is judged by', () => {
  const win = (arm, rep, state, q, w, extra = {}) => ({ arm, rep, state, q, w, valid: true, ...extra });

  it('the plan: every arm once per repetition, on and off alternating by repetition, at least 5 repetitions', () => {
    expect(PASS_REPS).toBeGreaterThanOrEqual(5);
    const plan = passWindowPlan(PASS_ARMS, PASS_REPS);
    expect(plan.length).toBe(PASS_ARMS.length * PASS_REPS * 2);
    const arm = PASS_ARMS[0].id;
    const mine = plan.filter((x) => x.arm === arm);
    expect(mine.map((x) => x.state)).toEqual(['on', 'off', 'off', 'on', 'on', 'off', 'off', 'on', 'on', 'off']);
    expect(mine.filter((x) => x.state === 'off').every((x) => x.off.length > 0)).toBe(true);
    expect(mine.filter((x) => x.state === 'on').every((x) => x.off.length === 0)).toBe(true);
    // Repetition-major: an arm's repetitions spread over the block rather than running back to back.
    expect(plan.slice(0, PASS_ARMS.length * 2).map((x) => x.rep).every((r) => r === 0)).toBe(true);
    // Every name an arm switches off is one the seam accepts, and the plan's arms are the composer's passes.
    for (const a of PASS_ARMS) for (const n of a.off) expect(LOOKBOOK_PASS_NAMES).toContain(n);
    expect(PASS_ARMS.map((a) => a.id)).toEqual(['godrays+sun', 'bloom', 'smaa', 'tonemapping', 'grade', 'vignette']);
    expect(PASS_TIMES.map((t) => t.cycle)).toEqual([0.25, 0.48, 0.75]);
  });

  it('a window\'s value is the timer\'s median for the label; a window with no such label has none', () => {
    const r = { contexts: [{ canvas: [100, 100], passes: [{ label: 'frame', p50Ms: 6.5, n: 80 }, { label: 'frame:wall', p50Ms: 9, n: 80 }] }] };
    expect(windowMedian(r, 'frame', [100, 100])).toEqual({ ms: 6.5, n: 80 });
    expect(windowMedian(r, 'frame:wall', [100, 100])).toEqual({ ms: 9, n: 80 });
    expect(windowMedian(r, 'frame', [5, 5]), 'the largest canvas when none matches').toEqual({ ms: 6.5, n: 80 });
    expect(windowMedian({ contexts: [{ canvas: [1, 1], passes: [] }] }, 'frame', [1, 1])).toBeNull();
    expect(windowMedian(null, 'frame')).toBeNull();
  });

  it('pairs on and off within a repetition, whatever their order, and refuses invalid or half pairs', () => {
    const ws = [
      win('bloom', 0, 'on', 7, 9), win('bloom', 0, 'off', 6, 8.2),
      win('bloom', 1, 'off', 6.1, 8), win('bloom', 1, 'on', 7.3, 9.1),
      win('bloom', 2, 'on', 7, 9), win('bloom', 2, 'off', 5.8, 7.9, { valid: false }),
      win('bloom', 3, 'on', 6.8, 9),
      win('n8ao', 0, 'on', 7, 9), win('n8ao', 0, 'off', 4, 6),
    ];
    const d = passDifferential(ws, 'bloom');
    expect(d.reps).toBe(2);
    expect(d.q.values.map((x) => Math.round(x * 100) / 100)).toEqual([1, 1.2]);
    expect(d.q.median).toBeCloseTo(1.1, 9);
    expect(d.q).toMatchObject({ min: 1, positive: 2, n: 2 });
    expect(d.q.max).toBeCloseTo(1.2, 9);
    expect(d.w.values.map((x) => Math.round(x * 100) / 100)).toEqual([0.8, 1.1]);
    expect(d.onQ).toBeCloseTo(7.15, 9);
    expect(d.offQ).toBeCloseTo(6.05, 9);
    expect(passDifferential(ws, 'smaa').reps).toBe(0);
    // U has pairs of its own: a repetition whose utilization read failed on one side counts for Q and W, not for U.
    const withU = [
      win('grade', 0, 'on', 7, 9, { u: 5 }), win('grade', 0, 'off', 6, 8, { u: 4 }),
      win('grade', 1, 'on', 7, 9, { u: 5.2 }), win('grade', 1, 'off', 6, 8, { u: null }),
    ];
    const du = passDifferential(withU, 'grade');
    expect([du.reps, du.u.n, du.u.median, du.onU]).toEqual([2, 1, 1, 5]);
  });

  it('material: U at least 0.5 ms AND 10% of the frame, 4 of 5 positive, no admitted instrument contradicting; else named', () => {
    // Each repetition: on and off windows with U (GPU busy ms), Q and W, the differential on each instrument given.
    const five = (arm, du, { on = 6, dq = du, dw = du } = {}) => du.flatMap((d, i) => [
      win(arm, i, 'on', on + 4, on + 2, { u: on }),
      win(arm, i, 'off', on + 4 - dq[i], on + 2 - dw[i], { u: on - d }),
    ]);
    const all = { u: true, w: true, q: true };
    const v = (ws, arm, adm = all) => passVerdict(passDifferential(ws, arm), adm);
    expect(v(five('a', [1, 1.1, 0.9, 1.2, 1]), 'a')).toMatchObject({ material: true, contradicted: [] });
    // 0.5 ms is the floor: 0.45 ms is not material even at 10% of a 4.5 ms frame.
    const small = v(five('b', [0.45, 0.45, 0.45, 0.45, 0.45], { on: 4.5 }), 'b');
    expect(small.material).toBe(false);
    expect(small.why.join(' ')).toMatch(/0\.5 ms/);
    // 10% is the share OF THE FRAME WITH THE PASS ON: 0.65 ms of a 7 ms frame is 9.3%, not material (of the 6.35 ms
    // frame without it, it would read 10.2%).
    const share = v(five('c', [0.65, 0.65, 0.65, 0.65, 0.65], { on: 7 }), 'c');
    expect(share.material).toBe(false);
    expect(share.why.join(' ')).toMatch(/10%/);
    // Sign consistency: 3 of 5 positive is not enough, however big the median.
    const noisy = v(five('d', [2, 2, 2, -1, -1]), 'd');
    expect(noisy.material).toBe(false);
    expect(noisy.why.join(' ')).toMatch(/positive/);
    // An admitted instrument that says the pass SAVES time contradicts it; a near-zero one does not.
    const against = v(five('e', [2, 2, 2, 2, 2], { dw: [-1, -1, -1, -1, -1] }), 'e');
    expect(against).toMatchObject({ material: false, contradicted: ['w'] });
    expect(v(five('f', [2, 2, 2, 2, 2], { dw: [-0.2, -0.2, -0.2, -0.2, -0.2] }), 'f').material).toBe(true);
    // ...but only an ADMITTED one: an instrument the control could not move says nothing either way.
    expect(v(five('e', [2, 2, 2, 2, 2], { dw: [-1, -1, -1, -1, -1] }), 'e', { u: true, w: false, q: true }).material).toBe(true);
    // No decision at all without U admitted.
    const blind = v(five('a', [1, 1.1, 0.9, 1.2, 1]), 'a', { u: false, w: true, q: true });
    expect(blind.material).toBe(false);
    expect(blind.why.join(' ')).toMatch(/not admitted/);
    // Fewer than 5 complete repetitions is no verdict at all.
    const short = v(five('g', [1, 1, 1, 1]), 'g');
    expect(short.material).toBe(false);
    expect(short.why.join(' ')).toMatch(/repetitions/);
  });

  it('the control admits an instrument it moves materially, and refuses Q once Q outlasts the wall clock', () => {
    const stats = (median, positive = 5, n = 5) => ({ median, positive, n });
    const control = { u: stats(3), w: stats(0.1, 3), q: stats(4) };
    expect(admittedInstruments(control)).toEqual({ u: true, w: false, q: true });
    expect(admittedInstruments(control, { qOverW: 1 })).toEqual({ u: true, w: false, q: false });
    expect(admittedInstruments({ u: stats(3, 3), w: stats(1), q: stats(0.4) })).toEqual({ u: false, w: true, q: false });
    expect(admittedInstruments({ u: stats(3, 4, 4), w: stats(1), q: stats(1) }).u, 'four repetitions admitted').toBe(false);
  });
});

describe('the GPU\'s own utilization: an instrument with no timer query in it', () => {
  it('reads the driver\'s device, renderer and tiler percents out of ioreg\'s text, and nothing out of other text', () => {
    const text = '"PerformanceStatistics" = {"Tiler Utilization %"=12,"recoveryCount"=0,"Renderer Utilization %"=37,"Device Utilization %"=41,"SplitSceneCount"=0}';
    expect(parseGpuUtil(text)).toEqual({ device: 41, renderer: 37, tiler: 12 });
    expect(parseGpuUtil('"Device Utilization %"=0')).toEqual({ device: 0, renderer: null, tiler: null });
    expect(parseGpuUtil('no accelerator here')).toBeNull();
    expect(parseGpuUtil(undefined)).toBeNull();
  });

  it('GPU ms per frame is the median busy percent after the lag, times the window\'s mean frame interval', () => {
    const at = (t, device) => ({ t, util: { device } });
    // 60 frames in 1000 ms is 16.67 ms a frame; the median of 30, 40, 90 is 40%; the reading at 100 ms is lag, skipped.
    const g = gpuMsPerFrame([at(100, 100), at(600, 30), at(800, 90), at(900, 40), { t: 950, util: null }], { frames: 60, windowMs: 1000 });
    expect(g.pct).toBe(40);
    expect(g.n).toBe(3);
    expect(g.ms).toBeCloseTo(0.4 * (1000 / 60), 9);
    // At 30 fps the same busy percent is twice the GPU time per frame: the interval, not a 60 Hz constant.
    expect(gpuMsPerFrame([at(600, 40)], { frames: 30, windowMs: 1000 }).ms).toBeCloseTo(0.4 * (1000 / 30), 9);
    expect(gpuMsPerFrame([at(600, 40)], { frames: 0, windowMs: 1000 })).toBeNull();
    expect(gpuMsPerFrame([at(100, 40)], { frames: 60, windowMs: 1000 }), 'only lagging readings').toBeNull();
  });

  it('the positive control switches every pass the arms do, and is never a decision arm', () => {
    const named = new Set(PASS_ARMS.flatMap((a) => a.off));
    expect(new Set(PASS_CONTROL.off)).toEqual(named);
    expect(PASS_CONTROL.control).toBe(true);
    expect(PASS_ARMS.some((a) => a.id === PASS_CONTROL.id)).toBe(false);
  });
});

describe('the fast alternation: one differential per adjacent on/off pair of halves, within one power state', () => {
  const half = (state, pcts) => ({ state, samples: pcts.map((p, i) => ({ t: i * 200, util: { device: p } })) });
  it('takes each half after the driver lag, pairs neighbours whatever their order, and reads ms at the frame interval', () => {
    // Halves at 600 ms and after: 88 / 80 / 88 / 80 % at 16 ms a frame. The first two readings of each are lag.
    const halves = [half('on', [10, 10, 10, 88, 88, 88]), half('off', [99, 99, 99, 80, 80, 80]), half('on', [0, 0, 0, 88, 88, 88]), half('off', [0, 0, 0, 80, 80, 80])];
    const d = altDifferential(halves, 16);
    expect(d.u.n, 'three adjacent pairs from four halves').toBe(3);
    expect(d.u.values.map((x) => Math.round(x * 100) / 100)).toEqual([1.28, 1.28, 1.28]);
    expect(d.onU).toBeCloseTo(0.88 * 16, 9);
  });
  it('a step in the GPU\'s power state between pairs leaves each pair\'s differential alone', () => {
    // The state jumps from about 47% to 87% busy between the second and third halves: the one pair across the jump
    // reads it (4.2 ms), and the median of the four pairs holds at the in-state 0.2 ms.
    const halves = [half('on', [0, 0, 0, 48, 48]), half('off', [0, 0, 0, 46, 46]), half('on', [0, 0, 0, 88, 88]), half('off', [0, 0, 0, 86, 86]), half('on', [0, 0, 0, 88, 88])];
    const d = altDifferential(halves, 10);
    expect(d.u.values.map((x) => Math.round(x * 100) / 100)).toEqual([0.2, 4.2, 0.2, 0.2]);
    expect(d.u.median).toBeCloseTo(0.2, 9);
    expect(altDifferential([half('on', [0, 0, 0, 50]), half('on', [0, 0, 0, 40])], 10).u.n, 'two halves in the same state are no pair').toBe(0);
    expect(altDifferential(halves, null).u.n, 'no frame interval, no ms').toBe(0);
  });
});
