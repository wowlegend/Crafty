// Statistics of one layer of a square RGBA layer stack ({ image: { width, height, depth, data } }), read the way the
// terrain shader reads it: each byte decoded with pow(v / 255, 2.2) (world/terrainMaterial.js, the <color_fragment> patch) and
// luminance weighted 0.2126 / 0.7152 / 0.0722.

const decode = (v) => Math.pow(v / 255, 2.2);
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * - tones: every colour in the layer as 0xRRGGBB; distinct: how many.
 * - sameNeighbour: the fraction of equal-tone pairs among the (size - 1) * size horizontal plus as many vertical pairs
 *   that do not cross the tile's edge (1,984 pairs in a 32 x 32 tile).
 * - interiorChangeU / interiorChangeV: the fraction of horizontal / vertical non-wrapping pairs that differ;
 *   interiorChange is 1 - sameNeighbour.
 * - wrapChangeU: the fraction of the `size` pairs across the u seam (x = size - 1 beside x = 0) that differ, and
 *   wrapChangeV the same across the v seam; wrapChange covers both seams.
 * - meanLinear: the mean decoded colour; lum: its luminance; minLum: the darkest texel's luminance.
 * - border: the tones on the tile's outer ring.
 */
export function layerStats(texture, layer) {
  const { width: size, data } = texture.image;
  const base = layer * size * size;
  const tone = (x, y) => {
    const o = (base + x + y * size) * 4;
    return (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
  };
  const tones = new Set();
  const border = new Set();
  const mean = [0, 0, 0];
  let minLum = Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = tone(x, y);
      tones.add(t);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) border.add(t);
      const lin = [decode((t >> 16) & 255), decode((t >> 8) & 255), decode(t & 255)];
      for (let c = 0; c < 3; c++) mean[c] += lin[c];
      minLum = Math.min(minLum, luminance(...lin));
    }
  }
  const n = size * size;
  const meanLinear = mean.map((v) => v / n);

  let diffU = 0, diffV = 0, wrapU = 0, wrapV = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < size - 1 && tone(x, y) !== tone(x + 1, y)) diffU += 1;
      if (y < size - 1 && tone(x, y) !== tone(x, y + 1)) diffV += 1;
    }
    if (tone(size - 1, y) !== tone(0, y)) wrapU += 1;
  }
  for (let x = 0; x < size; x++) if (tone(x, size - 1) !== tone(x, 0)) wrapV += 1;
  const pairs = (size - 1) * size;

  return {
    distinct: tones.size,
    tones,
    sameNeighbour: 1 - (diffU + diffV) / (2 * pairs),
    interiorChange: (diffU + diffV) / (2 * pairs),
    interiorChangeU: diffU / pairs,
    interiorChangeV: diffV / pairs,
    wrapChange: (wrapU + wrapV) / (2 * size),
    wrapChangeU: wrapU / size,
    wrapChangeV: wrapV / size,
    meanLinear,
    lum: luminance(...meanLinear),
    minLum,
    border,
  };
}

/** A layer's linear mean as chromaticity [r / (r + g + b), g / (r + g + b)]. */
export function chromaOf(meanLinear) {
  const s = meanLinear[0] + meanLinear[1] + meanLinear[2];
  return [meanLinear[0] / s, meanLinear[1] / s];
}
