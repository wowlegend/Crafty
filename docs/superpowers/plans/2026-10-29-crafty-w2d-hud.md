# W2-D, the HUD: task script (2026-10-29)

**Brief:** `2026-10-28-crafty-brief-w2d-hud.md` (scope, acceptance, one-way doors, rows it closes, its Tasks 0-8).
**Plan:** `2026-10-28-crafty-sota-reset.md` rows 9 (the rest: the 250 ms mirror), 12 and 24, lane W2-D.
**Decision:** DECISIONS 2026-10-28 (W1-H) item 2(c). **Builds on:** main `63fe4035`, which has the whole Cut (W2-F
steps 1-7): no hunger bar, one Ember bar, the Forge on Mara's G-talk (the touch tray's Talk button replaced Craft; C is
gone), quest text from creature names. **Branches:** PR A `feat/w2d-hud` from `63fe4035`; PR B `feat/w2d-hud-panels`
from PR A's head, landing after it. DECISIONS items for this lane start at 90 (41-79 are taken; the W2-E follow-up
lane in flight holds 80-89). **Held by another lane, not edited here:** `render/viewmodel.js`, `render/handPose.js`,
`render/playerRender.jsx`, `render/BeastAvatar.jsx`, `render/beastAvatarParts.js`, `game/mobSenses.js`,
`systems/AIWorkerSystem.jsx`, and `Components.jsx`'s eye and follow-camera lines.

## The brief's citations, re-read on `63fe4035`

| Brief says | On `63fe4035` |
|---|---|
| rail `ui/GameHud.jsx:94-101` | `ui/GameHud.jsx:87-98` (the `!isTouchUIMode() &&` block) |
| level card `SimpleExperienceSystem.jsx:165` | unchanged: `SimpleExperienceBar` at `:163`, the `bottom-32` card at `:165`; the touch readout `SimpleExperienceBarTouch` at `:199` |
| quest tracker `QuestSystem.jsx:492` | `QuestSystem.jsx:504` |
| compass: the block writing `container.innerHTML` | `HUD.jsx:254-508` (`Compass`), the write at `:476`; it reads the mirror at `:446` |
| dusk string `ui/DuskWarning.jsx:31` | unchanged |
| panel keys `game/keyMap.js:33-42`, "E, M, C, B, U, L, Q, H and Tab" | `game/keyMap.js:32-43`: E, M, B, U, G (talk: Mara's Forge), L, Q, H, Tab, F3, ESC; C went with the grid (W2-F step 5) |
| the 8-second auto-fade `HUD.jsx:191` | `HUD.jsx:159-170` (`ControlsSheet`), the timer at `:165` |
| navy ladder in `theme/tokens.js` | `theme/tokens.js:49-58`: panel, panelRaise, panelFrame, panelInset, and the same navy in well, slot, control, track |
| touch tray `ui/touchTray.js` | rows inventory, talk, build, magic (`:11-17`); Talents through `openTalents` (`:26`) |
| mirror (plan row 9) | `systems/MinimapSyncSystem.jsx:9-33` writes `mobEntities`, `npcEntities`, `_lastMinimapUpdate`, `activeHostilesCount`; readers `ui/RadialMinimap.jsx:40-42`, `HUD.jsx:446`, `ui/DebugOverlay.jsx:51`, `scripts/visual/lookbook.mjs:646`; nametags and the G-talk already read the ECS (`render/Nametags.jsx:85`, `input/talk.js:13`) |

The brief is corrected in place in the commit that adds this script.

## The seam between the two PRs

**PR A** changes what the screen shows at rest and where the HUD reads its data: the instrument, the mirror, the rail,
the XP edge, the one objective line, the compass and the notification channel. **PR B** changes what the keys open and
what a profile saves: the warm-charcoal re-key, Character / Journal / Build with the touch tray, the H controls panel,
automatic claim and the feats. B's re-key needs A's instrument and A's at-rest layout, so its before/after isolates the
colour; A changes no save field and no key.

## Decisions (routine calls, stated; DECISIONS items 90 on record the non-routine ones)

1. **The chrome count is the chrome's footprint, read on a held page.** `chromeFootprint` (pure,
   `scripts/visual/_lookbook.mjs`) counts the pixels where the frame and a twin with the HUD's own elements hidden (the
   canvas and the touch layer shown) differ by more than 2 in any channel; the page's animation frames are held across
   the shots (`holdFrames`), and the reading stands only if the first and last shot of the held page agree. The touch
   layer is its own class (twin against a canvas-only twin), and the colour count (pixels within 3 of the page's own
   `--ui-*` surface colours) is a second column, because it reads the palette in both directions. A frame with a toast
   in the stack is not at rest (`atRest`). **Blind spot, stated:** an opaque surface over a world pixel of its own
   colour, within 2, reads as unchanged.
