import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Button, Icon } from './primitives/index.js';
import { recoverFromContextLoss } from '../game/contextRecovery.js';
import { sessionStore } from '../game/worldSwitch.js';
import { reloadPage } from '../game/pageReload.js';

// THE WAY BACK FROM A LOST WEBGL CONTEXT (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item e).
// GameScene marks isWebGLContextLost on `webglcontextlost` and clears it on `webglcontextrestored`; until now nothing
// read it, so a lost context left a black canvas under a live HUD. This is DERIVED FROM STATE (the resume overlay's
// rule: a surface that a state predicate shows cannot be bypassed by a path nobody thought of). The whole panel is the
// tap target: save, leave the note, reload, and the boot loads that world again (game/worldBoot.js).
// If the browser restores the context on its own, the flag clears — once three has drawn a frame since (GameScene,
// game/contextRecovery.js whenDrawnAgain) — and the panel goes away.

/** @param {{ reload?: () => void }} props `reload` is a seam for the gate; the page reload by default. */
export function ContextLossPanel({ reload = reloadPage }) {
  const t = useT();
  const lost = useGameStore((s) => s.isWebGLContextLost);
  if (!lost) return null;
  const resume = () => recoverFromContextLoss({ getState: useGameStore.getState, storage: sessionStore(), reload });
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('ui.contextLost')}
      data-testid="context-loss-panel"
      onClick={resume}
      // Opaque: the canvas under it is black or stale. Same scrim tokens as the resume overlay (bold-flat, no blur).
      className="fixed inset-0 z-modal flex flex-col items-center justify-center gap-5 bg-ink cursor-pointer"
    >
      <p className="max-w-sm px-6 text-center text-lg font-bold text-text">{t('ui.contextLost')}</p>
      {/* No onClick of its own: the tap bubbles to the panel, so the recovery runs exactly once. */}
      <Button variant="primary" size="lg" data-testid="context-loss-resume">
        <Icon name="sword" size={20} className="flex-none" /> {t('ui.resume')}
      </Button>
    </div>
  );
}
