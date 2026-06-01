import { useGameStore } from '../store/useGameStore.jsx';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Slot, StatBar, SpellRing, Icon } from './primitives/index.js';
import { LocaleToggle } from './LocaleToggle.jsx';
import sceneBg from './showcase-scene.png';

// DEV-only full-screen recreation of the LOCKED final-A inventory scene — the HUD
// over the game world + the centered Inventory modal — composed entirely from our
// bold-flat primitives + Tailwind tokens (NOT the mockup's raw CSS). This is the
// artifact compared side-by-side to .superpowers/s1c-mockups/v2/final-A-en.png, so it
// must MATCH the comp's composition, content + warmth in BOTH locales. Driven by the
// visual-regression harness (window.__craftyTest 'showPrimitivesShowcase').
//
// NO hardcoded hex anywhere EXCEPT the tiny paper-doll avatar body colors (character
// art, mirroring mockup.html's `.ava` — head/torso/legs/etc). Those are commented.

// Paper-doll avatar voxel-body colors (CHARACTER ART, not chrome — mirrors mockup .ava).
const AVA = {
  head: '#E8C07A',  // skin
  torso: '#6E4A30', // tunic
  belt: '#3A2A1E',
  leg: '#2F4F7E',   // trousers
  arm: '#5A3C26',
  eye: '#1B2740',
};

