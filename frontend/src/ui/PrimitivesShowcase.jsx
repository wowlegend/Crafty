import { useGameStore } from '../store/useGameStore.jsx';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Slot, StatBar, Icon, Toast, Tooltip } from './primitives/index.js';
import { LocaleToggle } from './LocaleToggle.jsx';

// DEV-only full-screen gallery proving the bold-flat system in BOTH locales. Driven
// by the visual-regression harness (window.__craftyTest 'showPrimitivesShowcase').
// English-primary; the zh-CN capture proves the i18n swap + CJK lazy-load render.
export function PrimitivesShowcase() {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const displayFont = locale === 'zh-CN' ? 'font-display-cjk' : 'font-display';
  const bodyFont = locale === 'zh-CN' ? 'font-body-cjk' : 'font-body';
  const rarities = ['common', 'rare', 'epic', 'legendary'];
  const spells = ['fire', 'ice', 'lightning', 'arcane'];

  return (
    <div className={`fixed inset-0 z-dev-overlay overflow-auto bg-panel-inset ${bodyFont} text-text p-8`}>
      <div className="flex items-center justify-between mb-8">
        <h1 className={`${displayFont} text-xxl text-accent`}>{t('showcase.title')}</h1>
        <LocaleToggle />
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-8 max-w-[1100px]">
        {/* LEFT: the locked inventory-card composition */}
        <Panel variant="raise" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`${displayFont} text-xl`}>{t('ui.inventory')}</h2>
            <Button variant="ghost" size="sm" aria-label={t('ui.close')}><Icon name="close" size={18} /></Button>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {rarities.map((r, i) => (
              <Slot key={r} rarity={r} selected={i === 3} className="w-full">
                <Icon name={['sword', 'shield', 'gem', 'sparkles'][i]} size={28} className="text-text" />
              </Slot>
            ))}
            {Array.from({ length: 4 }).map((_, i) => <Slot key={`e${i}`} className="w-full" />)}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[['stat.atk', 148], ['stat.def', 92], ['stat.spd', 110], ['stat.crit', 24]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-panel border-chrome border-ink rounded-sm px-2 py-1">
                <span className="text-text-muted text-sm">{t(k)}</span>
                <span className="tabular-nums text-text">{v}{k === 'stat.crit' ? '%' : ''}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-text-muted">{t('ui.gold')}</span>
            <span className="tabular-nums text-rarity-legendary text-lg">1,280</span>
          </div>
          <Button variant="primary" size="lg" className="w-full">{t('ui.equip')}</Button>
        </Panel>

        {/* RIGHT: primitive catalog */}
        <div className="space-y-6">
          <Panel className="p-4 space-y-2">
            <StatBar kind="health" value={78} max={100} showValue label={t('ui.health')} className="w-full" />
            <StatBar kind="mana" value={52} max={100} showValue label={t('ui.mana')} className="w-full" />
            <StatBar kind="hunger" value={90} max={100} showValue label={t('ui.hunger')} className="w-full" />
          </Panel>

          <Panel className="p-4 flex flex-wrap gap-3 items-center">
            <Button variant="primary">{t('ui.equip')}</Button>
            <Button variant="secondary">{t('ui.craft')}</Button>
            <Button variant="ghost"><Icon name="settings" size={18} />{t('ui.settings')}</Button>
            <Button variant="danger">{t('ui.unequip')}</Button>
          </Panel>

          <Panel className="p-4">
            <div className="grid grid-cols-4 gap-3">
              {rarities.map((r) => (
                <div key={r} className="flex flex-col items-center gap-1">
                  <Slot rarity={r} className="w-16"><Icon name="gem" size={28} className="text-text" /></Slot>
                  <span className="text-xs text-text-muted">{t(`rarity.${r}`)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4 flex gap-3">
            {spells.map((s) => (
              <div key={s} className={`grid place-items-center w-12 h-12 rounded-lg border-chrome border-ink bg-panel text-spell-${s}`}>
                <Icon name={s === 'arcane' ? 'sparkles' : s} size={26} />
              </div>
            ))}
          </Panel>

          <div className="flex gap-4 items-center">
            <Toast status="success">{t('showcase.toast')}</Toast>
            <Tooltip>{t('showcase.tooltip')}</Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
