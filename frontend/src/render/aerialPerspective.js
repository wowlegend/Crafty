// aerialPerspective.js — the distance haze the land takes on (S2 aerial perspective): distant land desaturates
// and hazes toward the sky's horizon colour, so far hills read as atmospheric DEPTH rather than a dark wall.
//
// ONE definition, read by the terrain (world/Terrain.jsx) and the far field beyond it (world/FarField.jsx).
// Moved out of Terrain.jsx when the far field arrived: two materials hazing the same hills by two copies of
// the arithmetic is a seam waiting to happen where the loaded terrain meets the far field.
//
// Goes after three's `opaque_fragment` (before fog). Needs `vViewPosition` (every lit three material has it)
// and a `uniform vec3 skyHorizon`, set per frame from the mood.

/** Haze ramps in from AERIAL_NEAR to AERIAL_FAR metres from the camera. */
export const AERIAL_NEAR = 38;
export const AERIAL_FAR = 165;
/** At full distance: how far toward grey, and how far toward the horizon colour. */
export const AERIAL_DESAT = 0.22;
export const AERIAL_HAZE = 0.55;

export function aerialGlsl() {
  return `
        float aerial = smoothstep(${AERIAL_NEAR.toFixed(1)}, ${AERIAL_FAR.toFixed(1)}, length(vViewPosition));
        float alum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(alum), aerial * ${AERIAL_DESAT});
        gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHorizon, aerial * ${AERIAL_HAZE});
`;
}
