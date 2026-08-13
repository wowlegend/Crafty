/**
 * contrast.js — WCAG relative luminance and contrast ratio, over the design tokens.
 *
 * WHY THIS EXISTS. This repo has shipped unreadable text twice from the same cause: applying
 * `text-inverse` (#231708, documented in tokens.js as "text on gold fills") to text sitting on a DARK
 * surface. It was caught once by eye on the PAUSED overlay and written up in .claude/rules — and the
 * identical mistake sat 35 lines away on the title screen's controls strip, unnoticed, for months.
 *
 * MEASURED on the committed menu.png baseline before the fix: glyph rgb(29,19,8) against ground
 * rgb(16,12,8) is a contrast ratio of 1.07:1. WCAG AA wants 4.5:1 for normal text and 3.0:1 even for
 * large text. The first thing a new player reads was effectively invisible.
 *
 * NOTHING IN THIS REPO COULD SEE IT. Verified by grep 2026-08-12: zero occurrences of wcag,
 * contrastRatio or relativeLuminance across src, tests and scripts. A jsdom test asserts the text
 * EXISTS; the 6% pixel gate cannot distinguish invisible text from visible text, because both are
 * byte-identical to their own baseline. The defect is only visible to arithmetic or to an eye.
 *
 * Arithmetic is cheaper and does not get tired. Pure functions, no dependency, per WCAG 2.2 §1.4.3.
 */

/** WCAG 2.2 relative luminance of an sRGB colour. Accepts '#rgb', '#rrggbb', or [r,g,b] 0-255. */
export function relativeLuminance(color) {
  const [r, g, b] = toRgb(color);
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two colours. Symmetric; 1.0 (identical) to 21.0 (black on white). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Composite a foreground over a background at `alpha`, which is what an opacity suffix like
 * `text-text/85` actually renders. Skipping this overstates contrast for every translucent token —
 * and the defect that prompted this file used /75.
 */
export function composite(fg, bg, alpha) {
  const [fr, fg_, fb] = toRgb(fg);
  const [br, bg_, bb] = toRgb(bg);
  const a = Math.min(1, Math.max(0, alpha));
  return [
    Math.round(fr * a + br * (1 - a)),
    Math.round(fg_ * a + bg_ * (1 - a)),
    Math.round(fb * a + bb * (1 - a)),
  ];
}

/** WCAG 2.2 §1.4.3 thresholds. `large` is >=18.66px bold or >=24px. */
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3.0;

function toRgb(color) {
  if (Array.isArray(color)) return color;
  let h = String(color).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`contrast: "${color}" is not a hex colour or [r,g,b]`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
