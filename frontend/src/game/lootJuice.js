// M3c loot juice -- pure rarity -> drop-beam look. The vertical drop-beam is the
// only across-the-map rarity tell, so its look is derived purely (and unit-tested)
// from the LOCKED RARITY_FILL palette (src/theme/tokens.js) for coherence with the
// inventory tiles. Common reads short + dim; legendary reads tall + bright +
// saturated, climbing monotonically through the tiers. The beam mesh in
// LootDropRender (SimplifiedNPCSystem.jsx) and the pickup-pop both consume this.
import { RARITY_FILL } from '../theme/tokens.js';

// Tier order low -> high. The per-tier BEAM_LOOK values below climb monotonically
// (height + intensity); the ordering is LOCKED by lootJuice.test.js (not enforced
// structurally, so keep the hand-tuned values monotonic if you re-tune them).
export const RARITY_TIERS = ['common', 'rare', 'epic', 'legendary'];

// RARITY_FILL rings were authored for CSS box-shadows, so some tiers (e.g. common)
// are rgba() strings WITH an alpha channel. THREE.Color cannot use alpha and logs
// 'Alpha component ... will be ignored' on every material color set -- console noise
// on the most frequent (common) loot. Strip alpha to rgb() before the color reaches a
// THREE material (beam opacity is driven separately via `intensity`); hex/rgb pass through.
function toThreeColor(css) {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)$/i.exec(css);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : css;
}

// Per-tier beam look. Height (world units) + emissive intensity (additive-opacity
// multiplier) both climb with tier rank; color is the rarity's signature ring
// accent from RARITY_FILL (e.g. legendary -> '#FFC23D').
const BEAM_LOOK = {
  common:    { height: 1.6, intensity: 0.12 },
  rare:      { height: 2.4, intensity: 0.22 },
  epic:      { height: 3.2, intensity: 0.34 },
  legendary: { height: 4.2, intensity: 0.5 },
};

// rarityBeam(rarity) -> { color, height, intensity }. Unknown/missing rarity
// falls back to the common look (matches getItemRarity's common default).
export function rarityBeam(rarity) {
  const tier = BEAM_LOOK[rarity] ? rarity : 'common';
  return {
    color: toThreeColor(RARITY_FILL[tier].ring),
    height: BEAM_LOOK[tier].height,
    intensity: BEAM_LOOK[tier].intensity,
  };
}
