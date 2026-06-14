import { describe, it, expect } from 'vitest';
import { getItemRarity as npcGetItemRarity } from '../../src/SimplifiedNPCSystem.jsx';
import { getItemRarity as panelsGetItemRarity } from '../../src/ui/GamePanels.jsx';
import { EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';
// Import the REAL shipped loot tables (not hand-copied replicas) so the structure
// + emoji-free assertions below characterize the ACTUAL data — any future drift
// (changed chance/xp, renamed item, reintroduced emoji) FAILS these tests.
import { LOOT_TABLES, CHEST_LOOT } from '../../src/QuestSystem.jsx';

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

// === REGISTRY SINGLE SOURCE (post M3-T3) =====================================
// Pre-T3 this block held byte-for-byte golden replicas of the TWO duplicated
// getItemRarity implementations (NPC had emoji-fallback branches; GamePanels did
// not), plus golden-replica equality tests, to catch a silent convergence of the
// duplicates. M3-T3 INTENTIONALLY converged them: both SimplifiedNPCSystem and
// ui/GamePanels now re-export getItemRarity from the single registry
// (src/data/items.js). There is no longer a second implementation to replicate,
// so the golden replicas + their equality tests are removed — their job (force a
// conscious decision before convergence) is done; this commit IS that decision.

// === The CURRENT LOOT/CHEST data (imported LIVE from QuestSystem.jsx) =========
// The structure + emoji-free assertions below run against the REAL exported
// LOOT_TABLES / CHEST_LOOT (no hand-copied replicas). POST M3-T3: item identity
// is emoji-free (the leading emoji was decoupled from item identity and now lives
// only in the icon registry). The inline snapshots below were regenerated from the
// shipped data, so any future drift (changed chance/xp, renamed item, reintroduced
// emoji) FAILS these tests — the SHIPPED data is the source of truth.

// ─────────────────────────────────────────────────────────────────────────────
// 1. getItemRarity — per-item tier behavior.
//    Format: [itemName, npcTier, panelsTier]. POST M3-T3 both columns are IDENTICAL
//    for every case — NPC + GamePanels re-export the same registry function, so the
//    cross-file divergence (formerly captured here) no longer exists. The plain-name,
//    equipment, and lowercase-block rows are UNCHANGED (the registry preserves them);
//    only the emoji-prefixed rows change, reflecting the registry's deliberate FIX
//    (it normalizes the leading emoji away, then resolves the clean name's tier).
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

  // --- emoji-prefixed loot names — registry normalizes the emoji, then resolves
  //     the CLEAN name's registry tier. Both columns now AGREE (single source);
  //     each row cites the M3-T3 FIX relative to the pre-T3 captured reality.
  ['💎 Emerald',       'epic',      'epic'],      // FIX: was npc legendary / panels common -> registry epic (clean 'Emerald')
  ['🛡️ Shield Scroll', 'rare',      'rare'],      // FIX: was npc epic / panels common -> registry rare (clean 'Shield Scroll')
  ['💧 Mana Potion',   'epic',      'epic'],      // FIX: was npc epic / panels common -> registry epic (clean 'Mana Potion')
  ['❤️ Health Potion', 'rare',      'rare'],      // FIX: was npc rare / panels common -> registry rare (clean 'Health Potion')
  ['🍖 Cooked',        'common',    'common'],    // FIX: was npc rare / panels common -> registry common (clean 'Cooked' has no exact/substring match)

  // --- emoji-prefixed names that already AGREED (word-match wins) — unchanged --
  ['💎 Diamond',      'legendary', 'legendary'], // unchanged: clean 'Diamond' -> legendary (word-match)
  ['🗡️ Iron Nugget',  'epic',      'epic'],      // unchanged: clean 'Iron Nugget' -> epic (registry id; word "Iron")
  ['🧶 Leather',      'rare',      'rare'],       // unchanged: clean 'Leather' -> rare (registry id; word "Leather")

  // --- emoji-prefixed names where the EMOJI prefix FORMERLY broke an exact-match;
  //     the registry strips it first, so they now resolve to the clean tier ------
  ['👑 Golden Crown', 'legendary', 'legendary'], // FIX: emoji prefix broke exact-match -> common; registry strips -> 'Golden Crown' legendary
  ['🌟 Star Fragment','legendary', 'legendary'], // FIX: was common at runtime -> registry strips -> 'Star Fragment' legendary
  ['💙 Mana Potion',  'epic',      'epic'],       // FIX: was common (💙 not in NPC fallback) -> registry strips -> 'Mana Potion' epic
  ['⚔️ Damage Scroll','rare',      'rare'],       // FIX: was common -> registry 'Damage Scroll' rare (buff consumable)
  ['🥩 Raw Porkchop', 'common', 'common'],  // unchanged: clean 'Raw Porkchop' -> common
  ['🥩 Raw Beef',     'common', 'common'],  // unchanged: clean 'Raw Beef' -> common
  ['🦴 Bone',         'common', 'common'],  // unchanged
  ['🧟 Rotten Flesh', 'common', 'common'],  // unchanged
  ['🏹 Arrow',        'common', 'common'],  // unchanged
  ['🕸️ Spider Eye',   'common', 'common'],  // unchanged
  ['🧵 String',       'common', 'common'],  // unchanged
  ['💜 Ender Pearl',  'epic',   'epic'],    // FIX: was common at runtime -> registry strips -> 'Ender Pearl' epic

  // --- empty / nullish ---
  ['',        'common', 'common'],
  [null,      'common', 'common'],
  [undefined, 'common', 'common'],
];

