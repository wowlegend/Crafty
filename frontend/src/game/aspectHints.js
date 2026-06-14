import { KEY_MAP } from './keyMap';

/**
 * aspectUnlockHint(talentId) -> a just-in-time teaching string for a freshly-unlocked Aspect verb,
 * sourced from KEY_MAP (the binding SoT, so the taught key can never drift from the live handler).
 * null for any non-Aspect-verb talent (no toast). e.g. 'wildheart_roar' ->
 * 'WILDHEART unlocked — press R to roar'.
 */
export function aspectUnlockHint(talentId) {
  const row = KEY_MAP.find((r) => r.talent === talentId && r.verb);
  if (!row) return null;
  const parts = String(row.label).split(' — ');
  const aspect = parts[0];
  const verb = parts[1] || row.verb;
  return `${aspect} unlocked — press ${row.key} to ${verb}`;
}
