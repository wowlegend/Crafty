// S3-M5 (part 1): the HUD chrome — extracted BYTE-EXACT from Components.jsx (the god-file de-monolith).
// MinecraftHotbar (the bottom block hotbar) + GameUI (the HUD overlay: mode/settings + side action
// rail + the hotbar). Both take `gameState` as a prop (no store coupling). GameUI renders MinecraftHotbar
// (intra-module). Extraction-only — NO behavior change.
import React from 'react';
import { useT } from '../i18n/i18n.js';
import { motion } from 'framer-motion';
import { Panel, Slot, Button, Icon } from './primitives/index.js';
import { Package, Hammer, Wand2, Grid } from 'lucide-react';
import { BLOCK_TYPES, HOTBAR_BLOCKS } from '../world/Blocks';
import { isTouchUIMode } from '../input/touchDevice';

// X3: `data-hud-interactive` marks this as a real UI control surface — a SEAM prepared for a fix that has
// NOT landed. The full-screen TOUCH layer (ui/TouchControls.jsx, z-40) sits ABOVE the HUD (z-20); its
// `onStart` routes any touch that is not a `button[data-touch-btn]` into the move/look zones AND calls
// preventDefault(), which suppresses the synthesized click. A hotbar slot is a `<button data-hotbar-block>`,
// NOT `data-touch-btn` — so on a touch device this tap should never reach the onClick below, leaving a
// voxel BUILDING game locked to one block on its own stated iPad target.
//
// ⚠️ THE PREVIOUS VERSION OF THIS COMMENT CLAIMED THE FIX WAS DONE — "the touch router now skips touches
// landing on a [data-hud-interactive] surface". It does not: `grep hud-interactive src/ui/TouchControls.jsx`
// returns nothing. The seam landed; the routing never did. A comment asserting a fix that does not exist is
// worse than no comment, because the next reader stops looking.
//
// STATUS §E-bis X3 keeps this UNCONFIRMED on purpose — the mechanism above is a code READING, and the first
// attempt to verify it never got into the game. `scripts/visual/touch-probe.mjs` now carries the behavioural
// check ("HOTBAR tap selects that block on touch"); it decides this from the store, not from an argument.
const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;
  // B7 (18-domain review): the 9-slot hotbar (9 × w-[62px] + gaps + padding ≈ 622px) overflowed a phone
  // viewport — ~2 slots ran off each edge, unreachable in a voxel BUILDING game. Scale it down to fit on
  // narrow screens (≤640px) while tablets/desktop keep full size; origin-bottom keeps it anchored + centered.
  return (
    <div data-hud-interactive className="absolute bottom-4 left-1/2 transform -translate-x-1/2 origin-bottom max-[640px]:scale-[0.56] pointer-events-auto">
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
              {/* block-color swatch — gameplay data (inline color allowed) */}
              <div
                className="w-9 h-9 rounded-sm border-chrome border-ink"
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
              />
              <span className="absolute top-1 left-1.5 text-[11px] font-bold text-text-muted tabular-nums">{index + 1}</span>
              {quantity > 1 && (
                <span
                  className="absolute bottom-1 right-1.5 text-[13px] font-bold text-text tabular-nums"
                  style={{ textShadow: '0 1px 2px #000' }}
                >
                  {quantity > 999 ? '999+' : quantity}
                </span>
              )}
            </Slot>
          );
        })}
      </Panel>
    </div>
  );
});

export const GameUI = ({ gameState }) => {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <Panel variant="base" className="flex items-center gap-2 px-3 py-2 text-text">
          <span className="text-sm text-text-muted">Mode:</span>
          <span className="text-sm font-bold text-success">{gameState.gameMode}</span>
        </Panel>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" aria-label={t('ui.settings')} data-testid="hud-settings" className="w-[42px] h-[42px] p-0 text-text-muted" onClick={() => gameState.setShowSettings(true)}>
            <Icon name="settings" size={20} />
          </Button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} />
      {/* left action rail — desktop only; on touch these panel-openers move to the M2b/M3 tray
          (kept off the thumb/look zone so the touch baseline stays clean). */}
      {!isTouchUIMode() && (
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <Panel variant="base" className="flex flex-col gap-2 p-2">
          <Button variant="ghost" size="sm" aria-label={t('ui.inventory')} className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowInventory(true)}><Package size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label={t('a11y.crafting')} className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowCrafting(true)}><Hammer size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label={t('ui.magic')} className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowMagic(true)}><Wand2 size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label={t('a11y.buildingTools')} className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowBuildingTools(true)}><Grid size={20} /></Button>
        </Panel>
      </div>
      )}
    </motion.div>
  );
};
