// spellUpgrades.js — the spell-upgrade progression hook (extracted from AdvancedGameFeatures
// S3-M4 p2: same SPELL_UPGRADES table + per-spell level/stat logic; mounted once in App).
import { useState, useEffect, useCallback, useRef } from 'react';
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

export const useSpellUpgrades = () => {
    const [spellLevels, setSpellLevels] = useState({
        fireball: 1, iceball: 1, lightning: 1, arcane: 1,
    });
    const [upgradeNotification, setUpgradeNotification] = useState(null);

    // #51 S3 restore-fix: hydrate local spellLevels FROM the store ONCE on mount so a loaded save's restored
    // levels (useGameStore.jsx restore path) aren't clobbered by the all-1s default + the push effect below.
    // Adopt only a NON-EMPTY restored map (store default is {} -> keep all-1s); merge keeps defaults for any
    // spell the save omits (forward-compat). One-shot (no two-way bind -> no push<->hydrate feedback loop).
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const restored = useGameStore.getState().spellLevels;
        if (restored && Object.keys(restored).length > 0) {
            setSpellLevels(prev => ({ ...prev, ...restored }));
        }
    }, []);

    const getSpellStats = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return null;
        const level = spellLevels[spellType] || 1;
        return upgrade.levels[level - 1];
    }, [spellLevels]);

    const upgradeSpell = useCallback((spellType) => {
        const upgrade = SPELL_UPGRADES[spellType];
        if (!upgrade) return false;

        const currentLevel = spellLevels[spellType] || 1;
        if (currentLevel >= 3) {
            setUpgradeNotification('Spell is already at maximum level!');
            setTimeout(() => setUpgradeNotification(null), 2000);
            return false;
        }

        const nextLevel = upgrade.levels[currentLevel];
        if (!nextLevel) return false;

        const requiredLevel = nextLevel.xpCost <= 100 ? 2 : nextLevel.xpCost <= 200 ? 3 : 5;
        const playerLevel = useGameStore.getState().getPlayerLevel() || 1;

        if (playerLevel < requiredLevel) {
            setUpgradeNotification(`Need Level ${requiredLevel} to upgrade ${upgrade.name}!`);
            setTimeout(() => setUpgradeNotification(null), 3000);
            return false;
        }

        setSpellLevels(prev => ({ ...prev, [spellType]: currentLevel + 1 }));
        setUpgradeNotification(`${nextLevel.name} unlocked! Damage: ${nextLevel.damage}, Cost: ${nextLevel.manaCost} MP`);
        setTimeout(() => setUpgradeNotification(null), 4000);

        return true;
    }, [spellLevels]);

    useEffect(() => {
        useGameStore.setState({ spellLevels: spellLevels });
        useGameStore.setState({ getSpellStats: getSpellStats });
        useGameStore.setState({ upgradeSpell: upgradeSpell });
    }, [spellLevels, getSpellStats, upgradeSpell]);

    return { spellLevels, getSpellStats, upgradeSpell, upgradeNotification, SPELL_UPGRADES };
};
