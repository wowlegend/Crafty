import { test, expect } from './_fixtures.js';

// THE GPU HALF OF THE HEIGHT-FOG INSTANCING FIX, AND WHY IT NEEDED ITS OWN SPEC.
//
// `tests/gates/height-fog-instancing-gates.test.js` executes installHeightFog() and asserts the shader
// source it writes into THREE.ShaderChunk. That is a genuine execution test and it still cannot answer
// the question the fix was about: does a GPU, compiling that chunk for a real InstancedMesh, fog two
// instances at different altitudes differently. Nothing answered it. During the re-baseline that
// followed the fix I misread a stale diff image as evidence that it did, corrected the claim in the
// commit, and left it explicitly unverified. This spec is that debt paid.
//
// THE CONTROL THAT MAKES IT A HEIGHT TEST. Both boxes sit on the camera's forward axis at the same
// view-space depth, so vFogDepth is identical for both and every difference in the sampled pixel comes
// from the height term. See tests/e2e/_fog-probe.html for the scene.
//
// THE MUTATION RUNS ON EVERY PASS, rather than once by hand. The probe renders the scene TWICE: once
// with the shipped chunk, once with the pre-fix chunk (world Y from modelMatrix alone). Under the
// pre-fix chunk an InstancedMesh at the origin hands every instance the same local Y, so the two boxes
// must come back identical -- that IS the defect, reproduced in its own shape. If the fix regresses,
// assertion 1 fails; if the mutation stops reproducing the defect, assertion 2 fails.
//
// MUTATION-PROOF: reverting Atmosphere.jsx's `#ifdef USE_INSTANCING` branch to the plain
// `modelMatrix * vec4( transformed, 1.0 )` form makes the two variants identical and takes assertion 1
// RED. Deleting installHeightFog()'s module-scope call takes the whole probe RED (no vFogWorldY varying,
// shader link error).

const EQ = 3; // GPU rounding slack for samples the shader math says must be equal

test.describe('height fog reads each INSTANCE own world Y, on a real GPU', () => {
  test('the high instance is less fogged than the low one, and only the fix makes it so', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto('/tests/e2e/_fog-probe.html');
    await page.waitForFunction(() => window.__fogProbeReady === true, null, { timeout: 30000 });

    const probe = await page.evaluate(() => window.__fogProbe());

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
});
