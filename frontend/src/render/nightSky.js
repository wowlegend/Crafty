// nightSky.js — the pure gate for the twilight night-sky layer (stars + moon) in the Atmosphere
// skydome shader. The mood model (render/mood.js) is a continuous mood in [0,2]: 0 = explore (day),
// 1 = dusk (everyday night/combat), 2 = obsidian (boss). The star/moon layer should READ only on the
// everyday-night sky (dusk), and never on the bright-blue day sky (mood 0) nor the crimson danger sky
// (mood 2) — both for taste (stars don't belong there) and to keep those baselines byte-identical.
//
// A symmetric triangle peaking at dusk gives exactly that: 0 at mood 0, 1 at mood 1, 0 at mood 2,
// with a smooth fade as day->dusk->obsidian transitions. The Atmosphere shader multiplies its star
// field + moon disc by this value (uStar uniform), so the layer fades in/out with the live mood.

/** starIntensity(mood) -> [0,1]: 0 at day(0)/obsidian(2), peak 1 at dusk(1). Clamped + NaN-safe. */
export function starIntensity(mood) {
  const m = Number(mood);
  if (!Number.isFinite(m)) return 0;
  return Math.max(0, 1 - Math.abs(m - 1));
}
