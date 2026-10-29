import { UI } from './theme/tokens.js';

// The page head and noscript, the web manifest, the README lead and the GitHub About line are rendered
// from this module by scripts/ci/public-face.mjs, and doc-currency fails when any of them drifts from it.
export const BRAND = Object.freeze({
  name: 'Crafty',
  title: 'Crafty: a voxel action-RPG in your browser',
  pitch:
    'A voxel action-RPG that runs in the browser, on desktop and iPad. Four Aspects, one frontier, ' +
    'and a dragon waiting at its far edge.',
  url: 'https://crafty-game.vercel.app/',
  ground: UI.color.panelInset,
  accent: UI.color.accent,
  accentDeep: UI.color.accentDeep,
  ink: UI.color.text,
  inkMuted: UI.color.textMuted,
  // Describes public/og-image.png; it changes whenever that card is re-shot.
  ogImageAlt: 'The Crafty wordmark over a golden-hour view from the player\'s eye at the Hearth: gauntleted hands, the outpost\'s watchtower and a warm sky over the forest and hills.',
});

// `glyphRadius` is the radius, as a share of the icon size, of the circle that holds the corners of the
// glyph's ink box. A maskable icon must stay inside the safe zone, a centred circle of radius 0.4, because
// a launcher may mask away anything outside it (W3C Web Application Manifest, section 2.3).
export const MASKABLE_SAFE_RADIUS = 0.4;
export const ICONS = Object.freeze([
  Object.freeze({ file: 'apple-touch-icon.png', size: 180, purpose: 'apple', glyphRadius: 0.42 }),
  Object.freeze({ file: 'icon-192.png', size: 192, purpose: 'any', glyphRadius: 0.42 }),
  Object.freeze({ file: 'icon-512.png', size: 512, purpose: 'any', glyphRadius: 0.42 }),
  Object.freeze({ file: 'icon-maskable-512.png', size: 512, purpose: 'maskable', glyphRadius: 0.36 }),
]);
