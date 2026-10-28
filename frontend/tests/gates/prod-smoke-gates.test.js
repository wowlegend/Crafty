import { describe, it, expect } from 'vitest';
import { isFatalMessage, seamVerdict, LOOKBOOK_SEAM_METHODS } from '../../scripts/ci/prod-smoke.mjs';
import { installLookbookSeam, _resetLookbookForTest } from '../../src/render/lookbookSeam.js';

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

describe('prod-smoke: the lookbook seam ships in the production bundle, and only behind ?lookbook=1', () => {
  const ran = (seam) => ({ entryRan: true, seam });
  const open = (methods) => ({ entryRan: true, methods });
  it('passes when the seam is absent on a plain page and whole with the parameter', () => {
    expect(seamVerdict({ plain: ran('undefined'), opened: open([...LOOKBOOK_SEAM_METHODS]) }).ok).toBe(true);
  });
  it('fails when the bundle lost the install, when a method is gone, and when a plain page carries the seam', () => {
    const missing = seamVerdict({ plain: ran('undefined'), opened: open(null) });
    expect(missing.ok).toBe(false);
    expect(missing.line).toMatch(/MISSING from the production bundle/);
    const partial = seamVerdict({ plain: ran('undefined'), opened: open(LOOKBOOK_SEAM_METHODS.filter((m) => m !== 'look')) });
    expect(partial.ok).toBe(false);
    expect(partial.line).toMatch(/lacks look$/);
    const leaked = seamVerdict({ plain: ran('object'), opened: open([...LOOKBOOK_SEAM_METHODS]) });
    expect(leaked.ok).toBe(false);
    expect(leaked.line).toMatch(/WITHOUT \?lookbook=1/);
  });
  it('a page whose entry module never ran is COULD NOT CHECK, never an absence', () => {
    for (const r of [
      { plain: { entryRan: false, seam: 'undefined' }, opened: open([...LOOKBOOK_SEAM_METHODS]) },
      { plain: ran('undefined'), opened: { entryRan: false, methods: null } },
    ]) {
      const v = seamVerdict(r);
      expect(v.ok, JSON.stringify(r)).toBe(false);
      expect(v.line).toMatch(/COULD NOT CHECK/);
    }
  });
  it('demands exactly the methods the real seam installs', () => {
    _resetLookbookForTest();
    const win = { location: { search: '?lookbook=1' } };
    installLookbookSeam(win, { store: { getState: () => ({}) }, setActive() {}, getActive: () => false, cycleOf: () => 0, glInfo: () => null, contextLosses: () => 0 });
    expect(Object.keys(win.__craftyLookbook).sort()).toEqual([...LOOKBOOK_SEAM_METHODS]);
  });
});
