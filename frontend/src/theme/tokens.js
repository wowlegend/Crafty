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

// UI design-system tokens (consumed by S1-C). Derived from the game palette.
export const UI = {
  surface: 'rgba(20, 26, 38, 0.62)',
  surfaceBorder: 'rgba(255, 255, 255, 0.14)',
  ink: '#ECECEF',
  inkMuted: '#9AA0AD',
  accent: '#C9A86A',
  accentCool: MAGIC.default,
  danger: '#FF4D6E',
  radius: { sm: 8, md: 14, lg: 20 },
  space: { xs: 4, sm: 8, md: 14, lg: 22, xl: 36 },
};
