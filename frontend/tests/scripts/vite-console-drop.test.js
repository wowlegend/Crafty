import { describe, it, expect } from 'vitest';
import config from '../../vite.config.js';

// `esbuild.drop` MUST NOT REACH THE DEV SERVER.
//
// Top-level `esbuild` options in a Vite config apply to the dev server's transform as well as the
// production build, so `drop: ['console', 'debugger']` was deleting every console call out of the
// modules `vite dev` serves — and the dev server is what almost every instrument in this repo drives.
//
// MEASURED 2026-08-12 against a running dev server on :4245, before the fix:
//   curl /src/ui/ErrorBoundary.jsx  ->  11,888 bytes, ZERO occurrences of `console.error`
//   curl /src/MenuSystem.jsx        ->  ZERO occurrences of `console.warn`
// After: 1 and 1, at 12,018 bytes. Production still drops them — a fresh build contains zero
// `console.*` from app source (the single survivor is inside the pre-bundled r3f vendor chunk, which
// the app's esbuild pass never transforms).
//
// What had been silently blind: capture.mjs's `page.on('console')` crash filter (it runs against the
// DEV server), the console-error collectors in height-fog-instancing.spec.js and perf-siege.spec.js,
// and the ErrorBoundary's own crash log. Every one of them reports PASS by finding no errors, over a
// stream that the build config had emptied. That is this repo's signature defect — an instrument
// reporting clean over input it never received — installed at the toolchain level.
//
// This asserts the CONFIG, which is where the decision lives. The end-to-end proof is a live fetch and
// deliberately does not live in this suite: a network assertion inside the offline unit run would go red
// from weather rather than from a defect.
const resolve = (command) => config({ command, mode: command === 'build' ? 'production' : 'development' });

describe('the vite config drops console in production only', () => {
  it('is a FUNCTION of the command, which is the only way to distinguish the two', () => {
    // A plain-object config cannot express this at all, so the shape is itself part of the fix.
    expect(typeof config, 'vite.config.js exports a static object — dev and build cannot differ').toBe('function');
  });

  it('drops console and debugger for a production BUILD', () => {
    const drop = resolve('build').esbuild?.drop || [];
    expect(drop, 'console survives into the shipped bundle').toContain('console');
    expect(drop, 'debugger statements survive into the shipped bundle').toContain('debugger');
  });

  it('drops NOTHING when serving, so the harnesses can see the console', () => {
    const drop = resolve('serve').esbuild?.drop || [];
    expect(drop, 'the dev server is stripping console again — every console-reading probe goes silently blind').toEqual([]);
  });

  it('the two branches genuinely differ — otherwise one of the assertions above is decorative', () => {
    expect(resolve('build').esbuild?.drop).not.toEqual(resolve('serve').esbuild?.drop);
  });

  it('the rest of the config survives being a function (build output is still configured)', () => {
    // Converting an object config to a function is an easy place to drop half the file on the floor.
    const built = resolve('build');
    expect(built.build?.outDir, 'the build output directory went missing in the conversion').toBe('build');
    expect(built.plugins?.length, 'the react plugin went missing in the conversion').toBeGreaterThan(0);
    expect(typeof built.build?.rollupOptions?.output?.manualChunks,
      'the manualChunks splitter went missing — the vendor chunks would collapse into the app entry').toBe('function');
  });
});
