// Derives the runtime CSS-custom-property layer AND the Tailwind theme objects
// from the single source of truth (tokens.js). Colors are emitted as space-
// separated RGB channels so Tailwind's `rgb(var(--x) / <alpha-value>)` opacity
// modifiers work; scalars are emitted ready-to-use. applyThemeVars() writes the
// vars onto :root at boot, which also makes mood-reactive tints (S1-D) a matter
// of imperative setProperty('--ui-...') writes — never React state in the frame loop.
import { UI } from './tokens.js';

/** '#0B0E14' -> '11 14 20' (space-separated channels for `rgb(var() / a)`). */
export function hexToRgbChannels(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const C = UI.color;
const COLOR_VARS = {
  '--ui-ink': C.ink,
  '--ui-panel': C.panel,
  '--ui-panel-raise': C.panelRaise,
  '--ui-panel-frame': C.panelFrame,
  '--ui-panel-inset': C.panelInset,
  '--ui-well': C.well,
  '--ui-slot': C.slot,
  '--ui-control': C.control,
  '--ui-track': C.track,
  '--ui-text': C.text,
  '--ui-text-muted': C.textMuted,
  '--ui-text-inverse': C.textInverse,
  '--ui-accent': C.accent,
  '--ui-accent-raise': C.accentRaise,
  '--ui-accent-deep': C.accentDeep,
  '--ui-danger': C.danger,
  '--ui-success': C.success,
  '--ui-warn': C.warn,
  '--ui-info': C.info,
  '--ui-ferocity': C.ferocity,
  '--ui-kinetic': C.kinetic,
  '--ui-soul': C.soul,
  '--ui-rarity-common': C.rarity.common,
  '--ui-rarity-rare': C.rarity.rare,
  '--ui-rarity-epic': C.rarity.epic,
  '--ui-rarity-legendary': C.rarity.legendary,
  '--ui-spell-fire': C.spell.fire,
  '--ui-spell-ice': C.spell.ice,
  '--ui-spell-lightning': C.spell.lightning,
  '--ui-spell-arcane': C.spell.arcane,
  '--ui-spell-nature': C.spell.nature,
  '--ui-stat-atk': C.statIcon.atk,
  '--ui-stat-def': C.statIcon.def,
  '--ui-stat-spd': C.statIcon.spd,
  '--ui-stat-crit': C.statIcon.crit,
};

const SCALAR_VARS = {
  '--ui-radius-sm': `${UI.radius.sm}px`,
  '--ui-radius-md': `${UI.radius.md}px`,
  '--ui-radius-lg': `${UI.radius.lg}px`,
  '--ui-border-chrome': `${UI.border.chrome}px`,
  '--ui-elev-sm': UI.elevation.sm,
  '--ui-elev-md': UI.elevation.md,
  '--ui-elev-lg': UI.elevation.lg,
  '--ui-elev-xl': UI.elevation.xl,
};

/** The full map applied to :root. Colors as channels, scalars as values. */
export const CSS_VAR_MAP = {
  ...Object.fromEntries(Object.entries(COLOR_VARS).map(([k, v]) => [k, hexToRgbChannels(v)])),
  ...SCALAR_VARS,
};

/** Write every CSS_VAR_MAP entry onto a root (document.documentElement at boot). */
export function applyThemeVars(root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  if (!root || !root.style) return;
  for (const [k, v] of Object.entries(CSS_VAR_MAP)) root.style.setProperty(k, v);
}

const tw = (name) => `rgb(var(${name}) / <alpha-value>)`;
export const TW_COLORS = {
  ink: tw('--ui-ink'),
  panel: tw('--ui-panel'),
  'panel-raise': tw('--ui-panel-raise'),
  'panel-frame': tw('--ui-panel-frame'),
  'panel-inset': tw('--ui-panel-inset'),
  well: tw('--ui-well'),
  slot: tw('--ui-slot'),
  control: tw('--ui-control'),
  track: tw('--ui-track'),
  text: tw('--ui-text'),
  'text-muted': tw('--ui-text-muted'),
  'text-inverse': tw('--ui-text-inverse'),
  accent: tw('--ui-accent'),
  'accent-raise': tw('--ui-accent-raise'),
  'accent-deep': tw('--ui-accent-deep'),
  danger: tw('--ui-danger'),
  success: tw('--ui-success'),
  warn: tw('--ui-warn'),
  info: tw('--ui-info'),
  rarity: {
    common: tw('--ui-rarity-common'),
    rare: tw('--ui-rarity-rare'),
    epic: tw('--ui-rarity-epic'),
    legendary: tw('--ui-rarity-legendary'),
  },
  spell: {
    fire: tw('--ui-spell-fire'),
    ice: tw('--ui-spell-ice'),
    lightning: tw('--ui-spell-lightning'),
    arcane: tw('--ui-spell-arcane'),
    nature: tw('--ui-spell-nature'),
  },
  stat: {
    atk: tw('--ui-stat-atk'),
    def: tw('--ui-stat-def'),
    spd: tw('--ui-stat-spd'),
    crit: tw('--ui-stat-crit'),
  },
};

export const TW_SCALES = {
  borderRadius: { sm: `${UI.radius.sm}px`, md: `${UI.radius.md}px`, lg: `${UI.radius.lg}px` },
  borderWidth: { chrome: `${UI.border.chrome}px` },
  fontFamily: {
    display: UI.type.family.display.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
    body: UI.type.family.body.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
    'display-cjk': UI.type.family.displayCjk.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
    'body-cjk': UI.type.family.bodyCjk.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
  },
  fontSize: Object.fromEntries(
    Object.entries(UI.type.size).map(([k, v]) => {
      const lh = (k === 'xl' || k === 'xxl' || k === 'display') ? UI.type.leading.tight : UI.type.leading.snug;
      return [k, [`${v}px`, { lineHeight: String(lh) }]];
    }),
  ),
  boxShadow: { 'elev-sm': UI.elevation.sm, 'elev-md': UI.elevation.md, 'elev-lg': UI.elevation.lg, 'elev-xl': UI.elevation.xl },
  zIndex: Object.fromEntries(Object.entries(UI.z).map(([k, v]) => [k.replace(/([A-Z])/g, '-$1').toLowerCase(), String(v)])),
};
