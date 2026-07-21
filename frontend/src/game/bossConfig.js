// bossConfig.js — the Shadow Dragon boss config (extracted from AdvancedGameFeatures S3-M4 p4).
// Pure data; consumed by world/bossSystem (the hook), ui/BossHealthBar, and render/BossEntity.
export const BOSS_CONFIG = {
    name: 'Shadow Dragon',
    icon: 'dragon',
    color: '#4B0082',
    secondaryColor: '#8B00FF',
    health: 700, // Increased health for a more epic multi-phase encounter
    damage: 20,
    speed: 3.5,
    size: 3.2,
    aggroRange: 30,
    attackRange: 5,
    attackCooldown: 2000,
    xpReward: 600,
    phases: [
        { hpPercent: 1.0, speed: 4.0, damage: 20, color: '#4B0082' }, // Phase 1: Aerial Strike
        { hpPercent: 0.6, speed: 5.5, damage: 25, color: '#8B0000' }, // Phase 2: Grounded Rage
        { hpPercent: 0.3, speed: 7.0, damage: 35, color: '#ff3300' }, // Phase 3: Enraged Inferno
    ],
};

// The boss-kill loot drop as [itemName, quantity]. SINGLE SOURCE OF TRUTH: world/bossSystem consumes it in
// the kill handler AND bossReward.test.js pins each item's registry rarity against it, so a change to the
// drop can never silently decouple from the ITEMS registry (item names MUST exist in src/data/items.js).
export const BOSS_LOOT = [
    ['Crown of the Dragon King', 1],
    ['Dragon Scale', 3],
];
