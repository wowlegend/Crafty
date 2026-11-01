// night.js — the root of the First Night's own chunk (W3-A task script, U1): the night's code that nothing needs before
// the world is built rides here, so it costs the boot chunk nothing. night/nightLoader.js fetches it once the world is
// built and calls installNight once. Named for the chunk it roots: a root called index.js names its chunk
// index-<hash>.js, which scripts/ci/bundle-budget.mjs cannot tell from the boot chunk.
import { NIGHT_STRINGS, mergeStrings } from './nightStrings.js';
import { registerVoices } from '../SoundManager.jsx';

// The night's synth voices, registered into the sound bank when the chunk installs; S1 adds its windup voices here. The
// night's lines live beside their merge, in night/nightStrings.js.
const NIGHT_VOICES = {};

/** Install the night; called once per page by night/nightLoader.js. Returns the chunk's handle. */
export function installNight() {
  mergeStrings(NIGHT_STRINGS);
  registerVoices(NIGHT_VOICES);
  // The chunk's name, an inline literal only this chunk carries: scripts/ci/bundle-budget.mjs finds it here and nowhere
  // in the boot chunk.
  return { chunk: 'crafty:night-chunk' };
}
