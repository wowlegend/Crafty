// Deterministic frontier-outpost layout around the Hearth (world origin). Pure data (no RNG, no
// state) so it regenerates identically every load — zero save data, capture-safe (the render group
// + NPC spawns are capture-suppressed). Buildings ring the raised plinth so the spawn vista reads as
// "a small settlement at the edge of the frontier", not a generic MMO town. Coords are world X/Z
// offsets from origin; the render group (render/HubRender.jsx) sits them on the HEARTH_Y grade and
// world/homeAnchor.js flattens each footprint so they sit flush (no floating buildings).
export const HUB_BUILDINGS = [
  { kind: 'forge', pos: [10, -8], rot: 0.4 },        // the smith's forge (NE)
  { kind: 'stall', pos: [-11, -6], rot: -0.5 },      // the merchant's market stall (NW)
  { kind: 'watchtower', pos: [-9, 12], rot: 0 },     // the guide's watchtower over the frontier (SW)
  { kind: 'cabin', pos: [12, 9], rot: -0.3 },        // the healer's herb cabin (SE)
];
export const HUB_NPC_ANCHORS = [
  { role: 'merchant', pos: [-9, -5], facing: -0.5 }, // by the stall
  { role: 'smith', pos: [8, -7], facing: 0.4 },      // by the forge
  { role: 'guide', pos: [-7, 10], facing: 0.2 },     // by the watchtower
  { role: 'healer', pos: [10, 8], facing: -0.3 },    // by the cabin
];
