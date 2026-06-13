import { Icon } from './primitives';

const BTN = (extra) => ({
  position: 'absolute', display: 'grid', placeItems: 'center',
  borderRadius: '50%', border: '3px solid var(--ui-ink, #0C1322)',
  background: 'var(--ui-panel, #1A2540)', color: 'var(--ui-accent, #C9A86A)',
  opacity: 0.82, pointerEvents: 'none', ...extra,
});

/**
 * Pure visual surface for the touch overlay (M2). Renders the resting joystick base ring,
 * the bottom-right thumb cluster (jump / primary / cast), a center crosshair, and a Pause
 * affordance. NO listeners, NO state -- the live overlay layers interactivity on top, and the
 * capture-view renders this alone for the mobile.png baseline. `nub` = optional {x,y} px offset
 * for the dynamic joystick knob (the live path passes it; the capture-view omits it -> resting).
 */
export default function TouchControlsSurface({ nub = null }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* center crosshair */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 22, height: 22,
                    transform: 'translate(-50%,-50%)', borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.7)', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
      {/* resting joystick base ring (left thumb) */}
      <div style={{ position: 'absolute', left: 'max(env(safe-area-inset-left,0px), 6%)', bottom: '14%',
                    width: 132, height: 132, borderRadius: '50%',
                    border: '3px solid var(--ui-ink, #0C1322)', background: 'rgba(26,37,64,0.45)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 56, height: 56,
                      transform: `translate(calc(-50% + ${nub?.x ?? 0}px), calc(-50% + ${nub?.y ?? 0}px))`,
                      borderRadius: '50%', background: 'var(--ui-accent, #C9A86A)', opacity: 0.85,
                      border: '3px solid var(--ui-ink, #0C1322)' }} />
      </div>
      {/* bottom-right thumb cluster: primary (attack/mine/interact) + cast + jump */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '11%', width: 84, height: 84 })}>
        <Icon name="sword" size={38} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: '9%', width: 64, height: 64 })}>
        <Icon name="magic" size={28} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 40px)', bottom: 'calc(11% + 96px)', width: 60, height: 60 })}>
        <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>^</span>
      </div>
      {/* Pause (top-right, inside the notch inset) */}
      <div style={BTN({ top: 'calc(env(safe-area-inset-top,0px) + 8px)', right: 8, width: 44, height: 44, opacity: 0.7 })}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>II</span>
      </div>
    </div>
  );
}
