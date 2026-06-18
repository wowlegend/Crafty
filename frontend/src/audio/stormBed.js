// stormBed.js — PURE-over-ctx storm ambience (W4). A self-contained looping bed: filtered white-noise
// "rain hiss" + a slow low-freq "thunder rumble" on a sub-band, ramped in/out by intensity. Mirrors
// audio/masterBus.js testability (pure over a caller-supplied AudioContext + a destination node) so it
// unit-tests with a fake ctx. The WeatherSystem owns the lifecycle; this owns the synthesis. Routes into
// the caller's destination (the master-bus input -> the limiter -> speakers) so it obeys the SFX slider.
function makeNoiseBuffer(ctx, seconds) {
  const len = Math.floor((ctx.sampleRate || 48000) * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate || 48000);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createStormBed(ctx, destination) {
  if (!ctx) return null;
  let active = false;
  let nodes = null;

  const build = () => {
    const now = ctx.currentTime || 0;
    // rain hiss: looping noise -> bandpass (mid-high) -> gain
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 2.0); src.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass'; hissFilter.frequency.setValueAtTime(2400, now); hissFilter.Q.setValueAtTime(0.6, now);
    const hissGain = ctx.createGain(); hissGain.gain.setValueAtTime(0, now);
    src.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(destination);
    // thunder rumble: a second noise -> lowpass (sub) -> gain, slowly modulated
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = makeNoiseBuffer(ctx, 2.0); rumbleSrc.loop = true;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.setValueAtTime(140, now); rumbleFilter.Q.setValueAtTime(0.4, now);
    const rumbleGain = ctx.createGain(); rumbleGain.gain.setValueAtTime(0, now);
    rumbleSrc.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(destination);
    src.start(now); rumbleSrc.start(now);
    return { src, hissGain, rumbleSrc, rumbleGain };
  };

  return {
    start() {
      if (active) return;
      nodes = build();
      active = true;
    },
    // intensity 0..1 -> ramp the two beds in (tuned conservative: an UNDER-layer, not a wall of noise).
    setIntensity(level) {
      if (!nodes) return;
      const now = ctx.currentTime || 0;
      const k = Math.max(0, Math.min(1, Number(level) || 0));
      nodes.hissGain.gain.linearRampToValueAtTime(0.05 * k, now + 1.2);
      nodes.rumbleGain.gain.linearRampToValueAtTime(0.07 * k, now + 1.2);
    },
    stop() {
      if (!nodes) { active = false; return; }
      const now = ctx.currentTime || 0;
      nodes.hissGain.gain.linearRampToValueAtTime(0, now + 0.8);
      nodes.rumbleGain.gain.linearRampToValueAtTime(0, now + 0.8);
      try { nodes.src.stop(now + 1.0); nodes.rumbleSrc.stop(now + 1.0); } catch (e) { /* already stopped */ }
      nodes = null; active = false;
    },
    get active() { return active; },
  };
}