2. **The mirror goes; one store scalar stays.** `MinimapSyncSystem` and the store's `mobEntities`, `setMobEntities`,
   `npcEntities`, `setNpcEntities` and `_lastMinimapUpdate` are deleted. The minimap's 250 ms redraw and the compass's
   HUD tick read `mobsQuery` and `alliesQuery`; DebugOverlay counts the query. `activeHostilesCount` (the music
   subscribes to it) stays, written on change by SpawnerSystem's 1 s pass from the query. The lookbook hold reads the
   seam's `mobs()` (which gains `id`) and falls back to the mirror only for builds older than this one.
3. **At rest.** The desktop rail goes (its panels keep their keys; touch keeps its tray). The level card and the touch
   level readout become one 4 px XP edge on the hotbar's top edge with the level number at its left
   (`data-testid` `hotbar-xp`, `hotbar-level`). The quest tracker rests as one line on every device: the first unclaimed
   quest's title, its objective and progress. On touch a tap on the line expands the list (the tracker is
   `data-hud-interactive`, so the touch layer leaves it its taps); on desktop the HUD shows only under pointer lock, where
   no click or hover reaches it, so the list is the quest log's (L; the Journal on J after PR B). A completed quest's
   claim button stays in the line until PR B makes claims automatic. On touch the vitals sit at the top left (the
   joystick and the action buttons hold both bottom corners) and the coin count under the minimap (Pause holds its
   desktop place).
4. **The compass is a component.** `ui/compassLayout.js` (pure) takes markers by bearing, the heading, the field of view
   and the strip width, maps each to x, clamps a label inside the strip and places labels in priority order (boss, home,
   shrine, Blight Heart, NPC, chest, then the eight cardinals); a later label whose box would overlap a placed one within
   a 4 px gap yields (hidden; its pip stays). `Compass` renders a fixed pool of slots once and the HUD ticker writes each
   slot's transform, text and visibility only on change; a label's width is measured when its text changes. Labels go
   through `t()` (`compass.*`, both locales; an NPC shows its own name); icons through the `Icon` primitive.
5. **One notification channel.** `addNotification(message, type, { key, vars })`: a message that is a string key renders
   through `t()` at render time, so a toast reads in the current locale; a second notification with the same key (or the
   same text) inside 4 s, one toast's life, is dropped (`ui/notifications.js`, pure). The dusk warning becomes
   `notice.dusk`, once per dusk. The toast stack moves below the day-phase dial it covered (G-ledger 38/a). The siege
   and dawn notices, the dragon's calls and the Aspect hint go through it too (their own banners are deleted), with
   names inside a notice as keys. The i18n ratchet reports 0 hardcoded strings (it reads JSX, not call arguments); the
   remaining English notification literals (weather, loot, talk, quest, store) stay a registry row.
6. **Warm charcoal (PR B)** re-keys the whole navy ladder (the four surfaces the brief names, and well, slot, control,
   track, which carry the same navy) and `RARITY_FILL.common`; text tokens move only where the contrast gate says.
7. **Three panels (PR B).** Character (Tab): the Inventory (gear and equipment), Spells and Talents as tabs. Journal (J):
   the quest log and the feats as tabs. Build (B) unchanged. E, M, U, L, Q and the Tab achievements panel leave
   `KEY_MAP` and the handlers. H opens a controls panel generated from `KEY_MAP`, shown on a profile's first play, with a
   "H Controls" hint at the hotbar edge until it has been opened once (`controlsSeen`, per profile). Quests claim on
   completion through `reduceClaim` (still the only payer).
