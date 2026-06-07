/**
 * beasts.js — S2-B1 WILDHEART: the per-element beast-form collider profiles (pure data).
 *
 * The transactional collider hot-swap (Components.jsx) reads `BEAST_FORMS[element]` and calls
 * `collider.setShape(new rapier.Capsule(halfHeight, radius))` in-place (handle preserved, no
 * re-bind, ZERO voxel edits). `BASE_CAPSULE` is the human form restored on EVERY exit path
 * (the no-permanent-beast invariant) and matches the live `<CapsuleCollider args={[0.5,0.4]}>`
 * in Components.jsx (Rapier arg order is [halfHeight, radius]).
 *
 * The 4 forms are deliberately distinct MASS-SHAPES (content-variety, not recolors — S2 spec §7.7):
 *   comet (fire)      — small, thin, short          -> glass-cannon dash
 *   bull  (ice)       — fattest + short             -> heavy shove-charge (the FPS-de-risk target, M2)
 *   hawk  (lightning) — tall + thin                 -> agile aerial skirmisher
 *   golem (arcane)    — tall + wide (massive)       -> slow stun-monolith
 * Per-form combat + locomotion re-skin (M5) lives in the SAME table — `damageMult`/`cooldownMult`
 * (melee feel; cone range/arc are deliberately NOT per-form -> boss hit-reg parity) and `moveMult`/
 * `gravityMult`/`jumpMult` (movement feel) — all applied AT the read site (derive-never-bake; base
 * attrs + base capsule never mutated). Numbers are Kevin-tunable (KEVIN-REVIEW-BATCH §5 #5).
 * (`turnRate` is intentionally OMITTED: this is a camera-relative pointer-lock controller -> turning
 * is mouse-driven/instant, so there is no turn-rate seam; a field nothing reads would be dead weight.)
 */

// Base human capsule — restored on form-exit/death/load. Matches Components.jsx CapsuleCollider args.
export const BASE_CAPSULE = { halfHeight: 0.5, radius: 0.4 };

// element -> collider mass-shape (id/halfHeight/radius) + M5 combat (damageMult/cooldownMult) +
// M5 locomotion (moveMult/gravityMult/jumpMult). Distinct per axis = the two-axis sampler-trap defense.
export const BEAST_FORMS = {
  fire:      { id: 'comet', halfHeight: 0.42, radius: 0.30, damageMult: 0.90, cooldownMult: 0.55, moveMult: 1.40, gravityMult: 1.00, jumpMult: 1.05 },
  ice:       { id: 'bull',  halfHeight: 0.45, radius: 0.62, damageMult: 1.60, cooldownMult: 1.50, moveMult: 0.70, gravityMult: 1.10, jumpMult: 0.80 },
  lightning: { id: 'hawk',  halfHeight: 0.62, radius: 0.30, damageMult: 0.85, cooldownMult: 0.70, moveMult: 1.25, gravityMult: 0.55, jumpMult: 1.50 },
  arcane:    { id: 'golem', halfHeight: 0.70, radius: 0.50, damageMult: 1.55, cooldownMult: 1.60, moveMult: 0.60, gravityMult: 1.20, jumpMult: 0.70 },
};

/** getBeastForm(element) -> the form object, or null for an unknown/missing element. */
export function getBeastForm(element) {
  return BEAST_FORMS[element] || null;
}

// --- M5: per-form combat + locomotion multipliers, derived AT the read site (base attrs + the base
// capsule are never mutated). Every helper returns the IDENTITY (1) for a null/unknown element, so the
// HUMAN form is a transparent no-op — the human read path stays byte-identical to pre-M5.

/** formDamageMult(element) -> melee damage scalar (1 for human/unknown). */
export function formDamageMult(element) {
  return BEAST_FORMS[element]?.damageMult ?? 1;
}

