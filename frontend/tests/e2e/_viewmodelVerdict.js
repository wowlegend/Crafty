// viewmodel.spec.js's verdict on what the page reads, kept out of the spec so a unit gate
// (tests/gates/viewmodel-verdict-gates.test.js) can drive it with the readings each broken build produces. The same
// split as _postFxWalk.js for post-fx-once.

/** Frames the pass is counted over. */
export const FRAMES = 4;
const DEG = Math.PI / 180;
/** The sky's up must come back to the world's up within this, after the view is turned 1.1 rad and tilted 0.3 rad. */
const SKY_SLACK_DEG = 3;
/** The key moves with the game's clock between the light's frame and the read. */
const KEY_SLACK_DEG = 8;

/**
 * Every failed check on a reading, in order: { setup, line }. `setup` marks a reading that cannot judge the hands (a
 * lost context, too few frames, nothing mounted, the view not tilted); an empty list is a pass.
 */
export function viewmodelVerdict(r, frames = FRAMES) {
  const out = [];
  const setup = (ok, line) => { if (!ok) out.push({ setup: true, line: `SETUP: ${line}` }); };
  const check = (ok, line) => { if (!ok) out.push({ setup: false, line }); };
  setup(r.lost === false, 'the WebGL context was lost');
  setup(r.drawn >= frames, `R3F drew fewer than ${frames} frames in the wait`);
  setup(r.hands > 0, 'no hands mounted in the viewmodel');
  setup(Math.abs(r.pitch + 0.3) < 0.05, 'the view did not keep the tilt the light check needs');
  setup(Array.isArray(r.worldKey), 'readSkyLight reports no key');
  if (out.length) return out;
  const passes = r.passes || [];
  check(passes[0] === 'RenderPass', "the composer's first pass is not its RenderPass");
  check(passes[1] === 'ViewmodelPass', 'the viewmodel pass is not right after the world');
  check(passes.length > 2, 'no effect pass after the hands');
  check(r.enabled === true, 'the viewmodel pass is disabled');
  check(r.calls >= r.drawn - 1, `the composer drew ${r.drawn} frames and ran the pass on ${r.calls}`);
  check(Math.abs(r.aspect - r.canvasAspect) < 1e-6, "the viewmodel camera is not on the canvas's aspect");
  check(r.skyUp > Math.cos(SKY_SLACK_DEG * DEG), "the sky on the hands is not the world's up in this view");
  const dot = r.key[0] * r.worldKey[0] + r.key[1] * r.worldKey[1] + r.key[2] * r.worldKey[2];
  check(dot > Math.cos(KEY_SLACK_DEG * DEG), "the key on the hands is not the world's key in this view");
  return out;
}
