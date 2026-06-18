import React from 'react';
import { Cube, Emissive } from './mascots/voxelKit';
import { isCaptureMode } from '../devtest/captureMode';
import { HUB_BUILDINGS } from '../world/hubLayout.js';
import { HEARTH_Y } from '../world/homeAnchor.js';

// W3 M-HUB — the Hearth's frontier-outpost buildings (forge / stall / watchtower / cabin) ringing the
// raised plinth, built from voxelKit Cube/Emissive so they share the locked toon art direction (NOT
// PBR). Modelled on HomeAnchorRender (Terrain.jsx) — same HEARTH_TOP base + capture-null glow. The
// glow (forge fire / lookout lantern) self-nulls under isCaptureMode so the deterministic baselines
// only change by the static building geometry (a deliberate `hearth` re-baseline).
// Render base = HEARTH_Y + 0.5 (the plinth cap surface), imported from homeAnchor.js as the SINGLE
// source of truth. (W2-T7 flushed the pad HEARTH_Y 56->51 but Terrain.jsx's old hard-coded HEARTH_TOP=56
// was left stale -> the lodge AND these buildings floated ~5 blocks; both now key off HEARTH_Y so they
// can't drift again.) Off-plinth buildings get a flush terrace via stampHub (world/homeAnchor.js).
const HEARTH_TOP = HEARTH_Y;
const PAL = { wood: '#6B4A2F', stone: '#8A8A8A', roof: '#7A3B2E', dark: '#3A2A1C', iron: '#4A4A52' };

function Forge() {
  return (
    <group>
      <Cube position={[0, 0.4, 0]} size={[3.4, 0.8, 3.0]} color={PAL.stone} castShadow={false} />
      <Cube position={[0, 1.4, -0.4]} size={[2.4, 1.6, 1.6]} color={PAL.dark} castShadow={false} />
      <Cube position={[0, 2.6, -0.4]} size={[0.7, 1.0, 0.7]} color={PAL.iron} castShadow={false} />{/* chimney */}
      {!isCaptureMode() && <Emissive position={[0, 1.0, 0.8]} size={0.4} color="#FF7A1A" intensity={2.6} />}{/* forge fire */}
    </group>
  );
}
function Stall() {
  return (
    <group>
      <Cube position={[0, 1.4, 0]} size={[0.25, 2.8, 0.25]} color={PAL.wood} castShadow={false} />
      <Cube position={[2.4, 1.4, 0]} size={[0.25, 2.8, 0.25]} color={PAL.wood} castShadow={false} />
      <Cube position={[1.2, 0.5, 0]} size={[2.8, 1.0, 1.4]} color={PAL.wood} castShadow={false} />{/* counter */}
      <Cube position={[1.2, 2.9, 0]} size={[3.2, 0.3, 1.8]} color="#B23A48" castShadow={false} />{/* striped awning */}
    </group>
  );
}
function Watchtower() {
  return (
    <group>
      <Cube position={[0, 3.0, 0]} size={[2.2, 6.0, 2.2]} color={PAL.wood} castShadow={false} />
      <Cube position={[0, 6.3, 0]} size={[2.8, 0.6, 2.8]} color={PAL.stone} castShadow={false} />{/* platform */}
      <Cube position={[0, 7.0, 0]} size={[2.4, 0.8, 2.4]} color={PAL.roof} castShadow={false} />{/* roof */}
      {!isCaptureMode() && <Emissive position={[0, 6.8, 0]} size={0.5} color="#F5D76E" intensity={2.2} />}{/* lookout lantern */}
    </group>
  );
}
function Cabin() {
  return (
    <group>
      <Cube position={[0, 0.9, 0]} size={[3.0, 1.8, 2.6]} color={PAL.wood} castShadow={false} />
      <Cube position={[0, 2.1, 0]} size={[3.4, 0.5, 3.0]} color={PAL.roof} castShadow={false} />
      <Cube position={[-1.0, 0.5, 1.4]} size={[0.5, 0.5, 0.5]} color="#3E7D32" castShadow={false} />{/* herb box */}
    </group>
  );
}
const KIND = { forge: Forge, stall: Stall, watchtower: Watchtower, cabin: Cabin };

export const HubRender = React.memo(() => {
  return (
    <group position={[0, HEARTH_TOP + 0.5, 0]}>
      {HUB_BUILDINGS.map((b, i) => {
        const C = KIND[b.kind];
        return C ? <group key={i} position={[b.pos[0], 0, b.pos[1]]} rotation={[0, b.rot || 0, 0]}><C /></group> : null;
      })}
    </group>
  );
});
