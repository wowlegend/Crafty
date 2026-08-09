// WINDOWED DIFF DENSITY — the measure a whole-frame ratio cannot express.
//
// The visual gate's threshold is 6% of ALL pixels. On a 1280x800 frame that is 61,440 pixels, so a
// 248x248 block could change completely and still PASS. Measured 2026-08-09, 13 of the 31 frames
// reproduce BYTE-IDENTICALLY, which makes 6% roughly a thousand times looser than those frames warrant.
// The gate's live defect is FALSE NEGATIVES on the static frames, not the false positives that the
// determinism investigation was chasing.
//
// A localised measure fixes that: "what is the worst concentration of change anywhere in the frame",
// which is high for a broken UI panel and low for evenly-scattered sub-pixel noise.
//
// REPORT-ONLY FOR NOW, DELIBERATELY. A proposed TAU of 0.10 at N=128 was measured offline against a real
// capture pair and turns EIGHT of 31 frames red, seven of which pass the current gate — because global
// ratio and local density differ by 12x-62x on this corpus, so a tolerance derived from one cannot be
// reasoned about from the other. Printing it for a while produces the calibration data that does not
// exist, at zero risk of a red gate nobody can act on.

/**
 * PURE. Highest fraction of changed pixels inside any `win` x `win` window.
 *
 * Uses a summed-area table so every window is O(1); a naive scan at this size is ~40x slower and this
 * runs over 31 megapixel frames.
 *
 * @param {Uint8Array|Uint8ClampedArray} mask  RGBA diff mask from pixelmatch with diffMask:true —
 *                                             changed pixels have alpha > 0, everything else is 0.
 * @param {number} width
 * @param {number} height
 * @param {number} win     window edge in pixels
 * @param {number} stride  step between window origins; 1 is exact, larger is a sampled upper-bound scan
 * @returns {{density: number, x: number, y: number, changed: number, windows: number}}
 */
export function maxWindowDensity(mask, width, height, win = 128, stride = 32) {
  const w = Math.min(win, width);
  const h = Math.min(win, height);
  // Integral image, one row of padding so every lookup is unconditional.
  const sat = new Int32Array((width + 1) * (height + 1));
  let changed = 0;
  for (let y = 0; y < height; y++) {
    let rowRun = 0;
    for (let x = 0; x < width; x++) {
      const on = mask[(y * width + x) * 4 + 3] > 0 ? 1 : 0;
      changed += on;
      rowRun += on;
      sat[(y + 1) * (width + 1) + (x + 1)] = sat[y * (width + 1) + (x + 1)] + rowRun;
    }
  }
  const area = w * h;
  let best = 0, bx = 0, by = 0, windows = 0;
  for (let y = 0; y + h <= height; y += stride) {
    for (let x = 0; x + w <= width; x += stride) {
      windows++;
      const a = sat[y * (width + 1) + x];
      const b = sat[y * (width + 1) + (x + w)];
      const c = sat[(y + h) * (width + 1) + x];
      const d = sat[(y + h) * (width + 1) + (x + w)];
      const n = d - b - c + a;
      if (n > best) { best = n; bx = x; by = y; }
    }
  }
  return { density: area ? best / area : 0, x: bx, y: by, changed, windows };
}