/** formMeleeCooldownMult(element) -> MELEE_COOLDOWN scalar (1 for human/unknown). >1 = slower swings. */
export function formMeleeCooldownMult(element) {
  return BEAST_FORMS[element]?.cooldownMult ?? 1;
}

/** formLocomotion(element) -> { moveMult, gravityMult, jumpMult } (all 1 for human/unknown). */
export function formLocomotion(element) {
  const f = BEAST_FORMS[element];
  return {
    moveMult: f?.moveMult ?? 1,
    gravityMult: f?.gravityMult ?? 1,
    jumpMult: f?.jumpMult ?? 1,
  };
}

/**
 * setColliderToForm(collider, rapier, form) -> did-swap. In-place mutate of the collider's capsule
 * shape (handle/index/groups preserved). `rapier` is the @react-three/rapier `rapier` module (from
 * useRapier()); `form` is a {halfHeight, radius}. Returns false (no-op) if any arg is missing.
 * Extracted so the swap LOGIC is unit-testable without a live Rapier world.
 */
export function setColliderToForm(collider, rapier, form) {
  if (!collider || !rapier || !form) return false;
  collider.setShape(new rapier.Capsule(form.halfHeight, form.radius));
  return true;
}

/**
 * restoreBaseCollider(collider, rapier, controller) -> did-restore. The transactional restore: shape
 * back to BASE_CAPSULE + the KCC config reset to base (impulse-shoving OFF — the bull turns it on in
 * M5, so the base reset must run on EVERY restore). This is the no-permanent-beast operation; it is
 * always a SHRINK (no grow-depenetration needed), so it is safe to call imperatively off a frame.
 */
export function restoreBaseCollider(collider, rapier, controller) {
  const ok = setColliderToForm(collider, rapier, BASE_CAPSULE);
  if (ok && controller && typeof controller.setApplyImpulsesToDynamicBodies === 'function') {
    controller.setApplyImpulsesToDynamicBodies(false);
  }
  return ok;
}

// The loaded spell picks the beast form (S2 spec §4): the 4 spells map to the 4 elements that key
// BEAST_FORMS. fireball->comet, iceball->bull, lightning->hawk, arcane->golem.
export const SPELL_TO_ELEMENT = { fireball: 'fire', iceball: 'ice', lightning: 'lightning', arcane: 'arcane' };

/** elementForSpell(activeSpell) -> the beast-form element key; falls back to 'fire' (the default spell). */
export function elementForSpell(activeSpell) {
  return SPELL_TO_ELEMENT[activeSpell] || 'fire';
}

// Inverse of SPELL_TO_ELEMENT: a beast-form element -> the spell whose name IS the damageMob spark
// case, so a beast's melee sparks its OWN element. Inverted from SPELL_TO_ELEMENT so the two can't drift.
const ELEMENT_TO_SPELL = Object.fromEntries(Object.entries(SPELL_TO_ELEMENT).map(([spell, el]) => [el, spell]));

/** spellForElement(element) -> the spark-type string for that beast element, or null for human/unknown. */
export function spellForElement(element) {
  return ELEMENT_TO_SPELL[element] || null;
}

/**
 * resolveFormMelee(rawDamage, element) -> { dealt, sparkType }. The M5 melee re-skin COMBINATION,
 * extracted so the load-bearing wiring (form damage multiply + element spark) is unit-locked — a future
 * edit can't silently un-wire it (the M4 silently-dead-param lesson, one layer up). The spark derives
 * from the LOCKED form element, NOT the live activeSpell: spell-switching mid-form (Digit1-4 is not
 * gated in-form) must not desync the spark from the body. Human (null element) -> the identity:
 * dealt = rawDamage (already an int from solveMeleeDamage), sparkType 'physical'.
 */
export function resolveFormMelee(rawDamage, element) {
  return {
    dealt: Math.round(rawDamage * formDamageMult(element)),
    sparkType: spellForElement(element) || 'physical',
  };
}
