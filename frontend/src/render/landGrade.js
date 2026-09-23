// landGrade.js — the danger-mood grade the LAND takes on (spec §4): it cools and desaturates toward dusk and
// goes near-monochrome at obsidian (the boss sky). LUMINANCE-PRESERVING — no darkening — so dusk stays
// readable; the per-mood LIGHTING sets brightness. Gentle at dusk (mood <= 1), strong only at obsidian (1 -> 2).
//
// ONE definition, spliced by the terrain (world/Terrain.jsx) and the far field beyond it (world/FarField.jsx).
// Moved out of Terrain.jsx for QUEUE R3.7: the far horizon kept its full daytime colour in the boss fight while
// the land in front of it went grey — a seam exactly where the two meet, in the one scene that matters most.
//
// Goes right after three's `color_fragment` (the albedo), before lighting. Needs a `uniform float mood`, set per
// frame from the smoothed mood (render/mood.js moodRef).

/** Desaturation reached at dusk (mood 1), then added on the way to obsidian (mood 2), and its ceiling. */
export const LAND_DESAT_DUSK = 0.18;
export const LAND_DESAT_OBSIDIAN = 0.54;
export const LAND_DESAT_MAX = 0.75;

export function landGradeGlsl() {
  return `
        float danger = clamp(mood, 0.0, 2.0);
        float moodLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float desat = danger <= 1.0 ? danger * ${LAND_DESAT_DUSK.toFixed(2)} : ${LAND_DESAT_DUSK.toFixed(2)} + (danger - 1.0) * ${LAND_DESAT_OBSIDIAN.toFixed(2)};
        vec3 coolGrey = vec3(moodLum * 0.92, moodLum * 0.96, moodLum * 1.06);
        diffuseColor.rgb = mix(diffuseColor.rgb, coolGrey, clamp(desat, 0.0, ${LAND_DESAT_MAX.toFixed(2)}));
`;
}
