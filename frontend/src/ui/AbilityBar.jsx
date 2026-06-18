import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { Slot, Icon } from './primitives/index.js';

// The signature-ability action bar with CSS conic-gradient radial cooldown sweeps. Reads the
// store's abilityCooldowns mirror (written ~6.7x/s by Components.jsx) — never the component-local
// SM refs. Game-Loop-Isolation: a self-contained rAF reads getState() transiently and writes the
// sweep angle to a DOM ref; no per-frame React state. Capture-SUPPRESSED so the 20 visual baselines
// stay byte-identical (the bar is gated on owned abilities the capture saves never have anyway).
const SLOTS = [
  { key: 'grab', label: 'GRAB', icon: 'force', accent: '#9D4BFF' },
  { key: 'snare', label: 'SNARE', icon: 'magic', accent: '#3DFFB0' },
  { key: 'imbue', label: 'IMBUE', icon: 'magic', accent: '#F5E6A8' },
  { key: 'roar', label: 'ROAR', icon: 'run', accent: '#FF7A1A' },
  { key: 'dodge', label: 'DODGE', icon: 'shield', accent: '#46E0FF' },
];

export const AbilityBar = React.memo(() => {
  const sweepRefs = useRef({});
  useEffect(() => {
    if (isCaptureMode()) return undefined;
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cds = useGameStore.getState().abilityCooldowns || {};
      for (const s of SLOTS) {
        const el = sweepRefs.current[s.key];
        if (!el) continue;
        const cd = cds[s.key];
        if (!cd || cd.ready || !cd.duration) { el.style.opacity = '0'; continue; }
        const frac = Math.min(1, Math.max(0, cd.remaining / cd.duration));
        el.style.opacity = '1';
        // conic sweep from top, clockwise; the dark wedge shrinks as the cooldown elapses
        el.style.background = `conic-gradient(from 0deg, rgba(0,0,0,0.62) ${frac * 360}deg, transparent ${frac * 360}deg)`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (isCaptureMode()) return null;
  const cds = useGameStore.getState().abilityCooldowns || {};
  const owned = SLOTS.filter((s) => s.key === 'dodge' || cds[s.key] != null);
  if (owned.length <= 1) return null; // only dodge -> no Aspect unlocked yet; keep HUD clean

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex gap-2">
      {owned.map((s) => (
        <div key={s.key} className="relative">
          <Slot className="w-12 h-12 flex flex-col items-center justify-center">
            <Icon name={s.icon} size={18} style={{ color: s.accent }} />
            <span className="text-[8px] font-bold tracking-wide text-text-muted leading-none mt-0.5">{s.label}</span>
          </Slot>
          <div
            ref={(el) => (sweepRefs.current[s.key] = el)}
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{ opacity: 0 }}
          />
        </div>
      ))}
    </div>
  );
});
