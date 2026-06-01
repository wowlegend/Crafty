// SINGLE SOURCE OF TRUTH for Crafty's visual palette (spec §4).
// Three palette STATES share identical keys so the day/night + danger
// system can lerp between them without ever hitting `undefined`.

export const PALETTE_KEYS = [
  'skyTop', 'skyMid', 'skyHorizon', 'sun', 'fog',
  'grass', 'rock', 'rockShadow', 'waterShallow', 'waterDeep',
  'leaf', 'leafHi', 'trunk', 'heroCloth', 'heroAccent', 'mobBody', 'mobShadow',
];

export const DANGER_STATES = ['dusk', 'obsidian'];

export const PALETTE = {
  // Explore (day) — bright Caribbean/Mediterranean noon (invigorating, high-luminance, clear)
  explore: {
    skyTop: '#1A5AD0', skyMid: '#2E8AE0', skyHorizon: '#CDEAF5', sun: '#FFFBF2', fog: '#CFEAF2',
    grass: '#7FB85E', rock: '#C2A06A', rockShadow: '#8A6B41', waterShallow: '#8FD3D8', waterDeep: '#3E86A6',
    leaf: '#4F9E63', leafHi: '#74C07E', trunk: '#6E4A30', heroCloth: '#E8C07A', heroAccent: '#2F6FAE',
    mobBody: '#58C6A2', mobShadow: '#2E8E74',
  },
  // Danger T1 — dusk-shift (night/combat, everyday)
  dusk: {
    skyTop: '#161B3A', skyMid: '#2E4A6E', skyHorizon: '#C25A3A', sun: '#FF8A4C', fog: '#3A2E40',
    grass: '#3E6E54', rock: '#7A5E3E', rockShadow: '#4A381F', waterShallow: '#2E6E7C', waterDeep: '#103040',
    leaf: '#2E5A44', leafHi: '#437A5C', trunk: '#3A2A1E', heroCloth: '#C9A86A', heroAccent: '#2F4F7E',
    mobBody: '#3E6E66', mobShadow: '#1C3A38',
  },
  // Danger T2 — full Obsidian (boss only)
  obsidian: {
    skyTop: '#0A0C14', skyMid: '#14182B', skyHorizon: '#2A1622', sun: '#FF6B5E', fog: '#241026',
    grass: '#2A2438', rock: '#262030', rockShadow: '#110C16', waterShallow: '#221034', waterDeep: '#08040E',
    leaf: '#2A1A33', leafHi: '#3E2A48', trunk: '#1A141E', heroCloth: '#2E2A3C', heroAccent: '#0C0A12',
    mobBody: '#2E2238', mobShadow: '#160E1C',
  },
};

// Emissive magic palette — the ONLY intended bloom sources (spec §3, §4)
export const MAGIC = {
  fire: '#FF7A3C', ice: '#6FC8FF', lightning: '#FFE066',
  arcane: '#B36BFF', nature: '#7FE0A0', default: '#46E0FF',
};

// ── UI design-system tokens (S1-C "bold-flat", locked 2026-06-01 §9). ──────────
// SoT for chrome. Derived into CSS vars + Tailwind by src/theme/cssVars.js.
// Bold-flat = SOLID saturated fills · uniform 4px near-black ink on every chrome
// element · hard blur-0 offset shadows · radius <=14 · NO glass/blur/gradient-chrome.
export const UI = {
  color: {
    ink: '#0B0E14',                 // the uniform chrome outline + text-on-light
    panel:      '#161C2C',          // primary panel fill (SOLID, no translucency)
    panelRaise: '#202A44',          // raised / active panel
    panelInset: '#0E1320',          // inset well (slot field, track grooves)
    slot:       '#0E1320',          // empty inventory/hotbar slot fill
    text:       '#F4F1E8',          // primary (warm off-white)
    textMuted:  '#9AA0AD',
    textInverse:'#0B0E14',          // on gold/light fills
    accent:      '#C9A86A',         // brand warm gold — hairline + CTA
    accentRaise: '#DCC089',
    danger:  '#FF4D6E',
    success: '#5BC98C',
    warn:    '#F2B33D',
    info:    '#5AA9FF',
    rarity: {
      common:    '#9AA4B2',
      rare:      '#4FA3FF',
      epic:      '#B36BFF',
      legendary: '#FFC23D',          // HOT gold, distinct from the trim accent
    },
    spell: {
      fire:      '#FF7A3C',          // fire-warm dominant
      ice:       '#6FC8FF',
      lightning: '#FFE066',
      arcane:    '#B36BFF',          // demoted to one element (no purple-as-chrome)
      nature:    '#7FE0A0',
    },
    gray: {
      g950: '#0B0E14', g900: '#11151F', g800: '#1A2030', g700: '#283149',
      g500: '#5C6478', g300: '#9AA0AD', g100: '#D7DAE0', g50: '#F4F1E8',
    },
  },
  radius: { sm: 6, md: 10, lg: 14 },          // <=14 cap (§9)
  border: { chrome: 4, hairline: 1.5 },       // 4px ink everywhere; gold hairline accent
  space:  { xs: 4, sm: 8, md: 14, lg: 22, xl: 36 },
  // hard offset shadows (blur 0, spread 0) — the bold-flat signature. The md value
  // is the locked `5px 5px 0 0 #0b0e14` recolored to the ink var.
  elevation: {
    sm: '3px 3px 0 0 rgb(var(--ui-ink))',
    md: '5px 5px 0 0 rgb(var(--ui-ink))',
    lg: '8px 8px 0 0 rgb(var(--ui-ink))',
  },
  type: {
    family: {
      display:    "'Lilita One', system-ui, sans-serif",
      body:       "'Space Grotesk', system-ui, sans-serif",
      displayCjk: "'Smiley Sans', '得意黑', 'Lilita One', sans-serif",
      bodyCjk:    "'Alibaba PuHuiTi 3.0', '阿里巴巴普惠体', 'Space Grotesk', sans-serif",
    },
    size:   { xs: 12, sm: 14, base: 16, md: 18, lg: 22, xl: 28, xxl: 36, display: 48 },
    weight: { regular: 400, medium: 500, bold: 700, black: 900 },
    leading:{ tight: 1.05, snug: 1.2, normal: 1.4 },
  },
  z: { scene: 1, hud: 100, panel: 200, modal: 300, toast: 400, tooltip: 500, devOverlay: 9000 },
  motion: {
    duration: { fast: 120, base: 200, slow: 320 },
    easing: {
      standard:   'cubic-bezier(0.2, 0, 0, 1)',
      emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
      exit:       'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
};
