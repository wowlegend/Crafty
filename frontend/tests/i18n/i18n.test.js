import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    const enOnly = Object.keys(STRINGS.en).find((k) => !(k in STRINGS['zh-CN']));
    if (enOnly) expect(t(enOnly)).toBe(STRINGS.en[enOnly]);
    expect(t('totally.missing.key')).toBe('totally.missing.key');
  });

  it('t() interpolates {vars}', () => {
    expect(t('ui.level', { n: 7 })).toContain('7');
  });

  it('zh-CN table covers every en key (no untranslated showcase string)', () => {
    for (const k of Object.keys(STRINGS.en)) expect(STRINGS['zh-CN'], k).toHaveProperty(k);
  });

  it('LOCALES lists the two supported locales', () => {
    expect(LOCALES).toEqual(['en', 'zh-CN']);
  });
});

describe('cjkFonts lazy loader', () => {
  it('is idempotent — injects the faces at most once', async () => {
    const added = [];
    const g = globalThis;
    g.document = g.document || {};
    g.document.fonts = { add: (f) => added.push(f), load: async () => {}, ready: Promise.resolve() };
    g.FontFace = class { constructor(family) { this.family = family; } async load() { return this; } };
    // Fresh module instance: earlier setLocale('zh-CN') calls already imported
    // cjkFonts and tripped its module-level _loaded flag in the bare-node env.
    vi.resetModules();
    const { loadCjkFonts, _cjkLoadedForTest } = await import('../../src/i18n/cjkFonts.js');
    await loadCjkFonts();
    const firstCount = added.length;
    expect(firstCount).toBeGreaterThan(0);
    await loadCjkFonts(); // second call must be a no-op
    expect(added.length).toBe(firstCount);
    expect(_cjkLoadedForTest()).toBe(true);
  });
});
