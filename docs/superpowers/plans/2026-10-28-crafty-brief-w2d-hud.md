# Brief: W2-D, the HUD lane (2026-10-28)

**Plan:** `2026-10-28-crafty-sota-reset.md`, rows 12 and 24 and lane W2-D (Wave 2). **Decision:** DECISIONS 2026-10-28
(W1-H) item 2(c): one HUD lane with one owner. **Status:** unstarted. Starts after #24 (landed), combat stance (#6, which
owns `ui/WindupChevrons` and edits `HUD.jsx`), the light and colour lane (#5) and plan row 9's mirror deletion, since all
of them edit the HUD's files. **Owner:** the command session; one builder holds every file below for the whole lane.

## What the player gets

The world gets about a fifth of the screen back. At rest the play screen shows the hotbar with a 4 px XP edge, one
objective line, a readable compass and nothing else. Three panels replace seven: **Character** (Tab: inventory,
equipment, talents), **Journal** (J: quests, claimed automatically, and 8 skill feats) and **Build**. Warnings arrive once,
deduplicated, in the player's language, and the chrome is warm charcoal instead of navy.

## What it folds in

Roadmap move 6's HUD half (`masterpiece-2026-10/roadmap-2026-10-27.json`, "The first minute": level and XP folded into the
hotbar, the tracker collapsed to one objective, the rail hidden), the visuals lens's chrome measurement, the public lens's
HUD notes, the game lens's panel sprawl and architecture finding A18 (the `innerHTML` compass). The first-minute plan
(`2026-10-27-crafty-first-minute.md`) keeps the title and the prologue; its HUD tasks move here.

## Scope

- **At rest:** delete the desktop tool rail (`ui/GameHud.jsx:94-101`; touch keeps its tray). Fold the level card
  (`SimpleExperienceSystem.jsx:165`, a card at `bottom-32`) into a 4 px XP bar on the hotbar's top edge with the level
  number beside it. Collapse the quest tracker (`QuestSystem.jsx:492`) to one objective line that expands on hover or J.
- **Compass:** rewrite the `innerHTML` compass (`HUD.jsx`, the block that writes `container.innerHTML`) as a React
  component on the HUD ticker: markers from data, labels de-overlapped (a later marker yields when two labels would
  overlap within their pixel width), every label through `t()`, icons from `ui/primitives/gameIcons.js`.
- **Notifications:** one channel. `addNotification` dedupes by key within a window and renders through `t()`; the dusk
  warning (`ui/DuskWarning.jsx:31`, a hardcoded English string) becomes a key, shown once per dusk.
- **Re-key the chrome:** the navy surface ladder in `theme/tokens.js` (`panel`, `panelRaise`, `panelFrame`, `panelInset`)
  moves to warm charcoal; the token chain (`tokens.js` -> `cssVars.js` -> `tailwind.config.cjs`) carries it everywhere.
- **Panels:** E, M, C, B, U, L, Q, H and Tab (`game/keyMap.js:33-42`) become Tab (Character), J (Journal) and B (Build).
  C goes with the Forge (W2-F). H opens a controls panel generated from `KEY_MAP`. Q's manual claim goes: quests claim
  automatically on completion. The touch tray (`ui/touchTray.js`) offers the same three.
- **Feats (row 24):** the 12 counter achievements become 8 skill feats shown in the Journal; "Survivor" (die 3 times)
  is deleted.

