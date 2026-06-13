import { Icon } from './primitives';

// S1-C bold-flat: 4px ink chrome, navy fill, gold glyph. Opaque + drop-shadow so the controls read
// crisply over ANY scene (bright sky, dark cave) -- the first-eyeball legibility fix (iter 136).
const INK = 'var(--ui-ink, #0C1322)';
const BTN = (extra) => ({
  position: 'absolute', display: 'grid', placeItems: 'center', borderRadius: '50%',
  border: `4px solid ${INK}`, background: 'var(--ui-panel, #1A2540)', color: 'var(--ui-accent, #C9A86A)',
  boxShadow: '0 5px 14px rgba(0,0,0,0.55)', ...extra,
});

/**
 * Pure visual surface for the touch overlay (M2). Renders the joystick base ring, the bottom-right
 * thumb cluster (jump / primary / cast), a center crosshair, and a Pause affordance. NO listeners,
 * NO state -- the live overlay layers interactivity on top, and the capture-view renders this alone
 * for the mobile.png baseline. `nub` = optional {x,y} px offset for the dynamic knob (live path).
 */
export default function TouchControlsSurface({ nub = null }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 42, pointerEvents: 'none' }}>
      {/* legibility scrim: a faint dark vignette in the two thumb corners so controls pop over bright scenes */}
      <div style={{ position: 'absolute', inset: 0,
                    background: 'radial-gradient(120% 70% at 14% 100%, rgba(0,0,0,0.32), transparent 46%), radial-gradient(120% 70% at 86% 100%, rgba(0,0,0,0.32), transparent 46%)' }} />
      {/* center crosshair: gold dot + ink ring */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, transform: 'translate(-50%,-50%)',
                    borderRadius: '50%', background: 'var(--ui-accent, #C9A86A)', boxShadow: `0 0 0 3px ${INK}, 0 0 8px rgba(0,0,0,0.6)` }} />
      {/* joystick base ring (left thumb) */}
      <div style={{ position: 'absolute', left: 'max(env(safe-area-inset-left,0px), 7%)', bottom: '13%',
                    width: 148, height: 148, borderRadius: '50%', border: `4px solid ${INK}`,
                    background: 'rgba(12,19,34,0.5)', boxShadow: '0 5px 16px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64,
                      transform: `translate(calc(-50% + ${nub?.x ?? 0}px), calc(-50% + ${nub?.y ?? 0}px))`,
                      borderRadius: '50%', background: 'var(--ui-accent, #C9A86A)',
                      border: `4px solid ${INK}`, boxShadow: '0 3px 10px rgba(0,0,0,0.55)' }} />
      </div>
      {/* bottom-right thumb cluster: primary (attack/mine/interact) + cast + jump */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '12%', width: 92, height: 92 })}>
        <Icon name="sword" size={44} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 132px)', bottom: '10%', width: 68, height: 68 })}>
        <Icon name="magic" size={32} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 44px)', bottom: 'calc(12% + 104px)', width: 64, height: 64 })}>
        <span style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: 'var(--ui-accent, #C9A86A)' }}>&uarr;</span>
      </div>
      {/* Pause (top-right, inside the notch inset) */}
      <div style={BTN({ top: 'calc(env(safe-area-inset-top,0px) + 8px)', right: 8, width: 46, height: 46 })}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1, color: 'var(--ui-accent, #C9A86A)' }}>II</span>
      </div>
    </div>
  );
}
