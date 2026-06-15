# Crafty — Agentic SOTA Game E2E Testing (research, 2026-06-15)

> Source: background workflow `crafty-agentic-e2e-research` (wf_558a689d-64b, 5 agents, live web research + repo grounding). Kevin's ask: "why can't you test E2E? run a separate workflow to determine agentic SOTA game E2E testing; if there's tools to install, ask me to decide."

## Headline

Crafty CAN test E2E today — it already runs the **2026 SOTA shape**: a dev-only `window.__craftyTest` seam (19 hooks), the full zustand store + live `__threeCamera` on `window`, puppeteer driving the REAL vite app, a load-bearing **capture-determinism** layer (seeded RNG, paused physics, pinned cam, suppressed mobs/pointer-lock, forced high tier), a pixelmatch **6% visual gate** over 20 states, and live desktop/touch/perf probes. (OpenAI's official `develop-web-game` skill standardizes the same two hooks; this pattern is the consensus.)

**The real gaps are COVERAGE, not tooling** — and the two highest-ROI fixes need **zero new installs**. Full autonomous bug-discovery is still research-grade (best 2026 agents find ~48% of injected bugs), so we target the cheap high-value slice.

## Gaps (ranked)

1. **Gameplay-flow / correctness is untested (biggest hole).** Every gated state is a *static physics-paused diorama* by design, so live cause→outcome chains are never asserted: combat/damage, death/respawn, loot→inventory→equip, XP→level-up, quest progression, crafting, boss outcome, day/night effects. Crafty is an action-RPG whose RPG mechanics have no E2E.
2. **Audio is never heard.** All "audio gates" are static-source greps or pure-fn param checks — nothing renders/analyzes actual output (mix, crossfade, spatialization, fires-on-event). (Same blind-spot class that hid dead mouse-look.) Stays Kevin-ear-gated for taste.
3. **Frame-rate-under-load fidelity + sustained-session.** perf:m2 overstates cost on SwiftShader; no memory-leak / chunk-stutter / GC / thermal gating. **SwiftShader is deprecating** (Chrome 130 Intent-to-Remove auto software-WebGL fallback) — CI substrate risk.
4. **Cross-device matrix absent.** Single 1280x800; puppeteer is Chromium-only → **no real Safari/WebKit or Firefox** coverage. SwiftShader != real mobile-GPU.
5. **No true multi-touch.** Probe drives one finger at a time; two-thumb (move+look) posture untested.
6. **Regression coverage is a curated 20-state subset** — regressions outside a baselined pose are invisible; no property/fuzz coverage.
7. **No agentic "play-the-game" loop** (fuzz→crash/NaN, targeted exploration).
8. **No input-feel measurement** (sensitivity/latency/jitter) — Kevin-gated.
9. **No replay / state-hash determinism gate** (can't bisect a sim regression to first diverging tick).
10. **No network/persistence E2E** (save/load, offline/error).

## Recommended stack (priority order — evolve, don't rip-and-replace)

1. **Close the gameplay-flow hole — ZERO new deps.** Extend `window.__craftyTest` with a `serialize()`/`render_game_to_text` JSON state-snapshot hook + a deterministic `step`/`advanceTime` hook + an **un-paused-physics deterministic mode**; write new `*.mjs` drivers (reuse the puppeteer driver) that drive input → step → assert user-meaningful chains (damage/death/loot→inventory→equip/XP→level-up). **Single highest-ROI move.**
2. **Seed the sim RNG — ZERO deps.** Inline Mulberry32, per-subsystem streams (worldgen vs combat vs cosmetic), advanced per-TICK; add a **state-hash golden gate** (FNV-1a after N ticks; same replay at 30/60/144fps must hash identical; bisect to first diverging tick). Turns the determinism layer into a bisectable regression gate + reproducible repro artifacts.
3. **`@react-three/test-renderer`** (1 dev dep) — headless scene-graph assertions in Node, no WebGL flake; the cheap missing middle of the pyramid.
4. **Trial Playwright alongside puppeteer** — its **WebKit** engine is the ONLY path to real Safari/iOS-engine coverage; + Clock API as a zero-code timer/rAF freezer. Keep puppeteer for the current visual harness (don't churn working gates).
5. **LLM-vision oracle as a SECONDARY "does it look right" pass** — MetaGlitch-style metamorphic-relation prompts (encode Crafty invariants: "player never passes through solid terrain", "water stays below shoreline") + a GliDe-style adversarial "is-this-actually-a-bug" verifier to suppress the false-positive flood (per `feedback_verify_detector_before_fixing`: 99.2% were false positives). Via existing Claude access; frontier model OUT of the per-frame loop.

**Defer:** Playwright MCP / vibegame / r3f-mcp agentic drivers (build the in-house gameplay-flow E2E on the existing seam first — those nascent MCP repos are patterns to copy, not deps to trust); managed visual platforms (Argos/Percy/Applitools/Chromatic — built-in pixelmatch suffices pre-launch); Mesa-Lavapipe CI substrate (only when a Linux CI exists; not needed for local macOS). Audio + real-device feel stay honestly Kevin-gated.

## Installs needing Kevin's approval (only these two)

1. **`npm i -D @react-three/test-renderer`** — headless R3F scene-graph asserts (no GPU). R3F v9 match, pmndrs-official; watch late-2025 Vector3-prop / multiple-three-instances churn.
2. **`npm i -D @playwright/test` AND `npx playwright install chromium webkit --with-deps`** — adds the WebKit/Safari engine puppeteer structurally cannot (only path to real iOS-engine coverage) + Clock API. Runs ALONGSIDE the existing puppeteer harness, not replacing it.

Everything in priority items 1-2 (gameplay-flow seam + seeded-RNG/state-hash) I can build now with no approval.
