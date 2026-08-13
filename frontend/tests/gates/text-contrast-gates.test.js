import { describe, it, expect } from 'vitest';
import { UI } from '../../src/theme/tokens.js';
import { contrastRatio, relativeLuminance, composite, WCAG_AA_NORMAL, WCAG_AA_LARGE } from '../../src/theme/contrast.js';

const C = UI.color;

// UNREADABLE TEXT HAS SHIPPED FROM THIS REPO TWICE, FROM THE SAME CAUSE.
//
// `textInverse` (#231708) is documented in tokens.js as "text on gold fills". Applied to text on a DARK
// surface it is invisible. That happened on the PAUSED overlay — caught by eye, written up in
// .claude/rules/gates-and-probes.md as "a green jsdom suite passed a PAUSED overlay rendering
// dark-brown-on-black" — and the IDENTICAL mistake sat 35 lines away on the title screen's controls
// strip and survived, because the fix was applied to the instance rather than to the class.
//
// MEASURED on the committed menu.png baseline before the fix: glyph rgb(29,19,8) on ground rgb(16,12,8),
// a ratio of 1.07:1 against a WCAG AA floor of 4.5:1. The first thing a new player reads.
//
// NO INSTRUMENT IN THIS REPO COULD SEE IT. Verified by grep: zero occurrences of wcag / contrastRatio /
// relativeLuminance anywhere in src, tests or scripts before this file. A jsdom test asserts the text
// EXISTS. The 6% pixel gate compares each frame to ITS OWN baseline, so invisible text is byte-identical
// to invisible text and passes forever. Only arithmetic or an eye can see this, and arithmetic is the
// one that runs on every push.
describe('WCAG contrast — the arithmetic', () => {
  it('matches the published reference values', () => {
    // Anchor the implementation to known-correct numbers before trusting it on our own tokens. Black on
    // white is exactly 21:1 by definition; a colour against itself is exactly 1:1.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    // WebAIM's worked example: #777777 on #ffffff is 4.48:1 — just under AA, which is why it is the
    // canonical example. If our maths drifts, this is the assertion that notices.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(WCAG_AA_NORMAL);
  });

  it('pins each WCAG coefficient individually, with CHROMATIC anchors', () => {
    // FOUND BY MUTATION: replacing the weighted sum with a plain average of the three channels left
    // every assertion above GREEN, because black, white and grey are achromatic — any symmetric
    // coefficient set produces identical answers for them. The gate could not detect a wrong luminance
    // formula, which is exactly the thing that would misjudge the coloured status pairs below.
    //
    // Pure primaries against white separate the coefficients: luminance IS the coefficient for each,
    // so these three numbers cannot all hold unless 0.2126 / 0.7152 / 0.0722 are all correct. Under a
    // plain average, red-on-white would read 2.74:1 instead of 4.00:1.
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.00, 2);
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2);
    // Green is the heaviest channel by far — a formula that treats the channels equally cannot produce
    // this ordering, and the ordering is what makes the status-colour assertions meaningful.
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'));
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });

  it('is symmetric and accepts the shorthand forms', () => {
    expect(contrastRatio('#0B0E14', '#ECECEF')).toBeCloseTo(contrastRatio('#ECECEF', '#0B0E14'), 10);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it('composites alpha, because an opacity suffix is what actually renders', () => {
    // `text-text/85` is not #ECECEF. Ignoring the alpha overstates contrast on every translucent token,
    // and the defect that prompted this file used /75.
    const solid = contrastRatio(C.text, C.ink);
    const faded = contrastRatio(composite(C.text, C.ink, 0.5), C.ink);
    expect(faded, 'compositing changed nothing — the alpha is being ignored').toBeLessThan(solid);
    expect(composite('#ffffff', '#000000', 1)).toEqual([255, 255, 255]);
    expect(composite('#ffffff', '#000000', 0)).toEqual([0, 0, 0]);
  });
});

// The pairs that actually render. Each is (foreground, background, alpha, minimum) — the minimum is the
// WCAG class the text belongs to, not a number tuned until it passed.
const PAIRS = [
  // Body text on every dark surface the UI paints.
  ['text on ink', C.text, C.ink, 1, WCAG_AA_NORMAL],
  ['text on panel', C.text, C.panel, 1, WCAG_AA_NORMAL],
  ['text on panelRaise', C.text, C.panelRaise, 1, WCAG_AA_NORMAL],
  ['text on panelInset', C.text, C.panelInset, 1, WCAG_AA_NORMAL],
  ['text on slot', C.text, C.slot, 1, WCAG_AA_NORMAL],
  // The title-screen controls strip that was 1.07:1. Its real rendered form, alpha included.
  ['text/85 on panelInset (title controls)', C.text, C.panelInset, 0.85, WCAG_AA_NORMAL],
  // Muted text is still text; it is used for descriptions and hints, not decoration.
  ['textMuted on panel', C.textMuted, C.panel, 1, WCAG_AA_NORMAL],
  ['textMuted on panelInset', C.textMuted, C.panelInset, 1, WCAG_AA_NORMAL],
  // The inverse token in its ONLY correct home: on gold fills.
  ['textInverse on accent (its documented use)', C.textInverse, C.accent, 1, WCAG_AA_NORMAL],
  // Status colours carry meaning, so they must be readable on the surfaces they appear on.
  ['accent on panel', C.accent, C.panel, 1, WCAG_AA_LARGE],
  ['danger on panel', C.danger, C.panel, 1, WCAG_AA_LARGE],
  ['success on panel', C.success, C.panel, 1, WCAG_AA_LARGE],
  ['warn on panel', C.warn, C.panel, 1, WCAG_AA_LARGE],
  ['info on panel', C.info, C.panel, 1, WCAG_AA_LARGE],
];

describe('every rendered text/surface pair clears its WCAG floor', () => {
  it('checks a real set of pairs', () => {
    expect(PAIRS.length, 'the pair list is empty — this suite asserts nothing').toBeGreaterThan(10);
  });

  for (const [name, fg, bg, alpha, floor] of PAIRS) {
    it(`${name} >= ${floor}:1`, () => {
      const rendered = alpha === 1 ? fg : composite(fg, bg, alpha);
      const r = contrastRatio(rendered, bg);
      expect(
        r,
        `${name} renders at ${r.toFixed(2)}:1, below the ${floor}:1 floor. This is the defect class that ` +
        `shipped the 1.07:1 title-screen controls strip — a pixel gate cannot see it, because invisible ` +
        `text is byte-identical to its own baseline.`,
      ).toBeGreaterThanOrEqual(floor);
    });
  }
});

describe('the inverse token is unreadable on every dark surface — the arithmetic half of the ban', () => {
  it('textInverse on ink / panel / panelInset / slot is BELOW even the large-text floor', () => {
    // The negative control that makes the usage ban non-arbitrary. If this ever passes, the token or the
    // surfaces changed and the ban should be revisited rather than kept out of habit. The USAGE half —
    // "and nobody is doing it" — lives in tests/scripts/text-inverse-usage.test.js, sited there because
    // it must read source and gate-shape freezes the source-grep population inside tests/gates/.
    for (const [name, surface] of [['ink', C.ink], ['panel', C.panel], ['panelInset', C.panelInset], ['slot', C.slot]]) {
      expect(
        contrastRatio(C.textInverse, surface),
        `textInverse on ${name} now CLEARS ${WCAG_AA_LARGE}:1 — the usage ban may be stale`,
      ).toBeLessThan(WCAG_AA_LARGE);
    }
  });
});
