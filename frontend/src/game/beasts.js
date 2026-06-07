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
 * Per-form locomotion/damage re-skin is M5; these are the COLLIDER dims only. Numbers are
 * Kevin-tunable (KEVIN-REVIEW-BATCH §5 #5) — change them freely, the swap is data-driven.
 */

// Base human capsule — restored on form-exit/death/load. Matches Components.jsx CapsuleCollider args.
export const BASE_CAPSULE = { halfHeight: 0.5, radius: 0.4 };

// element -> { id, halfHeight, radius }. id is the beast silhouette/VFX key (used at M7).
export const BEAST_FORMS = {
  fire:      { id: 'comet', halfHeight: 0.42, radius: 0.30 },
  ice:       { id: 'bull',  halfHeight: 0.45, radius: 0.62 },
  lightning: { id: 'hawk',  halfHeight: 0.62, radius: 0.30 },
  arcane:    { id: 'golem', halfHeight: 0.70, radius: 0.50 },
};

/** getBeastForm(element) -> the form object, or null for an unknown/missing element. */
export function getBeastForm(element) {
  return BEAST_FORMS[element] || null;
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
