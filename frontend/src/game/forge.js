/**
 * forge.js — Mara's Forge (DECISIONS 2026-10-28 W1-H item 7; 2026-10-29 items 60-63): what she can make for a player
 * state, each offer with its price in mined blocks and coins, and the purchase. Pure: no store, React or THREE.
 *
 * State: `{ inventory: { blocks, tools, magic }, coins, equipment, relicTiers }`, the store's own fields.
 * Offer: `{ id, line: 'weapon'|'relic'|'goods', give, count, tier?, price: { blocks: { key: n }, coins, blade? } }`.
 * The id names the tier it sells, so an offer bought or outgrown is no longer listed and cannot be bought again.
 */
import { RELIC_MAX_TIER, relicByName, relicTier } from './relics.js';

/** The blades the Forge reforges, weakest first (damage in game/equipment.js). */
export const WEAPON_LINE = Object.freeze(['sword', 'Stone Sword', 'Iron Sword', 'Diamond Sword']);

const price = (blocks, coins) => Object.freeze({ blocks: Object.freeze(blocks), coins });

// The price of making each blade. The sword is sold only to a player holding no blade at all.
const WEAPON_PRICE = Object.freeze({
  sword: price({ wood: 4 }, 0),
  'Stone Sword': price({ stone: 4 }, 10),
  'Iron Sword': price({ iron: 4 }, 30),
  'Diamond Sword': price({ diamond: 4 }, 80),
});

// The price of tempering a relic to each tier above I.
const RELIC_PRICE = Object.freeze({ 2: price({ gold: 3 }, 40), 3: price({ diamond: 3 }, 100) });

/**
 * The blocks no voxel generates or mines to, at the rates the crafting grid made them (one stone, one sand, eight wood
 * for a chest): the Forge is their only source.
 */
export const GOODS = Object.freeze([
  Object.freeze({ id: 'goods:chest', line: 'goods', give: 'chest', count: 1, price: price({ wood: 8 }, 0) }),
  Object.freeze({ id: 'goods:cobblestone', line: 'goods', give: 'cobblestone', count: 4, price: price({ stone: 4 }, 0) }),
  Object.freeze({ id: 'goods:glass', line: 'goods', give: 'glass', count: 4, price: price({ sand: 4 }, 0) }),
]);

// Every block some Forge price takes.
const MATERIALS = new Set([...Object.values(WEAPON_PRICE), ...Object.values(RELIC_PRICE), ...GOODS.map((g) => g.price)]
  .flatMap((p) => Object.keys(p.blocks)));

/** Does any Forge price take block `key`? */
export const isForgeMaterial = (key) => MATERIALS.has(key);

const BAGS = ['blocks', 'tools', 'magic'];

/** A count as the Forge reads it: floored, and 0 for anything not a positive finite number. */
const count = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const heldIn = (state, bag, key) => count(state?.inventory?.[bag]?.[key]);
const holdsBlade = (state, blade) => state?.equipment?.weapon === blade || BAGS.some((bag) => heldIn(state, bag, blade) > 0);

/** The highest blade on the line the player holds, in hand or in any bag, or null. */
export function bestBlade(state) {
  for (let i = WEAPON_LINE.length - 1; i >= 0; i--) if (holdsBlade(state, WEAPON_LINE[i])) return WEAPON_LINE[i];
  return null;
}

function weaponOffer(state) {
  const best = bestBlade(state);
  const next = WEAPON_LINE[best === null ? 0 : WEAPON_LINE.indexOf(best) + 1];
  if (!next) return null;
  const p = WEAPON_PRICE[next];
  return {
    id: `weapon:${next}`, line: 'weapon', give: next, count: 1, tier: WEAPON_LINE.indexOf(next),
    price: { blocks: p.blocks, coins: p.coins, blade: best },
  };
}

function relicOffer(state) {
  const name = state?.equipment?.relic;
  if (!relicByName(name)) return null;
  const tier = relicTier(state.relicTiers, name) + 1;
  if (tier > RELIC_MAX_TIER) return null;
  return { id: `relic:${name}:${tier}`, line: 'relic', give: name, count: 1, tier, price: RELIC_PRICE[tier] };
}

/** Every offer the Forge makes this player now: the weapon line's next blade, the worn relic's next tier, the goods. */
export function forgeOffers(state) {
  return [weaponOffer(state), relicOffer(state), ...GOODS].filter(Boolean);
}

/** What the player is short of for `offer`: one `{ key, need, have }` per block and for the coins, in price order. */
export function shortfall(state, offer) {
  const out = [];
  for (const [key, need] of Object.entries(offer?.price?.blocks || {})) {
    const have = heldIn(state, 'blocks', key);
    if (have < need) out.push({ key, need, have });
  }
  const coins = count(state?.coins);
  if (coins < (offer?.price?.coins || 0)) out.push({ key: 'coins', need: offer.price.coins, have: coins });
  const blade = offer?.price?.blade;
  if (blade && !holdsBlade(state, blade)) out.push({ key: blade, need: 1, have: 0 });
  return out;
}

/** Can the player pay for `offer` as it is listed? */
export function canAfford(state, offer) {
  return !!offer && shortfall(state, offer).length === 0;
}

// The equipItem rule for a displaced item: back into the bag that already keys it, else the blocks bag.
function stow(inventory, item) {
  const bag = BAGS.find((b) => inventory[b] && Object.prototype.hasOwnProperty.call(inventory[b], item)) || 'blocks';
  inventory[bag] = { ...inventory[bag], [item]: count(inventory[bag]?.[item]) + 1 };
}

/**
 * Buy `offer`. The price charged is the one `forgeOffers(state)` lists under the offer's id, never one carried on the
 * object passed in. Returns `{ ok: true, state }` with a new state that has spent exactly that price, or
 * `{ ok: false, state, short, reason }` with the same state object, unchanged: `reason` is 'stale' when the id is not
 * listed, 'short' when it cannot be paid (and `short` says what is missing).
 */
export function buy(state, offer) {
  const listed = offer ? forgeOffers(state).find((o) => o.id === offer.id) : null;
  if (!listed) return { ok: false, state, short: [], reason: 'stale' };
  const short = shortfall(state, listed);
  if (short.length) return { ok: false, state, short, reason: 'short' };

  const inventory = { ...state.inventory, blocks: { ...state.inventory.blocks } };
  for (const [key, need] of Object.entries(listed.price.blocks)) inventory.blocks[key] = heldIn(state, 'blocks', key) - need;
  const next = { ...state, inventory, coins: count(state.coins) - listed.price.coins };

  if (listed.line === 'weapon') {
    const equipment = { ...state.equipment };
    const blade = listed.price.blade;
    let inHand = equipment.weapon;
    if (blade && inHand === blade) {
      inHand = null; // the blade in hand is the one reforged
    } else if (blade) {
      const bag = BAGS.find((b) => count(inventory[b]?.[blade]) > 0);
      inventory[bag] = { ...inventory[bag], [blade]: count(inventory[bag][blade]) - 1 };
    }
    if (inHand) stow(inventory, inHand);
    equipment.weapon = listed.give;
    next.equipment = equipment;
  } else if (listed.line === 'relic') {
    next.relicTiers = { ...(state.relicTiers || {}), [listed.give]: listed.tier };
  } else {
    inventory.blocks[listed.give] = heldIn(state, 'blocks', listed.give) + listed.count;
  }
  return { ok: true, state: next };
}
