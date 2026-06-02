import { useGameStore } from '../store/useGameStore.jsx';
import { useT } from '../i18n/i18n.js';
import { Button } from './primitives/Button.jsx';

// The locale chip. Label shows the OTHER locale (en -> "中文", zh-CN -> "EN").
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
