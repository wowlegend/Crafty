# W2-F step 3: Ember (task script, 2026-10-28)

**Brief:** `2026-10-28-crafty-brief-w2f-the-cut.md`, "The order" item 3 and Task 3. **Decision:** DECISIONS 2026-10-28
(W1-H) item 5. **Builds on:** steps 1 and 2 on main (`d4acbe2d` tombstone pass-through and the pre-cut fixture;
`00c0a8d4` one costed mode). **Branch:** `feat/w2f-ember`, cut from main `3bd6fbde`. **Closes:** `OPEN_ITEMS:OI-60` and
`STATUS:E-ter:item-sets-set-bonuses-affixes/b` (the no-ember denied reason).

## What the player gets

One ember-gold bar in the stat stack where four meters were. Killing a hostile by day fills it, as each of the four
meters filled before; placing blocks by day adds to it, up to a daily limit. Every Aspect verb spends it at its old
price: the roar 100 (a full bar), a grab 25, a bind 35, a fuse 50, an imbue 30. Dawn empties it, as it emptied the four.
Pressing an unlocked verb the bar cannot pay for says "Not enough ember" (zh-CN 余烬不足), on the keyboard and on the
touch ring. An old save keeps what it had banked: its four banks are added into the one bar.

## Decisions this script makes (routine calls, stated)

1. **Costs move into `game/ember.js`, and `game/ferocity.js`, `kinetic.js`, `soul.js` and `resonance.js` are deleted.**
   With one bank, each module would keep only a cost and a `canX` wrapper; one module that owns the bar, its sources
   and its prices is the honest shape. `game/mobBank.js` stays: `emberForKill` reads it.
2. **Accrual sources:** a day kill by the player's own hand pays `bankForKill(type)` (unchanged: 16 hostile, 8 passive,
   0 Settler, 60 boss). A day placement action pays `PLACE_GAIN` 2 once per action, as Resonance did. **Mining stops
   paying.** The brief and item 5 name building (`resonance.js:11`, PLACE_GAIN), and with placement costed a mine is the
   other half of the free place-and-break loop: its reward is the block it returns.
