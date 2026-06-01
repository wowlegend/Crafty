import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_KEYS, MAGIC, DANGER_STATES } from '../../src/theme/tokens.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('palette tokens', () => {
  it('every palette state defines every required key as a valid hex', () => {
    for (const state of ['explore', ...DANGER_STATES]) {
      for (const key of PALETTE_KEYS) {
        expect(PALETTE[state]?.[key], `${state}.${key}`).toMatch(HEX);
      }
    }
  });

  it('danger states share EXACTLY the explore keys (lerp-safety: no undefined mid-lerp)', () => {
    const exploreKeys = Object.keys(PALETTE.explore).sort();
    for (const state of DANGER_STATES) {
      expect(Object.keys(PALETTE[state]).sort(), state).toEqual(exploreKeys);
    }
  });

  it('magic palette covers all elements + default', () => {
    for (const el of ['fire', 'ice', 'lightning', 'arcane', 'nature', 'default']) {
      expect(MAGIC[el], el).toMatch(HEX);
    }
  });

  it('explore keys match PALETTE_KEYS exactly (no silent key escaping the validity sweep)', () => {
    expect(Object.keys(PALETTE.explore).sort()).toEqual([...PALETTE_KEYS].sort());
  });
});

import { UI, RARITY_FILL } from '../../src/theme/tokens.js';

describe('UI design-system tokens (S1-C bold-flat)', () => {
  const HEX6 = /^#[0-9A-Fa-f]{6}$/;

  it('ink is the locked near-black', () => {
    expect(UI.color.ink).toBe('#0B0E14');
  });

  it('the navy surface ladder matches the locked comp (lighter slate)', () => {
    expect(UI.color.panel).toBe('#16213A');
    expect(UI.color.slot).toBe('#233458');
    expect(UI.color.panelFrame).toBe('#1C2942');
    expect(UI.color.control).toBe('#2A3C61');
    expect(UI.color.track).toBe('#0A0F1A');
  });

  it('every color leaf is a valid 6-digit hex', () => {
    const walk = (o) => Object.values(o).forEach((v) =>
      typeof v === 'string' ? expect(v, v).toMatch(HEX6) : walk(v));
    walk(UI.color);
  });

  it('rarity has the 4 locked tiers and legendary is distinct from the trim gold', () => {
    expect(Object.keys(UI.color.rarity).sort())
      .toEqual(['common', 'epic', 'legendary', 'rare']);
    expect(UI.color.rarity.legendary).not.toBe(UI.color.accent);
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
      expect(s).toMatch(/^\d+px \d+px 0 0 /);
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
    expect(UI.border.chrome).toBe(4);
    expect(UI.motion.duration.base).toBeGreaterThan(0);
    expect(UI.motion.easing.standard).toMatch(/cubic-bezier/);
  });

  it('RARITY_FILL has the 5 tiers, each a 2-stop hex gradient + ring + icon', () => {
    expect(Object.keys(RARITY_FILL).sort())
      .toEqual(['common', 'epic', 'gear', 'legendary', 'rare']);
    for (const [tier, fill] of Object.entries(RARITY_FILL)) {
      expect(fill.from, `${tier}.from`).toMatch(HEX6);
      expect(fill.to, `${tier}.to`).toMatch(HEX6);
      expect(typeof fill.ring, `${tier}.ring`).toBe('string');
      expect(fill.ring.length, `${tier}.ring`).toBeGreaterThan(0);
      expect(typeof fill.icon, `${tier}.icon`).toBe('string');
      expect(fill.icon.length, `${tier}.icon`).toBeGreaterThan(0);
    }
  });
});
