// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// THE APP ITSELF CARRIES THE LAZYMOTION PROVIDER (W2-L, DECISIONS 2026-10-30).
//
// tests/gates/lazy-motion-strict-gates.test.jsx mounts every animated panel under MotionProvider, which it imports
// itself: that proves the panels render `m` and the provider works, and cannot see whether App ever renders the provider.
// An App without it leaves every `m` in the game with no features: each panel stays at its `initial` (opacity 0) for
// good and nothing throws. This renders the real App, with only the two 3D scenes stubbed out, and reads the title overlay's
// own fade: its opacity must start at the `initial` the overlay renders with and arrive at 1.
//
// WHAT THIS DOES NOT CHECK: any panel but the title (the strict gate has them), the 3D scenes (stubbed), or a browser
// (jsdom drives framer-motion's JavaScript animation; tests/e2e/lazy-motion.spec.js watches a panel animate in Chromium).
//
// Mutation-Proof: see the commit trailer.

vi.stubGlobal('Worker', class { postMessage() {} addEventListener() {} removeEventListener() {} terminate() {} });
// jsdom's media element implements neither play() (MusicPlayer chains .catch on it) nor pause().
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
vi.mock('../../src/GameScene', () => ({ GameScene: () => null }));
// The title's 3D vista is a second R3F Canvas, which needs a ResizeObserver jsdom lacks and unmounts the whole tree without.
vi.mock('../../src/render/TitleDiorama', () => ({ TitleDiorama: () => null }));

afterEach(() => { cleanup(); });

describe('App renders the provider that gives every m component its features', () => {
  it('the title overlay fades from its initial opacity to 1', async () => {
    const { default: App } = await import('../../src/App.jsx');
    render(<App />);
    const start = screen.getByRole('button', { name: /start adventure/i });
    const overlay = start.closest('[style*="z-index: 9999"]');
    expect(overlay, 'SETUP: the title overlay (z-index 9999) was not found around Start Adventure').toBeTruthy();
    const seen = [Number(overlay.style.opacity)];
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline && seen[seen.length - 1] !== 1) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.push(Number(overlay.style.opacity));
    }
    expect(seen[0], `the overlay did not start at its initial opacity (0): ${JSON.stringify(seen.slice(0, 5))}`).toBe(0);
    expect(seen[seen.length - 1], `the title never faded in (${seen.length} samples): App renders no features provider, so every m component is frozen at its initial state`).toBe(1);
  });
});
