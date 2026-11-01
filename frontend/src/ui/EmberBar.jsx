import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { StatBar } from './primitives/index.js';
import { EMBER_MAX, emberMarks } from '../game/ember.js';

// The one Aspect meter's bar (game/ember.js), in the HUD's stat stack. Hidden at zero, so an empty bar takes no room
// and a capture state, which never banks, draws nothing. It shows before any Aspect is unlocked: a bar that fills from
// the first day kill points a new player at the Talents panel. Each unlocked verb's price is a mark on the track, lit
// once the bar pays for it (the four retired bars named their verbs at their prices).
export const EmberBar = React.memo(function EmberBar() {
  const ember = useGameStore((s) => s.ember);
  const talents = useGameStore((s) => s.unlockedTalents);
  const t = useT();
  if (!(ember > 0)) return null;
  const marks = emberMarks(talents).map((m) => ({ at: m.cost / EMBER_MAX, lit: ember >= m.cost, cost: m.cost }));
  return (
    <StatBar kind="ember" data-testid="ember-bar" value={ember} max={EMBER_MAX} icon="fire"
      label={t('hud.ember')} showValue slim marks={marks} className="w-full" />
  );
});
