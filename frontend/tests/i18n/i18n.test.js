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
