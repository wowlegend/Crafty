import { useEffect, useRef, useState } from 'react';
import { isCaptureMode, getCaptureOpts } from '../devtest/captureMode';
import { isTouchDevice } from '../input/touchDevice';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { useActiveInput } from '../input/useActiveInput';
import { setIntent, setActive, getInput } from '../input/inputState';
import { aspectRing, fanLayout, fanItemStyle, fanOpenerStyle, ASPECT_ROW_BOTTOM, SPELL_ROW_BOTTOM, TAP_HOLD_MS } from '../input/aspectWheel';
import { makeIntentHold } from '../input/touchHold';
import { SPELL_ORDER, spellLabelKey } from '../input/spellPicker';
import { makeTouchRouter } from '../input/touchMath';
import { ownsTouch } from '../input/touchOwnership';
import { handleTouchMove, handleTouchEnd, MOVE_KEYS } from '../input/touchHandlers';
import { TRAY_PANELS, togglePanel } from './touchTray';
import TouchControlsSurface from './TouchControlsSurface';
import { isAnyPanelOpen } from './panelState.js';

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
export default function TouchControls({ isWorldBuilt, talentsOpen = false, onOpenTalents }) {
  if (isCaptureMode()) {
    // capture renders the tray OPEN so mobile.png locks the full M3a feature (grid icon + 4 openers).
    return getCaptureOpts().showTouch ? <TouchControlsSurface trayOpen /> : null;
  }
  if (!isTouchDevice()) return null;
  return <TouchControlsLive isWorldBuilt={isWorldBuilt} talentsOpen={talentsOpen} onOpenTalents={onOpenTalents} />;
}

// PHASE 0c — PRESS-AND-HOLD CONTROLS (plan docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
//
// A press keeps its pointer: with capture, a thumb that drifts off the control still releases ON it. A synthetic or
// already-ended pointer cannot be captured (setPointerCapture throws NotFoundError), and jsdom has no capture at all;
// the release handlers below still end the hold, so the throw is swallowed rather than allowed to abort the press.
function capturePointer(e) {
  const el = e.currentTarget;
  if (!el || typeof el.setPointerCapture !== 'function') return;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // see above: the press stands; a release handler ends it
  }
}
// Every way a touch can end. iOS can swallow pointerup inside a system gesture and deliver pointercancel instead;
// capture can be lost with neither; pointerleave covers a browser that does not capture. Each handler must be
// idempotent, because one lift delivers pointerup AND lostpointercapture AND (for touch) pointerleave.
const releaseHandlers = (end) => ({ onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end, onPointerLeave: end });
// A long press must not raise a platform menu over a hold control. Defensive: not verified on a device.
const noMenu = (e) => e.preventDefault();

