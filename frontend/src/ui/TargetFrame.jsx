import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { ON_WORLD_TEXT } from './onWorldText.js';

// The aimed mob's or NPC's nameplate: its name and health over a 4 px health line, on the world as the level and the XP
// edge are, with no panel behind it (DECISIONS 2026-10-29 item 99: the HUD at rest is flat). It reads the store's
// targetEntity mirror (written by Components.jsx off the aim cone) and sits in the HUD's encounter column above the
// boss bar (HUD.jsx). Capture-SUPPRESSED.
export const TargetFrame = React.memo(() => {
  const target = useGameStore((s) => s.targetEntity);
  if (isCaptureMode() || !target) return null;
  const frac = Math.max(0, Math.min(1, (target.health || 0) / (target.maxHealth || 1)));
  return (
    <div data-testid="target-frame" className="min-w-[180px] pointer-events-none">
      <div className="flex items-center justify-between gap-2 leading-none" style={ON_WORLD_TEXT}>
        <span className="text-xs font-bold text-text capitalize">{target.name}</span>
        <span className="text-[10px] font-bold text-text tabular-nums">{Math.max(0, Math.ceil(target.health))}/{target.maxHealth}</span>
      </div>
      <div className="relative mt-1 h-1 bg-track rounded-sm overflow-hidden">
        <div className="absolute inset-y-0 left-0" style={{ width: `${frac * 100}%`, background: target.isAlly ? '#3DFFB0' : frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#F5D76E' : '#FF6B6B' }} />
      </div>
    </div>
  );
});
