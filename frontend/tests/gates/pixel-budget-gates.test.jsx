// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TIERS } from '../../src/render/quality.js';
import { pixelBudgetDpr, usePixelBudgetDpr, CAPTURE_DPR_CAP } from '../../src/render/pixelBudget.js';

/**
 * THE CANVAS SPENDS A PIXEL BUDGET, NOT A PIXEL RATIO (plan 2026-10-27-crafty-steady-cool, item a; masterpiece 0g).
 *
 * Kevin's M3 Max ran its fans flat out. The canvas was `dpr={[1, q.dprCap]}` with dprCap 2 at high, so a 1728x1117 CSS
 * window drew 7.72 Mpx through every full-resolution pass, every frame. A RATIO says nothing about cost: the same 2 is
 * 0.6 Mpx on a phone and 14.7 Mpx on a 5K display. So each tier now names the pixels it can afford, and the dpr is
 * whatever spends that budget on this window: clamp(min(cap, devicePixelRatio, sqrt(budgetPx / cssPx)), 1, cap).
 *
 * The reference screens are chosen to vary along EVERY term of that formula (gates-and-probes 3b): a window where the
 * BUDGET binds (the M3 Max), one where the CAP binds (iPad Pro 11, a phone), one where the NATIVE ratio binds (a 1080p
 * monitor), one where the floor of 1 binds (a 4K window at dpr 1), and the 5K case where the budget binds hard.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/quality.js, see the commit for the receipts:
 *   B1 the sqrt dropped (budget/css used as a ratio)            -> RED expected (the M3 Max case)
 *   B2 devicePixelRatio left out of the min                     -> RED expected (the 1080p case draws above native)
 *   B3 the lower clamp of 1 removed                             -> RED expected (the 4K-at-dpr-1 case)
 *   B4 plausible-wrong: the budget compared against DEVICE pixels (css x dpr^2) instead of CSS pixels -> RED expected
 *   B5 the resize listener removed from usePixelBudgetDpr        -> RED expected (the resize case)
 *   B0 identity (a comment edit)                                -> must SURVIVE
 */

const M3_MAX_WINDOW = { cssWidth: 1728, cssHeight: 1117, devicePixelRatio: 2 };
const IPAD_PRO_11 = { cssWidth: 1194, cssHeight: 834, devicePixelRatio: 2 };
const PHONE = { cssWidth: 390, cssHeight: 844, devicePixelRatio: 3 };
const MONITOR_1080 = { cssWidth: 1920, cssHeight: 1080, devicePixelRatio: 1 };
const MONITOR_4K_DPR1 = { cssWidth: 3840, cssHeight: 2160, devicePixelRatio: 1 };
const DISPLAY_5K = { cssWidth: 2560, cssHeight: 1440, devicePixelRatio: 2 };

const drawn = (s, dpr) => s.cssWidth * dpr * s.cssHeight * dpr;

