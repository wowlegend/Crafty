import * as THREE from 'three';
import { BLOCK_NAME } from './blockIds.js';
import { FACE_VARIANTS, LIP_TEXELS, TEXTURE_LAYER_COUNT, variantLayer } from './materialGrammar.js';

const SIZE = 32;

// Ore tiles (layers 10..13): each nugget's BLOCK_TYPES colour and the seed its clusters are placed by.
export const ORE_TILES = Object.freeze([
  Object.freeze({ layer: 10, seed: 21, r: 47, g: 47, b: 47 }), // coal    #2F2F2F
  Object.freeze({ layer: 11, seed: 33, r: 216, g: 175, b: 147 }), // iron    #D8AF93
  Object.freeze({ layer: 12, seed: 44, r: 252, g: 238, b: 75 }), // gold    #FCEE4B
  Object.freeze({ layer: 13, seed: 57, r: 79, g: 208, b: 231 }), // diamond #4FD0E7
]);
/** A nugget's rim is its colour times this. */
const ORE_SHADE = 0.78;
const oreColour = (o) => [o.r, o.g, o.b];
const oreShade = (o) => [o.r, o.g, o.b].map((c) => Math.round(c * ORE_SHADE));

const tones = (...list) => Object.freeze(list.map((t) => Object.freeze(t)));
/**
 * The solid sRGB tones each material is painted in, named in the order its painter uses them. Every texel of a
 * layer is exactly one of its material's tones; the proportions are set so each layer keeps the linear mean the
 * light and colour work was tuned against. Stone tones stay grey (r = g, b - r <= 3) so the ore glow's chroma mask
 * (world/oreGlow.js) reads them as matrix.
 */
export const MATERIAL_TONES = Object.freeze({
  grass: tones([86, 124, 53], [65, 105, 40], [104, 146, 62]), // base, shade, light
  dirt: tones([151, 109, 77], [115, 88, 66], [170, 126, 90]), // base, shade, light
  stone: tones([104, 104, 107], [132, 132, 135], [78, 78, 81]), // base, light, crack
  sand: tones([200, 180, 128], [216, 196, 140], [184, 164, 116]), // base, light, shade
  snow: tones([240, 242, 252], [220, 230, 246], [250, 252, 255]), // base, drift, glint
  wood: tones([93, 64, 55], [75, 50, 40], [110, 78, 62]), // core, ring, light
  leaves: tones([46, 125, 50], [36, 95, 40], [64, 150, 66]), // base, shade, lit
  cactus: tones([46, 125, 50], [35, 95, 40], [230, 230, 160]), // base, ridge, spine
  cobblestone: tones([74, 74, 76], [118, 118, 120], [140, 140, 142]), // mortar, cobble, cobble light
  glass: tones([214, 232, 244], [236, 248, 255], [244, 250, 255]), // pane, sheen, frame
});

/** What each side variant is made of: its lip's material over its body's (world/materialGrammar.js FACE_VARIANTS). */
const VARIANT_PARTS = Object.freeze({
  grass_side: Object.freeze({ lip: 'grass', body: 'dirt' }),
  snow_side: Object.freeze({ lip: 'snow', body: 'stone' }),
  wood_side: Object.freeze({ body: 'wood' }),
});

/**
 * How a layer must tile: 'periodic' wraps seamlessly in both axes (a face merged over many blocks repeats it);
 * 'lip' wraps along u only, since every block of a stacked wall shows its own lip; 'framed' has a one-tone border
 * (glass, the wood end grain); 'unused' is never sampled (air; water, whose surface the ocean owns).
 */
/** @internal Exported for the tests that enumerate it. */
export const LAYER_TILING = Object.freeze([
  'unused', 'periodic', 'periodic', 'periodic', 'periodic', 'periodic', 'framed', 'periodic', 'periodic', 'unused',
  'periodic', 'periodic', 'periodic', 'periodic', 'periodic', 'framed',
  ...FACE_VARIANTS.map((v) => (VARIANT_PARTS[v.name].lip ? 'lip' : 'periodic')),
]);

/**
 * Every tone a layer may contain: its material's; for an ore the stone tones plus its nugget colour and rim; for a
 * face variant its parents' tones.
 */
