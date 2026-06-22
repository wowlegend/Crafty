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

// Jungle tree (Phase B B1 slice 5): a tall trunk under a BROAD, LAYERED umbrella vine-canopy — a wide flat
// crown over a wider underlayer ring, a small emergent tuft poking above (the tropical emergent layer), and
// four hanging VINE strands drooping below the rim. The widest + most layered canopy; distinct from the round
// oak / conical pine / flat acacia / low droopy swamp. Deterministic; no RNG.
export function jungleShape(height) {
  const trunk = [];
  for (let ty = 1; ty <= height; ty++) trunk.push([0, ty, 0]);
  const leaves = [];
  const crown = height;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const md = Math.abs(dx) + Math.abs(dz);
      if (md <= 4) leaves.push([dx, crown, dz]);              // wide flat crown disc (radius 4 — the broadest canopy)
      if (md >= 2 && md <= 4) leaves.push([dx, crown - 1, dz]); // a wider underlayer ring -> layered tropical depth
    }
  }
  // emergent tuft poking above the crown (the tallest tropical canopy layer)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (Math.abs(dx) + Math.abs(dz) <= 1) leaves.push([dx, crown + 1, dz]);
    }
  }
  // four hanging vine strands drooping below the canopy rim (the jungle "vine" read)
  for (const [vx, vz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    leaves.push([vx, crown - 2, vz]);
    leaves.push([vx, crown - 3, vz]);
  }
  return { trunk, leaves };
}
