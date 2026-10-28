// @vitest-environment jsdom
// The baked game-icon set is a lazy chunk (W1-G). This holds the chunk back behind a gate so both halves are seen in
// one run: the placeholder before it lands, and the drawn glyph in the same element after.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Icon } from '../../src/ui/primitives/Icon.jsx';

const { gate, release } = vi.hoisted(() => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
});

vi.mock('../../src/ui/primitives/gameIcons.js', async (importOriginal) => {
  await gate;
  return importOriginal();
});

afterEach(cleanup);

describe('Icon with the lazily loaded game-icon set', () => {
  it('lucide chrome icons draw while the game set is still held back', () => {
    render(<Icon name="settings" size={18} data-testid="chrome" />);
    expect(screen.getByTestId('chrome').querySelector('path, circle')).not.toBeNull();
  });

  it('holds the box with an empty svg until the set lands, then draws the glyph in that same element', async () => {
    render(<Icon name="sword" size={24} className="text-accent" data-testid="i" />);
    const placeholder = screen.getByTestId('i');
    expect(placeholder.tagName.toLowerCase()).toBe('svg');
    expect(placeholder.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(placeholder.getAttribute('width')).toBe('24');
    expect(placeholder.getAttribute('height')).toBe('24');
    expect(placeholder).toHaveClass('text-accent');
    expect(placeholder.querySelector('path')).toBeNull();

    release();

    await waitFor(() => expect(screen.getByTestId('i').querySelector('path[d]')).not.toBeNull());
    const drawn = screen.getByTestId('i');
    expect(drawn).toBe(placeholder);
    expect(drawn.getAttribute('width')).toBe('24');
    expect(drawn.querySelector('path[d]').getAttribute('d').length).toBeGreaterThan(100);
  });

  it('an icon mounted after the set has landed draws on its first render', () => {
    render(<Icon name="coins" size={18} data-testid="late" />);
    expect(screen.getByTestId('late').querySelector('path[d]')).not.toBeNull();
  });
});
