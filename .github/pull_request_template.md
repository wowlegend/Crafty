## What changed and why

## Looks

If this changes how anything renders (scene, HUD, a panel), attach eye-level lookbook frames from before and
after: `cd frontend && node scripts/visual/lookbook.mjs --out <dir>`, on a real GPU. A look change is accepted on
those frames, read by eye (`docs/superpowers/DECISIONS.md`, 2026-10-28 W1-H item 1). Say so here if nothing renders
differently.

## Checks

The commit tier (lint, unit, build, bundle budget) runs on every commit. e2e runs in CI on this exact sha.
