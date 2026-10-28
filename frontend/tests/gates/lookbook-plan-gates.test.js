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
} from '../../scripts/visual/_lookbook.mjs';
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
      [{ after: { ...ok, cameraNodes: 2 } }, /hands not on the camera/],
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
