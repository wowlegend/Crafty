// keyMap.js — the binding SINGLE SOURCE OF TRUTH (UX-legibility interleave, 2026-06-13).
// CombatInstructions + the keyMap.test anti-drift gate both consume this, so the HUD can never
// again advertise a key with no handler (the "M - Magic" lie that prompted this pass).
//   • `code` rows are keydown-handled — the anti-drift gate asserts each appears LIVE in a handler.
//   • Move / mouse / wheel rows are informational (no `code`).
//   • the four signature Aspect verbs carry `verb` (a live INTENT_KEYS intent) + `talent` (its unlock).
// EN-first; route `label` through t() for the zh-CN toggle later (#73).
export const KEY_MAP = [
  // --- Move (continuous intents, Components keydown) ---
  { key: 'WASD',  label: 'Move',                    group: 'Move' },
  { key: 'Space', label: 'Jump',                    group: 'Move' },
  { key: 'Shift', label: 'Dodge-roll',              group: 'Move' },
  // --- Combat ---
  { key: 'LMB',   label: 'Attack / mine',           group: 'Combat' },
  { key: 'RMB',   label: 'Cast / place / interact',  group: 'Combat' },
  { key: 'F',     code: 'KeyF', label: 'Attack / cast spell', group: 'Combat' },
  { key: '1–4',   label: 'Select spell',            group: 'Combat' },
  { key: 'Wheel', label: 'Cycle block',             group: 'Combat' },
  // --- Aspects (the signature identity — R/V/X/Z) ---
  { key: 'R', code: 'KeyR', verb: 'roar',  talent: 'wildheart_roar',  label: 'WILDHEART — roar / beast form',     group: 'Aspects' },
  { key: 'V', code: 'KeyV', verb: 'grab',  talent: 'voidhand_grasp',  label: 'VOIDHAND — grab, then hurl / slam', group: 'Aspects' },
  { key: 'X', code: 'KeyX', verb: 'snare', talent: 'soulbind_snare',  label: 'SOULBIND — snare, then fuse',       group: 'Aspects' },
  { key: 'Z', code: 'KeyZ', verb: 'imbue', talent: 'elemancer_imbue', label: 'ELEMANCER — imbue the next cast',   group: 'Aspects' },
  // --- Panels ---
  { key: 'E',   code: 'KeyE',   label: 'Inventory',              group: 'Panels' },
  { key: 'M',   code: 'KeyM',   label: 'Magic',                  group: 'Panels' },
  { key: 'C',   code: 'KeyC',   label: 'Crafting',               group: 'Panels' },
  { key: 'B',   code: 'KeyB',   label: 'Building',               group: 'Panels' },
  { key: 'U',   code: 'KeyU',   label: 'Talents & Aspect guide', group: 'Panels' },
  { key: 'G',   code: 'KeyG',   label: 'Open chest / trade',     group: 'Panels' },
  { key: 'T',   code: 'KeyT',   label: 'Tame',                   group: 'Panels' },
  { key: 'Tab', code: 'Tab',    label: 'Achievements',           group: 'Panels' },
  { key: 'ESC', code: 'Escape', label: 'Settings / pause',       group: 'Panels' },
];

// Display order of the groups in the controls panel.
export const KEY_GROUPS = ['Move', 'Combat', 'Aspects', 'Panels'];