/** @internal Exported for the tests that enumerate it. */
export function declaredTones(layer) {
  const ore = ORE_TILES.find((o) => o.layer === layer);
  if (ore) return [...MATERIAL_TONES.stone, oreColour(ore), oreShade(ore)];
  const variant = FACE_VARIANTS.find((v) => variantLayer(v.name) === layer);
  if (variant) {
    const { lip, body } = VARIANT_PARTS[variant.name];
    return [...(lip ? MATERIAL_TONES[lip] : []), ...MATERIAL_TONES[body]];
  }
  return [...(MATERIAL_TONES[BLOCK_NAME[layer]] || [])];
}

// An integer hash to [0, 1), so a pattern is the same on every platform and every build.
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise on a lattice whose cells divide the tile, so it wraps seamlessly at the tile's edges. */
function lattice(x, y, cellX, cellY, seed) {
  const nx = SIZE / cellX, ny = SIZE / cellY;
  const gx = (x + 0.5) / cellX, gy = (y + 0.5) / cellY;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const sx = smooth(gx - ix), sy = smooth(gy - iy);
  const at = (a, b) => hash(a % nx, b % ny, seed);
  const lo = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const hi = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return lo + (hi - lo) * sy;
}
const field = (fn) => Float64Array.from({ length: SIZE * SIZE }, (_, i) => fn(i % SIZE, Math.floor(i / SIZE)));
/** Two octaves (8 and 4 texel cells): blobs a few texels across, never per-texel static. */
const blobs = (seed) => field((x, y) => 0.6 * lattice(x, y, 8, 8, seed) + 0.4 * lattice(x, y, 4, 4, seed + 1));
/**
 * Splits a field into bands by rank: the lowest `shares[0]` of its texels are band 0, and so on. Ranking, not a
 * threshold, so each band's share of the tile is exact and the layer's mean colour is set by the shares.
 */
function bands(f, shares) {
  const order = Array.from(f.keys()).sort((a, b) => f[a] - f[b] || a - b);
  const out = new Uint8Array(f.length);
  let at = 0;
  shares.forEach((share, k) => {
    const n = k === shares.length - 1 ? f.length - at : Math.round(share * f.length);
    for (let i = 0; i < n; i++) out[order[at + i]] = k;
    at += n;
  });
  return out;
}
const pick = (palette, ids) => (i) => palette[ids[i]];

/** Stone: chunky light and base facets, cut by one-texel cracks where a facet ends (`cracks` false for the ores'
 *  matrix, whose brighter nuggets would leave a crack darker than the tile's dark floor). */
function stonePainter(cracks = true) {
  const [base, light, crack] = MATERIAL_TONES.stone;
  const facet = bands(blobs(5), [0.68, 0.32]);
  const at = (x, y) => facet[(y % SIZE) * SIZE + (x % SIZE)];
  return (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    const edge = at(x, y) > at(x + 1, y) || at(x, y) > at(x, y + 1);
    if (cracks && edge && hash(x, y, 7) < 0.75) return crack;
    return at(x, y) ? light : base;
  };
}

