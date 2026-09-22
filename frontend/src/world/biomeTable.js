// Biome table (World-Design M3 -> W2-T8 variety expansion).
//
// HISTORY: M3 lifted the worldgen surface/secondary block choice out of an inline 3-branch if/else
// into this one pure function so M4 can add per-biome columns (height curve, foliage, seabed) without
// touching the worker's hot loop. M3 was BYTE-IDENTICAL (3 biomes; continent accepted but ignored).
//
// W2-T8 (2026-06-17): the table grew from 3 -> 10 biomes (snow/taiga/plains/forest/meadow/swamp/
// jungle/savanna/desert/mesa) with a multi-axis (temperature x moisture x continent) selection so the
// world no longer reads same-everywhere. Each biome now carries:
//   surfaceBlock   — the top voxel (EXISTING atlas layer id only: 1 grass / 2 dirt / 3 stone /
//                    4 sand / 5 snow / 6 wood — the texture atlas has 16 layers; NEW surface
//                    materials are M4b, so variety here is achieved by RECOMBINING existing layers
//                    + the flora/tint metadata below, not by minting new block ids).
//   secondaryBlock — the 3-deep subsurface band under the surface voxel.
//   flora          — a flora-KIND string the foliage decorator WILL branch on in M4. TODAY the worker
//                    (terrain.worker.js ~484-522) still branches on surfaceBlock, so flora is a FORWARD
//                    CONTRACT, not yet truthful: until M4 wires it, biomes that share a surfaceBlock
//                    share foliage regardless of flora. Known present-day mismatches that M4 resolves:
//                    mesa (flora 'none', surfaceBlock 4=sand) spawns CACTI like the desert — a mild
//                    rust-badland oddity that exists now; swamp (flora 'swamp', surfaceBlock 2=dirt)
//                    spawns NO foliage; taiga (flora 'pine', surfaceBlock 1=grass) spawns broadleaf
//                    trees, not pines (only surfaceBlock 5=snow currently triggers pines).
//   tint           — a per-biome vertex-tint hex the M4 mesher folds into the unused color.g/color.b
//                    vertex channels (the terrain shader currently reads only color.r = blockType).
//
// CAPTURE-DETERMINISM: pickBiome is PURE (no RNG, no time) — same (temperature, moisture, continent)
// always yields the same biome, so the seeded worldgen + visual capture stay reproducible.
//
// PRESERVED HARD CORNERS (downstream pins depend on these, byte-identical to the old inline branch):
//   - cold (temperature < 0.3)                       -> snow   (surfaceBlock 5 / secondary 3)
//   - hot+dry (temperature > 0.7 && moisture < 0.3)  -> desert (surfaceBlock 4 / secondary 4)
// These keep climate.test.js (origin grass, [0,-40] snow) + the biome-snow visual baseline stable.
//
// FRESH OBJECT: every call returns a NEW object (spread) — the worker reassigns surfaceBlock for the
// beach band, so the result must not share a frozen/singleton instance.
export const BIOMES = {
  // Cold
  snow:    { surfaceBlock: 5, secondaryBlock: 3, flora: 'pine',        tint: '#eaf3ff' }, // snow / stone — icy spires
  taiga:   { surfaceBlock: 1, secondaryBlock: 2, flora: 'pine',        tint: '#9fb89a' }, // cool-green boreal grass + pines
  // Temperate
  plains:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'plains_tree', tint: '#8fb45a' }, // grass / dirt — open meadow
  forest:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'forest',      tint: '#5e8c3a' }, // grass / dirt — dense deep-green
  meadow:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'flowers',     tint: '#a6c763' }, // coastal temperate flower flats
  swamp:   { surfaceBlock: 2, secondaryBlock: 2, flora: 'swamp',       tint: '#6b7d49' }, // dirt / dirt — murky wetland
  // Hot
  jungle:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'jungle',      tint: '#3fae46' }, // grass / dirt — vivid canopy
  savanna: { surfaceBlock: 1, secondaryBlock: 2, flora: 'savanna',     tint: '#c2b466' }, // grass / dirt — dry golden veld
  desert:  { surfaceBlock: 4, secondaryBlock: 4, flora: 'cactus',      tint: '#dccf8a' }, // sand / sand — dunes + cacti
  mesa:    { surfaceBlock: 4, secondaryBlock: 2, flora: 'none',        tint: '#b06a3c' }, // sand over dirt — rust badlands
};

