import { test, expect } from './_fixtures.js';

// THE GPU HALF OF THE HEIGHT FOG, AND WHY IT NEEDS ITS OWN SPEC.
//
// `tests/gates/height-fog-instancing-gates.test.js` executes installHeightFog() and checks the names the
// patched fog_vertex reads against what each stock shader declares before it. That is a declaration check,
// and it cannot answer what a GPU does with the chunk: whether every fogged material links, and whether each
// instance and each sprite is fogged at its own altitude. The three tests below answer those by compiling and
// rendering. See tests/e2e/_fog-probe.html for the scenes.
//
// THE CONTROL THAT MAKES THE BOX TEST A HEIGHT TEST. Both boxes sit on the camera's forward axis at the same
// view-space depth, so vFogDepth is identical for both and every difference in the sampled pixel comes
// from the height term.
//
// THE MUTATIONS RUN ON EVERY PASS, rather than once by hand. The probe renders or compiles each scene again
// under a fixed wrong chunk, each the shape of a real mistake, and the spec asserts the probe can see it:
//   - world Y from modelMatrix alone: an InstancedMesh at the origin hands every instance the same local Y,
//     so the two boxes come back identical;
//   - world Y from `transformed`, which the sprite shader never declares: the SpriteMaterial program, and
//     only it, fails to link;
//   - R where R^T belongs: under the sprite scene's pitched camera every sprite reads the wrong height.
// If the shipped chunk regresses to one of those shapes, the assertion on the shipped variant fails; if a
// mutant stops reproducing its defect, the assertion on that mutant fails.

const EQ = 3; // GPU rounding slack for samples the shader math says must be equal
// Slack between a sprite's sample and the value the fog formula gives for its world Y: about 3 world units of
// height on the ramp, a third of the distance to the nearest wrong formula's reading.
const SPRITE_TOL = 6;
const DREW = 40; // a white sample under this fog reads at least ~100; the black background reads ~0

function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function openProbe(page) {
  await page.goto('/tests/e2e/_fog-probe.html');
  await page.waitForFunction(() => window.__fogProbeReady === true, null, { timeout: 30000 });
}

