import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { callTestHook } from './testBridge';
import { isPerfProbe, perfScenarioId, perfDurationSec, setProbePhase, requestHurl, seedRandom } from './perfProbe';
import { SCENARIOS, scenarioEvents, SCENARIO_SEC } from './perfScenarios';
import { frameStats } from './frameStats';

const SETTLE_MS = 4000;     // post-terrain settle before sampling starts
const HEAL_EVERY_MS = 1000; // keep the unattended player alive through the siege

/**
 * PerfProbeRunner — S2-B2-M2 (dev-only DOM overlay; App mounts it, it self-nulls unless ?perf=).
 * Sequence: start game (no pointer-lock needed -> touch-iPad-runnable) -> pin tier -> wait stable
 * terrain -> apply the scenario's t0 store writes -> settle -> sample SCENARIO_SEC of rAF deltas
 * (healing the player + firing scheduled events as it goes) -> publish stats on-screen + on
 * window.__craftyPerfResult (consumed by scripts/perf/run-scenarios.mjs AND read off-screen on iPad).
 */
export function PerfProbeRunner() {
  const [status, setStatus] = useState('booting…');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isPerfProbe()) return undefined;
    let cancelled = false;
    const id = perfScenarioId();
    const scn = SCENARIOS[id];
    const durationSec = perfDurationSec(SCENARIO_SEC); // ?perfsec override (fast e2e) else 60s default
    const store = () => useGameStore.getState();
    const restoreRandom = seedRandom();

    const waitStableTerrain = () => new Promise((res) => {
      let last = -1; let stable = 0;
      const iv = setInterval(() => {
        const g = store().getGeneratedChunks;
        const size = g ? g().size : -1;
        stable = size > 0 && size === last ? stable + 1 : 0;
        last = size;
        if (stable >= 6 || cancelled) { clearInterval(iv); res(); }
      }, 300);
    });

    (async () => {
      setProbePhase('settling');
      setStatus(`scenario ${id} — starting…`);
      callTestHook('start');           // leave the menu (pointer lock is best-effort / no-op on touch)
      store().setQualityTier('high');  // pin the tier (matches the visual-gate tier)
      setStatus(`scenario ${id} — waiting for terrain…`);
      await waitStableTerrain();
      if (cancelled) return;

      // t0 scenario writes
      store().setTimeOfDay(scn.timeOfDay);
      useGameStore.setState({ nightCount: scn.nights });
      if (scn.held) { store().setHeldPhantom({ color: '#A9966E' }); store().setVoidhandHeld(true); }

      setStatus(`scenario ${id} — settling…`);
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (cancelled) return;

      setProbePhase('sampling');
      setStatus(`scenario ${id} — sampling ${durationSec}s…`);
      const events = scenarioEvents(id, durationSec);
      const deltas = [];
      let prev = performance.now();
      let lastHeal = prev;
      const t0 = prev;
      let next = 0;
      await new Promise((res) => {
        const tick = (now) => {
          deltas.push(now - prev);
          prev = now;
          const tSec = (now - t0) / 1000;
          if (now - lastHeal >= HEAL_EVERY_MS) { store().healPlayer(100); lastHeal = now; }
          while (next < events.length && events[next].t <= tSec) {
            const ev = events[next++];
            if (ev.type === 'setHeld') {
              if (ev.value) { store().setHeldPhantom({ color: '#A9966E' }); store().setVoidhandHeld(true); }
              else { store().setVoidhandHeld(false); store().setHeldPhantom(null); }
            } else if (ev.type === 'hurl') {
              requestHurl();
            }
          }
          if (tSec >= durationSec || cancelled) { res(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      setProbePhase('done');
      restoreRandom();
      const stats = frameStats(deltas.slice(1)); // drop the settle-boundary delta
      const out = { scenario: id, label: scn.label, ...stats };
      window.__craftyPerfResult = out;
      setResult(out);
      setStatus(`scenario ${id} — DONE`);
    })();

    return () => { cancelled = true; restoreRandom(); };
  }, []);

  if (!isPerfProbe()) return null;
  return (
    <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, background: 'rgba(10,10,18,0.85)',
      color: '#fff', fontFamily: 'monospace', fontSize: 14, padding: '10px 14px', borderRadius: 8,
      pointerEvents: 'none', maxWidth: 440 }}>
      <div>PERF PROBE — {status}</div>
      {result && (
        <pre style={{ fontSize: 16, margin: '6px 0 0' }}>
{`fps     ${result.fps.toFixed(1)}
median  ${result.medianMs.toFixed(2)} ms
p95     ${result.p95Ms.toFixed(2)} ms
max     ${result.maxMs.toFixed(1)} ms
long>33 ${result.longFrames}`}
        </pre>
      )}
    </div>
  );
}
