import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The two hand-written copies of the de-tile formula, extracted for comparison.
 *
 * detile.js's own header claims "the GLSL terrain shader mirrors this exact formula ... so the JS unit
 * test and the GPU agree on the same numbers". Nothing compared them, and `tileValueOffset` has no
 * importer outside its own test, so the JS side could drift to any value while every assertion about it
 * kept passing and the GPU rendered something else.
 *
 * THE EXTRACTION LIVES HERE, OUTSIDE tests/gates/, for the same reason the HUD call-site scan does:
 * gate-shape ratchets gate files that read source, because asserting ON source text is the weak shape
 * this repo is shrinking. Reading two implementations in order to compare them is a fixture, not that
 * shape -- but a classifier cannot tell, so the file layout says which it is.
 *
 * The shader is a template literal inside a JSX file, so it cannot be executed from node and the numbers
 * ARE the formula. Comparing the constants is the strongest check available without a GPU.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const MARKER = 'float dh = sin(floor(vWorldPos.x)';

export function detileSources() {
  const js = readFileSync(resolve(SRC, 'world/detile.js'), 'utf8');
  const shaderFile = readFileSync(resolve(SRC, 'world/Terrain.jsx'), 'utf8');
  const at = shaderFile.indexOf(MARKER);
  return { js, glsl: at === -1 ? '' : shaderFile.slice(at, at + 260) };
}

/**
 * Numeric literals that are actually PART OF THE FORMULA. GLSL spells every float with a decimal point,
 * so `1.0` and `0.0` appear as syntax rather than as constants; counting them made the first draft of the
 * comparison fail on the language rather than on a drift.
 */
export function formulaConstants(text) {
  return (text.match(/\d+\.\d+/g) || []).filter((n) => !/^\d+\.0$/.test(n));
}
