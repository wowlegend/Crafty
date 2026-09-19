# crafty-s0-reality-audit.js — relocated 2026-09-19 from ~/Code/.claude/workflows (unversioned launch root) into this repo. DO NOT RE-RUN AS-IS.
Verified stale by an adversarial review (Opus, 2026-09-19); fix before any re-run:
- `DATE` is hardcoded `2026-05-30`: a re-run OVERWRITES the committed S0 baseline `memory/REALITY-AUDIT-2026-05-30.md` and the five committed asset files. Parameterise DATE/ASSETS/output path via `args`.
- CALIBRATION block L19-22 is false today (`frontend/test_swarm.js` deleted 2026-06-16; vitest + Playwright + tests/gates + 21 scripts/ci gates exist now).
- DIMENSIONS point at dead paths (`src/AdvancedGameFeatures.jsx`); build-bundle-load focus files live in `frontend/`, not under `SRC`.
- LIVE_PROMPT steps 3/6 re-derive probes the repo now ships (29 scripts/visual probes + perf scenario runner) — numbers would not be comparable; the pointer-lock menu bypass as written does not clear the menu (App's `isPointerLocked` state does).
- Tooling claims wrong: puppeteer is ^25.6.0 (not 24.x); `headless: 'new'` is not a declared option.
- Refute stage: `lens` compared by exact string to 'code-trace' while the prompt says 'LENS = CODE-TRACE SKEPTIC' (silent miss); `.catch(() => null)` folds ERRORED refuters into 'unrefuted'; CAP = 24 was binding on the only real run (7 High findings unrefuted). Findings keyed on agent-echoed `id`/`dimension` strings.
- meta.description says read-only; the script runs `npm run build`, writes `frontend/_s0_capture.mjs` and the audit .md.
