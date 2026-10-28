# Brief: the quest spine (2026-10-28)

**Plan:** `2026-10-28-crafty-sota-reset.md`, row 46 ("the road of light: relight plus Pike's quest spine, the one piece
no plan carries"), lane W3-B. **Design source:** `masterpiece-2026-10/roadmap-2026-10-27.json`, move 14 ("Relight the
frontier"), its quest half. The relight plan (`2026-10-27-crafty-relight-frontier.md`, "Out of scope") left the spine
to a plan of its own; this is it. **Status:** unstarted. It needs W2-D (the Journal and automatic claim), W2-F (the
Forge, quest text from `displayName`, the free-placement quests gone) and W3-A (the first siege). **Owner:** the
command session.

## What the player gets

Today quests are counters handed out in list order (`QUEST_LIST` in `frontend/src/QuestSystem.jsx`, offered by
`pickNext`), and the Hearth's four NPCs each say one fixed line. Old Pike promises that every reclaimed shrine weakens the
Blight Heart (`frontend/src/game/questLore.js`), and nothing carries the player there. After this lane the people of the
Hearth tell the story: six beats, each given and handed in by pressing G on the person who asks, in a bold-flat dialogue
card, leading from the gate to the dragon.

## The six beats

| # | Giver | Beat | Needs |
|---|---|---|---|
| 1 | Old Pike the Warden | Cut down the first horror at the gate (becomes "survive the prologue" when W3-C ships it) | today's combat |
| 2 | Mara the Smith | Buy your first weapon upgrade at the Forge, paid in stone you mined | W2-F's Forge |
| 3 | Sister Wren | Hold the Hearth through the first siege, until dawn | W3-A's siege |
| 4 | Old Pike the Warden | Light the first shrine | the relight plan's shrine event |
| 5 | Bram the Trader | Break the camp: defeat its captain | W3-A's day groups (an elite) |
| 6 | Old Pike the Warden | Walk to the Blight Heart and face the dragon | W3-B's dragon |

Counter quests stay as optional bounties on Bram's board (the endless `makeRepeatableQuest` feed included), with mob
names from `MOB_TYPES[type].displayName` (W2-F). The roadmap's beat 2 ("forge a stone sword") assumed the crafting grid,
which the Cut removes (DECISIONS 2026-10-28 (W1-H) item 7), so beat 2 is the Forge's first purchase.

## Scope

- A pure `game/questSpine.js`: the ordered beats as data (giver, objective, lore key, reward); `currentBeat(state)`;
  `offerFrom(npc, state)` (only the giver offers the next beat); `handIn(npc, state)` (only the giver accepts it). One
  source for the order: nothing else may sequence the spine.
- G on an NPC opens a dialogue card (`ui/primitives/Modal.jsx`) with the giver's line and Accept or Hand in. The G
  handler in `InputManager.jsx` routes to it today by NPC type.
- The Journal (W2-D) shows the current beat first and the bounties below it; the one-line objective on screen is the
  current beat.
- Save: the spine index rides in `questState`; old saves start at the beat their claimed quests imply (first_blood
  claimed means beat 1 is done).
- All text through `t()`, both locales.

**Not in scope:** the shrine events and the dragon's weakening (relight plan); dungeons and their guardians (W3-B's
other half); voiced lines.

## Acceptance

- **Unit:** offering reads the order from `questSpine.js` alone; a test walks all six beats with a fixture state.
- **e2e on the CI sha:** complete beat 1, then press G on Mara: beat 2 is offered by her and by no one else; hand in
  beat 2 to Mara after a Forge purchase. Control: pressing G on Bram at beat 2 offers only bounties.
- **Live:** a fresh profile on https://crafty-game.vercel.app reaches beat 3's offer by hand, on Chromium and the WebKit
  iPad viewport (G is a touch action there; check the tray reaches it).

## One-way doors

The `questState` spine field enters saves at the first push. Write it additively and route it through the tombstone
pass-through (plan row 20) so a rollback keeps it.

## Registry rows this lane closes

`MASTERPIECE:relight-the-frontier/b` (the quest spine). `/a`, the shrine events, is the relight plan's.

---

## Task script

Run from `frontend/`. Re-verify file:lines at lane start; the Cut and the HUD lane will have moved them.

### Task 1: The spine as data (red first)

- [ ] `src/game/questSpine.js` with `BEATS` (six entries) and `currentBeat`, `offerFrom`, `handIn`. Tests: a fresh
      state offers beat 1 from Pike only; a completed beat 1 handed to Pike moves to beat 2; Mara offers beat 2, Bram does
      not; handing beat 2 to Wren is refused.
- [ ] Mutant: `offerFrom` ignores the giver. The Bram case goes RED. `Mutation-Proof:` trailer.

### Task 2: Objectives read the game's own events

- [ ] Map each objective to an existing event: a kill (`mobKillBus`), a Forge purchase (W2-F's `buy`), a dawn survived
      (`resolveDawn`), a shrine lit (relight plan), a captain kill (an elite flag from W3-A's groups), the dragon reached.
      Unit tests per mapping, each with a near-miss that must not count (a passive kill for beat 1, a failed purchase for
      beat 2).

### Task 3: Saves

- [ ] `questState.spine = { index, accepted }`; load derives it for old saves from claimed quest ids. Tests: a fresh
      save, an old save with first_blood claimed, a save from the middle of beat 3.
- [ ] e2e: accept beat 2, reload, beat 2 is still active.

### Task 4: The dialogue card

- [ ] On G near an NPC: the giver's line, Accept or Hand in, through `t()`. jsdom test: the card for Pike at a fresh
      state shows Accept; for Mara it shows her standing line and no Accept.
- [ ] Touch: the G action reaches the card from the tray (W2-D's touch tray).

### Task 5: The Journal and the bounties

- [ ] The Journal lists the current beat first; counter quests appear as bounties from Bram's board.
- [ ] Offering of counter quests stops following `QUEST_LIST` order as the story; the spine is the story and the
      bounties are optional.

### Task 6: Acceptance and land

- [ ] The e2e from Acceptance, with its Bram control, green on the CI sha.
- [ ] Live by hand to beat 3's offer on both engines; frames of the dialogue card in the PR.
- [ ] `memory/registry.jsonl`: close `MASTERPIECE:relight-the-frontier/b` with the merge commit.