8. **Feats (PR B).** Eight skill feats as data with a pure unlock check (dodge, heavy, perfect dodge, each of the four
   Aspects, a siege held); the twelve counter achievements and "Survivor" go; saved unlocked ids ride the tombstone.

## PR A: tasks (each ends with lint, the touched tests and a commit)

### A0. The instrument first
- [ ] Red: `tests/scripts/lookbook-chrome.test.js`: a synthetic 100x100 frame with a 10% rectangle in one chrome colour
      reads 0.10; a frame with 5% in each of two colours reads 0.10; a sky region matching a chrome colour in both the
      frame and its twin reads 0; the colour read from `--ui-*` strings parses. RED (no `chromeShare`).
- [ ] Build `chromeShare`, `chromeColoursFrom`; the lookbook's eye shots shoot the twin and record `chrome`
      (share, per colour) in lookbook.json and the contact sheet. GREEN.
- [ ] Mutant: count only the first colour; the two-colour case goes RED. Mutant: ignore the twin; the sky case RED.
- [ ] Add a `hud` set: (a) the compass cluster: the player stood 30 m out on the bearing that puts HOME and a Hearth
      NPC within a few degrees, label rects read and overlaps counted; (b) dusk, in en then zh-CN: the clock set just
      before the dusk window, the toasts logged by a MutationObserver, a frame shot with the toast up, its rect against
      the dial's.

