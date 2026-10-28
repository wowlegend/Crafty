# Crafty

<!-- HERO: the media pipeline (reset plan item 17) places a frame of the real game here, linked to the live game. Until that frame exists, this page carries no image. -->

<!-- BEGIN PITCH (generated from frontend/src/brand.js: node frontend/scripts/ci/public-face.mjs --write) -->
A voxel action-RPG that runs in the browser, on desktop and iPad. Four Aspects, one frontier, and a dragon waiting at its far edge.

**[Play it now](https://crafty-game.vercel.app/)**: nothing to install.
<!-- END PITCH -->

## The game

You set out from a hub into a generated frontier of forests, deserts, snowfields, swamps and coast. Night brings
sieges that grow with each of the first few nights you survive, and the land turns more hostile the farther out you
go. You fight with melee strikes, four elemental spells (fire, ice, lightning and arcane) and the Aspects you unlock
with talents: Wildheart turns you into a beast, Voidhand grabs and hurls, Soulbind snares an enemy and binds it to
your side, and Elemancer imbues your next cast. At the frontier's far edge the Shadow Dragon waits at the Blight
Heart.

Progress saves in your browser. There is no account and nothing to download.

## How to play

Click into the game to capture the mouse, then move the mouse to look. Esc releases it and opens the menu.

<!-- BEGIN CONTROLS (generated from frontend/src/game/keyMap.js: node frontend/scripts/ci/controls-table.mjs --write) -->
| | Key | What it does |
|---|---|---|
| **Move** | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Move |
|  | <kbd>Space</kbd> | Jump |
|  | <kbd>Shift</kbd> | Dodge-roll (at a lunge: perfect) |
| **Combat** | <kbd>Left click</kbd> | Attack (hold: heavy) / mine |
|  | <kbd>Right click</kbd> | Cast / place / interact |
|  | <kbd>F</kbd> | Cast spell |
|  | <kbd>T</kbd> | Melee (hold: heavy) |
|  | <kbd>1</kbd> to <kbd>4</kbd> | Select spell |
|  | <kbd>Mouse wheel</kbd> | Cycle block |
| **Aspects** | <kbd>R</kbd> | WILDHEART — roar |
|  | <kbd>V</kbd> | VOIDHAND — grab &amp; hurl |
|  | <kbd>X</kbd> | SOULBIND — snare &amp; fuse |
|  | <kbd>Z</kbd> | ELEMANCER — imbue cast |
| **Panels** | <kbd>E</kbd> | Inventory |
|  | <kbd>M</kbd> | Magic |
|  | <kbd>C</kbd> | Crafting |
|  | <kbd>B</kbd> | Building |
|  | <kbd>U</kbd> | Talents &amp; Aspect guide |
|  | <kbd>G</kbd> | Open chest / trade |
|  | <kbd>L</kbd> | Quest log |
|  | <kbd>Q</kbd> | Claim completed quests |
|  | <kbd>H</kbd> | Toggle controls |
|  | <kbd>Tab</kbd> | Achievements |
|  | <kbd>Esc</kbd> | Settings / pause |
<!-- END CONTROLS -->

On a touchscreen, drag on the left half of the screen to move and on the right half to look. The buttons on the right
attack (hold for a heavy blow), cast, jump and dodge. One ring holds the four Aspects and another the four spells, and
the button on the left edge opens the inventory, crafting, building and magic panels.

## How it is built

React draws the interface, three.js through React Three Fiber draws the world, and Rapier moves the player and
resolves collisions. Terrain is generated and greedy-meshed with vertex ambient occlusion off the main thread, in
`frontend/src/world/terrain.worker.js`; mob pathfinding runs in a second worker, `frontend/src/workers/ai.worker.js`.
Mobs, loot and many effects are entities in a small miniplex ECS (`frontend/src/ecs/world.js`), and most of the game
rules are plain modules under `frontend/src/game/` that run, and are unit-tested, without a browser.

CI runs on every push to main and on every pull request: the linter, the unit suite, a production build and a
bundle-size budget, and, when code has changed, real-input Playwright tests and a boot check of the production bundle.

## Run it locally

You need npm and the Node version that `engines` in `frontend/package.json` declares.

```bash
git clone https://github.com/wowlegend/Crafty.git
cd Crafty/frontend
npm ci
npm run dev        # serves the game and opens it in your browser
npm run test:unit  # the unit suite
```

## Credits

- Fonts: Lilita One, Space Grotesk and Smiley Sans under the SIL Open Font License 1.1, and Alibaba PuHuiTi 3.0
  under Alibaba's free font licence.
- Icons from [game-icons.net](https://game-icons.net) by their authors, recoloured, under CC BY 3.0.
- Music generated with ElevenLabs.

[NOTICE](NOTICE) carries the copyright lines, and [LICENSES](LICENSES) the licence texts.

## Licence

Crafty's code and its own assets are copyright 2025-2026 wowlegend, all rights reserved. Nothing in this repository
grants a licence to copy, modify or redistribute them. The third-party fonts, icons and libraries keep their own
licences, listed in [NOTICE](NOTICE).
