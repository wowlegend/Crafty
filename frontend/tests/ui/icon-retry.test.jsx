// @vitest-environment jsdom
// A failed icon-chunk load must not leave every game icon a placeholder for the session. The mock below rejects
// the first two loads (the boot request, then the first remount's retry) and serves the real set on the third.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const chunk = vi.hoisted(() => ({ calls: 0, failures: 2 }));

vi.mock('../../src/ui/primitives/gameIcons.js', async (importOriginal) => {
  chunk.calls += 1;
  if (chunk.calls <= chunk.failures) throw new Error(`simulated chunk 404 #${chunk.calls}`);
  return importOriginal();
});

afterEach(cleanup);

describe('Icon after the game-icon chunk fails to load', () => {
  it('retries on the next mount, draws once a retry lands, and logs the failure once', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { Icon } = await import('../../src/ui/primitives/Icon.jsx');

    await waitFor(() => expect(logged).toHaveBeenCalledTimes(1));
    expect(chunk.calls).toBe(1);
    expect(String(logged.mock.calls[0][0])).toMatch(/game-icon chunk failed to load/);

    // First remount: its retry also fails. Still a placeholder, and no second log line.
    const first = render(<Icon name="sword" size={24} data-testid="a" />);
    await waitFor(() => expect(chunk.calls).toBe(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('a').querySelector('path')).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    first.unmount();

    // Second remount: the retry succeeds and the glyph draws in place.
    render(<Icon name="sword" size={24} data-testid="b" />);
    await waitFor(() => expect(screen.getByTestId('b').querySelector('path[d]')).not.toBeNull());
    expect(chunk.calls).toBe(3);
    expect(logged).toHaveBeenCalledTimes(1);

    // Once loaded, a further mount draws on its first render and asks for nothing.
    render(<Icon name="coins" size={18} data-testid="c" />);
    expect(screen.getByTestId('c').querySelector('path[d]')).not.toBeNull();
    expect(chunk.calls).toBe(3);
    logged.mockRestore();
  });
});