### A1. The mirror (plan row 9's rest; closes `REVIEW:w2h:lookbook-mob-mirror`)
- [ ] Red: `radial-minimap-gates` asserts the minimap reads `mobsQuery.entities` and `alliesQuery.entities`;
      `npc-spawn-gates` asserts no module reads `npcEntities` and the hub NPCs are found by the query the compass reads;
      `tests/store/minimapEntityMirrors.test.js` is replaced by `tests/store/noMobMirror.test.js` (the store holds no
      mirror field; SpawnerSystem's pass writes `activeHostilesCount` from a staged query). RED.
- [ ] Delete `systems/MinimapSyncSystem.jsx` and its mount; move every reader. `rg mobEntities|npcEntities` in `src`,
      `scripts`, `tests/e2e` reads empty. GREEN. Mutation: restore the mirror read in RadialMinimap: RED.

### A2. At rest (closes `OPEN_ITEMS:OI-55` on its e2e)
- [ ] Red (jsdom, `tests/gates/hud-at-rest.test.jsx`): GameUI in desktop mode renders no rail buttons (`hud-rail`
      absent, no Inventory/Magic/Building buttons); the hotbar renders `hotbar-xp` whose width is 0, 50 and 100% of its
      track for xpProgress 0, 50, 100 and `hotbar-level` reads the level; touch mode still renders the tray; the tracker
      with three active quests shows one objective line and the other two only after expand. RED.
- [ ] Build. Delete `SimpleExperienceBar`, `SimpleExperienceBarTouch` and the rail. GREEN. Mutants: XP width fixed at
      100%; the tracker expanded by default: RED.
- [ ] e2e `tests/e2e/hud-at-rest.spec.js`: at 1280x800, 1180x820 and 820x1180 health, mana, ember, hotbar, tracker line,
      compass and minimap rects do not intersect; after a real `grantXP` the XP edge widens; at 390x844 touch no two
      visible touch targets overlap and each lies inside the viewport. `hud-layout.spec.js` reads the tracker line.

### A3. The compass (closes `STATUS:G-ledger:38/b`, `MASTERPIECE:seen:the-compass-labels-overprint-each/a`)
- [ ] Red: `src/ui/compassLayout.test.js`: two markers 1 degree apart (the second yields), a cluster of five (no two
      visible labels overlap; the highest priority shows), a marker at the wrap point (bearing 179 at heading -179
      sits at the centre), a label at the strip edge is clamped inside it. RED.
- [ ] Build it; mutant: drop the overlap pass, the two-marker case RED.
- [ ] Replace the `innerHTML` block with the pooled component; `compass.*` keys in both locales.
- [ ] e2e `tests/e2e/compass-labels.spec.js`: stand the player so HOME and Mara are within 3 degrees; read every visible
      label rect; assert none overlap and both markers' pips are present. Identity green; the old layout (no yield) RED.
      `hud-churn` and `hud-ticker` observe the pool (attribute and text writes, old value compared) instead of the
      markup.

### A4. One notification channel (closes `STATUS:G-ledger:38/a`)
- [ ] Red: `src/ui/notifications.test.js`: two same-key pushes inside 4 s give one entry, outside give two; a key
      renders the zh-CN string under zh-CN; a plain text renders as itself. RED. Mutant: no dedupe: RED.
- [ ] Wire `addNotification` through it; `NotificationStack` and `CombatLog` render through `t()`; DuskWarning sends
      `notice.dusk`; the stack sits below the dial.
- [ ] e2e `tests/e2e/dusk-warning.spec.js`: set the clock before dusk, let it run through the window; the toast log
      counts 1 dusk toast; its rect does not intersect `day-phase-dial`; switch to zh-CN, run the next dusk, read the
      Chinese text. Mutant: dedupe off and the warning fired twice: RED.

### A5. Land PR A
- [ ] VERIFY: lint, test:unit (background), doc-currency, gate-shape, build, bundle-budget, knip. Fetch; merge
      `origin/main` if it moved. Push; open the PR; wait for CI on its exact head; read each shard's first attempt.
- [ ] After 21:00Z: lookbook (eye + hud sets) on the main build and on PR A's build, one GPU run at a time under the
      lock; the chrome table before and after; frames as JPG under `docs/superpowers/masterpiece-2026-10/evidence/w2d/`.
- [ ] DECISIONS 90-94; registry: close the rows above, add rows for what is left.

## PR B: tasks

### B1. Warm charcoal
- [ ] Re-key the ladder; `node -e` regenerate nothing (cssVars derives at boot); run `text-contrast-gates` and
      `tests/theme/`; fix any text token below its ratio. Lookbook pair (golden hour, midnight; both engines), opened
      side by side; the chrome share after the re-key read by the same instrument.

### B2. Three panels, the tray, H
- [ ] The panel map in the PR description. Red: `keyMap.test.js` with Tab, J and B as the panel keys (and H, G, F3,
      ESC) fails until the handlers match; `touchTray.test.js` wants Character, Journal, Build (and Talk). RED.
- [ ] Build Character and Journal as tabbed shells over the existing components; delete the E, M, U, L, Q handlers and
      rows and the Tab achievements panel; `panelState` flags follow.
- [ ] H controls panel generated from `KEY_MAP` (jsdom: lists every entry; mutant: drop a group, RED); first play shows
      it, the hint stays until it is opened once (jsdom over a fresh and a seen profile; mutants: hint never cleared, no
      first-run show, RED). Closes `STATUS:C1/c`, `QUEUE:Q26/c`, `OPEN_ITEMS:OI-31/c` only on this.
- [ ] Automatic claim: two quests completing in one tick each pay once (`reduceClaim`), jsdom.
- [ ] e2e: Tab opens Character, J Journal, B Build, H controls, by real keys; the touch tray's three by real taps.

### B3. Feats
- [ ] `game/feats.js`: eight feats, a pure unlock check over the stats, unit-tested per feat against a fixture.
- [ ] Delete the counter achievements and Survivor; old ids through the tombstone; Journal shows feats.
- [ ] e2e: one real dodge (Shift) unlocks its feat in the Journal.

### B4. Land PR B
- [ ] VERIFY as A5; lookbook pair; DECISIONS; registry.

## Gates this lane runs
`npm run lint` · `npm run test:unit` (background, deadline) · `node scripts/ci/doc-currency.mjs` ·
`node scripts/ci/gate-shape.mjs` · `npm run build` · `node scripts/ci/bundle-budget.mjs` · `npm run knip` ·
CI's e2e shards on each PR's exact head (no local e2e). Every gate added or changed carries a `Mutation-Proof:` trailer.

## Not proven by this script
Real-device feel on an iPad or phone (Kevin's); the e2e mutants run in a browser (CI runs the specs; the mutants are
argued in jsdom where the spec's subject is reachable there).
