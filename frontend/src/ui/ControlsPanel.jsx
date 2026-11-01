import React from 'react';
import { Panel, Modal, Button, Icon } from './primitives/index.js';
import { KEY_MAP, KEY_GROUPS, KEY_GROUP_LABEL_KEYS } from '../game/keyMap.js';
import { useT } from '../i18n/i18n.js';

// The controls panel H opens, generated from KEY_MAP (the binding single source of truth): grouped Move / Combat /
// Aspects / Panels, each key a keycap chip in the talent panel's vocabulary, each label through t(). An on-demand
// panel, so it rides the lazy panel chunk (ui/panels/lazyPanels.js); the first-run card and the hint it folds to are
// at rest in the HUD and stay in ui/CombatInstructions.jsx. Static: no useFrame, no per-frame cost.

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
