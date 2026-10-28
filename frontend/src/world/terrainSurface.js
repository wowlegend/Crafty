// The land's surface response under three's MeshStandardMaterial. One value, read by the terrain material
// (world/Terrain.jsx), the light rig's grey card (render/Atmosphere.jsx) and the colour model the light gates measure
// with (tests/gates/_lightModel.js), so the card and the model cannot drift from the ground they stand in for.
//
// Metalness 0: soil and stone are dielectrics. Any metalness scales the diffuse below the albedo creatures and props
// draw at, and tints the specular with the ground's colour.
export const TERRAIN_SURFACE = Object.freeze({ roughness: 0.85, metalness: 0 });
