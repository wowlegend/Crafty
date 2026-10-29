---
paths:
  - "frontend/src/**"
---
# Game code: what the code does not say at a glance

Loaded when you touch `frontend/src/`. Each line states a decision or a constraint and why; every decision stands while
it earns its place (DECISIONS 2026-10-28 items 14 and 16), and changing one is recorded in DECISIONS.

- **Looks.** A look change is judged on eye-level lookbook frames (`node frontend/scripts/visual/lookbook.mjs`, real GPU):
  shoot before and after, look at both at full size, attach them with a one-line rationale to the commit or PR
  (DECISIONS 2026-10-28 W1-H item 1). Judge in the world with the grade on, never on a studio card. Pick a visual
  reference first. Several intended look changes in one campaign get one batched taste review (a contact sheet),
  recorded in DECISIONS and shown on the Command Record.
- **Capture mode is a test tool, not a look oracle.** e2e specs and probes call `enterCapture` to freeze the world,
  and it works by suppression: `isCaptureMode()` guards turn things off. Add no new guard. An existing guard must RESET
  to a declared value, never early-`return`, and must check inside the callback, because capture is enabled after
  boot and boot length varies per process. Each guard leaves when its subject next moves (reset plan row 48).
- **The Player loop.** `Components.jsx` is the `Player` `useFrame` controller; its pure logic lives in `game/*`. The
  per-frame ORDER of that loop is load-bearing: a split must keep it and prove it in the running game (e2e or a live
  probe), not only that it compiles. Render JSX never reads fields a worker or the loop mutates (Game-Loop Isolation).
- **The engine core** (greedy mesher, block texture array, Rapier KCC, A* worker, audio occlusion, day/night, chunk
  dispose) is what the deployed game runs on: a replacement lands when it measures better on the same scenes (frame
  time, memory, e2e, lookbook), not on taste.
- **P4 engineering constraints** (`docs/superpowers/specs/crafty-coherence-pillars.md`): no mid-combat re-mesh; input
  through the intent abstraction, never `pointerLockElement`. Break one only with a measurement showing the iPad-class
  frame budget, or input parity, still holds, recorded in DECISIONS.
- **Frame cost.** Every new render or physics feature states its cost story: pooled, capped, tier-gated, no
  allocation in the hot path. Measure the change against a baseline when in doubt. Derive values; do not bake them.
- **ECS.** miniplex is a narrow slice (mobs, loot, XP, grass, the minimap and compass, nametags, element zones, hurl, squad AI:
  `grep -rln "ecs/world" frontend/src | grep -v test`), not the whole architecture. The store owns persisted state.
- **Design language** (S1-C bold-flat, 2026-06-01). Tokens: `src/theme/tokens.js` to `src/theme/cssVars.js`
  (`--ui-*`, `applyThemeVars()`) to `tailwind.config.cjs`. Filled two-tone game-icons (`src/ui/primitives/gameIcons.js`,
  game-icons.net, CC BY 3.0, credited in `src/ui/CreditsScreen.jsx`) for game content; lucide outline for app
  chrome; the primitives are the set in `src/ui/primitives/index.js`. i18n in `src/i18n/` (en default, zh-CN lazy).
  No emoji: write `\u{}` escapes.
- **Touch.** iPad and iPhone are built. iOS cold start is pointer-lock-gated and bridged by `enterPlay()`
  (`src/MenuSystem.jsx`); the quest tracker collapses on touch (`tests/gates/quest-tracker-touch.test.jsx`). Real-device
  feel is Kevin's.
- **Player lens.** A fresh player must be able to find a feature: the key is taught, the HUD is honest, a denied
  action gives feedback. Depth and coherence over feature count; the audience is broad, and accessibility never vetoes
  depth. Audio is a first-class axis: a feature that should sound and does not is unfinished.
- **Before calling a change done:** after any JSX or module-structure change, `npm run build` passes (no hook builds;
  CI is the first full build otherwise); a large player-facing deletion is recorded in DECISIONS with the lived or e2e
  proof that nothing still promised depends on what was cut.
