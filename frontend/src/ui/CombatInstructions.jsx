import React from 'react';
import { Panel, Modal, Button, Icon } from './primitives/index.js';
import { KEY_MAP, KEY_GROUPS, KEY_GROUP_LABEL_KEYS } from '../game/keyMap.js';
import { useT } from '../i18n/i18n.js';
import { useGameStore } from '../store/useGameStore';

// The controls, generated from KEY_MAP (the binding single source of truth): grouped Move / Combat / Aspects / Panels,
// each key a keycap chip in the talent panel's vocabulary, each label through t(). Three surfaces show it (the HUD lane's
// task script, decision 7): the controls PANEL that H opens, in place of the sheet that faded after 8 seconds (STATUS
// C1/c), the controls CARD a profile sees at rest until it has opened the panel once, and the "H Controls" HINT at the
// hotbar's edge until then. Static: no useFrame, no per-frame cost.

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

/** The card a profile sees at rest until it has opened the controls panel once: it takes no input. */
export const ControlsCard = React.memo(() => {
  const t = useT();
  return (
    <Panel variant="base" data-testid="controls-card" className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 text-text pointer-events-none z-hud w-56">
      <div className="font-display uppercase text-[11px] tracking-wider text-accent mb-1.5">{t('panel.controls')}</div>
      <ControlsList />
    </Panel>
  );
});

// Until this browser has opened the controls panel (H) once, the card sits at rest on the left, in the room the side
// rail left, and the hotbar carries the hint (STATUS C1/c: the sheet that faded after 8 seconds left a returning player
// nothing to find the keys by).
export const ControlsCardUntilSeen = React.memo(() => {
  const seen = useGameStore((s) => s.controlsSeen);
  return seen ? null : <ControlsCard />;
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

/** The hint at the hotbar's edge until the panel has been opened once: drawn inside the hotbar, above its XP edge. */
export const ControlsHint = React.memo(() => {
  const t = useT();
  return (
    <div data-testid="controls-hint" className="absolute right-1 bottom-full mb-6 pointer-events-none flex items-center gap-1.5">
      <span className="font-display px-1.5 py-0.5 rounded border-chrome border-ink bg-slot text-text text-[10px]">H</span>
      <span className="text-[11px] font-bold text-text" style={{ textShadow: '0 1px 2px rgb(var(--ui-ink))' }}>{t('controls.hint')}</span>
    </div>
  );
});
