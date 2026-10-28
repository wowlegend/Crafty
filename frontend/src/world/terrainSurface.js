// The land's surface response under three's MeshStandardMaterial. One value, read by the terrain material
// (world/Terrain.jsx), the light rig's grey card (render/Atmosphere.jsx) and the colour model the light gates measure
// with (tests/gates/_lightModel.js), so the card and the model cannot drift from the ground they stand in for.
//
// Metalness 0: soil and stone are dielectrics. At 0.1 the land's diffuse was its albedo x 0.9 while creatures and
// props drew at x 1, so the ground sat darker than what stands on it, and its specular took a tint of its albedo.
export const TERRAIN_SURFACE = Object.freeze({ roughness: 0.85, metalness: 0 });
