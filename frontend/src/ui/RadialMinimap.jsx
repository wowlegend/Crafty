import React, { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { nearestLandmark } from '../world/shrines.js';
import { blightHeartSite } from '../world/blightHeart.js';
import { Panel } from './primitives/index.js';
import { mobsQuery, alliesQuery } from '../ecs/world';

// A circular clipped radial minimap with persistent destination blips. Reuses the seams the compass
// already consumes (nearestLandmark / blightHeartSite / HOME at origin) + the live ECS queries (mobsQuery for mobs
// and the hub NPCs, type 'villager'; alliesQuery for bound allies). A self-contained 250ms canvas redraw
// (Game-Loop-Isolation: transient reads of the store and the queries, no per-frame React state). Out-of-range destination blips are clamped to the rim with a small arrow.
// Capture-SUPPRESSED (the canvas redraw never starts) so the 20 visual baselines stay byte-identical.
const SIZE = 112, RANGE = 64;

// `coords={false}` leaves the coordinates line out where the map has no room below it (a short touch screen: HUD.jsx).
export const RadialMinimap = React.memo(({ position = 'bottom-20 right-4', coords: showCoords = true }) => {
  const canvasRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, z: 0 });
  useEffect(() => {
    if (isCaptureMode()) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined; // context-loss / not-ready guard (else every ctx.* below throws)
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
      // mobs, and the NPCs (hub villagers and bound allies) in gold
      for (const m of mobsQuery.entities) {
        if (!(m.health > 0)) continue;
        blip(m.position.x, m.position.z, pp.x, pp.z, m.type === 'villager' ? '#F5D76E' : (m.passive ? '#4ade80' : '#ef4444'), false);
      }
      for (const a of alliesQuery.entities) if (a.health > 0) blip(a.position.x, a.position.z, pp.x, pp.z, '#F5D76E', false);
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
  // NO EARLY RETURN. Returning null removed the minimap from EVERY baseline, so roughly a dozen
  // HUD-bearing frames could not catch a regression in it at all -- and unlike TargetFrame this component
  // draws unconditional content (rim, N tick, player dot, clamped HOME/shrine/blight arrows) that depends
  // on no suppressed entity, so a declared resting render is real oracle coverage rather than noise. The
  // 250ms redraw interval above is already deterministic under capture: it reads the pinned camera pose.
  //
  // This is the repo's own rule -- a capture guard RESETS to a declared value, it does not early-return --
  // applied to a component that had been opting out of the oracle entirely.
  return (
    <div data-testid="radial-minimap" className={`absolute ${position} z-20 pointer-events-none`}>
      <Panel variant="base" radius="rounded-full" shadow="shadow-none" className="overflow-hidden p-0 leading-none" style={{ borderRadius: '50%' }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="block" style={{ borderRadius: '50%' }} />
      </Panel>
      {showCoords && <div className="text-center text-xs mt-1 tabular-nums text-text-muted">{coords.x}, {coords.z}</div>}
    </div>
  );
});
