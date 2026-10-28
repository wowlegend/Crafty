// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Panel } from '../../src/ui/primitives/Panel.jsx';

afterEach(cleanup);

describe('Panel', () => {
  it('renders children and the bold-flat chrome classes', () => {
    render(<Panel data-testid="p">hello</Panel>);
    const el = screen.getByTestId('p');
    expect(el).toHaveTextContent('hello');
    expect(el.className).toMatch(/border-chrome/);
    expect(el.className).toMatch(/border-ink/);
    expect(el.className).toMatch(/shadow-elev/);
    expect(el.className).toMatch(/bg-panel/);
  });

  it('applies the raised variant + merges a passed className', () => {
    render(<Panel variant="raise" className="w-40" data-testid="p">x</Panel>);
    const el = screen.getByTestId('p');
    expect(el.className).toMatch(/bg-panel-raise/);
    expect(el.className).toMatch(/\bw-40\b/);
  });

  // cn joins without resolving conflicts, so a replaced default must be ABSENT, not merely outvoted.
  const tokens = (el, prefix) => el.className.split(/\s+/).filter((c) => c.startsWith(prefix));
  it('a named override replaces the variant default instead of joining beside it', () => {
    render(<Panel variant="inset" bg="bg-slot" text="text-text-inverse" radius="rounded-full" shadow="shadow-elev-xl" data-testid="p">x</Panel>);
    const el = screen.getByTestId('p');
    expect(tokens(el, 'bg-')).toEqual(['bg-slot']);
    expect(tokens(el, 'text-')).toEqual(['text-text-inverse']);
    expect(tokens(el, 'rounded-')).toEqual(['rounded-full']);
    expect(tokens(el, 'shadow-')).toEqual(['shadow-elev-xl']);
  });
  it('without overrides each variant carries exactly one fill, radius and shadow', () => {
    for (const [variant, bg, radius, shadow] of [
      ['base', 'bg-panel', 'rounded-md', 'shadow-elev-md'],
      ['raise', 'bg-panel-raise', 'rounded-md', 'shadow-elev-lg'],
      ['inset', 'bg-panel-inset', 'rounded-sm', 'shadow-none'],
    ]) {
      render(<Panel variant={variant} data-testid={variant}>x</Panel>);
      const el = screen.getByTestId(variant);
      expect([tokens(el, 'bg-'), tokens(el, 'rounded-'), tokens(el, 'shadow-')]).toEqual([[bg], [radius], [shadow]]);
    }
  });
});

import { Button } from '../../src/ui/primitives/Button.jsx';

describe('Button', () => {
  it('renders a real <button> with the primary gold CTA chrome by default', () => {
    render(<Button>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.className).toMatch(/bg-accent/);
    expect(el.className).toMatch(/border-chrome/);
    expect(el.className).toMatch(/border-ink/);
    expect(el.className).toMatch(/shadow-elev/);
  });
  it('supports variant + size + forwards onClick/disabled', () => {
    let clicked = 0;
    render(<Button variant="danger" size="sm" onClick={() => clicked++}>X</Button>);
    const el = screen.getByRole('button', { name: 'X' });
    expect(el.className).toMatch(/bg-danger/);
    el.click();
    expect(clicked).toBe(1);
  });
  it('`text` replaces the variant colour, `icon` drops the padding, `size={null}` leaves sizing to className', () => {
    const classes = (name) => screen.getByRole('button', { name }).className.split(/\s+/);
    render(<Button variant="ghost" size="icon" text="text-text-muted" className="w-9 h-9">I</Button>);
    expect(classes('I').filter((c) => /^text-text/.test(c))).toEqual(['text-text-muted']);
    expect(classes('I').filter((c) => /^(p|px|py)-/.test(c))).toEqual(['p-0']);
    render(<Button size={null} className="gap-2 px-2 py-0.5 text-xs">N</Button>);
    expect(classes('N').filter((c) => /^(px|py|gap)-|^text-(xs|sm|base|lg)$/.test(c))).toEqual(['gap-2', 'px-2', 'py-0.5', 'text-xs']);
  });
});

import { Slot } from '../../src/ui/primitives/Slot.jsx';

describe('Slot', () => {
  it('empty slot uses the slot fill + 4px ink', () => {
    render(<Slot data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/bg-slot/);
    expect(el.className).toMatch(/border-chrome/);
  });
  it('rarity fills with a gradient + inner ring + 2-tone icon color (inline)', () => {
    render(<Slot rarity="legendary" data-testid="s"><span>x</span></Slot>);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('style')).toMatch(/linear-gradient/);
    expect(el.getAttribute('style')).toMatch(/inset/);
  });
  it('selected adds the gold ring + accent border', () => {
    render(<Slot rarity="rare" selected data-testid="s">x</Slot>);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/border-accent-raise/);
    expect(el.getAttribute('style')).toMatch(/var\(--ui-accent\)/);
  });
  it('gear slot uses the gold gear fill', () => {
    render(<Slot gear data-testid="s">x</Slot>);
    expect(screen.getByTestId('s').getAttribute('style')).toMatch(/linear-gradient/);
  });
  it('`display` replaces the grid default instead of joining beside it', () => {
    render(<Slot display="flex" data-testid="s">x</Slot>);
    const cls = screen.getByTestId('s').className.split(/\s+/);
    expect(cls).toContain('flex');
    expect(cls).not.toContain('grid');
  });
});

