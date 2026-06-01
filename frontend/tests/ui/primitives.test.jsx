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
