export const solveMeleeDamage = (attackerStats, baseWeaponDmg = 5) => {
    const strength = attackerStats.strength || 10;
    const agility = attackerStats.agility || 10;
    const baseDmg = baseWeaponDmg + (strength * 1.5);
    const critChance = Math.min(0.75, 0.05 + (agility * 0.005));
    const isCrit = Math.random() < critChance;
    const multiplier = isCrit ? 2.0 : 1.0;
    
    return {
        damage: Math.round(baseDmg * multiplier),
        isCrit,
        color: isCrit ? '#FF4500' : '#FFFFFF'
    };
};

export const solveSpellDamage = (attackerStats, baseSpellDmg = 20, spellType = 'fireball') => {
    const intellect = attackerStats.intellect || 10;
    const agility = attackerStats.agility || 10;
    const intellectMultiplier = 1.0 + (intellect * 0.02);
    const finalDmg = Math.round(baseSpellDmg * intellectMultiplier);
    const critChance = Math.min(0.50, 0.05 + (agility * 0.003));
    const isCrit = Math.random() < critChance;
    
    let color = '#9932CC'; // arcane
    if (spellType === 'fireball') color = '#FF4500';
    else if (spellType === 'iceball') color = '#00BFFF';
    else if (spellType === 'lightning') color = '#FFD700';

    return {
        damage: Math.round(isCrit ? finalDmg * 1.8 : finalDmg),
        isCrit,
        color
    };
};

export const mitigateDamage = (targetStats, incomingDmg) => {
    const armor = targetStats.armor || 0;
    const dr = armor / (armor + 100);
    const finalDmg = Math.max(1, Math.round(incomingDmg * (1.0 - dr)));
    return finalDmg;
};
