## What changed and why

## Looks

If this changes how anything renders (scene, HUD, a panel), attach eye-level lookbook frames from before and
after: `cd frontend && node scripts/visual/lookbook.mjs --out <dir>`, on a real GPU. A look change is accepted on
those frames, read by eye (`docs/superpowers/DECISIONS.md`, 2026-10-28 W1-H item 1). Say so here if nothing renders
differently.

## Checks

A commit runs the static gates and the unit tests that import a staged file; a push runs opsec-scan and the gates that
read the pushed range. CI runs every gate, the unit suite, the build, the bundle budget and the e2e shards on this
exact sha, and its `ci ok` is the verdict (`CLAUDE.md`, Gates). Name here anything this change could break that no gate
runs, and how you checked it.
