// @vitest-environment jsdom
// The baked game-icon set is a lazy chunk. This holds the chunk back behind a gate so both halves are seen in one
// run: the placeholder before it lands, and the drawn glyph in the same element after.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const held = vi.hoisted(() => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  // Lives in the hoisted block: the mock factory below runs before this file's top-level constants exist.
  return { gate, release, iconImported: false, eagerDeadlineMs: 2000 };
});

// Under an EAGER import, Icon.jsx's own import waits on this mock, so this file's imports never finish and the gate
// is never released: without a deadline the suite hangs instead of failing. A lazy Icon.jsx finishes importing at
// once, which the flag set below the imports records, so a slow release is never mistaken for an eager import.
vi.mock('../../src/ui/primitives/gameIcons.js', async (importOriginal) => {
  await Promise.race([
    held.gate,
    new Promise((resolve, reject) => setTimeout(() => {
      if (held.iconImported) resolve(held.gate);
      else reject(new Error('EAGER_ICON_IMPORT: Icon.jsx had not finished importing after '
        + `${held.eagerDeadlineMs} ms because it waits on gameIcons.js, so the game-icon set is in the boot chunk again`));
    }, held.eagerDeadlineMs)),
  ]);
  return importOriginal();
});

import { Icon } from '../../src/ui/primitives/Icon.jsx';
held.iconImported = true;

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

    held.release();

    await waitFor(() => expect(screen.getByTestId('i').querySelector('path[d]')).not.toBeNull());
    const drawn = screen.getByTestId('i');
    expect(drawn).toBe(placeholder);
    expect(drawn.getAttribute('width')).toBe('24');
    expect(drawn.querySelector('path[d]').getAttribute('d').length).toBeGreaterThan(100);
  });

  it('an icon mounted after the set has landed draws on its first render', async () => {
    // Lands the set itself, so this holds when run alone (-t) as well as after the test above.
    render(<Icon name="sword" size={24} data-testid="probe" />);
    held.release();
    await waitFor(() => expect(screen.getByTestId('probe').querySelector('path[d]')).not.toBeNull());
    cleanup();

    render(<Icon name="coins" size={18} data-testid="late" />);
    expect(screen.getByTestId('late').querySelector('path[d]')).not.toBeNull();
  });
});
