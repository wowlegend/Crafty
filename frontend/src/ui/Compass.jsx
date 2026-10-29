// Compass — the strip at the top of the HUD (the HUD lane's task script, decision 4). It rendered markup into
// `innerHTML` every HUD frame; it is now a fixed pool of marker slots rendered once by React, and the HUD ticker
// (ui/hudTicker.js) moves each slot and writes its text only when a value changed: no React state per frame
// (Game-Loop Isolation), and standing still writes nothing. Labels go through t() and sit where compassLayout.js puts
// them, so two markers close together never print one label over the other.
import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { subscribeHudTick } from './hudTicker.js';
import { layoutCompass } from './compassLayout.js';
import { markersNow, CARDINALS, NPC_SLOTS, CHEST_SLOTS } from './compassMarkers.js';
import { Icon } from './primitives/index.js';

const FOV = Math.PI; // the half of the horizon ahead

// The pool: every slot a marker can occupy, with its kind's look. Colours are gameplay data (inline colour allowed).
const KIND_LOOK = {
  cardinal: { color: '#E2E8F0', icon: null },
  boss: { color: '#F43F5E', icon: 'dragon' },
  home: { color: '#FBBF24', icon: 'home' },
  shrine: { color: '#46E0FF', icon: 'rune' },
  blight: { color: '#A24BFF', icon: 'artifact' },
  npc: { color: '#34D399', icon: 'mascot' },
  chest: { color: '#FBBF24', icon: 'treasure' },
};
const SLOTS = [
  ...CARDINALS.map(([key]) => ({ id: `cardinal:${key}`, kind: 'cardinal' })),
  { id: 'boss', kind: 'boss' }, { id: 'home', kind: 'home' }, { id: 'shrine', kind: 'shrine' }, { id: 'blight', kind: 'blight' },
  ...Array.from({ length: NPC_SLOTS }, (_, i) => ({ id: `npc:${i}`, kind: 'npc' })),
  ...Array.from({ length: CHEST_SLOTS }, (_, i) => ({ id: `chest:${i}`, kind: 'chest' })),
];

/** The pool, rendered once: every slot's label (icon and text) and pip, hidden until the ticker places it. */
const CompassSlots = React.memo(({ setRef }) => SLOTS.map((slot) => {
  const look = KIND_LOOK[slot.kind];
  const cardinal = slot.kind === 'cardinal';
  return (
    <React.Fragment key={slot.id}>
      <div ref={(n) => setRef(slot.id, 'label', n)} data-compass-label={slot.kind} data-compass-id={slot.id}
        className={`absolute left-0 ${cardinal ? 'top-0.5' : 'top-0'} flex items-center gap-0.5 whitespace-nowrap leading-none`}
        style={{ visibility: 'hidden', color: look.color, textShadow: '0 1px 2px rgb(var(--ui-ink))' }}>
        {look.icon && <Icon name={look.icon} size={10} className="flex-none" />}
        <span ref={(n) => setRef(slot.id, 'text', n)} className={`${cardinal ? 'text-[10px] tracking-wider' : 'text-[9px]'} font-bold tabular-nums`} />
      </div>
      <div ref={(n) => setRef(slot.id, 'pip', n)} data-compass-pip={slot.kind}
        className={`absolute left-0 bottom-1 -ml-[3px] w-1.5 h-1.5 ${cardinal ? 'opacity-50' : ''} ${slot.kind === 'home' || slot.kind === 'blight' ? 'rotate-45' : 'rounded-full'}`}
        style={{ visibility: 'hidden', background: look.color }} />
    </React.Fragment>
  );
}));