3. **The per-day cap: 40 ember from building per day; kills are not capped.** The cap exists to stop the
   place-and-break loop (item 5), which costs nothing but clicks. 40 is at least the dearest cheap verb (a bind, 35), so
   a day spent building pays for any one grab, bind or imbue; it is below a fuse (50) and the roar (100), so the free
   loop never pays for those, and the big spends still need kills. Kills are not capped because each costs a fight
   with a live mob, and the four meters never capped them. The cap counts ember that ENTERED the bar (a placement at a
   full bar spends none of the day's allowance). The day is keyed by `nightCount` (during day k it reads k), so the
   allowance renews with no dawn handler, and it is persisted (`progression.emberBuildDay`) so a reload cannot renew it.
4. **Migration:** a save whose `progression` has no `ember` key gets the sum of its four banks, each clamped to
   [0, 100] first (a NaN or negative bank adds 0), then clamped to [0, 100]. A save that has `ember` is read as is, so
   the migration cannot run twice: the tombstone writes the four retired banks back on every save, unchanged, and the
   first save after the load writes `ember`. The pre-cut fixture (30 + 20 + 15 + 10) loads with 75.
5. **The bar:** `EmberBar` (`ui/EmberBar.jsx`, a `StatBar kind="ember"`, `data-testid="ember-bar"`, label `t('hud.ember')`,
   value/100) shows whenever ember is above 0, like the Ferocity bar before it; a fresh player sees it fill before
   any verb is unlocked, which points them at Talents. New colour token `ember` `#FF9A2E` (between `spell.fire` and
   `warn`); the `ferocity`, `kinetic` and `soul` tokens go with their bars; `resonance` stays (the imbue reticle).
6. **A spend re-checks the bank where it lands.** Four separate banks made an arm-time or channel-start check enough;
   one shared bank does not: a grab during a bind's 1.1 s channel, or between arming an imbue and casting, would leave
   the bind or the imbue short, and the old `accrue(-cost)` clamp would sell it for what was left. `spendEmber(cost)`
   refuses and changes nothing when the bar cannot pay; the bind, the fuse and the imbue consume complete only when
   it pays, and say "Not enough ember" when it does not.
7. **The press notice:** `input/aspectDeny.js` `denyAspectPress(verb, state)` decides it once for the keyboard and the
   touch ring: locked talent -> the existing aspect-locked notice; else a press that would be a spend and cannot be paid
   (`emberShort(verb, state)`: roar in human form < 100, grab with nothing held < 25, X < 35 (snare is X's cheaper
   spend), imbue unarmed < 30) -> `notifyDenied('no-ember')`. A press that releases (a beast form's exit, a held
   block's drop, an armed imbue's disarm) is not a spend and says nothing.
8. **Copy that named the four meters** is rewritten from the constants (`aspectGuide.js`, two talent descriptions,
   `talent.intro` in both locales), so the prices it states cannot drift from the code.

## The code as it is (re-verified at lane start, main `3bd6fbde`)

| What | Where |
|---|---|
| The four banks, setters, accruers | `store/useGameStore.jsx:551-566` (kinetic, soul, resonance), `:822-828` (ferocity); imports `:16-17`, `:23-24` |
| Load (clamp per bank) | `store/useGameStore.jsx:1124-1127`, returned `:1173-1176` |
| Save schema fields | `game/saveSchema.js:157-160` (`progression`); tombstone `splitTombstone` `:106-120`, `buildSaveData` `:122-177` |
| Kill accrual bridges | `world/accrualHooks.js:15-38` (three hooks, one filter each); mounted `App.jsx:16`, `:160-162` |
| Build accrual | `world/placeAtHit.js:6`, `:59` (`PLACE_GAIN`, once per action); mining `world/Terrain.jsx:2`, `:1008` |
| Dawn bleed | `world/survivalSystem.js:32-40` |
| Autosave triggers | `App.jsx:263-266` |
| Spend: roar | `Components.jsx:695` gate, `:710-713` spend |
| Spend: grab | `Components.jsx:763` gate, `:767` spend |
| Spend: snare, fuse | `Components.jsx:833` / `:838`; `:872` / `:884` |
| Spend: imbue | `Components.jsx:377` / `:383` (consume at cast), `:917` (arm) |
| Press notices | `Components.jsx:424-448` (aspect-locked only); touch ring `ui/TouchControls.jsx:355-372` (none) |
| Denied copy | `game/deniedReason.js:5-19` (English strings, no `t()`) |
| HUD bars | `HUD.jsx:37-40` imports, `:155-210` four bars, `:607-610` in the stat stack; `ui/primitives/StatBar.jsx:10-11` kinds |
| Tokens | `theme/tokens.js:72-75`, `theme/cssVars.js:39-42`, `:102-105`, `tailwind.config.cjs:43-46` |
| Copy | `game/aspectGuide.js:9-50`, `game/talentTree.js:24`, `:34`, `i18n/strings.js:149`, `:307` |

Tests that name a deleted bank, bar or module: `tests/store/{ferocity,soulbindStore,elemancerStore}.test.js` (all bank;
deleted), `tests/store/voidhandStore.test.js` (its kinetic block), `src/game/{ferocity,kinetic,soul,resonance}.test.js`
(deleted with their modules), `tests/gates/mob-bank-coverage.test.js`, `kill-attribution-gates.test.js` (subscriber
count 3), `friend-foe-gates.test.jsx` (three hooks), `voidhand-noremesh-gates.test.js` / `elemancer-noremesh-gates.test.js`
(GATED lists), `new-world-reset-gates.test.js`, `save-slot-ownership-gates.test.js`, `tests/store/preCutSave.test.js`
(the whole-slice round trip gains `ember` and `emberBuildDay`), `tests/game/deniedReason.test.js`,
`src/game/aspectGuide.test.js`, and the e2e setups `heavy-melee`, `touch-hold`, `imbue-latch` (`*Banked: 100`).

## Steps (red first)

**S1. `game/ember.js` and its tests.** Write `tests/game/ember.test.js` first against an absent module (RED: import
fails). Then the module: `EMBER_MAX` 100; `ROAR_COST` 100, `GRAB_COST` 25, `SNARE_COST` 35, `FUSE_COST` 50,
`IMBUE_COST` 30; `PLACE_GAIN` 2; `DAILY_BUILD_CAP` 40; `clampEmber`, `canAfford(ember, cost)`, `emberForKill(type, isDay)`,
`emberForPlace(isDay)`, `dailyCap(record, night)` (the day's remaining build allowance), `accrueBuild(ember, record, night,
isDay)` -> `{ ember, record }`, `readBuildDay(raw)`, `migrateBanks(progression)`, `emberFromSave(progression, fallback)`,
`emberShort(verb, state)`. Cases: the clamp (NaN, negative, float, overflow); the prices pinned; day and night kills
for every MOB_TYPES type; the cap (20 placements fill 40, the 21st adds 0; a new night key renews it; a full bar
spends no allowance; night adds 0); the fixture's banks sum to 75; NaN and negative banks add 0; above 100 clamps; a
save with `ember` ignores its banks; each `emberShort` branch including the releasing states.
Mutants (each RED): M1 `migrateBanks` reads only `ferocityBanked`; M2 the cap compares `>` for `>=`; M3 the record
ignores the night key (no renewal); M4 `emberForKill` ignores `isDay`; M5 the cap counts the offered gain, not the
entered one; M6 `emberFromSave` migrates when `ember` is present. Identity: a comment edit SURVIVES.

**S2. The store.** `ember`, `setEmber`, `gainEmber(n)`, `spendEmber(cost)` -> boolean, `emberBuildDay`,
`accrueBuildEmber()`; delete the four banks, setters, accruers and their imports. Load: `emberFromSave` and
`readBuildDay`; save: `progression.ember`, `progression.emberBuildDay` (the four keys stop being written and ride the
tombstone). `tests/store/ember.test.js` first (RED: no action): one test per spend (roar, grab, snare, fuse, imbue:
refused one short and unchanged; paid exactly at a surplus), the build accrual through the store with the cap, the
persistence, the new-world reset. Mutants: M7 `spendEmber` debits without the check; M8 `spendEmber` returns true on a
refusal; M9 the save omits `emberBuildDay`; M10 the load reads `prog.ember` with `??` over the banks only.

**S3. Accrual and the bleed.** One `useEmberAccrual` (the same `source === 'player' && s.isDay && !isCaptureMode()`
filter; `gainEmber(emberForKill(type, s.isDay))`); `placeAtHit` calls `accrueBuildEmber()`; Terrain's mine accrual goes;
dawn calls `setEmber(0)`; `App.jsx` mounts one hook and triggers on `ember` and `emberBuildDay`. Rewrite
`friend-foe-gates` (a Settler kill leaves ember at 0, a Husk kill raises it), `kill-attribution-gates` (one or more
subscribers, every one filtered), `mob-bank-coverage` (`emberForKill(t, true)` is the mob's bank),
`place-executor-gates` gains: a day placement adds `PLACE_GAIN` once per action, a night one adds nothing.
Mutants: M11 the hook drops `s.isDay`; M12 `placeAtHit` drops the accrual call; M13 the placement accrues per cell.

**S4. The spends (`Components.jsx`).** Gates read `canAfford(st.ember, COST)`; spends call `spendEmber(COST)`; the
bind, the fuse and the imbue consume complete only when it returns true, else `notifyDenied('no-ember')`. Proven in
the running game for the roar (the new e2e, heavy-melee, touch-hold), the imbue (imbue-latch) and the grab (the new
e2e); the snare and fuse sites are unit-proven at the store seam only.

**S5. The notice.** `deniedReason('no-ember')` -> `t('deny.noEmber')` (en "Not enough ember", zh-CN "余烬不足").
`input/aspectDeny.js` replaces the four inline aspect-locked calls in the keydown handler and is called by the touch
ring's unlocked sectors. `tests/gates/ember-denied-gates.test.jsx` first (RED): `denyAspectPress` for each verb at one
short says it, in both locales; locked says aspect-locked; releasing states say nothing; a real `pointerUp` on the touch
grab sector with ember 0 shows the notice; one with ember 30 shows none (presence first). Mutants: M14 drop the
`notifyDenied('no-ember')` call; M15 drop the touch ring's call; M16 `deniedReason` returns the key untranslated in
zh-CN.

**S6. The bar.** `ui/EmberBar.jsx` in the stat stack in place of the four; `tests/gates/ember-bar-gates.test.jsx`
first: hidden at 0, one bar reading `40/100` and the translated label at 40, `kind` ember's fill class. Mutants: M17
the bar renders at 0; M18 the bar reads a stale field. Delete the four bars, their imports and StatBar's three dead kinds.

**S7. Copy.** `aspectGuide.js` and the two talent descriptions from the constants; `talent.intro` in both locales;
`aspectGuide.test.js` asserts every card names EMBER and its price.

**S8. The e2e** (`tests/e2e/ember.spec.js`, CI only). A held world at noon, roar and grasp unlocked, ember seeded to
`100 - bankForKill('zombie')`: (1) the stat stack holds one ember bar and no ROAR!/GRAB!/SNARE!/IMBUE! bar; (2) a
real R press is refused and shows "Not enough ember", no charge starts; (3) a staged 1-HP zombie dies to a real left
click and the bar reads 100/100; (4) R held commits the beast form and the bar empties (store 0, no bar); R again
ends the form; (5) at midnight, ember seeded to 50, a second 1-HP zombie dies to a real click and the bar still reads
50/100; (6) a real V press grabs and the bar reads 25/100. The e2e specs that seeded a bank seed `ember`.

**S9. Docs and registry.** `memory/ARCHITECTURE.md` (the Ferocity bullet and the meter line become Ember); close the
two rows with the fix commit; `registry-harvest`; regenerate MEASURED (`measure.mjs --write`) if doc-currency asks.

## Gates

`npm run lint`; `npm run test:unit` (background, deadline); `node scripts/ci/doc-currency.mjs`; `npm run build`;
`node scripts/ci/bundle-budget.mjs`; `node scripts/ci/registry-harvest.mjs`; mutation runs with `scripts/dev/mutate.sh`
against the named specs; the e2e on CI on the PR's head sha. Every commit adding or rewriting a gate carries a
`Mutation-Proof:` trailer.

## Not proven by this lane

The snare and fuse spends in the running game (no e2e drives a bind or a fuse); the e2e's own mutants (they need a
browser; CI runs the spec, nobody runs it broken); the look of the ember colour on a real GPU (no lookbook run, the SSD
order); how the cap feels in play.
