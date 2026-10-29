import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store/useGameStore';
import { useGameSounds } from '../../SoundManager';
import { Panel, Button, Icon, Toast, Modal } from '../primitives/index.js';
import { useT } from '../../i18n/i18n.js';
import { BLOCK_TYPES } from '../../world/Blocks';
import { forgeOffers, bestBlade, WEAPON_LINE } from '../../game/forge.js';
import { relicTier, RELIC_MAX_TIER } from '../../game/relics.js';
import { ItemIcon } from './itemUi';
import { relicEffectText, TIER_NUMERAL } from '../relicText.js';

// Mara's Forge (DECISIONS 2026-10-28 W1-H item 7; 2026-10-29 items 60-65): one card listing what she can make now, each
// line with its price beside what the player holds. A purchase the player cannot pay for is still pressable, so the
// press says what is short instead of a dead button; game/forge.js decides what is listed and what a purchase spends.

const nameOf = (key) => BLOCK_TYPES[key]?.name || key;

/**
 * How long a row's Buy rests, disabled where the player sees it, after a purchase on that row. A bought blade or
 * relic tier is replaced on the spot by the line's next offer, so the second click of a double press would buy that
 * too; the two clicks of a double press fall inside the system's double-click time, which defaults to 500 ms on
 * Windows (SetDoubleClickTime), and a rest no longer than that leaves deliberate repeat purchases of goods unhurried.
 */
const BUY_REPEAT_MS = 500;

// A row as the rest counts it: the weapon and relic lines are one row each whatever they offer, each good its own.
const rowOf = (offer) => (offer.line === 'goods' ? offer.id : offer.line);

function offerTitle(t, offer) {
  if (offer.line === 'weapon') {
    return offer.price.blade ? t('forge.reforge', { blade: offer.price.blade, give: offer.give }) : t('forge.forgeNew', { give: offer.give });
  }
  if (offer.line === 'relic') return t('forge.temper', { relic: offer.give, tier: TIER_NUMERAL[offer.tier] });
  return t('forge.make', { count: offer.count, give: nameOf(offer.give) });
}

/** One price part as the card shows it: what it takes, and what the player holds of it. */
function priceParts(t, state, offer) {
  const held = (key) => Math.max(0, Math.floor(Number(state.inventory?.blocks?.[key])) || 0);
  const parts = Object.entries(offer.price.blocks).map(([key, need]) => ({ key, need, have: held(key), label: nameOf(key) }));
  if (offer.price.coins > 0) {
    parts.push({ key: 'coins', need: offer.price.coins, have: Math.max(0, Math.floor(Number(state.coins)) || 0), label: t('forge.coins') });
  }
  return parts;
}

// A pointer press does not focus Buy, so Space or Enter pressed for the game cannot fire the last Buy clicked. Keyboard
// focus does not reach a Buy in the game (InputManager closes the Forge on Tab); a Buy focused some other way keeps its
// keys.
const keepFocus = (e) => e.preventDefault();

const OfferRow = ({ offer, state, onBuy, resting }) => {
  const t = useT();
  const parts = priceParts(t, state, offer);
  const title = offerTitle(t, offer);
  return (
    <Panel variant="inset" className="flex items-center justify-between gap-3 p-3" data-testid={`forge-offer-${offer.id}`}>
      <div className="flex items-center gap-3 min-w-0">
        <ItemIcon itemName={offer.give} size={30} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-display tracking-wide text-text">{title}</span>
          {offer.line === 'relic' && (
            <span className="text-xs text-text mt-0.5" data-testid={`forge-effect-${offer.id}`}>
              {t('forge.temperEffect', { effect: relicEffectText(t, offer.give, offer.tier) })}
            </span>
          )}
          <span className="text-xs mt-0.5 flex flex-wrap gap-x-2">
            {parts.map((p) => (
              <span key={p.key} data-testid={`forge-price-${offer.id}-${p.key}`} data-short={p.have < p.need ? 'true' : 'false'}
                className={p.have < p.need ? 'text-danger font-bold' : 'text-text-muted'}>
                {t('forge.held', { need: p.need, item: p.label, have: p.have })}
              </span>
            ))}
          </span>
        </div>
      </div>
      <Button variant={parts.every((p) => p.have >= p.need) ? 'primary' : 'secondary'} size="sm"
        aria-label={`${t('forge.buy')}: ${title}`} data-testid={`forge-buy-${offer.id}`} disabled={resting}
        onMouseDown={keepFocus} onClick={() => onBuy(offer)}>
        {t('forge.buy')}
      </Button>
    </Panel>
  );
};

