import { useEffect, useRef } from 'react';
import { Sword, Zap, ChevronUp, Pause, LayoutGrid, Package, MessageCircle, Blocks, Sparkles, Wind, Flame, Lock } from 'lucide-react';
import { TRAY_PANELS } from './touchTray';
import { aspectRing, unlockedAspectVerbs, fanLayout, fanItemStyle, fanOpenerStyle, ASPECT_ROW_BOTTOM, SPELL_ROW_BOTTOM, cooldownFraction, anyOnCooldown } from '../input/aspectWheel';
import { SPELL_ORDER, spellLabelKey, spellAccent } from '../input/spellPicker';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { isCaptureMode } from '../devtest/captureMode';
import { heavyChargeLevel } from '../game/heavyAttack';
import { ANTICIPATION_SEC } from '../game/beastTransform';
import { chargeFraction, chargeRingDeg, CHARGE_SWEEPS } from '../input/touchHold';
import { useSpellAnchorRight } from '../input/useSpellAnchor';

// M3a: the panel-access tray openers (lucide, tintable) keyed by registry id -> the live overlay
// drives togglePanel on tap; this surface only draws the glyphs (grid icon always; openers when open).
// KEYED BY THE REGISTRY'S OWN `icon` NAME, not by panel id. This used to be an INDEPENDENT id->component
// map, which meant touchTray.js's `icon: 'Package'` field was never read by anything and the glyph for a
// panel was declared in two places that could disagree silently. Explicit imports stay (tree-shaking
// needs the named bindings); only the key changes, so the registry field is now the single source.
export const TRAY_ICON = { Package, MessageCircle, Blocks, Sparkles };

// S1-C: 4px ink chrome, navy fill, GOLD glyph. Touch CONTROLS are app-chrome -> lucide outline icons
// (they tint via currentColor, unlike the 2-tone game-icons whose baked fills ignored `color` and
// rendered dark — the iter-136 eyeball bug). Opaque + drop-shadow so controls read over any scene.
// B7 (18-domain review): cssVars.js emits every --ui-* color as SPACE-SEPARATED RGB CHANNELS (e.g.
// `--ui-accent: 201 168 106`, so Tailwind's `rgb(var(--x) / <a>)` opacity modifier works). So these MUST
// be wrapped in rgb() -- a bare `var(--ui-accent)` resolves to `201 168 106`, an INVALID color, which
// silently dropped the knob fill (transparent) and every button border (the hex fallback never fired
// because the var is always defined). The channel fallbacks match #0C1322 / #C9A86A.
const INK = 'rgb(var(--ui-ink, 12 19 34))';
const GOLD = 'rgb(var(--ui-accent, 201 168 106))';
// lucide glyphs take a LITERAL hex (the headless capture renders `color: var(...)` inconsistently on the
// fixed-overlay SVGs -> empty glyphs); #C9A86A is the --ui-accent token value, kept in sync by hand.
const GLYPH = '#C9A86A';
const BTN = (extra) => ({
  position: 'absolute', display: 'grid', placeItems: 'center', borderRadius: '50%',
  border: `4px solid ${INK}`, background: 'rgba(10,14,24,0.84)', color: GOLD, // near-black fill pops off the navy HUD panels (XP bar/hotbar) AND the terrain
  boxShadow: '0 5px 14px rgba(0,0,0,0.6)', ...extra,
});

// Phase 0c — the radial CHARGE RING drawn round a hold control (the roar sector, the action button). Its shape is
// static: a mask keeps only the outer 6px band of a conic sweep. Only the sweep changes, written by the tick below as a
// whole-degree index into CHARGE_SWEEPS (input/touchHold.js).
const RING_MASK = 'radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))';
const CHARGE_RING = { position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0, pointerEvents: 'none',
  WebkitMaskImage: RING_MASK, maskImage: RING_MASK };
/** Write a ring only when its sweep (`deg`, -1 = hidden) differs from what THIS element last got, so an idle tick writes
 *  nothing. Keyed by the element too: a ring re-mounted mid-charge (the Aspect ring reopened) is a new element and must
 *  be painted. NO ALLOCATION (review F5): it compares two numbers and an element, and writes a prebuilt string — this
 *  used to build a style object, its template string and a key string per ring per frame. */