**Not in scope:** quest text and the quest spine (W2-F's `displayName` change, then the quest-spine brief); the title
screen (W3-C); the hands (W2-E).

## Acceptance on the live game

- Chrome is 8% of pixels or less at rest on the live eye-level lookbook frames (count of pixels in the chrome token
  colours, as the visuals lens measured), on Chromium and on WebKit at 1180x820 and 820x1180.
- A frame posed with HOME and an NPC marker close together shows no overlapping compass labels.
- At dusk the warning appears exactly once, and in Chinese with zh-CN selected.
- Every panel key in `KEY_MAP` opens a panel that exists; no panel is reachable only by a key the controls panel omits
  (the existing two-way `KEY_MAP` gate keeps holding).

## One-way doors

Save fields for the deleted panels' UI state, if any persist, stop being written: check `game/saveSchema.js` first and
route them through the tombstone pass-through (plan row 20). Key rebinding (`STATUS:C1/d`) is not built here; the new
layout must not make it harder (keys stay in `KEY_MAP`).

## Registry rows this lane closes

Each closes on the task named; a row whose task did not land stays open.

- `STATUS:C1/c`, `QUEUE:Q26/c`, `OPEN_ITEMS:OI-31/c`: the persistent control legend (Task 6, the H controls panel in
  place of the 8-second auto-fade). C1's reticle (`/a`), hold-Alt build (`/b`) and rebinding (`/d`) are not this lane's.
- `STATUS:G-ledger:38/a`: the dusk toast covering the day-night widget (Task 4).
- `STATUS:G-ledger:38/b` and `MASTERPIECE:seen:the-compass-labels-overprint-each/a`: compass labels overprinting
  (Task 3). The golden-hour bloom glare (`/c`) is the light and colour lane's.
- `OPEN_ITEMS:OI-55`: the touch HUD at 390x844 (Task 1's layout check). `OPEN_ITEMS:OI-54` (a lived look at the touch
  rings) is not done here.

---

## Task script

Run from `frontend/`. Re-verify each file:line at lane start. Each task ends with `npm run lint`, the touched tests, a
commit, and a lookbook pair (before, after) attached to the PR for any visible change.

### Task 0: The measuring instrument first

- [ ] Add a chrome-pixel count to the lookbook report: for each eye-level frame, the share of pixels within a small
      distance of the chrome token colours. Write it as a pure function over an RGBA buffer with a unit test on a
      synthetic frame (a known 10% chrome rectangle reads 10%).
- [ ] Mutant: count only one token colour. The synthetic two-colour test must go RED. `Mutation-Proof:` trailer.
- [ ] Run the lookbook on main, record today's chrome share per frame in the PR. This is the "before".

### Task 1: The rail goes, the level card folds into the hotbar

- [ ] Red first: a jsdom test renders `GameHud` in desktop mode and asserts no element with the rail's role; a second
      renders the hotbar and asserts an XP bar whose width tracks `xpProgress` (0, 50, 100). Both RED today.
- [ ] Delete the rail block; add the XP edge and level number to the hotbar; delete `SimpleExperienceBar`'s card.
- [ ] Touch keeps its tray: a jsdom test in touch mode still finds the tray. GREEN.
- [ ] e2e: the existing HUD layout spec updated so health, mana and hotbar stay clear of each other at 1280x800 and at both
      iPad sizes.
- [ ] e2e at 390x844 (`OPEN_ITEMS:OI-55`): no two visible touch targets overlap, and each lies inside the viewport.
      Mutant: shift the bars down by their own height. RED.

### Task 2: One objective line

- [ ] Red first: render the tracker with three active quests; assert one visible objective line, the others reachable on
      expand.
- [ ] Implement; keep the capture guard behaviour the tracker has today (it rests hidden in capture mode).

### Task 3: The compass component

- [ ] Pure module `ui/compassLayout.js`: given markers (bearing, label width) and the strip width, return positions with
      no two labels overlapping. Unit tests: two markers 1 degree apart, a cluster of five, a marker at the wrap point.
- [ ] Mutant: drop the overlap pass. The two-marker test goes RED.
- [ ] Replace the `innerHTML` block with a component that writes only on change through the HUD ticker (no React state
      per frame: game-loop isolation). Labels through `t()`; add the keys to both locales.
- [ ] e2e: pose HOME and an NPC marker within a few degrees; read the label rects; assert no overlap. Mutant: the old
      layout makes it RED.

### Task 4: One notification channel

- [ ] Red first: `addNotification` called twice with the same key inside the window shows one toast; a key renders
      the zh-CN string when the locale is zh-CN.
- [ ] Convert the dusk warning to a key; dedupe by key; delete hardcoded English notification strings the i18n ratchet
      reports.
- [ ] e2e: advance the clock through dusk; count dusk toasts (1); assert the toast's rect does not intersect the
      day-night widget's (`STATUS:G-ledger:38/a`); switch to zh-CN and repeat.

### Task 5: Warm charcoal

- [ ] Change the four surface tokens in `theme/tokens.js`; regenerate whatever reads them; run the contrast gate
      (`tests/gates/text-contrast-gates.test.js`) and `tests/theme/`. Fix any text token that falls below its ratio.
- [ ] Lookbook pair at golden hour and midnight on both engines; open them side by side before committing.

### Task 6: Three panels

- [ ] Write the panel map first: which current panel content goes to Character, Journal or Build, and what is deleted.
      Put it in the PR description.
- [ ] Red first: `KEY_MAP` lists Tab, J and B as the panel keys; the two-way keyMap gate fails until the handlers match.
- [ ] Build Character (inventory, equipment, talents), Journal (quests with automatic claim, feats) and Build (building
      tools and the block palette) from the existing panel components; delete the E, M, Q, L and U panel entries (C
      goes with the Forge in W2-F; B stays as Build; Tab becomes Character).
- [ ] H keeps its key and opens a controls panel generated from `KEY_MAP`, in place of today's toggle and its
      8-second auto-fade (`HUD.jsx:191`). jsdom test: H opens it and it lists every `KEY_MAP` entry; mutant: drop one
      group from the generator. RED.
- [ ] Touch tray: Character, Journal, Build. jsdom test for the tray's three entries.
- [ ] Automatic claim: completing a quest pays once (the `reduceClaim` seam stays the only payer). A test drives two
      quests completing in one tick and asserts both pay exactly once.

### Task 7: Feats

- [ ] Define 8 skill feats (one per verb family: dodge, heavy, perfect dodge, each Aspect, a siege held) as data with
      a pure unlock check; unit-test each against a stats fixture.
- [ ] Delete the counter achievements and "Survivor"; route old unlocked ids through the tombstone pass-through.
- [ ] Journal shows feats; e2e: perform one dodge, see its feat unlock.

### Task 8: Acceptance run and land

- [ ] Lookbook against the deployed sha: chrome share 8% or less per eye-level frame on Chromium and both WebKit iPad
      viewports; attach the table and frames to the PR.
- [ ] Merge into `land/<date>`, `ci ok` green on that sha, fast-forward main. Close the registry rows above with the
      merge commit.
