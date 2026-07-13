import * as THREE from 'three';

export function createProceduralVoxelTextures() {
  const size = 32; // 32x32 resolution per texture slice
  // Layer index == block code (see src/world/blockIds.js + BLOCK_COLORS in terrain.worker.js).
  // 0..9 base block types · 10..13 ore tiles (S6: coal/iron/gold/diamond) · 14 cobblestone · 15 glass (R4a).
  const numLayers = 16;
  
  const data = new Uint8Array(size * size * 4 * numLayers);
  
  function setPixel(layer, x, y, r, g, b, a = 255) {
    const idx = ((x + y * size) + layer * size * size) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  }
  
  // Deterministic procedural pseudo-noise helper
  function getNoise(x, y, seed = 1.0) {
    const value = Math.sin(x * 12.789 + y * 78.233 + seed) * 43758.5453;
    return value - Math.floor(value);
  }

  // Draw 32x32 patterns for each voxel block type layer
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = getNoise(x, y, 1.2);
      const n2 = getNoise(x, y, 4.8);
      const n3 = getNoise(x, y, 9.4);

      // Layer 1: Grass (blockType 1)
      // Lush green field with rich blade fibers
      {
        const isFoliage = n1 > 0.65;
        const r = isFoliage ? 65 : 86;
        const g = isFoliage ? 105 : 124;
        const b = isFoliage ? 40 : 53;
        const noiseFactor = 0.9 + n2 * 0.15;
        setPixel(1, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
      }

      // Layer 2: Dirt (blockType 2)
      // Dark earthy brown with organic stone specks
      {
        const isStoneSpeck = n1 > 0.92;
        const r = isStoneSpeck ? 115 : 151;
        const g = isStoneSpeck ? 88 : 109;
        const b = isStoneSpeck ? 66 : 77;
        const noiseFactor = 0.85 + n2 * 0.25;
        setPixel(2, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
      }

      // Layer 3: Stone (blockType 3)
      // Charcoal slate with readable granite veins + faint horizontal strata + a hair of cool blue
      {
        const isVein = Math.abs(n1 * size - y) < 1.2 || Math.abs(n2 * size - x) < 1.2;
        const strata = (Math.floor(y / 4) % 2) * 6; // faint slate banding
        const baseColor = (isVein ? 132 : 104) + strata;
        const noiseFactor = 0.9 + n3 * 0.18;
        const c = Math.floor(baseColor * noiseFactor);
        setPixel(3, x, y, c, c, Math.min(255, c + 3));
      }

      // Layer 4: Sand (blockType 4)
      // Golden-tan dunes with crossed wind-ripple contours (clearer than the old near-flat ripple)
      {
        const ripple = Math.sin(x * 0.5 + y * 0.22) * 0.5 + 0.5;
        const fine = Math.sin(x * 1.3 - y * 0.9) * 0.5 + 0.5; // finer cross-ripple = wind detail
        const t = ripple * 0.7 + fine * 0.3;
        const r = 188 + t * 30;
        const g = 170 + t * 26;
        const b = 120 + t * 18;
        const noiseFactor = 0.96 + n2 * 0.06;
        setPixel(4, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
      }

      // Layer 5: Snow (blockType 5)
      // Bright field with a soft ice-blue bias + gentle GRADUATED sparkle (was a harsh white binary speck)
      {
        const sparkle = n1 > 0.84 ? 1.0 : 0.0; // rarer, brighter glints
        const base = 232 + n2 * 14;            // 232..246 soft tonal variation (not flat 240/255)
        const r = base + sparkle * 8;
        const g = base + sparkle * 8 + 2;
        const b = base + sparkle * 8 + 12;     // ice-blue bias (b runs ahead of r/g)
        setPixel(5, x, y, Math.min(255, Math.floor(r)), Math.min(255, Math.floor(g)), Math.min(255, Math.floor(b)));
      }

      // Layer 6: Wood Trunk (blockType 6)
      // Coarse concentric brown tree bark rings
      {
        const ring = Math.floor(Math.sqrt((x - 16) ** 2 + (y - 16) ** 2)) % 6;
        const isBark = ring === 0 || ring === 5;
        const r = isBark ? 75 : 93;
        const g = isBark ? 50 : 64;
        const b = isBark ? 40 : 55;
        const noiseFactor = 0.9 + n2 * 0.15;
        setPixel(6, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
      }

      // Layer 7: Leaves (blockType 7)
      // Intricate deep forest foliage canopy
      {
        const isHole = n1 > 0.85;
        const r = isHole ? 30 : 46;
        const g = isHole ? 65 : 125;
        const b = isHole ? 30 : 50;
        const noiseFactor = 0.85 + n2 * 0.25;
        setPixel(7, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
      }

      // Layer 8: Cactus (blockType 8)
      // Ridged green stalks with sharp yellow spines
      {
        const isSpine = n1 > 0.95;
        if (isSpine) {
          setPixel(8, x, y, 230, 230, 160); // Yellow-white spike
        } else {
          const isRidge = x % 8 < 2;
          const r = isRidge ? 35 : 46;
          const g = isRidge ? 95 : 125;
          const b = isRidge ? 40 : 50;
          const noiseFactor = 0.9 + n2 * 0.15;
          setPixel(8, x, y, Math.floor(r * noiseFactor), Math.floor(g * noiseFactor), Math.floor(b * noiseFactor));
        }
      }

      // Layer 9: Water (blockType 9)
      // Caribbean turquoise — vivid teal shallows rippling to bright aqua
      {
        const ripple = Math.sin(x * 0.4 + y * 0.3) * 0.5 + 0.5;
        const r = Math.floor(40 + ripple * 28);
        const g = Math.floor(186 + ripple * 40);
        const b = Math.floor(178 + ripple * 42);
        setPixel(9, x, y, r, g, b, 255);
      }

      // Layers 10-13: ORE tiles (S6 mining payoff)
      // The charcoal-slate STONE base (same formula as layer 3) speckled with clustered ore nuggets in
      // each ore's locked BLOCK_TYPES color, so digging deep has a reward. Bold-flat pixel-art (NO PBR /
      // normal maps); deterministic (getNoise, no Math.random); layer index == block code (10..13).
      {
        const isVein = Math.abs(n1 * size - y) < 1.2 || Math.abs(n2 * size - x) < 1.2;
        const strata = (Math.floor(y / 4) % 2) * 6;
        const baseColor = (isVein ? 132 : 104) + strata;
        const c = Math.floor(baseColor * (0.9 + n3 * 0.18)); // the surrounding stone matrix
        const ORES = [
          { layer: 10, seed: 21.7, r: 47,  g: 47,  b: 47  }, // coal    #2F2F2F (dark flecks)
          { layer: 11, seed: 33.1, r: 216, g: 175, b: 147 }, // iron    #D8AF93
          { layer: 12, seed: 44.9, r: 252, g: 238, b: 75  }, // gold    #FCEE4B
          { layer: 13, seed: 57.3, r: 79,  g: 208, b: 231 }, // diamond #4FD0E7
        ];
        for (const ore of ORES) {
          if (getNoise(x, y, ore.seed) > 0.74) {
            const v = 0.85 + getNoise(x, y, ore.seed + 1.0) * 0.3; // per-pixel grit on the nugget
            setPixel(ore.layer, x, y, Math.min(255, Math.floor(ore.r * v)), Math.min(255, Math.floor(ore.g * v)), Math.min(255, Math.floor(ore.b * v)));
          } else {
            setPixel(ore.layer, x, y, c, c, Math.min(255, c + 3)); // stone matrix between nuggets
          }
        }
      }

      // R4a — Layer 14: COBBLESTONE. Was in the HOTBAR with no voxel id, so placing it produced STONE.
      // Reads as cobble (not stone) via chunky rounded aggregate: coarse cells with dark mortar gaps and
      // per-cell tonal variation, vs stone's fine speckle. Deterministic (getNoise, no Math.random).
      {
        const cell = 8;                                   // aggregate size -> chunky, reads at distance
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const jitter = getNoise(cx * 3.1, cy * 3.1, 12.5); // per-cobble tone
        const fx = (x % cell) / cell - 0.5;
        const fy = (y % cell) / cell - 0.5;
        const d = Math.sqrt(fx * fx + fy * fy);           // distance from the cobble's centre
        const isMortar = d > 0.42 - getNoise(x, y, 18.3) * 0.06; // irregular gaps between cobbles
        const base = isMortar ? 74 : 118 + Math.floor(jitter * 34);
        const grit = Math.floor(getNoise(x, y, 27.9) * 12);
        const v = Math.max(0, Math.min(255, base + grit));
        setPixel(14, x, y, v, v, Math.min(255, v + 2));
      }

      // R4a — Layer 15: GLASS. Same story (hotbar block with no voxel id -> placed as stone).
      // Renders OPAQUE for now: the greedy mesher's only non-solid block is water (blockA !== 9), so true
      // see-through glass needs a second transparent draw pass (tracked follow-up). An opaque pane that
      // READS as glass — pale blue-white, bright frame, a diagonal sheen — is still GLASS, and is vastly
      // better than silently becoming grey stone.
      {
        const edge = x < 2 || y < 2 || x > size - 3 || y > size - 3; // the pane's frame
        const sheen = Math.abs((x + y) % size - size / 2) < 2.5;      // a soft diagonal highlight
        let r = 214, g = 232, b = 244;                                 // pale blue-white pane
        if (sheen) { r = 236; g = 248; b = 255; }
        if (edge) { r = 244; g = 250; b = 255; }
        const n = Math.floor(getNoise(x, y, 31.4) * 8) - 4;            // faint imperfection
        setPixel(15, x, y, Math.max(0, Math.min(255, r + n)), Math.max(0, Math.min(255, g + n)), Math.max(0, Math.min(255, b + n)));
      }
    }
  }

  const texture = new THREE.DataArrayTexture(data, size, size, numLayers);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  
  // Use NearestFilter to maintain pixel-perfect voxel look
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  
  return texture;
}
