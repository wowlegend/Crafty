/** @type {import('tailwindcss').Config} */
// Theme wired from src/theme/tokens.js via the --ui-* CSS vars that
// src/theme/cssVars.js writes to :root at boot. Colors use rgb(var() / <alpha>)
// so opacity modifiers work; scalars mirror TW_SCALES. SoT parity is enforced by
// tests/theme/tailwind-wiring.test.js (config refs ⇔ CSS_VAR_MAP) — DO NOT add a
// --ui-* name here without adding it to cssVars.js (the test will fail).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  // PrimitivesShowcase builds spell color classes via `text-spell-${s}` interpolation,
  // which the JIT scanner can't see (it reads raw source text, not runtime values).
  // Safelist the full set so the utilities are always emitted.
  safelist: [
    'text-spell-fire',
    'text-spell-ice',
    'text-spell-lightning',
    'text-spell-arcane',
    'text-spell-nature',
  ],
  theme: {
    extend: {
      colors: {
        ink: c('--ui-ink'),
        panel: c('--ui-panel'),
        'panel-raise': c('--ui-panel-raise'),
        'panel-frame': c('--ui-panel-frame'),
        'panel-inset': c('--ui-panel-inset'),
        well: c('--ui-well'),
        slot: c('--ui-slot'),
        control: c('--ui-control'),
        track: c('--ui-track'),
        text: c('--ui-text'),
        'text-muted': c('--ui-text-muted'),
        'text-inverse': c('--ui-text-inverse'),
        accent: c('--ui-accent'),
        'accent-raise': c('--ui-accent-raise'),
        'accent-deep': c('--ui-accent-deep'),
        danger: c('--ui-danger'),
        success: c('--ui-success'),
        warn: c('--ui-warn'),
        info: c('--ui-info'),
        ferocity: c('--ui-ferocity'),
        rarity: {
          common: c('--ui-rarity-common'),
          rare: c('--ui-rarity-rare'),
          epic: c('--ui-rarity-epic'),
          legendary: c('--ui-rarity-legendary'),
        },
        spell: {
          fire: c('--ui-spell-fire'),
          ice: c('--ui-spell-ice'),
          lightning: c('--ui-spell-lightning'),
          arcane: c('--ui-spell-arcane'),
          nature: c('--ui-spell-nature'),
        },
        stat: {
          atk: c('--ui-stat-atk'),
          def: c('--ui-stat-def'),
          spd: c('--ui-stat-spd'),
          crit: c('--ui-stat-crit'),
        },
      },
      borderRadius: { sm: 'var(--ui-radius-sm)', md: 'var(--ui-radius-md)', lg: 'var(--ui-radius-lg)' },
      borderWidth: { chrome: 'var(--ui-border-chrome)' },
      fontFamily: {
        display: ['Lilita One', 'system-ui', 'sans-serif'],
        body: ['Space Grotesk', 'system-ui', 'sans-serif'],
        'display-cjk': ['Smiley Sans', '得意黑', 'Lilita One', 'sans-serif'],
        'body-cjk': ['Alibaba PuHuiTi 3.0', '阿里巴巴普惠体', 'Space Grotesk', 'sans-serif'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.2' }],
        sm: ['14px', { lineHeight: '1.2' }],
        base: ['16px', { lineHeight: '1.2' }],
        md: ['18px', { lineHeight: '1.2' }],
        lg: ['22px', { lineHeight: '1.2' }],
        xl: ['28px', { lineHeight: '1.05' }],
        xxl: ['36px', { lineHeight: '1.05' }],
        display: ['48px', { lineHeight: '1.05' }],
      },
      boxShadow: {
        'elev-sm': 'var(--ui-elev-sm)',
        'elev-md': 'var(--ui-elev-md)',
        'elev-lg': 'var(--ui-elev-lg)',
        'elev-xl': 'var(--ui-elev-xl)',
      },
      zIndex: { 'scene': '1', 'hud': '100', 'panel': '200', 'modal': '300', 'toast': '400', 'tooltip': '500', 'dev-overlay': '9000' },
    },
  },
  plugins: [],
};
