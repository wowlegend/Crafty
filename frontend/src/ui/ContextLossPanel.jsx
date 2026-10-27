import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Button, Icon } from './primitives/index.js';
import { readWorld } from '../game/worldSaves.js';
import { recoverFromContextLoss, consumeResumeWorld } from '../game/contextRecovery.js';

// THE WAY BACK FROM A LOST WEBGL CONTEXT (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item e).
// GameScene marks isWebGLContextLost on `webglcontextlost` and clears it on `webglcontextrestored`; until now nothing
// read it, so a lost context left a black canvas under a live HUD. This is DERIVED FROM STATE (the resume overlay's
// rule: a surface that a state predicate shows cannot be bypassed by a path nobody thought of). The whole panel is the
// tap target: save, leave a breadcrumb, reload — and at boot the breadcrumb loads that world again (game/contextRecovery).
// If the browser restores the context on its own, the flag clears and the panel goes away.

const sessionStore = () => {
  try { return window.sessionStorage; } catch { return null; }
};

/** @param {{ reload?: () => void }} props `reload` is a seam for the gate; the page reload by default. */
export function ContextLossPanel({ reload = () => window.location.reload() }) {
  const t = useT();
  const lost = useGameStore((s) => s.isWebGLContextLost);
  useEffect(() => {
    // Boot: a recovery reload left a breadcrumb naming the world this tab was playing. Load it once.
    const storage = sessionStore();
    if (!storage) return;
    const data = consumeResumeWorld({ storage, readWorld });
    if (!data) return;
    // At App mount the world has not mounted: loadWorldData holds the block edits until the terrain worker is published
    // (store setTerrainWorker), and the Player's spawn reads resumeSpawn instead of landing on the origin column.
    useGameStore.getState().loadWorldData(data);
    const p = data.player_data && data.player_data.position;
    if (p) useGameStore.setState({ resumeSpawn: { x: p.x, y: p.y, z: p.z } });
  }, []);
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
