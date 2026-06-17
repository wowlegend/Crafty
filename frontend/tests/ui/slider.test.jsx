// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Slider } from '../../src/ui/primitives/Slider.jsx';

afterEach(cleanup);

// M6 #2: a bold-flat range slider primitive replacing the 5 raw <input type=range> (browser-default
// thumb/track broke the locked design system). Keeps the native input (full keyboard + a11y); the
// look is CSS (.bf-slider in index.css). The component computes the --pct fill var from value/min/max.
describe('M6 bold-flat Slider primitive', () => {
  it('renders a native range input carrying the bf-slider class', () => {
    render(<Slider value={0.5} min={0} max={1} onChange={() => {}} data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.tagName).toBe('INPUT');
    expect(el.type).toBe('range');
    expect(el.className).toMatch(/bf-slider/);
  });

  it('sets the --pct fill var from value/min/max', () => {
    render(<Slider value={0.25} min={0} max={1} onChange={() => {}} data-testid="s" />);
    expect(screen.getByTestId('s').style.getPropertyValue('--pct')).toBe('25%');
  });

  it('clamps --pct to 0..100 and survives a degenerate range', () => {
    const { rerender } = render(<Slider value={5} min={0} max={1} onChange={() => {}} data-testid="s" />);
    expect(screen.getByTestId('s').style.getPropertyValue('--pct')).toBe('100%');
    rerender(<Slider value={5} min={2} max={2} onChange={() => {}} data-testid="s" />);
    expect(screen.getByTestId('s').style.getPropertyValue('--pct')).toBe('0%');
  });

  it('forwards onChange and merges a passed className', () => {
    const onChange = vi.fn();
    render(<Slider value={0.5} min={0} max={1} onChange={onChange} className="w-full" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/\bw-full\b/);
    fireEvent.change(el, { target: { value: '0.7' } });
    expect(onChange).toHaveBeenCalled();
  });
});
