import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { StatBar } from './primitives/index.js';
import { EMBER_MAX } from '../game/ember.js';

// The one Aspect meter's bar (game/ember.js), in the HUD's stat stack. Hidden at zero, so an empty bar takes no room
// and a capture state, which never banks, draws nothing. It shows before any Aspect is unlocked: a bar that fills from
// the first day kill points a new player at the Talents panel.
export const EmberBar = React.memo(function EmberBar() {
  const ember = useGameStore((s) => s.ember);
  const t = useT();
  if (!(ember > 0)) return null;
  return (
    <StatBar kind="ember" data-testid="ember-bar" value={ember} max={EMBER_MAX} icon="fire"
      label={t('hud.ember')} showValue slim className="w-full" />
  );
});
