import React from 'react';
import { Panel } from './primitives/index.js';
import { KEY_MAP, KEY_GROUPS } from '../game/keyMap.js';

// The controls panel renders from the keyMap single-source-of-truth (UX-legibility interleave,
// 2026-06-13): grouped Move / Combat / Aspects / Panels, each key a keycap chip (the same
// border-chrome bg-slot vocabulary as the talent panel's ASPECT_GUIDE), so the controls legend and
// the talent legend read as ONE system. Teaches the four signature Aspect verbs (R/V/X/Z) the player
// could not previously discover. Static React.memo — no useFrame, zero per-frame cost.
export const CombatInstructions = React.memo(() => (
  <Panel
    variant="base"
    className="absolute top-4 right-4 p-2.5 text-text pointer-events-none z-hud w-52"
  >
    <div className="font-display uppercase text-[11px] tracking-wider text-accent mb-1.5">Controls</div>
    <div className="flex flex-col gap-1.5">
      {KEY_GROUPS.map((group) => (
        <div key={group}>
          <div className="text-[8px] font-bold uppercase tracking-widest text-text-muted mb-0.5">{group}</div>
          <div className="flex flex-col gap-0.5">
            {KEY_MAP.filter((r) => r.group === group && !r.panelHide).map((r) => (
              <div key={r.key} className="flex items-center gap-2 text-[10px] leading-tight">
                <span className="font-display flex-none px-1.5 py-0.5 rounded border-chrome border-ink bg-slot text-text text-[9px] min-w-[2.4rem] text-center">{r.key}</span>
                <span className="text-text-muted">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Panel>
));