// Multi-axis biome selection. Order matters: the two HARD CORNERS run FIRST (byte-identical to the
// legacy branch) so the climate/visual pins hold; the temperate/hot variety fills the middle, using
// `continent` (coastal continent < 0 vs inland >= 0) plus the temperature/moisture quadrants.
/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * BIOME IDS AND TINTS — the consumer the `tint` field never had (QUEUE.md B2, Q14).
 *
 * All ten biomes above have declared a `tint` since they were written, and a repo-wide grep found NO
 * consumer. Meanwhile SIX of the ten share `surfaceBlock: 1` — taiga, plains, forest, meadow, jungle,
 * savanna — so six of ten biomes render pixel-identical at ground level. Kevin's own recorded question
 * was "how do different biomes appear?", and today the honest answer is: four of them do.
 *
 * DERIVED FROM `BIOMES`, NEVER TYPED. Both tables below are computed from the object above, so a biome
 * added or a tint edited cannot desynchronise them — the failure mode a hand-written parallel array has
 * by construction, and the one a numeric shader index would make silent rather than loud.
 *
 * ID STABILITY IS THE CONTRACT. The id is the index into `BIOME_NAMES`, i.e. `Object.keys(BIOMES)` order.
 * That order is therefore load-bearing: it is baked into chunk geometry as a vertex attribute, so
 * REORDERING the object retints every already-meshed chunk. Append new biomes at the END. A gate pins
 * the current order so a reorder fails loudly instead of silently recolouring the world.
 */
// Each entry carries its own key as `name`, stamped once at module init. `pickBiome` returns
// `{ ...BIOMES.x }`, so this makes the biome's identity travel with every pick WITHOUT touching any of
// pickBiome's branches — the alternative was a parallel name-returning function that would have had to
// mirror that branch ladder and could drift from it.
for (const [k, v] of Object.entries(BIOMES)) v.name = k;

export const BIOME_NAMES = Object.keys(BIOMES);
export const BIOME_ID = Object.fromEntries(BIOME_NAMES.map((n, i) => [n, i]));

/** PURE. '#rrggbb' -> [r,g,b] in 0..1, the form a shader uniform wants. */
export function hexToRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return [1, 1, 1]; // unknown -> white, i.e. tint is a no-op rather than a black world
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Flat Float32Array of [r,g,b] per biome, indexed by BIOME_ID — ready for a `uniform vec3[]`. */
export const BIOME_TINT_RGB = new Float32Array(
  BIOME_NAMES.flatMap((n) => hexToRgb01(BIOMES[n].tint)),
);

/**
 * PURE. A LUMINANCE-PRESERVING tint: scale the surface colour toward the biome hue without changing how
 * bright it reads. A naive `mix(c, c * tint, s)` darkens every biome whose tint is not white, which on a
 * bold-flat art direction reads as dirt rather than as a biome. Normalising the tint to unit luminance
 * first means `strength` controls HUE SHIFT only, and the locked look survives.
 *
 * Computed on the CPU and uploaded as a `uniform vec3[]`, so the shader is a single multiply and there is
 * NO GLSL twin of this arithmetic to drift from it. That is the point of doing it here: a shader is
 * unreachable by every gate this repo has, so the only safe place for the maths is somewhere a node test
 * can drive it.
 */
export function tintPreservingLuminance(rgb, strength) {
  const L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (!(L > 0)) return [1, 1, 1];
  const s = Math.min(1, Math.max(0, Number(strength) || 0));
  return rgb.map((c) => 1 + ((c / L) - 1) * s);
}

