import { useGameStore } from '../store/useGameStore.jsx';
import { STRINGS } from './strings.js';

/** @internal Exported for the tests that enumerate it. */
export const LOCALES = ['en', 'zh-CN'];

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Translate `key` in `locale`, whatever the store holds: the English a save keeps, or a fixed locale. Fallback:
 *  locale -> en -> key. */
export function tIn(locale, key, vars) {
  const table = STRINGS[locale] || STRINGS.en;
  const raw = key in table ? table[key] : (key in STRINGS.en ? STRINGS.en[key] : key);
  return interpolate(raw, vars);
}

/** Translate `key` for the current store locale. Fallback: locale -> en -> key. */
export function t(key, vars) {
  return tIn(useGameStore.getState().locale || 'en', key, vars);
}

/** React hook: re-renders the component on locale change and returns a bound t. */
export function useT() {
  useGameStore((s) => s.locale); // subscribe -> re-render on toggle
  return t;
}
