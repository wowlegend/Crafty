# Crafty S1-C-M1 — UI Token Foundation, Design Language & Component Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All subagents: Opus 4.8. Sequential only (never parallel — many tasks edit `tokens.js`/`tailwind.config.cjs`/`index.jsx`). NEVER add a Claude footer / Co-Authored-By to commits. Fix-ups = NEW commits (never `git commit --amend`/`reset`). AST-safe edits for source `.js/.jsx` (no `sed` on code).**

**Goal:** Build the locked **bold-flat** UI design system as a wired, tested token foundation (`tokens.js`→Tailwind+CSS-vars), an i18n layer (English-default + lazy zh-CN), self-hosted fonts, and seven component primitives (Panel/Button/Slot/StatBar/Icon/Toast/Tooltip + LocaleToggle), proven by a two-locale primitives-showcase visual-regression state — **without touching the 3D scene** (the 6 existing baselines stay green).

**Architecture:** `src/theme/tokens.js` is the single source of truth (SoT). `src/theme/cssVars.js` derives (a) a `--ui-*` CSS-custom-property map applied to `:root` at boot via `applyThemeVars()`, and (b) a Tailwind color/scale object. `tailwind.config.cjs` references the `--ui-*` vars by **name** as literal `rgb(var(--ui-x) / <alpha-value>)` strings (no ESM import → no postcss-discovery risk); a **parity unit test** imports `tokens.js`+`cssVars.js` (ESM, in vitest) and asserts the `.cjs` config references exactly the tokens that exist — making SoT drift a CI failure. Mood-reactive tints (S1-D) become free imperative `setProperty('--ui-...')` writes. Primitives are `.jsx` (the `@vitejs/plugin-react` transform only covers `.js/.jsx`), styled via Tailwind utility classes that resolve to the vars, variant logic via `class-variance-authority` + a `cn()` (`clsx`+`tailwind-merge`) helper. i18n is a tiny store-backed `t(key)` + `useT()`; CJK fonts inject lazily on the zh-CN toggle so English users download zero CJK bytes. The showcase is a DEV-only full-screen gallery driven by the existing `__craftyTest` bridge + a new store flag, captured by `scripts/visual/capture.mjs` in both locales.

**Tech Stack:** React 19, Vite 6, Tailwind 3.2.7 (PostCSS `postcss.config.cjs`, autoprefixer), framer-motion 12, lucide-react 0.439, zustand 5, vitest 3 (+ jsdom + @testing-library/react@16 for component tests via per-file `// @vitest-environment jsdom`), class-variance-authority + clsx + tailwind-merge (to install), puppeteer+pixelmatch visual gate.

---

## Pre-flight facts (verified 2026-06-01 — do not re-litigate)

- **Tailwind config stays `tailwind.config.cjs`.** `postcss.config.cjs` references `tailwindcss: {}` which auto-discovers the config; renaming risks breaking discovery. v3 *does* support ESM/TS config (verified, Tailwind v3 docs) but we deliberately don't use it — the parity test gives SoT enforcement without the risk.
- **CSS-var color pattern (verified, Tailwind v3 docs):** color tokens are emitted as **space-separated RGB channels** (`--ui-ink: 11 14 20;`) and referenced in Tailwind as `rgb(var(--ui-ink) / <alpha-value>)` so opacity modifiers work. Scalar tokens (radius/space/z/text/shadow) are emitted as ready-to-use values (`--ui-radius-md: 10px;`).
- **No `public/` dir exists** — Task 7 creates `public/fonts/`. Vite serves `public/` at web root (`/fonts/x.woff2`).
- **The 6 existing visual baselines must stay byte-stable.** M1 is **additive**: it adds tokens/vars/fonts/primitives but does **not** change the global `body` font, does **not** restyle any existing component, and renders the showcase ONLY behind a DEV+capture flag. `theme.extend` only ADDS Tailwind classes. After the build, `npm run test:visual` must show the original 6 states at ~0.00% (and the 2 new showcase states pass against fresh baselines).
- **Component tests** use jsdom via a per-file docblock `// @vitest-environment jsdom` (global env stays `node`; `vitest.config.js` is untouched). `@testing-library/react@^16` peer-supports React 19 (verified `peerDependencies.react = ^18 || ^19`).
- **Primitives are `.jsx`** (JSX transform is `.js/.jsx` only). `cn.js`/`cva` configs can be `.js`.
- **lucide-react** exports named PascalCase icon components (e.g. `Heart`, `Settings`, `X`). The Icon primitive maps a `name` string → the lucide component. Game-semantic icons (game-icons.net) + emoji-decouple are **M3**, not here.
- **`tokens.test.js` only tests `PALETTE`/`MAGIC`/`DANGER_STATES`** — restructuring/extending the `UI` export breaks nothing existing (UI is consumed by zero files today).

## File structure (created/modified by this plan)

```
frontend/
  package.json                         MOD  (+clsx +tailwind-merge +class-variance-authority +jsdom +@testing-library/react +@testing-library/jest-dom)
  tailwind.config.cjs                  MOD  (theme.extend ← var refs + static scales)
  public/fonts/                        NEW  (self-hosted woff2: Lilita One, Space Grotesk [eager]; Smiley Sans, PuHuiTi [lazy])
  src/theme/tokens.js                  MOD  (extend UI: semantic color/rarity/spell/grayscale + type + elevation + radius + z + motion + fonts)
  src/theme/cssVars.js                 NEW  (hexToRgbChannels, CSS_VAR_MAP, applyThemeVars, TW_COLORS, TW_SCALES)
  src/theme/fonts.css                  NEW  (@font-face for the 2 eager Latin faces)
  src/i18n/strings.js                  NEW  (en + zh-CN string tables)
  src/i18n/i18n.js                     NEW  (t(key,vars), useT())
  src/i18n/cjkFonts.js                 NEW  (loadCjkFonts() — idempotent lazy CJK injection)
  src/ui/primitives/cn.js              NEW  (clsx + tailwind-merge)
  src/ui/primitives/Panel.jsx          NEW
  src/ui/primitives/Button.jsx         NEW
  src/ui/primitives/Slot.jsx           NEW
  src/ui/primitives/StatBar.jsx        NEW
  src/ui/primitives/Icon.jsx           NEW
  src/ui/primitives/Toast.jsx          NEW
  src/ui/primitives/Tooltip.jsx        NEW
  src/ui/primitives/index.js           NEW  (barrel)
  src/ui/LocaleToggle.jsx              NEW
  src/ui/PrimitivesShowcase.jsx        NEW  (DEV-only gallery)
  src/store/useGameStore.jsx           MOD  (+locale/+setLocale, +showcaseView/+setShowcaseView)
  src/index.jsx                        MOD  (applyThemeVars at boot + import fonts.css)
  src/App.jsx                          MOD  (DEV showcase overlay + showPrimitivesShowcase test hook)
  scripts/visual/capture.mjs           MOD  (+2 showcase screenshots, fonts.ready wait)
  tests/visual/diff.test.js            MOD  (STATES += primitives-showcase-en/zh)
  tests/visual/baseline/primitives-showcase-en.png   NEW (generated, Kevin-reviewed)
  tests/visual/baseline/primitives-showcase-zh.png   NEW (generated, Kevin-reviewed)
  tests/theme/tokens.test.js           MOD  (assert new UI structure)
  tests/theme/cssVars.test.js          NEW  (applyThemeVars + hexToRgbChannels + TW parity-with-map)
  tests/theme/tailwind-wiring.test.js  NEW  (SoT parity: config refs ⇔ tokens)
  tests/i18n/i18n.test.js              NEW  (t fallback/interp; cjkFonts idempotency)
  tests/ui/primitives.test.jsx         NEW  (jsdom render tests for all primitives + LocaleToggle)
  tests/gates/static-gates.test.js     MOD  (+gate: src/ui/primitives consume tokens, no raw hex)
```

---

### Task 1: Branch + dev dependencies

**Files:**
- Modify: `frontend/package.json` (devDependencies, via `npm i -D`)

- [ ] **Step 1: Create the feature branch (from repo root `/Users/kz/Code/Crafty`)**

```bash
cd /Users/kz/Code/Crafty
git checkout main && git pull --ff-only 2>/dev/null; git status --short
git checkout -b s1c-m1-ui-foundation
```
Expected: on a clean `s1c-m1-ui-foundation` off `38ae917` (ignore the auto `.state/compaction-events.jsonl`).

- [ ] **Step 2: Install dev dependencies**

```bash
cd /Users/kz/Code/Crafty/frontend
npm i -D clsx tailwind-merge class-variance-authority jsdom @testing-library/react@^16 @testing-library/jest-dom
```
Expected: installs without peer-dep errors (RTL 16 supports React 19). `class-variance-authority`, `clsx`, `tailwind-merge` are runtime utils but fine as devDeps for a frontend bundled by Vite (they tree-shake into the bundle); if the reviewer prefers, `clsx`+`tailwind-merge`+`cva` may be `dependencies` instead — either is acceptable, pick `dependencies` for the three runtime utils and `devDependencies` for jsdom + the two `@testing-library/*`.

```bash
npm i clsx tailwind-merge class-variance-authority
npm i -D jsdom @testing-library/react@^16 @testing-library/jest-dom
```

- [ ] **Step 3: Verify the build + unit suite are still green (baseline before any change)**

