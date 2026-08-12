// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE RING BUFFER WAS ASSERTED BY GREPPING FOR `.slice(-`.
//
// That match is satisfied by a slice with the wrong N, a slice applied to the wrong array, a slice whose
// result is discarded, or the string appearing in a comment — and it is NOT satisfied by a correct cap
// written any other way (`at(-1)`, a windowed map, a reduce). It could neither confirm the cap nor allow
// a legitimate rewrite, which is the worst of both. The cap is the whole point of a log ticker: without
// it, a long fight walks the feed up the screen. That is renderable, so render it and COUNT THE LINES.
//
// The desktop/touch split matters here too — the component picks 8 or 4 from `isTouchUIMode()`, and the
// old suite asserted neither number. A regression to a single hardcoded cap would have passed it.
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
vi.mock('../../src/devtest/captureMode', () => ({ isCaptureMode: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { isCaptureMode } from '../../src/devtest/captureMode';
import { CombatLog } from '../../src/ui/CombatLog.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));

/** n notifications, each with a findable text, oldest first — so a HEAD slice and a TAIL slice differ. */
const feed = (n) => Array.from({ length: n }, (_, i) => ({ id: i, type: 'info', text: `event-${i}` }));

/** Every rendered line, in DOM order. Anchored to the text nodes the component actually emits. */
const renderedLines = (container) =>
  [...container.querySelectorAll('span')].map((el) => el.textContent).filter((t) => /^event-\d+$/.test(t));

afterEach(() => { cleanup(); isTouchUIMode.mockReturnValue(false); isCaptureMode.mockReturnValue(false); });

describe('combat log — the ring buffer, driven rather than grepped', () => {
  it('caps at 8 lines on desktop no matter how long the fight is', () => {
    const { container } = render(createElement(CombatLog, { notifications: feed(50) }));
    expect(renderedLines(container).length, 'the feed is not capped — a long fight walks it up the screen').toBe(8);
  });

  it('keeps the NEWEST entries, not the oldest', () => {
    // The direction is the half a `.slice(-` grep could never check, and it is the half that makes the
    // component useful: a head slice caps the line count just as well and shows you the start of the fight.
    const { container } = render(createElement(CombatLog, { notifications: feed(50) }));
    expect(renderedLines(container)).toEqual([
      'event-42', 'event-43', 'event-44', 'event-45', 'event-46', 'event-47', 'event-48', 'event-49',
    ]);
  });

  it('caps at 4 on touch, where the screen is smaller', () => {
    isTouchUIMode.mockReturnValue(true);
    const { container } = render(createElement(CombatLog, { notifications: feed(50) }));
    const lines = renderedLines(container);
    expect(lines.length, 'touch uses the desktop cap — it eats a phone HUD').toBe(4);
    expect(lines[3]).toBe('event-49');
  });

  it('shows every line when there are fewer than the cap, and nothing at all when there are none', () => {
    // The presence case before the absence case: without it, "renders nothing" is indistinguishable from
    // a component that renders nothing ever, which is how a dead feed reports healthy.
    const { container, rerender } = render(createElement(CombatLog, { notifications: feed(3) }));
    expect(renderedLines(container)).toEqual(['event-0', 'event-1', 'event-2']);
    rerender(createElement(CombatLog, { notifications: [] }));
    expect(container.textContent, 'an empty feed still paints something').toBe('');
  });

  it('renders NOTHING in capture mode, so the visual baselines cannot see it', () => {
    isCaptureMode.mockReturnValue(true);
    const { container } = render(createElement(CombatLog, { notifications: feed(50) }));
    expect(container.textContent, 'the log leaks into the deterministic frames').toBe('');
  });

  it('sits bottom-left and takes no pointer events, on the element it actually renders', () => {
    // Still structural, but read off the rendered DOM rather than the source text — a class named in a
    // comment or on a branch that never renders cannot satisfy this.
    const { container } = render(createElement(CombatLog, { notifications: feed(2) }));
    const root = container.firstElementChild;
    expect(root, 'nothing rendered, so the layout assertion below would be vacuous').toBeTruthy();
    for (const cls of ['absolute', 'left-4', 'pointer-events-none']) {
      expect(root.className, `the log is not ${cls} — it can cover the HUD or swallow clicks`).toContain(cls);
    }
    expect(root.className, 'the log is not anchored to the bottom').toMatch(/\bbottom-/);
  });
});

describe('combat log — the HUD wiring', () => {
  it('HUD feeds it the live questSystem notification stream', () => {
    // The one assertion that stays textual: rendering HUD needs the store, a live quest system and a
    // mounted canvas, and the thing under test is a single prop edge. Anchored to the JSX attribute form
    // rather than to a bare token, so a mention in a comment cannot satisfy it.
    const hud = readFileSync(resolve(HERE, '../../src/HUD.jsx'), 'utf8');
    expect(hud).toMatch(/<CombatLog[^>]*notifications=\{questSystem\.notifications\}/);
  });
});
