// audioBridge.js — a tiny module singleton so a non-React system (the R3F WeatherSystem in GameScene)
// can reach the shared AudioContext + master-bus INPUT node that SoundProvider owns, without prop-
// drilling through R3F or storing a heavy AudioContext in the zustand store. SoundProvider publishes the
// pair once its ctx + bus exist; consumers read it (null-safe before audio inits). Mirrors how the engine
// already shares non-React refs (getMobGroundLevel/terrainWorker) but kept in its own module so the audio
// concern stays out of the game store.
let _ctx = null;
let _busInput = null;

// Publish the shared audio context + master-bus input (SoundProvider calls this once they exist).
export function setAudioBridge(ctx, busInput) {
  _ctx = ctx || null;
  _busInput = busInput || null;
}

// Read the shared pair. Returns { ctx, busInput } — either may be null before audio has initialized
// (consumers must null-check + fall back to no-op so audio is never required for the feature to run).
export function getAudioBridge() {
  return { ctx: _ctx, busInput: _busInput };
}
