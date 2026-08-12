// spellUpgrades.js — the spell-upgrade progression hook (extracted from AdvancedGameFeatures
// S3-M4 p2: same SPELL_UPGRADES table + per-spell level/stat logic; mounted once in App).
import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';

// the spell-upgrade table — this hook's data (S3-M4 fix: it was orphaned into render/PetEntities.jsx
// by the part-3 slice while the hook referenced it undefined — a mount crash; restored to its home).
export const SPELL_UPGRADES = {
    fireball: {
        name: 'Fireball',
        icon: 'fire',
        levels: [
            { level: 1, damage: 50, manaCost: 15, name: 'Fireball I', xpCost: 0 },
            { level: 2, damage: 80, manaCost: 18, name: 'Fireball II', xpCost: 100 },
            { level: 3, damage: 120, manaCost: 22, name: 'Fireball III', xpCost: 300 },
        ],
    },
    iceball: {
        name: 'Iceball',
        icon: 'ice',
        levels: [
            { level: 1, damage: 40, manaCost: 12, name: 'Iceball I', xpCost: 0 },
            { level: 2, damage: 65, manaCost: 15, name: 'Iceball II', xpCost: 100 },
            { level: 3, damage: 100, manaCost: 19, name: 'Iceball III', xpCost: 300 },
        ],
    },
    lightning: {
        name: 'Lightning',
        icon: 'lightning',
        levels: [
            { level: 1, damage: 75, manaCost: 25, name: 'Lightning I', xpCost: 0 },
            { level: 2, damage: 110, manaCost: 30, name: 'Lightning II', xpCost: 150 },
            { level: 3, damage: 160, manaCost: 35, name: 'Lightning III', xpCost: 400 },
        ],
    },
    arcane: {
        name: 'Arcane',
        icon: 'arcane',
        levels: [
            { level: 1, damage: 60, manaCost: 18, name: 'Arcane I', xpCost: 0 },
            { level: 2, damage: 90, manaCost: 22, name: 'Arcane II', xpCost: 120 },
            { level: 3, damage: 140, manaCost: 28, name: 'Arcane III', xpCost: 350 },
        ],
    },
};

/** The level a spell is actually at, given the persisted map. Absent/blank -> Level 1. */
// INTERNAL. `levelOf` and `statsFor` below are read only by this module (three call sites); both were
// exported and neither had a single importer. Kept exported: SPELL_UPGRADES, requiredLevelForUpgrade,
// useSpellUpgrades, which do.
const levelOf = (spellLevels, spellType) => (spellLevels && spellLevels[spellType]) || 1;

/**
 * The required PLAYER level to buy the given next-level upgrade entry, derived from its xpCost.
 * SINGLE SOURCE OF TRUTH for the ladder: both the real gate (upgradeSpell) and the display gate
 * (SpellUpgradePanel) call this, so the two can never drift. No next entry (maxed) -> 0.
 */
export function requiredLevelForUpgrade(nextLevelEntry) {
    if (!nextLevelEntry) return 0;
    const c = nextLevelEntry.xpCost;
    return c <= 100 ? 2 : c <= 200 ? 3 : 5;
}

/** Pure: the stat row a spell casts at. The ONE place level -> stats is resolved. */
function statsFor(spellLevels, spellType) {
    const upgrade = SPELL_UPGRADES[spellType];
    if (!upgrade) return null;
    return upgrade.levels[levelOf(spellLevels, spellType) - 1];
}

export const useSpellUpgrades = () => {
    // B2e (18-domain review, CRITICAL): THE STORE OWNS spellLevels. There is no local copy.
    //
    // This hook used to keep its own React `spellLevels` state and hydrate it from the store exactly ONCE,
    // on mount. It mounts at App boot — when the store's spellLevels is still the `{}` default — so the
    // hydration adopted nothing and the one-shot latch closed forever. When the player then clicked Load,
    // `loadWorldData` restored their levels into the STORE and nothing told the hook. So:
    //   - the Progression panel (reading the store) displayed "MAX RANK"
    //   - every spell cast (reading this hook's getSpellStats) fired at LEVEL 1
    //   - and the first Upgrade click pushed the hook's stale all-1s map back over the restored levels,
    //     which the autosave then wrote to disk. The player's mastery was silently deleted.
    //
    // A hydrate-once mirror of persisted state is a bug generator. spellLevels is persisted; the store is
    // its home; this hook derives from it and writes through it. Nothing to hydrate, nothing to clobber.
    const spellLevels = useGameStore((s) => s.spellLevels);
    const [upgradeNotification, setUpgradeNotification] = useState(null);

    const getSpellStats = useCallback((spellType) => statsFor(spellLevels, spellType), [spellLevels]);

    const upgradeSpell = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return false;

        const currentLevel = levelOf(useGameStore.getState().spellLevels, spellType);
        if (currentLevel >= upgrade.levels.length) {
            setUpgradeNotification('Spell is already at maximum level!');
            setTimeout(() => setUpgradeNotification(null), 2000);
            return false;
        }

        const nextLevel = upgrade.levels[currentLevel];
        if (!nextLevel) return false;

        const requiredLevel = requiredLevelForUpgrade(nextLevel);
        const playerLevel = useGameStore.getState().getPlayerLevel() || 1;

        if (playerLevel < requiredLevel) {
            setUpgradeNotification(`Need Level ${requiredLevel} to upgrade ${upgrade.name}!`);
            setTimeout(() => setUpgradeNotification(null), 3000);
            return false;
        }

        // Write through to the owner. Merge onto the LIVE map (not a captured one) so a concurrent
        // load/upgrade cannot resurrect a stale snapshot of the other spells.
        useGameStore.setState((s) => ({
            spellLevels: { ...s.spellLevels, [spellType]: currentLevel + 1 },
        }));
        setUpgradeNotification(`${nextLevel.name} unlocked! Damage: ${nextLevel.damage}, Cost: ${nextLevel.manaCost} MP`);
        setTimeout(() => setUpgradeNotification(null), 4000);

        return true;
    }, []);

    // Publish the resolvers for the imperative consumers (EnhancedMagicSystem's cast path reads
    // getSpellStats off the store). NOTE: no spellLevels write here — that was the clobber.
    useEffect(() => {
        useGameStore.setState({ getSpellStats: getSpellStats, upgradeSpell: upgradeSpell });
    }, [getSpellStats, upgradeSpell]);

    return { spellLevels, getSpellStats, upgradeSpell, upgradeNotification, SPELL_UPGRADES };
};
