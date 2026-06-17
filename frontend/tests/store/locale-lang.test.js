// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// M6 #5 (a11y/SEO): index.html is static lang="en"; setLocale flipped the i18n table + CJK fonts but never
// updated document.documentElement.lang, so screen readers + the page reported English under zh-CN. The
// locale values ('en' / 'zh-CN') are valid BCP-47 lang codes, so setLocale now mirrors them onto <html>.
describe('M6 #5 html lang syncs with the UI locale', () => {
  it('setLocale updates document.documentElement.lang', () => {
    useGameStore.getState().setLocale('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    useGameStore.getState().setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('an unknown locale falls back to en on both the store and <html>', () => {
    useGameStore.getState().setLocale('fr');
    expect(useGameStore.getState().locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