// isWorldBuilt is App-LOCAL useState (App.jsx:105 -- verified NOT a store key) -> passed as a prop.
// talentsOpen / onOpenTalents are App-LOCAL too (the Talents panel's flag lives in useInputManager): Phase 0c, F9.
function TouchControlsLive({ isWorldBuilt, talentsOpen, onOpenTalents }) {
  const t = useT();
  const rootRef = useRef(null);
  const routerRef = useRef(makeTouchRouter());
  const active = useActiveInput();              // SAFE reactive read (transition-state only)
  const isAlive = useGameStore((s) => s.isAlive);
  const [trayOpen, setTrayOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [spellOpen, setSpellOpen] = useState(false);
  const nubRafRef = useRef(0);                  // W4-T11: rAF throttle for the imperative knob-follow (no React state -> GLI trap-6)
  // Phase 0c: the ROAR is press-and-hold (input/touchHold.js). The transform charges for ANTICIPATION_SEC and cancels
  // the frame the intent drops, so the old 120 ms pulse could never commit it. One hold for the overlay's life,
  // driven only from event handlers and effects — never per-frame React state (Game-Loop Isolation).
  const [roarHold] = useState(() => makeIntentHold({ verb: 'roar', setIntent, now: () => performance.now() }));
  // A hold must end however its control goes away, or the next press has no rising edge and is eaten. Input going
  // dead (pause, a panel, death) drops it at once; the ring closing under a held finger (a second finger on the
  // opener) releases it as a lift would; unmounting drops it.
  useEffect(() => { if (!active) roarHold.drop(); }, [active, roarHold]);
  useEffect(() => { if (!wheelOpen) roarHold.release(); }, [wheelOpen, roarHold]);
  useEffect(() => () => roarHold.drop(), [roarHold]);
  // M3a: while any tray panel is open the control surface yields (active=false) so the panel is natively
  // interactive (no camera-drag fight, no preventDefault eating panel scroll). anyPanel also suppresses
  // tap-to-play so taps reach the panel; the panel's own close (X) returns to the tap-to-play state.
  const anyPanel = useGameStore((s) => s.showInventory || s.showCrafting || s.showBuildingTools || s.showMagic);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const router = routerRef.current;
    const camera = () => useGameStore.getState().gameCamera;

    // Touches that start on a UI control are owned by that control's own handler -- skip them here so a tap
    // never also starts a move/look zone (no camera jump) and preventDefault() never eats its click.
    //
    // X3: this used to match ONLY `button[data-touch-btn]`, so a hotbar slot -- a `<button
    // data-hotbar-block>` inside `[data-hud-interactive]` -- was treated as scenery, routed into a look-drag,
    // and had its synthesized click suppressed. A voxel BUILDING game was locked to one block on iPad.
    //
    // Widening the selector alone did NOT fix it, which a live DOM probe showed and a code reading did not:
    // this root is `inset:0` with default `pointer-events:auto`, so it was the TOPMOST element everywhere.
    // `elementFromPoint` at a hotbar slot returned THIS DIV, never the hotbar, and the `data-touch-btn`
    // buttons only ever worked because they are its CHILDREN. The ownership test was asking the wrong
    // element. The root is now transparent to hit-testing (see the style below) so the real target is the
    // HUD control itself; `t.target` is then exactly the element the touch began on.
    const isButton = (t) => ownsTouch(t.target);

    // FOCUS GATE. `getInput().active` alone is not the invariant. There are TWO panel openers with
    // different focus contracts: the tray opener lowers `active` by hand, the WORLD opener (Terrain's
    // open(h), via the interact verb) does not — it gets away with it on desktop only because exiting
    // pointer-lock lowers `active` as a side effect. On touch there is no pointer lock, so opening a chest
    // by walking up to it left `active` true and every tap inside that panel was swallowed by the
    // look-drag router. Reading PANEL_FLAGS via isAnyPanelOpen instead of lowering `active` in a third
    // place: two hand-maintained copies of this invariant already drifted once (2026-06-07), which is why
    // panelState.js exists. Transient getState read at EVENT time — not a subscription, so
    // Game-Loop-Isolation holds.
    const touchFocusOpen = () => getInput().active && !isAnyPanelOpen(useGameStore.getState());

    const onStart = (e) => {
      if (!touchFocusOpen()) return; // focus gate: paused, or ANY panel open (see touchFocusOpen)
      const w = window.innerWidth;
      let routed = false;
      for (const t of e.changedTouches) if (!isButton(t)) { router.onStart(t, w); routed = true; }
      if (routed) e.preventDefault(); // skip for pure button taps so iOS does not suppress onPointerUp
    };
    const onMove = (e) => {
      if (!touchFocusOpen()) return; // focus gate: let panel scroll / native touch through
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
      // Cleanup runs UNCONDITIONALLY and before any gate: a touch that ends after the gate closed (a panel
      // opened mid-drag) must still clear its intents, or the player keeps walking with no finger down.
      handleTouchEnd(router, e.changedTouches, { setIntent });
      // preventDefault, however, is ONLY for touches we actually own. This handler used to be bound to the
      // root layer, which never saw a menu touch, so an unconditional preventDefault here was harmless.
      // Bound to `window` (X3) it sees every touchend in the app — and it suppressed the synthesized click
      // on the title screen's "Start Adventure", killing touch cold-start outright. Caught by touch-probe,
      // not by review: the change that moved these listeners looked local.
      if (touchFocusOpen() && [...e.changedTouches].some((t) => !ownsTouch(t.target))) e.preventDefault();
      // recenter the knob on release (imperative DOM write -> GLI-safe)
      const knob = rootRef.current && rootRef.current.querySelector('[data-touch-knob]');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };

    // X3: these listen on WINDOW, not on this root. The root is now `pointer-events:none` so a tap reaches
    // the HUD control underneath it; that also means the root stops being an ancestor of the touch target,
    // so a listener bound to it would never fire and move/look would die entirely. Window sees every touch
    // regardless of which element it landed on, which is what a global input router actually wants.
    // passive:false so preventDefault() actually cancels scroll/zoom/pull-to-refresh (spec section 4).
    window.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: false });
    window.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      cancelAnimationFrame(nubRafRef.current); // W4-T11: drop any pending knob-render frame
      for (const k of MOVE_KEYS) setIntent(k, false); // clear on unmount
      setActive(false); // relinquish the active gate so it never stays stuck with no touch surface
    };
  }, []);

  const dispatch = (b) => useGameStore.getState().performVerb?.(b);
  // Focus model (spec section 3 trap-3): touch owns setActive. Tap-to-Play when world is up + alive + not live.
  // !talentsOpen: the Talents panel's flag is App-local, so `anyPanel` cannot see it, and without this a locked-sector
  // tap (which opens Talents and lowers `active`) would put a full-screen tap-to-play over the panel it just opened.
  const showTapToPlay = isWorldBuilt && isAlive && !active && !anyPanel && !talentsOpen;
  // transparent hit-target geometry mirrors the visible glyphs in TouchControlsSurface.
  // REACTIVE, not getState(): this was a non-reactive read during render, so unlocking an Aspect did not
  // re-render the ring — the new sector appeared only when something ELSE happened to re-render this
  // component (closing a panel flips `anyPanel`, which is why it usually self-corrected and stayed hidden).
  // A talent unlock is a RARE transition, so subscribing here is Game-Loop-Isolation-safe: the store blesses
  // exactly this pattern for `activeBeastForm`. Found by the touch probe, which reported "no touch-aspects
  // toggle in the DOM" after unlocking all four Aspects.
  const unlockedTalents = useGameStore((s) => s.unlockedTalents);
  const ring = aspectRing(unlockedTalents); // every Aspect, locked ones marked (Phase 0c, F9 — aspectWheel.js)
  const ringPositions = fanLayout(ring.length);
  const spellPositions = fanLayout(SPELL_ORDER.length);
  // pointerEvents 'auto' re-enables hit-testing on each control, since the root below is now 'none' (X3).
  const hit = { position: 'absolute', background: 'transparent', border: 'none', padding: 0, opacity: 0, pointerEvents: 'auto' };
  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, touchAction: 'none',
        // X3: pointerEvents 'none' is LOAD-BEARING, not cosmetic. This layer is inset:0 over the whole
        // viewport, so while it was hit-testable it was the topmost element EVERYWHERE and swallowed every
        // tap aimed at the HUD beneath it — the hotbar could not be clicked at all on touch. Its own
        // controls opt back in via `hit` above, and the touch listeners moved to `window` so routing still
        // sees everything. Do not "tidy" this back to auto.
        pointerEvents: 'none',
        WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
      }}
    >
      {active && <TouchControlsSurface trayOpen={trayOpen} wheelOpen={wheelOpen} spellOpen={spellOpen} />}

      {showTapToPlay && (
        <button data-touch-btn onPointerUp={() => setActive(true)} aria-label={t('a11y.tapToPlay')} data-testid="touch-tap-to-play"
          style={{ ...hit, inset: 0, width: '100%', height: '100%' }} />
      )}

      {active && (
        // B7: the hit-target MUST mirror the visible Pause glyph (TouchControlsSurface `right: 64, 46x46`).
        // It used to sit at `right: 8` -- disjoint from its glyph AND on top of the GameHud Settings gear
        // (right-4), so tapping the glyph did nothing and tapping Settings paused the game.
        <button data-touch-btn onPointerUp={() => setActive(false)} aria-label={t('a11y.pause')} data-testid="touch-pause"
          style={{ ...hit, top: 'calc(env(safe-area-inset-top,0px) + 10px)', right: 64, width: 46, height: 46 }} />
      )}
      {active && (
        <button data-touch-btn onPointerUp={() => dispatch(0)} aria-label={t('a11y.action')} data-testid="touch-action"
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '11%', width: 84, height: 84 }} />
      )}
      {active && (
        <button data-touch-btn onPointerUp={() => dispatch(2)} aria-label={t('a11y.cast')} data-testid="touch-cast"
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: '9%', width: 64, height: 64 }} />
      )}
      {active && (
        <button data-touch-btn aria-label={t('a11y.jump')} data-testid="touch-jump"
          onPointerDown={() => setIntent('jump', true)}
          onPointerUp={() => setIntent('jump', false)}
          onPointerLeave={() => setIntent('jump', false)}
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 40px)', bottom: 'calc(11% + 96px)', width: 60, height: 60 }} />
      )}
      {active && (
        // M3 #6: touch DODGE -- edge-triggered (the dodge state machine in Components consumes the intent,
        // so one press = one roll); mirrors the Wind glyph above cast in TouchControlsSurface.
        <button data-touch-btn aria-label={t('a11y.dodge')} data-testid="touch-dodge"
          onPointerDown={() => {
            // PULSED, like the Aspect sectors: held long enough that a once-per-frame state machine
            // cannot miss the rising edge, then cleared. Setting it true with no release relied entirely
            // on the consumer to clear it, and the consumer only clears while input is LOCKED — so a tap
            // that landed as a panel opened stayed queued and spent itself as a roll on the way back.
            setIntent('dodge', true);
            setTimeout(() => setIntent('dodge', false), TAP_HOLD_MS);
          }}
          style={{ ...hit, right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: 'calc(9% + 86px)', width: 60, height: 60 }} />
      )}

      {/* M3a panel-access tray: grid icon toggles the column; each opener toggles its panel + yields control */}
      {active && (
        <button data-touch-btn onPointerUp={() => setTrayOpen((o) => !o)} aria-label={t('a11y.panels')} data-testid="touch-panels"
          style={{ ...hit, top: 'calc(50% - 140px)', left: 'calc(env(safe-area-inset-left,0px) + 10px)', width: 46, height: 46 }} />
      )}
      {active && trayOpen && TRAY_PANELS.map((p, i) => (
        <button key={p.id} data-touch-btn aria-label={t(p.labelKey)}
          onPointerUp={() => { togglePanel(p, useGameStore.getState()); setTrayOpen(false); setActive(false); }}
          style={{ ...hit, top: `calc(50% - 84px + ${i * 56}px)`, left: 'calc(env(safe-area-inset-left,0px) + 12px)', width: 52, height: 52 }} />
      ))}

      {/* X1 ASPECT RING — the four Aspect verbs (roar / grab / snare / imbue) had NO touch affordance at
          all, so the game's signature identity was desktop-only (STATUS §E-bis X1; pillars P1 + P4).
          Mirrors the M3a tray deliberately: a toggle plus `data-touch-btn` hit-targets, so the router
          already skips them and TouchControlsSurface draws the glyphs. Writes the SAME boolean intents the
          keyboard writes, so nothing downstream changes.
          Phase 0c (F9): EVERY Aspect gets a sector, and the opener is always offered. A locked sector writes
          no intent and opens the Talents panel instead — until this phase nothing on touch opened that panel,
          so no Aspect could ever be unlocked on an iPad (the reasoning is at aspectWheel.js `aspectRing`). */}
      {active && (
        <button data-touch-btn onPointerUp={() => setWheelOpen((o) => !o)} aria-label={t('a11y.aspects')} data-testid="touch-aspects"
          style={{ ...hit, ...fanOpenerStyle(ASPECT_ROW_BOTTOM) }} />
      )}
      {active && wheelOpen && ring.map((a, i) => {
        const q = ringPositions[i] || { x: 0, y: 0 };
        const place = { ...hit, ...fanItemStyle(ASPECT_ROW_BOTTOM, q) };
        if (a.locked) {
          return (
            <button key={a.verb} data-touch-btn data-locked="true" data-testid={`touch-aspect-${a.verb}`}
              aria-label={t('a11y.aspectLocked', { aspect: a.aspect })}
              onPointerUp={() => {
                // Open first, then yield: the same order as the KeyU branch (flag set before the input drops), and the
                // same focus contract as the tray openers below (the panel must be natively interactive).
                onOpenTalents?.();
                setWheelOpen(false);
                setActive(false);
              }}
              style={place} />
          );
        }
        if (a.verb === 'roar') {
          // PRESS-AND-HOLD (Phase 0c): the roar charges while held and commits at ANTICIPATION_SEC. A tap is still the
          // old 120 ms pulse (makeIntentHold's minimum), so a tap in a beast form still exits it on the rising edge.
          // The ring stays open while held — closing it on the press would unmount the sector under the finger.
          return (
            <button key={a.verb} data-touch-btn data-locked="false" data-testid={`touch-aspect-${a.verb}`} aria-label={a.aspect}
              onPointerDown={(e) => { capturePointer(e); roarHold.press(); }}
              {...releaseHandlers(() => { if (roarHold.release()) setWheelOpen(false); })}
              onContextMenu={noMenu}
              style={place} />
          );
        }
        return (
          <button key={a.verb} data-touch-btn data-locked="false" aria-label={a.aspect} data-testid={`touch-aspect-${a.verb}`}
            onPointerUp={() => {
              // Pulse the intent exactly as a key press+release does (Components.jsx keydown/keyup). These verbs are
              // edge-triggered with no charge, so a tap is all they need.
              setIntent(a.verb, true);
              setTimeout(() => setIntent(a.verb, false), TAP_HOLD_MS);
              setWheelOpen(false);
            }}
            style={place} />
        );
      })}

      {/* X2b SPELL PICKER — `setActiveSpell` was reachable ONLY from Digit1-4, so a touch player cast
          the store default (fireball) forever and 3 of 4 spells were unreachable on iPad. Same ring
          mechanism as the Aspect wheel, one row higher on the same thumb. UNGATED, matching the keyboard:
          gating touch when Digit1-4 is ungated would make touch stricter than desktop, which is the
          opposite of the bug. Writes the EXISTING `setActiveSpell` seam — no new downstream path. */}
      {active && (
        <button data-touch-btn onPointerUp={() => setSpellOpen((o) => !o)} aria-label={t('a11y.selectSpell')} data-testid="touch-spells"
          style={{ ...hit, ...fanOpenerStyle(SPELL_ROW_BOTTOM) }} />
      )}
      {active && spellOpen && SPELL_ORDER.map((id, i) => {
        const q = spellPositions[i] || { x: 0, y: 0 };
        return (
          <button key={id} data-touch-btn aria-label={t(spellLabelKey(id))} data-testid={`touch-spell-${id}`}
            onPointerUp={() => { useGameStore.getState().setActiveSpell(id); setSpellOpen(false); }}
            style={{ ...hit, ...fanItemStyle(SPELL_ROW_BOTTOM, q) }} />
        );
      })}
    </div>
  );
}
