// materialGrammar.js — which texture layer each face of each block shows: a block's top, its sides and its
// underside can read different tiles (bark on a trunk's sides, a turf lip over dirt on a grass block's sides).
//
// The terrain's vertex stage derives a face's role from its normal and reads the layer from a const table generated
// here (faceLayerGlsl), so the shader and the node gates read one table. Nothing is baked into the mesh: colors.b is
// left free for the block-light level the lantern's light field will write there.
//
// Layer index == block code for ids 0..BLOCK_LAYER_COUNT - 1; the face variants sit above the id space, so a new
// block id moves them up by one with no edit here.
import { BLOCK_ID } from './blockIds.js';

export const FACE_ROLE = Object.freeze({ top: 0, side: 1, bottom: 2 });

/** The role of a face from its axis normal's y component: the JS twin of the GLSL expression in faceLayerGlsl. */
/** @internal The JS twin of a shader formula, for its parity test. */
export function faceRoleOfNormal(ny) {
  if (ny > 0.5) return FACE_ROLE.top;
  if (ny < -0.5) return FACE_ROLE.bottom;
  return FACE_ROLE.side;
}

/** Layers painted for one role of one block, above the block-id space, in this order. */
export const FACE_VARIANTS = Object.freeze([
  Object.freeze({ name: 'grass_side', block: 'grass', role: 'side' }),
  Object.freeze({ name: 'snow_side', block: 'snow', role: 'side' }),
  Object.freeze({ name: 'wood_side', block: 'wood', role: 'side' }),
]);

/** Roles that read another block's own layer: turf and snow lie on dirt and stone (world/biomeTable.js secondary). */
const FACE_REMAPS = Object.freeze([
  Object.freeze({ block: 'grass', role: 'bottom', to: 'dirt' }),
  Object.freeze({ block: 'snow', role: 'bottom', to: 'stone' }),
]);

/** The rows at the top of a side variant's tile that are always its lip (turf, snow): about a fifth of the block, so
 *  the lip still reads at 8 m. */
export const LIP_TEXELS = 6;

/** The grammar for an id space: its layer counts and the face table, indexed block * 3 + role. Throws on a block the
 *  grammar names that the id space lacks: a typed array drops a write at a NaN index without a word. */
export function buildGrammar(blockIds) {
  const BLOCK_LAYER_COUNT = Math.max(...Object.values(blockIds)) + 1;
  const TEXTURE_LAYER_COUNT = BLOCK_LAYER_COUNT + FACE_VARIANTS.length;
  const idOf = (name) => {
    const id = blockIds[name];
    if (!Number.isInteger(id) || id < 0) throw new Error(`materialGrammar: the id space has no block "${name}"`);
    return id;
  };
  const variantLayer = (name) => {
    const i = FACE_VARIANTS.findIndex((v) => v.name === name);
    if (i < 0) throw new Error(`materialGrammar: no face variant "${name}"`);
    return BLOCK_LAYER_COUNT + i;
  };
  const faceLayerTable = new Uint8Array(BLOCK_LAYER_COUNT * 3);
  for (let b = 0; b < BLOCK_LAYER_COUNT; b++) faceLayerTable.fill(b, b * 3, b * 3 + 3);
  for (const m of FACE_REMAPS) faceLayerTable[idOf(m.block) * 3 + FACE_ROLE[m.role]] = idOf(m.to);
  for (const v of FACE_VARIANTS) faceLayerTable[idOf(v.block) * 3 + FACE_ROLE[v.role]] = variantLayer(v.name);
  const faceLayer = (block, role) => faceLayerTable[block * 3 + role];
  return { BLOCK_LAYER_COUNT, TEXTURE_LAYER_COUNT, variantLayer, faceLayer, faceLayerTable };
}

export const { BLOCK_LAYER_COUNT, TEXTURE_LAYER_COUNT, variantLayer, faceLayer, faceLayerTable } = buildGrammar(BLOCK_ID);

/**
 * The GLSL, generated from faceLayerTable. `vertexDecl` goes with the vertex declarations and `vertex` inside main()
 * (it reads three's `normal` and `color` attributes); `fragmentDecl` with the fragment declarations and `fragment`
 * before the tile is sampled at `texLayer`. The block index is clamped, so a corrupt colour never reads past the table.
 */
export function faceLayerGlsl() {
  const n = faceLayerTable.length;
  const entries = Array.from(faceLayerTable, (v) => v.toFixed(1)).join(', ');
  return {
    vertexDecl: [`flat varying float vTexLayer;`, `const float FACE_LAYER[${n}] = float[${n}](${entries});`].join('\n'),
    vertex: [
      `int faceRole = normal.y > 0.5 ? ${FACE_ROLE.top} : (normal.y < -0.5 ? ${FACE_ROLE.bottom} : ${FACE_ROLE.side});`,
      `vTexLayer = FACE_LAYER[clamp(int(color.r + 0.5), 0, ${BLOCK_LAYER_COUNT - 1}) * 3 + faceRole];`,
    ].join('\n'),
    fragmentDecl: 'flat varying float vTexLayer;',
    fragment: 'float texLayer = floor(vTexLayer + 0.5);',
  };
}