function paintRing(el, deg, slot) {
  if (!el) return;
  if (slot.el === el && slot.deg === deg) return;
  slot.el = el;
  slot.deg = deg;
  if (deg < 0) {
    el.style.opacity = '0';
    return;
  }
  el.style.opacity = '1';
  el.style.background = CHARGE_SWEEPS[deg];
}
const NO_COOLDOWNS = Object.freeze({}); // the tick's fallback, shared, so a store with no cooldowns allocates nothing

/**
 * Pure visual surface for the touch overlay (M2). Joystick base ring (left), bottom-right thumb
 * cluster (jump / primary / cast), center crosshair, Pause. NO listeners, NO state -- the live
 * overlay layers interactivity on top; the capture-view renders this alone for the mobile.png
 * baseline. The knob's live position is written imperatively by TouchControls, not passed as a prop.
 */
export default function TouchControlsSurface({ trayOpen = false, wheelOpen = false, spellOpen = false }) {
  const t = useT();
  // X1 + Phase 0c (F9): EVERY Aspect gets a glyph, mirroring the hit-layer (both read aspectRing); a locked one is
  // dimmed and carries a lock, because its sector opens the Talents panel rather than firing.
  // REACTIVE, mirroring TouchControls: a non-reactive read here left the GLYPHS a frame behind the
  // hit-targets after a talent unlock — the tappable sector existed with nothing drawn on it.
  const unlockedTalents = useGameStore((s) => s.unlockedTalents);
  const ring = aspectRing(unlockedTalents);
  const aspects = unlockedAspectVerbs(unlockedTalents); // the live subset: only these can be cooling down
  const ringPositions = fanLayout(ring.length);
  const spellPositions = fanLayout(SPELL_ORDER.length);
  const spellAnchor = useSpellAnchorRight(); // the same anchor the hit-targets read (TouchControls)
  const activeSpell = useGameStore((st) => st.activeSpell);

  // X2 — COOLDOWN SWEEPS ON THE RING. Touch had no cooldown feedback at all: HUD.jsx:590 gates
  // <AbilityBar> behind !isTouchUIMode() because its bottom-4 anchor sits inside the touch
  // joystick/action band. Rather than invent a new screen region for touch (which would have to dodge the
  // joystick, the action cluster, the tray AND this ring), the sweep goes ON the control that fires the
  // verb. Same conic-gradient technique AbilityBar already proves, same Game-Loop-Isolation contract:
  // a self-contained rAF reads getState() transiently and writes to DOM refs -- no per-frame React state.
  const sweepRefs = useRef({});
  const toggleRef = useRef(null);
  const roarRingRef = useRef(null);
  const heavyRingRef = useRef(null);
  // The tick's own memory: when it first saw the roar charging, and what each ring was last painted with.
  const ringState = useRef({ roarSince: null, roar: { el: null, deg: null }, heavy: { el: null, deg: null } });
  useEffect(() => {
    if (isCaptureMode()) return undefined; // capture frames must stay byte-identical
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cds = useGameStore.getState().abilityCooldowns || NO_COOLDOWNS;
      for (const a of aspects) {
        const el = sweepRefs.current[a.verb];
        if (!el) continue;
        const frac = cooldownFraction(cds[a.verb]);
        if (frac === null) { el.style.opacity = '0'; continue; }
        el.style.opacity = '1';
        el.style.background = `conic-gradient(from 0deg, rgba(0,0,0,0.62) ${frac * 360}deg, transparent ${frac * 360}deg)`;
      }
      // The ring is SHUT most of the time, so the closed toggle carries the aggregate or the feedback is
      // invisible exactly when the player needs it.
      if (toggleRef.current) toggleRef.current.style.opacity = anyOnCooldown(cds, aspects) ? '1' : '0';
      // Phase 0c — THE CHARGE RINGS. Each reads the TRUE charge, never the touch. The roar's comes from the transform
      // state machine's own transition flag, beastCharging (Components sets it on startCharge and clears it on enter
      // and cancel), so a roar the machine refused — no full ember bar, on cooldown, dead — draws nothing however
      // long the sector is held. The heavy's comes from heavyAttack's module state, which stays 0 through the tap
      // window, so a tap never flashes a ring.
      const now = performance.now();
      const rs = ringState.current;
      if (useGameStore.getState().beastCharging) {
        if (rs.roarSince === null) rs.roarSince = now;
      } else rs.roarSince = null;
      paintRing(roarRingRef.current, chargeRingDeg(chargeFraction(rs.roarSince, now, ANTICIPATION_SEC * 1000)), rs.roar);
      const heavy = heavyChargeLevel(now);
      paintRing(heavyRingRef.current, heavy > 0 ? chargeRingDeg(heavy) : -1, rs.heavy);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [aspects]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 42, pointerEvents: 'none' }}>
      {/* legibility scrim: faint dark vignette in the two thumb corners so controls pop over bright scenes */}
      <div style={{ position: 'absolute', inset: 0,
                    background: 'radial-gradient(120% 64% at 13% 100%, rgba(0,0,0,0.34), transparent 46%), radial-gradient(120% 64% at 87% 100%, rgba(0,0,0,0.34), transparent 46%)' }} />
      {/* M3a panel-access tray: a left-edge grid icon (always) -> a vertical column of panel openers when
          open. Anchored to vertical-CENTER of the left edge so it sits between the top-left quest tracker
          and the bottom joystick (13%) regardless of how many quests are tracked (collision-robust). */}
      <div style={BTN({ top: 'calc(50% - 140px)', left: 'calc(env(safe-area-inset-left,0px) + 10px)', width: 46, height: 46 })}>
        <LayoutGrid size={22} strokeWidth={2.4} color={GLYPH} />
      </div>
      {trayOpen && TRAY_PANELS.map((p, i) => {
        const Icon = TRAY_ICON[p.icon];
        return (
          <div key={p.id} aria-label={t(p.labelKey)}
               style={BTN({ top: `calc(50% - 84px + ${i * 56}px)`, left: 'calc(env(safe-area-inset-left,0px) + 12px)', width: 52, height: 52 })}>
            {Icon && <Icon size={26} strokeWidth={2.4} color={GLYPH} />}
          </div>
        );
      })}
      {/* X1 ASPECT RING (STATUS §E-bis): the four Aspect verbs had no touch affordance at all, so the
          game's signature was desktop-only. Toggle sits above the cast button, in thumb reach; the ring
          fans out from it. Geometry comes from the shared fanItemStyle() so the glyphs and the hit-targets in
          TouchControls cannot drift apart — they read the same function, not two copies of the numbers. */}
      <div style={BTN(fanOpenerStyle(ASPECT_ROW_BOTTOM))}>
        <Flame size={24} strokeWidth={2.4} color={GLYPH} />
        <div ref={toggleRef} data-testid="aspect-cooling" style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8,
                      borderRadius: '50%', background: GOLD, border: `2px solid ${INK}`, opacity: 0 }} />
      </div>
      {wheelOpen && ring.map((a, i) => {
        const q = ringPositions[i] || { x: 0, y: 0 };
        return (
          <div key={a.verb} aria-label={a.aspect} data-testid={`aspect-glyph-${a.verb}`} data-locked={a.locked ? 'true' : 'false'}
               style={BTN({ ...fanItemStyle(ASPECT_ROW_BOTTOM, q), opacity: a.locked ? 0.55 : 1 })}>
            {a.locked
              ? <Lock size={20} strokeWidth={2.6} color={GLYPH} />
              : <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: GLYPH }}>{a.key}</span>}
            {!a.locked && (
              <div ref={(el) => { sweepRefs.current[a.verb] = el; }} data-testid={`aspect-sweep-${a.verb}`}
                   style={{ position: 'absolute', inset: 0, borderRadius: '50%', opacity: 0, pointerEvents: 'none' }} />
            )}
            {/* Phase 0c: the roar is the one held sector, so it is the one that carries a charge ring. */}
            {!a.locked && a.verb === 'roar' && <div ref={roarRingRef} data-testid="touch-charge-roar" style={CHARGE_RING} />}
          </div>
        );
      })}
      {/* X2b SPELL PICKER glyphs. Each button is tinted with the spell's OWN roster colour
          (spellAccent -> SPELL_TYPES[id].color), so the picker cannot drift from the projectile the player
          will actually see. The closed toggle carries the currently-active spell's tint, which is the only
          way a touch player could previously have known what they were about to cast: not at all. */}
      <div data-testid="touch-spells-glyph" style={BTN(fanOpenerStyle(SPELL_ROW_BOTTOM, spellAnchor))}>
        <Sparkles size={24} strokeWidth={2.4} color={spellAccent(activeSpell) || GLYPH} />
      </div>
      {spellOpen && SPELL_ORDER.map((id, i) => {
        const q = spellPositions[i] || { x: 0, y: 0 };
        const accent = spellAccent(id) || GLYPH;
        return (
          <div key={id} aria-label={t(spellLabelKey(id))} data-testid={`spell-glyph-${id}`}
               style={BTN({ ...fanItemStyle(SPELL_ROW_BOTTOM, q, spellAnchor), borderColor: id === activeSpell ? accent : undefined })}>
            <Sparkles size={22} strokeWidth={2.4} color={accent} />
          </div>
        );
      })}
      {/* center crosshair: gold dot + ink ring */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, transform: 'translate(-50%,-50%)',
                    borderRadius: '50%', background: GOLD, boxShadow: `0 0 0 3px ${INK}, 0 0 8px rgba(0,0,0,0.6)` }} />
      {/* joystick base ring (left thumb). data-touch-zone: the place the drawn stick sends the thumb, so no control may
          sit on it (tests/gates/touch-layout-gates.test.jsx reads this element's rectangle). */}
      <div data-touch-zone="joystick" style={{ position: 'absolute', left: 'max(env(safe-area-inset-left,0px), 7%)', bottom: '13%',
                    width: 148, height: 148, borderRadius: '50%', border: `4px solid ${INK}`,
                    background: 'rgba(10,14,24,0.6)', boxShadow: '0 5px 16px rgba(0,0,0,0.55)' }}>
        <div data-touch-knob style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64,
                      // Identity, matching what TouchControls recenters to. The knob's position is owned
                      // IMPERATIVELY (a ref + a direct transform write, throttled to one rAF) because a
                      // per-move setState would violate Game-Loop-Isolation. The declarative `nub` prop was
                      // the first implementation and nothing ever passed it, so it rendered 0,0 forever.
                      transform: 'translate(-50%, -50%)',
                      borderRadius: '50%', background: GOLD, border: `4px solid ${INK}`, boxShadow: '0 3px 10px rgba(0,0,0,0.55)' }} />
      </div>
      {/* bottom-right thumb cluster: primary (attack/mine/interact) + cast + jump */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '12%', width: 92, height: 92 })}>
        <Sword size={46} strokeWidth={2.4} color={GLYPH} />
        {/* Phase 0c: the heavy's charge ring — the action button is held to charge it. */}
        <div ref={heavyRingRef} data-testid="touch-charge-heavy" style={CHARGE_RING} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 132px)', bottom: '10%', width: 68, height: 68 })}>
        <Zap size={34} strokeWidth={2.4} color={GLYPH} />
      </div>
      {/* M3 #6: touch DODGE (above cast) -- dispatches the same dodge intent as Shift; the roll/i-frames
          state machine already runs in Components. A dash glyph evokes the evade-roll. */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 132px)', bottom: 'calc(10% + 90px)', width: 60, height: 60 })}>
        <Wind size={30} strokeWidth={2.4} color={GLYPH} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 44px)', bottom: 'calc(12% + 104px)', width: 64, height: 64 })}>
        <ChevronUp size={38} strokeWidth={3} color={GLYPH} />
      </div>
      {/* Pause (top-right, offset LEFT of the GameHud settings gear at right-4) */}
      <div data-testid="touch-pause-glyph" style={BTN({ top: 'calc(env(safe-area-inset-top,0px) + 10px)', right: 64, width: 46, height: 46 })}>
        <Pause size={22} strokeWidth={2.6} color={GLYPH} />
      </div>
    </div>
  );
}
