import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Button, Icon } from './primitives/index.js';
import { goToWorld } from '../game/worldSwitch.js';

// ANOTHER TAB SAVED THIS WORLD. The store's saveActiveWorld refused to write this tab's older state over it and set
// slotConflict; from then on this tab saves nothing, so playing on here would be play that is never kept. Derived from
// state, as the context-loss panel is, and a covering surface (ui/panelState.js coveringSurfaceUp): input leaves the
// world and the pointer is given back (InputManager), so the button can be clicked. Reload is a world switch to the
// slot: its save is refused too, and the boot loads the newer save. Where sessionStorage refuses the note it reloads as
// a plain visit, which continues the newest world earned in or named: this one, just saved by the other tab, unless it
// is an empty placeholder (game/worldBoot.js latestOwnedWorld). A refused switch would leave a dead button under an
// opaque panel.
export function SlotConflictPanel() {
  const t = useT();
  const conflict = useGameStore((s) => s.slotConflict);
  if (!conflict) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('save.otherTab')}
      data-testid="slot-conflict-panel"
      // The same opaque scrim as the context-loss panel (bold-flat, no blur): the world under it is no longer saved.
      className="fixed inset-0 z-modal flex flex-col items-center justify-center gap-5 bg-ink"
    >
      <p className="max-w-sm px-6 text-center text-lg font-bold text-text">{t('save.otherTab')}</p>
      <Button variant="primary" size="lg" data-testid="slot-conflict-reload" onClick={() => goToWorld({ world: conflict.id }, true)}>
        <Icon name="sword" size={20} className="flex-none" /> {t('ui.reload')}
      </Button>
    </div>
  );
}
