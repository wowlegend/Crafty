// Per-material hit-flash, and the reason it is per-material.
//
// The flash used to traverse a mob's group and write ONE colour — the body colour derived from
// `entity.color` — into every flashable material. Feature materials are authored DIFFERENTLY:
// `featureColor(tone, base)` returns '#e6dcc4' for bone and a 0.55-scaled base for dark. Nothing recorded
// what each material declared, so the first hit-flash to resolve overwrote every feature tone with the
// body colour, permanently, because nothing ever restored them. A villager's nose went flat after one hit.
//
// It was invisible to the visual baselines because damage has to be inflicted first; a still frame of an
// unhit mob looks correct.
//
// So each material records its own authored colour once, and "restore" means back to what THIS material
// declared rather than back to what the body declared.

/**
 * Record a material's authored colour, ONCE.
 *
 * Idempotent by design, and that is the load-bearing part: if this ran again mid-flash it would capture
 * the FLASH colour as authored, and the material would restore to red forever — worse than the original
 * bug. React re-renders can and do call into this while a flash is live.
 */
export function rememberAuthoredColor(material) {
  if (!material || !material.color) return;
  if (material.userData.authoredColor) return; // already recorded — never recapture
  material.userData.authoredColor = material.color.clone();
}

/** Put a material back to ITS OWN authored colour. A no-op if it was never recorded. */
export function restoreAuthoredColor(material) {
  const authored = material && material.userData && material.userData.authoredColor;
  if (!authored) return;
  material.color.copy(authored);
}

/**
 * Flash a list of materials, returning how many were touched.
 *
 * The count is the DENOMINATOR: every caller-side assertion about colour reads a value that a freshly
 * built material would also have, so "the colour is right" cannot distinguish a working flash from one
 * that examined nothing.
 */
export function applyHitFlash(materials, hitColor, isHit) {
  let touched = 0;
  for (const m of materials || []) {
    if (!m || !m.color) continue;
    if (isHit) m.color.copy(hitColor);
    touched++;
  }
  return touched;
}