export function PrimitivesShowcase() {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const cjk = locale === 'zh-CN';
  const displayFont = cjk ? 'font-display-cjk' : 'font-display';
  const bodyFont = cjk ? 'font-body-cjk' : 'font-body';

  // Item grid — mirrors the mockup's exact rarity/icon/count set (final-A source).
  const items = [
    { rarity: 'legendary', icon: 'sword', selected: true },
    { rarity: 'epic', icon: 'dagger' },
    { rarity: 'rare', icon: 'mace' },
    { rarity: 'common', icon: 'bow' },
    { rarity: 'epic', icon: 'necklace' },
    { rarity: 'rare', icon: 'potion', count: '3' },
    { rarity: 'common', icon: 'apple', count: '12' },
    { rarity: 'legendary', icon: 'scroll' },
    { rarity: 'common', icon: 'coins', count: '99' },
    { rarity: 'rare', icon: 'rune' },
    { rarity: 'epic', icon: 'magic' },
    { rarity: 'common', icon: 'pickaxe' },
  ];
  // 6 gear slots (paper doll) — all gold-filled (mockup .gslot.filled).
  const gear = ['helmet', 'chest', 'sword', 'shield', 'legs', 'boots'];
  // Hotbar — plain slot tiles (slate fill); slot 1 selected; per-icon tint colors
  // (mockup .hotbar: gold sword, silver bow, blue pickaxe, fire potion, nature apple,
  // arcane rune); potion + apple carry count badges.
  const hotbar = [
    { icon: 'sword', selected: true, tint: 'text-accent-raise' },
    { icon: 'bow', tint: 'text-text-muted' },
    { icon: 'pickaxe', tint: 'text-info' },
    { icon: 'potion', count: '3', tint: 'text-spell-fire' },
    { icon: 'apple', count: '12', tint: 'text-spell-nature' },
    { icon: 'rune', tint: 'text-spell-arcane' },
  ];
  // Stat rows — colored game-icon + label + tabular value (mockup .stat).
  const stats = [
    { icon: 'sword', tint: 'text-stat-atk', k: 'stat.atk', v: '148', up: '+15' },
    { icon: 'shield', tint: 'text-stat-def', k: 'stat.def', v: '92' },
    { icon: 'run', tint: 'text-stat-spd', k: 'stat.spd', v: '110' },
    { icon: 'force', tint: 'text-stat-crit', k: 'stat.crit', v: '24%' },
  ];

  return (
    <div data-testid="showcase-root" className={`fixed inset-0 z-dev-overlay overflow-hidden ${bodyFont} text-text`}>
      {/* ── Scene backdrop (the game world) + readability scrim ── */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${sceneBg})` }}
      />
      {/* scrim — radial vignette + vertical fade, like mockup.html's .scrim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 42%, rgba(8,11,20,0) 30%, rgba(8,11,20,.34) 72%, rgba(8,11,20,.6) 100%),' +
            'linear-gradient(180deg, rgba(8,11,20,.30) 0%, rgba(8,11,20,.08) 22%, rgba(8,11,20,.10) 70%, rgba(8,11,20,.46) 100%)',
        }}
      />

      {/* ════════════════════ HUD LAYER ════════════════════ */}
      {/* top-left: identity + bars */}
      <div className="absolute top-5 left-5 flex flex-col gap-2.5 w-[336px]">
        <Panel variant="base" className="flex items-center gap-3 p-3">
          {/* LV badge — gold gradient sticker (uses accent gradient, ink frame) */}
          <div
            className="flex-none w-[54px] h-[54px] grid place-items-center rounded-md border-chrome border-ink shadow-elev-md text-text-inverse leading-none"
            style={{ background: 'linear-gradient(180deg, rgb(var(--ui-accent-raise)), rgb(var(--ui-accent-deep)))' }}
          >
            <span className={`${displayFont} text-xl tabular-nums`}>27</span>
            <span className="text-[9px] font-bold tracking-widest opacity-85 mt-0.5">{t('ui.level_short')}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className={`${displayFont} text-lg leading-tight`}>{t('ui.name_kaelos')}</div>
            {/* XP bar — thin gold track, 68% fill (mockup .xpwrap) */}
            <div className="mt-1.5 h-2.5 rounded-md bg-track border-chrome border-ink overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 w-[68%]"
                style={{ background: 'linear-gradient(90deg, rgb(var(--ui-accent-deep)), rgb(var(--ui-accent-raise)))' }}
              />
            </div>
            <div className="text-xs text-text-muted mt-1 tracking-wide">
              {t('ui.xp')}&nbsp;&nbsp;<span className="tabular-nums">3,420</span> / <span className="tabular-nums">5,000</span>
            </div>
          </div>
        </Panel>

        <Panel variant="base" className="flex flex-col gap-1.5 p-3">
          <StatBar kind="health" icon="health" value={84} max={100} showValue className="w-full" />
          <StatBar kind="mana" icon="water" value={62} max={100} showValue className="w-full" />
          <StatBar kind="hunger" icon="meat" value={73} max={100} showValue className="w-full" />
        </Panel>
      </div>

      {/* top-center: achievement toast */}
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2">
        <Panel variant="base" className="flex items-center gap-3 pl-3.5 pr-6 py-3 max-w-[540px]">
          {/* star badge — gold sticker */}
          <div
            className="flex-none w-[42px] h-[42px] grid place-items-center rounded-md border-chrome border-ink shadow-elev-md text-text-inverse"
            style={{ background: 'radial-gradient(circle at 38% 32%, rgb(var(--ui-accent-raise)), rgb(var(--ui-accent-deep)))' }}
          >
            <Icon name="star" size={24} />
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[2px] uppercase text-accent">{t('showcase.achv_label')}</div>
            <div className="text-md font-bold mt-px">
              {t('showcase.achv_title')}&nbsp;·&nbsp;<b className="text-accent-raise">+250 XP</b>
            </div>
          </div>
        </Panel>
      </div>

      {/* top-right: locale chip + minimap + system buttons */}
      <div className="absolute top-5 right-5 flex flex-col gap-2.5 items-end">
        <LocaleToggle />
        <div className="flex gap-2.5 items-start">
          {/* minimap — inset well + N + player dot + blips */}
          <Panel variant="base" className="relative w-[140px] h-[140px] overflow-hidden p-0">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(60% 55% at 38% 40%, rgb(var(--ui-spell-nature)) 0%, rgb(var(--ui-well)) 60%, rgb(var(--ui-panel-inset)) 100%)',
                opacity: 0.85,
              }}
            />
            {/* player marker (gold) */}
            <div
              className="absolute left-1/2 top-1/2 w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 bg-accent-raise"
              style={{ boxShadow: '0 0 0 3px rgba(11,14,20,.9)' }}
            />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-danger" style={{ left: '30%', top: '34%' }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-danger" style={{ left: '66%', top: '60%' }} />
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-xs font-bold tracking-widest text-accent-raise">
              {t('showcase.minimap_n')}
            </div>
            <div className="absolute bottom-1.5 right-2 text-[10px] font-bold tabular-nums text-text" style={{ textShadow: '0 1px 2px #000' }}>
              X 248 · Z -112
            </div>
          </Panel>
          <div className="flex flex-col gap-2.5">
            <Button variant="secondary" size="sm" aria-label={t('ui.settings')} className="w-[42px] h-[42px] p-0 text-text-muted">
              <Icon name="compass" size={20} />
            </Button>
            <Button variant="secondary" size="sm" aria-label={t('ui.settings')} className="w-[42px] h-[42px] p-0 text-text-muted">
              <Icon name="settings" size={20} />
            </Button>
          </div>
        </div>
      </div>

      {/* bottom-center: hotbar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
        <Panel variant="base" className="flex gap-2 p-2.5">
          {hotbar.map((h, i) => (
            <Slot key={i} selected={h.selected} className="w-[62px]">
              <Icon name={h.icon} size={36} className={h.tint} />
              <span className="absolute top-1 left-1.5 text-[11px] font-bold text-text-muted tabular-nums">{i + 1}</span>
              {h.count && (
                <span className="absolute bottom-1 right-1.5 text-[13px] font-bold text-text tabular-nums" style={{ textShadow: '0 1px 2px #000' }}>
                  {h.count}
                </span>
              )}
            </Slot>
          ))}
        </Panel>
      </div>

      {/* bottom-right: spell selector — fire ACTIVE (dominant warm glow) */}
      <div className="absolute bottom-6 right-6 flex gap-3.5 items-end">
        {[
          { spell: 'fire', icon: 'fire', key: 'Q', active: true },
          { spell: 'ice', icon: 'ice', key: 'E' },
          { spell: 'lightning', icon: 'lightning', key: 'R' },
          { spell: 'arcane', icon: 'magic', key: 'F' },
        ].map((s) => (
          <div key={s.spell} className="relative flex flex-col items-center">
            <span className={`${displayFont} absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold whitespace-nowrap text-text-muted`}>
              {t(`spell.${s.spell}`)}
            </span>
            <SpellRing spell={s.spell} active={s.active} keyLabel={s.key} size={64}>
              <Icon name={s.icon} size={34} />
            </SpellRing>
          </div>
        ))}
      </div>

      {/* ════════════════════ MODAL LAYER ════════════════════ */}
      <div className="absolute inset-0 grid place-items-center">
        <Panel variant="raise" className="w-[884px] overflow-hidden shadow-elev-xl p-0">
          {/* header bar — title + Backpack sub + close */}
          <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
            <div className="flex items-baseline gap-3">
              <span className={`${displayFont} text-xxl tracking-wide`}>{t('ui.inventory')}</span>
              <span className="text-xs font-bold tracking-[2px] uppercase text-accent">{t('ui.backpack')}</span>
            </div>
            <Button variant="secondary" size="sm" aria-label={t('ui.close')} className="w-9 h-9 p-0 text-text-muted">
              <Icon name="close" size={18} />
            </Button>
          </div>

          {/* body — 3 columns: paper doll · item grid · stats/cta */}
          <div className="grid grid-cols-[228px_1fr_214px] gap-[18px] px-5 pt-5 pb-[22px]">
            {/* ── left: paper doll + gear ── */}
            <div className="flex flex-col gap-3">
              <Panel variant="inset" className="relative h-[228px] bg-well grid place-items-center overflow-hidden">
                {/* voxel hero silhouette (character art — inline colors, mirrors mockup .ava) */}
                <div className="relative w-24 h-[170px]">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[46px] h-[46px] rounded-md" style={{ background: AVA.head }}>
                    <div className="absolute top-5 left-3.5 w-[7px] h-[9px] rounded-sm" style={{ background: AVA.eye }} />
                    <div className="absolute top-5 right-3.5 w-[7px] h-[9px] rounded-sm" style={{ background: AVA.eye }} />
                  </div>
                  <div className="absolute top-[54px] left-1.5 w-[18px] h-12 rounded-md" style={{ background: AVA.arm }} />
                  <div className="absolute top-[54px] right-1.5 w-[18px] h-12 rounded-md" style={{ background: AVA.arm }} />
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[60px] h-16 rounded-md" style={{ background: AVA.torso }} />
                  <div className="absolute top-[104px] left-1/2 -translate-x-1/2 w-[62px] h-3" style={{ background: AVA.belt }} />
                  <div className="absolute top-[116px] left-[18px] w-6 h-[54px] rounded-md" style={{ background: AVA.leg }} />
                  <div className="absolute top-[116px] right-[18px] w-6 h-[54px] rounded-md" style={{ background: AVA.leg }} />
                </div>
              </Panel>
              <div className="grid grid-cols-3 gap-2.5">
                {gear.map((g, i) => (
                  <Slot key={i} gear className="w-full">
                    <Icon name={g} size={30} />
                  </Slot>
                ))}
              </div>
            </div>

            {/* ── center: item grid ── */}
            <div className="flex flex-col">
              <div className={`${displayFont} text-sm font-bold tracking-[2px] uppercase text-text-muted mb-2.5`}>
                {t('ui.items')}&nbsp;&nbsp;<span className="tabular-nums text-accent">12 / 24</span>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {items.map((it, i) => (
                  <Slot key={i} rarity={it.rarity} selected={it.selected} className="w-full">
                    <Icon name={it.icon} size={42} />
                    {it.count && (
                      <span className="absolute bottom-1 right-1.5 text-[13px] font-bold text-text tabular-nums" style={{ textShadow: '0 1px 2px #000' }}>
                        {it.count}
                      </span>
                    )}
                  </Slot>
                ))}
                {Array.from({ length: 4 }).map((_, i) => (
                  <Slot key={`empty-${i}`} className="w-full opacity-50" />
                ))}
              </div>
            </div>

            {/* ── right: stats + gold + equip cta ── */}
            <div className="flex flex-col gap-3.5">
              <Panel variant="base" className="bg-slot px-4 py-4">
                <div className={`${displayFont} text-xs font-bold tracking-[2px] uppercase text-accent mb-3`}>{t('ui.stats')}</div>
                {stats.map((s, i) => (
                  <div key={s.k} className={`flex items-center gap-2.5 ${i < stats.length - 1 ? 'mb-3' : ''}`}>
                    <Icon name={s.icon} size={20} className={`flex-none ${s.tint}`} />
                    <span className="flex-1 text-sm text-text-muted font-semibold tracking-wide">{t(s.k)}</span>
                    <span className={`${displayFont} text-md tabular-nums`}>{s.v}</span>
                    {s.up && <span className="text-xs font-bold text-success ml-0.5 tabular-nums">{s.up}</span>}
                  </div>
                ))}
              </Panel>
              <Panel variant="base" className="bg-slot px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Icon name="coins" size={20} className="flex-none text-accent-raise" />
                  <span className="flex-1 text-sm text-text-muted font-semibold tracking-wide">{t('ui.gold')}</span>
                  <span className={`${displayFont} text-md tabular-nums text-accent-raise`}>1,280</span>
                </div>
              </Panel>
              <Button variant="primary" size="lg" className="w-full h-[54px] gap-2.5">
                <Icon name="upgrade" size={22} />
                {t('ui.equip')}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
