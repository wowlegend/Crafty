import React, { useEffect } from 'react';
import { isTouchUIMode } from '../input/touchDevice';
import { Panel, Modal, Button, Icon } from './primitives/index.js';
import { KEY_MAP, KEY_GROUPS, KEY_GROUP_LABEL_KEYS } from '../game/keyMap.js';
import { useT } from '../i18n/i18n.js';
import { useGameStore } from '../store/useGameStore';

// The controls, generated from KEY_MAP (the binding single source of truth): grouped Move / Combat / Aspects / Panels,
// each key a keycap chip in the talent panel's vocabulary, each label through t(). Three surfaces show it (the HUD lane's
// task script, decision 7): the controls PANEL that H opens (STATUS C1/c: a returning player needs somewhere to find
// the keys), the first-run controls CARD, and the "H Controls" HINT the card folds to. Static: no useFrame, no per-frame
// cost.

/** Every KEY_MAP row a player is taught (not `panelHide`), grouped in KEY_GROUPS order. */
export const ControlsList = React.memo(({ size = 'sm' }) => {
  const t = useT();
  const big = size === 'lg';
  return (
    <div data-testid="controls-list" className={`flex flex-col ${big ? 'gap-3' : 'gap-1.5'}`}>
      {KEY_GROUPS.map((group) => (
        <div key={group} data-controls-group={group}>
          <div className={`${big ? 'text-xs' : 'text-[8px]'} font-bold uppercase tracking-widest text-text-muted mb-0.5`}>{t(KEY_GROUP_LABEL_KEYS[group])}</div>
          <div className={`${big ? 'grid grid-cols-2 gap-x-4 gap-y-1' : 'flex flex-col gap-0.5'}`}>
            {KEY_MAP.filter((r) => r.group === group && !r.panelHide).map((r) => (
              <div key={r.key} data-controls-key={r.key} className={`flex items-center gap-2 ${big ? 'text-sm' : 'text-[10px]'} leading-tight`}>
                <span className={`font-display flex-none px-1.5 py-0.5 rounded border-chrome border-ink bg-slot text-text ${big ? 'text-xs min-w-[3rem]' : 'text-[9px] min-w-[2.4rem]'} text-center`}>{r.key}</span>
                <span className="text-text-muted">{t(r.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

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

/** The controls panel H opens. */
export const ControlsPanel = ({ onClose }) => {
  const t = useT();
  return (
    <Modal testId="controls-panel" label={t('panel.controls')} onClose={onClose}
      className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in">
      <Panel variant="raise" shadow="shadow-elev-xl" className="w-[560px] max-w-[95vw] max-h-[85vh] overflow-hidden p-0 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink flex-none">
          <span className="font-display text-xxl tracking-wide">{t('panel.controls')}</span>
          <Button variant="ghost" size="icon" text="text-text-muted" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9">
            <Icon name="close" size={18} />
          </Button>
        </div>
        <div className="px-5 py-4 overflow-y-auto"><ControlsList size="lg" /></div>
      </Panel>
    </Modal>
  );
};

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
