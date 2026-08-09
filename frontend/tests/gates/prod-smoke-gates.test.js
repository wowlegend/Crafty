import { describe, it, expect } from 'vitest';
import { isFatalMessage } from '../../scripts/ci/prod-smoke.mjs';

// The production bundle is the ONE artifact this repo ships and the one nothing ever loaded. Every
// harness drives the dev server, so `npm run build` proved it COMPILED and bundle-budget proved it was
// the right SIZE, while whether it RUNS went unasked — against a repo whose signature defect is
// "compiles, gates green, never runs".
//
// This tests the one pure decision in that smoke test: which messages are worth failing over. A filter
// that excludes too much turns the smoke test into a green light over a broken bundle, which is strictly
// worse than not having it.
describe('prod-smoke: the noise filter keeps its teeth', () => {
  it('treats a real application error as fatal', () => {
    expect(isFatalMessage('Uncaught TypeError: t.foo is not a function')).toBe(true);
    expect(isFatalMessage('THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false')).toBe(true);
    expect(isFatalMessage('Failed to load module script')).toBe(true);
  });

  it('excludes environment noise that cannot indicate a broken bundle', () => {
    expect(isFatalMessage('Failed to load resource: favicon.ico 404')).toBe(false);
    expect(isFatalMessage('net::ERR_CONNECTION_REFUSED')).toBe(false);
    expect(isFatalMessage('Download the React DevTools for a better experience')).toBe(false);
  });

  it('excludes the pointer-lock gesture error, which only a headless page can produce', () => {
    // MEASURED, not assumed: the title screen auto-advances into gameplay and gameplay requests pointer
    // lock. A real visitor arrives by clicking START ADVENTURE, which IS a user gesture; a headless page
    // cannot produce one. Excluding it is about the probe, not about lowering the bar.
    expect(isFatalMessage('NotAllowedError: A user gesture is required to request Pointer Lock.')).toBe(false);
  });

  it('does not fail on an empty or missing message', () => {
    expect(isFatalMessage('')).toBe(false);
    expect(isFatalMessage(null)).toBe(false);
    expect(isFatalMessage(undefined)).toBe(false);
  });

  it('the exclusions are NARROW — a real error merely mentioning an excluded word still fails', () => {
    // The trap in every allowlist: a pattern loose enough to swallow the thing it was never meant to.
    expect(isFatalMessage('TypeError: cannot read favicon of undefined in renderer boot')).toBe(true);
    expect(isFatalMessage('Pointer Lock failed: WebGL context lost')).toBe(true);
  });
});
