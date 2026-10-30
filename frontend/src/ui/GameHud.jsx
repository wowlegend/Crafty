// The HUD chrome: MinecraftHotbar (the bottom block hotbar, with the level and a 4 px XP edge along its top) and GameUI
// (the HUD overlay: settings and the hotbar). Both take their values as props, with no store coupling. No panel buttons
// sit at rest: on desktop the panels open by their keys (game/keyMap.js), on touch from the tray (ui/touchTray.js).
import React from 'react';
import { useT } from '../i18n/i18n.js';
import { motion } from 'framer-motion';
import { Slot, Button, Icon } from './primitives/index.js';
import { isTouchUIMode } from '../input/touchDevice';
import { BLOCK_TYPES, HOTBAR_BLOCKS } from '../world/Blocks';
import { ControlsHint } from './CombatInstructions.jsx';
import { useHudMode } from './hudLayout.js';

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

const MinecraftHotbar = React.memo(({ gameState, level, xpProgress }) => {
  const mode = useHudMode();
  const compact = mode.compactHotbar;
  if (!gameState) return null;
  // The hotbar is the largest piece of chrome at rest, so it is nine slots and nothing behind them: no panel, 40 px
  // slots on a keyboard (9 x 40 + 8 gaps of 6 = 408 px), 48 px on touch, where each slot is a tap target. The lookbook's
  // footprint holds the eye-level frames at rest under 8% with it (DECISIONS 2026-10-29 item 99). B7 (18-domain
  // review): a full hotbar overflowed a phone; on narrow screens (≤640px) it scales to fit, keeping a phone's slot about
  // 35 px; origin-bottom keeps it anchored and centred. A short touch screen narrower than the full bar's room between the
  // joystick and the cast button (a phone on its side) scales it the same way (ui/hudLayout.js compactHotbar). On a phone
  // it sits 8 px from the bottom, where its XP edge clears the cast button (9% up, so 60 px on a 664 px screen).
  const touch = isTouchUIMode();
  return (
    <div data-hud-interactive data-testid="hotbar" className={`absolute ${mode.phone ? 'bottom-2' : 'bottom-4'} left-1/2 transform -translate-x-1/2 origin-bottom ${compact ? 'scale-[0.72]' : 'max-[640px]:scale-[0.72]'} pointer-events-auto`}>
      {level != null && <XpEdge level={level} xpProgress={xpProgress} />}
      <ControlsHint />
      <div className="flex gap-1.5">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <Slot
              key={blockType}
              selected={isSelected}
              className={`${touch ? 'w-12' : 'w-10'} cursor-pointer`}
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
              // stable seam for the input-driven E2E (X3)
              data-hotbar-block={blockType}
            >
              {/* block-color swatch — gameplay data (inline color allowed). Every placement spends one, so an
                  empty slot is dimmed and every count is drawn: a last block and none must not look alike. */}
              <div
                data-hotbar-swatch
                className={`${touch ? 'w-7 h-7' : 'w-6 h-6'} rounded-sm border-chrome border-ink${quantity > 0 ? '' : ' opacity-30'}`}
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
              />
              <span className="absolute top-0.5 left-1 text-[10px] font-bold text-text-muted tabular-nums">{index + 1}</span>
              <span
                data-hotbar-count
                className={`absolute bottom-0.5 right-1 text-[12px] font-bold tabular-nums ${quantity > 0 ? 'text-text' : 'text-text-muted'}`}
                style={{ textShadow: '0 1px 2px #000' }}
              >
                {quantity > 999 ? '999+' : quantity}
              </span>
            </Slot>
          );
        })}
      </div>
    </div>
  );
});

export const GameUI = ({ gameState, level, xpProgress }) => {
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
      <MinecraftHotbar gameState={gameState} level={level} xpProgress={xpProgress} />
    </motion.div>
  );
};
