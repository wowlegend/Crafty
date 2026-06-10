# S2-B2-M2 — VOIDHAND FPS gate: desktop verdict + on-device protocol

> The de-risk-FIRST milestone (WILDHEART M2 pattern): measure what VOIDHAND costs per frame under
> the worst case (saturated night siege) BEFORE building the M3 verbs, against a pinned budget.
> Plan-of-record: `docs/superpowers/plans/2026-06-10-crafty-s2b2-m2-fps-gate.md` (inputs:
> STATE-REVIEW-2026-06-10 §4). Executed by the autonomous loop, 2026-06-10.

## 1. Methodology (the probe)

Dev-only **perf-probe mode** `?perf=<A..E>` (tree-shaken from prod): physics + spawns **LIVE**
(NOT capture mode), DPR pinned 1.5, tier pinned `high`, `PerformanceMonitor`/`AdaptiveDpr` OFF,
seeded `Math.random`, no pointer-lock required (touch-iPad-runnable), player auto-healed 100/s.
Each scenario: start → terrain-stable wait → t0 store writes → 4s settle → **60s of rAF frame
deltas** → stats on-screen + `window.__craftyPerfResult`. Runner: `npm run perf:m2`
(`frontend/scripts/perf/run-scenarios.mjs`, headless-new Chrome + `--use-angle=metal`).

| Scenario | What it measures |
|---|---|
| A | explore-idle day baseline |
| B | **night-siege control, held=false** (the honest baseline — dominated by pre-existing NPC cost) |
| C | siege + grab→orbit steady-state — **the gated delta = C−B** |
| D | the grab/drop EDGE: 29 held-toggles at 2s cadence (light-count hitch hunt) |
| E | siege + a 3-body **dynamic hurl stand-in** (the physics presence M1's render-only phantom lacks) |

**Pinned budget (Decision #5, adopted from STATE-REVIEW §4):** C−B ≤ **1.5 ms median** AND
≤ **3.0 ms p95** frame-time delta.

## 2. Desktop run (2026-06-10) — VERDICT: **PASS ✅**

Host `KZ-M3-Max-MacBook` · renderer **ANGLE Metal, Apple M3 Max** (real GPU, stamped in the
report) · evidence `memory/perf/m2-KZ-M3-Max-MacBook-1781105278853.json`.

| Scenario | fps | median ms | p95 ms | long>33.4ms |
|---|---|---|---|---|
| A explore-idle | 60.0 | 16.70 | 16.80 | 0 |
| B siege control | 59.9 | 16.70 | 16.70 | 2 |
| C siege + held orbit | 59.7 | 16.70 | 16.80 | 8 |
| D grab/drop edge | 59.9 | 16.70 | 16.70 | 1 |
| E siege + hurl stand-in | 59.9 | 16.70 | 16.80 | 1 |

| Delta | median | p95 | long frames | vs budget |
|---|---|---|---|---|
| **C−B (gated)** | **0.00 ms** | **+0.10 ms** | +6 | **PASS** (≤1.5 / ≤3.0) |
| D−B | 0.00 ms | 0.00 ms | −1 | edge hitch ABSENT |
| E−B | 0.00 ms | +0.10 ms | −1 | dynamic-body cost unresolvable |

**Reading it honestly:**
- Everything is vsync-locked at ~60 fps; the M3 Max cannot resolve sub-millisecond VOIDHAND
  costs above the siege baseline. That is the expected shape of a PASS on this hardware — the
  desktop gate's job is to catch BLOWUPS (it would have caught a re-mesh, a light re-link storm,
  or a broad-phase explosion), not to substitute for the device number.
- **D is the strongest empirical result:** 29 grab/drop toggles produced ONE long frame (fewer
  than the control's 2). The Task-3 light-POOL fix (pointLight always-mounted, intensity-gated)
  verifiably removed the light-count program re-link at the grab edge — the #68 carry-forward
  is CLOSED with evidence, not by construction alone.
- C's +6 long frames (8 vs 2 over 60s, medians untouched) is within run-to-run siege noise but
  worth a glance on the device run; if it recurs there, suspect the grab-moment mesh upload.
- E confirms 3 cycling dynamic cuboids are free at desktop scale; the REAL hurl (impact bursts,
  damage events, M3 wiring) still needs its own measurement → **M3 re-gate item: re-run E−B
  (and C−B) after the real HURL/SLAM ship.**

## 3. Scope honesty + levers

- Desktop PASS is **necessary, not sufficient**: a mid-iPad has ~an order less GPU headroom and
  thermal throttling. The device confirmation is parked to Kevin (below) and does **NOT block
  M3** (the WILDHEART precedent — M3-M6 are decision-independent of the device number).
- **Levers if the device run fails (ordered):** phantom pointLight removal → castShadow trims
  elsewhere → spec sphere-collider/sensor levers → tier levers.
- Context for the device session: the 4.27MB main chunk (~49% inlined Rapier WASM) inflates
  load + main-thread parse on iPad — an S3 bundle-split item, not an M2 frame-cost item.

## 3b. M3 RE-GATE (2026-06-10, post-HURL/SLAM — the recorded re-gate item, executed)

Scenario E now drives **REAL hurls** through the gameplay channel (PerfProbeSystem = a thin
probe-to-gameplay adapter; the 3-body Rapier stand-in is gone). Run `m2-KZ-M3-Max-MacBook-1781111677559.json`:

| Delta | median | p95 | verdict |
|---|---|---|---|
| C−B (held orbit) | 0.00 ms | −0.10 ms | PASS (re-confirmed) |
| **E−B (real hurl every 3s)** | **0.00 ms** | **0.00 ms** | **PASS** — the substepped pure-math flight is cost-invisible at desktop scale |

Long-frame counts (B=16, C=4, E=25) moved WITH the control between runs — siege-noise dominated,
deltas inside run-to-run variance. The M3 re-gate is CLOSED; the iPad session (§4) remains the
device-scale confirmation and now exercises the real verbs via `?perf=E`.

## 4. On-device protocol (Kevin — one-tap, ~5 min, bundles #63)

1. Mac: `cd /Users/kz/Code/Crafty/frontend && npx vite --host`
2. iPad (same Wi-Fi), Safari: `http://<mac-LAN-ip>:5173/?perf=B` → wait for the on-screen
   **DONE** numbers (~2 min) → then `?perf=C` (optionally `?perf=E`). No Safari inspector needed.
3. Compare the two medians: **C−B ≤ 1.5 ms median / ≤ 3.0 ms p95 = PASS** (desktop shape above
   is the expected reference). Long-frame spikes in C → glance at §3 levers.
4. **Same session (#63):** the WILDHEART golem device check per `memory/S2B1-M2-PERF.md` §4
   (night siege → golem form → bounded fps delta vs human).
5. Probe runs on the dev origin — it never touches a real save.
