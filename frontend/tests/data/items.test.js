import { describe, it, expect } from 'vitest';
import {
  ITEMS,
  NAME_TO_ID,
  NAME_TO_RARITY,
  normalizeItemName,
  getItemRarity,
  getItemIcon,
  getItemName,
} from '../../src/data/items.js';

// ─────────────────────────────────────────────────────────────────────────────
// S1C-M3-T2 registry tests. The companion characterization net
// (loot-characterization.test.js) locks the CURRENT duplicated behavior; this
// file asserts the NEW centralized registry — including the deliberate FIX rows
// where the emoji-prefix / cross-file-divergence quirks are resolved to one tier.
//
// Emoji prefixes are constructed via \u{...} escapes so THIS file stays
// emoji-free (the M3 zero-emoji gate lands in T6; don't add to the debt).
// ─────────────────────────────────────────────────────────────────────────────

// Leading-emoji glyphs for the §4 loot set, by codepoint (no literal emoji here).
const E = {
  meat: '\u{1F969}',            // 🥩
  bone: '\u{1F9B4}',            // 🦴
  wool: '\u{1F9F6}',            // 🧶 (Leather loot prefix)
  zombie: '\u{1F9DF}',          // 🧟
  sword: '\u{1F5E1}\u{FE0F}',   // 🗡️
  gem: '\u{1F48E}',             // 💎 (Emerald + Diamond)
  bow: '\u{1F3F9}',             // 🏹
  web: '\u{1F578}\u{FE0F}',     // 🕸️
  thread: '\u{1F9F5}',          // 🧵
  purpleHeart: '\u{1F49C}',     // 💜
  redHeart: '\u{2764}\u{FE0F}', // ❤️
  blueHeart: '\u{1F499}',       // 💙
  swords: '\u{2694}\u{FE0F}',   // ⚔️
  shield: '\u{1F6E1}\u{FE0F}',  // 🛡️
  crown: '\u{1F451}',           // 👑
  star: '\u{1F31F}',            // 🌟
};