export function pickBiome(temperature, moisture, continent) {
  const coastal = continent < 0; // near a continental edge (low/zero continent noise)

  // --- HARD CORNER 1: cold -> snow (preserves climate.test.js [0,-40] snow + biome-snow baseline) ---
  // temperature < 0.3 stays snow byte-identically; the cold-but-wetter taiga fringe is a SEPARATE
  // branch below (it sits just ABOVE this corner so every column the old branch made snow stays snow).
  if (temperature < 0.3) {
    return { ...BIOMES.snow };
  }

  // --- HARD CORNER 2: hot + dry -> desert (preserves the legacy sand surface/secondary) ---
  if (temperature > 0.7 && moisture < 0.3) {
    return { ...BIOMES.desert };
  }

  // --- HOT BAND (temperature > 0.7), not the dry desert corner ---
  if (temperature > 0.7) {
    if (moisture >= 0.55) return { ...BIOMES.jungle };   // hot + wet  -> vivid jungle
    return { ...BIOMES.savanna };                        // hot + mid  -> golden veld
  }

  // --- WARM-DRY FRINGE just below the hot threshold: rust mesa badlands ---
  if (temperature > 0.55 && moisture < 0.25) {
    return { ...BIOMES.mesa };
  }

  // --- COOL TEMPERATE FRINGE just above the cold corner: boreal taiga ---
  // a cold-but-wetter inland strip (0.3 <= temperature < 0.42, moisture >= 0.4) reads as boreal taiga
  // (cool grass + pines) rather than pure snowfield. This is the ONLY place taiga is selected — it sits
  // just above the hard snow corner, so it never steals a column the legacy branch would have made snow.
  if (temperature < 0.42 && moisture >= 0.4) {
    return { ...BIOMES.taiga };
  }

  // --- TEMPERATE MIDDLE: split by moisture, then coastal-vs-inland via continent ---
  if (moisture >= 0.7) {
    // very wet: coastal lowlands turn to swamp; inland to dense forest
    return coastal ? { ...BIOMES.swamp } : { ...BIOMES.forest };
  }
  if (moisture >= 0.55) {
    // wet temperate: forest everywhere, but coastal edges read as flowery meadow
    return coastal ? { ...BIOMES.meadow } : { ...BIOMES.forest };
  }
  // drier temperate: open plains inland, coastal flats read as flower meadow (continent-distinct)
  return coastal ? { ...BIOMES.meadow } : { ...BIOMES.plains };
}

/**
 * Q14 — the per-biome tint MULTIPLIER table, luminance-normalised, one entry per biome as rgb triples.
 *
 * MOVED HERE 2026-09-22 from `Terrain.jsx`, because it now has two consumers: the ground (a shader
 * uniform indexed by a per-vertex biome id) and the wind-grass blades (`bladeTint`, per instance). Two
 * copies of this arithmetic would be two things to retune and one of them would be forgotten — and the
 * failure would be silent, since a blade whose tint drifts from the ground beneath it looks like a
 * lighting artefact rather than a bug.
 *
 * It lives in this plain module rather than in the R3F component so a node test can drive it; a shader
 * is unreachable by every gate this repo has, and a React module drags the renderer into any test that
 * imports it.
 *
 * STRENGTH IS KEVIN'S DIAL. 0.35 is the middle rung of TERRAIN-GRASS-SOTA-PLAN's 25/35/50 ladder, and 0
 * is an EXACT no-op (`tintPreservingLuminance` returns [1,1,1]), so reverting is one number.
 */
export const BIOME_TINT_STRENGTH = 0.35;

export function biomeTintTable(strength = BIOME_TINT_STRENGTH) {
  const out = new Float32Array(BIOME_NAMES.length * 3);
  for (let i = 0; i < BIOME_NAMES.length; i++) {
    const m = tintPreservingLuminance(
      [BIOME_TINT_RGB[i * 3], BIOME_TINT_RGB[i * 3 + 1], BIOME_TINT_RGB[i * 3 + 2]],
      strength,
    );
    out[i * 3] = m[0];
    out[i * 3 + 1] = m[1];
    out[i * 3 + 2] = m[2];
  }
  return out;
}
