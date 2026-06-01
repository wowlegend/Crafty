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
