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
  it('renders an empty slot with the inset field + 4px ink', () => {
    render(<Slot data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/bg-slot/);
    expect(el.className).toMatch(/border-chrome/);
  });
  it('rarity tints the border and selected adds the accent ring', () => {
    render(<Slot rarity="legendary" selected data-testid="s">x</Slot>);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/border-rarity-legendary/);
    expect(el.className).toMatch(/ring/);
  });
});

import { StatBar } from '../../src/ui/primitives/StatBar.jsx';

describe('StatBar', () => {
  it('clamps fill 0..1 and renders a tabular-nums value', () => {
    render(<StatBar kind="health" value={150} max={100} showValue data-testid="b" />);
    const el = screen.getByTestId('b');
    const fill = el.querySelector('[data-fill]');
    expect(fill).toHaveStyle({ width: '100%' });
    expect(el.className).toMatch(/border-chrome/);
    expect(el).toHaveTextContent('100');
    expect(el.querySelector('.tabular-nums')).toBeTruthy();
  });
  it('kind selects the fill color (mana = info/blue)', () => {
    render(<StatBar kind="mana" value={50} max={100} data-testid="b" />);
    expect(screen.getByTestId('b').querySelector('[data-fill]').className).toMatch(/bg-info/);
  });
});

import { Icon } from '../../src/ui/primitives/Icon.jsx';

describe('Icon', () => {
  it('renders a sized currentColor svg for a known name', () => {
    render(<Icon name="heart" size={24} data-testid="i" />);
    const svg = screen.getByTestId('i');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('24');
  });
  it('renders nothing (no crash) for an unknown name', () => {
    const { container } = render(<Icon name="totally-unknown" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
