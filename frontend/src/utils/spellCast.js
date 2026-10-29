// spellCast.js — pure cast-resolution helpers (no React/store) so the load-bearing damage line is gate-able.
// The cast reads its base damage from the store's getSpellStats, the tier its caster's level has reached
// (game/spellTiers.js), not the static SPELL_TYPES base, so a level's tier reaches combat. A spell with no tier row
// (getSpellStats returns null) falls back to spell.damage; a spellType the game does not know is stopped upstream by
// the caller's !spell guard. Tier I equals the static base for all four spells.
export function resolveCastBaseDamage(getSpellStats, spell, spellType) {
  const leveled = typeof getSpellStats === 'function' ? getSpellStats(spellType) : null;
  return leveled?.damage ?? spell.damage;
}

// The cast charges the manaCost of the same tier row, so a higher tier costs what its row says. `staticBase` is
// SPELL_MANA_COSTS[spellType] (the caller resolves it, so this stays store- and import-free) and covers a spell with no
// tier row. `||`, not `??`: a 0 manaCost falls through to the static base, and no tier row costs 0.
export function resolveCastManaCost(getSpellStats, spellType, staticBase) {
  const leveled = typeof getSpellStats === 'function' ? getSpellStats(spellType) : null;
  return (leveled && leveled.manaCost) || staticBase || 15;
}