Run: `cd /Users/kz/Code/Crafty/frontend && npm run build && npm run test:unit`
Expected: build succeeds; all existing unit tests pass (40+2todo per the M2b record).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(s1c-m1): add cva + clsx + tailwind-merge + jsdom + testing-library dev deps"
```

---

### Task 2: Extend the design tokens (the SoT)

**Files:**
- Modify: `frontend/src/theme/tokens.js` (replace the `UI` export; leave `PALETTE`/`MAGIC`/`DANGER_STATES` untouched)
- Modify: `frontend/tests/theme/tokens.test.js` (add a `UI tokens` describe block)

- [ ] **Step 1: Write the failing test** — append to `tests/theme/tokens.test.js`:

```javascript
import { UI } from '../../src/theme/tokens.js';

describe('UI design-system tokens (S1-C bold-flat)', () => {
  const HEX6 = /^#[0-9A-Fa-f]{6}$/;

  it('ink is the locked near-black', () => {
    expect(UI.color.ink).toBe('#0B0E14');
  });

  it('every color leaf is a valid 6-digit hex', () => {
    const walk = (o) => Object.values(o).forEach((v) =>
      typeof v === 'string' ? expect(v, v).toMatch(HEX6) : walk(v));
    walk(UI.color);
  });

  it('rarity has the 4 locked tiers and legendary is distinct from the trim gold', () => {
    expect(Object.keys(UI.color.rarity).sort())
      .toEqual(['common', 'epic', 'legendary', 'rare']);
    expect(UI.color.rarity.legendary).not.toBe(UI.color.accent); // §9 carry-forward
  });

  it('spell colors mirror the MAGIC elements (fire-dominant; arcane present-but-single)', () => {
    for (const el of ['fire', 'ice', 'lightning', 'arcane', 'nature']) {
      expect(UI.color.spell[el], el).toMatch(HEX6);
    }
  });

  it('radii are capped at the locked <=14px', () => {
    for (const r of Object.values(UI.radius)) expect(r).toBeLessThanOrEqual(14);
  });

  it('elevation shadows are blur-0 hard offsets referencing the ink var', () => {
    for (const s of Object.values(UI.elevation)) {
      expect(s).toMatch(/^\d+px \d+px 0 0 /);          // blur=0, spread=0
      expect(s).toContain('var(--ui-ink)');
    }
  });

  it('the z-index stack is strictly increasing in render order', () => {
    const order = ['scene', 'hud', 'panel', 'modal', 'toast', 'tooltip', 'devOverlay'];
    const vals = order.map((k) => UI.z[k]);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('type scale + font stacks + motion tokens exist', () => {
    expect(UI.type.family.display).toContain('Lilita One');
    expect(UI.type.family.body).toContain('Space Grotesk');
    expect(UI.type.family.displayCjk).toMatch(/Smiley Sans|得意黑/);
    expect(UI.type.family.bodyCjk).toMatch(/PuHuiTi|阿里巴巴普惠体/);
    expect(UI.type.size.base).toBe(16);
    expect(UI.border.chrome).toBe(4);                  // the uniform 4px ink
    expect(UI.motion.duration.base).toBeGreaterThan(0);
    expect(UI.motion.easing.standard).toMatch(/cubic-bezier/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd /Users/kz/Code/Crafty/frontend && npm run test:unit -- tokens`
Expected: FAIL (`UI.color` undefined — old `UI` is flat).

- [ ] **Step 3: Replace the `UI` export** in `src/theme/tokens.js` (delete the current lines 43-54 `export const UI = {...};` and replace with the structured object below — keep everything above it intact):

```javascript
// ── UI design-system tokens (S1-C "bold-flat", locked 2026-06-01 §9). ──────────
// SoT for chrome. Derived into CSS vars + Tailwind by src/theme/cssVars.js.
// Bold-flat = SOLID saturated fills · uniform 4px near-black ink on every chrome
// element · hard blur-0 offset shadows · radius <=14 · NO glass/blur/gradient-chrome.
export const UI = {
  color: {
    ink: '#0B0E14',                 // the uniform chrome outline + text-on-light
    // panels — dark-navy, SOLID (no translucency)
    panel:      '#161C2C',          // primary panel fill
    panelRaise: '#202A44',          // raised / active panel
    panelInset: '#0E1320',          // inset well (slot field, track grooves)
    slot:       '#0E1320',          // empty inventory/hotbar slot fill
    // text
    text:       '#F4F1E8',          // primary (warm off-white)
    textMuted:  '#9AA0AD',
    textInverse:'#0B0E14',          // on gold/light fills
    // brand accent (warm gold) — hairline + CTA
    accent:      '#C9A86A',
    accentRaise: '#DCC089',
    // status
    danger:  '#FF4D6E',
    success: '#5BC98C',
    warn:    '#F2B33D',
    info:    '#5AA9FF',
    // rarity (vivid; legendary is HOT gold, distinct from the trim accent — §9)
    rarity: {
      common:    '#9AA4B2',
      rare:      '#4FA3FF',
      epic:      '#B36BFF',
      legendary: '#FFC23D',
    },
    // spell-state glows — mirror MAGIC; fire-warm dominant, arcane demoted to one element
    spell: {
      fire:      '#FF7A3C',
      ice:       '#6FC8FF',
      lightning: '#FFE066',
      arcane:    '#B36BFF',
      nature:    '#7FE0A0',
    },
    // neutral ramp (chrome shading without leaving the palette)
    gray: {
      g950: '#0B0E14', g900: '#11151F', g800: '#1A2030', g700: '#283149',
      g500: '#5C6478', g300: '#9AA0AD', g100: '#D7DAE0', g50: '#F4F1E8',
    },
  },
  radius: { sm: 6, md: 10, lg: 14 },          // <=14 cap (§9)
  border: { chrome: 4, hairline: 1.5 },       // 4px ink everywhere; gold hairline accent
  space:  { xs: 4, sm: 8, md: 14, lg: 22, xl: 36 },  // 4/8-ish scale
  // hard offset shadows (blur 0, spread 0) — the bold-flat signature. The middle
  // value (md) is the locked `5px 5px 0 0 #0b0e14`. References the ink CSS var so a
  // future theme can recolor the ink globally.
  elevation: {
    sm: '3px 3px 0 0 var(--ui-ink)',
    md: '5px 5px 0 0 var(--ui-ink)',
    lg: '8px 8px 0 0 var(--ui-ink)',
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
    duration: { fast: 120, base: 200, slow: 320 },   // ms
    easing: {
      standard:   'cubic-bezier(0.2, 0, 0, 1)',
      emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
      exit:       'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
};
```

- [ ] **Step 4: Run the token tests to verify pass**

Run: `npm run test:unit -- tokens`
Expected: PASS (both the existing palette tests and the new UI block).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/tokens.js frontend/tests/theme/tokens.test.js
git commit -m "feat(s1c-m1): extend UI tokens — bold-flat semantic color/rarity/spell + type/elevation/z/motion"
```

---

### Task 3: `cssVars.js` — derive CSS vars + Tailwind objects from tokens

**Files:**
- Create: `frontend/src/theme/cssVars.js`
- Create: `frontend/tests/theme/cssVars.test.js`

- [ ] **Step 1: Write the failing test** — `tests/theme/cssVars.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { hexToRgbChannels, CSS_VAR_MAP, applyThemeVars, TW_COLORS, TW_SCALES } from '../../src/theme/cssVars.js';
import { UI } from '../../src/theme/tokens.js';

describe('cssVars', () => {
  it('hexToRgbChannels converts to space-separated 0-255 channels', () => {
    expect(hexToRgbChannels('#0B0E14')).toBe('11 14 20');
    expect(hexToRgbChannels('#FFFFFF')).toBe('255 255 255');
  });

  it('CSS_VAR_MAP emits --ui-ink as RGB channels and a px scalar for radius', () => {
    expect(CSS_VAR_MAP['--ui-ink']).toBe('11 14 20');
    expect(CSS_VAR_MAP['--ui-radius-md']).toBe('10px');
    expect(CSS_VAR_MAP['--ui-elev-md']).toContain('var(--ui-ink)');
  });

  it('applyThemeVars writes every entry of CSS_VAR_MAP onto the root', () => {
    const written = {};
    const fakeRoot = { style: { setProperty: (k, v) => { written[k] = v; } } };
    applyThemeVars(fakeRoot);
    expect(Object.keys(written).sort()).toEqual(Object.keys(CSS_VAR_MAP).sort());
    expect(written['--ui-accent']).toBe(hexToRgbChannels(UI.color.accent));
  });

  it('TW_COLORS references the --ui-* vars with the <alpha-value> placeholder', () => {
    expect(TW_COLORS.ink).toBe('rgb(var(--ui-ink) / <alpha-value>)');
    expect(TW_COLORS.rarity.legendary).toBe('rgb(var(--ui-rarity-legendary) / <alpha-value>)');
    // every TW color var name must exist in the CSS var map (no dangling ref)
    const names = [];
    const walk = (o) => Object.values(o).forEach((v) =>
      typeof v === 'string' ? names.push(v.match(/--ui-[a-z0-9-]+/)[0]) : walk(v));
    walk(TW_COLORS);
    for (const n of names) expect(CSS_VAR_MAP, n).toHaveProperty(n);
  });

  it('TW_SCALES exposes radius/fontSize/boxShadow/zIndex/fontFamily for the config', () => {
    expect(TW_SCALES.borderRadius.md).toBe('10px');
    expect(TW_SCALES.fontSize.base[0]).toBe('16px');
    expect(TW_SCALES.boxShadow['elev-md']).toContain('var(--ui-ink)');
    expect(TW_SCALES.zIndex.modal).toBe('300');
    expect(TW_SCALES.fontFamily.display).toContain('Lilita One');
  });
});
```

- [ ] **Step 2: Run → fail** (`npm run test:unit -- cssVars`): module not found.

- [ ] **Step 3: Implement** `src/theme/cssVars.js`:

```javascript
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

// ── Color var map (name -> RGB channels). One flat namespace under --ui-*. ──────
const C = UI.color;
const COLOR_VARS = {
  '--ui-ink': C.ink,
  '--ui-panel': C.panel,
  '--ui-panel-raise': C.panelRaise,
  '--ui-panel-inset': C.panelInset,
  '--ui-slot': C.slot,
  '--ui-text': C.text,
  '--ui-text-muted': C.textMuted,
  '--ui-text-inverse': C.textInverse,
  '--ui-accent': C.accent,
  '--ui-accent-raise': C.accentRaise,
  '--ui-danger': C.danger,
  '--ui-success': C.success,
  '--ui-warn': C.warn,
  '--ui-info': C.info,
  '--ui-rarity-common': C.rarity.common,
  '--ui-rarity-rare': C.rarity.rare,
  '--ui-rarity-epic': C.rarity.epic,
  '--ui-rarity-legendary': C.rarity.legendary,
  '--ui-spell-fire': C.spell.fire,
  '--ui-spell-ice': C.spell.ice,
  '--ui-spell-lightning': C.spell.lightning,
  '--ui-spell-arcane': C.spell.arcane,
  '--ui-spell-nature': C.spell.nature,
};

// ── Scalar vars (ready-to-use values). ─────────────────────────────────────────
const SCALAR_VARS = {
  '--ui-radius-sm': `${UI.radius.sm}px`,
  '--ui-radius-md': `${UI.radius.md}px`,
  '--ui-radius-lg': `${UI.radius.lg}px`,
  '--ui-border-chrome': `${UI.border.chrome}px`,
  '--ui-elev-sm': UI.elevation.sm,
  '--ui-elev-md': UI.elevation.md,
  '--ui-elev-lg': UI.elevation.lg,
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

// ── Tailwind color object: each maps to its --ui-* var with alpha support. ─────
const tw = (name) => `rgb(var(${name}) / <alpha-value>)`;
export const TW_COLORS = {
  ink: tw('--ui-ink'),
  panel: tw('--ui-panel'),
  'panel-raise': tw('--ui-panel-raise'),
  'panel-inset': tw('--ui-panel-inset'),
  slot: tw('--ui-slot'),
  text: tw('--ui-text'),
  'text-muted': tw('--ui-text-muted'),
  'text-inverse': tw('--ui-text-inverse'),
  accent: tw('--ui-accent'),
  'accent-raise': tw('--ui-accent-raise'),
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
};

// ── Tailwind static scales (no runtime var needed). ────────────────────────────
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
    Object.entries(UI.type.size).map(([k, v]) => [k, [`${v}px`, { lineHeight: String(UI.type.leading.snug) }]]),
  ),
  boxShadow: { 'elev-sm': UI.elevation.sm, 'elev-md': UI.elevation.md, 'elev-lg': UI.elevation.lg },
  zIndex: Object.fromEntries(Object.entries(UI.z).map(([k, v]) => [k, String(v)])),
};
```

- [ ] **Step 4: Run → pass** (`npm run test:unit -- cssVars`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/cssVars.js frontend/tests/theme/cssVars.test.js
git commit -m "feat(s1c-m1): cssVars — derive :root CSS vars + Tailwind theme objects from tokens (SoT)"
```

---

### Task 4: Wire `tailwind.config.cjs` + SoT parity test

**Files:**
- Modify: `frontend/tailwind.config.cjs`
- Create: `frontend/tests/theme/tailwind-wiring.test.js`

- [ ] **Step 1: Write the failing parity test** — `tests/theme/tailwind-wiring.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSS_VAR_MAP, TW_SCALES } from '../../src/theme/cssVars.js';

const CONFIG = readFileSync(resolve(process.cwd(), 'tailwind.config.cjs'), 'utf8');

describe('tailwind ↔ tokens SoT parity', () => {
  it('every --ui-* var referenced in the config exists in CSS_VAR_MAP', () => {
    const refs = [...CONFIG.matchAll(/--ui-[a-z0-9-]+/g)].map((m) => m[0]);
    expect(refs.length).toBeGreaterThan(10); // config actually wired, not empty
    for (const r of new Set(refs)) expect(CSS_VAR_MAP, `dangling ${r}`).toHaveProperty(r);
  });

  it('config wires the token scales (zIndex modal, radius md, elev-md shadow)', () => {
    expect(CONFIG).toContain(`'modal': '${TW_SCALES.zIndex.modal}'`);
    expect(CONFIG).toMatch(/borderRadius/);
    expect(CONFIG).toMatch(/boxShadow/);
    expect(CONFIG).toContain('Lilita One');
  });

  it('theme.extend is non-empty (the §1 root-cause disconnect is closed)', () => {
    expect(CONFIG).not.toMatch(/extend:\s*\{\s*\}/);
  });
});
```

- [ ] **Step 2: Run → fail** (`npm run test:unit -- tailwind-wiring`): `extend: {}` still empty.

- [ ] **Step 3: Replace** `tailwind.config.cjs`. Because the config is CommonJS and `cssVars.js` is ESM, the config inlines the var-reference strings + scales as **literal values** (kept honest by the parity test above + the keys mirror `TW_COLORS`/`TW_SCALES` exactly):

```javascript
/** @type {import('tailwindcss').Config} */
// Theme wired from src/theme/tokens.js via the --ui-* CSS vars that
// src/theme/cssVars.js writes to :root at boot. Colors use rgb(var() / <alpha>)
// so opacity modifiers work; scalars mirror TW_SCALES. SoT parity is enforced by
// tests/theme/tailwind-wiring.test.js (config refs ⇔ CSS_VAR_MAP) — DO NOT add a
// --ui-* name here without adding it to cssVars.js (the test will fail).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        ink: c('--ui-ink'),
        panel: c('--ui-panel'),
        'panel-raise': c('--ui-panel-raise'),
        'panel-inset': c('--ui-panel-inset'),
        slot: c('--ui-slot'),
        text: c('--ui-text'),
        'text-muted': c('--ui-text-muted'),
        'text-inverse': c('--ui-text-inverse'),
        accent: c('--ui-accent'),
        'accent-raise': c('--ui-accent-raise'),
        danger: c('--ui-danger'),
        success: c('--ui-success'),
        warn: c('--ui-warn'),
        info: c('--ui-info'),
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
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px' },
      borderWidth: { chrome: '4px' },
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
        'elev-sm': '3px 3px 0 0 var(--ui-ink)',
        'elev-md': '5px 5px 0 0 var(--ui-ink)',
        'elev-lg': '8px 8px 0 0 var(--ui-ink)',
      },
      zIndex: { scene: '1', hud: '100', panel: '200', modal: '300', toast: '400', tooltip: '500', 'dev-overlay': '9000' },
    },
  },
  plugins: [],
};
```

> Note the boxShadow uses `var(--ui-ink)` directly (not channels) — that's intentional: a box-shadow color needs a full color, and the `--ui-ink` channels need wrapping. **Fix:** the shadow must wrap the channels: `5px 5px 0 0 rgb(var(--ui-ink))`. Use this corrected form in `boxShadow` AND in `tokens.js` `UI.elevation` (update Task 2's elevation strings to `'5px 5px 0 0 rgb(var(--ui-ink))'`) AND in `cssVars.js` `--ui-elev-*` accordingly. Make the three consistent. (The token test in Task 2 checks `contains('var(--ui-ink)')` which still holds.)

- [ ] **Step 3a: Apply the `rgb(var(--ui-ink))` correction** in all three places (`tokens.js` `UI.elevation`, `cssVars.js` is derived so automatic, `tailwind.config.cjs` `boxShadow`). Re-run `npm run test:unit -- tokens cssVars` → still green.

- [ ] **Step 4: Run the parity test + a build to confirm Tailwind compiles the new theme**

Run: `npm run test:unit -- tailwind-wiring && npm run build`
Expected: parity test PASS; build succeeds (Tailwind generates `bg-ink`, `shadow-elev-md`, `font-display`, `text-display`, `rounded-md`, `border-chrome`, `z-modal`, `bg-rarity-legendary`, etc.).

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.cjs frontend/tests/theme/tailwind-wiring.test.js frontend/src/theme/tokens.js frontend/src/theme/cssVars.js
git commit -m "feat(s1c-m1): wire tokens→Tailwind theme.extend via --ui-* vars + SoT parity test"
```

---

### Task 5: Apply theme vars at boot + eager Latin `@font-face`

**Files:**
- Create: `frontend/src/theme/fonts.css`
- Modify: `frontend/src/index.jsx`
- (font binaries land in Task 7; this task wires the @font-face + boot call — the faces fall back to `system-ui` until Task 7 drops the woff2, which is fine and keeps the build green)

- [ ] **Step 1: Read** `src/index.jsx` to find the mount point.

Run: `sed -n '1,40p' src/index.jsx`

- [ ] **Step 2: Create** `src/theme/fonts.css` (eager Latin faces, `font-display: swap`):

```css
/* Eager Latin display + body faces (English default). CJK faces are injected
   lazily by src/i18n/cjkFonts.js only when the zh-CN locale is toggled, so
   English users download ZERO CJK bytes. woff2 files live in public/fonts/. */
@font-face {
  font-family: 'Lilita One';
  src: url('/fonts/lilita-one-v15-latin-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Space Grotesk';
  src: url('/fonts/space-grotesk-v16-latin-regular.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 3: Wire boot** — in `src/index.jsx`, add imports + the `applyThemeVars()` call **before** `ReactDOM ... render`:

```javascript
import './theme/fonts.css';
import { applyThemeVars } from './theme/cssVars.js';

applyThemeVars(); // write --ui-* onto :root before first paint
```

(Place `import './theme/fonts.css'` next to the existing `./index.css` import; place the `applyThemeVars()` call at module top-level after imports.)

- [ ] **Step 4: Verify build + the existing visual baselines are untouched**

Run: `npm run build && npm run test:visual`
Expected: build OK. Visual: the 6 existing states still pass (`applyThemeVars` only ADDS `--ui-*` vars; no existing selector consumes them yet, and `body` font is unchanged → menu/explore frames are byte-identical). If any existing state regresses >6%, STOP — something changed a consumed global; revert and isolate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/fonts.css frontend/src/index.jsx
git commit -m "feat(s1c-m1): apply --ui-* vars at boot + eager Latin @font-face (Lilita One, Space Grotesk)"
```

---

### Task 6: i18n layer (`locale` store + `t()`/`useT()`) + zh-CN strings

**Files:**
- Modify: `frontend/src/store/useGameStore.jsx` (add `locale`/`setLocale` near `dangerLevel`, lines ~54-57)
- Create: `frontend/src/i18n/strings.js`
- Create: `frontend/src/i18n/i18n.js`
- Create: `frontend/tests/i18n/i18n.test.js`

- [ ] **Step 1: Write the failing test** — `tests/i18n/i18n.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { t, LOCALES } from '../../src/i18n/i18n.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('i18n', () => {
  beforeEach(() => useGameStore.getState().setLocale('en'));

  it('store has en default + setLocale', () => {
    expect(useGameStore.getState().locale).toBe('en');
    useGameStore.getState().setLocale('zh-CN');
    expect(useGameStore.getState().locale).toBe('zh-CN');
  });

  it('t() returns the active-locale string', () => {
    expect(t('ui.inventory')).toBe(STRINGS.en['ui.inventory']);
    useGameStore.getState().setLocale('zh-CN');
    expect(t('ui.inventory')).toBe(STRINGS['zh-CN']['ui.inventory']);
  });

  it('t() falls back to en, then to the key itself', () => {
    useGameStore.getState().setLocale('zh-CN');
    // a key present in en but (hypothetically) missing in zh falls back to en
    const enOnly = Object.keys(STRINGS.en).find((k) => !(k in STRINGS['zh-CN']));
    if (enOnly) expect(t(enOnly)).toBe(STRINGS.en[enOnly]);
    expect(t('totally.missing.key')).toBe('totally.missing.key');
  });

  it('t() interpolates {vars}', () => {
    // 'ui.level' === 'Level {n}' / '等级 {n}'
    expect(t('ui.level', { n: 7 })).toContain('7');
  });

  it('zh-CN table covers every en key (no untranslated showcase string)', () => {
    for (const k of Object.keys(STRINGS.en)) expect(STRINGS['zh-CN'], k).toHaveProperty(k);
  });

  it('LOCALES lists the two supported locales', () => {
    expect(LOCALES).toEqual(['en', 'zh-CN']);
  });
});
```

- [ ] **Step 2: Run → fail** (module + store field missing).

- [ ] **Step 3: Add to the store** — in `src/store/useGameStore.jsx`, immediately after the `dangerLevel`/`setDangerLevel` block (after line 57), insert:

```javascript
    // UI locale (S1-C): 'en' default + togglable 'zh-CN'. CJK fonts lazy-load on
    // the flip to zh-CN (see src/i18n/cjkFonts.js) so English users fetch zero CJK.
    locale: 'en',
    setLocale: (loc) => set({ locale: loc === 'zh-CN' ? 'zh-CN' : 'en' }),

    // Dev-only: full-screen primitives showcase for the visual-regression gate.
    showcaseView: false,
    setShowcaseView: (on) => set({ showcaseView: !!on }),
```

- [ ] **Step 4: Create** `src/i18n/strings.js` (flat dotted keys; cover all showcase + core-HUD labels):

```javascript
// Flat dotted-key string tables. en is the source/fallback; zh-CN must cover
// every en key (enforced by tests/i18n/i18n.test.js). Keep keys stable —
// user-facing copy goes through t(key), never hardcoded.
export const STRINGS = {
  en: {
    'ui.inventory': 'Inventory',
    'ui.equip': 'Equip',
    'ui.unequip': 'Unequip',
    'ui.craft': 'Craft',
    'ui.settings': 'Settings',
    'ui.close': 'Close',
    'ui.level': 'Level {n}',
    'ui.health': 'Health',
    'ui.mana': 'Mana',
    'ui.hunger': 'Hunger',
    'ui.gold': 'Gold',
    'ui.locale': '中文',
    'stat.atk': 'ATK',
    'stat.def': 'DEF',
    'stat.spd': 'SPD',
    'stat.crit': 'CRIT',
    'rarity.common': 'Common',
    'rarity.rare': 'Rare',
    'rarity.epic': 'Epic',
    'rarity.legendary': 'Legendary',
    'spell.fire': 'Fireball',
    'spell.ice': 'Frost',
    'spell.lightning': 'Storm',
    'spell.arcane': 'Arcane',
    'showcase.title': 'Crafty UI — Bold-Flat System',
    'showcase.primitives': 'Primitives',
    'showcase.toast': 'Quest complete! +120 XP',
    'showcase.tooltip': 'Diamond Sword — +15 ATK',
  },
  'zh-CN': {
    'ui.inventory': '背包',
    'ui.equip': '装备',
    'ui.unequip': '卸下',
    'ui.craft': '合成',
    'ui.settings': '设置',
    'ui.close': '关闭',
    'ui.level': '等级 {n}',
    'ui.health': '生命',
    'ui.mana': '法力',
    'ui.hunger': '饥饿',
    'ui.gold': '金币',
    'ui.locale': 'EN',
    'stat.atk': '攻击',
    'stat.def': '防御',
    'stat.spd': '速度',
    'stat.crit': '暴击',
    'rarity.common': '普通',
    'rarity.rare': '稀有',
    'rarity.epic': '史诗',
    'rarity.legendary': '传说',
    'spell.fire': '火球术',
    'spell.ice': '冰霜',
    'spell.lightning': '风暴',
    'spell.arcane': '奥术',
    'showcase.title': 'Crafty 界面 — 粗描扁平系统',
    'showcase.primitives': '组件',
    'showcase.toast': '任务完成！+120 经验',
    'showcase.tooltip': '钻石剑 — +15 攻击',
  },
};
```

- [ ] **Step 5: Create** `src/i18n/i18n.js`:

```javascript
import { useGameStore } from '../store/useGameStore.jsx';
import { STRINGS } from './strings.js';

export const LOCALES = ['en', 'zh-CN'];

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Translate `key` for the current store locale. Fallback: locale → en → key. */
export function t(key, vars) {
  const locale = useGameStore.getState().locale || 'en';
  const table = STRINGS[locale] || STRINGS.en;
  const raw = key in table ? table[key] : (key in STRINGS.en ? STRINGS.en[key] : key);
  return interpolate(raw, vars);
}

/** React hook: re-renders the component on locale change and returns a bound t. */
export function useT() {
  useGameStore((s) => s.locale); // subscribe → re-render on toggle
  return t;
}
```

- [ ] **Step 6: Run → pass** (`npm run test:unit -- i18n`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/useGameStore.jsx frontend/src/i18n/strings.js frontend/src/i18n/i18n.js frontend/tests/i18n/i18n.test.js
git commit -m "feat(s1c-m1): i18n layer — locale store + t()/useT() + en/zh-CN tables + showcase flag"
```

---

### Task 7: Self-host fonts (acquire woff2) + lazy CJK loader

**Files:**
- Create: `frontend/public/fonts/` + woff2 binaries
- Create: `frontend/src/i18n/cjkFonts.js`
- Modify: `frontend/src/store/useGameStore.jsx` (call `loadCjkFonts()` from `setLocale` on zh-CN)
- Append: `frontend/tests/i18n/i18n.test.js` (cjkFonts idempotency)

> **If any download URL 404s or the host is unreachable, report `BLOCKED` with the failing URL** — the controller will supply an alternative source. Do NOT commit placeholder/empty font files.

- [ ] **Step 1: Acquire the 2 eager Latin faces** (google-webfonts-helper CDN — OFL):

```bash
cd /Users/kz/Code/Crafty/frontend && mkdir -p public/fonts && cd public/fonts
curl -fSL -o lilita-one-v15-latin-regular.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/lilita-one@latest/latin-400-normal.woff2"
curl -fSL -o space-grotesk-v16-latin-regular.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-400-normal.woff2"
# Space Grotesk is variable 300-700; the 400-normal static is sufficient for M1.
ls -la *.woff2
```
Expected: two non-empty `.woff2` files (each ~20-60KB). Verify with `file *.woff2` (should report "Web Open Font Format (Version 2)").

- [ ] **Step 2: Acquire the 2 lazy CJK faces** (display = Smiley Sans / 得意黑 OFL; body = Alibaba PuHuiTi):

```bash
cd /Users/kz/Code/Crafty/frontend/public/fonts
# Smiley Sans (得意黑) — OFL, official GitHub release ships woff2:
curl -fSL -o smiley-sans-v1.woff2 \
  "https://cdn.jsdelivr.net/gh/atelier-anchor/smiley-sans@latest/dist/SmileySans-Oblique.woff2"
# Alibaba PuHuiTi 3.0 (body) — if a clean single-weight woff2 isn't fetchable in one
# call, report BLOCKED; do NOT convert TTF inline in this task. As an M1 stand-in the
# loader may fall back to Noto Sans SC subset (OFL, fontsource) — flagged below.
curl -fSL -o puhuiti-regular.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.woff2" || echo "BLOCKED: puhuiti source"
ls -la *.woff2 && file *.woff2
```
> **Scope note for the reviewer:** §9 locks zh BODY = Alibaba PuHuiTi. If a one-call clean woff2 of PuHuiTi isn't available, M1 ships the Noto Sans SC subset as the **body stand-in** (the loader's `@font-face` family name stays `'Alibaba PuHuiTi 3.0'` so swapping the file later needs no code change), and a tech-debt note is added to the plan + CHANGELOG: "swap PuHuiTi woff2 + cn-font-split subsetting in a later perf pass." This keeps the zh showcase truthful (real CJK renders) without blocking M1 on font subsetting.

- [ ] **Step 3: Write the failing idempotency test** — append to `tests/i18n/i18n.test.js`:

```javascript
import { loadCjkFonts, _cjkLoadedForTest } from '../../src/i18n/cjkFonts.js';

describe('cjkFonts lazy loader', () => {
  it('is idempotent — injects the faces at most once', async () => {
    // jsdom-free: stub a minimal document.fonts
    const added = [];
    const g = globalThis;
    g.document = g.document || {};
    g.document.fonts = { add: (f) => added.push(f), load: async () => {}, ready: Promise.resolve() };
    g.FontFace = class { constructor(family) { this.family = family; } async load() { return this; } };
    await loadCjkFonts();
    const firstCount = added.length;
    expect(firstCount).toBeGreaterThan(0);
    await loadCjkFonts(); // second call must be a no-op
    expect(added.length).toBe(firstCount);
    expect(_cjkLoadedForTest()).toBe(true);
  });
});
```
> Add `// @vitest-environment node` is the default; the stub above avoids needing jsdom. Keep this test in `tests/i18n/i18n.test.js` (node env).

- [ ] **Step 4: Run → fail** (module missing).

- [ ] **Step 5: Implement** `src/i18n/cjkFonts.js`:

```javascript
// Lazy CJK font loader. Called only when the locale flips to zh-CN, so English
// users never fetch the (large) CJK woff2. Idempotent: injects each FontFace
// once via the CSS Font Loading API, then resolves when the browser reports them
// ready. No-op in non-browser (test) envs lacking FontFace.
let _loaded = false;
export function _cjkLoadedForTest() { return _loaded; }

const FACES = [
  { family: 'Smiley Sans',          url: '/fonts/smiley-sans-v1.woff2',  desc: { weight: '400', style: 'oblique' } },
  { family: 'Alibaba PuHuiTi 3.0',  url: '/fonts/puhuiti-regular.woff2', desc: { weight: '400', style: 'normal' } },
];

export async function loadCjkFonts() {
  if (_loaded) return;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    _loaded = true; // nothing to do in a non-DOM env
    return;
  }
  _loaded = true;
  await Promise.all(FACES.map(async ({ family, url, desc }) => {
    try {
      const face = new FontFace(family, `url(${url}) format('woff2')`, desc);
      document.fonts.add(face);
      await face.load();
    } catch (e) {
      // a missing CJK face must never crash the toggle — fall back to the stack
      if (import.meta?.env?.DEV) console.warn('[cjkFonts] failed', family, e);
    }
  }));
}
```

- [ ] **Step 6: Hook the loader into `setLocale`** — update the `setLocale` line added in Task 6 so flipping to zh-CN triggers the lazy load:

```javascript
    setLocale: (loc) => {
      const next = loc === 'zh-CN' ? 'zh-CN' : 'en';
      set({ locale: next });
      if (next === 'zh-CN') import('../i18n/cjkFonts.js').then((m) => m.loadCjkFonts());
    },
```
(Dynamic `import()` keeps the loader + its intent out of the initial bundle for English users.)

- [ ] **Step 7: Run → pass** (`npm run test:unit -- i18n`) + `npm run build` (confirm dynamic import chunk is emitted, no error).

- [ ] **Step 8: Commit** (binaries included — they are required app assets)

```bash
git add frontend/public/fonts frontend/src/i18n/cjkFonts.js frontend/src/store/useGameStore.jsx frontend/tests/i18n/i18n.test.js
git commit -m "feat(s1c-m1): self-host Latin fonts + lazy CJK loader (zh-CN-gated, idempotent)"
```

---

### Task 8: `cn()` helper + `Panel` primitive

**Files:**
- Create: `frontend/src/ui/primitives/cn.js`
- Create: `frontend/src/ui/primitives/Panel.jsx`
- Create: `frontend/tests/ui/primitives.test.jsx` (jsdom; this file accumulates all primitive tests)

- [ ] **Step 1: Create** `src/ui/primitives/cn.js`:

```javascript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
/** Merge conditional class lists with Tailwind-aware conflict resolution. */
export function cn(...inputs) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 2: Write the failing test** — create `tests/ui/primitives.test.jsx` with a jsdom docblock:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Panel } from '../../src/ui/primitives/Panel.jsx';

afterEach(cleanup);

describe('Panel', () => {
  it('renders children and the bold-flat chrome classes', () => {
    render(<Panel data-testid="p">hello</Panel>);
    const el = screen.getByTestId('p');
    expect(el).toHaveTextContent('hello');
    expect(el.className).toMatch(/border-chrome/);     // 4px ink border
    expect(el.className).toMatch(/border-ink/);
    expect(el.className).toMatch(/shadow-elev/);        // hard offset shadow
    expect(el.className).toMatch(/bg-panel/);
  });

  it('applies the raised variant + merges a passed className', () => {
    render(<Panel variant="raise" className="w-40" data-testid="p">x</Panel>);
    const el = screen.getByTestId('p');
    expect(el.className).toMatch(/bg-panel-raise/);
    expect(el.className).toMatch(/\bw-40\b/);
  });
});
```

- [ ] **Step 3: Run → fail** (`npm run test:unit -- primitives`): Panel missing.

- [ ] **Step 4: Implement** `src/ui/primitives/Panel.jsx`:

```jsx
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat panel: SOLID navy fill · uniform 4px ink border · hard offset shadow
// · radius <=14. No glass/blur. variant tweaks the fill + shadow depth only.
const panel = cva(
  'border-chrome border-ink text-text font-body',
  {
    variants: {
      variant: {
        base:  'bg-panel rounded-md shadow-elev-md',
        raise: 'bg-panel-raise rounded-md shadow-elev-lg',
        inset: 'bg-panel-inset rounded-sm shadow-none',
      },
    },
    defaultVariants: { variant: 'base' },
  },
);

export const Panel = forwardRef(function Panel({ variant, className, ...props }, ref) {
  return <div ref={ref} className={cn(panel({ variant }), className)} {...props} />;
});
```

- [ ] **Step 5: Run → pass** (`npm run test:unit -- primitives`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/primitives/cn.js frontend/src/ui/primitives/Panel.jsx frontend/tests/ui/primitives.test.jsx
git commit -m "feat(s1c-m1): cn() helper + Panel primitive (bold-flat: solid fill + 4px ink + hard offset)"
```

---

### Task 9: `Button` primitive

**Files:**
- Create: `frontend/src/ui/primitives/Button.jsx`
- Modify: `frontend/tests/ui/primitives.test.jsx` (append Button describe)

- [ ] **Step 1: Append the failing test** to `tests/ui/primitives.test.jsx`:

```jsx
import { Button } from '../../src/ui/primitives/Button.jsx';

describe('Button', () => {
  it('renders a real <button> with the primary gold CTA chrome by default', () => {
    render(<Button>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.className).toMatch(/bg-accent/);          // flat gold
    expect(el.className).toMatch(/border-chrome/);
    expect(el.className).toMatch(/border-ink/);
    expect(el.className).toMatch(/shadow-elev/);
  });

  it('supports variant + size + forwards onClick/disabled', () => {
    let clicked = 0;
    render(<Button variant="danger" size="sm" onClick={() => clicked++}>X</Button>);
    const el = screen.getByRole('button', { name: 'X' });
    expect(el.className).toMatch(/bg-danger/);
    el.click();
    expect(clicked).toBe(1);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `src/ui/primitives/Button.jsx`:

```jsx
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat button: flat saturated fill · 4px ink border · hard offset shadow that
// "presses" on :active (translate + shadow shrink). Motion uses token-aligned
// durations; respects prefers-reduced-motion via the `motion-reduce:` utility.
const button = cva(
  'inline-flex items-center justify-center gap-2 select-none font-display uppercase ' +
  'border-chrome border-ink rounded-md shadow-elev-md ' +
  'transition-[transform,box-shadow] duration-150 ease-out ' +
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-elev-sm ' +
  'motion-reduce:transition-none motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0 ' +
  'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary:   'bg-accent text-text-inverse hover:bg-accent-raise',
        secondary: 'bg-panel-raise text-text hover:bg-panel',
        ghost:     'bg-transparent text-text shadow-none hover:bg-panel-raise',
        danger:    'bg-danger text-text-inverse',
      },
      size: {
        sm: 'text-sm px-3 py-1.5',
        md: 'text-base px-4 py-2',
        lg: 'text-lg px-6 py-3',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef(function Button({ variant, size, className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />;
});
```

- [ ] **Step 4: Run → pass.** **Step 5: Commit** `git commit -m "feat(s1c-m1): Button primitive (bold-flat CTA, cva variants, reduced-motion safe)"`.

---

### Task 10: `Slot` primitive (inventory/hotbar cell)

**Files:**
- Create: `frontend/src/ui/primitives/Slot.jsx`
- Modify: `frontend/tests/ui/primitives.test.jsx`

- [ ] **Step 1: Append the failing test:**

```jsx
import { Slot } from '../../src/ui/primitives/Slot.jsx';

describe('Slot', () => {
  it('renders an empty slot with the inset field + 4px ink', () => {
    render(<Slot data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/bg-slot/);
    expect(el.className).toMatch(/border-chrome/);
  });
  it('rarity tints the border and selected adds the accent ring', () => {
    render(<Slot rarity="legendary" selected data-testid="s">x</Slot>);
    const el = screen.getByTestId('s');
    expect(el.className).toMatch(/border-rarity-legendary/);
    expect(el.className).toMatch(/ring/);
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `src/ui/primitives/Slot.jsx`:

```jsx
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Inventory/hotbar cell. Empty = inset slot fill + ink. rarity tints the border
// (common keeps the plain ink). selected adds a gold ring. Always 4px ink (the
// world-outline tie). square via aspect-square; size set by the parent (w-*).
const slot = cva(
  'relative grid place-items-center aspect-square bg-slot rounded-sm border-chrome ' +
  'shadow-elev-sm overflow-hidden',
  {
    variants: {
      rarity: {
        none:      'border-ink',
        common:    'border-rarity-common',
        rare:      'border-rarity-rare',
        epic:      'border-rarity-epic',
        legendary: 'border-rarity-legendary',
      },
      selected: { true: 'ring-2 ring-accent ring-offset-0', false: '' },
    },
    defaultVariants: { rarity: 'none', selected: false },
  },
);

export const Slot = forwardRef(function Slot({ rarity = 'none', selected = false, className, children, ...props }, ref) {
  return (
    <div ref={ref} className={cn(slot({ rarity, selected }), className)} {...props}>
      {children}
    </div>
  );
});
```

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -m "feat(s1c-m1): Slot primitive (rarity-tinted, selectable, 4px ink)"`.

---

### Task 11: `StatBar` primitive (health/mana/hunger)

**Files:**
- Create: `frontend/src/ui/primitives/StatBar.jsx`
- Modify: `frontend/tests/ui/primitives.test.jsx`

- [ ] **Step 1: Append the failing test:**

```jsx
import { StatBar } from '../../src/ui/primitives/StatBar.jsx';

describe('StatBar', () => {
  it('clamps fill 0..1 and renders a tabular-nums value', () => {
    render(<StatBar kind="health" value={150} max={100} showValue data-testid="b" />);
    const el = screen.getByTestId('b');
    const fill = el.querySelector('[data-fill]');
    expect(fill).toHaveStyle({ width: '100%' });        // clamped
    expect(el.className).toMatch(/border-chrome/);
    expect(el).toHaveTextContent('100');                // value label (clamped)
    expect(el.querySelector('.tabular-nums')).toBeTruthy();
  });
  it('kind selects the fill color (mana = info/blue)', () => {
    render(<StatBar kind="mana" value={50} max={100} data-testid="b" />);
    expect(screen.getByTestId('b').querySelector('[data-fill]').className).toMatch(/bg-info/);
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `src/ui/primitives/StatBar.jsx`:

```jsx
import { forwardRef } from 'react';
import { cn } from './cn.js';

const FILL = { health: 'bg-danger', mana: 'bg-info', hunger: 'bg-warn', xp: 'bg-accent' };

// Bold-flat stat bar: inset track + 4px ink frame + hard offset + a flat saturated
// fill. Value label is tabular-nums (IB-grade numerics). Fill width is clamped 0..100%.
export const StatBar = forwardRef(function StatBar(
  { kind = 'health', value = 0, max = 100, showValue = false, label, className, ...props }, ref) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  const shown = Math.round(Math.max(0, Math.min(value, max)));
  return (
    <div ref={ref} className={cn('relative h-5 w-44 bg-panel-inset rounded-sm border-chrome border-ink shadow-elev-sm overflow-hidden', className)} {...props}>
      <div data-fill className={cn('h-full', FILL[kind] || 'bg-accent')} style={{ width: `${pct}%` }} />
      {(showValue || label) && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-body text-text">
          {label && <span className="mr-1">{label}</span>}
          {showValue && <span className="tabular-nums">{shown}/{max}</span>}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -m "feat(s1c-m1): StatBar primitive (flat fill + ink frame + tabular-nums)"`.

---

### Task 12: `Icon` primitive (lucide-backed, currentColor)

**Files:**
- Create: `frontend/src/ui/primitives/Icon.jsx`
- Modify: `frontend/tests/ui/primitives.test.jsx`

- [ ] **Step 1: Append the failing test:**

```jsx
import { Icon } from '../../src/ui/primitives/Icon.jsx';

describe('Icon', () => {
  it('renders a sized currentColor svg for a known name', () => {
    render(<Icon name="heart" size={24} data-testid="i" />);
    const svg = screen.getByTestId('i');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('24');
  });
  it('renders nothing (no crash) for an unknown name', () => {
    const { container } = render(<Icon name="totally-unknown" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `src/ui/primitives/Icon.jsx`:

```jsx
import { Heart, Droplet, Drumstick, Sword, Shield, Gem, Settings, X, Sparkles, Flame, Snowflake, Zap } from 'lucide-react';

// Chrome/semantic icon primitive (M1: lucide-backed app-chrome set). M3 extends the
// `name` map to game-icons.net for game-semantic content + decouples emoji from data.
// All icons inherit `currentColor` (color via Tailwind text-* on the parent).
const MAP = {
  heart: Heart, mana: Droplet, hunger: Drumstick, sword: Sword, shield: Shield,
  gem: Gem, settings: Settings, close: X, sparkles: Sparkles,
  fire: Flame, ice: Snowflake, lightning: Zap,
};

export function Icon({ name, size = 20, strokeWidth = 2.5, ...props }) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  return <Cmp width={size} height={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
}
```
> `strokeWidth 2.5` reads chunkier — aligned with the bold-flat language. Game-semantic icons + the full emoji-decouple are M3.

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -m "feat(s1c-m1): Icon primitive (lucide-backed chrome set, currentColor)"`.

---

### Task 13: `Toast` + `Tooltip` primitives + barrel

**Files:**
- Create: `frontend/src/ui/primitives/Toast.jsx`, `frontend/src/ui/primitives/Tooltip.jsx`, `frontend/src/ui/primitives/index.js`
- Modify: `frontend/tests/ui/primitives.test.jsx`

- [ ] **Step 1: Append the failing tests:**

```jsx
import { Toast } from '../../src/ui/primitives/Toast.jsx';
import { Tooltip } from '../../src/ui/primitives/Tooltip.jsx';

describe('Toast', () => {
  it('renders status-tinted bold-flat chrome with a message', () => {
    render(<Toast status="success" data-testid="t">Quest complete!</Toast>);
    const el = screen.getByTestId('t');
    expect(el).toHaveTextContent('Quest complete!');
    expect(el.className).toMatch(/border-chrome/);
    expect(el.className).toMatch(/bg-success|border-success/);
  });
});
describe('Tooltip', () => {
  it('shows its content', () => {
    render(<Tooltip data-testid="tt">+15 ATK</Tooltip>);
    expect(screen.getByTestId('tt')).toHaveTextContent('+15 ATK');
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement.**

`src/ui/primitives/Toast.jsx`:
```jsx
import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat toast: solid panel + a status-colored 4px ink-adjacent accent stripe
// (we keep the ink border + tint the LEFT bar by status). Entry animation is the
// caller's job (wrap in framer-motion AnimatePresence) — the primitive is presentational.
const toast = cva(
  'inline-flex items-center gap-2 bg-panel text-text border-chrome border-ink rounded-md shadow-elev-md px-4 py-2 font-body border-l-8',
  {
    variants: {
      status: {
        info: 'border-l-info', success: 'border-l-success', warn: 'border-l-warn', danger: 'border-l-danger',
      },
    },
    defaultVariants: { status: 'info' },
  },
);
export const Toast = forwardRef(function Toast({ status, className, ...props }, ref) {
  return <div ref={ref} role="status" className={cn(toast({ status }), className)} {...props} />;
});
```

`src/ui/primitives/Tooltip.jsx`:
```jsx
import { forwardRef } from 'react';
import { cn } from './cn.js';
// Minimal bold-flat tooltip surface (positioning is the caller's concern in M1).
export const Tooltip = forwardRef(function Tooltip({ className, ...props }, ref) {
  return <div ref={ref} role="tooltip" className={cn('inline-block bg-ink text-text text-sm font-body rounded-sm px-2 py-1 shadow-elev-sm', className)} {...props} />;
});
```

`src/ui/primitives/index.js` (barrel):
```javascript
export { cn } from './cn.js';
export { Panel } from './Panel.jsx';
export { Button } from './Button.jsx';
export { Slot } from './Slot.jsx';
export { StatBar } from './StatBar.jsx';
export { Icon } from './Icon.jsx';
export { Toast } from './Toast.jsx';
export { Tooltip } from './Tooltip.jsx';
```

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -m "feat(s1c-m1): Toast + Tooltip primitives + barrel export"`.

---

### Task 14: `LocaleToggle` (the 中文/EN chip)

**Files:**
- Create: `frontend/src/ui/LocaleToggle.jsx`
- Modify: `frontend/tests/ui/primitives.test.jsx`

- [ ] **Step 1: Append the failing test:**

```jsx
import { LocaleToggle } from '../../src/ui/LocaleToggle.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('LocaleToggle', () => {
  it('toggles the store locale on click', () => {
    useGameStore.getState().setLocale('en');
    render(<LocaleToggle />);
    const btn = screen.getByRole('button');
    btn.click();
    expect(useGameStore.getState().locale).toBe('zh-CN');
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement** `src/ui/LocaleToggle.jsx`:

```jsx
import { useGameStore } from '../store/useGameStore.jsx';
import { useT } from '../i18n/i18n.js';
import { Button } from './primitives/Button.jsx';

// The locale chip. Label shows the OTHER locale (en → "中文", zh-CN → "EN").
// Flipping to zh-CN triggers the lazy CJK load via the store's setLocale.
export function LocaleToggle({ className }) {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const setLocale = useGameStore((s) => s.setLocale);
  return (
    <Button variant="secondary" size="sm" className={className}
      onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}>
      {t('ui.locale')}
    </Button>
  );
}
```

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -m "feat(s1c-m1): LocaleToggle chip (en↔zh-CN, triggers lazy CJK)"`.

---

### Task 15: `PrimitivesShowcase` (DEV-only gallery)

**Files:**
- Create: `frontend/src/ui/PrimitivesShowcase.jsx`

> No unit test (it's a visual composition gated by the capture state in Task 17). It MUST use `t()`/`useT()` for every label, the `font-display`/`font-display-cjk` swap by locale, and exercise EVERY primitive + a recreation of the locked inventory-card comp.

- [ ] **Step 1: Implement** `src/ui/PrimitivesShowcase.jsx`:

```jsx
import { useGameStore } from '../store/useGameStore.jsx';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Slot, StatBar, Icon, Toast, Tooltip } from './primitives/index.js';
import { LocaleToggle } from './LocaleToggle.jsx';

// DEV-only full-screen gallery proving the bold-flat system in BOTH locales. Driven
// by the visual-regression harness (window.__craftyTest 'showPrimitivesShowcase').
// English-primary; the zh-CN capture proves the i18n swap + CJK lazy-load render.
export function PrimitivesShowcase() {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const displayFont = locale === 'zh-CN' ? 'font-display-cjk' : 'font-display';
  const bodyFont = locale === 'zh-CN' ? 'font-body-cjk' : 'font-body';
  const rarities = ['common', 'rare', 'epic', 'legendary'];
  const spells = ['fire', 'ice', 'lightning', 'arcane'];

  return (
    <div className={`fixed inset-0 z-dev-overlay overflow-auto bg-panel-inset ${bodyFont} text-text p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className={`${displayFont} text-xxl text-accent`}>{t('showcase.title')}</h1>
        <LocaleToggle />
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-8 max-w-[1100px]">
        {/* LEFT: the locked inventory-card composition */}
        <Panel variant="raise" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`${displayFont} text-xl`}>{t('ui.inventory')}</h2>
            <Button variant="ghost" size="sm" aria-label={t('ui.close')}><Icon name="close" size={18} /></Button>
          </div>
          {/* gear slots */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {rarities.map((r, i) => (
              <Slot key={r} rarity={r} selected={i === 3} className="w-full">
                <Icon name={['sword', 'shield', 'gem', 'sparkles'][i]} size={28} className="text-text" />
              </Slot>
            ))}
            {Array.from({ length: 4 }).map((_, i) => <Slot key={`e${i}`} className="w-full" />)}
          </div>
          {/* stats */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[['stat.atk', 148], ['stat.def', 92], ['stat.spd', 110], ['stat.crit', 24]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-panel border-chrome border-ink rounded-sm px-2 py-1">
                <span className="text-text-muted text-sm">{t(k)}</span>
                <span className="tabular-nums text-text">{v}{k === 'stat.crit' ? '%' : ''}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-text-muted">{t('ui.gold')}</span>
            <span className="tabular-nums text-rarity-legendary text-lg">1,280</span>
          </div>
          <Button variant="primary" size="lg" className="w-full">{t('ui.equip')}</Button>
        </Panel>

        {/* RIGHT: primitive catalog */}
        <div className="space-y-6">
          {/* StatBars */}
          <Panel className="p-4 space-y-2">
            <StatBar kind="health" value={78} max={100} showValue label={t('ui.health')} className="w-full" />
            <StatBar kind="mana" value={52} max={100} showValue label={t('ui.mana')} className="w-full" />
            <StatBar kind="hunger" value={90} max={100} showValue label={t('ui.hunger')} className="w-full" />
          </Panel>

          {/* Buttons */}
          <Panel className="p-4 flex flex-wrap gap-3 items-center">
            <Button variant="primary">{t('ui.equip')}</Button>
            <Button variant="secondary">{t('ui.craft')}</Button>
            <Button variant="ghost"><Icon name="settings" size={18} />{t('ui.settings')}</Button>
            <Button variant="danger">{t('ui.unequip')}</Button>
          </Panel>

          {/* Rarity slots */}
          <Panel className="p-4">
            <div className="grid grid-cols-4 gap-3">
              {rarities.map((r) => (
                <div key={r} className="flex flex-col items-center gap-1">
                  <Slot rarity={r} className="w-16"><Icon name="gem" size={28} className="text-text" /></Slot>
                  <span className="text-xs text-text-muted">{t(`rarity.${r}`)}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Spell ring chips (fire-dominant; arcane single) */}
          <Panel className="p-4 flex gap-3">
            {spells.map((s) => (
              <div key={s} className={`grid place-items-center w-12 h-12 rounded-lg border-chrome border-ink bg-panel text-spell-${s}`}>
                <Icon name={s === 'arcane' ? 'sparkles' : s} size={26} />
              </div>
            ))}
          </Panel>

          {/* Toast + Tooltip */}
          <div className="flex gap-4 items-center">
            <Toast status="success">{t('showcase.toast')}</Toast>
            <Tooltip>{t('showcase.tooltip')}</Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
```
> The `font-body-cjk`/`text-spell-*` classes must exist. `text-spell-fire` etc. resolve via the `spell` color group (Tailwind generates `text-spell-fire`). `font-body-cjk`/`font-display-cjk` resolve via the fontFamily keys. Confirm Tailwind emits them (they're referenced statically here so the JIT scanner picks them up).

- [ ] **Step 2: Verify it compiles + build picks up the dynamic classes**

Run: `npm run build`
Expected: success. (No unit test here — Task 17 captures it visually.)

- [ ] **Step 3: Commit** `git commit -m "feat(s1c-m1): PrimitivesShowcase DEV gallery (all primitives + locked inventory card, bilingual)"`.

---

### Task 16: Mount the showcase (DEV+capture only) + static gate

**Files:**
- Modify: `frontend/src/App.jsx` (render the showcase overlay behind the dev flag)
- Modify: `frontend/tests/gates/static-gates.test.js` (add the primitives-consume-tokens gate)

- [ ] **Step 1: Mount the overlay** — in `src/App.jsx`, add the import + render. Import near the other ui imports:

```javascript
import { PrimitivesShowcase } from './ui/PrimitivesShowcase';
```

Add a reactive read near `const hudHidden = useGameStore(s => s.hudHidden);` (line ~69):

```javascript
  const showcaseView = useGameStore(s => s.showcaseView);
```

Render it as the TOP overlay (DEV-only) — add immediately inside the outer return `<div>`, as the LAST child before the closing `</div>` (after `{!hudHidden && <DebugOverlay .../>}`, line ~402):

```jsx
      {import.meta.env.DEV && showcaseView && <PrimitivesShowcase />}
```

- [ ] **Step 2: Add the new static gate** — append inside the `describe('static gates', ...)` block in `tests/gates/static-gates.test.js`:

```javascript
  // S1-C-M1: the new primitives must consume tokens (no raw hex chrome) — keeps the
  // bold-flat system single-sourced. (Game/3D colors elsewhere are out of scope.)
  it('S1-C-M1: src/ui/primitives contain zero hardcoded hex', () => {
    const dir = join(SRC, 'ui', 'primitives');
    const prim = FILES.filter((f) => f.startsWith(dir));
    expect(prim.length, 'primitives dir should have files').toBeGreaterThan(5);
    for (const f of prim) {
      const hits = readFileSync(f, 'utf8').match(HEX) || [];
      expect(hits, `${f.replace(SRC, 'src')} has raw hex ${hits}`).toHaveLength(0);
    }
  });
```

- [ ] **Step 3: Run the unit suite + build**

Run: `npm run test:unit && npm run build`
Expected: all green (the new gate passes — primitives use only Tailwind token classes).

- [ ] **Step 4: Commit** `git commit -m "feat(s1c-m1): mount PrimitivesShowcase (DEV+capture) + primitives-no-raw-hex gate"`.

---

### Task 17: Showcase capture states (en + zh) + visual gate

**Files:**
- Modify: `frontend/src/App.jsx` (register the `showPrimitivesShowcase` test hook)
- Modify: `frontend/scripts/visual/capture.mjs` (2 screenshots + fonts.ready wait)
- Modify: `frontend/tests/visual/diff.test.js` (STATES array)

- [ ] **Step 1: Register the test hook** — in `src/App.jsx`, inside the DEV `useEffect` that registers hooks (after `registerTestHook('spawnBossCloseup', ...)`, before `registerTestHook('exitCapture', ...)`, line ~198):

```javascript
    // Primitives-showcase fixture: drives the locale, shows the DEV gallery overlay,
    // and (for zh-CN) loads CJK fonts. The capture script waits for document.fonts.ready
    // before screenshotting so the font swap is fully painted.
    registerTestHook('showPrimitivesShowcase', async (locale = 'en') => {
      const store = useGameStore.getState();
      store.setHudHidden(true);
      store.setLocale(locale);          // zh-CN triggers the lazy CJK load (async)
      store.setShowcaseView(true);
    });
```

- [ ] **Step 2: Add the captures** — in `scripts/visual/capture.mjs`, after the `boss-closeup` screenshot block (line ~114, before the `} finally {`), append:

```javascript
    // primitives-showcase (en): the bold-flat UI system gallery. DEV-only overlay,
    // driven via the test bridge. Wait for fonts to finish loading so the Lilita/
    // Space-Grotesk swap is painted (these states are about typography + chrome).
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'en'));
    await page.evaluate(() => document.fonts.ready);
    await delay(700);
    await page.screenshot({ path: resolve(OUT, 'primitives-showcase-en.png') });
    console.log('captured primitives-showcase-en');

    // primitives-showcase (zh-CN): proves the i18n swap + lazy CJK render. Loading
    // CJK is async (FontFace.load), so wait for fonts.ready AGAIN + a settle delay.
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'zh-CN'));
    await page.evaluate(() => document.fonts.ready);
    await delay(1200);
    await page.screenshot({ path: resolve(OUT, 'primitives-showcase-zh.png') });
    console.log('captured primitives-showcase-zh');
```

- [ ] **Step 3: Extend the STATES array** — in `tests/visual/diff.test.js` line 7:

```javascript
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian', 'character-closeup', 'boss-closeup', 'primitives-showcase-en', 'primitives-showcase-zh'];
```

- [ ] **Step 4: Capture CURRENT for all states + confirm the 6 existing are unregressed**

Run: `npm run visual:capture` then `npx vitest run --config vitest.visual.config.js`
Expected: the 6 existing states PASS (<6% — ideally ~0.00%, since M1 didn't touch the 3D scene). The 2 NEW states FAIL with "missing baseline" — **this is expected**; baselines are generated + human-reviewed in the controller's Task 18 (NOT auto-generated by a subagent).

> If any of the 6 existing states regresses >6%: STOP, report BLOCKED. The most likely cause is a global style leak (an applyThemeVars/font change touching `body`/menu). Isolate before proceeding.

- [ ] **Step 5: Commit** (current/ pngs are gitignored per existing setup; commit only source)

```bash
git add frontend/src/App.jsx frontend/scripts/visual/capture.mjs frontend/tests/visual/diff.test.js
git commit -m "feat(s1c-m1): primitives-showcase capture states (en+zh) + visual-gate wiring"
```

---

### Task 18 (CONTROLLER, not a subagent): generate baselines + human review

> This task is performed by the orchestrator, NOT dispatched — it requires Kevin's human eyeball on the rendered showcase before the baselines are blessed (per the visual re-baseline rule).

- [ ] **Step 1:** Open `tests/visual/current/primitives-showcase-en.png` + `...-zh.png`; visually audit against the locked comps (`docs/superpowers/specs/s1c-ui-reference/LOCKED-bold-flat-{en,zh}.png`) — check: 4px ink on ALL chrome, hard offset shadows, gold CTA, vivid rarity (legendary distinct), CJK renders crisply in the zh frame, tabular-nums aligned, no glass/blur.
- [ ] **Step 2:** Surface both PNGs to Kevin for sign-off (he reviews PNGs on wake).
- [ ] **Step 3 (after sign-off):** `npm run visual:baseline` (regenerates ALL baselines incl. the 2 new) → `npm run test:visual` → all 8 states green. Commit baselines: `git add frontend/tests/visual/baseline && git commit -m "test(s1c-m1): baseline the primitives-showcase states (en+zh)"`.

---

### Task 19 (CONTROLLER): final review, docs, merge

- [ ] **Step 1:** Dispatch a final code-quality reviewer over the whole branch diff (Opus 4.8). Address any blocking findings as NEW commits.
- [ ] **Step 2:** Full gate: `npm run test:unit && npm run test:visual && npm run build` → all green.
- [ ] **Step 3:** Update docs: `docs/superpowers/plans/2026-06-01-crafty-s1c-m1-ui-foundation.md` STATUS→COMPLETE (flip all checkboxes); the S1-C brief §9 scope note (M1 ✅); `memory/{ACTIVE_PLAN,CHANGELOG,ARCHITECTURE,ROADMAP}.md` (ACTIVE_PLAN → M2 next; CHANGELOG → M1 entry + the PuHuiTi-subset tech-debt note; ARCHITECTURE → the tokens→cssVars→Tailwind wiring + i18n layer). Update native memory `project_crafty.md`.
- [ ] **Step 4:** `superpowers:finishing-a-development-branch` → merge `s1c-m1-ui-foundation` → `main`, push.

---

## Self-Review (writing-plans checklist — run before execution)

**1. Spec coverage** (against brief §9 + §5 M1 scope):
- ✅ Wire tokens→Tailwind+CSS-vars → Tasks 2,3,4,5.
- ✅ Extend `tokens.UI` (semantic color/status/spell/rarity/grayscale + type + elevation + z-stack + motion + fonts) → Task 2.
- ✅ Component primitives Panel/Button/Slot/StatBar/Icon/Toast/Tooltip → Tasks 8-13.
- ✅ i18n `t()` layer + locale toggle → Tasks 6,14.
- ✅ Lock fonts (Lilita One + Space Grotesk eager; 得意黑 + PuHuiTi lazy) → Tasks 5,7.
- ✅ CJK lazy-load via Font-Loading-API on toggle → Task 7.
- ✅ Primitives-showcase capture state (bilingual) → Tasks 15,16,17.
- ✅ Bold-flat carry-forward polish (legendary≠trim-gold; gold Equip CTA + 4px ink + offset; uniform 4px ink) → Tasks 2,9,10,15.
- ✅ English-default + zh toggle; English users fetch zero CJK → Tasks 6,7.
- ✅ Keep S1-A static reporters as burn-down gates; add the primitives-no-hex gate → Task 16. (The deferred zero-emoji + single-language hard gates stay `.todo` — they flip in M2/M3, NOT M1.)

**2. Placeholder scan:** No TBD/TODO-implement/"add error handling" left. Font acquisition has explicit URLs + a BLOCKED fallback. The one acknowledged scope-flex is the PuHuiTi-vs-Noto body stand-in (Task 7) — explicitly flagged with a code-invariant family name so the swap is file-only.

**3. Type/name consistency:** token keys (`UI.color.*`, `UI.radius`, `UI.z`, `UI.type.family.*`) match cssVars `--ui-*` names match Tailwind config refs match the parity test — and the parity test (Task 4) mechanically enforces it. Primitive prop names (`variant`/`rarity`/`selected`/`kind`/`value`/`max`/`name`/`size`/`status`) are consistent between each component and its test. `font-body-cjk`/`font-display-cjk`/`text-spell-*`/`bg-rarity-*` are referenced statically in the showcase so Tailwind JIT emits them.

**Risk register:**
- *Tailwind doesn't emit a dynamically-named class* → all token classes are referenced STATICALLY (showcase + tests), never string-built, so JIT picks them up. ✅
- *applyThemeVars regresses existing baselines* → M1 is additive; `body` font untouched; verified at Tasks 5 + 17 Step 4. ✅
- *ESM/CJS interop* → sidestepped (config is literal `.cjs` + parity test). ✅
- *Font download failure* → explicit BLOCKED protocol (Task 7). ✅

---

## Execution Handoff

Plan saved. Execution = **Subagent-Driven Development** (superpowers:subagent-driven-development), the established Crafty rhythm — fresh Opus-4.8 implementer per task + spec-compliance review + code-quality review, sequential (never parallel — shared-file edits), continuous (no check-in pauses). Controller owns Tasks 18-19 (human-visual re-baseline + merge). Kevin reviews the showcase PNGs on wake.