export const Compass = React.memo(({ treasureChests, bossSystem }) => {
  const trackRef = useRef(null);
  const slotRefs = useRef({}); // id -> { pip, label, text }
  // The ticker reads the props through a ref, so a new chests array does not re-run the effect and rewrite the strip.
  const propsRef = useRef({});
  propsRef.current = {
    bossActive: !!bossSystem?.bossActive, chests: treasureChests?.chests, openedChestIds: treasureChests?.openedChestIds,
  };

  useEffect(() => {
    const shrineCache = {};
    const written = {}; // id -> { pip, label, text, width, shown } as last written
    let stripPx = trackRef.current?.clientWidth || 0;
    const onResize = () => { stripPx = trackRef.current?.clientWidth || stripPx; };
    window.addEventListener('resize', onResize);

    const tick = () => {
      const state = useGameStore.getState();
      const camera = state.gameCamera;
      const pp = state.playerPosition;
      if (!camera || !camera.matrixWorld || !pp || !stripPx) {
        if (!stripPx) stripPx = trackRef.current?.clientWidth || 0;
        return;
      }
      const el = camera.matrixWorld.elements;
      const heading = Math.atan2(-el[8], el[10]);
      const markers = markersNow(state, pp, propsRef.current, shrineCache);
      // Text first, so a label is measured when (and only when) its text changes.
      for (const m of markers) {
        const s = slotRefs.current[m.id];
        const w = written[m.id] || (written[m.id] = {});
        if (s && w.text !== m.text) {
          s.text.textContent = m.text;
          w.text = m.text;
          w.width = s.label.offsetWidth;
        }
        m.labelWidth = w.width || 0;
      }
      const placed = new Map(layoutCompass(markers, { heading, fov: FOV, stripPx }).map((p) => [p.id, p]));
      for (const slot of SLOTS) {
        const s = slotRefs.current[slot.id];
        if (!s) continue;
        const w = written[slot.id] || (written[slot.id] = {});
        const p = placed.get(slot.id);
        const pip = p ? `translateX(${p.x.toFixed(1)}px)` : null;
        const label = p && p.labelVisible ? `translateX(${(p.labelX - (w.width || 0) / 2).toFixed(1)}px)` : null;
        // Each property is written only when it changes: a style write of the value already there is still a write
        // (the browser records it), and standing still this strip should write nothing.
        if (pip && w.pip !== pip) { w.pip = pip; s.pip.style.transform = pip; }
        if (w.pipShown !== !!pip) { w.pipShown = !!pip; s.pip.style.visibility = pip ? 'visible' : 'hidden'; }
        if (label && w.label !== label) { w.label = label; s.label.style.transform = label; }
        if (w.labelShown !== !!label) { w.labelShown = !!label; s.label.style.visibility = label ? 'visible' : 'hidden'; }
      }
    };
    tick();
    const unsubscribe = subscribeHudTick(tick);
    return () => { unsubscribe(); window.removeEventListener('resize', onResize); };
  }, []);

  // One ref setter for the life of the component, handed to the memoized slots, so a re-render of the compass (its props
  // change identity with every App render) never re-renders them: React 19 re-applies an icon's innerHTML on every
  // render, and hud-churn counted those 15 rewrites (one per game-icon slot) as writes of what was already there.
  const setRef = useRef((id, part, node) => {
    const s = slotRefs.current[id] || (slotRefs.current[id] = {});
    s[part] = node;
  }).current;

  return (
    // Below the top band wherever the centred strip would reach the quest line (left, up to 252 px) or the gear: under
    // 900 px wide (a tablet in portrait, a phone).
    <div className="absolute top-3 max-[900px]:top-16 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
      <div data-testid="hud-compass" className="w-[320px] max-[640px]:w-[200px] h-[34px] bg-panel-frame border-chrome border-ink rounded-md shadow-elev-md relative flex items-center justify-center overflow-hidden">
        {/* Alignment reticle line */}
        <div className="absolute top-0 bottom-0 w-[1.5px] bg-info z-20"></div>
        <div ref={trackRef} data-testid="compass-track" className="w-[280px] max-[640px]:w-[160px] h-full relative overflow-hidden">
          <CompassSlots setRef={setRef} />
        </div>
      </div>
    </div>
  );
});
