import { KEY_MAP } from './keyMap';

const ASPECT_NOTICES = Object.freeze({
  roar: 'notice.aspect.roar', grab: 'notice.aspect.grab', snare: 'notice.aspect.snare', imbue: 'notice.aspect.imbue',
});

/**
 * aspectUnlockHint(talentId) -> the just-in-time teaching notice for a freshly-unlocked Aspect verb: a dictionary key
 * per verb (`notice.aspect.<verb>`, en and zh-CN) with the KEY taken from KEY_MAP (the binding SoT, so the taught key can
 * never drift from the live handler). null for any non-Aspect-verb talent (no toast). e.g. 'wildheart_roar' ->
 * { key: 'notice.aspect.roar', vars: { key: 'R' } }, shown as 'WILDHEART unlocked — press R to roar'.
 */
export function aspectUnlockHint(talentId) {
  const row = KEY_MAP.find((r) => r.talent === talentId && r.verb);
  if (!row) return null;
  return { key: ASPECT_NOTICES[row.verb], vars: { key: row.key } };
}
