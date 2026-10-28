// useWindowFocused — whether the page has focus, for render/canvasPace.js's `unfocused` input (plan
// docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item g). On a desktop, a window the player clicked away from
// kept drawing the world at the full rate; it now draws at the title's pace. Read from document.hasFocus() at mount and
// from every window focus/blur after.
//
// Fine pointers only: on a phone or an iPad the OS already throttles a page that is not in front, and a touch browser's
// focus events are not a reliable "is the player looking" signal — so a coarse pointer always reads focused.
import { useEffect, useState } from 'react';

const hasFocus = () => (typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true);

/** @param {{ finePointer: boolean }} o @returns {boolean} focused */
export function useWindowFocused({ finePointer }) {
  const [focused, setFocused] = useState(() => (finePointer ? hasFocus() : true));
  useEffect(() => {
    if (!finePointer) return undefined;
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [finePointer]);
  return finePointer ? focused : true;
}
