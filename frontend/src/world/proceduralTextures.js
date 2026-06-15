import * as THREE from 'three';

export function createProceduralVoxelTextures() {
  const size = 32; // 32x32 resolution per texture slice
  const numLayers = 10; // Layers 0 to 9 (indices matching blockType)
  
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
