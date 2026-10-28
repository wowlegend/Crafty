// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { setActive, getInput } from '../../src/input/inputState.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// A tap is a lift and then a click, and the browser hit-tests the click after the lift's handlers have run. If the
// lift pauses, the resume overlay is already on top when the click arrives, so the click resumes play. jsdom has no
// hit-testing, so this drives the two halves of the tap separately and asserts which one pauses.
// The lived check is tests/e2e/pause-freezes-world.spec.js (the touch case), which CI runs.

vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

afterEach(() => {
  cleanup();
  setActive(false);
});

describe('the touch Pause pauses on the click of the tap, not on the lift', () => {
  it('the lift alone leaves play running; the click pauses', () => {
    setActive(true);
    render(<TouchControls isWorldBuilt />);
    const pause = screen.getByTestId('touch-pause');
    fireEvent.pointerDown(pause);
    fireEvent.pointerUp(pause);
    expect(getInput().active, 'the lift paused, so the click that follows lands on the resume overlay').toBe(true);
    fireEvent.click(pause);
    expect(getInput().active, 'the click on Pause did not pause').toBe(false);
    expect(screen.queryByTestId('touch-pause'), 'the Pause control is still offered while paused').toBeNull();
  });
});
