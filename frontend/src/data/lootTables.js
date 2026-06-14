// lootTables.js — pure loot DATA (extracted from QuestSystem.jsx, byte-exact for the
// original rows). The single consumer is QuestSystem (mob-kill loot + chest loot). Kept as a
// standalone data module so the loot-coverage gate (tests/gates/loot-coverage-gates.test.js)
// can assert "every hostile MOB_TYPES key drops something" against pure data — no React import.
//
// Every `item` string MUST be a valid display name in src/data/items.js (ITEMS / NAME_TO_ID) so
// the spawned pickup renders a real icon + rarity and carries no broken downstream identity. The
// loot-coverage gate enforces that invariant; add new drop items to the ITEMS registry first.

// Per-mob drop tables. Keyed by MOB_TYPES key. Each row: { item, chance (0..1], xp }.
export const LOOT_TABLES = {
    pig: [
        { item: 'Raw Porkchop', chance: 0.8, xp: 5 },
        { item: 'Bone', chance: 0.3, xp: 2 },
    ],
    cow: [
        { item: 'Raw Beef', chance: 0.8, xp: 5 },
        { item: 'Leather', chance: 0.5, xp: 3 },
        { item: 'Bone', chance: 0.2, xp: 2 },
    ],
    zombie: [
        { item: 'Rotten Flesh', chance: 0.7, xp: 3 },
        { item: 'Iron Nugget', chance: 0.3, xp: 8 },
        { item: 'Emerald', chance: 0.05, xp: 25 },
    ],
    skeleton: [
        { item: 'Bone', chance: 0.9, xp: 3 },
        { item: 'Arrow', chance: 0.6, xp: 4 },
        { item: 'Iron Nugget', chance: 0.2, xp: 8 },
    ],
    spider: [
        { item: 'Spider Eye', chance: 0.6, xp: 5 },
        { item: 'String', chance: 0.8, xp: 3 },
        { item: 'Ender Pearl', chance: 0.03, xp: 30 },
    ],
    // --- content-coherence pass (2026-06-14): loot for the variety/content hostiles ---
    // skitterling: tiny purple spider-kin swarmer -> spider-flavoured low loot + a rare purple pearl.
    skitterling: [
        { item: 'String', chance: 0.7, xp: 3 },
        { item: 'Spider Eye', chance: 0.4, xp: 4 },
        { item: 'Ender Pearl', chance: 0.02, xp: 30 },
    ],
    // duskhound: fast quadruped predator -> a beast's meat + hide + bone.
    duskhound: [
        { item: 'Bone', chance: 0.8, xp: 3 },
        { item: 'Leather', chance: 0.5, xp: 4 },
        { item: 'Raw Beef', chance: 0.3, xp: 5 },
    ],
    // moss_brute: rare 220-HP heavy tank -> the high-value kill (iron + emerald + a rare diamond payoff).
    moss_brute: [
        { item: 'Iron Nugget', chance: 0.7, xp: 10 },
        { item: 'Emerald', chance: 0.35, xp: 25 },
        { item: 'Diamond', chance: 0.06, xp: 60 },
    ],
    // emberhusk: charred night-siege husk -> a burnt scavenger's bone + salvaged metal.
    emberhusk: [
        { item: 'Bone', chance: 0.7, xp: 4 },
        { item: 'Iron Nugget', chance: 0.4, xp: 8 },
        { item: 'Emerald', chance: 0.08, xp: 25 },
    ],
};

// Treasure-chest loot. Each row: { item, chance (0..1], effect, value, duration? }.
export const CHEST_LOOT = [
    { item: 'Health Potion', chance: 0.6, effect: 'heal', value: 30 },
    { item: 'Mana Potion', chance: 0.5, effect: 'mana', value: 40 },
    { item: 'Damage Scroll', chance: 0.3, effect: 'buff_damage', value: 1.5, duration: 30 },
    { item: 'Shield Scroll', chance: 0.25, effect: 'buff_defense', value: 0.5, duration: 30 },
    { item: 'Diamond', chance: 0.15, effect: 'xp', value: 50 },
    { item: 'Golden Crown', chance: 0.05, effect: 'xp', value: 200 },
    { item: 'Star Fragment', chance: 0.08, effect: 'xp', value: 100 },
];