const Section = ({ label, children }) => (
  <div className="space-y-2">
    <h3 className="font-display text-xs font-bold tracking-[2px] uppercase text-accent">{label}</h3>
    {children}
  </div>
);

const Note = ({ testId, children }) => (
  <Panel variant="inset" text="text-text-muted" className="p-3 text-xs" data-testid={testId}>{children}</Panel>
);

export const ForgePanel = React.memo(({ villager, onClose }) => {
  const t = useT();
  const state = useGameStore(useShallow((s) => ({
    inventory: s.inventory, coins: s.coins, equipment: s.equipment, relicTiers: s.relicTiers, buyForgeOffer: s.buyForgeOffer,
  })));
  const { playCraft } = useGameSounds();
  const [message, setMessage] = useState(null);
  const [resting, setResting] = useState(() => new Set());
  const restTimers = useRef(new Map());
  useEffect(() => {
    const timers = restTimers.current;
    return () => { for (const id of timers.values()) clearTimeout(id); };
  }, []);
  const rest = (row) => {
    setResting((s) => new Set(s).add(row));
    restTimers.current.set(row, setTimeout(() => {
      restTimers.current.delete(row);
      setResting((s) => { const next = new Set(s); next.delete(row); return next; });
    }, BUY_REPEAT_MS));
  };

  const offers = forgeOffers(state);
  const weapon = offers.find((o) => o.line === 'weapon');
  const relic = offers.find((o) => o.line === 'relic');
  const goods = offers.filter((o) => o.line === 'goods');
  const relicName = state.equipment?.relic;

  const onBuy = (offer) => {
    const r = state.buyForgeOffer(offer);
    if (r.ok) {
      rest(rowOf(offer));
      playCraft?.();
      setMessage({ ok: true, text: t('forge.bought', { give: offer.line === 'goods' ? nameOf(offer.give) : offer.give }) });
    } else if (r.reason === 'short') {
      const list = r.short.map((s) => t('forge.held', { need: s.need, item: s.key === 'coins' ? t('forge.coins') : nameOf(s.key), have: s.have })).join(', ');
      setMessage({ ok: false, text: t('forge.short', { list }) });
    }
  };

  return (
    <Modal className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" label={villager?.npcName || t('forge.title')} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
        data-testid="forge-panel"
      >
        <Panel variant="raise" className="relative overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
            <div className="flex items-center gap-3">
              <Icon name="hammer" size={22} className="text-accent" />
              <h2 className="font-display text-xl tracking-wide text-accent uppercase">{t('forge.title')}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm" data-testid="forge-coins">
                <Icon name="coins" size={14} className="text-accent" />
                <span className="font-display text-text tabular-nums">{Math.max(0, Math.floor(Number(state.coins)) || 0)}</span>
              </span>
              <Button variant="ghost" size="icon" text="text-text-muted" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9">
                <Icon name="close" size={18} />
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {message && (
              <Toast status={message.ok ? 'success' : 'danger'} className="w-full justify-center text-sm" data-testid="forge-message">
                {message.text}
              </Toast>
            )}
            {/* Each row is keyed by its offer, so a bought tier's button leaves with it: a button that held focus
                cannot buy the offer that replaced it. Tab does not reach a Buy in the game today (InputManager closes
                the Forge on it), so this guards a focus a later build allows. */}
            <Section label={t('forge.weapon')}>
              {weapon
                ? <OfferRow key={weapon.id} offer={weapon} state={state} onBuy={onBuy} resting={resting.has(rowOf(weapon))} />
                : <Note testId="forge-weapon-max">{t('forge.weaponMax', { blade: bestBlade(state) || WEAPON_LINE[WEAPON_LINE.length - 1] })}</Note>}
            </Section>
            <Section label={t('forge.relic')}>
              {relic
                ? <OfferRow key={relic.id} offer={relic} state={state} onBuy={onBuy} resting={resting.has(rowOf(relic))} />
                : relicName && relicTier(state.relicTiers, relicName) >= RELIC_MAX_TIER
                  ? <Note testId="forge-relic-max">{t('forge.relicMax', { relic: relicName })}</Note>
                  : <Note testId="forge-relic-none">{t('forge.noRelic')}</Note>}
            </Section>
            <Section label={t('forge.goods')}>
              {goods.map((o) => <OfferRow key={o.id} offer={o} state={state} onBuy={onBuy} resting={resting.has(rowOf(o))} />)}
            </Section>
          </div>
        </Panel>
      </motion.div>
    </Modal>
  );
});
