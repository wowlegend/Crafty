import { useEffect, useRef, useState } from 'react';
import { isCaptureMode, getCaptureOpts } from '../devtest/captureMode';
import { isTouchDevice } from '../input/touchDevice';
import { useGameStore } from '../store/useGameStore';
import { useActiveInput } from '../input/useActiveInput';
import { setIntent, setActive, getInput } from '../input/inputState';
import { makeTouchRouter } from '../input/touchMath';
import { handleTouchMove, handleTouchEnd, MOVE_KEYS } from '../input/touchHandlers';
import { TRAY_PANELS, togglePanel } from './touchTray';
import TouchControlsSurface from './TouchControlsSurface';

/**
 * TouchControls (M1 wiring + M2 visible surface) -- the touch overlay. Capture-safe + desktop-inert
 * BY CONSTRUCTION (3-way guard below): under capture it renders the static surface ONLY if the
 * mobile.png fixture opted in (getCaptureOpts().showTouch) -- so the 17 other baselines stay null
 * (spec section 3 trap-1 [BLOCKING]); in normal mode it renders the live overlay only on touch
 * devices (trap-2 [HIGH], no desktop regression). It writes ONLY through setIntent / setActive /
 * store.performVerb -- NEVER reads the browser pointer-lock element (single-active-authority) and
 * NEVER setState per move (Game-Loop-Isolation, trap-6). The visible glyphs live in
 * <TouchControlsSurface> (pointerEvents:none); the transparent data-touch-btn hit-areas, aligned to
 * those glyphs, are the real targets.
 */
export default function TouchControls({ isWorldBuilt }) {
  if (isCaptureMode()) {
    // capture renders the tray OPEN so mobile.png locks the full M3a feature (grid icon + 4 openers).
    return getCaptureOpts().showTouch ? <TouchControlsSurface trayOpen /> : null;
  }
  if (!isTouchDevice()) return null;
  return <TouchControlsLive isWorldBuilt={isWorldBuilt} />;
}

