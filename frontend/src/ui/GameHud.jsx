// The HUD chrome: MinecraftHotbar (the bottom block hotbar, with the level and a 4 px XP edge along its top) and GameUI
// (the HUD overlay: settings and the hotbar). Both take their values as props, with no store coupling. The desktop side
// rail is gone (the HUD lane's task script, decision 3): its panels keep their keys, and touch keeps its tray.
import React from 'react';
import { useT } from '../i18n/i18n.js';
import { motion } from 'framer-motion';
import { Panel, Slot, Button, Icon } from './primitives/index.js';
import { BLOCK_TYPES, HOTBAR_BLOCKS } from '../world/Blocks';
import { ControlsHint } from './CombatInstructions.jsx';

// X3 — FIXED 2026-08-05, and CONFIRMED by a lived browser run before the fix was written.
//
// The bug: the full-screen TOUCH layer (ui/TouchControls.jsx, z-40) sits ABOVE the HUD (z-20), and its
// `onStart` routed any touch that was not a `button[data-touch-btn]` into the move/look zones AND called
// preventDefault(), suppressing the synthesized click. A hotbar slot is a `<button data-hotbar-block>`
// inside the `data-hud-interactive` container below — neither matched — so the tap never reached its
// onClick, leaving a voxel BUILDING game locked to one block on its own stated iPad target.
//
// The routing now lives in `input/touchOwnership.js` (`ownsTouch`), which the router calls; it claims both
// `button[data-touch-btn]` and `[data-hud-interactive]`.
//
// TWO EARLIER VERSIONS OF THIS COMMENT WERE WRONG IN OPPOSITE DIRECTIONS, which is why the wording above is
// deliberately specific. The first asserted the fix was done when only the seam existed. The second
// correctly retracted that, but described the mechanism as a code READING — unconfirmed, because every
// attempt to verify it had failed to get into the game. `scripts/visual/touch-probe.mjs` finally ran clean
// on 2026-08-05 and reported: tapped "dirt" (was "grass") -> selected "grass" — swallowed. The fix followed
// the evidence rather than the argument. That probe, which reads `selectedBlock` from the store after a real
// touch, is the check that keeps this honest; the unit tests cover the predicate, not the wiring.
/** The share of a level's XP earned, as a CSS width: 0 to 100%, whatever the caller hands in. */
export const xpWidth = (xpProgress) => `${Math.max(0, Math.min(100, Number(xpProgress) || 0))}%`;

/** The level and the 4 px XP edge along the hotbar's top (the level card and the touch readout, folded in). It sits
 *  above the hotbar's box rather than in it, so the hotbar's slots stay where the touch action buttons were laid out
 *  around them, and it takes no taps. */
const XpEdge = ({ level, xpProgress }) => {
  const t = useT();
  return (
    <div data-testid="hotbar-xp-row" className="absolute left-0 right-0 bottom-full mb-1 flex items-center gap-2 px-1 pointer-events-none">
      <span data-testid="hotbar-level" className="font-display text-sm leading-none tabular-nums text-accent-raise"
        style={{ textShadow: '0 1px 2px rgb(var(--ui-ink))' }}>{t('hud.level', { level })}</span>
      <div className="relative flex-1 h-1 rounded-sm bg-track overflow-hidden">
        <div data-testid="hotbar-xp" className="absolute inset-y-0 left-0 bg-accent" style={{ width: xpWidth(xpProgress) }} />
      </div>
    </div>
  );
};

const MinecraftHotbar = React.memo(({ gameState, level, xpProgress, controlsHint }) => {
  if (!gameState) return null;
  // B7 (18-domain review): the 9-slot hotbar (9 × w-[62px] + gaps + padding ≈ 622px) overflowed a phone
  // viewport — ~2 slots ran off each edge, unreachable in a voxel BUILDING game. Scale it down to fit on
  // narrow screens (≤640px) while tablets/desktop keep full size; origin-bottom keeps it anchored + centered.
  return (
    <div data-hud-interactive data-testid="hotbar" className="absolute bottom-4 left-1/2 transform -translate-x-1/2 origin-bottom max-[640px]:scale-[0.56] pointer-events-auto">
      {level != null && <XpEdge level={level} xpProgress={xpProgress} />}
      {controlsHint && <ControlsHint />}
      <Panel variant="base" className="flex gap-2 p-2.5">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <Slot
              key={blockType}
              selected={isSelected}
              className="w-[62px] cursor-pointer"
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
              // stable seam for the input-driven E2E (X3)
              data-hotbar-block={blockType}
            >
              {/* block-color swatch — gameplay data (inline color allowed). Every placement spends one, so an
                  empty slot is dimmed and every count is drawn: a last block and none must not look alike. */}
              <div
                data-hotbar-swatch
                className={`w-9 h-9 rounded-sm border-chrome border-ink${quantity > 0 ? '' : ' opacity-30'}`}
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
              />
              <span className="absolute top-1 left-1.5 text-[11px] font-bold text-text-muted tabular-nums">{index + 1}</span>
              <span
                data-hotbar-count
                className={`absolute bottom-1 right-1.5 text-[13px] font-bold tabular-nums ${quantity > 0 ? 'text-text' : 'text-text-muted'}`}
                style={{ textShadow: '0 1px 2px #000' }}
              >
                {quantity > 999 ? '999+' : quantity}
              </span>
            </Slot>
          );
        })}
      </Panel>
    </div>
  );
});

export const GameUI = ({ gameState, level, xpProgress, controlsHint = false }) => {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-end items-start pointer-events-auto">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" text="text-text-muted" aria-label={t('ui.settings')} data-testid="hud-settings" className="w-[42px] h-[42px]" onClick={() => gameState.setShowSettings(true)}>
            <Icon name="settings" size={20} />
          </Button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} level={level} xpProgress={xpProgress} controlsHint={controlsHint} />
    </motion.div>
  );
};
