// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// EVERY R3F CANVAS PINS ITS DEVICE PIXEL RATIO IN CAPTURE MODE.
//
// `dpr={[1, 2]}` is an adaptive RANGE. A canvas that rasterises at a different ratio between two runs
// re-antialiases every edge, and the visual gate byte-compares — so the whole frame differs for a
// reason unrelated to the code under test.
//
// This cost the 2026-08-08 re-baseline: menu.png measured 0.984% run-to-run against a < 0.15% bar, and
// the diff was outlines tracing every edge of the diorama plus the borders of motes that had not moved.
// GameScene already disabled AdaptiveDpr under isCaptureMode and pinned PROBE_DPR for the perf probe;
// TitleDiorama and MascotStudio never got the same treatment, and both feed gated baselines.
//
// WORTH KEEPING STRAIGHT: waitForStableFrame was satisfied in BOTH runs — no "never stabilized" warning
// fired. The frame stopped changing, at a different state each time. Stable is not deterministic, and
// this covers the half stability cannot.
//
// BEHAVIOURAL, not a source grep: it RENDERS the component and reads the prop the Canvas actually
// receives, so a refactor that computes dpr some other way is still covered.
let captureOn = true;
const seen = [];

vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  Canvas: (props) => {
    seen.push(props.dpr);
    return null;
  },
  useFrame: () => {},
  useThree: () => ({ camera: {}, scene: {} })
}));
vi.mock('../../src/devtest/captureMode', () => ({ isCaptureMode: () => captureOn }));

const { TitleDiorama } = await import('../../src/render/TitleDiorama.jsx');

describe('capture determinism: the title diorama pins dpr under capture', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('pins dpr to a single number in capture mode', () => {
    captureOn = true;
    render(<TitleDiorama />);
    expect(seen, 'the Canvas never rendered — the mock or the import is wrong').toHaveLength(1);
    expect(typeof seen[0], `dpr was ${JSON.stringify(seen[0])}; an array is an adaptive RANGE`).toBe('number');
  });

  it('keeps the adaptive range in normal play, where determinism does not matter', () => {
    // The fix must not cost real players their adaptive resolution — proving the gate is about capture,
    // not about hardcoding one ratio everywhere.
    captureOn = false;
    render(<TitleDiorama />);
    expect(seen).toHaveLength(1);
    expect(Array.isArray(seen[0])).toBe(true);
  });
});
