// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { SimpleExperienceBarTouch } from '../../src/SimpleExperienceSystem.jsx';

// Touch progression visibility (2026-06-14): the desktop XP bar (SimpleExperienceBar, bottom-center,
// min-w-80) is `!isTouchUIMode()` desktop-only because it collides with the thumb/joystick zone — so a
// touch player had ZERO level/XP visibility. This compact top-placed readout restores it on touch.
const __dir = dirname(fileURLToPath(import.meta.url));
afterEach(cleanup);

describe('SimpleExperienceBarTouch — compact touch level/XP readout', () => {
  it('shows the player level', () => {
    render(<SimpleExperienceBarTouch level={7} xpProgress={42} />);
    expect(screen.getByText(/LV\s*7/)).toBeTruthy();
  });

  it('renders the XP progress as the fill-bar width (static — capture-deterministic, no framer animation)', () => {
    const { container } = render(<SimpleExperienceBarTouch level={3} xpProgress={42} />);
    expect(container.querySelector('[style*="width: 42%"]')).toBeTruthy();
  });

  it('HUD mounts it on TOUCH ONLY (gated on isTouchUIMode — desktop keeps the bottom bar)', () => {
    const hud = readFileSync(resolve(__dir, '../../src/HUD.jsx'), 'utf8');
    expect(hud).toMatch(/isTouchUIMode\(\)\s*&&\s*<SimpleExperienceBarTouch/);
  });
});
