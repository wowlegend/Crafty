import React, { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { nearestLandmark } from '../world/shrines.js';
import { blightHeartSite } from '../world/blightHeart.js';
import { Panel } from './primitives/index.js';

// A circular clipped radial minimap with persistent destination blips. Reuses the seams the compass
// already consumes (nearestLandmark / blightHeartSite / HOME at origin) + the mobEntities + npcEntities
// store mirrors. A self-contained 250ms canvas redraw (Game-Loop-Isolation: transient getState reads,
// no per-frame React state). Out-of-range destination blips are clamped to the rim with a small arrow.
// Capture-SUPPRESSED (the canvas redraw never starts) so the 20 visual baselines stay byte-identical.
const SIZE = 132, RANGE = 64;

export const RadialMinimap = React.memo(({ position = 'bottom-20 right-4' }) => {
  const canvasRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, z: 0 });
  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const cx = SIZE / 2, cy = SIZE / 2, scale = SIZE / 2 / RANGE, R = SIZE / 2 - 2;
    const shrineCache = { t: 0, s: null };
    const blip = (wx, wz, px, pz, color, clamp) => {
      let dx = (wx - px) * scale, dz = (wz - pz) * scale;
      const d = Math.hypot(dx, dz);
      if (d > R) { if (!clamp) return; dx = (dx / d) * R; dz = (dz / d) * R; }
      ctx.beginPath(); ctx.arc(cx + dx, cy + dz, clamp ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    };
    const draw = () => {
      const pp = useGameStore.getState().playerPosition; if (!pp) return;
      setCoords({ x: Math.round(pp.x), z: Math.round(pp.z) });
      // circular clip
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(12,10,18,0.88)'; ctx.fillRect(0, 0, SIZE, SIZE);
      // mobs
      (useGameStore.getState().mobEntities || []).forEach((m) => blip(m.position[0], m.position[2], pp.x, pp.z, m.passive ? '#4ade80' : '#ef4444', false));
      // NPCs
      (useGameStore.getState().npcEntities || []).forEach((n) => blip(n.position[0], n.position[2], pp.x, pp.z, '#F5D76E', false));
      // destinations (clamped to rim)
      blip(0, 0, pp.x, pp.z, '#FBBF24', true); // HOME
      const now = performance.now();
      if (now - shrineCache.t > 1000) shrineCache.s = nearestLandmark(pp.x, pp.z), shrineCache.t = now;
      if (shrineCache.s) blip(shrineCache.s.worldX, shrineCache.s.worldZ, pp.x, pp.z, '#46E0FF', true);
      const bh = blightHeartSite(); blip(bh.x, bh.z, pp.x, pp.z, '#A24BFF', true);
      // player
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      // rim + N tick (token system font, not the retired off-brand display face)
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', cx, 11);
    };
    const id = setInterval(draw, 250); draw();
    return () => clearInterval(id);
  }, []);
  if (isCaptureMode()) return null;
  return (
    <div className={`absolute ${position} z-20 pointer-events-none`}>
      <Panel variant="base" className="overflow-hidden p-0 leading-none rounded-full" style={{ borderRadius: '50%' }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block" style={{ borderRadius: '50%' }} />
      </Panel>
      <div className="text-center text-xs mt-1 tabular-nums text-text-muted">{coords.x}, {coords.z}</div>
    </div>
  );
});