// isWorldBuilt is App-LOCAL useState (App.jsx:105 -- verified NOT a store key) -> passed as a prop.
function TouchControlsLive({ isWorldBuilt }) {
  const rootRef = useRef(null);
  const routerRef = useRef(makeTouchRouter());
  const active = useActiveInput();              // SAFE reactive read (transition-state only)
  const isAlive = useGameStore((s) => s.isAlive);
  const [trayOpen, setTrayOpen] = useState(false);
  const nubRafRef = useRef(0);                  // W4-T11: rAF throttle for the imperative knob-follow (no React state -> GLI trap-6)
  // M3a: while any tray panel is open the control surface yields (active=false) so the panel is natively
  // interactive (no camera-drag fight, no preventDefault eating panel scroll). anyPanel also suppresses
  // tap-to-play so taps reach the panel; the panel's own close (X) returns to the tap-to-play state.
  const anyPanel = useGameStore((s) => s.showInventory || s.showCrafting || s.showBuildingTools || s.showMagic);

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
      if (!getInput().active) return; // focus gate: no move/look routing when paused / in a panel (M3a)
      const w = window.innerWidth;
      let routed = false;
      for (const t of e.changedTouches) if (!isButton(t)) { router.onStart(t, w); routed = true; }
      if (routed) e.preventDefault(); // skip for pure button taps so iOS does not suppress onPointerUp
    };
    const onMove = (e) => {
      if (!getInput().active) return; // focus gate: let panel scroll / native touch through when not active
      const n = handleTouchMove(router, e.changedTouches, { camera: camera(), setIntent, sensitivity: useGameStore.getState().lookSensitivity ?? 1 });
      e.preventDefault();
      // W4-T11: move the visible joystick knob to follow the thumb -- IMPERATIVELY (a ref + a direct DOM
      // transform write, throttled to one rAF), NEVER React state, so the move path stays Game-Loop-Isolated
      // (trap-6: refs only in the touchmove handler, no reactive-state writes). The move INTENTS are written every event
      // inside handleTouchMove; this only nudges the cosmetic knob, and only when a move-zone touch is in this
      // batch (n is null on a look-only event -> the held stick is not recentered).
      if (n) {
        if (nubRafRef.current) return;
        nubRafRef.current = requestAnimationFrame(() => {
          nubRafRef.current = 0;
          const knob = rootRef.current && rootRef.current.querySelector('[data-touch-knob]');
          if (knob) knob.style.transform = `translate(calc(-50% + ${n.x}px), calc(-50% + ${n.y}px))`;
        });
      }
    };
    const onEnd = (e) => {
      handleTouchEnd(router, e.changedTouches, { setIntent });
      e.preventDefault();
      // recenter the knob on release (imperative DOM write -> GLI-safe)
      const knob = rootRef.current && rootRef.current.querySelector('[data-touch-knob]');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };

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
      cancelAnimationFrame(nubRafRef.current); // W4-T11: drop any pending knob-render frame
      for (const k of MOVE_KEYS) setIntent(k, false); // clear on unmount
      setActive(false); // relinquish the active gate so it never stays stuck with no touch surface
    };
  }, []);

  const dispatch = (b) => useGameStore.getState().performVerb?.(b);
  // Focus model (spec section 3 trap-3): touch owns setActive. Tap-to-Play when world is up + alive + not live.
  const showTapToPlay = isWorldBuilt && isAlive && !active && !anyPanel;
  // transparent hit-target geometry mirrors the visible glyphs in TouchControlsSurface.
  const hit = { position: 'absolute', background: 'transparent', border: 'none', padding: 0, opacity: 0 };
  return (
    <div
      ref={rootRef}
      style={{ position: 'fixed', inset: 0, zIndex: 40, touchAction: 'none',
               WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {active && <TouchControlsSurface trayOpen={trayOpen} />}

      {showTapToPlay && (
        <button data-touch-btn onPointerUp={() => setActive(true)} aria-label="Tap to play"
          style={{ ...hit, inset: 0, width: '100%', height: '100%' }} />
      )}

      {active && (
        <button data-touch-btn onPointerUp={() => setActive(false)} aria-label="Pause"
          style={{ ...hit, top: 'calc(env(safe-area-inset-top,0px) + 8px)', right: 8, width: 44, height: 44 }} />
      )}
      {active && (
        <button data-touch-btn onPointerUp={() => dispatch(0)} aria-label="Action"
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '11%', width: 84, height: 84 }} />
      )}
      {active && (
        <button data-touch-btn onPointerUp={() => dispatch(2)} aria-label="Cast"
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: '9%', width: 64, height: 64 }} />
      )}
      {active && (
        <button data-touch-btn aria-label="Jump"
          onPointerDown={() => setIntent('jump', true)}
          onPointerUp={() => setIntent('jump', false)}
          onPointerLeave={() => setIntent('jump', false)}
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 40px)', bottom: 'calc(11% + 96px)', width: 60, height: 60 }} />
      )}
      {active && (
        // M3 #6: touch DODGE -- edge-triggered (the dodge state machine in Components consumes the intent,
        // so one press = one roll); mirrors the Wind glyph above cast in TouchControlsSurface.
        <button data-touch-btn aria-label="Dodge"
          onPointerDown={() => setIntent('dodge', true)}
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: 'calc(9% + 86px)', width: 60, height: 60 }} />
      )}

      {/* M3a panel-access tray: grid icon toggles the column; each opener toggles its panel + yields control */}
      {active && (
        <button data-touch-btn onPointerUp={() => setTrayOpen((o) => !o)} aria-label="Panels"
          style={{ ...hit, top: 'calc(50% - 140px)', left: 'calc(env(safe-area-inset-left,0px) + 10px)', width: 46, height: 46 }} />
      )}
      {active && trayOpen && TRAY_PANELS.map((p, i) => (
        <button key={p.id} data-touch-btn aria-label={p.label}
          onPointerUp={() => { togglePanel(p, useGameStore.getState()); setTrayOpen(false); setActive(false); }}
          style={{ ...hit, top: `calc(50% - 84px + ${i * 56}px)`, left: 'calc(env(safe-area-inset-left,0px) + 12px)', width: 52, height: 52 }} />
      ))}
    </div>
  );
}