test.describe('height fog on a real GPU: every fogged material links, each instance and sprite at its own world Y', () => {
  test('the high instance is less fogged than the low one, and only the fix makes it so', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await openProbe(page);
    const probe = await page.evaluate(() => window.__fogProbe());
    console.log(`fog instance probe: ${JSON.stringify(probe.result)}`);

    // FAIL LOUD BEFORE MEASURING. A probe that threw returns nulls, and every comparison below would
    // then be vacuously true against undefined. This is the denominator: prove the run happened.
    expect(probe.errors, 'the probe threw while rendering').toEqual([]);
    expect(probe.result, 'the probe produced no result').not.toBeNull();

    const { patched, prefix } = probe.result;
    expect(patched.isInstanced, 'the probe mesh is not an InstancedMesh, so USE_INSTANCING was never defined').toBe(true);

    // The scene rendered at all: black background, two lit boxes well clear of it.
    expect(patched.background, 'the background is not the black it was cleared to').toBeLessThan(12);
    expect(patched.low, 'the low box did not render').toBeGreaterThan(40);
    expect(patched.high, 'the high box did not render').toBeGreaterThan(40);

    // (1) THE FIX. The high box sits past the fog falloff, so it keeps only the 0.55 residual and must
    // come back visibly brighter. Same depth, same material, same light: altitude is the only variable.
    expect(
      patched.high - patched.low,
      `height fog is not per-instance: low=${patched.low} high=${patched.high} (expected the high box clearly brighter)`
    ).toBeGreaterThan(15);

    // (2) THE MUTATION REPRODUCES THE DEFECT. Without instanceMatrix both instances read the same
    // world Y, so the two boxes must be indistinguishable. If this ever fails, the "mutation" is not
    // reproducing the bug and assertion 1 is proving less than it appears to.
    expect(
      Math.abs(prefix.high - prefix.low),
      `the pre-fix chunk did not reproduce the defect: low=${prefix.low} high=${prefix.high} should be equal`
    ).toBeLessThanOrEqual(EQ);

    // (3) THE CONTROL. The low box is below sea level under BOTH chunks, so the fix must not have moved
    // it. This is what rules out the boring alternative explanation -- that the patch shifted fog
    // globally rather than giving each instance its own altitude.
    expect(
      Math.abs(patched.low - prefix.low),
      `the fix changed the LOW box too, so the delta above is not the height term: ${patched.low} vs ${prefix.low}`
    ).toBeLessThanOrEqual(EQ);

    expect(consoleErrors, 'the page logged errors').toEqual([]);
  });

  test('every stock material three fogs links under the shipped chunk, and the probe sees one that does not', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await openProbe(page);
    const probe = await page.evaluate(() => window.__fogLinkProbe());
    console.log(`fog link probe: ${JSON.stringify(probe.result)}`);

    expect(probe.errors, 'the probe threw while compiling').toEqual([]);
    expect(probe.result, 'the probe produced no result').not.toBeNull();
    const { shipped, transformed, uncovered, foggedShaders } = probe.result;
    const types = (programs) => programs.map((p) => p.type).sort();

    // THE DENOMINATOR. Every stock vertex shader three fogs is compiled by some material in the sweep, and every
    // material in the sweep produced its own program, compiled with USE_FOG.
    expect(foggedShaders, 'the probe found no stock shader that includes fog_vertex').toBeGreaterThan(0);
    expect(uncovered, 'a stock shader that includes fog_vertex is not compiled by the sweep').toEqual([]);
    expect(types(shipped.programs), 'the sweep did not compile one program per fogged material').toEqual([...probe.constants.types].sort());
    expect(shipped.programs.filter((p) => !p.fogged).map((p) => p.type), 'these programs compiled without USE_FOG, so fog_vertex was not in them').toEqual([]);
    expect(shipped.programs.filter((p) => p.instanced).length, 'the sweep compiled no instanced program').toBe(1);

    // THE FIX: nothing fails to link under the shipped chunk, sprites included.
    expect(shipped.programs.filter((p) => !p.linked).map((p) => p.type), 'these fogged materials do not link under the shipped fog_vertex').toEqual([]);

    // THE MUTANT: a chunk that reads `transformed` fails for the sprite and nothing else, so the reading above
    // comes from an instrument that sees a failed link.
    expect(types(transformed.programs), 'the mutant sweep compiled a different set of programs').toEqual(types(shipped.programs));
    expect(
      transformed.programs.filter((p) => !p.linked).map((p) => p.type),
      'the `transformed` chunk did not fail exactly the sprite: the probe cannot see the defect it guards'
    ).toEqual(['SpriteMaterial']);

    expect(consoleErrors, 'the page logged errors').toEqual([]);
  });

  test('a fogged sprite draws, fogged at its own world Y under a pitched camera', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await openProbe(page);
    const probe = await page.evaluate(() => window.__fogSpriteProbe());
    console.log(`fog sprite probe: ${JSON.stringify(probe.result)}`);

    expect(probe.errors, 'the probe threw while rendering').toEqual([]);
    expect(probe.result, 'the probe produced no result').not.toBeNull();
    const { shipped, transposed } = probe.result;

    expect(shipped.linked, 'the SpriteMaterial program did not link').toBe(true);
    expect(shipped.sprites.length, 'the sprite scene placed no sprites').toBe(3);
    expect(shipped.background, 'the background is not the black it was cleared to').toBeLessThan(12);
    for (const s of shipped.sprites) {
      expect(s.measured, `the sprite at world Y ${s.worldY.toFixed(1)} did not draw`).toBeGreaterThan(DREW);
      // Each sprite's sample against the fog formula at its own world Y. If Atmosphere.jsx's fog constants move,
      // the probe's SEA_Y / FALLOFF / RESIDUAL move with them.
      expect(
        Math.abs(s.measured - s.expected),
        `the sprite at world Y ${s.worldY.toFixed(1)} (depth ${s.depth.toFixed(1)}) read ${s.measured.toFixed(1)}, the fog formula gives ${s.expected.toFixed(1)}`
      ).toBeLessThanOrEqual(SPRITE_TOL);
    }

    // THE MUTANT: the same scene with R in place of R^T must draw and read the wrong heights, or the pitched camera
    // is not exercising the rotation and the readings above prove only the translation.
    expect(transposed.linked, 'the transposed mutant did not link, so its miss says nothing about the rotation').toBe(true);
    for (const s of transposed.sprites) expect(s.measured, 'a sprite under the transposed mutant did not draw').toBeGreaterThan(DREW);
    const worstMiss = Math.max(...transposed.sprites.map((s) => Math.abs(s.measured - s.expected)));
    expect(worstMiss, 'the transposed mutant reads the same heights: the camera pitch does not separate R from R^T').toBeGreaterThan(3 * SPRITE_TOL);

    expect(consoleErrors, 'the page logged errors').toEqual([]);
  });
});
