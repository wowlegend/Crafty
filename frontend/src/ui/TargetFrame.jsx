import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { Panel } from './primitives/index.js';

// A framed target/unit nameplate (top-center, under the ObjectiveTracker) shown when the player
// aims at a mob/NPC. Reuses the BossHealthBar visual grammar at a smaller scale; reads the store's
// targetEntity mirror (written by Components.jsx off the aim-cone). Capture-SUPPRESSED.
export const TargetFrame = React.memo(() => {
  const target = useGameStore((s) => s.targetEntity);
  if (isCaptureMode() || !target) return null;
  const frac = Math.max(0, Math.min(1, (target.health || 0) / (target.maxHealth || 1)));
  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <Panel variant="raise" className="px-3 py-1.5 min-w-[180px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-text capitalize">{target.name}</span>
          <span className="text-[10px] text-text-muted tabular-nums">{Math.ceil(target.health)}/{target.maxHealth}</span>
        </div>
        <div className="relative mt-1 h-2 bg-track rounded-sm ring-1 ring-ink overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: `${frac * 100}%`, background: target.isAlly ? '#3DFFB0' : frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#F5D76E' : '#FF6B6B' }} />
        </div>
      </Panel>
    </div>
  );
});
