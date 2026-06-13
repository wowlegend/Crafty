import { useEffect, useRef } from 'react';
import { isCaptureMode } from '../devtest/captureMode';
import { isTouchDevice } from '../input/touchDevice';
import { useGameStore } from '../store/useGameStore';
import { useActiveInput } from '../input/useActiveInput';
import { setIntent, setActive } from '../input/inputState';
import { makeTouchRouter } from '../input/touchMath';
import { handleTouchMove, handleTouchEnd, MOVE_KEYS } from '../input/touchHandlers';

/**
 * TouchControls (M1 producer-wiring) -- the touch overlay. Desktop-inert + capture-safe BY
 * CONSTRUCTION: the first line returns null under isCaptureMode() (covers all 17 visual baselines
 * at once -- spec section 3 trap-1 [BLOCKING]) and on non-touch devices (trap-2 [HIGH], no desktop
 * regression). It writes ONLY through setIntent / setActive / store.performVerb -- NEVER reads the
 * browser pointer-lock element (the single-active-authority invariant) and NEVER setState per move
 * (Game-Loop-Isolation -- trap-6). M1 zones are transparent + the action button invisible; M2 adds
 * the visible S1-C joystick nub / button cluster / crosshair + the look-zone-excludes-buttons refine.
 */
export default function TouchControls({ isWorldBuilt }) {
  if (isCaptureMode() || !isTouchDevice()) return null;
  return <TouchControlsLive isWorldBuilt={isWorldBuilt} />;
}

// isWorldBuilt is App-LOCAL useState (App.jsx:105 -- verified NOT a store key) -> passed as a prop.
function TouchControlsLive({ isWorldBuilt }) {
  const rootRef = useRef(null);
  const routerRef = useRef(makeTouchRouter());
  const active = useActiveInput();              // SAFE reactive read (transition-state only)
  const isAlive = useGameStore((s) => s.isAlive);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const router = routerRef.current;
    const camera = () => useGameStore.getState().gameCamera;

    // Touches that start on a <button> (tap-to-play / pause / action) are owned by that button's
    // onPointerUp -- skip them here so a tap never also starts a move/look zone (no camera jump).
    const isButton = (t) => {
      const node = document.elementFromPoint?.(t.clientX, t.clientY);
      return !!(node && node.closest && node.closest('button[data-touch-btn]'));
    };

    const onStart = (e) => {
      const w = window.innerWidth;
      for (const t of e.changedTouches) if (!isButton(t)) router.onStart(t, w);
      e.preventDefault();
    };
    const onMove = (e) => {
      handleTouchMove(router, e.changedTouches, { camera: camera(), setIntent, sensitivity: 1 });
      e.preventDefault();
    };
    const onEnd = (e) => { handleTouchEnd(router, e.changedTouches, { setIntent }); e.preventDefault(); };

    // passive:false so preventDefault() actually cancels scroll/zoom/pull-to-refresh (spec section 4).
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      for (const k of MOVE_KEYS) setIntent(k, false); // clear on unmount
    };
  }, []);

  // Focus model (spec section 3 trap-3): touch owns setActive. Tap-to-Play when world is up + alive + not yet live.
  const showTapToPlay = isWorldBuilt && isAlive && !active;
  return (
    <div
      ref={rootRef}
      style={{ position: 'fixed', inset: 0, zIndex: 40, touchAction: 'none',
               WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {showTapToPlay && (
        <button
          data-touch-btn
          onPointerUp={() => setActive(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                   background: 'transparent', border: 'none', color: 'transparent' }}
          aria-label="Tap to play"
        />
      )}
      {active && (
        <button
          data-touch-btn
          onPointerUp={() => setActive(false)}
          style={{ position: 'absolute', top: 'env(safe-area-inset-top, 8px)', right: 8,
                   width: 44, height: 44, opacity: 0.01 }}
          aria-label="Pause"
        />
      )}
      {active && (
        <button
          data-touch-btn
          onPointerUp={() => useGameStore.getState().performVerb?.(0)}
          style={{ position: 'absolute', bottom: 'env(safe-area-inset-bottom, 24px)', right: 24,
                   width: 72, height: 72, opacity: 0.01 }}
          aria-label="Action"
        />
      )}
    </div>
  );
}
