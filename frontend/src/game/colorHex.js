// colorHex.js — sRGB <-> linear-RGB + linear-RGB(0..1) -> sRGB hex.
// terrain.worker's BLOCK_COLORS are stored in LINEAR space (correct for vertex colors), but a debris /
// UI color STRING must be sRGB: THREE.Color(hexString) interprets the string as sRGB and re-linearizes
// internally. Building the debris hex straight from the linear floats double-darkened the particles.
// So: debrisHex = linearRgbToHex(linearColor). srgbToLinear mirrors the worker's inline `linear()`.

export function srgbToLinear(c) {
  c = Math.max(0, Math.min(1, c));
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

export function linearToSrgb(c) {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function linearRgbToHex([r, g, b]) {
  const h = (c) => Math.round(linearToSrgb(c) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
