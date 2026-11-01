// night.js — the root of the First Night's own chunk (W3-A task script, U1): the night's code that nothing needs before
// the world is built rides here, so it costs the boot chunk nothing. night/nightLoader.js fetches it once the world is
// built and calls installNight once. Named for the chunk it roots: a root called index.js names its chunk
// index-<hash>.js, which scripts/ci/bundle-budget.mjs cannot tell from the boot chunk.
import { mergeStrings } from './nightStrings.js';
import { registerVoices } from '../SoundManager.jsx';

// The night's own lines (en and zh-CN together) and synth voices, merged into the game's tables when the chunk installs;
// the units that speak (D2's kindle, R1's lend, D3's dawn, S1's windup voices) add theirs here.
const NIGHT_STRINGS = { en: {}, 'zh-CN': {} };
const NIGHT_VOICES = {};

/** Install the night; called once per page by night/nightLoader.js. Returns the chunk's handle. */
export function installNight() {
  mergeStrings(NIGHT_STRINGS);
  registerVoices(NIGHT_VOICES);
  // The chunk's name, an inline literal only this chunk carries: scripts/ci/bundle-budget.mjs finds it here and nowhere
  // in the boot chunk.
  return { chunk: 'crafty:night-chunk' };
}
