import React from 'react';
import { Panel } from './primitives/index.js';

export const CombatInstructions = React.memo(() => (
  <Panel
    variant="base"
    className="absolute top-4 right-4 p-3 text-text text-sm pointer-events-none z-hud"
  >
    <div className="font-display uppercase text-xs tracking-wider text-accent mb-1">Controls</div>
    <div>Click or F - Attack/Cast Spell</div>
    <div>E - Inventory</div>
    <div>M - Magic</div>
    <div>C - Crafting</div>
    <div>B - Building</div>
    <div>ESC - Settings</div>
  </Panel>
));
