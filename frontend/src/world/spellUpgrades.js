// spellUpgrades.js — the spell-upgrade progression hook (extracted from AdvancedGameFeatures
// S3-M4 p2: same SPELL_UPGRADES table + per-spell level/stat logic; mounted once in App).
import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';

export const useSpellUpgrades = () => {
    const [spellLevels, setSpellLevels] = useState({
        fireball: 1, iceball: 1, lightning: 1, arcane: 1,
    });
    const [upgradeNotification, setUpgradeNotification] = useState(null);

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
