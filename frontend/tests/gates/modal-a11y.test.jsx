// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Modal } from '../../src/ui/primitives/Modal.jsx';

afterEach(cleanup);

// #52: a paint-nothing a11y + focus wrapper for the panel modals. role=dialog + aria-modal + aria-label
// are the invisible a11y win (zero-pixel); the backdrop visual classes come from the passthrough className.
describe('#52 Modal primitive (a11y + focus)', () => {
  it('renders a dialog with aria-modal + aria-label + the passthrough className', () => {
    render(<Modal label="Test Panel" onClose={() => {}} className="bg-ink/75 grid"><button>x</button></Modal>);
    const d = screen.getByRole('dialog');
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAttribute('aria-label', 'Test Panel');
    expect(d.className).toMatch(/bg-ink\/75/);
    expect(d).toHaveAttribute('tabindex', '-1');
  });

  it('backdrop click calls onClose by default', () => {
    const onClose = vi.fn();
    render(<Modal label="T" onClose={onClose}><div>body</div></Modal>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismissOnBackdrop=false does NOT close on backdrop click', () => {
    const onClose = vi.fn();
    render(<Modal label="T" onClose={onClose} dismissOnBackdrop={false}><div>body</div></Modal>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the dialog container on mount (keyboard entry point; ring-free)', () => {
    render(<Modal label="T" onClose={() => {}}><button>x</button></Modal>);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('forwards an optional testId onto the dialog', () => {
    render(<Modal label="T" onClose={() => {}} testId="inventory-modal"><div /></Modal>);
    expect(screen.getByTestId('inventory-modal')).toHaveAttribute('role', 'dialog');
  });
});