describe('pixelBudgetDpr — the dpr that spends the tier budget on this window', () => {
  it('every tier declares a budget and a cap, ordered high > med > low', () => {
    const tiers = ['low', 'med', 'high'];
    expect(tiers.every((t) => TIERS[t])).toBe(true);
    for (const t of tiers) {
      expect(TIERS[t].budgetPx, `TIERS.${t}.budgetPx`).toBeGreaterThan(0);
      expect(TIERS[t].dprCap, `TIERS.${t}.dprCap`).toBeGreaterThanOrEqual(1);
    }
    expect(TIERS.high.budgetPx).toBeGreaterThan(TIERS.med.budgetPx);
    expect(TIERS.med.budgetPx).toBeGreaterThan(TIERS.low.budgetPx);
    expect(TIERS.high.dprCap).toBeGreaterThan(TIERS.med.dprCap);
    expect(TIERS.med.dprCap).toBeGreaterThan(TIERS.low.dprCap);
  });

  it('the M3 Max window at high spends the budget, not 7.7 Mpx — the budget binds', () => {
    const dpr = pixelBudgetDpr({ tier: 'high', ...M3_MAX_WINDOW });
    expect(dpr).toBeCloseTo(Math.sqrt(4.2e6 / (1728 * 1117)), 3); // 1.475
    expect(drawn(M3_MAX_WINDOW, dpr) / 1e6).toBeCloseTo(4.2, 2);
    expect(drawn(M3_MAX_WINDOW, 2) / drawn(M3_MAX_WINDOW, dpr), 'the old dpr 2 drew this many times the budget').toBeGreaterThan(1.8);
    // med spends its own smaller budget on the same window
    expect(drawn(M3_MAX_WINDOW, pixelBudgetDpr({ tier: 'med', ...M3_MAX_WINDOW })) / 1e6).toBeCloseTo(2.8, 2);
  });

  it('an iPad Pro 11 gets each tier cap — the cap binds on a small screen', () => {
    expect(pixelBudgetDpr({ tier: 'low', ...IPAD_PRO_11 })).toBe(1.25);
    expect(pixelBudgetDpr({ tier: 'med', ...IPAD_PRO_11 })).toBe(1.5);
    expect(pixelBudgetDpr({ tier: 'high', ...IPAD_PRO_11 })).toBe(1.75);
    expect(pixelBudgetDpr({ tier: 'high', ...PHONE }), 'a dpr-3 phone at high').toBe(1.75);
  });

  it('never draws above the native ratio — a 1080p monitor stays at 1 at every tier', () => {
    for (const tier of ['low', 'med', 'high']) {
      expect(pixelBudgetDpr({ tier, ...MONITOR_1080 }), tier).toBe(1);
    }
  });

  it('never drops below 1, even when a large dpr-1 window is over budget', () => {
    expect(pixelBudgetDpr({ tier: 'low', ...MONITOR_4K_DPR1 })).toBe(1);
    expect(pixelBudgetDpr({ tier: 'high', ...MONITOR_4K_DPR1 })).toBe(1);
  });

  it('a 5K display at high draws ~4.2 Mpx (dpr ~1.07), not 14.7', () => {
    const dpr = pixelBudgetDpr({ tier: 'high', ...DISPLAY_5K });
    expect(dpr).toBeCloseTo(Math.sqrt(4.2e6 / (2560 * 1440)), 3);
    expect(dpr).toBeGreaterThan(1);
  });

  it('an unknown tier falls back to low; a missing devicePixelRatio reads as 1', () => {
    expect(pixelBudgetDpr({ tier: 'ultra', ...IPAD_PRO_11 })).toBe(1.25);
    expect(pixelBudgetDpr({ tier: 'high', cssWidth: 1194, cssHeight: 834 })).toBe(1);
  });

  it('capture keeps the cap its baselines were shot under', () => {
    expect(CAPTURE_DPR_CAP).toBe(2);
  });
});

describe('usePixelBudgetDpr — recomputed on resize and on a tier change', () => {
  const setWindow = ({ cssWidth, cssHeight, devicePixelRatio }) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: cssWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: cssHeight });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: devicePixelRatio });
  };
  afterEach(() => setWindow({ cssWidth: 1024, cssHeight: 768, devicePixelRatio: 1 }));

  it('follows the window: an iPad-sized window, then the M3 Max window, then a tier step', () => {
    setWindow(IPAD_PRO_11);
    const { result, rerender } = renderHook(({ tier }) => usePixelBudgetDpr(tier), { initialProps: { tier: 'high' } });
    expect(result.current, 'the first read is the iPad cap').toBe(1.75);
    act(() => {
      setWindow(M3_MAX_WINDOW);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current, 'a resize did not recompute the dpr').toBeCloseTo(1.475, 3);
    rerender({ tier: 'med' });
    expect(result.current, 'a tier step did not recompute the dpr').toBeCloseTo(1.2044, 3);
  });
});