/** Each sampled layer's painter: texel index (x + y * 32) -> one of its declared tones. */
function painters() {
  const T = MATERIAL_TONES;
  const stone = stonePainter();
  const matrix = stonePainter(false);
  const p = {};
  p[1] = pick([T.grass[1], T.grass[0], T.grass[2]], bands(blobs(1), [0.5, 0.4, 0.1]));
  p[2] = pick([T.dirt[1], T.dirt[0], T.dirt[2]], bands(blobs(3), [0.3, 0.6, 0.1]));
  p[3] = stone;
  // Wind ripples: a diagonal wave whose period divides the tile, bent by low-frequency noise.
  p[4] = pick([T.sand[2], T.sand[0], T.sand[1]],
    bands(field((x, y) => Math.sin((2 * Math.PI * (2 * x + y)) / SIZE + 2 * Math.PI * 0.5 * lattice(x, y, 8, 8, 9))), [0.25, 0.5, 0.25]));
  const drift = bands(blobs(11), [0.24, 0.76]);
  p[5] = (i) => {
    if (!drift[i]) return T.snow[1];
    return hash(i % SIZE, Math.floor(i / SIZE), 13) > 0.965 ? T.snow[2] : T.snow[0];
  };
  // End grain: a ring-tone rim, then rings around a light pith.
  p[6] = (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (x < 2 || y < 2 || x > SIZE - 3 || y > SIZE - 3) return T.wood[1];
    const d = Math.hypot(x - 15.5, y - 15.5) + (lattice(x, y, 8, 8, 15) - 0.5) * 1.5;
    if (d < 2) return T.wood[2];
    return d % 3 < 1.1 ? T.wood[1] : T.wood[0];
  };
  p[7] = pick([T.leaves[1], T.leaves[0], T.leaves[2]], bands(blobs(17), [0.4, 0.48, 0.12]));
  // Vertical ridges every 8 texels (placed so the tile's seam falls between two), spines staggered between them.
  p[8] = (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if ((x + 4) % 8 < 2) return T.cactus[1];
    if (x % 8 === 1 && y % 2 === (x >> 3) % 2) return T.cactus[2];
    return T.cactus[0];
  };
  // Nuggets: clusters two or three texels across, the ore's colour inside a rim of its shade, over the stone matrix.
  const NUGGET_SHARES = { 10: [0.68, 0.1, 0.22], 11: [0.69, 0.1, 0.21], 12: [0.69, 0.1, 0.21], 13: [0.69, 0.1, 0.21] };
  for (const ore of ORE_TILES) {
    const nug = bands(field((x, y) => 0.7 * lattice(x, y, 4, 4, ore.seed) + 0.3 * lattice(x, y, 2, 2, ore.seed + 1)), NUGGET_SHARES[ore.layer]);
    p[ore.layer] = (i) => (nug[i] === 2 ? oreColour(ore) : nug[i] === 1 ? oreShade(ore) : matrix(i));
  }
  // Rounded cobbles in a running bond, some rounder than others so the courses do not read as bricks, with mortar
  // between them and each cobble one of two tones.
  p[14] = (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    const row = y >> 3;
    const u = (x + (row % 2) * 4) % SIZE;
    const cell = u >> 3;
    const corner = hash(cell, row, 23) > 0.5 ? 5 : 4;
    const fx = Math.abs((u % 8) - 3.5), fy = Math.abs((y % 8) - 3.5);
    if (fx > 3 || fy > 3 || fx + fy > corner) return T.cobblestone[0];
    return hash(cell, row, 19) > 0.15 ? T.cobblestone[2] : T.cobblestone[1];
  };
  // Bark: vertical furrows, long in v and narrow in u, wrapping both ways because a trunk is a stack of blocks.
  p[variantLayer('wood_side')] = pick([T.wood[1], T.wood[0], T.wood[2]],
    bands(field((x, y) => 0.7 * lattice(x, y, 4, 16, 31) + 0.3 * lattice(x, y, 2, 8, 32)), [0.4, 0.48, 0.12]));
  // A side wall: its body's tile below, its lip's tile in the top LIP_TEXELS rows, and in about a third of the
  // columns the lip runs one or two rows further down.
  const lipped = (lip, body, seed) => (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    const drip = hash(x, 0, seed);
    const lipFrom = SIZE - LIP_TEXELS - (drip < 0.15 ? 2 : drip < 0.35 ? 1 : 0);
    return y >= lipFrom ? lip(i) : body(i);
  };
  p[variantLayer('grass_side')] = lipped(p[1], p[2], 37);
  // Under bright snow a stone crack would be the tile's darkest texel by far, so the body is the uncracked matrix.
  p[variantLayer('snow_side')] = lipped(p[5], matrix, 41);
  // A pane in a two-texel frame, crossed by a diagonal sheen.
  p[15] = (i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (x < 2 || y < 2 || x > SIZE - 3 || y > SIZE - 3) return T.glass[2];
    return Math.abs(((x + y) % SIZE) - SIZE / 2) < 2.5 ? T.glass[1] : T.glass[0];
  };
  return p;
}

// The terrain shader decodes a texel with pow(rgb, 2.2) and the far field averages tiles the same way
// (farField.js layerMeanLinear), so a mip texel must be the mean in THAT linear light. The GPU's generateMipmap
// averages the stored bytes instead, which darkens every high-contrast tile at distance: at the 1x1 level,
// leaves -3%, cobblestone -10%, gold ore -15%, coal and the snow side -16% in luminance, and the near terrain would no
// longer meet the far field.
const DECODE = Float64Array.from({ length: 256 }, (_, v) => Math.pow(v / 255, 2.2));
const encode = (linear) => Math.round(Math.pow(linear, 1 / 2.2) * 255);

