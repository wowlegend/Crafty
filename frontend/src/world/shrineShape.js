// shrineShape.js — B3: the deterministic SHRINE silhouette (pure cube part-list; no Three/RNG, node-testable).
//
// The wayfinding landmark "shrine" (the pilgrim quest's "reach a frontier shrine") used to render as a
// generic 5-tier tapered grey tower — it read as a tower, not a sacred site. This composes a recognizable
// shrine instead: a stepped stone ALTAR PLINTH at the base, FOUR corner PILLARS rising to a canopy LINTEL
// frame, and a central PEDESTAL crowned by a warm-gold CRYSTAL (the "light" the beacon ignites in play).
// Pure offset/size list — Terrain.jsx maps it to bold-flat <Cube>s + the real-play Emissive beacon on the
// crystal. Deterministic (same baseY/topY -> identical parts) so the capture frame is byte-stable.
//
// tone is a palette key resolved by the renderer: 'stone' | 'dark' | 'crystal'.

/**
 * @param {number} baseY surface Y the shrine sits on
 * @param {number} topY  desired silhouette top (wayfinding height; renderer passes the fog-clearing top)
 * @returns {Array<{ position:[number,number,number], size:[number,number,number], tone:string }>}
 */
export function shrineParts(baseY, topY) {
  const h = Math.max(10, topY - baseY);
  const parts = [];

  // (1) Stepped altar plinth — a wide square base that narrows once (reads as a built platform, not ground).
  parts.push({ position: [0, baseY + 1, 0], size: [11, 2, 11], tone: 'stone' });
  parts.push({ position: [0, baseY + 3, 0], size: [8.5, 2, 8.5], tone: 'dark' });
  const plinthTop = baseY + 4;

  // (2) Four corner pillars rising from the plinth to the canopy height (the tall wayfinding mass).
  const pillarTop = baseY + h * 0.86;
  const ph = pillarTop - plinthTop;
  const px = 3.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push({ position: [sx * px, plinthTop + ph / 2, sz * px], size: [1.8, ph, 1.8], tone: 'stone' });
  }

  // (3) Canopy lintel — four beams bridging the pillar tops into a square frame (the shrine "roof" ring).
  const span = px * 2 + 1.8;
  const ly = pillarTop + 1;
  parts.push({ position: [0, ly, -px], size: [span, 2, 1.8], tone: 'dark' });
  parts.push({ position: [0, ly, px], size: [span, 2, 1.8], tone: 'dark' });
  parts.push({ position: [-px, ly, 0], size: [1.8, 2, span], tone: 'dark' });
  parts.push({ position: [px, ly, 0], size: [1.8, 2, span], tone: 'dark' });

  // (4) Central pedestal + the warm crystal heart — the focal "light", peaking just above the canopy so the
  // silhouette crowns at the centre (the beacon Emissive sits on the crystal in real play).
  const pedH = (pillarTop - plinthTop) * 0.7;
  parts.push({ position: [0, plinthTop + pedH / 2, 0], size: [2.4, pedH, 2.4], tone: 'stone' });
  parts.push({ position: [0, pillarTop + 3.4, 0], size: [2.8, 3.2, 2.8], tone: 'crystal' });

  return parts;
}
