// spellCast.js — pure cast-resolution helpers (no React/store) so the load-bearing damage line is gate-able.
// #51: the gameplay cast must read the LEVELED base damage from the spell-upgrade hook (store-mirrored
// getSpellStats) instead of the static SPELL_TYPES base, so spell upgrades actually affect combat. Null-safe:
// pre-mount (getSpellStats not yet pushed) or an unmapped spell (shield/heal) falls back to the static base.
// Balance-safe: the upgrade table's L1 damage equals the static base for all 4 spells, so L1 is byte-identical.
export function resolveCastBaseDamage(getSpellStats, spell, spellType) {
  const leveled = typeof getSpellStats === 'function' ? getSpellStats(spellType) : null;
  return leveled?.damage ?? spell.damage;
}