// The full §4 loot set: [emojiPrefixedName, cleanName].
const LOOT_SET = [
  [`${E.meat} Raw Porkchop`, 'Raw Porkchop'],
  [`${E.meat} Raw Beef`, 'Raw Beef'],
  [`${E.bone} Bone`, 'Bone'],
  [`${E.wool} Leather`, 'Leather'],
  [`${E.zombie} Rotten Flesh`, 'Rotten Flesh'],
  [`${E.sword} Iron Nugget`, 'Iron Nugget'],
  [`${E.gem} Emerald`, 'Emerald'],
  [`${E.bow} Arrow`, 'Arrow'],
  [`${E.web} Spider Eye`, 'Spider Eye'],
  [`${E.thread} String`, 'String'],
  [`${E.purpleHeart} Ender Pearl`, 'Ender Pearl'],
  [`${E.redHeart} Health Potion`, 'Health Potion'],
  [`${E.blueHeart} Mana Potion`, 'Mana Potion'],
  [`${E.swords} Damage Scroll`, 'Damage Scroll'],
  [`${E.shield} Shield Scroll`, 'Shield Scroll'],
  [`${E.gem} Diamond`, 'Diamond'],
  [`${E.crown} Golden Crown`, 'Golden Crown'],
  [`${E.star} Star Fragment`, 'Star Fragment'],
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. ITEMS table integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('ITEMS registry', () => {
  it('has 37 entries, each with name/icon/rarity', () => {
    const ids = Object.keys(ITEMS);
    expect(ids).toHaveLength(37);
    for (const id of ids) {
      const def = ITEMS[id];
      expect(def).toMatchObject({
        name: expect.any(String),
        icon: expect.any(String),
        rarity: expect.stringMatching(/^(common|rare|epic|legendary)$/),
      });
    }
  });

  it('builds NAME_TO_ID and NAME_TO_RARITY consistently', () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(NAME_TO_ID[def.name]).toBe(id);
      expect(NAME_TO_RARITY[def.name]).toBe(def.rarity);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. rarity + icon per representative id (incl. EVERY FIX row)
// ─────────────────────────────────────────────────────────────────────────────
const RARITY_BY_ID = [
  // FIX rows (deliberate single-source resolution).
  ['emerald', 'epic'],
  ['ender_pearl', 'epic'],
  ['mana_potion', 'epic'],
  ['golden_crown', 'legendary'],
  ['star_fragment', 'legendary'],
  ['damage_scroll', 'rare'],
  ['shield_scroll', 'rare'],
  ['wooden_shield', 'common'],
  // representative non-fix rows.
  ['raw_porkchop', 'common'],
  ['cooked_porkchop', 'rare'],
  ['bone', 'common'],
  ['leather', 'rare'],
  ['iron_nugget', 'epic'],
  ['health_potion', 'rare'],
  ['diamond_gem', 'legendary'],
  ['sword', 'common'],
  ['pickaxe', 'common'],
  ['stone_sword', 'rare'],
  ['leather_helmet', 'rare'],
  ['iron_sword', 'epic'],
  ['diamond_sword', 'legendary'],
];

describe('getItemRarity by id', () => {
  it.each(RARITY_BY_ID)('getItemRarity(%j) === %j', (id, rarity) => {
    expect(getItemRarity(id)).toBe(rarity);
    expect(ITEMS[id].rarity).toBe(rarity);
  });
});

const ICON_BY_ID = [
  ['emerald', 'emerald'],
  ['ender_pearl', 'pearl'],
  ['mana_potion', 'potion'],
  ['golden_crown', 'crown'],
  ['star_fragment', 'star'],
  ['damage_scroll', 'scroll'],
  ['shield_scroll', 'scroll'],
  ['wooden_shield', 'shield'],
  ['iron_nugget', 'ore'],
  ['leather', 'leather'],
  ['spider_eye', 'eye'],
  ['string', 'string'],
  ['bone', 'bone'],
  ['arrow', 'arrow'],
  ['diamond_gem', 'diamond'],
  ['raw_beef', 'meat'],
  ['rotten_flesh', 'meat'],
];

describe('getItemIcon by id', () => {
  it.each(ICON_BY_ID)('getItemIcon(%j) === %j', (id, icon) => {
    expect(getItemIcon(id)).toBe(icon);
    expect(ITEMS[id].icon).toBe(icon);
  });

  it('returns null for unknown ids / blocks (caller renders a color swatch)', () => {
    expect(getItemIcon('grass')).toBeNull();
    expect(getItemIcon('cobblestone')).toBeNull();
    expect(getItemIcon('')).toBeNull();
    expect(getItemIcon(null)).toBeNull();
    expect(getItemIcon(undefined)).toBeNull();
  });

  it('resolves icon by clean display name too', () => {
    expect(getItemIcon('Golden Crown')).toBe('crown');
    expect(getItemIcon('Diamond')).toBe('diamond');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. normalizeItemName strips the leading emoji for the full §4 loot set
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeItemName', () => {
  it.each(LOOT_SET)('strips the leading emoji of %j', (prefixed, clean) => {
    expect(normalizeItemName(prefixed)).toBe(clean);
  });

  it('leaves a clean name unchanged', () => {
    expect(normalizeItemName('Golden Crown')).toBe('Golden Crown');
    expect(normalizeItemName('Iron Sword')).toBe('Iron Sword');
    expect(normalizeItemName('sword')).toBe('sword');
    expect(normalizeItemName('')).toBe('');
  });

  it('passes non-strings through untouched', () => {
    expect(normalizeItemName(null)).toBeNull();
    expect(normalizeItemName(undefined)).toBeUndefined();
  });

  it('strips only ONE leading emoji', () => {
    // two glyphs -> only the first is removed.
    expect(normalizeItemName(`${E.crown}${E.star} Crown`)).toBe(`${E.star} Crown`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. emoji-prefixed name resolution + legacy substring fallback
// ─────────────────────────────────────────────────────────────────────────────
describe('getItemRarity by name (emoji-prefixed -> registry tier)', () => {
  // The registry FIXES the emoji-prefix breakage: every §4 loot name now
  // resolves to its §3 tier regardless of the leading emoji.
  const NAME_TIER = [
    [`${E.gem} Emerald`, 'epic'],
    [`${E.purpleHeart} Ender Pearl`, 'epic'],
    [`${E.blueHeart} Mana Potion`, 'epic'],
    [`${E.crown} Golden Crown`, 'legendary'],
    [`${E.star} Star Fragment`, 'legendary'],
    [`${E.swords} Damage Scroll`, 'rare'],
    [`${E.shield} Shield Scroll`, 'rare'],
    [`${E.gem} Diamond`, 'legendary'],
    [`${E.sword} Iron Nugget`, 'epic'],
    [`${E.wool} Leather`, 'rare'],
    [`${E.redHeart} Health Potion`, 'rare'],
    [`${E.meat} Raw Porkchop`, 'common'],
    [`${E.bone} Bone`, 'common'],
    [`${E.bow} Arrow`, 'common'],
  ];
  it.each(NAME_TIER)('getItemRarity(%j) === %j', (name, tier) => {
    expect(getItemRarity(name)).toBe(tier);
  });

  it('resolves clean display names', () => {
    expect(getItemRarity('Golden Crown')).toBe('legendary');
    expect(getItemRarity('Mana Potion')).toBe('epic');
    expect(getItemRarity('Health Potion')).toBe('rare');
  });
});

describe('getItemRarity legacy substring fallback (blocks / unknowns)', () => {
  it('fires for capitalized block-word matches', () => {
    expect(getItemRarity('Stone Sword')).toBe('rare'); // Stone -> rare
    expect(getItemRarity('Some Iron Thing')).toBe('epic'); // Iron -> epic
    expect(getItemRarity('Big Diamond Thing')).toBe('legendary'); // Diamond -> legendary
    expect(getItemRarity('Worn Leather')).toBe('rare'); // Leather -> rare
  });

  it('lowercase blocks do NOT match (case-sensitive substring quirk)', () => {
    expect(getItemRarity('stone')).toBe('common');
    expect(getItemRarity('diamond')).toBe('common');
    expect(getItemRarity('iron')).toBe('common');
    expect(getItemRarity('wood')).toBe('common');
    expect(getItemRarity('grass')).toBe('common');
    expect(getItemRarity('cobblestone')).toBe('common');
  });

  it('falsy -> common', () => {
    expect(getItemRarity('')).toBe('common');
    expect(getItemRarity(null)).toBe('common');
    expect(getItemRarity(undefined)).toBe('common');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getItemName
// ─────────────────────────────────────────────────────────────────────────────
describe('getItemName', () => {
  it('returns the display name for known ids', () => {
    expect(getItemName('golden_crown')).toBe('Golden Crown');
    expect(getItemName('sword')).toBe('sword');
    expect(getItemName('diamond_gem')).toBe('Diamond');
  });
  it('falls back to the id for unknown ids', () => {
    expect(getItemName('totally_unknown')).toBe('totally_unknown');
  });
});