/**
 * The full mip chain of a square RGBA layer stack, each level the linear-light box mean of the level-0 texels it
 * covers. Built from level 0 every time, not from the level above, so 8-bit rounding never compounds. Layers are
 * reduced independently: a texture array has no neighbours to bleed from, unlike an atlas.
 */
export function linearLightMipChain(data, size, layers) {
  const chain = [{ data, width: size, height: size }];
  for (let block = 2; block <= size; block *= 2) {
    const n = size / block;
    const out = new Uint8Array(n * n * 4 * layers);
    const area = block * block;
    for (let l = 0; l < layers; l++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let r = 0, g = 0, b = 0, a = 0;
          for (let v = y * block; v < (y + 1) * block; v++) {
            for (let u = x * block; u < (x + 1) * block; u++) {
              const i = ((l * size + v) * size + u) * 4;
              r += DECODE[data[i]]; g += DECODE[data[i + 1]]; b += DECODE[data[i + 2]]; a += data[i + 3];
            }
          }
          const o = ((l * n + y) * n + x) * 4;
          out[o] = encode(r / area); out[o + 1] = encode(g / area); out[o + 2] = encode(b / area);
          out[o + 3] = Math.round(a / area);
        }
      }
    }
    chain.push({ data: out, width: n, height: n });
  }
  return chain;
}

let shared = null;
/**
 * THE block texture array the game renders with — built once, read by the terrain material and by the far field
 * (its per-layer mean colours). The far field used to build a second copy just to average it (QUEUE R3.10).
 */
export function sharedVoxelTextures() {
  if (!shared) shared = createProceduralVoxelTextures();
  return shared;
}

export function createProceduralVoxelTextures() {
  const size = SIZE;
  // Layer index == block code (src/world/blockIds.js), then the face variants (world/materialGrammar.js). Layer 0
  // (air) is never painted.
  const numLayers = TEXTURE_LAYER_COUNT;
  const data = new Uint8Array(size * size * 4 * numLayers);
  const setPixel = (layer, i, [r, g, b]) => {
    const o = (layer * size * size + i) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  };
  for (const [layer, paint] of Object.entries(painters())) {
    for (let i = 0; i < size * size; i++) setPixel(Number(layer), i, paint(i));
  }
  // Layer 9, water: never sampled (the mesher emits no water faces; the far field colours water from its own
  // constant), painted only so the layer is not blank.
  for (let i = 0; i < size * size; i++) {
    const ripple = Math.sin((i % size) * 0.4 + Math.floor(i / size) * 0.3) * 0.5 + 0.5;
    setPixel(9, i, [Math.floor(40 + ripple * 28), Math.floor(186 + ripple * 40), Math.floor(178 + ripple * 42)]);
  }

  // A CompressedArrayTexture only because three r172 uploads caller-built mip levels for an array texture on that
  // path alone (WebGLTextures.js: with RGBAFormat it calls texSubImage3D per level, uncompressed); its
  // DataArrayTexture path uploads level 0 and can only fill the rest with the GPU's byte-space generateMipmap.
  const texture = new THREE.CompressedArrayTexture(
    linearLightMipChain(data, size, numLayers), size, size, numLayers, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  texture.image.data = data; // level 0, where the far field reads its per-layer means

  // Up close NEAREST, the pixel-art voxel look. Without a mip chain every distant face samples one texel of a
  // 32x32 tile per screen pixel, and leaves and stone sparkle and crawl as the camera moves, which no
  // post-process AA can fix. NEAREST within a level keeps texels crisp where they are still about a pixel wide;
  // LINEAR between levels hides the step from one level to the next.
  // No anisotropy: three r172 skips it whenever magFilter is Nearest (WebGLTextures.js setTextureParameters),
  // so grazing ground reaches the small mips sooner than it would with a linear mag filter.
  // REPEAT is load-bearing: the terrain sampler reads raw vUv (no fract), so the derivative is continuous
  // across block edges and the GPU does not pick the smallest mip at every seam.
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}
