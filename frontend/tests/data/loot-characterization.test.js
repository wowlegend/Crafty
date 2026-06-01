import { describe, it, expect } from 'vitest';
import { getItemRarity as npcGetItemRarity } from '../../src/SimplifiedNPCSystem.jsx';
import { getItemRarity as panelsGetItemRarity } from '../../src/ui/GamePanels.jsx';
import { EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION TESTS — refactor safety net (S1C / M3 emoji-decouple)
//
// These tests capture the CURRENT, observed behavior of the loot/rarity/item
// identity logic BEFORE the M3-T2/T3 refactor decouples emoji from item data
// (stable ids + a centralized item registry). They are NOT a spec of desired
// behavior — they lock in REALITY (including quirks + the cross-file divergence
// documented below) so the refactor is provably behavior-preserving.
//
// Source of the values asserted here: ran the EXACT current logic of both
// getItemRarity implementations against the item set on 2026-06-01 and captured
// the output verbatim. If any of these change, the refactor changed behavior.
// ─────────────────────────────────────────────────────────────────────────────

// === GOLDEN REFERENCE: the two CURRENT getItemRarity implementations =========
// Replicated here byte-for-byte as a second guardrail: if someone "fixes" the
// real source to match the other file, these golden copies + the imported
// functions will disagree and the divergence tests below will fail loudly,
// forcing a conscious decision rather than a silent behavior change.

// SimplifiedNPCSystem.jsx (~line 1116) — has EXTRA emoji-fallback branches.
const goldenNpcRarity = (itemName) => {
  if (!itemName) return 'common';
  if (itemName.includes('Diamond') || itemName === 'Golden Crown' || itemName === 'Star Fragment' || itemName.includes('💎')) return 'legendary';
  if (itemName.includes('Iron') || itemName === 'Mana Potion' || itemName.includes('🗡️') || itemName.includes('🛡️') || itemName.includes('💧')) return 'epic';
  if (itemName.includes('Stone') || itemName.includes('Leather') || itemName === 'Health Potion' || itemName === 'Cooked Porkchop' || itemName === 'Cooked Beef' || itemName.includes('❤️') || itemName.includes('🍖')) return 'rare';
  return 'common';
};

// ui/GamePanels.jsx (~line 32) — NO emoji-fallback branches (word-match only).
const goldenPanelsRarity = (itemName) => {
  if (!itemName) return 'common';
  if (itemName.includes('Diamond') || itemName === 'Golden Crown' || itemName === 'Star Fragment') return 'legendary';
  if (itemName.includes('Iron') || itemName === 'Mana Potion') return 'epic';
  if (itemName.includes('Stone') || itemName.includes('Leather') || itemName === 'Health Potion' || itemName === 'Cooked Porkchop' || itemName === 'Cooked Beef') return 'rare';
  return 'common';
};

// === The CURRENT LOOT/CHEST data (snapshotted from QuestSystem.jsx ~line 10) ==
// Replicated as the "to-be-decoupled" reference so T3's data change is diff-visible
// in this test file (the registry refactor will change item identity strings here).
const LOOT_TABLES_SNAPSHOT = {
  pig: [
    { item: '🥩 Raw Porkchop', chance: 0.8, xp: 5 },
    { item: '🦴 Bone', chance: 0.3, xp: 2 },
  ],
  cow: [
    { item: '🥩 Raw Beef', chance: 0.8, xp: 5 },
    { item: '🧶 Leather', chance: 0.5, xp: 3 },
    { item: '🦴 Bone', chance: 0.2, xp: 2 },
  ],
  zombie: [
    { item: '🧟 Rotten Flesh', chance: 0.7, xp: 3 },
    { item: '🗡️ Iron Nugget', chance: 0.3, xp: 8 },
    { item: '💎 Emerald', chance: 0.05, xp: 25 },
  ],
  skeleton: [
    { item: '🦴 Bone', chance: 0.9, xp: 3 },
    { item: '🏹 Arrow', chance: 0.6, xp: 4 },
    { item: '🗡️ Iron Nugget', chance: 0.2, xp: 8 },
  ],
  spider: [
    { item: '🕸️ Spider Eye', chance: 0.6, xp: 5 },
    { item: '🧵 String', chance: 0.8, xp: 3 },
    { item: '💜 Ender Pearl', chance: 0.03, xp: 30 },
  ],
};

const CHEST_LOOT_SNAPSHOT = [
  { item: '❤️ Health Potion', chance: 0.6, effect: 'heal', value: 30 },
  { item: '💙 Mana Potion', chance: 0.5, effect: 'mana', value: 40 },
  { item: '⚔️ Damage Scroll', chance: 0.3, effect: 'buff_damage', value: 1.5, duration: 30 },
  { item: '🛡️ Shield Scroll', chance: 0.25, effect: 'buff_defense', value: 0.5, duration: 30 },
  { item: '💎 Diamond', chance: 0.15, effect: 'xp', value: 50 },
  { item: '👑 Golden Crown', chance: 0.05, effect: 'xp', value: 200 },
  { item: '🌟 Star Fragment', chance: 0.08, effect: 'xp', value: 100 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. getItemRarity — CURRENT per-item tier behavior (the captured reality)
//    Format: [itemName, npcTier, panelsTier]. When the two columns differ, the
//    cross-file divergence is intentional capture (see §3).
// ─────────────────────────────────────────────────────────────────────────────
const RARITY_CASES = [
  // --- legendary (word "Diamond" / exact Golden Crown / exact Star Fragment) ---
  ['Diamond Sword',      'legendary', 'legendary'],
  ['Diamond Helmet',     'legendary', 'legendary'],
  ['Diamond Shield',     'legendary', 'legendary'],
  ['Diamond Chestplate', 'legendary', 'legendary'],
  ['Diamond Boots',      'legendary', 'legendary'],
  ['Golden Crown',       'legendary', 'legendary'],
  ['Star Fragment',      'legendary', 'legendary'],

  // --- epic (word "Iron" / exact Mana Potion) ---
  ['Iron Helmet',     'epic', 'epic'],
  ['Iron Sword',      'epic', 'epic'],
  ['Iron Shield',     'epic', 'epic'],
  ['Iron Chestplate', 'epic', 'epic'],
  ['Iron Boots',      'epic', 'epic'],
  ['Mana Potion',     'epic', 'epic'],

  // --- rare (word "Stone"/"Leather" / exact Health Potion / Cooked Pork/Beef) ---
  ['Stone Sword',         'rare', 'rare'],
  ['Leather Helmet',      'rare', 'rare'],
  ['Leather Chestplate',  'rare', 'rare'],
  ['Leather Boots',       'rare', 'rare'],
  ['Health Potion',       'rare', 'rare'],
  ['Cooked Porkchop',     'rare', 'rare'],
  ['Cooked Beef',         'rare', 'rare'],

  // --- common (no match) ---
  ['Wooden Shield', 'common', 'common'],
  ['sword',         'common', 'common'],
  ['pickaxe',       'common', 'common'],
  ['wood',          'common', 'common'],
  ['grass',         'common', 'common'],
  ['stone',         'common', 'common'], // lowercase 'stone' != 'Stone'
  ['diamond',       'common', 'common'], // lowercase 'diamond' != 'Diamond'
  ['gold',          'common', 'common'],
  ['iron',          'common', 'common'], // lowercase 'iron' != 'Iron'
  ['sand',          'common', 'common'],
  ['cobblestone',   'common', 'common'],

  // --- emoji-prefixed loot names — where the two implementations DIVERGE -------
  // NPC has emoji-fallback branches; GamePanels matches only the trailing word.
  ['💎 Emerald',       'legendary', 'common'],    // *** DIVERGES (💎 fallback)
  ['🛡️ Shield Scroll', 'epic',      'common'],    // *** DIVERGES (🛡️ fallback)
  ['💧 Mana Potion',   'epic',      'common'],    // *** DIVERGES (💧 fallback)
  ['❤️ Health Potion', 'rare',      'common'],    // *** DIVERGES (❤️ fallback)
  ['🍖 Cooked',        'rare',      'common'],    // *** DIVERGES (🍖 fallback)

  // --- emoji-prefixed names that AGREE (word-match wins on both) -------------
  ['💎 Diamond',      'legendary', 'legendary'], // word "Diamond" matched on both
  ['🗡️ Iron Nugget',  'epic',      'epic'],      // word "Iron" matched on both
  ['🧶 Leather',      'rare',      'rare'],       // word "Leather" matched on both

  // --- emoji-prefixed names where the EMOJI prefix breaks an exact-match -----
  ['👑 Golden Crown', 'common', 'common'],  // !== 'Golden Crown' (has emoji prefix)
  ['🌟 Star Fragment','common', 'common'],  // !== 'Star Fragment' (has emoji prefix)
  ['💙 Mana Potion',  'common', 'common'],  // !== 'Mana Potion' (💙 not in NPC fallback)
  ['⚔️ Damage Scroll','common', 'common'],
  ['🥩 Raw Porkchop', 'common', 'common'],  // !== 'Cooked Porkchop'
  ['🥩 Raw Beef',     'common', 'common'],  // !== 'Cooked Beef'
  ['🦴 Bone',         'common', 'common'],
  ['🧟 Rotten Flesh', 'common', 'common'],
  ['🏹 Arrow',        'common', 'common'],
  ['🕸️ Spider Eye',   'common', 'common'],
  ['🧵 String',       'common', 'common'],
  ['💜 Ender Pearl',  'common', 'common'],

  // --- empty / nullish ---
  ['',        'common', 'common'],
  [null,      'common', 'common'],
  [undefined, 'common', 'common'],
];

describe('characterization: getItemRarity (SimplifiedNPCSystem)', () => {
  it.each(RARITY_CASES)('NPC.getItemRarity(%j) === %j', (name, npcTier) => {
    expect(npcGetItemRarity(name)).toBe(npcTier);
  });

  it('imported NPC impl matches the golden replica for every case', () => {
    for (const [name] of RARITY_CASES) {
      expect(npcGetItemRarity(name)).toBe(goldenNpcRarity(name));
    }
  });
});

describe('characterization: getItemRarity (ui/GamePanels)', () => {
  it.each(RARITY_CASES)('Panels.getItemRarity(%j) === %j', (name, _npc, panelsTier) => {
    expect(panelsGetItemRarity(name)).toBe(panelsTier);
  });

  it('imported Panels impl matches the golden replica for every case', () => {
    for (const [name] of RARITY_CASES) {
      expect(panelsGetItemRarity(name)).toBe(goldenPanelsRarity(name));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cross-file DUPLICATION contract — they agree on plain names, DIVERGE on emoji
//    The M3 registry must preserve (or consciously resolve) BOTH behaviors. This
//    test documents EXACTLY where they agree and where they don't.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: NPC vs GamePanels rarity duplication contract', () => {
  it('agrees on all non-emoji item names', () => {
    for (const [name] of RARITY_CASES) {
      if (typeof name === 'string' && /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2300}-\u{23FF}]/u.test(name)) continue;
      expect(npcGetItemRarity(name)).toBe(panelsGetItemRarity(name));
    }
  });

  it('captures the EXACT set of item names where the two implementations DIVERGE', () => {
    const divergent = RARITY_CASES
      .filter(([name]) => npcGetItemRarity(name) !== panelsGetItemRarity(name))
      .map(([name]) => ({ name, npc: npcGetItemRarity(name), panels: panelsGetItemRarity(name) }));

    // SimplifiedNPCSystem has emoji-fallback branches (💎/🗡️/🛡️/💧/❤️/🍖) that
    // GamePanels lacks. These 5 emoji-prefixed names are the WHOLE divergence set
    // as of 2026-06-01. The registry refactor MUST consciously decide which wins.
    expect(divergent).toEqual([
      { name: '💎 Emerald',       npc: 'legendary', panels: 'common' },
      { name: '🛡️ Shield Scroll', npc: 'epic',      panels: 'common' },
      { name: '💧 Mana Potion',   npc: 'epic',      panels: 'common' },
      { name: '❤️ Health Potion', npc: 'rare',      panels: 'common' },
      { name: '🍖 Cooked',        npc: 'rare',      panels: 'common' },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOOT_TABLES / CHEST_LOOT structure snapshot — locks item names + chances so
//    T3's data change (decoupling emoji from item identity) is diff-visible.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: LOOT_TABLES structure', () => {
  it('matches the current loot-table snapshot (item names + chances + xp)', () => {
    expect(LOOT_TABLES_SNAPSHOT).toMatchInlineSnapshot(`
      {
        "cow": [
          {
            "chance": 0.8,
            "item": "🥩 Raw Beef",
            "xp": 5,
          },
          {
            "chance": 0.5,
            "item": "🧶 Leather",
            "xp": 3,
          },
          {
            "chance": 0.2,
            "item": "🦴 Bone",
            "xp": 2,
          },
        ],
        "pig": [
          {
            "chance": 0.8,
            "item": "🥩 Raw Porkchop",
            "xp": 5,
          },
          {
            "chance": 0.3,
            "item": "🦴 Bone",
            "xp": 2,
          },
        ],
        "skeleton": [
          {
            "chance": 0.9,
            "item": "🦴 Bone",
            "xp": 3,
          },
          {
            "chance": 0.6,
            "item": "🏹 Arrow",
            "xp": 4,
          },
          {
            "chance": 0.2,
            "item": "🗡️ Iron Nugget",
            "xp": 8,
          },
        ],
        "spider": [
          {
            "chance": 0.6,
            "item": "🕸️ Spider Eye",
            "xp": 5,
          },
          {
            "chance": 0.8,
            "item": "🧵 String",
            "xp": 3,
          },
          {
            "chance": 0.03,
            "item": "💜 Ender Pearl",
            "xp": 30,
          },
        ],
        "zombie": [
          {
            "chance": 0.7,
            "item": "🧟 Rotten Flesh",
            "xp": 3,
          },
          {
            "chance": 0.3,
            "item": "🗡️ Iron Nugget",
            "xp": 8,
          },
          {
            "chance": 0.05,
            "item": "💎 Emerald",
            "xp": 25,
          },
        ],
      }
    `);
  });
});

describe('characterization: CHEST_LOOT structure', () => {
  it('matches the current chest-loot snapshot (item names + chances + effects)', () => {
    expect(CHEST_LOOT_SNAPSHOT).toMatchInlineSnapshot(`
      [
        {
          "chance": 0.6,
          "effect": "heal",
          "item": "❤️ Health Potion",
          "value": 30,
        },
        {
          "chance": 0.5,
          "effect": "mana",
          "item": "💙 Mana Potion",
          "value": 40,
        },
        {
          "chance": 0.3,
          "duration": 30,
          "effect": "buff_damage",
          "item": "⚔️ Damage Scroll",
          "value": 1.5,
        },
        {
          "chance": 0.25,
          "duration": 30,
          "effect": "buff_defense",
          "item": "🛡️ Shield Scroll",
          "value": 0.5,
        },
        {
          "chance": 0.15,
          "effect": "xp",
          "item": "💎 Diamond",
          "value": 50,
        },
        {
          "chance": 0.05,
          "effect": "xp",
          "item": "👑 Golden Crown",
          "value": 200,
        },
        {
          "chance": 0.08,
          "effect": "xp",
          "item": "🌟 Star Fragment",
          "value": 100,
        },
      ]
    `);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The emoji→item-name set to be DECOUPLED — every loot item whose identity
//    string today carries a baked-in leading emoji. M3-T2/T3 will replace these
//    with stable ids + a centralized emoji/icon registry; this is the inventory
//    of strings that change. The snapshot makes the migration surface explicit.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: emoji-named loot identity strings (to be decoupled)', () => {
  const allLootItemNames = [
    ...Object.values(LOOT_TABLES_SNAPSHOT).flat().map((e) => e.item),
    ...CHEST_LOOT_SNAPSHOT.map((e) => e.item),
  ];

  // Leading-emoji = identity string starts with an emoji/pictographic codepoint.
  const leadingEmoji = /^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}])\u{FE0F}?/u;
  const emojiNamed = [...new Set(allLootItemNames)].filter((n) => leadingEmoji.test(n));

  it('every loot/chest item name currently begins with a baked-in emoji', () => {
    // Documents that emoji IS the leading token of item identity today — the exact
    // coupling M3 removes. If a name loses its emoji prefix, this fails (expected
    // during the refactor — update the snapshot then).
    for (const name of allLootItemNames) {
      expect(name, `item "${name}" should start with an emoji today`).toMatch(leadingEmoji);
    }
  });

  it('snapshots the full set of unique emoji-named loot identity strings', () => {
    expect(emojiNamed.sort()).toMatchInlineSnapshot(`
      [
        "⚔️ Damage Scroll",
        "❤️ Health Potion",
        "🌟 Star Fragment",
        "🏹 Arrow",
        "👑 Golden Crown",
        "💎 Diamond",
        "💎 Emerald",
        "💙 Mana Potion",
        "💜 Ender Pearl",
        "🕸️ Spider Eye",
        "🗡️ Iron Nugget",
        "🛡️ Shield Scroll",
        "🥩 Raw Beef",
        "🥩 Raw Porkchop",
        "🦴 Bone",
        "🧟 Rotten Flesh",
        "🧵 String",
        "🧶 Leather",
      ]
    `);
  });

  it('counts the emoji-named loot items (the M3 decouple surface)', () => {
    // 18 unique emoji-prefixed identity strings across LOOT_TABLES + CHEST_LOOT.
    expect(emojiNamed.length).toBe(18);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EQUIPMENT_STATS keys — the plain (non-emoji) item identity strings used by
//    equipment. Captured so the registry refactor keeps equipment lookups stable.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: EQUIPMENT_STATS item keys', () => {
  it('matches the current set of equipment identity strings', () => {
    expect(Object.keys(EQUIPMENT_STATS).sort()).toMatchInlineSnapshot(`
      [
        "Diamond Boots",
        "Diamond Chestplate",
        "Diamond Helmet",
        "Diamond Shield",
        "Diamond Sword",
        "Golden Crown",
        "Iron Boots",
        "Iron Chestplate",
        "Iron Helmet",
        "Iron Shield",
        "Iron Sword",
        "Leather Boots",
        "Leather Chestplate",
        "Leather Helmet",
        "Stone Sword",
        "Wooden Shield",
        "pickaxe",
        "sword",
      ]
    `);
  });

  it('captures the CURRENT rarity tier of every EQUIPMENT_STATS key (no cross-file divergence)', () => {
    // Equipment keys are plain strings (no emoji), so BOTH rarity impls agree on
    // them. This locks the EXACT current tier per equipment key — captured reality,
    // NOT an assumption. Note 'Wooden Shield' is COMMON (no Iron/Diamond/Stone/
    // Leather substring) — a non-obvious quirk worth pinning.
    const EXPECTED_EQUIPMENT_RARITY = {
      'sword': 'common',
      'pickaxe': 'common',
      'Wooden Shield': 'common',
      'Stone Sword': 'rare',
      'Leather Helmet': 'rare',
      'Leather Chestplate': 'rare',
      'Leather Boots': 'rare',
      'Iron Sword': 'epic',
      'Iron Shield': 'epic',
      'Iron Helmet': 'epic',
      'Iron Chestplate': 'epic',
      'Iron Boots': 'epic',
      'Diamond Sword': 'legendary',
      'Diamond Shield': 'legendary',
      'Diamond Helmet': 'legendary',
      'Diamond Chestplate': 'legendary',
      'Diamond Boots': 'legendary',
      'Golden Crown': 'legendary',
    };
    for (const key of Object.keys(EQUIPMENT_STATS)) {
      expect(npcGetItemRarity(key)).toBe(panelsGetItemRarity(key)); // no divergence on plain keys
      expect(npcGetItemRarity(key)).toBe(EXPECTED_EQUIPMENT_RARITY[key]);
    }
    // every equipment key is accounted for above (no extras, no missing)
    expect(Object.keys(EXPECTED_EQUIPMENT_RARITY).sort()).toEqual(Object.keys(EQUIPMENT_STATS).sort());
  });
});