describe('characterization: getItemRarity (SimplifiedNPCSystem)', () => {
  it.each(RARITY_CASES)('NPC.getItemRarity(%j) === %j', (name, npcTier) => {
    expect(npcGetItemRarity(name)).toBe(npcTier);
  });
});

describe('characterization: getItemRarity (ui/GamePanels)', () => {
  it.each(RARITY_CASES)('Panels.getItemRarity(%j) === %j', (name, _npc, panelsTier) => {
    expect(panelsGetItemRarity(name)).toBe(panelsTier);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cross-file rarity contract — POST M3-T3 there is ONE source.
//    Pre-T3 this captured the EXACT set of emoji-prefixed names where the two
//    duplicated implementations DIVERGED (NPC had emoji-fallback branches that
//    GamePanels lacked). M3-T3 resolved the cross-file divergence: both files
//    re-export the single registry's getItemRarity, so the divergence set is now
//    EMPTY and the two functions agree on EVERY case (they are literally the same
//    function reference).
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: NPC vs GamePanels rarity duplication contract', () => {
  it('agrees on EVERY case — single registry source (no cross-file divergence)', () => {
    for (const [name] of RARITY_CASES) {
      expect(npcGetItemRarity(name)).toBe(panelsGetItemRarity(name));
    }
  });

  it('has an EMPTY divergence set (M3-T3 collapsed the two impls into one registry)', () => {
    const divergent = RARITY_CASES
      .filter(([name]) => npcGetItemRarity(name) !== panelsGetItemRarity(name))
      .map(([name]) => ({ name, npc: npcGetItemRarity(name), panels: panelsGetItemRarity(name) }));

    // M3-T3 resolved the cross-file divergence — both files re-export the
    // registry's getItemRarity (src/data/items.js), so nothing diverges.
    expect(divergent).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOOT_TABLES / CHEST_LOOT structure snapshot — locks item names + chances so
//    T3's data change (decoupling emoji from item identity) is diff-visible.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: LOOT_TABLES structure', () => {
  it('matches the current loot-table snapshot (item names + chances + xp)', () => {
    expect(LOOT_TABLES).toMatchInlineSnapshot(`
      {
        "cow": [
          {
            "chance": 0.8,
            "item": "Raw Beef",
            "xp": 5,
          },
          {
            "chance": 0.5,
            "item": "Leather",
            "xp": 3,
          },
          {
            "chance": 0.2,
            "item": "Bone",
            "xp": 2,
          },
        ],
        "duskhound": [
          {
            "chance": 0.8,
            "item": "Bone",
            "xp": 3,
          },
          {
            "chance": 0.5,
            "item": "Leather",
            "xp": 4,
          },
          {
            "chance": 0.3,
            "item": "Raw Beef",
            "xp": 5,
          },
        ],
        "emberhusk": [
          {
            "chance": 0.7,
            "item": "Bone",
            "xp": 4,
          },
          {
            "chance": 0.4,
            "item": "Iron Nugget",
            "xp": 8,
          },
          {
            "chance": 0.08,
            "item": "Emerald",
            "xp": 25,
          },
        ],
        "moss_brute": [
          {
            "chance": 0.7,
            "item": "Iron Nugget",
            "xp": 10,
          },
          {
            "chance": 0.35,
            "item": "Emerald",
            "xp": 25,
          },
          {
            "chance": 0.06,
            "item": "Diamond",
            "xp": 60,
          },
        ],
        "pig": [
          {
            "chance": 0.8,
            "item": "Raw Porkchop",
            "xp": 5,
          },
          {
            "chance": 0.3,
            "item": "Bone",
            "xp": 2,
          },
        ],
        "skeleton": [
          {
            "chance": 0.9,
            "item": "Bone",
            "xp": 3,
          },
          {
            "chance": 0.6,
            "item": "Arrow",
            "xp": 4,
          },
          {
            "chance": 0.2,
            "item": "Iron Nugget",
            "xp": 8,
          },
        ],
        "skitterling": [
          {
            "chance": 0.7,
            "item": "String",
            "xp": 3,
          },
          {
            "chance": 0.4,
            "item": "Spider Eye",
            "xp": 4,
          },
          {
            "chance": 0.02,
            "item": "Ender Pearl",
            "xp": 30,
          },
        ],
        "spider": [
          {
            "chance": 0.6,
            "item": "Spider Eye",
            "xp": 5,
          },
          {
            "chance": 0.8,
            "item": "String",
            "xp": 3,
          },
          {
            "chance": 0.03,
            "item": "Ender Pearl",
            "xp": 30,
          },
        ],
        "zombie": [
          {
            "chance": 0.7,
            "item": "Rotten Flesh",
            "xp": 3,
          },
          {
            "chance": 0.3,
            "item": "Iron Nugget",
            "xp": 8,
          },
          {
            "chance": 0.05,
            "item": "Emerald",
            "xp": 25,
          },
        ],
      }
    `);
  });
});

describe('characterization: CHEST_LOOT structure', () => {
  it('matches the current chest-loot snapshot (item names + chances + effects)', () => {
    expect(CHEST_LOOT).toMatchInlineSnapshot(`
      [
        {
          "chance": 0.6,
          "effect": "heal",
          "item": "Health Potion",
          "value": 30,
        },
        {
          "chance": 0.5,
          "effect": "mana",
          "item": "Mana Potion",
          "value": 40,
        },
        {
          "chance": 0.3,
          "duration": 30,
          "effect": "buff_damage",
          "item": "Damage Scroll",
          "value": 1.5,
        },
        {
          "chance": 0.25,
          "duration": 30,
          "effect": "buff_defense",
          "item": "Shield Scroll",
          "value": 0.5,
        },
        {
          "chance": 0.15,
          "effect": "xp",
          "item": "Diamond",
          "value": 50,
        },
        {
          "chance": 0.05,
          "effect": "xp",
          "item": "Golden Crown",
          "value": 200,
        },
        {
          "chance": 0.08,
          "effect": "xp",
          "item": "Star Fragment",
          "value": 100,
        },
      ]
    `);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Emoji-free loot identity (DECOUPLE DONE) — POST M3-T3, NO loot/chest item
//    identity string carries an emoji. Pre-T3 this block asserted the OPPOSITE
//    (every name began with a baked-in emoji) + snapshotted the 18 emoji-named
//    strings as the migration surface. The decouple is now complete: item identity
//    is the clean name; the emoji's role (the icon glyph) moved to the registry.
// ─────────────────────────────────────────────────────────────────────────────
describe('characterization: loot identity strings are emoji-free (decouple done)', () => {
  const allLootItemNames = [
    ...Object.values(LOOT_TABLES).flat().map((e) => e.item),
    ...CHEST_LOOT.map((e) => e.item),
  ];

  // Any emoji/pictographic codepoint anywhere in the identity string.
  const anyEmoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{FE0F}]/u;

  it('no loot/chest item name contains an emoji', () => {
    // Inverts the pre-T3 assertion: identity is now decoupled from emoji entirely.
    for (const name of allLootItemNames) {
      expect(name, `item "${name}" must be emoji-free`).not.toMatch(anyEmoji);
    }
  });

  it('snapshots the full set of unique (clean) loot identity strings', () => {
    const unique = [...new Set(allLootItemNames)].sort();
    expect(unique).toMatchInlineSnapshot(`
      [
        "Arrow",
        "Bone",
        "Damage Scroll",
        "Diamond",
        "Emerald",
        "Ender Pearl",
        "Golden Crown",
        "Health Potion",
        "Iron Nugget",
        "Leather",
        "Mana Potion",
        "Raw Beef",
        "Raw Porkchop",
        "Rotten Flesh",
        "Shield Scroll",
        "Spider Eye",
        "Star Fragment",
        "String",
      ]
    `);
  });

  it('counts the unique loot item identity strings', () => {
    // 18 unique identity strings across LOOT_TABLES + CHEST_LOOT (count unchanged
    // by the decouple — only the emoji prefix was stripped, no items added/removed).
    expect([...new Set(allLootItemNames)].length).toBe(18);
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
