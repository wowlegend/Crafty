// keyMap.js — the binding SINGLE SOURCE OF TRUTH (UX-legibility interleave, 2026-06-13).
// CombatInstructions + the keyMap.test anti-drift gate both consume this, so the HUD can never
// again advertise a key with no handler (the "M - Magic" lie that prompted this pass).
//
// 2026-08-05 — THE OTHER DIRECTION WAS NEVER GUARDED, and two real bindings had fallen through it:
// L (quest log, M-NARRATIVE.3) and Q (claim completed quests) were handled live in InputManager and
// advertised NOWHERE in here, so the controls panel never taught either. Q was on the title screen only;
// L was invisible entirely, sitting right beside the E/M/C/B/U toggles that ARE listed. An advertised key
// with no handler is a lie; a handler with no advertisement is a feature the player never finds. The
// keyMap gate now asserts BOTH directions.
//   • `code` rows are keydown-handled — the anti-drift gate asserts each appears LIVE in a handler.
//   • Move / mouse / wheel rows are informational (no `code`).
//   • the four signature Aspect verbs carry `verb` (a live INTENT_KEYS intent) + `talent` (its unlock).
// `labelKey` is what the controls panel shows, through t(); `label` is the English the gates and the source read.
export const KEY_MAP = [
  // --- Move (continuous intents, Components keydown) ---
  { key: 'WASD',  label: 'Move',                    labelKey: 'controls.move',   group: 'Move' },
  { key: 'Space', label: 'Jump',                    labelKey: 'controls.jump',   group: 'Move' },
  { key: 'Shift', label: 'Dodge-roll (at a lunge: perfect)', labelKey: 'controls.dodge', group: 'Move' },
  // --- Combat ---
  { key: 'LMB',   label: 'Attack (hold: heavy) / mine', labelKey: 'controls.attack', group: 'Combat' },
  { key: 'RMB',   label: 'Cast / place / interact',  labelKey: 'controls.use',    group: 'Combat' },
  { key: 'F',     code: 'KeyF', label: 'Cast spell', labelKey: 'controls.cast',   group: 'Combat' },
  { key: 'T',     code: 'KeyT', label: 'Melee (hold: heavy)', labelKey: 'controls.melee', group: 'Combat' },
  { key: '1–4',   label: 'Select spell',            labelKey: 'controls.spell',  group: 'Combat' },
  { key: 'Wheel', label: 'Cycle block',             labelKey: 'controls.wheel',  group: 'Combat', panelHide: true },
  // --- Aspects (the signature identity — R/V/X/Z) ---
  { key: 'R', code: 'KeyR', verb: 'roar',  talent: 'wildheart_roar',  label: 'WILDHEART — roar',        labelKey: 'controls.roar',  group: 'Aspects' },
  { key: 'V', code: 'KeyV', verb: 'grab',  talent: 'voidhand_grasp',  label: 'VOIDHAND — grab & hurl',  labelKey: 'controls.grab',  group: 'Aspects' },
  { key: 'X', code: 'KeyX', verb: 'snare', talent: 'soulbind_snare',  label: 'SOULBIND — snare & fuse', labelKey: 'controls.snare', group: 'Aspects' },
  { key: 'Z', code: 'KeyZ', verb: 'imbue', talent: 'elemancer_imbue', label: 'ELEMANCER — imbue cast',  labelKey: 'controls.imbue', group: 'Aspects' },
  // --- Panels: three where there were seven (the HUD lane, DECISIONS 2026-10-29 item 96) ---
  { key: 'Tab', code: 'Tab',    label: 'Character: gear, spells, talents', labelKey: 'controls.character', group: 'Panels' },
  { key: 'J',   code: 'KeyJ',   label: 'Journal: quests, achievements',           labelKey: 'controls.journal',   group: 'Panels' },
  { key: 'B',   code: 'KeyB',   label: 'Build',                            labelKey: 'controls.build',     group: 'Panels' },
  { key: 'G',   code: 'KeyG',   label: 'Talk (Mara: the Forge) / open chest', labelKey: 'controls.talk',   group: 'Panels' },
  { key: 'H',   code: 'KeyH',   label: 'Controls',                         labelKey: 'controls.controls',  group: 'Panels' },
  { key: 'F3',  code: 'F3',     label: 'Show stats',                       labelKey: 'controls.stats',     group: 'Panels', panelHide: true },
  { key: 'ESC', code: 'Escape', label: 'Settings / pause',                 labelKey: 'controls.pause',     group: 'Panels' },
];

// Display order of the groups in the controls panel.
export const KEY_GROUPS = ['Move', 'Combat', 'Aspects', 'Panels'];
/** Each group's heading key, for the controls panel. */
export const KEY_GROUP_LABEL_KEYS = { Move: 'controls.group.move', Combat: 'controls.group.combat', Aspects: 'controls.group.aspects', Panels: 'controls.group.panels' };
