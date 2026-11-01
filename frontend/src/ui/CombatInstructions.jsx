import React, { useEffect } from 'react';
import { isTouchUIMode } from '../input/touchDevice';
import { KEY_MAP } from '../game/keyMap.js';
import { useT } from '../i18n/i18n.js';
import { useGameStore } from '../store/useGameStore';

// The controls at rest, from KEY_MAP (the binding single source of truth). Three surfaces show the controls (the HUD
// lane's task script, decision 7): the controls PANEL that H opens (STATUS C1/c: a returning player needs somewhere to
// find the keys; ui/ControlsPanel.jsx, in the lazy panel chunk), and here the first-run controls CARD and the
// "H Controls" HINT the card folds to. Static: no useFrame, no per-frame cost.

// The first-run card's six: the keys a new player needs before anything else, each a KEY_MAP key (so a rebinding or a
// removal shows here), with a short label; H names the panel that holds the rest.
const ESSENTIALS = [['WASD', 'controls.move'], ['LMB', 'controls.short.attack'], ['RMB', 'controls.short.use'],
  ['Tab', 'controls.short.character'], ['J', 'controls.short.journal'], ['H', 'controls.short.all']];
const ESSENTIAL_ROWS = ESSENTIALS.filter(([key]) => KEY_MAP.some((r) => r.key === key));

/** The first-run card: one line of the essential keys above the hotbar's XP edge, drawn as the H hint is (keycaps and
 *  shadowed labels on the world, no panel behind them), taking no input. One bare line rather than the whole list in a
 *  panel, because it is chrome at rest while it shows (DECISIONS 2026-10-29 item 99). */
export const ControlsCard = React.memo(() => {
  const t = useT();
  return (
    <div data-testid="controls-card"
      className="absolute left-1/2 -translate-x-1/2 bottom-[92px] pointer-events-none z-hud flex items-center gap-3 whitespace-nowrap">
      {ESSENTIAL_ROWS.map(([key, labelKey]) => (
        <span key={key} data-controls-key={key} className="flex items-center gap-1 leading-none">
          <span className="font-display px-1.5 py-0.5 rounded border-chrome border-ink bg-slot text-text text-[10px]">{key}</span>
          <span className="text-[11px] font-bold text-text" style={{ textShadow: '0 1px 2px rgb(var(--ui-ink))' }}>{t(labelKey)}</span>
        </span>
      ))}
    </div>
  );
});

/** How long the first-run card stays on screen in play before it folds to the "H Controls" hint. */
export const CARD_ON_SCREEN_MS = 30000;

// A profile that has not opened the controls panel (H) sees the card at rest above the hotbar for its first
// CARD_ON_SCREEN_MS of play with the card on screen (time paused or in a panel does not count: the
// card is mounted only while the HUD is), then the one-line hint at the hotbar's edge, until H opens the panel once.
// Desktop only: the keys are a keyboard player's (HUD.jsx mounts the card off touch; the hint asks for itself).
export const ControlsCardUntilSeen = React.memo(() => {
  const seen = useGameStore((s) => s.controlsSeen);
  const done = useGameStore((s) => s.controlsCardDone);
  const showing = !seen && !done;
  useEffect(() => {
    if (!showing) return undefined;
    const since = Date.now();
    const left = Math.max(0, CARD_ON_SCREEN_MS - useGameStore.getState().controlsCardMs);
    const id = setTimeout(() => useGameStore.getState().markControlsCardDone(), left);
    return () => { clearTimeout(id); useGameStore.getState().addControlsCardMs(Date.now() - since); };
  }, [showing]);
  return showing ? <ControlsCard /> : null;
});

/** The hint at the hotbar's edge once the first-run card has folded, until the panel has been opened once; on a
 *  keyboard only. Drawn inside the hotbar, above its XP edge. */
export const ControlsHint = React.memo(() => {
  const t = useT();
  const seen = useGameStore((s) => s.controlsSeen);
  const done = useGameStore((s) => s.controlsCardDone);
  if (seen || !done || isTouchUIMode()) return null;
  return (
    <div data-testid="controls-hint" className="absolute right-1 bottom-full mb-6 pointer-events-none flex items-center gap-1.5">
      <span className="font-display px-1.5 py-0.5 rounded border-chrome border-ink bg-slot text-text text-[10px]">H</span>
      <span className="text-[11px] font-bold text-text" style={{ textShadow: '0 1px 2px rgb(var(--ui-ink))' }}>{t('controls.hint')}</span>
    </div>
  );
});
