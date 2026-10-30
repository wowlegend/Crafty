import { forwardRef, useRef, useEffect, useCallback } from 'react';
import { useIsPresent } from 'framer-motion';
import { isCaptureMode } from '../../devtest/captureMode';

// #52: a paint-NOTHING a11y + focus wrapper for the bold-flat panel modals. It renders the SINGLE backdrop
// div -- ALL visual classes come from the caller's `className` (byte-identical to the old hand-rolled
// backdrop -> zero-pixel migration; the inner Panel is still the bold-flat surface). It adds the invisible
// a11y wins (role=dialog / aria-modal / aria-label / tabIndex) + manages focus: an initial container focus
// (CAPTURE-GATED so the deterministic visual baselines stay byte-identical) + a Tab focus-trap + focus
// restore on unmount. Esc-to-close is handled globally by InputManager (capture-phase) -- NOT duplicated here.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The props that make a modal surface a surface while it is up, and nothing once it is leaving. A panel inside
 * AnimatePresence stays in the DOM through its exit animation; while it faded it still declared aria-modal, which the
 * touch layer reads as a control that owns its touches (input/touchOwnership.js), and it still took clicks, so the first
 * touch on the world after a close neither looked nor moved. Leaving, it takes no pointer and claims nothing.
 */
export function useSurfaceProps(style) {
  const present = useIsPresent();
  return present ? { 'aria-modal': 'true', style } : { style: { ...style, pointerEvents: 'none' } };
}

export const Modal = forwardRef(function Modal(
  { onClose, label, className, testId, dismissOnBackdrop = true, children, style, onPointerDown, ...props }, ref) {
  const dialogRef = useRef(null);
  const prevFocus = useRef(null);
  const surface = useSurfaceProps(style);
  // Where the pointer went down. A backdrop click closes only when its press began on the backdrop: a tap that opened
  // this panel (a touch tray row, which unmounts under the finger) lands its click on the new backdrop, and a drag that
  // began inside the card ends on it; neither is a press on the backdrop.
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    prevFocus.current = typeof document !== 'undefined' ? document.activeElement : null;
    // capture-gated: a programmatically-focused tabIndex=-1 container is ring-free, but gating the call
    // guarantees the 3 captured modal frames (inventory/achievements/progression-open) stay byte-identical.
    if (!isCaptureMode()) dialogRef.current?.focus();
    return () => { try { prevFocus.current?.focus?.(); } catch { /* element gone */ } };
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll(FOCUSABLE));
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }, []);

  const handlePointerDown = (e) => {
    downOnBackdrop.current = e.target === e.currentTarget;
    onPointerDown?.(e);
  };
  const handleClick = (e) => {
    const began = downOnBackdrop.current;
    downOnBackdrop.current = false;
    if (began && e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      ref={(node) => { dialogRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      role="dialog"
      {...surface}
      aria-label={label}
      tabIndex={-1}
      data-testid={testId}
      className={className}
      onPointerDown={handlePointerDown}
      onClick={dismissOnBackdrop ? handleClick : undefined}
      onKeyDown={onKeyDown}
      {...props}
    >
      {children}
    </div>
  );
});
