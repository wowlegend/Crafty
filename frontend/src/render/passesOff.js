// passesOff.js — switch named post passes off in the live composer, for the lookbook's whole-frame differential
// (scripts/visual/lookbook.mjs --passes; plan docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md). The set comes
// from the lookbook seam (render/lookbookSeam.js lookbookPassesOff) and is empty for every player, so for them this is
// a loop over a handful of passes that finds nothing to do.
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
// n8ao's N8AOPostPass is a pass of its own (no postprocessing name: render/passTimer.js passLabel reads it the same way).
const isN8AO = (pass) => !!(pass && pass.configuration && 'aoRadius' in pass.configuration);

/** Every name the seam accepts: the effects above, N8AO, and the Sun billboard (render/Sun.jsx reads that one). */
export const LOOKBOOK_PASS_NAMES = Object.freeze([...Object.keys(EFFECTS), 'n8ao', 'sun'].sort());

const NOOP_UPDATE = () => {};

function offNamesOf(effect, off) {
  for (const name of off) if (EFFECTS[name] && EFFECTS[name].includes(effect.name)) return true;
  return false;
}

function switchOff(obj, state, isPass) {
  if (state.has(obj)) return false;
  if (isPass) {
    state.set(obj, { enabled: obj.enabled });
    obj.enabled = false;
    return true;
  }
  const own = Object.prototype.hasOwnProperty.call(obj, 'update');
  state.set(obj, { blend: obj.blendMode.blendFunction, own, update: obj.update });
  obj.update = NOOP_UPDATE;
  obj.blendMode.blendFunction = BlendFunction.SKIP;
  return true;
}

function restore(obj, held) {
  if ('enabled' in held) {
    obj.enabled = held.enabled;
    return;
  }
  if (held.own) obj.update = held.update;
  else delete obj.update;
  obj.blendMode.blendFunction = held.blend;
}

/**
 * Bring the composer's passes in line with `off` (a Set of LOOKBOOK_PASS_NAMES). `state` holds what each switched-off
 * effect or pass had, so it is restored exactly; keep one per composer. Write-on-change.
 * @returns {boolean} true when anything changed
 */
export function applyPassesOff(composer, off, state) {
  if (!composer || (off.size === 0 && state.size === 0)) return false;
  let changed = false;
  const live = new Set();
  for (const pass of composer.passes || []) {
    if (isN8AO(pass)) {
      if (off.has('n8ao')) { live.add(pass); changed = switchOff(pass, state, true) || changed; }
      continue;
    }
    if (!Array.isArray(pass && pass.effects)) continue;
    for (const e of pass.effects) {
      if (offNamesOf(e, off)) { live.add(e); changed = switchOff(e, state, false) || changed; }
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
