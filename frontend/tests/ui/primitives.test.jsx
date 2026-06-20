// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
  it('renders a sized 2-tone game-icon svg for a known game name (currentColor)', () => {
    render(<Icon name="sword" size={24} data-testid="i" />);
    const svg = screen.getByTestId('i');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.innerHTML).toMatch(/path|g/i); // baked inner markup present
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
