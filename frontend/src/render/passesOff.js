// passesOff.js — switch named post passes off in the live composer, for the lookbook's whole-frame differential
// (scripts/visual/lookbook.mjs --passes; plan docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md). The set comes
// from the lookbook seam (render/lookbookState.js lookbookPassesOff, which render/lookbookSeam.js writes) and is empty
// for every player, so for them this is a loop over a handful of passes that finds nothing to do.
//
// "Off" has to cost what a deletion would on the GPU, so an effect is switched off in both places its work lives: its
// blend function goes to SKIP, which postprocessing 6.39.5 leaves out of the merged shader (EffectPass.updateMaterial)
// and, when nothing is left in a pass, skips that pass's draw; and its update() stops running, because EffectPass.render
// calls every effect's update() whatever its blend function, and that is where Bloom's and GodRays' own passes render.
import { BlendFunction } from 'postprocessing';

// postprocessing's own `name` strings, which survive the production bundle's minifier (class names do not).
const EFFECTS = {
  godrays: ['GodRaysEffect'],
  bloom: ['BloomEffect'],
  smaa: ['SMAAEffect'],
  tonemapping: ['ToneMappingEffect'],
  grade: ['HueSaturationEffect', 'BrightnessContrastEffect'],
  vignette: ['VignetteEffect'],
};
/** Every name the seam accepts: the effects above and the Sun billboard (render/Sun.jsx reads that one). */
export const LOOKBOOK_PASS_NAMES = Object.freeze([...Object.keys(EFFECTS), 'sun'].sort());

/** The postprocessing effect names a set of LOOKBOOK_PASS_NAMES switches off, sorted: what the composer's chain must
 *  show skipped while they are off. 'sun' is a mesh, not an effect, and adds none. */
export function lookbookEffectNames(names) {
  const out = new Set();
  for (const n of names) for (const e of EFFECTS[n] || []) out.add(e);
  return [...out].sort();
}

const NOOP_UPDATE = () => {};

function offNamesOf(effect, off) {
  for (const name of off) if (EFFECTS[name] && EFFECTS[name].includes(effect.name)) return true;
  return false;
}

function switchOff(obj, state) {
  if (state.has(obj)) return false;
  const own = Object.prototype.hasOwnProperty.call(obj, 'update');
  state.set(obj, { blend: obj.blendMode.blendFunction, own, update: obj.update });
  obj.update = NOOP_UPDATE;
  obj.blendMode.blendFunction = BlendFunction.SKIP;
  return true;
}

function restore(obj, held) {
  if (held.own) obj.update = held.update;
  else delete obj.update;
  obj.blendMode.blendFunction = held.blend;
}

/**
 * Bring the composer's effects in line with `off` (a Set of LOOKBOOK_PASS_NAMES). `state` holds what each switched-off
 * effect had, so it is restored exactly; keep one per composer. Write-on-change.
 * @returns {boolean} true when anything changed
 */
export function applyPassesOff(composer, off, state) {
  if (!composer || (off.size === 0 && state.size === 0)) return false;
  let changed = false;
  const live = new Set();
  for (const pass of composer.passes || []) {
    if (!Array.isArray(pass && pass.effects)) continue;
    for (const e of pass.effects) {
      if (offNamesOf(e, off)) { live.add(e); changed = switchOff(e, state) || changed; }
    }
  }
  for (const [obj, held] of state) {
    if (live.has(obj)) continue;
    restore(obj, held);
    state.delete(obj);
    changed = true;
  }
  return changed;
}
