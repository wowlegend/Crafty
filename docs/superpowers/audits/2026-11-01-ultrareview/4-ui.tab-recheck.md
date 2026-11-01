All 10 findings hold, with one correction to #1, and all apply to current main: the 13 files I compared, including every file the findings name, are byte-identical to `origin/main` (dae1afb4). I changed nothing in the repo and removed my throwaway build and probe scripts.

| # | Severity | Where | Defect | How I checked |
|---|---|---|---|---|
| 1 | normal | `frontend/src/ui/GamePanels.jsx:423` | A consumable's only Use button appears on hover. Clicking the tile instead selects the potion as the build block and closes the panel. | Code read, not run on a device |
| 2 | normal | `frontend/src/ui/GamePanels.jsx:465` | The Spells tab shows fixed tier I numbers, but casts scale with level. At level 5, Fireball shows 50 damage / 15 mana and casts 120 / 22. | Compared with `spellTiers.js` |
| 3 | normal | `frontend/src/ui/TouchControls.jsx:280` | Hit-targets for action, cast, jump and dodge sit lower than the drawn buttons. On 820×1180, the top 16–24 px of each button misses its target. | Computed from the inline styles, not run on a device |
| 4 | normal | `frontend/src/ui/HeartbeatAudio.jsx:22` | The heartbeat loops every 0.55 s under the death screen until Respawn, and `LowHealthVignette.jsx:17` keeps pulsing. | Code read: neither checks `isAlive`, and both always mount |
| 5 | nit | `frontend/src/SimpleExperienceSystem.jsx:134` | Invalid colour syntax means the level-up gold burst never paints. | Chromium 156 computes `none`; the proposed fix renders the gradient |
| 6 | nit | `frontend/src/i18n/keyReachability.js:42` | A key on the true side of a ternary doesn't count as used, so a live key could be reported dead. | Ran on real source: `boss.dragonRisen` and `menu.heldStopped` don't match. Latent, since the tool reports 0 dead of 325 today |
| 7 | nit | `frontend/src/ui/GamePanels.jsx:806` and 13 other sites | Hardcoded English shows in zh-CN, and the trade toast picks its colour by matching English text (`TradingInterface.jsx:79`). | Read 7 of the 14 sites |
| 8 | nit | `frontend/src/i18n/cjkFonts.js:47` | If only one font face loads, success latches and the failed face is never retried. | Code read |
| 9 | nit | `frontend/src/ui/DebugOverlay.jsx:7` | The dev-only overlay's WebGL probe ships to production and creates a throwaway context on every load. | Production build: the probe is in the entry chunk |
| 10 | nit | `frontend/src/ui/ChestInventoryPanel.jsx:79` | The screen-reader label says "Move 5 Stone", but each press moves 1 (also at line 106). | Code read |

**Correction to #1:** the review says no hover state ever shows on touch, which is too strong. Tailwind is `^3.2.7` with no `hoverOnlyWhenSupported` set, so a browser that emulates hover on tap may reveal Use. Touch behaviour therefore needs a real-device check, which only Kevin can do. Keyboard players are blocked either way, because the tile isn't focusable and the button is `display:none`.

**Fix order:**
- **First:** #1, #3 and #4, because they affect play directly and #4 happens on every death.
- **#3:** one shared geometry function for glyphs and hit-targets would fix it, and the existing gate could then check all four controls. Its comment says it skips them today.
- **Separately:** #7 is the largest by volume and could be its own lane.

None of this is in the registry yet, and this worktree has no remote, so fixes can't land from here.

Should I hand all 10 to the Crafty command session as a fix lane?