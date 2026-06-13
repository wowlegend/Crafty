import { Sword, Zap, ChevronUp, Pause } from 'lucide-react';

// S1-C: 4px ink chrome, navy fill, GOLD glyph. Touch CONTROLS are app-chrome -> lucide outline icons
// (they tint via currentColor, unlike the 2-tone game-icons whose baked fills ignored `color` and
// rendered dark — the iter-136 eyeball bug). Opaque + drop-shadow so controls read over any scene.
const INK = 'var(--ui-ink, #0C1322)';
const GOLD = 'var(--ui-accent, #C9A86A)';
const BTN = (extra) => ({
  position: 'absolute', display: 'grid', placeItems: 'center', borderRadius: '50%',
  border: `4px solid ${INK}`, background: 'rgba(10,14,24,0.84)', color: GOLD, // near-black fill pops off the navy HUD panels (XP bar/hotbar) AND the terrain
  boxShadow: '0 5px 14px rgba(0,0,0,0.6)', ...extra,
});

/**
 * Pure visual surface for the touch overlay (M2). Joystick base ring (left), bottom-right thumb
 * cluster (jump / primary / cast), center crosshair, Pause. NO listeners, NO state -- the live
 * overlay layers interactivity on top; the capture-view renders this alone for the mobile.png
 * baseline. `nub` = optional {x,y} px offset for the dynamic knob (live path).
 */
export default function TouchControlsSurface({ nub = null }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 42, pointerEvents: 'none' }}>
      {/* legibility scrim: faint dark vignette in the two thumb corners so controls pop over bright scenes */}
      <div style={{ position: 'absolute', inset: 0,
                    background: 'radial-gradient(120% 64% at 13% 100%, rgba(0,0,0,0.34), transparent 46%), radial-gradient(120% 64% at 87% 100%, rgba(0,0,0,0.34), transparent 46%)' }} />
      {/* center crosshair: gold dot + ink ring */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, transform: 'translate(-50%,-50%)',
                    borderRadius: '50%', background: GOLD, boxShadow: `0 0 0 3px ${INK}, 0 0 8px rgba(0,0,0,0.6)` }} />
      {/* joystick base ring (left thumb) */}
      <div style={{ position: 'absolute', left: 'max(env(safe-area-inset-left,0px), 7%)', bottom: '13%',
                    width: 148, height: 148, borderRadius: '50%', border: `4px solid ${INK}`,
                    background: 'rgba(10,14,24,0.6)', boxShadow: '0 5px 16px rgba(0,0,0,0.55)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64,
                      transform: `translate(calc(-50% + ${nub?.x ?? 0}px), calc(-50% + ${nub?.y ?? 0}px))`,
                      borderRadius: '50%', background: GOLD, border: `4px solid ${INK}`, boxShadow: '0 3px 10px rgba(0,0,0,0.55)' }} />
      </div>
      {/* bottom-right thumb cluster: primary (attack/mine/interact) + cast + jump */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '12%', width: 92, height: 92 })}>
        <Sword size={46} strokeWidth={2.4} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 132px)', bottom: '10%', width: 68, height: 68 })}>
        <Zap size={34} strokeWidth={2.4} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 44px)', bottom: 'calc(12% + 104px)', width: 64, height: 64 })}>
        <ChevronUp size={38} strokeWidth={3} />
      </div>
      {/* Pause (top-right, offset LEFT of the GameHud settings gear at right-4) */}
      <div style={BTN({ top: 'calc(env(safe-area-inset-top,0px) + 10px)', right: 64, width: 46, height: 46 })}>
        <Pause size={22} strokeWidth={2.6} />
      </div>
    </div>
  );
}
