export const solveMeleeDamage = (attackerStats, baseWeaponDmg = 5) => {
    const strength = attackerStats.strength || 10;
    const agility = attackerStats.agility || 10;
    const baseDmg = baseWeaponDmg + (strength * 1.5);
    const critChance = Math.min(0.75, 0.05 + (agility * 0.005));
    const isCrit = Math.random() < critChance;
    const multiplier = isCrit ? 2.0 : 1.0;
    
    return {
        damage: Math.round(baseDmg * multiplier),
        isCrit
    };
};

// `_spellType` is retained in the signature and deliberately unused: EnhancedMagicSystem.jsx:204 passes it
// positionally, and its only reader was the element-colour ladder removed with the dead `color` field.
// Dropping the parameter would silently change the arity of a call site that still supplies three args.
export const solveSpellDamage = (attackerStats, baseSpellDmg = 20, _spellType = 'fireball') => {
    const intellect = attackerStats.intellect || 10;
    const agility = attackerStats.agility || 10;
    const intellectMultiplier = 1.0 + (intellect * 0.02);
    const finalDmg = Math.round(baseSpellDmg * intellectMultiplier);
    const critChance = Math.min(0.50, 0.05 + (agility * 0.003));
    const isCrit = Math.random() < critChance;
    
    // NO `color` HERE. This used to return a per-element hex, read by nothing: both production callers
    // destructure damage/isCrit only (Components.jsx:235, EnhancedMagicSystem.jsx:204). Worse, the four
    // hexes were a SECOND palette that disagreed with the canonical one in src/theme/tokens.js on every
    // entry — fire #FF4500 against MAGIC.fire #FF7A3C, ice #00BFFF against #6FC8FF, lightning #FFD700
    // against #FFE066, arcane #9932CC against #B36BFF. A damage solver is not a palette; the renderer
    // reads MAGIC. Removed rather than corrected, so there is one source of element colour and not two.
    return {
        damage: isCrit ? Math.round(finalDmg * 1.8) : finalDmg, // finalDmg is already rounded (L20); only crit needs re-rounding
        isCrit
    };
};

export const mitigateDamage = (targetStats, incomingDmg) => {
    const armor = targetStats.armor || 0;
    const dr = armor / (armor + 100);
    const finalDmg = Math.max(1, Math.round(incomingDmg * (1.0 - dr)));
    return finalDmg;
};