import { StatBar } from '../../src/ui/primitives/StatBar.jsx';

describe('StatBar', () => {
  it('clamps fill 0..1 and renders a tabular-nums value', () => {
    render(<StatBar kind="health" value={150} max={100} showValue data-testid="b" />);
    const el = screen.getByTestId('b');
    expect(el.querySelector('[data-fill]')).toHaveStyle({ width: '100%' });
    expect(el).toHaveTextContent('100');
    expect(el.querySelector('.tabular-nums')).toBeTruthy();
  });
  it('kind selects the fill color (mana=info)', () => {
    render(<StatBar kind="mana" value={50} max={100} data-testid="b" />);
    expect(screen.getByTestId('b').querySelector('[data-fill]').className).toMatch(/bg-info/);
  });
  it('renders a leading icon when given', () => {
    render(<StatBar kind="health" icon="health" value={50} max={100} data-testid="b" />);
    expect(screen.getByTestId('b').querySelector('svg')).toBeTruthy();
  });

  // M6 #10 HUD-aliveness: the fill EASES to its new width instead of snapping (a 2026 HUD baseline,
  // applied to every bar -- health/mana/ferocity/resonance/soul/kinetic/xp). Capture-gated off so the
  // visual gate stays byte-stable (values are frozen in capture, so nothing would animate anyway).
  it('eases the fill width (smooth transition) outside capture mode', () => {
    render(<StatBar kind="health" value={50} max={100} data-testid="b" />);
    expect(screen.getByTestId('b').querySelector('[data-fill]').className).toMatch(/transition-\[width\]/);
  });
});

import { SpellRing } from '../../src/ui/primitives/SpellRing.jsx';

describe('SpellRing', () => {
  it('renders a circular ring; active adds the spell glow', () => {
    render(<SpellRing spell="fire" active keyLabel="Q" data-testid="r"><span>x</span></SpellRing>);
    const el = screen.getByTestId('r');
    expect(el.className).toMatch(/rounded-full/);
    expect(el.getAttribute('style')).toMatch(/spell-fire/);
    expect(el).toHaveTextContent('Q');
  });
});

import { Icon } from '../../src/ui/primitives/Icon.jsx';

describe('Icon', () => {
  it('renders a sized 2-tone game-icon svg for a known game name (currentColor)', async () => {
    render(<Icon name="sword" size={24} data-testid="i" />);
    const svg = screen.getByTestId('i');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('24');
    // The baked set loads lazily, so the path data may arrive after the first render.
    await waitFor(() => expect(svg.querySelector('path[d]')).not.toBeNull());
  });
  it('renders a lucide chrome icon for a chrome name', () => {
    render(<Icon name="settings" size={18} data-testid="i" />);
    expect(screen.getByTestId('i').tagName.toLowerCase()).toBe('svg');
  });
  it('renders nothing (no crash) for an unknown name', () => {
    const { container } = render(<Icon name="totally-unknown" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

import { Toast } from '../../src/ui/primitives/Toast.jsx';

describe('Toast', () => {
  it('renders status-tinted bold-flat chrome with a message', () => {
    render(<Toast status="success" data-testid="t">Quest complete!</Toast>);
    const el = screen.getByTestId('t');
    expect(el).toHaveTextContent('Quest complete!');
    expect(el.className).toMatch(/border-chrome/);
    expect(el.className).toMatch(/bg-success|border-success|border-l-success/);
  });
  it('uses role=alert for danger, role=status otherwise', () => {
    const { rerender } = render(<Toast status="danger" data-testid="t">x</Toast>);
    expect(screen.getByTestId('t')).toHaveAttribute('role', 'alert');
    rerender(<Toast status="success" data-testid="t">y</Toast>);
    expect(screen.getByTestId('t')).toHaveAttribute('role', 'status');
  });
  it('`display` and `pad` replace the inline-flex and padding defaults', () => {
    render(<Toast status="warn" display="flex" pad="px-6 py-3" data-testid="t">z</Toast>);
    const cls = screen.getByTestId('t').className.split(/\s+/);
    expect(cls.filter((c) => /^(inline-)?flex$/.test(c))).toEqual(['flex']);
    expect(cls.filter((c) => /^p[xy]-/.test(c))).toEqual(['px-6', 'py-3']);
  });
});
import { LocaleToggle } from '../../src/ui/LocaleToggle.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('LocaleToggle', () => {
  it('toggles the store locale on click', () => {
    useGameStore.getState().setLocale('en');
    render(<LocaleToggle />);
    const btn = screen.getByRole('button');
    btn.click();
    expect(useGameStore.getState().locale).toBe('zh-CN');
  });
});
