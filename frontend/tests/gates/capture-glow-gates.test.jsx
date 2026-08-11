// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';

// A CAPTURE GUARD IN A RENDER BODY IS A FUNCTION OF THE RENDER SCHEDULE, NOT THE FLAG.
//
// `isCaptureMode()` is a mutable module-level flag with no subscription channel. So
// `{!isCaptureMode() && <Emissive .../>}` in a render body only re-evaluates if something else causes
// that component to re-render — and HubRender's buildings are static: no props, nothing above them
// changing, mounted long before the harness calls `enterCapture`.
//
// They render once, with the flag false, and the forge fire and lookout lantern shipped straight into the
// deterministic baselines the guard existed to keep them out of. The component's own header claims the
// glow "self-nulls under isCaptureMode", which is the property it does not have.
//
// The fix is `useFrame` — the subscription the flag lacks. This gate drives frames explicitly rather than
// waiting for a renderer, so it can assert the guard tracks the FLAG rather than the schedule.
let frameCallbacks = [];
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { frameCallbacks.push(cb); },   // CAPTURE the callback — a no-op mock would make
  useThree: () => ({ camera: null }),               // every assertion below pass for the wrong reason
  extend: () => {},
}));

// Emissive is stubbed as a ref-forwarding host element. That is deliberate and not a shortcut: the seam
// under test is "does this component write `visible` on its mesh every frame", and a stub lets the
// assertion read the very object the component writes to, with no R3F renderer in the way. The real
// Emissive already forwards its ref to a <mesh>, so the contract being exercised is the real one.
vi.mock('../../src/render/mascots/voxelKit', () => ({
  Emissive: require('react').forwardRef((props, ref) => require('react').createElement('div', { ref, 'data-glow': '1' })),
  Cube: () => null,
}));

const tick = () => frameCallbacks.forEach((cb) => cb({}, 1 / 60));
const glowNode = (c) => c.querySelector('[data-glow]');

describe('CaptureNullGlow — visibility tracks the flag, not the last render', () => {
  beforeEach(() => { frameCallbacks = []; exitCaptureMode(); });
  afterEach(() => { cleanup(); exitCaptureMode(); });

  it('registers a frame callback at all — the instrument check', () => {
    // If the component stopped subscribing, every "it hid itself" assertion below would be satisfied by
    // a mesh that was never rendered. Assert the subscription exists before trusting anything it does.
    return import('../../src/render/captureGlow.jsx').then(({ CaptureNullGlow }) => {
      render(<CaptureNullGlow position={[0, 1, 0]} size={0.4} color="#FF7A1A" intensity={2.6} />);
      expect(frameCallbacks.length, 'no useFrame subscription — the guard has no channel to the flag').toBe(1);
    });
  });

  it('CONTROL — outside capture the glow is visible', async () => {
    const { CaptureNullGlow } = await import('../../src/render/captureGlow.jsx');
    const { container } = render(<CaptureNullGlow position={[0, 1, 0]} size={0.4} />);
    tick();
    const mesh = glowNode(container);
    expect(mesh, 'nothing rendered — the control is dead').toBeTruthy();
    expect(mesh.visible ?? true).not.toBe(false);
  });

  it('hides once capture is entered AFTER mount — the real sequence, and the whole defect', async () => {
    const { CaptureNullGlow } = await import('../../src/render/captureGlow.jsx');
    const { container } = render(<CaptureNullGlow position={[0, 1, 0]} size={0.4} />);
    // The harness flips the flag here: after boot, after mount, with no re-render of this subtree.
    enterCaptureMode();
    tick();
    expect(
      glowNode(container).visible,
      'the glow stayed visible after capture began — it was baked in at mount and shipped into the baselines'
    ).toBe(false);
  });

  it('comes back when capture ends, so the guard does not latch', async () => {
    const { CaptureNullGlow } = await import('../../src/render/captureGlow.jsx');
    const { container } = render(<CaptureNullGlow position={[0, 1, 0]} size={0.4} />);
    enterCaptureMode();
    tick();
    expect(glowNode(container).visible).toBe(false);
    exitCaptureMode();
    tick();
    expect(glowNode(container).visible, 'the guard latched off').toBe(true);
  });
});
