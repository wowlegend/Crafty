// spellCast.js — pure cast-resolution helpers (no React/store) so the load-bearing damage line is gate-able.
// #51: the gameplay cast must read the LEVELED base damage from the spell-upgrade hook (store-mirrored
// getSpellStats) instead of the static SPELL_TYPES base, so spell upgrades actually affect combat. Null-safe:
// before the upgrade hook mounts (getSpellStats returns null) it falls back to spell.damage (the static base);
// a spellType with no upgrade entry is prevented upstream by the caller's !spell guard, not handled here.
// Balance-safe: the upgrade table's L1 damage equals the static base for all 4 spells, so L1 is byte-identical.
export function resolveCastBaseDamage(getSpellStats, spell, spellType) {
  const leveled = typeof getSpellStats === 'function' ? getSpellStats(spellType) : null;
  return leveled?.damage ?? spell.damage;
}

// W1 #9 (mana-wire): castSpell read the LEVELED damage from getSpellStats but charged the STATIC
// SPELL_MANA_COSTS, so the L2/L3 manaCost upgrade was never spent (mana upgrades were free). This is the
// pure, gate-able seam: it charges the leveled manaCost from the store-mirrored getSpellStats, falling back
// to the static base before the upgrade hook mounts (getSpellStats not yet pushed) — the reachable fallback;
// a spellType absent from the upgrade table is prevented upstream. `staticBase` is SPELL_MANA_COSTS[spellType] (the caller resolves the table
// lookup so this stays store/import-free). The `||` chain (not `??`) preserves the original line's semantics:
// a falsy/0 leveled manaCost falls through to the static base — the upgrade table has no 0-cost rows.
export function resolveCastManaCost(getSpellStats, spellType, staticBase) {
  const leveled = typeof getSpellStats === 'function' ? getSpellStats(spellType) : null;
  return (leveled && leveled.manaCost) || staticBase || 15;
}
