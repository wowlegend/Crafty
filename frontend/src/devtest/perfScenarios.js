// perfScenarios.js — S2-B2-M2: the perf-probe scenario TABLE (pure data + schedule math).
// Scenarios per STATE-REVIEW-2026-06-10 §4: A explore-idle baseline · B night-siege control
// (held=false, the honest baseline) · C siege + grab-orbit steady-state (the gated C−B delta)
// · D the grab/drop EDGE (light-count hitch hunt) · E siege + a dynamic hurl stand-in (the
// physics presence M1's render-only phantom lacks — what M3's real hurl will add).

export const SCENARIO_SEC = 60;     // sampling window per scenario
export const PROBE_DPR = 1.5;       // pinned DPR while probing (AdaptiveDpr disabled)
export const SIEGE_NIGHTS = 6;      // nightCount=6 saturates the siege ramp (24/4 cap)
export const NIGHT_T = 0.8;         // deep night; +0.2 cycle over 60s never re-enters day
export const DAY_T = 0.4;           // mid-day for the A baseline
export const EDGE_PERIOD_SEC = 2;   // D: grab/drop toggle cadence
export const HURL_PERIOD_SEC = 3;   // E: hurl-stand-in cadence

export const SCENARIOS = {
  A: { label: 'explore-idle day baseline', timeOfDay: DAY_T, nights: 0, held: false, edge: false, hurl: false },
  B: { label: 'night-siege control (held=false)', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: false, edge: false, hurl: false },
  C: { label: 'siege + grab-orbit steady-state', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: true, edge: false, hurl: false },
  D: { label: 'grab/drop EDGE (light-count hitch)', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: false, edge: true, hurl: false },
  E: { label: 'siege + dynamic hurl stand-in', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: true, edge: false, hurl: true },
};

/**
 * One scenario's event schedule: [{ t (sec from sample-start), type: 'setHeld'|'hurl', value? }].
 * D alternates held true/false every EDGE_PERIOD_SEC (starting true — D begins held=false);
 * E fires a hurl request every HURL_PERIOD_SEC (consumed transiently by PerfProbeSystem).
 */
export function scenarioEvents(id, durationSec = SCENARIO_SEC) {
  const scn = SCENARIOS[id];
  if (!scn) throw new Error(`unknown perf scenario "${id}"`);
  const events = [];
  if (scn.edge) {
    let held = true;
    for (let t = EDGE_PERIOD_SEC; t < durationSec; t += EDGE_PERIOD_SEC) {
      events.push({ t, type: 'setHeld', value: held });
      held = !held;
    }
  }
  if (scn.hurl) {
    for (let t = HURL_PERIOD_SEC; t < durationSec; t += HURL_PERIOD_SEC) {
      events.push({ t, type: 'hurl' });
    }
  }
  return events;
}
