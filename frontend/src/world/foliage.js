// Deterministic foliage SHAPES (World-Design M4a). Pure offset-lists relative to the surface
// block — the worker stamps them with chunk-border clamping. Snow PINES are the new biome-distinct
// flora (a tapered evergreen, unlike the round plains tree); plains trees + desert cacti stay
// inline in the worker. NO RNG here: the worker passes a height derived from its deterministic
// vegRandom, so the same seed regenerates the identical forest.
export function pineShape(height) {
  // trunk: a single column rising from the surface (dy = 1..height)
  const trunk = [];
  for (let ty = 1; ty <= height; ty++) trunk.push([0, ty, 0]);
  // canopy: a tapered cone (fat bottom -> pointed spire). 5 tiers; the spire pokes 1 above the trunk.
  const leaves = [];
  const radii = [2, 2, 1, 1, 0];
  const coneBase = height - 3; // tiers span dy = height-3 .. height+1
  for (let tier = 0; tier < radii.length; tier++) {
    const r = radii[tier];
    const dy = coneBase + tier;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= r) leaves.push([dx, dy, dz]);
      }
    }
  }
  return { trunk, leaves };
}

// Acacia (savanna, Phase B M1 slice 3): a tall bare trunk capped by a FLAT WIDE umbrella canopy —
// the iconic veld silhouette, distinct from the round oak and the conical pine. Deterministic; no RNG.
export function acaciaShape(height) {
  const trunk = [];
  for (let ty = 1; ty <= height; ty++) trunk.push([0, ty, 0]);
  const leaves = [];
  const crown = height; // canopy sits AT the trunk top (flat) — no spire, unlike the pine
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const md = Math.abs(dx) + Math.abs(dz);
      if (md <= 3) leaves.push([dx, crown, dz]);        // wide flat top disc
      if (md === 2 || md === 3) leaves.push([dx, crown - 1, dz]); // a thin rim-droop ring under the edge
    }
  }
  return { trunk, leaves };
}

// Swamp tree (Phase B M1 slice 4): a SHORT trunk under a wide LOW droopy canopy that drapes below the
// crown — the murky wetland look, distinct from the round oak / conical pine / flat acacia. No RNG.
export function swampShape(height) {
  const trunk = [];
  for (let ty = 1; ty <= height; ty++) trunk.push([0, ty, 0]);
  const leaves = [];
  const top = height;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const md = Math.abs(dx) + Math.abs(dz);
      if (md <= 2) leaves.push([dx, top, dz]);       // modest cap
      if (md <= 3) leaves.push([dx, top - 1, dz]);   // WIDE droopy underlayer (widest part sits low)
      if (md === 3) leaves.push([dx, top - 2, dz]);  // hanging fringe drooping below the crown
    }
  }
  return { trunk, leaves };
}
