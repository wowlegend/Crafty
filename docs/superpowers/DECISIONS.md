# Crafty — Decision Record

> **What this is.** The answer to a defect the 2026-07-27 audit found in the process itself:
> `KEVIN-REVIEW-BATCH.md` had grown to ~146 entries over eight weeks with exactly 6 marked resolved, all
> dated 2026-06-02/03/13. Nothing in the preceding six weeks was ever marked answered, so there was no way
> to tell what had been decided from what had merely not been read. A queue with no exit is a backlog that
> looks like a decision process.
>
> **The protocol.** KEVIN-REVIEW-BATCH stays the INBOX — the loop appends there. This file is the OUTBOX:
> every decision, who made it, when, why, and what shipped. An entry here is the closing record; the batch
> entry it answers is marked `→ DECIDED (see DECISIONS.md)`. A decision is never silently reversed — a
> reversal is a NEW dated entry that names the one it supersedes.
>
> **Authority.** Kevin's standing grant (2026-06-10, expanded 2026-07-20, and his 2026-10-27 mandate to the command
> session, below) lets the session decide anything, within the bright lines and rules `CLAUDE.md` states (the loop
> charter that held them until 2026-10-28 is retired). Entries marked **[LOOP]** were decided under that grant;
> **[KEVIN]** entries were decided by the owner directly. What `CLAUDE.md` reserves for Kevin (money, account
> sign-ins, an external send beyond the repo's own public face) stays his.

---

## 2026-11-01 (W3-A PR C) — [LOOP] the First Night, phase 1: room in the boot chunk, the play-through instrument, harness profiles

The W3-A task script's PR C, units U0, C0 and U0b (`docs/superpowers/plans/2026-11-01-w3a-first-night-tasks.md`),
branch `feat/w3a-first-night`. The rest of PR C (U1 onward) is the next phase. Items 480 onward.

480. **C0: 2,998 B leave the boot chunk; the ceiling is not raised.** A one-off `rollup-plugin-visualizer@7.1.1` treemap
   (installed in a scratch directory, not a dependency) and an isolated-minify estimate per module ranked the index
   chunk at the merged base (`cf815ac4`, 649,228 B). Three modules nothing needs before the world is built moved:
   `ui/BossHealthBar.jsx` (a fight only) and `render/FrameStats.jsx` (F3 or Show Stats only) to the lazy panel chunk
   through `lazyPanels.js`'s own factory, each mounted inside its own `<Suspense>` (the readout's inside the Canvas, so a
   suspend cannot hide the scene); and `ui/DebugOverlay.jsx` to a DEV-only lazy import. The overlay looked DEV-only
   already, but the static import kept its module-load WebGL probe in production, which built and lost a throwaway
   context on every boot. Measured: 649,228 to 646,230 B (overlay -566, bar and readout -2,432). The panel chunk was
   chosen over a new one because it costs the index one `lazyPanel` line per module, and its retry, boundary and idle
   prefetch are already gated; the price is that a failed load says "That panel could not load", the generic notice,
   for the bar and the readout too. Gated: one `bundle-budget.mjs` marker per module (the two testids absent from the
   boot chunk and in exactly one lazy chunk; the overlay's `"experimental-webgl"` in no chunk), red at the base and red
   again with each module moved back; `lazy-boss-bar-gates` and `lazy-frame-stats-gates` drive the lazy path to the real
   component through the chunk's import. Not moved, each for a reason: the context-loss and other-tab panels are
   covering surfaces derived from state, so a failed load would leave input dead with nothing to click (the stranding
   `input-and-pointer-lock.md` exists for); the touch controls and the music player sit on the iOS `enterPlay` cold
   start (the second needs the Start tap's gesture); the synth voices (`audio/synthVoices.js`, about 11.6 KB) are
   SoundManager's, which U1 and then W2-M edit next and whose first sound comes with play; `i18n/strings.js` is PR B's
   file. **The arithmetic after PR B** (item 453 of PR B's entry: 651,620 B at its head): with PR B and C0 both in,
   648,622 B, measured on the build of this lane's merge of PR B (`a7ec7ed4`), so PR C's index units have 3,878 B
   against their 4.7 KB of shares. The next room, unmeasured as a
   build: `ui/CombatInstructions.jsx` (about 4,161 B minified on its own; the title's controls panel, the desktop-only
   first-session card and the hint, four unit gates to re-harness) and `AchievementsPanel`, an on-demand panel still in
   `QuestSystem.jsx` outside the panel chunk. A unit over its share takes one of them, or moves code to the night chunk.

481. **U0b: every harness plays a returning player unless it says fresh.** First-minute D11, pulled forward.
   `scripts/visual/_profile.mjs` is the one table: `returning` writes `crafty_onboarded` (the flag a first session
   writes once its world is built, `App.jsx`), `fresh` writes nothing, which is what a new Playwright context already
   holds. The e2e fixture takes it as an option (`profile`, default `returning`; a spec opts out with
   `test.use({ profile: 'fresh' })`) and writes it before the page's scripts run; the lookbook and the media pipeline
   now hand their init script the same seed instead of a literal. Only the onboarding flag: the controls card's two
   flags are another axis, which the lookbook's `firstSession` and `panels.spec.js` set themselves. So from this
   commit every e2e spec runs without the two goal-loop toasts (1.6 s and 8.6 s after the world is built), which none
   of them read; `hud-at-rest.spec.js`'s own seed is now redundant and is left. Red first: `harness-profiles.test.js`
   failed on the missing module, then held five mutants of the table; `harness-profiles.spec.js` reads the storage the
   page holds before its own scripts run, and went red with the fixture's seed deleted and with the option ignored.
   The task script's second check, a no-seed mutant turning `day-night-cycle.spec.js` red, can only bite once D2 makes
   a fresh profile start cold, so D2 runs it.

482. **U0: the eight beats are written red first, and a beat waiting for its feature is skipped in CI unless opted
   in.** `tests/e2e/first-night.spec.js` holds the task script's eight beats, (a) kindle to (h) lend, each its own test
   of 120 s or less, each driving its verb with real input (G, R, a left click, a hotbar click, the Respawn button)
   and reading a presence before the beat. The repo had no mark for a red-first instrument waiting on its feature:
   `@local-only` is the only tag, and CI greps it out because a run there cannot measure it (DECISIONS 2026-08-02 ①), a
   different reason. Playwright's `test.fail()` was rejected: it passes on any failure, so a broken boot or a dead
   reader would read as the beat's red. So the spec carries its own: an `AWAITS` table names, for each beat, the units
   that build it and the red it shows until then. A listed beat is skipped by default, so CI stays green; with
   `FIRST_NIGHT_AWAITING=1` it runs and must fail with exactly that red (a `RED (x): ...` line matching its reason).
   Any other failure (a SETUP or PRESENCE line, a timeout, a red for another reason) fails that run, and so does a
   listed beat that passes. A unit that lands a beat's feature deletes its entry in the same commit, and the beat
   then gates every CI sha; a unit that moves a beat's red without finishing it rewrites the reason. The table: (a) D2,
   (b) N5 and U3, (c) B1, (d) V2, (e) N6a and D3, (f) L2 and N8, (g) L2, L3 and N2, (h) R1. Run on this branch's head
   with the opt-in, locally (Chromium, the Playwright-managed dev server on 4179), every beat showed its recorded red, 8
   of 8 in 3.7 minutes, each under 50 s: (a) the brazier lit at Start, intensity 1.6; (b) no siege at the crossing,
   the store holding none, after one numbered siege notice; (c) the camera back at the eye 1.36 s into a 14 s form,
   after a reveal that did pull it back; (d) no regeneration, 0.0 HP/s from 4.1 s to 7.0 s of calm, after a hit that
   did land; (e) and (h) no siege, so no captain and no wave 3; (f) and (g) no lantern slot on the hotbar, which shows
   its other slots. The readers a later unit must satisfy are named in the spec's header (the store's `hearthLit`,
   `siege` with `bearings`, `wave`, `night` and `captainId`, `lanterns`; the compass pip of kind `siege`; the hotbar's
   lantern slot; the keys `notice.hearthLends` and the dawn payoff's; a DEV hook `ambientAttempts`), and a unit that
   builds one under another name changes the reader in the commit that lands it. The table's own teeth, each red:
   a wrong recorded reason under the opt-in; a beat turned on before its feature in a default run; a reader aimed at
   the wrong point (a PRESENCE line, not the beat's red); and a beat that passes while listed. The horn is counted by the numbered
   siege notice that fires on the same crossing; S1's sound log can replace that.

483. **The seam's read-only `night()`.** `render/lookbookSeam.js` (the lazy seam chunk: index 0) gains `night()`: the
   clock, the vitals, the ember bar, and the night's own fields (`hearthLit`, `hearthFlame`, `siege`, `dawnRush`,
   `lastNightfall`, `lastHurtAt`), each null while the store holds none, as copies. Red first in
   `lookbook-seam.spec.js` (case 5, red on the seam without it) and in `lookbook-seam-gates` (four mutants red).

484. **`scripts/visual/first-night.mjs` plays the night, and `_firstNight.mjs` decides it.** The probe serves the
   production build (or `--url`), opens the title as a fresh profile with `?lookbook=1`, clicks Start and plays in
   real time on real keys and buttons: to the brazier and G, then the nearest hostile, aimed by mouse moves computed
   from the seam's mob list against the game's own look maths, and R on a full bar. The lock is stood in, as the
   lookbook's `--hold` does, and the cursor's way back to the centre is the one move the stood-in lock hides from the
   look. It writes the beat log, the pressure numbers (lowest health, hits taken, seconds engaged, the flame's low),
   the whole run as `clip.webm`, the captain-kill frame as `hero.jpg`, a frame every 30 s and a contact sheet, under
   `docs/superpowers/masterpiece-2026-10/evidence/first-night/` beside the eye-level frames by default. The verdict is
   pure (`firstNightVerdict`: kindle by 1:00, one horn at 4:00 plus or minus 3 s, the beast held 13.5 s or more, dawn
   by 8:05; lowest health 30-85 %, 60 s or more engaged, the flame dipped and held, a build with no flame a miss) and
   gated in `first-night-verdict-gates` (eight mutants red). Its port is 4219. Two 75 s smoke runs on this branch's
   production build (`index-CFt9jvxN.js`, ANGLE Metal on the M3 Max) exited 1 as they must on a build with no night
   yet: no kindle (G pressed 1.8 m from the brazier, `hearthLit` null), no horn, beast or dawn (cut short), no flame. They
   also showed the bot's first draft at work: in the first run it stood at the cold brazier pressing G for 90 s and
   died five times to the day's hostiles, so a hostile within 6 m now ends the kindle walk and a death counts as zero
   health; the second run killed a spider, lowest health 61 %, 8 s engaged. Those numbers are a bot's on a build with
   no siege, a smoke, not J1's verdict.

**Round 2: the instrument fixed after its reviews** (the static review's findings 1-16 and the dynamic review's F1-F3 of
phase 1, head `d558a594`). The Command's rulings stand: no CI job runs the awaiting beats, the spec prints its
denominator, C0 met its ruling, and the next room in the boot chunk goes to the first PR C unit that would cross the
ceiling.

485. **Every check of an awaiting beat is reached under the opt-in, and the record lists each one's red** (finding 5;
   this amends item 482, whose run read only each beat's first assertion). Phase 1's "8 of 8 showed their reds"
   measured the first assertion failing with its reason; the claim that a beat goes green once its feature exists needs
   every later step to have run, and none had, which is how findings 1 and 6 went unseen. Under
   `FIRST_NIGHT_AWAITING=1` a red is now recorded and the beat goes on. Where a missing feature leaves nothing to read,
   it goes on over a stand-in (a bearing, two husks, a captain, a lantern's place, a lantern in the bag), named in the log
   and refused unless a red came first, so a stand-in can never make a beat green. The record moved to
   `tests/e2e/_firstNightAwaits.js`: for each awaiting beat, each check's red with the unit whose landing turns it green,
   37 reds over the eight beats, and a run must show exactly those (`compareReds`: each recorded check once with its
   reason; a check gone green, a red the record does not hold, a red twice, or none at all fails). A beat with no entry
   is a gate and stops at its first red, as before. A test of its own prints the denominator in every run, CI's
   included, where the eight are skipped: beats gating, beats awaiting with their units, reds recorded. The run that
   checked the record is item 493. Gated: `first-night-awaits-gates` (A1-A6 red).

486. **Beat (f) places its deaths where the light it names is the nearest lit one** (finding 1, HIGH). Phase 1's death
   stood 40 m from the lantern and 20 m from the Hearth, which the returning profile reads lit: a correct N8 rose at the
   Hearth and failed, and a rule preferring any lantern passed. Three deaths now (`tests/e2e/_firstNightRespawn.js`):
   12 m from the lantern and about 32 m from the Hearth, rising within 3 m of the lantern; 14 m from the Hearth and about
   34 m from the standing lantern, rising at the Hearth, the case a rule preferring any lantern fails; and beside the
   mined lantern's place, rising at the Hearth, the case a stale index fails. The beat asserts each case's geometry (6 m
   between the two distances) before it dies. The task script's "40 m" kept "rise where you fell" apart; 12 m does that
   past both tolerances. `first-night-respawn-gates` plays the three cases under the right rule and five wrong ones: only
   the nearest lit light answers all three.

487. **Beat (b) reads what only N5 produces** (findings 3 and 12). Its horn count passed on today's code, whose
   `isDay`-edge horn fires on the crossing. The horn check is now the brief's one claim: once at the crossing and never on
   a load, with the live world saved and loaded into night 1 (today: once and once, red). Wave 1 must come from the
   stated bearing (two or more new hostiles, and three quarters of them, within 30 degrees of it and 20 m out) and march:
   10 m closer to the Hearth in 20 s, closing at every 5 s step until it is within 4 m, and ending nearer it than the
   player. The steps are there because a wanderer's random walk (`game/mobWander.js`: 3-8 m legs, a pause one time in
   three) drifts 10 m toward the Hearth in 20 s about one time in twelve (estimated from those legs, not measured), and a
   stand-in husk ended about 6 m nearer it in two runs of six; it rarely closes at all four steps. The rule is
   `tests/e2e/_firstNightMarch.js marches`, gated in `first-night-march-gates` (M1-M3 red) on a marcher's, a hunter's and a
   wanderer's tracks. The player stands 32 m or more from the Hearth,
   square to the bearing, past the largest aggro range (28 m, the duskhound), so a mob hunting the player closes on them
   and not on the Hearth; the first column with a floor among 18 nearby is taken. The wedge must sit within 2 degrees
   ahead and within 12 px of an edge behind (U3's pin, which the brief names).

488. **A unit that lands a beat's feature must rewrite its reds, and a CI-run check holds it to that** (finding 4).
   The awaiting beats are skipped in CI, so nothing saw a unit that forgot. `tests/scripts/first-night-awaits.test.js`
   runs in every unit run, so on every CI sha. For each unit that owns a listed red, `LANDED` names what in the repo
   shows it has landed: the exports the task script names (D2 `night/kindle.js kindleBeat`, N5
   `night/SiegeDirectorSystem.jsx`, B1 `game/playerPoint.js steadyEye`, V2 `game/vitality.js isCalm`, D3
   `night/dawnPayoff.js dawnPayoffBeat`); a behaviour of a pure module only that unit adds (U3 `layoutCompass` keeping a
   marker behind the player, N6a `followSkyClock` following a 60-unit tick at the rush rate, L2 `BLOCK_ID.lantern` 16, L3
   `forgeOffers` listing the lantern, R1 `notice.hearthLends` in the en strings); N8 a module importing `nearestLit` from
   `game/lights.js`; N2 the `ambientAttempts` hook registered. The check fails while a listed red belongs to a landed
   unit, or a beat is listed with no red. Each probe is first shown to see a landing on a fixture tree holding only its
   unit's piece, and none on an empty tree, so a dead probe cannot pass the check by reading nothing. It fails open
   where a unit builds its piece under another name; the probe then moves with it, the rule the spec's readers already
   follow.

489. **The probe times its beats from the clock's start, reads the horn off its notice, and kindles only from cold; a
   declared-off flame and a crash get their own answers** (findings 2, 3, 7 and 15; F1). The clock runs only once the
   world is built and play is live (`dayNight.js shouldAdvanceClock`), and `first-night.mjs` took `t0` at the Start
   click, so a correct horn read late by the world's build time against a window of 3 s. `t0` is now the first moment
   both hold, and the report gives the gap after the click. The horn is the siege notice the page shows (the log the e2e
   reads, item 490); the clock's flip logs as `dusk`. The kindle needs a cold reading before a lit one, so a profile that
   starts lit logs none. `--flame-off` declares the flame switched off (H1's `FLAME_DRAIN = 0` night, or the flame cut):
   the flame must then not dip, and a dip under the declaration is a miss. Exit 2 is now a crash (no verdict on the
   game) and 1 only a miss. Each decision is pure in `_firstNight.mjs` (`tickBeats`, the flame's verdict, `exitCodeFor`)
   and gated in `first-night-verdict-gates` (T1-T4 red).

490. **A notice is counted once, however often its toast mounts** (finding 11). The stack's toasts
   (`QuestSystem.jsx` NotificationStack) and the boss bar's line carry the channel's id as `data-notification-id`, and
   the notice log the spec and the probe share (`_firstNight.mjs installNoticeLog`) counts an id once; a toast from a
   build without the id counts each insertion, as before. Gated: `first-night-notice-log-gates` (N1-N3 red). The spec's
   horn is counted where it is raised instead (the store's `addNotification`, wrapped in the DEV page): a load rebuilds
   the world, and a notice raised while the HUD waits can end its 4 s life unseen. Three runs of (b) raised the load's
   horn each time and showed it on screen once; counted on screen, the record would read the horn green two times in
   three. The probe, on the production build with no store to wrap, keeps the shown log.

491. **The boss bar takes the line only once it is drawn** (finding 16, from C0). Where the encounter column holds the
   notices, the line went into the boss bar whenever a boss was up, and since C0 the bar is lazy: while its chunk loads,
   or after it failed, every notice, the "could not load" one among them, showed nowhere. The bar now reports itself
   drawn from a layout effect (`onDrawn`), and until it does the line stands as the one toast. Gated:
   `boss-bar-line-gates` (B1, B2 red), with `hud-notices-gates` holding the drawn bar's line (B3 red).

492. **The smaller corrections** (findings 6, 8, 9, 10, 13 and 14; F2, F3). (a) faces the brazier (heading 0 from 2 m
   south; 180 faced away), and its kindle check needs the brazier cold before G and lit after; the old poll passed on a
   brazier already lit. (c) holds its window from the task script's 1.2 s, written in the spec, not `transformCam.js`'s
   constant, which B1 rewrites; its return check needs a held view at the form's end; its wait for the form to end is a
   PRESENCE, not swallowed. (d)'s restart check needs health to come back after the second hit's 4 s; it passed today
   because nothing regenerates. (e) reads D3's swell as the store's bloom window, 300 ms or more past the kill, and its
   sky check needs a rush to have happened, since no rush read as no cut. A cut is now measured against each frame's
   time: the sky's own clock (`readSkyLight` `cycle`) moving further in one frame than the rush's 60 units a second could
   pan it, where the sun's height step it replaced would read a slow page's pan as a cut (one local run drew 3 frames a
   second); a rush drawn slower than a frame every 0.25 s is a PRESENCE, too slow to tell. (c)'s recorded red takes any
   time for the camera's return: the first frame off the held view came at 1.36 to 1.76 s in four runs and at 3.59 and
   3.68 s in two, on a loaded machine; why it moved is not measured, and B1's window replaces it. (g): the `ambientAttempts` contract is the
   player's live position, a dry run (it places nothing, so no mob cap or budget is spent between the two batches) and
   one entry per attempt; the warded batch must reach the ward's edge (16-30 m) as its presence; the lantern is bought
   for the Forge's price through `buyForgeOffer` (`goods:lantern`), so L3 joins the beat's units as the task script has
   it. (h)'s night-2 wave is a red, not a timeout. The Respawn button's own pointer-lock request is refused on a headless
   page (finding 14, measured in item 493: the gate read shut after each of the three respawns), so the beats hold the
   gate again as `startPlayActive` does. A lethal hit waits out the 5 s a respawn protects the player for
   (`damagePlayer`'s `_spawnTime`), which ignored (f)'s second death in one run; and every crossing holds the gate first
   and names the clock's gates (`shouldAdvanceClock`'s inputs) when it never comes, after one run under a load of 98 saw
   (b)'s crossing not come in 15 s. `initArgs` (`_lookbookPage.mjs`) builds the init script's seed, a returning
   player unless named, and the init script refuses an argument with none (finding 13; S1, S2 red). The head run's two
   flake sightings are on their rows, with the light-pool fall the dynamic review read (`e362323e`).

493. **The record against the game: every beat showed every recorded red under the opt-in.** The whole spec, run
   locally on this round's last spec with `FIRST_NIGHT_AWAITING=1` (Chromium, the Playwright-managed dev server on 4179,
   started at a load of 9.5): 9 passed in 5.8 minutes, the eight beats with 37 of 37 reds as recorded. By beat: (a) the
   brazier lit at Start, intensity 1.6, and the same after G; `hearthLit` null. (b) no siege; no wedge ahead or behind;
   no bearing for the sector; the stand-in husk drifted from 28.1 to 34.9 m off the Hearth, no march; the horn raised
   once at the crossing and once on the load (shown on screen after the load: 0). (c) the camera back at the eye inside
   the held window, not held at the form's end, `playerPosition` 4.00 m off the body. (d) 0.0 HP/s from 4.1 to 7.0 s of
   calm; held to 5.5 s after the second hit, and no regeneration. (e) no captain; the stand-in killed by the real click
   inside the swing's reach; no day within 6 s, no rush in the sky log (56 frames), `lastRewardedNight` 0, no keyed
   notice after the kill, the bloom window 0 ms. (f) no slot, so nothing to select; the death 12 m from the lantern's
   place rose 20.2 m from it, the other two 0.0 m from the Hearth; nothing to mine. (g) the Forge answered `stale`; no
   slot; the three reds of no `ambientAttempts` hook; nothing to mine. (h) no siege, the bar at 40, the line 0 times, no
   wave 3 on night 2. The default run, as CI has it: 8 skipped and the denominator test passed. The runs before it found
   what phase 1's first-red stop hid, finding 5's point, each fixed at its cause: (b)'s stand had no floor at 32 m east
   and its stand-in husks none 50 m out (the stand takes the first floored column of 18 near square; the husks stand
   28 m out); (e)'s click, aimed before it, did not kill the captain (it is aimed on its own mousedown, which
   `talents.spec.js` measured is needed); (f)'s second death fell in the respawn's 5 s protection; the load's horn is
   counted where it is raised (item 490); a march must close at every step (item 487); and (e)'s sky check measures a
   cut against frame time (item 492). After each of (f)'s three respawns the input gate read shut (finding 14, confirmed
   on the headless page). Two runs started over the load ceiling of 28 (at 41 and 66) and were stopped within a minute;
   another, started at 26 under a load that rose to 98, saw (b)'s crossing not come in 15 s, which did not recur.

494. **The boot chunk after round 2: 648,684 B, 3,816 B under the ceiling.** Measured on this round's build: 648,622 B
   before (item 480; no source change since) and 648,684 B after, the notice id and the bar's drawn state (+62 B),
   against 652,500 B, which was not raised. PR C's index units have 3,816 B against their 4.7 KB of shares; item 480's
   next room stands for the first unit that would cross.

---

## 2026-11-01 (W3-A PR B) — [LOOP] six small fixes beside the First Night: the fire's pad gated, a long frame keeps the fight, the flinch turns away, C forces a placement, the ember bar shows its prices, each beast stands on its floor

The 2026-11-01 W3-A task script's "PR B" (it lives on branch `feat/w3a-first-night` until that lane lands), branch
`feat/w3a-small-fixes` from `3442443d`, PR #80. Each gate went red before its fix: the unit and jsdom gates locally, the
two e2e cases (I1, U2) on CI first (run 41287676192 at `e0b8a5cb`: hud-at-rest "the ember bar does not mark the five
unlocked prices ... []" at every layout; build-placement "held Q did not turn the right click on a chest into a
placement", the control's interact seen first). The looks were shot on the M3 Max: the lookbook's self set on the
production build (D1), and throwaway probes on the dev server with a real key or the store's own hit (F6, U2, B2),
deleted after; the frames are in `docs/superpowers/masterpiece-2026-10/evidence/w3a-small-fixes/`.

440. **The pad by the Hearth's fire is gated through the night on the terrain stone, and the brazier's light is amber;
   the midnight maroon on screen is not fixed by it.** `colour-script-gates` G2b: the pad lit by `HEARTH_FIRE` at 0.5, 1
   and 2 m, terrain stone, f 0.44 to 1.06, chroma at most 0.025 wherever the model's hue lies within 20 deg of maroon's
   band (the screen reads 10 to 20 deg redder: DECISIONS 2026-10-28, the landing lifecycle entry, item 21 (d)). Red on
   the orange `#FF8A2A`; green on amber `#FFB050` (worst 0.0221); a lavender twilight that every other case passes is red
   here. On screen (the lookbook's `self-brazier-110` at midnight, the pad left of the brazier on the maroon rule): 48.5%
   before, 45.9% after; throwaway builds: the fire off 4.7%, a warm white `#FFE2A8` 39.4%, amber at 2.6 56.6%. Whatever
   its colour, what the fire adds to the dark pad on screen carries green at about a quarter of the light's own
   green-to-red ratio and almost no blue, so any warm light on the violet night pad reads magenta-red; the model does not
   reproduce that. `REVIEW:light:g2-pad-coverage` closes (its acceptance is the gate); `REVIEW:light:midnight-brazier-maroon`
   stays open with the numbers. Amber ships because the gate needs a fire it passes and the screen moves the right way, a
   little; the night key and the display's dark end are the light lane's next question, not a small fix. Commit `f88147b1`.
   (G2b's claim is narrowed to the model, and the open row goes to W3-A unit L1: item 454.)
441. **The stance keeps its own clock: each frame adds the world clock's advance, at most the frame's step.** A frame
   longer than `MAX_FRAME_STEP_SEC` moves the world clock its whole length and every mover the cap; counted whole, one
   3.5 s CI hitch stalled a husk still walking in and spent the calm (`REVIEW:w2b:stance-clocks-long-frame`). The two
   e2e idles that waited out the calm on the wall clock wait on the stance's clock. Commit `7fc0224b`.
442. **Being hit kicks the camera away from the blow.** `game/cameraKick.js` `hurtKick(angle)` turns the hurt profile's
   back push by the store's `lastHitDir.angle` (a hit from the right throws the view left; from behind, forward; with no
   source, back as before), same size. The look, in the running game through `damagePlayer` with a source position: a
   hit from the left moved the camera +0.079 m along its right on the frame after, a hit from the right -0.072 m, both
   gone in about 0.25 s, beside the edge glow on the hit side. Subtle by design, as the hurt kick was. `OPEN_ITEMS:OI-37`.
   Commit `1aad531a`. (The no-source case was false after a sourced hit: item 448.)
443. **Held C with a right click places where the click would open a chest or cast at a mob; Alt is not used.** The row
   named Alt. Under a pointer lock on Windows, Chromium released the lock when Alt was pressed and released (Chromium
   commit 560e652, bug 40734020, suppressed from main@{#1577353}, 2026-01-30); Firefox on Windows raises its menu bar on
   Alt (bugzilla 1574057); Alt+D takes the address bar on Windows and Linux. Ctrl+W closes the tab and Shift is the
   dodge. Q, the first pick, is a panel key item 96 (2026-10-29) retired, which `keyMap.test.js` and `taught-keys-gates`
   hold unbound. C is bound to nothing. The intent `forcePlace` is set by the keydown and cleared by the keyup and on
   blur; the router places on the right button with the hands free wherever the build ray met terrain in reach. Touch is
   desktop only: the cast button fires on the lift, so a long press would turn a held cast into a placement, and
   real-device feel is Kevin's. `QUEUE:Q26/b`. Commits `bf412b84` (the e2e, red first on Q), `d4b22d9d`. (Cmd and Ctrl
   let go of C: item 449; a forced block at a mob's feet: item 450.)
444. **The ember bar marks each unlocked Aspect verb's price and lights the ones it pays for; the dusk warning names the
   roar once it is unlocked.** Grab 25, imbue 30, snare 35, fuse 50, roar 100, from KEY_MAP's verb rows (the fuse rides
   the snare's talent); "A full ember bar wakes the beast (R)." in en and zh-CN. Judged on frames at 1280x800 and
   390x844: the notches read as lit and dim at a glance, but the slim track beside its label is 78 px wide on the
   desktops and iPads and 30 px on phones (hud-at-rest, CI run 41289153753), so the three cheap prices sit within 8 and
   3 px of each other and which verb a notch is cannot be read from the bar; the keys are taught in the controls panel.
   `REVIEW:w2f:ember-bar-no-readiness`. Commits `e0b8a5cb` (the e2e, red first), `d2c066f7`. (That row closes
   superseded, not done, and the touch line names no key: items 451, 452.)
445. **Each beast form stands on the floor its own capsule rests on, from the entrance's first frame.** The parts hang in
   an inner group at `formLift(element, scale)`: the lowest point of the boxes (each turned by its rotation) on the
   floor that halfHeight + radius + `CONTROLLER_OFFSET` puts under the centre, at every scale of the entrance. The outer
   group stays `FEET_OFFSET` under the centre, so the first-person test and the DEV hook `frameBeastReveal` read as
   before and `devtest/devBridge.js` (in flight in PR A) is untouched. The gate's reference is real Rapier's rest height
   (0.77, 1.12, 0.97, 1.25 m). In the running game, a real roar on R: before, the bull's and the golem's lowest boxes
   stood 0.21 and 0.35 m over the ground under the body; after, 0.000 for all four. From the reveal's hold, above and
   behind, a gap of that size is hard to see by eye: the measurement carries it. `REVIEW:w2e-follow:beast-feet-per-form`.
   Commit `0f9c9b4c`.
446. **PR B nets +2,290 B of index against about 400 B of shares; the ceiling is not raised.** Main was 649,123 B at
   `3442443d` (1,366 B over the plan's 647,757), and PR B leaves 651,413 B: V1 +146, F6 +112, D1 0, I1 +410 (the KEY_MAP
   row and two strings), U2 +1,037 (two sentences of about 220 B, the marks and the helpers), B2 +585 (the rotated
   lowest point and the per-frame lift). That leaves 1,087 B under 652,500 for PR C, whose C0 must free correspondingly
   more before its index units land. (The command session's ruling and round 2's bytes: item 453.)
447. **A flake row for input-live.spec.js:72's victory case** (`REVIEW:e2e-flakes:input-live-victory-scrim-intercepts`,
   LANE:flakes): CI run 41282171902 (PR #77 at `3442443d`), shard 5/8, attempt 1 timed out clicking Keep exploring
   because the victory overlay's own `z-modal` scrim intercepted the pointer; retry #1 passed. First sighting. The same
   run's light-pool.spec.js first-attempt failure (programs 97 to 98, the point lights held at 5) is a sighting in
   `REVIEW:w2f:light-pool-first-attempt-programs`. PR B's own green run (41289153753, `d2c066f7`) retried four cases on
   code it does not touch: three known rows take the sighting (heavy-melee's release, combat-touch's spawn race,
   quest-text's held world), and music-bus.spec.js:74's Mute All wait gets a row of its own
   (`REVIEW:e2e-flakes:music-bus-mute-all-wait`).

Items 448 to 458 are the second review round (a static and a dynamic review of `3442443d..3e3decc7`). Each code item's
gate went red before its fix, or, where the code already did what the item decides (450), its mutants did; every gate
commit carries a `Mutation-Proof:` trailer with two comment-only identity mutants that survived.

448. **A hit with no source kicks straight back; item 442's "with no source, back as before" was false.** `damagePlayer`
   stamped a hit with no attacker position (a projectile, the dragon's fireball impact, its lava) with the previous
   hit's angle, so after a mob's blow from the left a projectile threw the view sideways with no back push (the dynamic
   review, through the real `damagePlayer`). The stamp's angle is now null for such a hit: the kick keeps the hurt
   profile, and the edge glow (`ui/DamageDirection.jsx`) shows nothing for it instead of the old side, cutting short a
   glow still fading from a sourced hit. `player-hurt-kick-gates` drives the real `damagePlayer` on the real Player and
   Rapier. Commit `cf84f202`.
449. **C cannot stay held.** On macOS a key let go while Cmd is down sends no keyup (Mozilla bug 1299553; Chromium issue
   40880986, where Chromium has since forwarded those keyups behind a killswitch), so a Cmd+C, or a C held into a Cmd
   press, kept `forcePlace` on and every right click at a chest or a mob placed (the static review, item 7). Any keydown
   with Cmd or Ctrl down, the modifier's own included, lets go of C, and a C pressed with one is copy and sets nothing;
   any C keyup lets go, whatever its modifiers; a blur and a hidden tab already cleared every held intent and are now
   gated for C. A C held through a Cmd press must be pressed again. The first version let go on the MetaLeft and
   MetaRight keyups and turned `keyMap.test.js`'s reverse gate red ("handled but advertised nowhere"): the commit hook
   runs only the tests that statically import a staged file, and that test reads `Components.jsx` as text. A release
   guard is not a binding, so the gate stays as it is and the release moved to the keydown. The Alt comment in
   `Components.jsx` now names Chromium's fix (commit 560e652, main@{#1577353}, 2026-01-30). Commits `f4259473`,
   `64611843`.
450. **A forced block aimed at a mob's feet is placed, and the mob stands on it.** Terrain nearer than the mob already
   places without C, so what C adds is a block at or beyond the mob: under its feet or on the wall behind it, never
   "the wall between them", as `verbRouter.js` had it (the static review, item 4). Placed, not refused: `placeAtHit`
   refuses only the player's own capsule, because a cell the player fills holds them for good (item 132, 2026-10-30),
   while a mob whose cell is filled is lifted onto the block by its floor rule (`game/mobFloor.js`), as with any block
   built under a mob, and walks off it. Refusing it would need the mobs' positions in the executor for a case that
   strands no one. `force-place-mob-cell-gates` drives the router, `placeAtHit`, the click's cuboid and the snap
   AIWorkerSystem makes, on real Rapier over the real mesher's ground, before the re-mesh and after. Commit `5cf3c6d5`.
451. **`REVIEW:w2f:ember-bar-no-readiness` closes superseded, not done.** Its title asks which verb the bar can pay for;
   `hud-at-rest` reads each mark's price and whether it is lit, and on a 30 px phone track the 25, 30 and 35 marks sit
   within 3 px, so a player cannot tell which notch is which verb (the static review, item 2). The command session's
   ruling was to reopen it in this branch, where alone it is closed; `registry-append-only` R2 refuses a reopen on the
   pushed range (`3e3decc7..` the head, where it is closed at the base), and a push never skips that check. So it closes
   `superseded:REVIEW:w3a-pr-b:ember-marks-name-no-verb`, a new open row (LOW, LANE:W3-A) whose acceptance is that
   check, and main never sees it closed as done. The U2 marks and the dusk line stay.
452. **On touch the dusk line names no key.** The roar is a sector of the Aspect ring there, so "(R)" named a key the
   device lacks (the static review, item 8). `duskNotice` takes the touch UI's predicate (`isTouchUIMode`): the line's
   `{how}` is `notice.keyHint`, " (R)" or "（R）", with a keyboard, and empty on touch. The gate reads the words the toast
   shows in en and zh-CN on both. The Aspect unlock toast's "press R" (`game/aspectHints.js`) has the same shape and is
   not changed here. Commit `fd4d8b47`.
453. **The index budget, reconciled with the command session's ruling.** The ruling (session record, 2026-11-01): PR B's
   growth is accepted, and PR C's C0 frees at least 2,500 B before PR C's index units land. Item 446's numbers stand
   for round 1 (651,413 B; the builder's QUESTION.md, which said +2,311 B and 651,434 B, was a draft and is corrected
   to them). Round 2 nets +102 B (651,515 B), and main's PR A, merged in, adds its +105 B (item 436): 651,620 B at
   this round's head, 880 B under 652,500. The task script's units after PR B share about 4.7 KB of index and C0
   frees 2,500 B, a net of about 2.2 KB against those 880 B, so PR C fits only if C0 frees about 3,800 B or its units
   come in under their shares.
454. **G2b's claim is narrowed to the colour model; the midnight brazier stays open, for W3-A unit L1.** G2b reads the
   model's pad by the fire, not the screen, which still reads it maroon at midnight under amber (item 440). Its test
   name, its blind-spot note (which had kept history: the old orange's numbers) and the `HEARTH_FIRE` comment now say
   so; `REVIEW:light:g2-pad-coverage` stays closed on its acceptance with that said in its note, and
   `REVIEW:light:midnight-brazier-maroon` stays open, owned by W3-A's lights unit L1 (the command session's ruling).
   Commit `f1c78a5e`.
455. **Doc drift.** `stanceStep`'s `nowMs` named the world clock; `stanceFrame` passes the stance's own clock since
   item 441, and the comment now says so. Commit `f1c78a5e`.
456. **A row for the lookbook's self set, which rests every beast form at the human rest height**
   (`REVIEW:w3a-pr-b:lookbook-self-human-rest-height`, LOW, LANE:W3-E; the static review, item 1). The body rests at
   0.5 + 0.4 + 0.05 = 0.95 m, and since B2 each form's lowest box sits at 0.95 minus its own rest (halfHeight + radius +
   `CONTROLLER_OFFSET`): the comet's 0.77, 0.18 m afloat; the bull's 1.12, 0.17 m sunk; the hawk's 0.97, 0.02 m; the
   golem's 1.25, 0.30 m. The game is right (item 445); the frames would show a gap that is not there. `lookbook.mjs`
   is in flight in PR A, so the fix waits for W3-E.
457. **Round 1's head run had no `ci ok`.** Run 41290740368 on `3e3decc7` reported success in 0 s with ten of its
   twelve jobs, each carrying a completion time before its start time by GitHub's own record; `runtime reach (merged)`
   and `ci ok`, which need the e2e matrix, were never created, so the PR stayed blocked (the dynamic review, item 1).
   Nothing in `ci.yml` explains it; this round's push runs CI again on its own head.
458. **Round 2's first run, read.** Run 41296767030 on `fcda6c6d` concluded success with all twelve jobs, `ci ok`
   included. Two cases passed on retry, both on code this PR does not touch: heavy-melee.spec.js:45's charged release
   (a sighting in `REVIEW:e2e-flakes:heavy-melee-release-nothing`) and feedback-grammar.spec.js:140's held hit, "0 of
   12617" interior pixels white on the lit band (a first sighting, `REVIEW:e2e-flakes:feedback-grammar-lit-band-white`,
   LANE:flakes). CodeQL, which `ci ok` does not read, raised one high alert (js/incomplete-sanitization) on the PR: the
   dusk gate built a RegExp from a string with only `.`, `!` and `?` escaped; it reads `startsWith` now (`a53cb517`).
   Main moved twice in the round, to `e5e1f745` (W3-A PR A) and `cf815ac4` (the ultrareview records), and each was
   merged in; the second brought only DECISIONS and registry rows, so the index stays 651,620 B.

---

## 2026-11-01 (ultrareview chunks 4-6) — [LOOP] the three parts of the game no review had read are reviewed: what the cloud delivered, what a local replica found beside it, and the rows filed

Registry row AUDIT:critic:coverage-gaps/ultra asked for the deep review of the ui, render and audio-and-scene areas, the
half of `frontend/src` that no whole-game review had read (chunks 1 to 3 ran in the deep audit,
`docs/superpowers/audits/2026-10-30-deep-audit.md`). This entry records the runs, what each delivered, how the deliveries
were checked, a local replica of the same review on one chunk, the comparison, the cost and the rows. Records only: no
code changed. Items 460 to 468.

460. **The three runs.** On 2026-11-01 the three free runs of account 2 (DECISIONS 2026-10-27: three free runs per
   account, one-time) reviewed the three chunks. Each ran from its own separate local git repository,
   `.claude/worktrees/ur3-<chunk>`, whose branch `review` is a pair of commits: a base commit holding the whole of Crafty
   at `dae1afb4` except the chunk's files, and a review commit that adds only the chunk's files. The review's diff is the
   chunk as pure additions, under the cloud review's diff cap (500 files, 8,000 changed lines), and the reviewer still
   reads the whole game around it.

   | chunk | files | lines | holds | base / review commit | cloud session |
   |---|---|---|---|---|---|
   | 4-ui | 74 | 7,594 | HUD, panels, primitives, i18n, theme, touch controls | `3f8f9f7` / `9bb3ae4` | `session_01PyjBK9f7PTDauQgdTpaFc3` |
   | 5-render | 57 | 7,688 | render, post FX, spell VFX, mobs, boss, ocean, sky, quality tiers | `2cad929` / `fc048c5` | `session_01PyjBK9NcSj1Nf3w8t5mNDq` |
   | 6-audio-scene-rest | 40 | 7,170 | audio, SoundManager, GameScene, atmosphere, weather, devtest, lookbook, grass, NPC | `57fc230` / `9d319b8` | `session_01PyjBK9n5bKqvTbjkWkGuFY` |

461. **Counters and delivered counts.** At each run's last progress line (found / verified / refuted): 4-ui 36 / 28 /
   25, 5-render 30 / 25 / 19, 6-audio-scene-rest 29 / 30 / 13. Each run delivered exactly 10 findings: 4 normal and 6
   nit (4-ui), 2 and 8 (5-render), 3 and 7 (6-audio-scene-rest), by the cloud's own severity field; the verification
   text inside 5-render finding 2 and 6-audio-scene-rest finding 2 says nit, and their rows give the field's value. The
   counters tally verdicts, not unique bugs: the last run shows more verified (30) than found (29), so how many unique
   verified bugs stood behind the 10 is unknown.

462. **Our verification, and what was filed.** One repro verifier per delivered finding (30 in all) read the code in a
   `cp -c -R` throwaway of the review repository, `node_modules` symlinked and no browser, built a control and tried to
   refute the claim. Verdicts: 27 CONFIRMED, 2 PLAUSIBLE (4-ui finding 1, the potion tile: whether a touch browser shows
   Use is unmeasured; 6-audio-scene-rest finding 2, the Web Audio ramps: the formula was stated from memory and no
   engine was run) and 1 REFUTED (6-audio-scene-rest finding 6, the place sound's occlusion march: every line-level
   claim is true, but the block-place sound never reaches the spatial path in GameScene's mount order, so nothing is
   heard; not filed). By player harm among the 29 not refuted: MED 4, LOW 14, NONE 11. Filed: 27 new rows
   `AUDIT:ultra-1101:<chunk>-<n>`, n being the finding's 1-based place in that run's list (so `6-audio-scene-rest-6` has
   no row), and the two history-comment findings (5-render finding 10, 6-audio-scene-rest finding 10) as a line appended
   to REVIEW:l12:history-comments-ledger, which they match: 15 receipts and six past-tense comments that its ratchet's
   markers do not count. A NONE-harm finding is a LOW debt row, and so is a LOW-harm finding whose cost has no visible
   symptom: AUDIT:ultra-1101:4-ui-9 and 6-audio-scene-rest-9, and AUDIT:replica-1101:4-ui-11 from the replica (of the 14
   LOW-harm cloud findings, 12 are LOW bugs and those two are debt). Our verifiers corrected several cloud claims (cited
   lines that do not exist in 5-render findings 4, 5 and 9; the refuted 'shading seam' in finding 3), recorded in the
   rows.

463. **The replica of chunk 4-ui.** To learn what the cloud leaves out, the same chunk was hunted locally: five hunters,
   each on a player-facing lens, produced 49 raw candidates, merged by root cause into 32; each got three independent
   votes (CONFIRMED, PLAUSIBLE or REFUTED, and a harm), and a candidate survived unless two or more votes refuted it. 28
   survived and 4 were killed. Six survivors are cloud findings (4-ui 1, 2, 3, 4, 5 and 10); the other 22 are replica-only.
   Filed: 21 rows `AUDIT:replica-1101:4-ui-<n>`, n being the candidate's 1-based place in the merged list of 32 (the
   numbers have gaps), and one line appended to STATUS:G-ledger:35 (the touch surface's own animation loop, candidate
   29). The replica-only survivors rest on their three votes alone: no probe re-verified them, which is a weaker standard
   than the cloud's findings met, and each row's evidence says so. Killed and not filed: candidate 23 (about 40 English
   literals bypass t() and the ratchet cannot see them; R,R,C; the literals are filed from the cloud as
   AUDIT:ultra-1101:4-ui-7); 24 (4.2 MB of CJK fonts are fetched and no element uses them; R,R,C; our verifier measured
   font-body-cjk in 0 JS chunks, and the fonts' fate is noted on AUDIT:ultra-1101:4-ui-8); 25 (a partial CJK load
   latches; R,R,R; filed from the cloud as 4-ui-8, which our probe reproduced); 26 (the panel-load-failed notice is
   raised pre-translated, so it escapes dedupe; R,R,R). For 26 the mechanism is in the code, read for this entry:
   `ui/panels/lazyPanels.js:84` passes `t('notice.panelLoadFailed')`, `toNotification` in `ui/notifications.js` gives a
   plain string without `opts.key` no dedupe key, and `QuestSystem.jsx` admits such a notice each time. The replica's
   reason for the kill is not in the data, and the harm is a repeated toast, so it stays unfiled and findable here.

464. **The comparison on 4-ui.** 34 distinct defects by root cause: the cloud's 10, the replica's 32, 8 in both. The
   replica found 8 of the cloud's 10 (80%) and 6 survived its own votes: it killed two that our probes had reproduced in
   code (4-ui-7 and 4-ui-8, both latent because no player can switch to zh-CN) and never found two (4-ui-6, the
   classifier's ternary; 4-ui-9, DebugOverlay's boot-time GL context), both outside its five lenses. The cloud delivered
   6 of the replica's 28 survivors (21%): 6 of 22 normal-severity, 2 of the 9 with MED harm (4-ui-1 and 4-ui-3) and none
   of the 6 nits. **16 normal-severity defects that survived the replica's votes are absent from the cloud's 10 (15 drew
   at least two CONFIRMED votes of three; AUDIT:replica-1101:4-ui-16 drew PLAUSIBLE three times), and 7 of them are MED
   harm, all among the 15:** AUDIT:replica-1101:4-ui-10 (no player can switch to zh-CN), -1 (the Settings panel
   off-screen), -13 (the chest panel's close off-screen), -15 (the portrait phone Inventory), -18 (the Build tray's
   ghost click), -20 (the hotbar's numbers) and -21 (keyboard copy on touch). Why is unknown: the cloud's fixed 10 cut
   them, or the cloud never found them. A severity-first cutoff would not fill six of ten slots with nits while dropping
   normal bugs, which points to a recall gap or a ranking that is not severity-first, but the data cannot separate the
   two; the test is an ultra rerun of the chunk with `--max-findings all`, which is Kevin's
   (AUDIT:ultra-1101:cap-question). Before the replica runs again (AUDIT:replica-1101:chunks-5-6) it takes the changes
   this comparison asks for: two more lenses (what the production bundle runs; tools that ship in src); a vote split
   into mechanism and harm, where a refutation carries a proof command and a latent defect stays harm NONE rather than
   being killed; dedupe by root cause with parent links and kept sub-claims; a harm-ranked top 10 beside the full list;
   and the per-finding probe on every MED survivor.

465. **What the binary showed, and what the data cannot.** A reading of the installed `claude` binary during this work
   found no cap of its own on the number of findings the client prints, so a cap, if there is one, is applied on the
   cloud side; and the session page refuses to open a review session, so the findings were read from the runs' output and
   the session ids in item 460 are a record, not links that open. Neither fact was re-measured for this entry. Whether a cut at 10 hid bugs the cloud
   had found stays open (item 464).

466. **Cost.** The three cloud runs spent no usage credits: they were account 2's free runs. Verifying the 30 findings
   and running the replica on one chunk took 133 agents and 18.7M subagent tokens (the work's own totals, carried and
   not re-measured for this entry). A further ultrareview costs usage credits (typically $5 to $25 a run, DECISIONS
   2026-10-27), which is Kevin's to spend.

467. **The rows.** 50 rows added, 2 lines appended, 1 row closed; every new row is open in an open lane. By lane:
   LANE:W3-C 7 (the first minute on touch and keyboard: AUDIT:ultra-1101:4-ui-1, 4-ui-3 and 4-ui-9;
   AUDIT:replica-1101:4-ui-1, -16, -20 and -21; the plan's W3-C row names Unit 0, the hint strip, the title's Hearth and
   the first click after Start, so 4-ui-3, replica -16, -20 and -21 and 4-ui-9 tie to it by touch input, hint copy and
   Unit 0, while AUDIT:ultra-1101:4-ui-1 (a starting potion's tile) and AUDIT:replica-1101:4-ui-1 (the Esc Settings
   panel) are first-minute reaches it does not name, and their notes say the lane may hand them to backlog), LANE:W3-B 3
   (the dragon: AUDIT:ultra-1101:5-render-1, 5-render-2 and 5-render-5), LANE:W3-E 2 (AUDIT:ultra-1101:5-render-3, the
   fireball's lathe seam, and 6-audio-scene-rest-3, the shadow frustum on the iPad low tier), LANE:backlog 37 and
   LANE:kevin 1. By kind: 36 bugs (11 MED, 25 LOW), 12 debt rows (LOW) and 2 instrument rows. The MED bugs:
   AUDIT:ultra-1101:4-ui-1, 4-ui-3, 5-render-1 and 6-audio-scene-rest-3, and AUDIT:replica-1101:4-ui-1, -10, -13, -15,
   -18, -20 and -21. Two instrument rows record deferrals this entry leaves: AUDIT:ultra-1101:cap-question (LANE:kevin:
   whether the cut at 10 hid bugs) and AUDIT:replica-1101:chunks-5-6 (the replica has run on one chunk of three; MED).
   The evidence line of every row says whether the cloud, our probe or the replica's votes carry it. Appended instead of
   filed: REVIEW:l12:history-comments-ledger (two cloud findings) and STATUS:G-ledger:35 (one replica candidate).

468. **AUDIT:critic:coverage-gaps/ultra closes done.** Its acceptance asked for `/code-review ultra` on chunks 4, 5 and
   6, the findings filed as rows, and the run ids and session links recorded in a DECISIONS item. Kevin provided account
   2's three free runs, as the row's note records; the runs, the findings as rows (27 rows, 2 appended lines and 1
   refuted, item 462) and the session ids are items 460 to 467 and the rows above (the links do not open, item 465, so
   the ids are the record). Kevin keeps any further ultrareview, which costs credits, and the cap question. The sibling
   AUDIT:critic:coverage-gaps/hunt (subsystems no hunter read) stays open.

---

## 2026-11-01 (ultrareview tab re-checks) — [LOOP] the interactive review tabs re-checked the delivered findings with their own model: what they added, the one finding the two verdicts split on, and where it is kept

Records and archive only: no code changed. It follows items 460 to 468, which filed the cloud's deliveries. Item 469.

469. **The tabs' re-checks.** After each cloud run delivered its 10 findings, the interactive review tab that launched
   it (4-ui, 5-render, 6-audio-scene-rest) re-checked the same 10 itself, with the session's own model (Opus at xhigh),
   against `dae1afb4` and changed nothing in its repository. The re-checks are archived in
   `docs/superpowers/audits/2026-11-01-ultrareview/` with the three findings files and a README (the cloud session ids,
   what each file is, and that the scratch originals get reaped; two machine paths in the re-checks are rewritten so the
   public repo carries no home path). The tabs' tables are in their own order, not the cloud's, for 5-render and
   6-audio-scene-rest; the README says to match by file and line.

   What each tab found. 4-ui: all 10 hold; one correction (below); read and computed, not run on a device. 5-render: all
   10 mechanisms hold in the code, 2 matter in play and 8 are nits; nothing was run. 6-audio-scene-rest: all 10 hold,
   none refuted, 3 narrowed (the wind bed's loudness, the place sound's occlusion, the game-loop rule), and 1 new bug;
   it also ran what the verifiers could not, Chromium 156 for the gain ramps and three's real shadow matrix for the
   frustum.

   What the tabs added here:
   - **One new row for the new bug,** `AUDIT:ultra-1101:6-audio-scene-rest-tab-1`: the wind bed's gain at
     `SoundManager.jsx:235` keeps the volume from when the pad started, and the volume effect updates only the pad's own
     gain. The tab did not reproduce it with a probe, and nor did this entry. Read at `267110a4`, the step callback does
     close over that render's volume, but no shipped UI calls `setVolume` (its only caller is
     `event-sound-gates.test.jsx:112`), so nothing is audible today: filed as LOW debt, not a bug, by item 462's rule for
     harm NONE, in LANE:backlog beside the other bed rows (the plan gives LANE:W2-M the sample bank and the night's voices,
     not the beds).
   - **Corrections appended to eight rows,** one line each, dated and sourced: `4-ui-1` (the cloud's "no hover ever
     shows on touch" is too strong: Tailwind is `^3.2.7` with no `hoverOnlyWhenSupported`, so touch depends on the
     device and stays Kevin's; a keyboard player is blocked either way), `5-render-4` (the lookbook never enters
     capture, which the row already said; the line adds that specs and gates still do), `5-render-5` (a design gap: the
     spec scales phase damage only), `6-audio-scene-rest-1` (narrowed: the peak is about -52 dBFS, and reusing stormBed's
     flat buffer would be 33 dB louder RMS), `-2` (confirmed in Chromium 156; WebKit still unrun), `-3` (confirmed with
     three's real matrix; `snapShadowCentre` snaps only x and z, and capture pins the high tier, so the fix needs a
     low-tier check), `-5` (narrowed: the rule breaks are real, the `setProjectiles` consequence is unmeasured) and `-9`
     (`startSynthPad` also owns the wind bed, so an early return would kill the bed). Nothing was appended to
     `5-render-2`: the tab's "wider" finding, `EnemyProjectileSystem.jsx:48`, is already in the row from W3-A PR B's
     round-2 review, and the tab's cause (`useGameStore.jsx:1033` keeps the old angle) described `dae1afb4`, before item
     448 made an unsourced hit stamp a null angle, which the row already says.
   - **The disagreement, filed.** 6-audio-scene-rest finding 6 (a placed block muffles its own sound): our repro verifier
     REFUTED it (item 462: every line-level claim is true, but the place sound never reaches the spatial path in
     GameScene's mount order, so nothing is heard; no row was filed). The tab NARROWED it with a model on the real Rapier
     engine and the same march: 5 walls in 31% of 20,000 modelled top-face placements, 3 or more hits (350 Hz) in 55%,
     none in 16%, the voice lasting 0.1 s. The two measure different things (whether the sound reaches the march, and how
     muffled it is when it does), and the tab's summary reports no reachability check, so both may hold; the tab's
     numbers are a model of placements, not the game. Filed as `AUDIT:ultra-1101:6-audio-scene-rest-6` (bug, LOW,
     LANE:backlog) with both verdicts in its evidence and note; its acceptance is the tie-break, a probe in the real
     mount order that either closes it false-positive or shows the muffle. Item 462's "has no row" is superseded here;
     its counts were true when written and are not rewritten.
   - **Two ranking differences, left as the rows have them.** The 4-ui tab would fix 4-ui-1, 4-ui-3 and 4-ui-4 first,
     because the heartbeat under the death screen plays on every death; 4-ui-4 stays LOW by the harm call of item 462 and
     the lane owner may re-rank it. The 5-render tab kept finding 2 at `normal` for misdirecting the player in combat;
     the row stays LOW.
   - **The cap question is unchanged.** The 5-render tab could not tell whether the 25 verified reports sit inside the
     10 delivered, which fits item 461's count caveat and does not answer `AUDIT:ultra-1101:cap-question` (Kevin's).

   Rows: 2 added, 8 notes appended, 0 closed. Gates: registry-harvest, registry-dedupe, registry-append-only over
   `origin/main..HEAD`, doc-currency, opsec-scan and lint, run on the branch before the push.

---

## 2026-11-01 (W3-A PR A) — [LOOP] one feedback grammar: danger at the edge, contact on the lit band, magic as a solid core

The W3-A task script's PR A (F0-F5), a re-cut at `eff58e9a` of the feedback-grammar plan
(`docs/superpowers/plans/2026-10-27-crafty-feedback-grammar.md`) M1, M2, M4, M5 and M7, and the siege plan's Move E.
Branch `feat/w3a-feedback-grammar`. Each call below was checked against the code at HEAD before it was taken.

420. **The lookbook's combat stage holds a moment with the world's own freeze, not a `lookHold` field.** The plan had
   `mobLook` honour an `entity.lookHold` set by the seam and the DEV e2e. `stage()` (render/lookbookSeam.js, the lazy
   chunk) instead freezes the world through the store's `triggerHitstop` (so the AI worker neither moves the mob nor
   replaces its windup), plants `windupUntil` at 0.8 of the ramp on the world clock, and renews `lastHit` every frame
   for a hit: the game code reads only the fields it already reads, and no test branch sits in the per-frame look.
   The same stage holds a spell (`moment: 'cast'`, the spell system's deterministic cast) and an elite's rank. Draws
   per frame are counted at the WebGL context (`scripts/visual/_glDrawCounter.mjs`), because renderer.info resets at
   every render() call and postprocessing calls it once per pass.
421. **Danger is an edge colour, plain danger red, and the rim runs at every tier.** A windup carries the ink outline
   and the rim's colour from rest to `#ff3a00` over the ramp squared; the rim's strength and power do not ramp (a box
   face has no fresnel edge, plan amendment 2) and the body takes no emissive. The plan's M1 option (b) is taken: the
   edge is about sRGB (0.95, 0.25, 0.13) through the Neutral tone map and does not bloom, so the eyes stay a mob's only
   glow. The 4 Hz throb is dropped (the monotonic ramp tells the timing). `charRim` is deleted from `render/quality.js`
   (MobModel was its only reader); the iPad's low tier now draws the rim. The plan's mood rim (moon-white at night) is
   not built: at HEAD `moodRef` is the storm and obsidian overlay, not night (`render/mood.js` header).
422. **Contact is about 70 ms of white on the band facing the key light, a white edge, and a 50 ms squash.** It
   supersedes the 300 ms whole-body flood (colour and emissive). FLASH holds 70 ms and at least one drawn frame; SQUASH
   50 ms and at least two frames, through 1, 0.6, 0.25, so it lasts about 50 ms at 120 Hz and at 30 fps. The flash is a
   term in the one rim program (`characterStyle.js FLASH_GLSL`), identity at 0 for the beast and the props. Reduced
   motion keeps the white edge only. MobModel writes uniforms only, so `render/mobFlash.js` (the authored-colour
   restore the flood needed), its gate and `flashableMaterial` are deleted, and an authored emissive survives. The key
   light is the moon at night (`render/keyLight.js`), so the plan's elevation fallback is not needed.
423. **Only a hostile's eyes glow, and identity costs no draw.** The eyes are red lifted to 1.25x the bloom threshold
   by the bloom pass's own luminance weights (`render/hdrGain.js`, which is now the one home of `BLOOM_THRESHOLD`;
   GameScene passes it). The plan's part tones were a flush plate and a strap box per mob, each a mesh and an ink hull
   on every mob of a 40-mob night; they are instead a lighter head and darker legs on parts every mob already has
   (`render/mobTones.js`), so the unit adds no part, draw or program.
424. **A spell is a solid core ringed in ink under one additive glow.** The silhouette is now opaque and
   depth-written with the mobs' ink outline; the two additive white-hot core spheres (depthTest off) and the bolt's
   five white filaments are deleted, and the bolt, the sigil's accent ring and its motes are solid. Mounted draws per
   projectile: fire 5 to 4, ice 5 to 4, lightning 15 to 13, arcane 12 to 11 (F4's commit body says fire 5 to 5: wrong,
   the mounted count is 4). Lightning's strobe lever drove the deleted core's opacity, so the bolt no longer flickers.
   The plan's merged bolt and sigil geometries and puff pool are row 49's draw cut, and the impact grammar (plan M6: a
   mark, a ground ring, voxel debris) is deferred to `MASTERPIECE:one-feedback-grammar/c`.
425. **Elites wear an ember crest and the captain a banner (Move E), drawn by MobModel from `entity.elite`.**
   `src/night/eliteLook.js` returns the boxes in mobFeatures' vocabulary, each with no shadow; MobModel imports it
   directly (index), because it reads `entity.elite` at mount; PR C's spawner sets the field. The crest's emissive is
   `#FF7A2A` at 0.6, under the bloom threshold, so it reads at night without competing with the eyes.
426. **PR A nets fewer index bytes than main.** 647,757 B on main; F0 +12, F1 +13, F2 +383, F3 +335, F4 -1,651 (the
   deleted layers and duplicated material props), F5 +624: 647,473 B, 284 B under main, against the task script's
   400 B allowance. The ceiling (652,500 B) is unchanged.

**Round 2, the fix round (from `a6529156`).** Main `3442443d` (lane L13 part 1) merged at `7230ea86`. Each finding of
the two round-1 reviews below was fixed with its gate red first, or filed. Frames: `lookbook.mjs --sets combat`, on the
production build, M3 Max, Chromium 1280x800 at high and WebKit 1180x820 and 820x1180 held at the iPad's low tier.

427. **The ice crystal carries an identity index, so its ink builds the hull from its own copy.** drei's `<Outlines>`
   builds its hull with three-stdlib's `toCreasedNormals`, which copies an indexed geometry but rewrites a non-indexed
   one's normals in place, and disposes it on unmount. The shared `ICE_SHARDS` was non-indexed, so the first cast
   smoothed it for the session and each projectile that ended disposed it under the live ones. Every face still owns
   its three vertices, so the crystal keeps its per-face normals. The cost is a 72-vertex copy per mounted ice
   projectile, freed with it, which the other inked cores already paid. `angle={0}` was the alternative: no copy, but a
   hull pushed along flat normals splits at every facet. Gate: `spell-grammar-gates`, two ice projectiles in a row.
428. **The mounted MobModel is gated.** Round 1's dynamic review cut seven wires in MobModel at once and the unit suite
   stayed green. `mob-model-look-gates` mounts the real MobModel through R3F's reconciler with drei's real Outlines and
   reads what a frame writes: the flash and white edge, the 50 ms squash, reduced motion, the head and leg tones, and an
   elite's boxes, drawn with no shadow and with their glow. It sees writes, not pixels; the e2e reads the pixels.
429. **An elite's crest takes a seat per type, the husk wears its own crown in ember, and a nametag stands over the
   whole silhouette.** It supersedes item 425's one placement, which put the crest's side boxes inside a duskhound's
   ears, its centre through a skitterling's antennae and the whole crest into the husk's and the moss brute's crowns,
   and ran the nametag's bar through a zombie's crest. The crest is sized to the head's width (the zombie's is
   unchanged) and seated in fractions of the head: behind the duskhound's ears with its side boxes between them, behind
   the skitterling's antennae, on the moss brute's moss crown. The husk's charred crown is a three-spike crest at the
   same spot, so an elite husk wears it in ember (`crest` in `game/mobFeatures.js`) and adds no boxes. The seat is a
   table, not a derived rule, because the derived one (raise the crest over whatever it would hit) floated it 0.44 m
   over a skitterling's head; `elite-clearance-gates` holds every hostile type in `MOB_TYPES` to it at both ranks: no
   placed box inside the mob's own boxes, head or body (an exact oriented-box test), each crest box resting on the mob
   and showing half its face from the front. `eliteLook.nametagY` puts a tag 2.4 m over the mob's origin, or higher so
   the bar's bottom is 0.2 m over the silhouette's top. An elite's tag rises over its crest and banner; three plain tags
   move too, a zombie's (2.4 to 2.56 m: its bar stood 0.04 m over its head), a moss brute's and a husk's (they stood
   inside the head and the crown). Every lower mob keeps 2.4 m. Evidence: `elites-noon-before-top-after-bottom.jpg`
   and `elites-midnight-ipadlow-after.jpg`.
430. **A removed mob stops being drawn at once.** miniplex 2.0.0 emits `onEntityRemoved` before it takes the entity out
   of the query (`@miniplex/bucket` remove), and `useEntities` (`systems/_npcShared.js`, with a copy in Nametags)
   snapshot the query at that event. So the last mob removed stayed mounted, frozen in its last pose, until the next
   spawn or removal: the round-1 static review's staged captain still drawn after `unstage()`, an open question then.
   The hook now filters out the entity the event names, and Nametags uses it. In play a killed mob has shrunk to 0.001
   scale by the time it is removed, so the leftover was mostly unseen; a despawn, a clear or a bind left a full-size one.
   Item 431's first run found it: on every target the frames after its control and after the draw count's removals
   (9, 5 and 5) were invalid for a mob model in view with no live mob; the cause was read in miniplex's remove, and the
   next run, with the fix, called them all valid.
   Gate: `use-entities-gates`, the real hook over a real miniplex world.
431. **A combat frame holding anything the stage did not put there is invalid, and each run proves the check can see.**
   `unstage()` ends a staged cast through the spell system's own clear (`endDeterministicCast`) while the world is still
   held; round 1 let the projectile fly on into the next staged mobs. The seam's `frame()` reads what is drawn in the
   game camera's view within 60 m, in the scene it finds among R3F's roots: MobModel groups (named `mob`), each matched
   to its live mob or reported with none, and spells (projectile heads and impact pops, named `spell`). The two names
   are production code for a test tool; they cost no work per frame. The combat set clears hostiles within the same
   60 m (a first run cleared 40 m, and on WebKit 1180x820 all 22 frames of the day cycle went invalid for ambient mobs
   40 to 60 m out behind the trees), waits out a new hour's toasts, and judges each frame with `combatVerdict`: an
   unstaged hostile or a model with no live mob in view, a staged mob hurt or not in view, a spell count other than the
   stage's, a cast still drawn after `unstage()`, a toast up, or a mob left behind. Each round-1 contaminated frame is a
   fixture in `lookbook-combat-verdict-gates`, invalid naming its cause, beside four clean ones that stay valid. Each
   run shoots a control first, a zombie spawned through the store beside a staged one, and calls every frame of the
   run invalid unless the check names it. The second run: the control seen on all three targets, 132 of 132 frames
   valid; the elite run after it, 72 of 72. Blind spots: a damage number over a mob that has died, a passive mob walking in, and anything inside the view
   but hidden from the camera (the check reads the frustum, not occlusion).
432. **The lit band has its own hit frame.** The round-1 hit frames faced the zombie head-on with the key light behind
   the eye, so every visible face went white. `hit-zombie-lit` looks along the first of five headings where the best
   turn of 30 to 60 degrees (`litTurn`, the e2e's rule, from the key light's direction, which the seam now reads) leans
   one visible face at least 0.3 toward the key light and the other away: by day heading 90 and a -30 degree turn
   (split 0.66), by night under the moon heading 120 and -30 (0.65). The lit front whitens and the side in the shadow
   band stays green, paled by the white face's bloom (sampled sRGB 140, 171, 148 beside the front's 242, 242, 242 at
   noon on Chromium), on every target (`hit-lit-noon-after.jpg`, `hit-lit-midnight-ipadlow-after.jpg`).
433. **The core sphere's dead levers are gone.** `spellMotion`'s `coreIntensity` (the strobe's on/off, still asserted by
   its test after the bolt stopped flickering) and `innerScale`, and `ENERGY_PROFILE`'s `coreScale` and
   `coreIntensity`, had no reader after item 424; they go with their assertions, and the strobe's test asserts its live
   lever instead, the bolt's scale snapping between two sizes. Four comments made stale by PR A say what the code does.
434. **A killing blow shows no contact (it predates PR A; filed).** MobModel's dissolve branch returns before the look
   is written, so the killing hit never flashes, and a mob killed mid-windup keeps its heated edge (#c32c0b on the
   mounted model) through the dissolve. Row `REVIEW:w3a-pr-a:killing-blow-no-contact`, LOW, lane W3-A.
435. **An ember elite costs about six more main-pass draws, measured.** Four zombies, then four ember-elite zombies,
   staged 6 m out, draws counted at the GL context over three runs: Chromium +6 each time (13.5 to 19.5 per mob, then
   22 to 28 twice), the crest's three boxes and their three ink hulls, the count the boxes predict (the per-mob figure
   itself swings between runs with the frames that carry a shadow render). WebKit at the low tier read +10, +10 and +6
   at 1180x820 and +5 each time at 820x1180, whose narrower view may drop the side mobs; the two +10 readings are not
   explained by these runs. A captain's banner adds two boxes and two hulls more; an elite husk adds none of its own
   (item 429). No elite box casts a shadow.
436. **Bytes.** Index 649,228 B at this round's head, against main's 649,123 B (`3442443d`): PR A now nets +105 B,
   this round +389 B (the seats and the tag height +, the cast's end and the two names, less the dead levers and
   Nametags' copy of the hook). The ceiling (652,500 B) is unchanged.

---

## 2026-10-31 (lane L13) — [LOOP] the stuck-in-solid remainder: a wall is not ground, rays see what was just placed, a dug spawn corner does not loop, a sunk capsule is stood clear, the resume hold is time

Lane L13 (`fix/l13-stuck-in-solid`, from `eff58e9a`) took the rows the audit lanes left in the class Kevin's invisible box
started, player harm first. Each bug row's gate went red before its fix. The per-frame rows' gates (the wall climb, the
resume hold, the respawn loop, the capsule sunk with its centre in the air) drive the real Player on real Rapier at 60 and
120 Hz; the build ray is a per-click query, gated on its module with a fixed camera and, since round 2, in the mounted
world without the Player (item 398). Items 397 to 402 are the second review round.

390. **A wall is not ground; no wall-jump is kept.** The controller's `computedGrounded()` (rapier3d-compat 0.19.2) counts
   any contact whose normal points up by more than 1e-3, and a capsule within its offset of a trimesh wall gets such
   contacts on some frames: each re-armed the jump and set the fall to the glue's speed. `game/grounding.js`
   `supportedGround` keeps the controller's ground only where a walkable face bears the capsule: a contact of the last
   sweep with `normal1.y` at least cos 45 (the climb angle, one constant with `setMaxSlopeClimbAngle`), or, on a
   grounded frame whose sweep met no floor (the snap: 4 of 240 grounded frames on a flat walk at 60 Hz, 13 of 480 at
   120, measured), a capsule cast straight down within twice the offset that meets one. It removes grounds and never
   adds one; the jump, the coyote time, the jump buffer and the glue all read it, so the row's question (keep a
   wall-jump, or require an upward contact) is decided for the upward contact. A brink borne only by an edge more than
   45 degrees from up is not ground (the player drops off it; within 45 it is). *Proof:* `player-wall-ground-gates`
   at `eff58e9a`: Space held into a six-high face rose 2.95 / 2.98 m against a 2.35 / 2.30 m jump, the one-column
   shaft was climbed out, a second's fall 0.03 m off a shaft's middle covered 7.4 m of open air's 15.7; green after.
   `grounding.test.js` pins the cast (flat walk, shaft, brink). Commit `45cdd30f`. The chaos gate does not see this
   rule (item 401).
391. **The build ray sees a cell placed since the last step.** `castBuildRay` moved verbatim from Terrain.jsx to
   `world/buildRay.js`, where a unit drives it with no terrain worker, and its `castRayNearest` takes the nearer of the
   world's hit and each `placedCells.unindexed()` collider's own ray hit; the target outline and the chaos harness use
   it. Not changed: the mob floor probe. *Proof:* `build-ray-unindexed-gates` (two clicks between one pair of frames; a
   trimesh made since the step), red on the old query. Commit `7be92e39`. Terrain.jsx's own two call sites: item 398.
392. **The resume hold is 10 s of time** (`RESUME_PROBE_MAX_SEC`), counted by the frame's step as the origin spawn's is:
   600 frames had been 5 s at 120 Hz, under the origin spawn's 6. *Proof:* the real Player held 9.967 s at 60 Hz and
   4.983 s at 120 Hz before, within two 60 Hz frames of each other after. Commit `c6f78430`.
393. **When the spawn's wait runs out it stands on the nearest ground that answers before it drops blind**
   (`spawnSpot`: the column nearest the corner within 8 m whose ground answers above `PROBE_MIN_Y`). A column in a chunk
   that has not streamed in answers nothing, so no player is stood on ground that is not there. *Proof:* with the
   corner's four columns dug out of the world, a minute idle reset the player 9 times before and once after, at 60 and
   120 Hz. Commit `38ec3ebc`.
394. **The stuck-in-rock watch reads the capsule's lowest point when its centre reads clear**, 0.02 m above it (a standing
   capsule keeps it 0.05 m over its ground). Measured first, because the row was found by reading: off the corner the
   controller frees a body sunk inside one chunk's face and one 0.4 m deep across a border; across the border of chunks
   0_1 and 1_1 with the centre 0.05 m over the face it stayed 0.4 m deep for 2 s at 60 and 120 Hz. The chaos gate's I7
   stays 0 (and goes red when the point is read 0.1 m lower). Commit `b64b8349`.
395. **Instrument holes closed:** I1's tolerance is pinned by a 0.04 m case (`745483fe`); the placement gate's
   terminal-speed SETUP reads each frame's move from `nextTranslation()` and fails under 45 m/s (`990df4d9`);
   `mutate.sh` takes `--testTimeout=<ms>` (`fa86baf8`, proven by hand on a 25 s fixture: exit 3 without, RED with);
   the Player's sweep is cut at a cell placed between a stepped and an unstepped frame at 120 Hz, and deleting the
   `unindexed()` argument is red (`6389ff27`).
396. **What the lane leaves open, as registry rows in `LANE:L13-stuck-in-solid-remainder`:** the load hold over a dug
   column, the rim wedge, caves opening the world's floor, the per-mount edit numbering (cut-argument's second half),
   the spawn-wait gate reach (3.3 s and no-delta mutants, I6), the cut's `stopAtPenetration`, two first mounts in one
   window, the corner probes' span, the own-block escape rule, the Rapier panic after a wipe, the roar refund's e2e, and
   moveKinematic's unused lift. None was reached in this lane; the lane row stays open while they do. Mutants this
   lane's gates do not kill, each named in its commit: a resume hold one frame late, a stuck reading at another height
   inside the sunk part, a cut that stops at the collider instead of the offset short of it.
397. **Round 2: the respawn's fallback stands the body's own capsule clear of every column it reaches** (static review
   F1). `spawnSpot` read only the top of the column it stood the body over, and a beast form outlives the void guard's
   reset (`returnToSpawn` ends none): the bull's radius (0.62 m) and the golem's (0.5 m), with the controller's 0.05 m
   offset, reach past a column's 0.5 m half-width. It now stands the body as high as the highest column its capsule
   reaches there, as the load fit's column fallback reads them; a column that answers nothing adds nothing, and the base
   capsule (reach 0.45 m) stands where it did. The controller's offset is one constant, `CONTROLLER_OFFSET`
   (`game/kinematicMove.js`). *Proof:* the reviewer's probe in a throwaway copy of `082ea2ed` read the bull 0.12 m into a
   column a block higher and the base capsule 0.1 m clear of it; the real Player in the bull form, the corner dug out and
   that column beside the nearest one, was stood 0.12 m into it at 60 and 120 Hz with the form still on when the wait ran
   out (`player-placement-gates`), green after with one reset. `spawnPlacement.test.js` holds every shape beside a higher
   column on each side, the column's middle and the probe floor, so round 1's surviving mutants S5 and S7 die now.
   Commit `514bb445`.
398. **Terrain.jsx's wiring of the ray that sees a just-placed cell is gated in the mounted world** (static F2, dynamic
   mutant B6). `verb-ledger-gates` already mounts the real MinecraftWorld with its worker stood in for, so the reason
   item 391 first gave, and the row's note repeated, that vitest cannot import Terrain.jsx, was false (both corrected). A
   row there places a block and, before any world step, reads the world's own query on the ground (the presence check)
   and the click's ray and the outline on the new cell; either call site handing `undefined`, or a query that takes an
   unindexed hit only when the world's own misses, is red. Commit `091a6f65`.
399. **The grounding rule's "never adds a ground" is pinned, and the cost stories say what they cost** (dynamic G1,
   static F5). A frame the controller calls airborne stays airborne whatever its sweep met and the cast finds: a stand-in
   controller, since the claim is the function's; deleting the guard is red. rapier3d-compat 0.19.2's `computedCollision`
   builds a CharacterCollision unless handed one and six vectors for each collision it returns, so the scan hands it one
   object and the six vectors stay. `stuckInRock` scans two cells a reading in play, not one. Commit `6616818d`.
400. **Below 60 fps the resume hold is shorter in wall-clock time than it was, and that is kept** (static F8). The hold
   counts each frame's step, capped at 0.25 s (`game/frameStep.js`), so it is 10 s at every rate from 4 fps up: at 30 fps
   the 600 frames had been 20 s, at 4 fps 150 s; under 4 fps the cap makes it longer. That 10 s covers a slow worker
   streaming a far save's column is not measured; it is in `REVIEW:l4:gate-reach-round1`, beside the 6.5 s hold that
   passes every spec (dynamic R4).
401. **What the round-1 gates do not see, recorded where it is read.** The chaos gate does not see the grounding rule:
   with its harness back on `computedGrounded()` it stays green (dynamic H1); the rule's gates are
   `player-wall-ground-gates` and `grounding.test.js`, and `.claude/rules/physics.md` names them. The centre-clear
   closure (item 394) covers the vertical sink it measured; a capsule reaching sideways into the rock with its centre and
   lowest point clear is the open row `REVIEW:l13:sideways-reach-in-rock-unread`. The grounding rejects the rim contact
   steeper than 45 degrees that `REVIEW:chaos-play:rim-wedge` names, so that row's jump path is gone by design.
402. **The chaos gate on seeds 1 to 8 at `6616818d`**, run locally (CI plays seed 1; `CHAOS_SEED=<n>` plays another), the
   five chaos files on each seed:

   | Seed | Sessions (56) red | Walk-held readings | Deepest in solid | Denominator floors |
   |---|---|---|---|---|
   | 1 | 0 | 14 | 0.000 m | all met |
   | 2 | 0 | 14 | 0.000 m | all met |
   | 3 | 0 | 19 | 0.000 m | field-origin swapsRefused 1, floor 2 (SETUP) |
   | 4 | 0 | 16 | 0.000 m | all met |
   | 5 | 0 | 15 | 0.000 m | field-origin ownShellOut 0, floor 1 (SETUP) |
   | 6 | 0 | 26 | 0.000 m | all met |
   | 7 | 0 | 12 | 0.000 m | all met |
   | 8 | 0 | 16 | 0.000 m | all met |

   Every one of the 448 sessions holds I1 to I8 at 0. The two floor misses are this lane's: the round-1 dynamic review
   read the same two at `082ea2ed`, and at `eff58e9a` (with the head's new and changed gate files) seeds 2, 3 and 5
   passed every test. Which change moved the driver is not measured; the open row is
   `REVIEW:l13:chaos-floors-seeds-3-5`.

---

## 2026-10-31 (lane start-stall) — [LOOP] a Start clicked before the world is built: the stall named, the world-building screen a still caption, and the touch-tap flake's cause

Registry `REVIEW:l10:music-e2e-title-hang` (MED): on CI's software renderer a title Start clicked before the spawn chunk
was built stopped the page answering, and two Chromium processes grew to the runner's 16 GB (item 306). This lane found
what grows, where, and the one thing the stall needs on the page's side. Branch `fix/start-before-built-stall` from
`bd06dacf`, main merged at `5510db64` (registry v2). Every CI run below is a throwaway `probe/start-stall-*` ref (deleted
after), each with one change named in its commit; the local runs used the production build (`vite preview`) and the dev
server, one browser at a time from 21:00Z, on ports 4291 and 4292.

370. **What grows, and why.** Under the browser's own pointer lock (granted on the trusted Start click), Chrome's headless
   shell on Linux streams raw pointer updates with no input at all: 79 to 284 by the first read after the click, and where
   the page kept up it counted 2,000 to 9,400 a second (`pointerrawupdate`, runs 41245341682, 41247342006, 41248629909;
   what a page counts is what it dispatched, so a stalled page counts fewer). While App's loading screen covered the
   canvas in play (`bg-black/90`, `backdrop-blur-sm`, a spinning ring, a pulsing line), the page could not drain them: it
   stopped answering, the renderer and the browser process grew together at 10 to 44 MB/s each, and the GPU process
   stayed flat at about 0.35 GB (runs 41243964839, 41244013585, 41244702994, 41245341682, 41246539717). Of 64 pause
   samples of the stalled main thread (`Debugger.pause`, runs 41244702994 to 41246663123), 38 landed in input listeners
   (React's continuous-event dispatch among them), 14 in an R3F root's unmount (the title's canvas is the one that unmounts
   at Start) and 9 in the nametags' troika text warm-up. With the lock granted in the page instead of by the browser (no
   flood), 4 of 4 attempts kept answering with the browser flat (run 41245341682). With the chunk meshes held back 45 s
   after the lock, no chunk delivered, the stall came 8 of 8 times (runs 41246642496, 41246663123): it needs play entered
   with the world unbuilt, not the build's work. Under that hold the browser grew 757 to 1,859 MB in 75 s with the
   screen as it was (8 of 8, runs 41246642496, 41246663123), and 88 to 455 MB with it hidden or restyled to a still
   caption at the foot of the screen (7 of 7, runs 41247342006, 41248629909). Removing only the blur, or only the two
   animations, or only its pointer events, was not enough (1 of 2 stalled; 2 of 2 grew it 0.5 to 0.9 GB; 2 of 2 grew it
   1.2 to 1.6 GB). Why compositing a layer
   over the live canvas starves the input drain is not measured: two traces of it were lost (run 41242773722 past V8's
   string limit, run 41248095937 to a tracing end slower than its 90 s wait).

371. **The fix: the world-building screen is a still caption at the foot of the screen** (`src/App.jsx`, `ac6409ed`). Its
   two lines of text, unchanged, sit there with no background, no blur, no spinner, no pulse and no pointer events, and
   nothing covers the canvas. Its text shadow did not make it legible over the unbuilt world's bright fog (1.03:1 for the
   subtitle, measured on the frame), so it now takes the ink outline of type drawn on the world (item 380). Under the title it is covered, as
   before; a Start clicked before the world is built now shows the world streaming in behind the caption instead of a black
   screen, a look change to the loading moment, shot on the real GPU of item 372 (the before and after pair is item 380's).
   A first fix, `7179f88f`, kept the full-screen layer opaque and still. An earlier form of
   `tests/e2e/start-before-built.spec.js` (a 600 MB bound over 75 s and a check that the world builds by 135 s, both
   restored by item 378) failed it 2 of 6 times (runs 41249827128, 41250492755: the browser +659 MB once, the world unbuilt
   135 s after the click once), against 4 of 4 for the caption there; at n=6 against 4 the two shapes' growth ranges
   overlap (186 to 659 MB, 88 to 545 MB), so the choice rests on the failures, not on separated ranges. Pacing the canvas at
   10 fps under it made it worse (1 of 1, +2.4 GB). The caption is not a full cure: under the same flood its page still
   stalled and grew in 1 of 20 attempts (run 41254347251: the browser +978 MB, all its processes +3.5 GB, 1 read of 6
   answered), and fell behind for the whole window with the browser bounded in 1 more (run 41253190798); counted by the
   reworked spec's arms, which also fail a page that stops answering or a world that does not build, the residual is
   item 378's. Why a page in play before the world is built drains worse than one after it is not measured
   (`REVIEW:start-stall:caption-page-still-stalls`, item 376). `tests/gates/static-gates.test.js`
   no longer exempts `App.jsx` from the design language's backdrop-blur ban, so a blur back on that screen reds it (S1 RED
   on the Tailwind class and the CSS property, the identity edit survived); a blur written as React's inline
   `backdropFilter` passed it until item 379.

372. **On one Mac's real GPU nothing stalled.** On Kevin's Mac (Apple M3 Max, ANGLE Metal, full Chromium in new headless mode, the
   production build), a Start clicked 1.6 s and 7.6 s after the title showed, before the world was built, held 60 fps and
   1.3 to 1.7 GB flat over 90 s with the old screen (the lock granted in the page); with the browser's own lock, granted
   there, the page received one raw pointer update in 35 s and stayed flat; and the caption, under the browser's lock with
   the world held 8 s, received one raw pointer update, held 60 fps and 1.3 GB flat and built the world when the hold
   ended. The flood is the Linux headless shell's, under its own lock; on that Mac a mouse at rest sent nothing. What
   this measured is one machine (an M3 Max), one browser (Chromium in new headless mode) and a still mouse, 3 runs: there
   the page met neither the flood nor the stall. It did not measure a mouse moving during the build (a 1,000 to 8,000 Hz
   mouse streams input at the order of CI's flood, 2,000 to 9,400 a second), Windows or Linux, or a slow GPU, so whether a
   player can meet the stall is not established; and the M3 Max heat in Kevin's original report is not explained by
   this. Nor is the growth bounded for a player: item 371's caption cut the stall under the held world from 8 of 8 to about
   1 in 20, and the gate's 4 GB brake (item 374) stops a test runner, not the product. The green run on `debfdfc2` itself
   grew all of the page's Chromium processes by 2,175 MB (run 41263751030), and no run of a Start clicked after the world
   is built gives the baseline that would say whether that is normal.

373. **Ruled out, each by its own run.** The music route (item 306). The debris pool before `83c5abd3` (all 200 bodies
   awake at one point under the world): main has the fix and still stalled, and main with the old pool copied in by a CI
   step stalled alike (run 41244181568). The canvas pace: `5a9158d4` paced a world being built at the title's 10 fps with
   no governor, and the stall came 5 of 5 (run 41246539717) and 4 of 4 under the hold (run 41246663123); reverted in
   `38ec3f9c`, its gates with it. Local runs never reproduced: macOS's headless shell grants no lock, and the full
   Chromium's lock streams no flood; CPU throttling (6x, CDP) and the old code (`f0c027e6`, item 306's control) were flat
   there too.

374. **The gate: `tests/e2e/start-before-built.spec.js`.** The title's Start clicked with a trusted mouse click at its box
   (no actionability wait), the lock the browser's own on a trusted gesture (L10's probe form), and the chunk meshes
   held 45 s after the lock, so play is entered with the world unbuilt on any machine (it sets what it reads,
   gate-authoring class 12). This is the spec as `e8b1acf7` committed it; item 378 reworks it. Over 90 s from the lock it
   reads the page every 2 s (4 s bound) and the browser process's RSS from `ps`; it fails when the browser grows more
   than 700 MB (the throwaway probe branches had committed 600 MB over a 75 s window, then 900 and 700; item 378 restores
   600) or all of the page's Chromium processes together more
   than 4 GB (a brake: the drained runs' renderer rose 1 to 1.5 GB), stopping the moment either does and crashing the
   renderer through CDP first so a runner is not run out of memory with its log (L10's runs ended so, and so did this
   lane's E1 twice, runs 41253190798 and 41253785118, before the brake), or when the page never answers. The bound sits
   between the caption's 88 to 545 MB (16 attempts, most flat by 75 s) and the old screen's 757 to 1,859 MB by 75 s (8
   of 8, still growing). Every verdict waits for the window or the bound, so a stalled page fails rather than skips (a
   SETUP read at the lock raced the lock's own event and scored the stalled page COULD NOT CHECK, run 41249479316; the
   hold's precondition is a count kept in the page, read on any answer). A browser that grants no lock, or a page that
   answered 90% of its reads and counted under 100 raw updates, skips as INCONCLUSIVE with the reason printed (the shape
   `tier-downgrade-reclaim.spec.js` uses; item 372's Mac counted 1 in 35 s). The answers and whether the world built are
   printed, not judged: under the flood even the caption's page misses many 4 s reads on CI, and in 1 of 12 of this
   spec's attempts on it it answered 1 of 8 for the whole window with the browser bounded (+406 MB, run 41253190798). It
   does not separate the full-screen opaque, still screen of `7179f88f` (186 to 659 MB, inside the bound; E2 survived,
   run 41253190798). Proof, on the runner through `scripts/dev/mutate-e2e.sh` (nothing mutated committed): with the
   screen as it was (E1) the spec went RED 3 times in 3 (runs 41253785118 and 41254347251: the browser +771, +1,068 and
   +725 MB, each stopped at the bound); the identity edit (E0) survived in run 41254347251, and in run 41253785118 it
   scored COULD NOT CHECK (exit 3: its 2 answers of 9 missed the held state, on the earlier spec `4e36364b`), so it
   survived once, not twice; on the caption the spec passed 7 of 8
   attempts, the eighth the residual stall of item 371. In CI it runs with the suite's two retries, so the residual
   reaches a red run only when three attempts in a row meet it, and `flaky-report` names it when a retry passes.

375. **Two commit messages corrected here.** `5a9158d4` stated that the page saturated because the canvas drew at the play
   pace under the loading screen; item 373 refutes it, and `38ec3f9c` reverts it. `7179f88f`'s "neither the blur alone nor
   the animations alone were enough to remove" means: removing only the blur, or only the animations, did not remove the
   stall; and its shape was not the last (item 371).

376. **What is left, as a registry row and a question.** On a local SwiftShader run with the world held, the tier governor
   stepped high, med, low while the loading screen was up, and the second decline settles the tier for the session
   (`render/tierGovernor.js`): a slow machine that clicks Start early may play at a tier its build chose
   (`REVIEW:start-stall:governor-samples-the-build`, LOW). And merging main the documented way failed the commit hook:
   registry v2's S6 reads `git rev-list HEAD`, and in a merge's pre-commit HEAD is the branch's own tip, so every
   `closedBy` sha main added read as no ancestor (18 of 37 registry-harvest tests red). The merge `4eb154a0` was made from
   main's side and the lane fast-forwarded to it; whether S6 should read `MERGE_HEAD` too was the registry v2 owner's
   (`REVIEW:start-stall:s6-in-a-merge-commit`, LOW), answered the same night by the registry S6 lane (item 369), and the
   lane's second merge of main (`f7228b13`) went through the documented way. The caption's residual stall under the headless flood is
   `REVIEW:start-stall:caption-page-still-stalls` (LOW, LANE:flakes). Its candidate fix is to take the pointer lock only
   once the world is built (the lock is what the flood rides on, and until then the player is held in the sky with nothing
   to look at), a change to the pointer-lock entry path that this lane did not make: the recovery overlay and the
   no-stranded-player invariant of `.claude/rules/input-and-pointer-lock.md` gain a dimension, and that wants its own lane
   and gates. The lane's QUESTION.md asks the command session for that ruling.

377. **The touch taps the caption broke, and the harness input under them.** PR #76's CI (run 41255314244, two attempts)
   failed `panels.spec.js:83`, the phone tray tap, 6 of 6 and the touch Pause tap of `pause-freezes-world.spec.js:217` 3
   of 6, each with a canvas over the button, against about 2 of 7 first attempts of the tray tap on other PRs that
   night. An A/B on the runner put it on this lane (run 41259967132): with main's loading screen restored the tray tap
   passed 4 of 4 and the touch Pause 4 of 4; with the caption, 0 of 4 and 2 of 4. Run 41261223279 named the mechanism:
   with the caption the world-ready auto-lock (`App.jsx`, 100 ms after the spawn chunk) was granted and the game started
   under it, and the tap's `pointerdown` carried clientX/clientY 0,0, where Playwright's hit-target check found the
   canvas and blocked the tap on every retry; with main's screen the same request was refused (`pointerlockerror`) and
   the tap landed 3 of 3. Pointer Lock 2.0 refuses a request made without transient activation unless the document
   released a lock itself with `exitPointerLock()` (`requestPointerLock`, step 3, w3c.github.io/pointerlock, read
   2026-11-01); the grant came from Playwright running every `page.evaluate` as a user gesture (`frame-cap.spec.js` says
   how that was found), and the caption builds the world sooner (the lock asked for 7 to 10 s after load, against 13 to
   20 s), inside the activation the test's own wait had opened. So the flake those rows chased was never the title's
   canvas, and the fix is the harness's: `tests/e2e/_fixtures.js` now refuses, in a touch context, a lock asked for
   outside a trusted input event (`4fc42a61`; desktop contexts unchanged). That is stricter than a conforming browser,
   not the same: transient activation outlasts its event by a few seconds, and PR #76's dynamic review measured Chromium
   granting a lock asked for 1 s after a real tap where the fixture refuses it (its arms D and DF), so the touch suite
   cannot show a touch Chromium taking the world-ready auto-lock after a real tap; item 381 rules on that path. Proof, run
   41262061859 on that tree: the tray tap 6 of 6 and the touch Pause 4 of 4 with it, the tray tap 0 of 3 with its
   install line removed (the touch Pause passed 2 of 2 there: it is a race), and every other Chromium touch spec 26 of
   26 with it. `4fc42a61`'s trailer says the touch Pause went 0 of 4 in run 41259967132; it went 2 of 4 there, against 4
   of 4. The four flake rows (`REVIEW:w2d:pause-tap-title-canvas`, `REVIEW:e2e-flakes:panels-phone-tray-tap-timeout`,
   `REVIEW:e2e-flakes:hud-at-rest-tracker-tap-canvas`, `REVIEW:e2e-flakes:touch-gear-tap-canvas-intercepts`) get the
   finding and stay open for their acceptance's ten clean CI runs. Not measured: a real touch browser that has a pointer
   (a Chromium tablet with a mouse) after a Start before the build.

378. **The gate reworked: it judges the page and the world, not memory alone** (`tests/e2e/start-before-built.spec.js`,
   `3ec4218f`; PR #76's static review findings 1, 2, 5 and 9, the dynamic review's optional fix). Item 374's spec failed only
   on memory and printed the answers and the world unjudged, so a page that answered once and then went silent for the
   window passed (item 374 records one). It now fails on any of five arms, each printed with its number, and prints every
   2 s sample (the page's answer, the browser's and all of Chromium's RSS, the pointer updates, the lock, the world):
   - **bound:** the browser process +600 MB over its value at the click. 600 is restored: the throwaway probe branches
     committed 600 over a 75 s window, then 900 and 700 as the window grew to 90 s, with no measured reason (`git log -p`
     of the probe refs `32f11347` to `8e7e4819`). The caption's browser rose at most +545 MB in any attempt measured
     (with the listener below), the outlined caption's +132 to +364 MB over 27 attempts (runs 41269336217 to
     41270557952), and the old screen stopped at +609 to +895 MB on its first sample past 600 (runs 41268462804 to
     41270557952), so 600 holds the caption with room and keeps the old screen red;
   - **brake:** all of the page's Chromium processes +4 GB together (unchanged);
   - **answers:** the longest span with no answered read over 30 s, from the answer before it to the answer after it, or
     from the click, or to the end. Judged in time, not in reads: with `page.waitForTimeout` pacing the samples, each
     missed sample took 12 s while a mutant held the page's main thread and a 45 s silence read as 3 missed reads (run
     41268462804); Node's own timer paces them now;
   - **late:** the browser's floor (its lowest sample, over the reads the page answered) over the window's last 15 s
     more than 50 MB above its floor over the 30 s before. Floors, not peaks: a page that falls behind for one sample
     spikes the browser and gives it back (+275 and +328 MB, then +42, run 41268462804), which a max-minus-first measure
     failed 6 of 9 plated attempts on; a leak raises the floor. Over answered reads only, and not judged when a span
     holds none, because a missed read finds the browser at a spike (item 383);
   - **world:** the spawn chunk not built 135 s after the click (the hold ends 45 s after the lock).
   A browser that grants no lock, or streams no flood, is INCONCLUSIVE: a printed skip on a workstation, a failure on CI
   (`process.env.CI`), so the gate cannot go dark there if CI's Chromium stops flooding. The flood is counted from the
   game's own `pointermove` events (each carries the raw updates coalesced into it), not from a `pointerrawupdate`
   listener the shipped page lacks (static finding 5). That listener is not free: added back on the runner, the outlined
   caption's page failed 4 of 4 attempts on the answers arm (silent 35 to 66 s; once also the bound, at +745 MB),
   against 0 of 8 without it (run 41269336217), so item 374's spec, and the probes behind items 370 and 371, loaded
   the page they measured (item 382). That run also printed the late arm failing three of the four at +63, +99 and
   +79 MB; those floors were missed-read spikes (none of the four had an answered read in the window's last half,
   item 383), so the verdict rests on the answers arm.
   The hold now delivers its held meshes in order ahead of any later one, as its comment said (static finding 9).
   The thresholds against what the outlined caption showed in 27 green attempts on nine runners (runs 41269336217 to
   41270557952): the browser +132 to +364 MB (600), the longest silence 4.9 to 23.7 s (30), the floor's rise -24 to +39
   MB (50), the world built 50 to 68 s after the click (135). The silence and floor bounds have the least room. (The floor
   range is the arm as `3ec4218f` had it; item 383's arm reads -17 to +39 MB over 40 outlined attempts.)
   On any failure the spec now kills every Chromium process of the test from Node before raising it. Item 374's spec
   crashed the renderer through CDP instead, and that did not hold: in run 41269336217 one old-screen attempt filled its
   runner and the runner was shut down with nothing printed, and in run 41270116196 the bound failed at +895 MB, the
   page then went unanswered, and the largest chrome-headless process on the runner grew to 11.5 GB while Playwright
   waited to close it, until that runner was shut down too (the log's process list names no role, so that process is not
   shown to be the browser rather than the renderer). Proof of the spec as `3ec4218f` committed it, on the runner through
   `scripts/dev/mutate-e2e.sh` (run 41270557952, the spec byte-identical; nothing mutated committed; its late arm read
   every sample until item 383), each arm red by a mutant that reds it alone: the old screen RED 3 of
   3 on the bound (+672, +657, +609 MB, each runner keeping its memory and its log); a page that releases the lock 20 s
   after it and blocks its main thread 60 s RED on answers alone (60.2 s silent); 16 MB/s of blobs from 60 s after the
   lock RED on late alone (the floor +84 MB, the bound +364 MB passed); a spawn chunk that never marks the world built
   RED on the world alone; Start with no lock RED as INCONCLUSIVE on CI; the identity edit SURVIVED; the outlined
   caption passed 8 of 8. The earlier drafts met the same mutants in runs 41268462804, 41269336217 and 41270116196 with
   the same verdicts, except where this item says why a draft changed: round 1's identity edit went red on the
   peak-based late measure, round 1's 45 s silence passed as 3 missed reads, and round 1's 4 MB/s blob leak raised the
   floor only about 1.8 MB/s and passed, so the late arm's reach starts above that rate.

379. **The design language's blur ban sees React's inline spelling** (`tests/gates/static-gates.test.js`, `1d95958a`; the
   dynamic review's finding 1). The S1-C gate matched `backdrop-blur|backdrop-filter`, so `style={{ backdropFilter: ... }}`
   passed it, which falsified its own comment and item 371. One case-insensitive pattern now covers the Tailwind class,
   the CSS property and the inline key (`backdropFilter`, `WebkitBackdropFilter`) in the ban, the App.css check and the
   reporter. Proof (`scripts/dev/mutate.sh`, 8 tests): the caption with an inline `backdropFilter` SURVIVED the old
   pattern and is RED on the new; `WebkitBackdropFilter` RED; Tailwind `backdrop-blur-sm` RED; an identity edit SURVIVED.

380. **The caption's look: an ink outline, not a plate** (`src/App.jsx`, `d8b50695`; static finding 7, dynamic finding 4).
   On the real GPU (production build, Chromium new headless, Apple M3 Max ANGLE Metal, 1280x800 at DPR 2, Start clicked
   before the world was built, the lock held), the bare caption read 1.03:1 (subtitle) and 1.78:1 (headline) against the
   unbuilt world's pink fog, and 1.38:1 and 2.84:1 against the soft shadows around its glyphs. A first fix, `30fef172`,
   set it on a small solid plate in the design language (bg-panel, ink border, hard offset): 9.53:1 and 12.99:1. On the
   runner the plated page measured worse than the bare caption: the browser +116 to +337 MB and the longest silence up
   to 26.9 s over 8 attempts, against +35 to +57 MB and at most 8.8 s over 4 (run 41268462804), which read at first as
   the plate's cost. `d8b50695` gives the caption the ink outline of type drawn on the
   world (`ui/onWorldText.js`, as the coin count and the target's nameplate have) and no plate: the subtitle's fill reads
   9.71:1 and the headline's 14.53:1 against their immediate surround (the non-glyph pixels within 2 device pixels),
   while the fog beyond stays 1.10:1 and 1.50:1, so the outline carries the legibility. On the runner the outlined page
   passed every arm in 27 of 27 attempts (item 378's numbers; runs 41269336217 to 41270557952, nine runners), the
   first 8, in run 41269336217, at the browser +168 to +295 MB and the longest silence 5.3 to 17.9 s. Those runs do not
   separate the plate from the outline: the bare caption's 4 attempts ran on one runner of an older image (20261015),
   the plate's 8 on two runners and the outline's first 8 on two more, all of the newer image (20261021), and the plate
   and the outline measured alike there. So `d8b50695`'s message overstates when it says a covering element, even a
   small one, costs the drain: these runs do not show that. The outline is kept because it adds no element over the
   canvas, where items 370 and 371 found a covering layer to starve the drain, and because it is the design language's
   own convention for type on the world. The lookbook's sets cannot show this state (each enters a built world), so the
   before and after pair is a lane probe's: `docs/superpowers/masterpiece-2026-10/evidence/start-stall/` (both frames, both crops at full
   resolution, the plate's frame, and `contrast.json` with the method). The first probe run's after frame was shot
   under the Paused surface (the browser had released the lock) and its measure took the commonest colour for the
   backdrop; both were redone before any number here was read.

381. **Ruling: the world-ready auto-lock waits for a mouse or a pen** (the dynamic review's finding 3; the lane's QUESTION.md
   third question). App asks for the pointer lock 100 ms after the spawn chunk is built whatever started play, and on a
   touch Chromium that has the API a Start tap's activation can still be live then (the review's arm D: Chromium grants
   a lock asked 1 s after a real tap), and under that lock a tap's `pointerdown` carries 0,0 (arm L). The command
   session's ruling: the auto-lock asks only when the gesture that started play was a mouse or a pen (its
   `pointerType`), never touch, so an iPad with a trackpad keeps mouse-look and a touch player is not locked. This lane
   does not make the change, a product change to the input path that wants its own red-first e2e; it is
   `REVIEW:start-stall:touch-start-auto-lock` (LOW, LANE:W3-C, the first minute), accepted when a touch Start never
   requests the lock and a mouse Start on a touch-capable device still does.

382. **Records corrected before landing.** Items 371, 372, 374 and 377 were edited in place, since none had landed: 371
   no longer leans on a spec form that was not committed (its 2 of 6 is the earlier spec's) and records the text
   shadow's failure; 372 no longer says a player meets neither the flood nor the stall, or that the growth is bounded,
   and says what was measured (one M3 Max, Chromium in new headless mode, a still mouse); 374's identity edit survived
   once, not twice; 377's fixture is stricter than a conforming browser, not the same. The fixture's comment says so
   too (`f4bef2b3`). The registry's `REVIEW:start-stall:caption-page-still-stalls` and the closed
   `REVIEW:l10:music-e2e-title-hang` carry the narrowed claim about players. Static finding 5 changes the record most:
   items 370, 371 and 374 measured the caption under a `pointerrawupdate` listener the shipped page lacks, which item
   378 shows loads the page, so the caption's 88 to 545 MB and its residual stall of about 1 in 20 describe the page
   under that listener, not the shipped page; the old screen still fails without it (item 378).
   `REVIEW:start-stall:caption-page-still-stalls` stays open on its acceptance with that recorded. One commit message of
   this round overstates: `d8b50695`'s, on what the plate cost (item 380 says how). The next round's corrections are item
   383's.

383. **Fix round 3: the late arm reads answered reads only, the blur ban reads every stylesheet, and the records are
   corrected** (`tests/e2e/start-before-built.spec.js` `f5c8b67c`, `tests/gates/static-gates.test.js` `c9199dfd`; PR #76's
   round-2 reviews: the dynamic review's F1 to F5 and the static review's findings 3 and 4). This round changes tests and
   records only; `src/App.jsx` changes a comment.
   - **F1, the late arm no longer calls a missed read a leak.** It took each half's floor over every sample, and a read that
     misses finds the browser at a spike (13 to 358 MB above the attempt's answered floor in 76 missed samples of the green
     outlined attempts, runs 41269336217 to 41271264457). So a span whose samples all missed read a spike as its floor:
     plate-a attempt 3 of run 41268462804 failed at +210 MB on one missed sample, and the head's own green run
     (41271264457) had one answered read of three in its last half. Both floors are now taken over the reads the page
     answered. *The first form did not hold.* It compared the last 15 s with the 15 s before and read "not reached" when a
     half held no answered read. On the runner (run 41274837477) the slow-leak mutant was RED once (+108 MB) and then
     SURVIVED: the leaking page missed four reads in a row (63 to 81 s), so its reference half held none, the arm read "not
     reached", and the answers arm saw 27.1 s of silence against its 30. The arm of `f025bc5b` reads -52 MB on that run as
     well: the missed reads' spikes hid the leak, which only answered reads see. So the reference is the 30 s before the last
     15 s (45 to 75 s), where the same run holds answered reads and reads +147 MB. A span with no answered read is "not
     reached" and not failed, because a page silent that long is the answers arm's; a span with no browser reading at all
     (ps found none) still fails the arm. What this leaves: a leak that also silences the page for the whole last 15 s, and
     for under 30 s, passes both arms; and the arm reads only the window's last 45 s, when the world is usually built (50
     to 68 s), so a leak confined to the unbuilt phase is held by the bound and the brake alone (static finding 1, not
     changed here).
     *Proof, on the runner* through `scripts/dev/mutate-e2e.sh` (run 41275275384 at `7e43b22c`, whose probe copy of the spec
     is byte-identical to the committed one; nothing mutated committed): the slow-leak mutant RED on late alone 3 of 3 (+145,
     +124, +85 MB; the bound +219, +342, +240 MB passed; answers and the world passed); the old screen RED on the bound
     (+623 MB); the page that releases the lock and blocks its main thread 60 s RED on answers alone (63.2 s silent; late
     not reached); a spawn chunk that never marks the world built RED on the world alone; Start with no lock RED as
     INCONCLUSIVE on CI; the identity edit SURVIVED twice (late +6 and -11 MB); the outlined caption passed 8 of 8 (late -7
     to +18 MB, the bound +108 to +398 MB, the longest silence 9.3 to 16.9 s, the world built 46 to 61 s after the click).
     *Rescore of the logs* (102 attempts from runs 41268462804 to 41275275384, to the 0.1 s the logs print, so a sample
     printed at 75.0 s may belong to either span; the spec's own function over the logs gives the same numbers, and the
     runs' printed values are the ones cited above): plate-a attempt 3 (+210 MB FAIL) is not reached; the raw-listener
     attempts 2 to 4 (+63, +99, +79 MB FAIL) are not reached, where the answers arm fails all four; the first form's missed
     slow-leak sample reads +147 MB FAIL; no other attempt changes its verdict, every slow-leak attempt that failed before
     still fails, and the 51 judged attempts of pages that are not mutants read -17 to +39 MB against the bound of 50 (the
     40 outlined attempts the same). The surviving margin is the one item 378 names: the floor bound has the least room.
   - **F4, the blur ban reads every stylesheet under `src/`** (`c9199dfd`). It read the JS and JSX files and `App.css`, so
     `backdrop-filter` in `index.css` passed (8 of 8), while item 379 and the gate's comment say a blur on the screen reds
     it. Its walk now covers every `.css` file and asserts it found at least the three there are. Proof
     (`scripts/dev/mutate.sh`, 8 tests): the blur in `index.css` SURVIVED the gate as it stood and is RED on this one;
     `-webkit-backdrop-filter` in `theme/fonts.css` RED; the old `App.css` and Tailwind-on-`App.jsx` checks RED; a walk that
     enumerates nothing RED; an appended comment SURVIVED.
   - **F5, noted.** The spec's flood counter calls `getCoalescedEvents()` on each `pointermove`, which nothing in `src`
     calls, at about 70,000 raw updates a second by its own count. Its cost is not measured; the risk it carries is a false
     red, never a false green. The spec's comment says so.
   - **Records corrected.** F2: item 378 and the spec said the browser grew to 11.5 GB, but the log lists only the largest
     chrome-headless process (the browser process read 1,010 MB at the verdict), so the 11.5 GB process is not shown to be
     the browser. F3: item 378's "floor +63 to +99 MB" for the raw-listener run were missed-read spikes (none of the four
     attempts had an answered read in its last half); that run's verdict rests on the answers arm, which failed all four.
     Static finding 3: item 371 still said the caption sits on a plate, and `App.jsx`'s comment and `contrast.json` still
     said the plate drained the flood worse, which item 380 withdraws; all three now say what item 380 says. Static finding
     4: `REVIEW:start-stall:caption-page-still-stalls` was a `flake` that was not player-visible, while its note says whether
     a player can meet the flood is not measured; it is now an `instrument` (a real mouse and a real GPU against the flood,
     not yet run), area `input`, player-visible, as the registry's other unmeasured-exposure rows are.
   - **Not changed here:** static finding 2 (the flood check asks whether the lock and 100 updates were ever seen, not for
     the whole unbuilt phase), 5 (the answers arm judges the longest silence, not the answered fraction) and 8 (the
     counter's work, F5 above), and the touch buttons that stay live during the build, which have no registry row yet.

---

## 2026-10-31 (registry S6) — [LOOP] a lane takes main in the documented way and the commit goes through: S6 reads MERGE_HEAD while a merge is unfinished

Found by the start-stall lane (`fix/start-before-built-stall`), which could not merge main without `--no-verify` and
asked whether S6 should read MERGE_HEAD. This amends item 364 (registry v2), whose S6 read "a sha that is not an
ancestor of HEAD".

369. **S6 counts a sha main added while a merge of main is unfinished, and nothing wider.** The way `CLAUDE.md`
   "Landing" takes main into a lane is a merge commit. A merge that stops, on a conflict or with `--no-commit`, is
   finished with `git commit`, and that commit's pre-commit hook runs the unit tests that import a staged file, among
   them `registry-harvest.test.js` when a staged `frontend/` file is one it imports. Those tests read the registry in
   the working tree while HEAD is still the lane's own tip. S6 read `git rev-list HEAD`, so every `closedBy` sha main
   had added read "not an ancestor of HEAD" (18 of 37 tests red on that lane, `49f36423` among them) and the only way
   through was `--no-verify`, a bright line: no lane could take main in that way. `liveReferences` now reads one
   `git rev-list HEAD MERGE_HEAD` when the merge-state file exists (`git rev-parse --git-path MERGE_HEAD`, the test
   `changelog.mjs` uses) and `git rev-parse -q --verify MERGE_HEAD` then resolves, so a sha counts when HEAD reaches it
   or the commit being merged does. It is not "any sha that exists": a sha on a branch the merge does not take in, a sha
   on no branch, and every sha after `git merge --abort` are still refused, and once the merge commits HEAD itself
   reaches the main-only shas. A branch or tag that is merely named `MERGE_HEAD` gives no allowance: the name lookup
   would resolve it, so the file is read first. Its message names MERGE_HEAD when one was looked at. A squash merge
   writes no MERGE_HEAD and an octopus merge reads only its first merged commit (both checked in a scratch repo);
   neither is how this repo takes main in. S6 still proves ancestry, not that a sha fixed its row.
   *Proof.* `tests/scripts/registry-harvest.test.js` builds throwaway repositories where `mainOnly` (on main, not the
   lane) and `stray` (on a third branch nothing merges) are known by construction: before a merge, mid-merge, after
   `--abort`, after the merge commit, and in a linked worktree. Against 5510db64's rule 3 of the 5 cases are red (the
   mid-merge, the abort control and the worktree) and the two strict ones green; with the arm all pass. Mutants, each
   run through `scripts/dev/mutate.sh`: dropping the MERGE_HEAD root, `rev-list --all` (any branch), `--all` only while
   merging, "the object exists" (`cat-file`), and reading `ORIG_HEAD` are each red; the S6 message without its
   MERGE_HEAD wording is red in `registry-clauses.test.js`; a comment-only edit stays green. *Lived.* In a temp clone, a
   lane cut from `bd06dacf` with one commit that touches no registry row took in 5510db64 (`git merge --no-commit`, then
   `git commit`, so the pre-commit hook ran): the commit was blocked, 18 of 320 related tests red, S6 naming `closedBy
   ea8612e7`. The same lane took in this fix's head `eec9818b` the same way and the commit went through (326 related
   tests passed, merge `3573d5e1`, `49f36423` an ancestor of HEAD after and of the lane's tip before it no).
   *Corrected the same day, from the static check.* The first text of this item said a merge commit's pre-commit hook
   runs on every merge, and that it ran on "the staged registry". githooks(5) says otherwise, and a scratch repo with
   git 2.55 shows it: a clean `git merge` commits with no pre-commit hook (it runs `pre-merge-commit`, and this repo
   installs none; `commit-msg` does run), and a merge that stops runs pre-commit when `git commit` finishes it. The
   hook's tests read the working tree, not the index, and the commit tier selects them by the staged `frontend/` files
   they import (`related-tests.mjs`). So the allowance matters for a merge that stops, and a clean merge meets S6 first
   in CI. The same check found that `rev-parse MERGE_HEAD` resolves a branch or tag of that name when no merge is in
   progress (measured: both can be created and both resolve), which let a sha reachable only from one pass S6 outside a
   merge; the rule now reads the merge-state file first. Proof for that: a branch and a tag named `MERGE_HEAD` with no
   merge, and a `closedBy` sha reachable only from them, fail S6 (red on the previous rule: the sha passed); a branch
   named `MERGE_HEAD` during a real merge does not displace the file. Mutants through `scripts/dev/mutate.sh`: the
   name lookup alone (the previous rule), the file read at `root/.git/MERGE_HEAD`, the `--git-path` result left
   unresolved against `root`, and a ref-exists test beside the file test are each red; a comment-only edit stays green.
   *What this does not do.* A lane takes in a main that HOLDS this fix: main at 5510db64 or earlier still fails the
   hook for a lane cut before the registry v2 landing, because the merged tree carries main's old harvest. And the
   merge meets a second hook: when it brings in gate changes, `commit-msg` wants a `Mutation-Proof:` line (it runs on a
   clean merge too), which every earlier merge carries ("the gates this merge brings in are main's, proven where they
   landed"); the demonstration needed it and `.claude/rules/registry.md` ("Merging main into a lane") now says so. That
   hook is unchanged. Nor does it add a local S6 check to a clean merge: that would need a `pre-merge-commit` hook, which
   this repo does not install.

---

## 2026-10-31 (registry v2) — [LOOP] one list of open work, cleaned and kept clean: schema v2, lanes as rows, closed is final, and the gates that hold it

Kevin, 2026-10-31: "a total review / cleanup of that registry jsonl, remember lots of these were done by inferior
models and may have become redundant or inferior thinking / tasks ... so that we have a SOTA and future-proof single
list from now on, make it a masterpiece." The review's record, with every count and example, is
`docs/superpowers/plans/2026-10-31-registry-v2.md`; its design is `docs/superpowers/specs/2026-10-31-registry-v2-design.md`.
Every row's disposition, with the command that proved it and the verifier's verdict, is
`docs/superpowers/registry-v2-dispositions.jsonl`; `frontend/scripts/ci/registry-migrate.mjs` applies it. Lane L12's
round 3 (the entry below, which landed first) also numbers items 361-364, so a reference to this entry names its tag,
"(registry v2)", as S7 requires when two entries of a date share a number.

361. **Schema v2.** A row has at most 20 fields, a closed set: `id`, `key`, `planUnit`, `title`, `kind`, `area`,
   `severity`, `playerVisible`, `owner`, `state`, `lane`, `acceptance`, `blockedBy`, `evidence`, `note`, `opened`,
   `updated`, `resolution`, `closedBy`, `reopens`. Eight kinds (bug, feature, debt, instrument, flake, decision,
   process, lane), thirteen areas, three severities plus `unrated` (only in `LANE:triage`), six resolutions (done,
   duplicate, superseded, obsolete, wont-fix, false-positive), and a typed `closedBy` for each. An open row names its
   lane and one checkable line of acceptance; a title is at most 160 characters and a note 1,500. `dupOf` and
   `closedNote` are retired: a duplicate closes as `duplicate:<id>`, and a closed note joins `note`. This amends
   2026-10-28 (W1-H) item 9 and reset-plan row 30's field list, and supersedes reset-plan section 5's generated
   STATUS view: a committed view would conflict on every landing and go stale between refreshes, so views are
   printed when asked (`npm run orient`, `npm run orient -- --registry <lane|kind|area|owner>`). The rules a writer
   follows are `.claude/rules/registry.md`, which loads when the registry or its scripts are touched.

362. **Lanes are rows.** A lane is a row of kind `lane`, and an open row's `lane` must be an open lane row. Four
   standing lanes: `LANE:triage` (bulk intake, at most 7 days), `LANE:backlog`, `LANE:flakes` and `LANE:kevin`
   (his device, ear, money, sign-ins, external sends and the decisions reserved to him). Each reset-plan lane with
   open work has a row (`LANE:W2-M`, `LANE:W3-A` to `LANE:W3-E`, `LANE:W3-G`), and a new fix lane,
   `LANE:L13-stuck-in-solid-remainder`, takes the eight invisible-box bugs no lane owned and their eleven gate holes.
   Why: about 230 open rows named a lane that had already landed, and nothing noticed. A lane row now closes only when
   no open row names it (S4). Nothing ties a PR's landing to its lane row, so the landing change moves or closes the
   lane's leftovers and closes the row; a lane row left open after its PR lands is not seen by any gate.

363. **Closed is final.** A closed row is never reopened; a regression is a new row with `reopens: <id>`. Why: the
   registry merges by union and `registry-dedupe.mjs` keeps the copy furthest along, so a reopen that races an edit
   of the closed row is silently undone. A closed row may change only its closure, note, kind, area, lane and
   acceptance.

364. **The gates.** No new gate script. `registry-harvest.mjs` checks the tree in every unit run: S0 a field outside
   the set; S1 a bad line or a repeated id; S2 a required field missing or outside its enum; S3 an open row with no
   lane, area or acceptance, or with a closure; S4 an orphan (an open row whose lane is missing, not a lane, or
   closed); S5 a `closedBy` that does not fit its resolution, or a missing reason sentence; S6 a sha that is not an
   ancestor of HEAD; S7 a DECISIONS reference that is not exactly one item; S8 a dangling pointer, a duplicate chain
   or a self-pointer; S9 a bug no player can see, a decision closed done without a DECISIONS item, or a Kevin row
   closed outside his rules (on an item, the item's text must name him); S10 `unrated` outside an open triage row, or
   a triage row opened more than 7 days before HEAD's committer date (so a sha always gets the same verdict and main
   never turns red by itself); S11 a title or note over its cap. `registry-append-only.mjs` checks the change, on push
   and in CI: R1 a row deleted; R2 a closed row reopened; R3 a changed row whose `updated` is missing, moved
   backwards, or stayed more than a day older than the head commit's date (item 365.6); R4 a v2 row closed at the
   base changing anything but its closure, note, kind, area, lane or acceptance. Every clause of each rule has a case
   of its own in `frontend/tests/scripts/registry-clauses.test.js` that goes red when that clause is broken. Advisory,
   and said so: whether an acceptance is really checkable, whether a sha fixed what its row says (S6 proves ancestry,
   not relevance), whether an item says what the row claims (S7 proves it exists, S9 only that it names Kevin), a
   wrong kind or area, an open row's `planUnit` changing, a lane row left open after its PR lands, and a backlog row
   not updated in 60 days, which orient counts and nothing closes, since closing on age is closing on an assumption.

365. **The rubric's amendments**, found where its rules met real rows:
   1. **R4 binds only rows that were v2 at the base** (they carry `kind`). The rubric froze a closed row's title and
      also capped every title at 160 characters, and 113 closed titles at the snapshot were longer (the longest 619,
      `STATUS:G-ledger:20`): the S11-against-R4 conflict the review-a verifier found. So the one migration commit retitles and rates the v1 closed rows once;
      after it, a closed row's title and severity are frozen.
   2. **`done` accepts `PR #N`** when the row's whole task was to close that PR (QUEUE:Q01, Q05; OPEN_ITEMS:OI-04, OI-05).
   3. **A reason is a sentence anywhere in the note** ("Won't fix:", "False positive:", "Obsolete:"), not its
      opening, since a reason appended to a row that already had a note could never pass.
   4. **A lane row carries no `lane`,** and its severity is the highest of its open rows, set when it is written.
   5. **One placeholder for this entry's item:** the 57 closures that cite item 366 were written against a
      placeholder, and the migration refuses to run without the real reference.
   6. **R3 allows an edit that keeps an `updated` at most a day older than the head commit's date:** a second edit on
      the day the row was stamped, or one committed the next day. `updated` is a date, so a row edited twice in a day
      keeps it. R3 fails when the text changed and `updated` is missing, moved backwards, or did not move while it is
      more than a day older than the head commit's date. The literal rule ("the same `updated` at both ends") would
      fail every same-day re-run of this migration.
   7. **A split part may be a slug** (`MASTERPIECE:ember-against-the-dark-the/sun-glow-fog`), not only letters and
      digits, since the triage names its parts in words.
   8. **Rows added after the snapshot get their v2 fields from a landing file**,
      `docs/superpowers/registry-v2-landing.jsonl`, applied on top of the merge, which also shortens the notes and
      titles lanes L8, L10 and L12 took past the caps after the snapshot, each record read against its row (item 368).

366. **What this triage decided, the item its own closures cite.** Kevin's rows were closed only as duplicates of his
   other rows; every other closure cites a commit, a row or an earlier item, except these 57, which cite this item,
   each with its own reason in its note (49 won't-fix, 4 false-positive, 3 done, 1 superseded):
   - harness and debt LOWs are dropped under reset-plan section 5 when they guard no MED or HIGH player class;
   - nothing is owed to pre-Cut stat builds beyond the refund every rank already gets back as a point;
   - the mobKillBus typed wrappers stay: their names document the event's shape for three callers;
   - a terrain face's look gets no running-world check: every look change already shoots eye-level lookbook frames;
   - Soulbind factions and Elemancer terrain chemistry are dropped: kit depth ships as talent modifier nodes
     (2026-10-29 (W2-F step 4) item 44);
   - WebGPU and TSL stay "not now", the 2026-10-27 call, made citable here: a pipeline rewrite for a non-bottleneck;
   - 2026-10-28 (W1-H) item 9 is narrowed to what the harvest proves: every item its extraction rules find has a row,
     and nothing wider;
   - W2-C's owed deploy proof is measured: all 48 Production deployments since the lane landed have a green `ci ok`
     on their sha, measured twice, the second time independently;
   - the accretion ratchet of `docs/superpowers/specs/crafty-coherence-pillars.md` is not built (QUEUE:Q42): an
     advisory script for a harness the reset plan shrinks; knip in both modes already runs in CI.

367. **The counts,** on main `bd06dacf` (lanes L8 and L12 landed), where the migration last ran. Before: 795 rows, 446
   open (16 HIGH, 87 MED, 325 LOW, 18 unrated; 16 Kevin's), 349 closed, no row with a kind or a lane, 44 closed rows
   with no resolution, titles up to 843 characters (the snapshot also held 44 known duplicates still open). After: 827
   rows (32 new, none deleted), 292 open, 279 of them work rows (6 HIGH, 50 MED, 223 LOW; 62 bugs, 39 features, 93
   instruments, 35 debt, 34 flakes, 8 decisions, 8 process; 15 Kevin's) in 13 lane rows; 535 closed (313 done, 84
   superseded, 55 duplicate, 53 wont-fix, 26 obsolete, 4 false-positive), among them `REVIEW:w1h:f6`, which this
   landing fixes; no orphan, no unrated row, titles at most 160 characters. Independent verifiers re-checked 496 rows of the triage: 393 upheld, 92 adjusted, 11
   refuted, and every refuted closure is open again or closed the way the verifier proposed and checked.

368. **The migration is a script, reproducible from the repo.** `registry-migrate.mjs` reads the registry at the
   snapshot `a150a93a`, the triage's dispositions and the landing file, and merges three ways keyed by id: a field a
   lane changed since the snapshot keeps the lane's value, a row a lane closed keeps the lane's closure, and every
   other field takes the triage's. It never deletes a row, keeps file order, appends the new rows, and a second run
   changes no byte; on the snapshot it writes exactly the triage's emulated registry. Lanes L8 (PR #73) and L12 (PR
   #71) landed first: each time main was merged in with main's registry as the lane left it, and the migration re-run
   on it in its own commit, the landing file giving the lane's added rows their v2 fields (10 for L8, 15 for L12) and
   shortening what it took past the caps. The old sources (STATUS section 2, QUEUE, OPEN-ITEMS, the masterpiece
   tables) retire next, under reset-plan row 32, which deletes the harvest's extraction half and `registry-floors.json`.
   **Nothing a lane wrote is written over unread** (round 2 of review, after the static review found that the re-run
   for L12 would have replaced L12's flake sightings on two rows with notes a landing record had shortened, and said
   nothing). Every landing record carries `against`, the hash of the row as its author read it (the dispositions'
   `baseHash` form). A row the run would rewrite that a lane changed since the snapshot, or added, needs a record, a
   READ where the three-way merge may stand; a record whose row changed after it was written is not applied; and a
   landing replace must keep every cross-reference (row id, sha, run id, PR, DECISIONS item) of the note it replaces.
   Each is a conflict that stops `--write`. Two further merge rules: text a lane added to a row the triage closes as a
   duplicate is also appended to the row it duplicates, as "From <id>: ...", and a row a lane set in flight stays in
   flight where the triage would close it, since the triage never saw the lane's work. On main `bd06dacf` the landing
   file holds 79 records: 19 READs, the rest with edits. A branch cut before this landing that lands after it writes
   its row edits again on main's registry (`.claude/rules/registry.md`, "Landing beside the v2 migration").

---

## 2026-10-31 (lane L12, round 3) — [LOOP] claims narrowed to what is proven: the capture-guard ratchet's getters and re-exports, the save-path reach entries, and what round 2's CI retried

Round 2's two reviews of lane L12 (static and dynamic) both said LAND and left no correctness defect in the integrated code.
Two of its gates still had surviving mutants against claims round 2 wrote (the dynamic reviewer's N1 and N2), and its ruling,
recorded in the lane's QUESTION.md, was to land and narrow: rule (5) sends what is left after two rounds to the ledger, and
a gate with a surviving mutant ships only with its claim narrowed to what is proven. This round therefore changes claims,
comments and records only, no behaviour and no gate assertion (the four code files it touches differ from the round 2 head
only in comments, checked by comparing each file's syntax tree with comments removed). Branch `fix/l12-instruments`,
PR #71, from `d7d7f235`; main merged at `341531d1` (lane L8). Items continue from round 2's.

359. **The capture-guard ratchet follows an arrow getter, not a getter declared with `function`, and a re-exported alias
   not at all.** (dynamic N1; it narrows item 351's "a getter (its calls are)" and the headers of `captureGuards.js` and
   the ratchet test, which said "any local name" and "a getter")
   - **Measured** on the detector at the merge head, two uses each: a getter held by a const (`const frozen = () =>
     isCaptureMode()`) counts 2; `function frozen() { return isCaptureMode(); }` counts 1 (the read in its body once, its
     calls none); an aliased import read twice counts 2; `export { isCaptureMode as frozen } from './devtest/captureMode.js'`
     with an importer reading `frozen()` twice counts 0. The reviewer's mutants CG7 (the HurlSystem guard swapped for the
     function-declaration getter) and CG8 (a re-export and a guard through it) stayed green on the real tree, and their
     controls, the arrow getter and the aliased import, went red.
   - **Today** neither shape is in src (the ledger is exact at 134 guards in 62 files), so no result is wrong now. Item 351
     and the two headers now say what is followed and what is not. The fix is
     `REVIEW:l12:capture-guard-getter-and-reexport-shapes` (LOW): bind a function declaration's returned read as a getter,
     and follow `export { x as y } from` through its importers, red first on the two probes above.

360. **The save-path reach entries show that a save ran, not that the game's own save path did.** (static F1, dynamic N2; it
   narrows item 350's "the function the boot or save path calls" and `runtime-reach.mjs`'s "'reached' means the game got
   there, not that a test called it")
   - **Specs call it.** Eight spec files call `saveActiveWorld` in the page (ten calls: save-load, forge, quest-text,
     talents, load-hold, continue, world-rebuild-after-load and the-cut three times); the dynamic review counted nine
     calls in seven files with no navigation after them, so those sit in the document the test ends on, where the
     coverage is recorded (item 350). `saveActiveWorld` calls `buildSaveData` and `writeWorld`, so all three entries read
     as ran. The mutant that drops the game's own save call (`worldBoot.js`'s `saveWorldInPlay` calling
     `saveActiveWorld`) is therefore not seen by them, and `installAutosave`, which only installs the trigger, still runs
     from App. That mutant is derived, not run: this lane runs no e2e and pushed no ref. `eventBus.js#emit` is the one other
     entry a spec calls (context-loss.spec, before its reload).
   - **Now** the header says "reached" means the game got there with that exception, and the note above `MUST_REACH`
     says what these entries do and do not show. The fix is `REVIEW:l12:save-path-reach-also-called-by-specs` (LOW):
     `src/game/worldBoot.js#saveWorldInPlay` in the group if a spec's last document runs it, proven red on a throwaway
     ref with the save call dropped (a ref the command session pushes and deletes).
   - Other gates do see a save-path deletion: the dynamic review reads `dead-refresh-gates` and `returning-player-gates` red
     in the fixer's log of the mutants the commit hook refused, so this is the reach contract's blind spot, not a hole in
     what gates the game's saving.

361. **Three more findings of round 2's reviews, as text or rows.**
   - **Static F2, text.** `isolatedEffects.js`'s header had become a present-tense claim the code contradicts: it said
     rewards "run in one block inside a setState updater", while `world/bossSystem.js` runs them after the health commit,
     never inside an updater, each isolated. It is a conditional now ("rewards that ran in one block ... would let one
     throwing reward strand the win") followed by the real arrangement. Comment only.
   - **Static F3, row.** A ledger is checked against the count, not against the base branch's ledger, so a commit that adds
     a guard or a history comment and raises the file's number in the same commit passes both ratchets; "never raise one" is
     enforced by review (item 358's MusicPlayer rise from 2 to 3 passed this way). `REVIEW:l12:ratchet-ledger-raised-with-the-guard`
     (LOW).
   - **Dynamic N3, row.** Nothing in the unit suite gates the e2e fixture's wiring: deleting the console listener (EI5) or the
     throw on a problem (EI6) stayed green, and CI run 41229307736 is the only observation that it works.
     `REVIEW:l12:isolated-failure-fixture-wiring-ungated` (LOW).
   - **Dynamic HS3, no change.** A sentence-initial "Moved here. Used to sit ..." passes the history detector; item 354 lets
     a sentence-initial "Used to" pass on purpose.

362. **A correction to item 352.** It said that nothing in the fixture calls into the page any more. The fixture's teardown
   reads the canvases' drawing sizes with `page.evaluate` (`tests/e2e/_fixtures.js`, after `await use(page)`), which
   Playwright also sends with a user gesture; after the test body it changes nothing a test reads (music-bus passed on its
   first attempt on the listening head, with that read in place). Item 352 says so in place.

363. **What round 2's CI runs retried, and where each is recorded.** Re-read from the six runs' logs (`gh run view <id>
   --log | grep 'retry #'`); round 2's report left the final head's two retries off their rows, and item 358 leaves out two
   from run 41226199357.
   - 41221423846 (`541a3b7d`): `quest-text.spec.js:54` (`REVIEW:e2e-flakes:quest-text-no-frame-while-held`, already).
   - 41223639371 (`8f2d61e3`): `dragon-fight.spec.js:88`, `dragon-fight.spec.js:311` and `light-pool.spec.js:25`, on their
     rows already (item 358).
   - 41226199357 (`8966b318`, the head whose first fixture failed L10's music-bus, item 352): `mob-floor.spec.js:227`
     (attempt 1 `Infinity` at "under the roof, the floor is the ground", retry #1 passed; appended to
     `REVIEW:e2e-flakes:mob-floor-roof-floor-infinity`) and `pause-freezes-world.spec.js:217`, the touch Pause tap, which the
     canvas subtree intercepted for 30 s on attempt 1 (retry #1 passed; new row
     `REVIEW:e2e-flakes:pause-freezes-touch-pause-tap-canvas`, LOW).
   - 41229273516 (`72c9fe6e`): none.
   - 41229307736 (`27bd8de8`, the throwaway ref): `smoke.spec.js:10`, the mutant itself, and `dragon-fight.spec.js:311`
     (attempt 1 and retry #1 "the burning zone never reached the dragon", retry #2 passed; appended to
     `REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`).
   - 41231544100 (`d7d7f235`, round 2's final head, `ci ok` success): `mob-floor.spec.js:227` (attempt 1 failed at the
     control, `mob-floor.spec.js:298`, "the top probe reads the roof", `probe.top` null, the variant the row already names) and
     `light-pool.spec.js:25` (programs 108 to 109), each passed on retry #1 and each appended to its row.
   Lane L12 does change src (seven memo render functions renamed, comments, and the isolated-failure reporting in
   `eventBus.js` and `isolatedEffects.js`), so it is not shown innocent of these; but mob-floor, light-pool and the burning
   zone each have earlier sightings on branches that do not carry it (their rows), and the pause tap's retry appears only in
   the run on the first-fixture head, a first sighting of a mechanism three other rows show on other branches.

364. **Main `341531d1` (lane L8) merged, by a merge commit.**
   - **DECISIONS** conflicted at the top (both sides added sections); both stay, lane L12's two above lane L8's two, with the
     file's `---` between them, and no line of either side is lost (`git diff` against this branch's old head and against
     origin/main lists no removed line). Item numbers repeat across sections (lane L8's item 350 is its build target); each
     section names its lane.
   - **Registry** merged by union, which left `REVIEW:e2e-flakes:dragon-fight-parried-bite-move` twice at the same state,
     each side having appended its own sighting; hand-merged as one row with both after the shared text. `registry-dedupe
     --check`, `registry-harvest --check` and `registry-append-only` pass.
   - **Code and tests:** the merge changed exactly the 33 files of `src/` and `tests/` that main changed since `61696120`;
     32 are byte-identical to main's and `src/store/useGameStore.jsx` is the auto-merge of both sides. Lane L8 added no
     capture guard and no history comment, so both ledgers stand (134 guards in 62 files), and the lane's ratchet, setter,
     reach and isolated-failure specs pass on the merged tree (92 tests in 7 files).
   - **The index chunk:** main `341531d1` built from a `git archive` reads 647,752 B and this branch 647,757 B, +5 B, 4,743 B
     under the 652,500 B ceiling (item 282), by `npm run build`; bundle-budget passes. Lint, doc-currency and gate-shape
     pass on the merged head with this round's edits.
   - **Open rows this round adds:** `REVIEW:l12:capture-guard-getter-and-reexport-shapes`,
     `REVIEW:l12:save-path-reach-also-called-by-specs`, `REVIEW:l12:ratchet-ledger-raised-with-the-guard`,
     `REVIEW:l12:isolated-failure-fixture-wiring-ungated` and `REVIEW:e2e-flakes:pause-freezes-touch-pause-tap-canvas`.
     Item 358's open rows and the throwaway refs (`REVIEW:l12:throwaway-mutant-refs`) stand.

---

## 2026-10-31 (lane L12, round 2) — [LOOP] each instrument goes red on the failure it names: entry points by name, guards by data flow, failures across reloads, and ledgers that fall

Round 1's two reviews of lane L12 (static and dynamic, both FIX) found that the lane's instruments could not go red on
failures they claimed to catch, the class this audit exists for. This round fixes each, red first and mutation-proven
with `frontend/scripts/dev/mutate.sh` (each commit's `Mutation-Proof:` trailer lists its mutants, and every batch ran an
identity mutant that survived; the first one for the runtime-reach script was put in a string the test asserts, went red
as it should, and was rerun on two comments). Branch `fix/l12-instruments`, PR #71, from `6a7ee30d`; main merged at `a150a93a` (lane
L7). Each item names what in items 310-317 it supersedes.

350. **MUST_REACH holds entry points, observed by name in V8's per-function counts.** (static F1, dynamic F1; it
   supersedes item 311's grain paragraph and its "one scratch run with a must-reach mount deleted shows the job red",
   and item 317's "adding an unreached module to the set is the same observable to the job")
   - **What was wrong.** "Reached" was a module the page evaluated, and every static import is evaluated at boot. The
     audit's own mutant survived: with ElementZoneSystem's mount deleted, the merged job still read 70 of 70, because
     `devBridge.js` and `ElementZoneRenderSystem.jsx` still import the module; so did a `useQuestSystem()` App stopped
     calling. 14 of the 70 modules have more than one importer.
   - **Now.** Each entry is `module#function`: the component the mounter renders, the hook App calls, the function the
     boot or save path calls, and for the dragon's chunk `BossEntity.jsx#glowHead`, which its frame loop calls each frame
     the dragon is drawn (the chunk is preloaded before a fight, so its module being evaluated says nothing).
     `tests/e2e/_coverage.js` keeps V8's `functionName`; the shard file is format `/2` with the named functions whose first
     range (the call count) counted, and how many named functions it saw. The merge fails on an entry that ran in no shard
     ("though its module was evaluated" is the deleted mount), on a shard with no function names, on an empty contract and
     on an entry with no function; `--emit` exits 1 on nameless coverage.
   - **Names V8 reports.** `memo(() => ...)` is anonymous to V8, and the dev server's esbuild renames a name declared twice
     in one file: `const GameScene = memo(function GameScene(...))` is served as `GameScene2` (measured with vite 6.4.5's
     `transformRequest`, plugin-react 4.7.0 fast refresh on). So seven memo components' render functions are now
     `function <Name>Render` (no behaviour change), and `runtime-reach-merge.test.js` checks every entry offline: one function
     V8 would name so (`tests/_support/v8FunctionNames.js`), its name declared once in the file. Vite's own transform of
     each entry module, checked once: 71 of 71 named one function.
   - **Two entries left the contract on the first real run** (CI run 41221423846 on `541a3b7d`), each with a registry row:
     `src/WorldManager.jsx#WorldManager`, because no spec renders the World Manager (the panels chunk's prefetch is all that
     read as reached, and two spec headers say they do not check it: `REVIEW:l12:world-manager-unreached-by-e2e`); and
     `src/game/contextRecovery.js#recoverFromContextLoss`, because what a test runs before its page reloads is missing from
     its coverage: context-loss.spec passed in shard 1, so its lost context called `onContextLost` and its tap called the
     recovery, which reloads the page, and shard 1 records no function of contextRecovery.js at all, while the module reads
     as evaluated because the reloaded document evaluates it again (`REVIEW:l12:coverage-before-a-navigation-unrecorded`,
     measured on one spec, not explained). contextRecovery.js keeps `onContextLost`, which a spec in shard 5 runs without a
     reload, and the header now says an entry must be one a spec runs in the document it ends on. **69 entries in 69
     modules** (`8f2d61e3`).
   - **On real coverage.** Run 41221423846: 8 shard files of format `/2`, each carrying V8's names (906 to 1,225 named
     functions ran per shard), 399 of 417 modules evaluated, and "MUST_REACH: 69 of 71 entry points ran (in 70 modules)",
     the two above failing as "never ran in any of the 8 shards ..., though its module was evaluated". Of the 69 that
     stay, 60 ran in all 8 shards; `bossSmash.js#destroyVoxelsInRadius` and `contextRecovery.js#onContextLost` ran in one,
     and the dragon's `glowHead`, `decalFor` and `stepDragon` in two, so each of those five rests on one or two specs
     reaching it, and a spec that fails before it turns the merge red too.
   - **The game-side mutants, on CI** (throwaway ref `land/l12-fix2-mutants`, commit `adfdbbfa` on `541a3b7d`, run
     41222068391). Its merged job failed with "MUST_REACH: 60 of 71 entry points ran", and the eight entries the mutants
     target are among the 11, each "never ran in any of the 8 shards ..., though its module was evaluated", so round 1's
     module grain would have stayed green on every one:
     - a mounted component: the deleted `<ElementZoneSystem />` mount (the audit's literal mutant; the module keeps two
       importers), as `ElementZoneSystem.jsx#ElementZoneSystem`;
     - a hook App calls: `useEmberAccrual` left imported and uncalled, as `accrualHooks.js#useEmberAccrual`;
     - a function the save path calls: `initSettingsPersistence` left imported and uncalled, as
       `settingsPersist.js#initSettingsPersistence`;
     - the dragon's chunk: the `<LazyDragon>` mount never rendered while the chunk is still preloaded, as
       `dragonLoader.js#Dragon`, `BossEntity.jsx#glowHead`, `dragonTelegraphs.js#decalFor`, `dragonMoves.js#stepDragon` and
       `bossSmash.js#destroyVoxelsInRadius`.
     The other three are WorldManager and recoverFromContextLoss (above), and `contextRecovery.js#onContextLost`, which one
     spec runs and which the mutant set broke too: the fragility named above, seen. The quest-hook and autosave mutants
     were tried first and refused by the commit hook, because unit tests that render App see both.

351. **The capture-guard ratchet counts guards, and follows the flag under any name.** (static F2, dynamic F4; it
   supersedes item 312's count, "105 sites in 60 files", and its "The two clauses that stand are gated", which the
   reviewers' mutants refuted)
   - **What was wrong.** It counted a call of the bare name `isCaptureMode` or a member read of that name: GameScene's
     local `const isCaptureMode = useGameStore(...)` counted once and its four uses nothing, an aliased import counted
     nothing, and `settingsPersist.js`'s two guards, on the function App passes it, were not in the ledger. Four mutants
     survived it, run first: a new `if (isCaptureMode) void 0;` in GameScene, a guard through an aliased import, a
     module-scope read through the alias, a third guard through settingsPersist's parameter.
   - **Now.** `tests/_support/captureGuards.js` counts GUARDS (one place the flag decides something, the `!`, `&&`, `||`,
     `===` and `typeof` around a read taken as one), and follows the flag by scope through `tests/_support/sourceFlow.js`:
     an aliased import, a local or destructured field that holds it (its uses are the guards), an arrow getter a `const`
     holds (its calls are; a getter declared with `function` and a re-exported alias are not followed, item 359), and a
     call argument, object-argument property or JSX prop it is handed into, within a file or across a relative
     import. **133 guards in 62 files**, every per-file change a rise the old counter could not see; no guard was added.
     What it does not follow is a value stored on an object and read back (`REVIEW:l12:source-flow-limits`).
   - **New dev dependency, `@babel/traverse` ^7.29.7**, for the language's own scope resolution. It was already in the
     lock as a dev dependency of `@vitejs/plugin-react` at 7.29.7; it is now listed in `package.json` and the lock's root,
     and `npm ci --dry-run` on the two files accepts the lock.

352. **The e2e isolated-failure check sees every load of the test's page, and an unread game page fails.** (static F3,
   dynamic F2, F3; it supersedes item 310's e2e side, whose "never a pass" was false, and item 317's acceptance of the
   unread lines)
   - **What was wrong.** The fixture read `window.__isolatedFailures` once at the end, so a failure before a reload was
     lost (the counter is module state; a reload publishes 0), and a page it could not read printed "unread" and passed.
   - **Now, and it only listens.** A tracker made per test (`tests/e2e/_isolatedFailures.js`) is fed the page's console
     events and its requests, both of which keep coming across every reload: each `console.error` line that starts with
     `isolated failure in ` (what `src/game/isolatedEffects.js` prints, in a dev server) is a failure, and each fetch of
     `src/game/isolatedEffects.js` is a load that carries the instrument. Any failure fails the test; a game page that
     never fetched the module is unread and fails; a game page is one that requested the module script `index.html`
     names, so the fog specs' probe page is printed as "not a game page", detected by what it loaded, not by name. The
     window counter stays for probes.
   - **The first version called into the page, and that changed the game** (CI run 41226199357, on `8966b318`, the head
     with lane L10 merged). It armed through a Playwright binding at module load, and Playwright delivers a binding's
     result with `Runtime.callFunctionOn` and `userGesture: true` (playwright-core 1.64.1, `lib/coreBundle.js`: the
     binding's `deliverBindingResult`, and the Chromium context's `evaluateWithArguments`), so every game page was handed
     a user gesture at boot. L10's new `music-bus.spec.js` failed all three attempts with "SETUP: the day track plays
     before any gesture" (the day track 27 to 31 s in before the spec's key press); it passed on main. The binding is
     removed and nothing in the fixture calls into the page while the test runs (its teardown reads the canvases' sizes
     once after the test body, which is also a call into the page and is harmless there, item 362); the on-CI receipts
     below for the listening version are item 358's.
   - **On CI, first version.** Run 41221423846 printed 112 `[isolated-failures]` lines: 105 "0 over 1 page load(s)", 3 "0 over 2",
     1 "0 over 3" (the specs that reload), and 3 "not a game page (/src/index.jsx was never requested)", the fog specs;
     none unread, none failed, so the stricter verdict costs nothing today. On the mutant run (41222068391), smoke.spec
     registered a reactor that throws, emitted, reloaded and waited for the new page's counter to read 0; it failed all
     three attempts with "1 isolated failure(s) while this test ran (over 2 page load(s)), the last: the reward event: L12
     round 2 mutant reactor before a reload", where round 1's read of the last document would have passed it.

353. **The ratchet ledgers are the count exactly.** (static F4, dynamic F6; it supersedes items 312 and 313's "the test
   does not tighten the ledger") `tests/_support/ledgerDrift.js` names a file past its number or unlisted, a file under its
   number or listed with none left, and a malformed entry; both ratchets fail on all three. Red first on the slack the
   reviewer measured: `src/world/bossSystem.js: 2 < 3` (so item 313's "80 comments" was 79), now 2.

354. **The history detector counts "<noun> used to".** (static F5, dynamic F7; it amends item 313) The marker needed a
   pronoun before "used to", so "The sweep used to sit" and "This comment used to claim" passed. Every "used to" in src
   comments was read by hand: 98 matches of the string, two of them inside "refused to", so 96 phrases, of which two are
   purposes and pass: "heights (...), used to bound how far" (after a comma) and "Used to spray hit sparks" (sentence-initial,
   no word before it). The marker is now any word, name or code span before "used to", except after a form of be or get or
   a comma. **117 comments in 74 files**, from 79 in 48, with no comment added; `isolatedEffects.js`'s narration is
   rewritten. **A correction:** commit `19f4402e`'s message says "78 phrases" and that one phrase is a purpose; it was 96
   and two.

355. **The setter gate credits a member of the STORE, not any member of that name.** (dynamic F5; it amends item 314) A dead
   store `setTranslation` would have been kept alive by every Rapier body's `rb.setTranslation(...)` (the reviewer's SS2
   survived). A use is now a read off something the store's value flows into, followed from its `create(...)` export by
   scope (`tests/_support/storeSetters.js` lists the forms). On the real tree: 61 setters, 61 live, as before.

356. **`lastDamageTime`'s leftovers are gone.** (static F6, dynamic F7; it amends item 315) The store comment that said it
   "is one number for the whole game" now states the per-attacker rule, and the fourteen test writes of the deleted key, in
   ten files, are removed (no behaviour change; commit `59fb059e`'s message says twelve).

357. **knip reads `tests/_support`.** `@babel/traverse` read as unused because knip counts a dependency only in its entry and
   project files and the helpers import it; `tests/_support/**/*.js` joins `project` (not `--production`), and the dead
   export it then found, `hudCallSites.js` `everyGameStateUse`, is deleted. A detector that false-positives is widened.

358. **What round 2's CI said, and what is open.**
   - **The code head's run, 41223639371 on `8f2d61e3`: `ci ok` success**, every job green. The merged job read "8 shard
     file(s) of 8", 399 of 417 modules evaluated, and "MUST_REACH: 69 of 69 entry points ran (in 69 modules)"; 115
     `[isolated-failures]` lines (108 "0 over 1 page load(s)", 3 "0 over 2", 1 "0 over 3", 3 "not a game page"), none
     unread, none failed. Three tests needed a retry, each a known flake row given this sighting:
     `dragon-fight.spec.js:88` ("the move machine did not cancel the parried bite",
     `REVIEW:e2e-flakes:dragon-fight-parried-bite-move`), `dragon-fight.spec.js:311` ("the fireball's burn never ticked",
     `REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`) and `light-pool.spec.js:25` (programs 108 to 109 on two
     attempts, `REVIEW:w2f:light-pool-first-attempt-programs`). The run before it, 41221423846 on `541a3b7d`, failed only
     where this round expected: knip on the new dependency (item 357) and the two entries (item 350); its one retry,
     `quest-text.spec.js:54`, is `REVIEW:e2e-flakes:quest-text-no-frame-while-held`.
   - **Main moved to `61696120` (lane L10) and was merged (`8966b318`); its run, 41226199357, failed** on L10's
     `music-bus.spec.js`, three attempts, because the first isolated-failure fixture called into the page (item 352).
   - **The listening fixture's head, `72c9fe6e`: run 41229273516, `ci ok` success**, every job green and no retry at all.
     `music-bus.spec.js` passed on its first attempt; "MUST_REACH: 69 of 69 entry points ran (in 69 modules)", 400 of 418
     modules evaluated; 112 `[isolated-failures]` lines (105 "0 over 1 page load(s)", 3 "0 over 2", 1 "0 over 3", 3 "not a
     game page"), none unread, none failed. The throwaway ref `land/l12-fix2-mutants-2` (`27bd8de8`, that head plus only
     the smoke.spec throw before a reload), run 41229307736, failed one job, the shard with smoke.spec, which failed all
     three attempts with "1 isolated failure(s) while this test ran (over 2 page load(s)), the last: the reward event:
     Error: L12 round 2 mutant reactor before a reload, listening"; its merged job read 69 of 69, and its one other retry
     was `dragon-fight.spec.js:311` (`REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`).
   - **What the merge of main `61696120` (lane L10) changed in the lane's ledgers.** L10 landed a new capture guard in
     `src/ui/MusicPlayer.jsx` (`if (isCaptureMode()) {` at a gesture, commit `3b8e5e77`) before this ratchet reached main,
     so the merged tree holds 3 there and the ledger takes 3, the one rise in this lane's ledgers that is not a wider
     detector; the rule "add no guard" binds from this landing on. L10's one new history comment ("the step the fade has
     always taken") is reworded as the step it is, so MusicPlayer's history number stays 1.
   - **The index chunk:** 650,441 B on main `a150a93a` and 650,457 B on the lane merged with it, +16 B; with main
     `61696120` merged, 652,029 B against main's 652,017 B (its item 307), +12 B, 471 B under the 652,500 B ceiling (item
     282), by `npm run build`; bundle-budget passes. Not attributed byte by byte: the render functions' names are not in
     the build (the minifier drops them; grepped), so the likeliest source is the seven arrows that became function
     expressions; the isolated-failure binding's name is in no built chunk.
   - **Corrections to item 317** (dynamic F8): the run it calls the final head's, 41207666305, was on `bdfd5700`; the head
     `6a7ee30d` ran as 41209760482 (111 `[isolated-failures]` lines, 108 at 0).
   - **Seen once, not diagnosed:** QuestSystem.jsx's 250 ms chest timer firing after jsdom tore down, under load 10-14, in
     a commit hook's related run (`REVIEW:test-flakes:quest-chest-timer-after-teardown`).
   - **Process:** one run of `tests/gates/` (330 files) went outside the suite lock at 2 workers when an empty variable
     widened a single-spec command; every full-suite run used the lock and 4 workers. The throwaway refs are the command
     session's to delete (`REVIEW:l12:throwaway-mutant-refs`; `land/l12-fix2-mutants-2` too), and so are the local branches `scratch/l12-fix2-mutants` and `scratch/l12-fix2-mutants-2`.
   - **Open rows:** `REVIEW:l12:world-manager-unreached-by-e2e`, `REVIEW:l12:coverage-before-a-navigation-unrecorded`,
     `REVIEW:l12:source-flow-limits`, `REVIEW:l12:history-comments-ledger` (117 left), `REVIEW:l12:context-loss-mutants-unobserved`,
     `REVIEW:l12:isolated-failure-invisible-in-production`. Closed: `REVIEW:l12:reach-grain-is-the-module`.

---

## 2026-10-31 (lane L12) — [LOOP] instruments that can see: an isolated failure is reported, the 8 shards' reach is merged and holds a named set, and the capture-guard rule keeps what is enforced

Lane L12 of the deep audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4; seam S8), branch
`fix/l12-instruments`, PR #71, from main `a05bf328`. The lane ran beside L3 (PR #69), whose files it left alone while L3 was in
flight (the store's keys, `QuestSystem.jsx`, `bossSystem.js`, `saveSchema.js`, the squad files). L3 landed as `7250aa22` while
this lane's first CI run was in flight; the lane merged it (`82f43c02`) and finished the two items that waited on it (314, 315).

310. **An isolated failure is reported, and the e2e suite reads the count.** (AUDIT:debt:isolation-swallows-errors) The event bus
   caught a throwing subscriber with an empty block, and the two boss callers of `runIsolatedEffects` discarded the failures
   it returns. `game/isolatedEffects.js` gains `reportIsolatedFailure(where, error)`, a `console.error` naming where and, in a
   dev server, `window.__isolatedFailures = { count, last }`, published at load with a count of 0. `runIsolatedEffects` calls
   it per failed effect, which covers both boss callers without an edit to `bossSystem.js`; the bus calls it with the event's
   name. The production build drops console calls (`vite.config.js` `esbuild.drop`, build only), so the function returns
   first when `import.meta.env.DEV` is false and the counter is dev only. The production index chunk: 646,232 B on `a05bf328`
   and on this lane before L3's merge; 649,549 B on main `7250aa22` and 649,515 B on the merged lane head (34 B less: the dead
   `lastDamageTime` store field and its write are gone, item 315), against the 652,500 B ceiling (item 282), by `npm run build`.
   - **The e2e side.** `tests/e2e/_fixtures.js` reads the counter at the end of every test (`tests/e2e/_isolatedFailures.js`),
     prints `[isolated-failures] N`, writes its V8 coverage file first, and then fails the test on a nonzero count. A page
     that cannot be read (crashed, closed, silent for 5 s, no counter) prints `unread` and is never a pass. No spec throws on
     purpose in a reactor, so a nonzero count is a finding. **The baseline was unknown when this was written** (no e2e ran
     locally); PR #71's first CI run prints the count for every test, and the result is recorded in item 317.
   - **Gates.** `tests/gates/isolated-failures-gates.test.jsx` (9 cases: a subscriber that logs is seen through the real bus;
     a throwing one is logged with the event name and its error while the next runs; a non-Error throw; every failure of one
     emit; a failed effect under its own name; the real `useBossSystem` driven through its arrival poll and a store
     `damageBoss` with a throwing notice and a throwing `grantXP`, three lines and three counts and the win still lands; the
     counter exists at load), red first on `a05bf328` (4 of 7 red, the 3 presence cases green). `tests/scripts/e2e-isolated-failures.test.js`
     (9 cases) drives the read, the printed line and the verdict with a fake page. Mutants: 8 and 6, all red, identity survived.
   - **Not proven here:** that `_fixtures.js` calls the helper (a Playwright fixture cannot run in the unit suite). The CI log,
     one `[isolated-failures]` line per test, is that proof.

311. **The 8 shards' reach is merged, and a named set must be reached.** (AUDIT:debt:runtime-reach-per-shard) It supersedes the
   "REPORT-ONLY, deliberately" header of `scripts/ci/runtime-reach.mjs`, which no DECISIONS item had recorded. Each shard
   printed its own report: they reach 391-397 of 415 modules, so the dragon's modules read as never reached in shards 1, 7
   and 8 of run 41199587278, and a shard that attached no coverage printed "instrument failure" and exited 0 (red first: the
   old script on a coverage directory holding `[]` and on a missing directory, both `exit=0`).
   - **Now.** `--emit <file> --shard <n>` writes the modules a shard reached and exits 1 when it read no coverage; the e2e job
     uploads `reach-shard-<n>` and fails the shard when the file is missing; a new `runtime-reach` job (needs `changes` and
     `e2e`, `always()`, the same docs-only and certified skip as e2e) downloads them, checks out `src` only, installs nothing
     and runs `--merge --expect 8`. It exits 1 on a missing, duplicated, unreadable, foreign-format or empty shard file, a shard
     number outside 1..8, a `MUST_REACH` module no shard reached, or a `MUST_REACH` entry the tree no longer has. `ci ok` needs
     the job and `ci-ok.mjs` lists it among the jobs a docs-only or certified run may skip.
   - **`MUST_REACH`: 70 modules in five groups with a reason each** (the systems and render drivers the scene mounts, the hooks
     and roots App mounts, the dragon, the boot and the save path). Checked offline against the eight shard logs of run
     41199587278: the union reaches 408 of 415 modules, the seven unreached being `brand.js`, `i18n/keyReachability.js`,
     `render/passTimer.js`, `theme/contrast.js`, `ui/LocaleToggle.jsx`, `ui/PrimitivesShowcase.jsx` and `world/detile.js` (item
     115 accounts for four of them), and all 70 are reached. Adding an entry requires a spec that reaches it today; removing one
     is a commit that says why.
   - **The grain, measured and stated in the script's header.** "Reached" is a module the page evaluated. `node:inspector`'s
     `Profiler.takePreciseCoverage` reports an evaluated module's top-level entry as `["", 1]` even when every function in it is
     uncalled, so a module that is imported and never mounted still reads as reached, and the dev server's React-refresh wrapper
     adds an executed function to every `.jsx` module, so counting executed functions would mean nothing. The job sees a module
     nothing imports any more, which is what deleting a mount leaves once eslint forces its import out. **A function never called
     inside an imported module is not seen**: the fixture's per-test file keeps no function names. That is registry
     `REVIEW:l12:reach-grain-is-the-module`.
   - **Gate.** `tests/scripts/runtime-reach-merge.test.js` (31 cases: the union rule, every way a shard set is wrong, the CLI on
     synthetic files, `MUST_REACH` against the tree, and `ci.yml` as YAML: the emit step, the upload, the merge job and the number
     8 as the matrix, the `--shard=N/8` split and `--expect`). Mutants: 14 on the script, 8 on `ci.yml`, 1 on `ci-ok.mjs`, all red,
     identity survived; the required-check spec's skip-condition case admits the merge job's `always() &&` form (3 more mutants red).
   - **Not proven here:** that the workflow runs and that the real shards' paths map as the logs say. PR #71's own CI is that proof,
     and one scratch run with a must-reach mount deleted shows the job red (item 317).

312. **The capture-guard rule keeps its enforced clauses and drops the one that protected a retired oracle.**
   (AUDIT:ultra:ultra-player-world-10) `.claude/rules/game-code.md` said: add no guard; read the flag inside the callback; reset
   to a declared value rather than return early. Nothing enforced any of the three, and five useFrame guards (`HurlSystem`,
   `SquadAISystem`, `ElementZoneSystem`, the far beacon, the Player loop) return early. **The third clause is retired.** What it
   protected was a run-independent frame for the pixel baselines (`capture-phase-reset-gates` measured a 6.2x spread in the
   frozen phase, Pearson r 0.842 against the menu residual), and that oracle retired in W1-H item 1 and W2-B. Capture mode now
   freezes the world for the e2e specs and probes that call `enterCapture`, which read state, so a system frozen where it was
   is the behaviour they ask for; rewriting five useFrame loops for a capture-only frame would cost risk in the Player loop,
   the terrain and the squad (L3's) for no player value. The title screen's guards still reset (`capture-phase-reset-gates`).
   - **The two clauses that stand are gated.** `tests/scripts/capture-guards-ratchet.test.js` (5 cases) counts guard sites with
     `@babel/parser` (a call of `isCaptureMode()` or a read of a member called `isCaptureMode`): **105 sites in 60 files** (93
     calls, 12 member reads) are held per file in `tests/scripts/capture-guards.ledger.json`, which may only fall; an unlisted
     file holds none; a site at module scope fails (zero today). The test does not tighten the ledger, so lane L3 removing
     a guard in a file it edits changes nothing. Mutants: 7, all red, identity survived.

313. **One history-comment ratchet merges four rows.** (AUDIT:ultra:ultra-game-logic-5, REVIEW:w2d:gamehud-history-comments,
   REVIEW:w2g:comments-say-history, REVIEW:w3b:comment-history-phrases) `tests/scripts/history-comments-ratchet.test.js` (4 cases)
   reads every non-test `src` file's comments from the syntax tree (adjacent line comments joined) and counts those that
   match a marker of narration: "it / they / this / these / that / those / which / one / each used to", "used to be", "what
   was there", "deleted / removed / retired / fixed / reverted / replaced / added" followed by a date, "(was 5.5)", "has
   always", "on today's model". **80 comments in 48 files after the sweep, from 92**, held per file in
   `tests/scripts/history-comments.ledger.json`: a file past its number, or an unlisted one, fails. The markers live in
   `tests/_support/historyComments.js`. **Not checked:** history worded another way ("the old X", "previously"); a date is
   not history on its own ("measured 2026-10-27" stays). The sites the four rows named are rewritten as the constraint and its
   reason (`GameHud.jsx`, `devBridge.js`, `GameSystems.jsx`, `dragonMoves.js`, `BossEntity.jsx`, `bossEntrance.js`,
   `debrisPark.js`, `npcRoutine.js`, `questLore.js`, `spellVisualProfiles.js`, `world-seed-gates.test.js`), comments only. The
   other 80 stay in the ledger as one open row, `REVIEW:l12:history-comments-ledger`. Files lane L3 edits are held, not
   rewritten.

314. **Every `set*` member the store declares has a caller.** (AUDIT:debt:three-call-channels-dead-wires, the AST half; L3 owns
   the declared-keys half, `tests/scripts/store-keys-declared.test.js`.) Lane L6 removed 13 of the 17 setters by hand; lane L3
   (item 291) removed `setDamageBoss`, `setGetBossPosition` and `setBossActive` with the boss mirror. The count of dead `set*`
   members is 0 on the merged tree. `tests/scripts/store-setters-called.test.js` (4 cases) reads the store's `create()`
   object and every source file with `@babel/parser` and credits a setter with a use as a member of something (`x.setX`,
   `x?.setX`, `x['setX']`, `const { setX } = ...`), not a bare identifier (a component's own `const [v, setX] = useState()`
   would credit a dead store setter of the same name, which the first draft did). Red first, the detector over the tree before
   L6 (`983d5711^`): 15 dead, exactly L6's 13 plus the two L3 names. The gate had an exemption for those two while L3 was in
   flight; it is gone now that they are. Mutants S1-S6: all red, identity survived. The channels themselves (the bus, `GameMethods`,
   the store) are not consolidated: the audit sized that at L, and the registry row stays open for it.

315. **The five comments that contradicted their code** (AUDIT:debt:comments-that-lie). Each, at the merged tree: `isolatedEffects.js`
   (it said callers surface the returned list; two discarded it) is fixed by item 310; `runtime-reach.mjs` (it said the report was
   a union across shards) by item 311; `bossSystem.js:41` was made true by L2 (the boot loads before the hook mounts) and L3 then
   rewrote the hook's seed comments around the store as the owner; `CombatSystem.jsx:217-223` is true since L3 deleted the
   `useGameStore.setState({ damageMob })` write beside it (nothing reads `store.damageMob`; grepped); and the store's
   `lastDamageTime` comments, which said the HUD and the camera read it as the hit signal, are fixed here by deleting the field
   and its one write (nothing in `src` reads it; the signal is `lastHitDir.t`, read by `Components.jsx` `isNewHit` and by
   `ui/DamageDirection.jsx`). `pack-damage-gates` carried a case with the same false reason ("the hit direction indicator and
   the camera shake lose their trigger"); it now asserts that `lastHitDir.t` is stamped on every accepted hit, red on a hit that
   stamps nothing. The comment checks are by reading, not by a gate: the audit's own verdict was that comment truth is not
   testable, and the two AST checks of items 313 and 314 are what make claims 3 and 4 checkable.

316. **The gates that ran in an order the game never runs** (audit debt item 1). Status at `a05bf328`, from the files:
   `boss-persistence-hook-gates` loads before mount, which since L2 is the order the game runs (the boot loads before the first
   render), and L3's `store-owns-encounter-gates` is the mount-first case; `new-world-reset-gates` is a store-only unit, and the
   hook half of a New World (the dragon woken, then Create New World: no dragon, hook equal to store) is L2's
   `world-switch-boot-gates`, since a New World is now a boot; the touch Show
   Stats wiring is gated through the real App by L1's `touch-show-stats-gates`; `build-footprint-gates` no longer pins the
   inverted wall (L6, `52913d8e`); the iPad stubs in `touch-probe.mjs`, `ipad-probe.mjs` and `_lookbookPage.mjs` are L10's
   ("ban no-op stubs"). **This lane's share is `context-loss.spec`**, which asserted coins, a block and a position, the store's
   own, and not the quest log or the dragon fight that the resume once wiped: it now emits a player kill on the bus and writes
   a slain dragon at tier 1 before the loss, and after the reload reads the kills, `bossDefeated`, `bossTier` and `bossActive`
   back from the store once the hooks have mounted. **Not run** (no e2e locally); its mutants E7 and E8 are listed in the spec
   and not yet observed red (registry `REVIEW:l12:context-loss-mutants-unobserved`).

317. **What PR #71's first CI run said, and what is left open.** Run 41204965227 on `cd7682cf`, read from its logs.
   - **The isolated-failure baseline is 0.** 120 `[isolated-failures]` lines (117 with a count of 0); on the final head's run
     (41207666305) 112 lines, 109 of them 0. Three read `unread (no counter on the page)` in both: the fog specs, which draw on
     a page that is not the game. No spec swallows a throw, so the fixture's failing a nonzero count costs nothing today.
   - **The merged runtime-reach job read the real shard files and passed.** 8 shard files of 8; the union reaches 397 of 415
     modules and 11 more run only in a worker; the 7 unreached are exactly the seven the offline check from run 41199587278
     predicted; `MUST_REACH: 70 of 70`. The per-shard module counts (391-397) match the old per-shard reports.
   - **Both new instruments were seen red on real CI, on two throwaway refs, `land/l12-mutant-reach` and
     `land/l12-mutant-isolated`** (the command session deletes them; this lane's permission to delete a remote branch was
     refused). Run 41205153138: `src/brand.js`, a module no shard reaches, added to `MUST_REACH`: the `runtime reach (merged)`
     job failed with "MUST_REACH src/brand.js was reached by none of the 8 shards", `70 of 71`. Run 41205187537: `smoke.spec.js`
     registered a reactor that throws and emitted its event: that test failed with "1 isolated failure(s) while this test ran,
     the last: the reward event: L12 mutant reactor" on all three attempts, the other 14 tests of its shard passing. The mutant
     the audit named, deleting a must-reach module's mount, was not run: the commit hook's related tests would refuse a mount
     deleted from `Components.jsx`, and adding an unreached module to the set is the same observable to the job.
   - **One red came from this lane's own probe, and was fixed.** `context-loss.spec` failed on shard 1 with "coins 4333, saved
     4321": the new kill the spec emits pays coins after the spec had set its coins mark. The mark now follows the kill (`7a4467c2`).
     The quest and dragon reads after the reload had not been reached on that run. On the final head (run 41207666305, `bdfd5700`,
     `ci ok` green) they were: "the hooks' state after the resume {kills: 1, bossDefeated: true, bossTier: 1, bossHealth: 0,
     bossActive: false} (kills played 1)". One first-attempt flake on that run, `continue.spec.js:128` ("no autosave ran after
     Continue"), passed on retry #1: registry `REVIEW:e2e-flakes:continue-no-autosave-after-continue`.
   - **Open, as registry rows:** `REVIEW:l12:reach-grain-is-the-module` (item 311), `REVIEW:l12:history-comments-ledger` (item 313),
     `REVIEW:l12:context-loss-mutants-unobserved` (item 316), and `REVIEW:l12:isolated-failure-invisible-in-production` (the shipped
     build drops console calls and keeps no counter, so a reactor that throws in a player's browser is still seen by nothing; a
     production-safe sink that `prod-smoke` reads is the fix). Not this lane's: the audit's critic gaps (arrows through terrain,
     the healer, the camera in solid, ultrareview chunks 4-6), the god-file splits, and the three-channel consolidation.

---

## 2026-10-31 (lane L8, round 2) — [LOOP] a refresh continues the world the tab was playing; round 1's ungated claims gated; what a refused sessionStorage still does

**Decided by the L8 round-2 fixer under the standing grant** (DECISIONS 2026-10-28 item 14), from round 1's static and
dynamic reviews of `acbee88c`, with the refresh call (item 343) made by the command session. Branch
`fix/l8-save-slots`. Items 343-350 (round 1 used 330-342; lane L7's section, below, also numbers 330-336, and each
section names its lane). Each stands while it earns its place.

343. **A refresh continues the world the tab was playing, even an empty New World** (the command session's ruling on
   the dynamic review's F3). This supersedes item 334's cost sentence for a refresh: a New World played without earning
   anything is no longer passed over when the same tab reloads. A visit with no note (a new tab) keeps item 334's rule.
   As the page goes (pagehide, which HTML's unload steps fire before the page is hidden), App's autosave install
   writes a pending save and then leaves the tab the boot note naming its world (`worldBoot.js` `leaveTabNote`, the
   note a world switch leaves since item 200), so the note names the slot that save made. The boot honours a note
   before any rule of the plain visit, and its prune keeps the world a note names. No note is left where the next load
   must be a plain visit or another's note:
   - a switch's note is already there (the switch decides where the reload goes);
   - the tab deleted its world (item 335's plain-visit reload);
   - the tab has no world in play (it loaded none and was never started);
   - the world it loaded never ran a frame (the boot attempt is still there, so item 220's crash-loop breaker still
     holds that world on the title after the crash screen's Reload);
   - the page is kept for the back-forward cache (`persisted`), where it may be shown again alive, with no boot.
   pagehide also flushes the pending save itself, for a browser that fires no beforeunload. Not covered: another tab's
   prune of the world this tab plays (it cannot read this tab's note; REVIEW:l8:delete-in-another-tab-writes-back),
   and a real browser's event order (the gate dispatches the events). Gate:
   `tests/gates/refresh-tab-note-gates.test.jsx`, through the real entry: F5 in an empty New World, twice, past the
   boot's prune; pagehide alone; the five no-note cases; a new tab keeps item 334.
344. **A reached shrine is earned progress** (dynamic F6; amends item 333's list). Reaching a frontier shrine grants
   nothing (store `reachShrine`), so a world whose only progress was a reached shrine counted as empty: the prune could
   delete it and a plain visit passed over it. `holdsNothing` reads `game_state.shrines.reached`, and item 333's blind
   spot narrows to an item picked up with no XP, coin, block or chest. Gate: the one-field case in `slot-prune-gates`.
345. **Items 333's and 330's claims are gated, not only stated** (dynamic F1 and F2; no behaviour change). The review's
   mutants of the prune's reads survived every spec but the coins read. `slot-prune-gates` now boots one world holding
   exactly one earned thing (coins, XP at level 1, a level, a block, a chest, the win, a claimed quest, a reached
   shrine, or no progression slice at all) under four newer empty worlds, and asserts it is both kept and continued,
   and that a new world's state is deleted. A refresh at no mana keeps none (`refresh-keeps-vitals-gates`), and a dead
   player's save loads full mana as well as full health (`dead-refresh-gates`).
346. **At a full storage only the first failed save of a run prunes** (static finding 1; amends item 333's "when a
   write fails for room"). The room-prune reads and parses every `Save_`-named save, the player's real worlds among
   them (nothing renames a slot the autosave made), and at a full storage every autosave fails, so each 5 s tick re-read
   every world. It now runs on the first failure of a run (`_saveFailing`, item 332), and the retry that lets a real
   world's save land still runs, once. The boot's prune still reads every placeholder-named save once a load. Gate: a
   case in `save-failure-gates` (6 reads on the first failed save, none on the next two, 6 again after a save lands).
347. **Where sessionStorage refuses the note** (amends item 338). The conflict panel's Reload passes `orPlainVisit`
   (static finding 4): refused, it was a dead button under an opaque panel. Its plain visit lands on the newest world
   earned in or named: the one the other tab just saved, unless that is an empty placeholder. A refused Create takes
   back the slot it minted and wrote a line earlier (dynamic F5), so the World Manager's "nothing changed" is true and
   My Worlds keeps no world the tab cannot switch to; nothing the player made is in that slot. The fixer's call: the
   brief also allowed keeping the world and saying so. That keeps a named, empty slot that no Load can reach in that
   browser and no prune removes, and it needs a new line in both languages in the index chunk. Reversing it is one line
   in `WorldManager.jsx`. Gate: two cases and a control in `switch-without-session-gates`.
348. **What round 1 left, said where it belongs** (static findings 2, 3 and 6; dynamic F4). Opened, owner command
   session, both LOW: REVIEW:l8:refresh-in-fight-sheds-mobs (F5 in a fight keeps the player's health since item 330,
   but the save holds no mob and every load grants 5 s with no damage, so the fight is still left behind) and
   REVIEW:l8:split-view-page-runs-clock (a visible but unfocused touch page, as in iPad Split View, runs its clock and
   saves; item 336 raises the conflict panel at once). Item 331 now states its residual: a change held while the page
   is hidden is lost if the tab is closed while still hidden. REVIEW:l8:delete-in-another-tab-writes-back's note is
   corrected: a failed save's prune keeps none but its own slot, so it can delete an empty world another tab plays,
   and that tab writes the world back at its next save.
349. **Round 2 fits under the index ceiling, 652,500 B, with no raise** (item 282; supersedes item 341's headroom).
   The round's code first built the index chunk at 652,622 B. Its own code was compacted, behaviour unchanged:
   `holdsNothing` read with `|| {}` (the build then lowered each `?.` to a temporary and two null tests; since item
   350 it does not, and `holdsNothing` reads with `?.` again);
   `leaveTabNote` returns nothing, since nothing read it; `goToWorld`'s second parameter is the flag itself; and the
   storage listener calls `noteStorageWrite` directly. With `npm run build` on the round's code head `38e901e3` the
   index chunk is 652,430 B, 70 B under, and bundle-budget passes. Nothing was moved out. (Its headroom is superseded
   by item 350: main's lane L7 landed while round 2 was in CI.)
350. **The build target is Vite 6's default with Chrome and Edge at 91, so `?.` ships as written**
   (`frontend/vite.config.js` `build.target`; the fixer's call, made without a ruling and recorded in the round's
   QUESTION.md). Main's lane L7
   landed while round 2 ran in CI and added 892 B to the index chunk, and the merged tree built it at 653,322 B, 822 B
   over the ceiling, which is not raised (item 282). Vite 6's default target (`'modules'`: es2020, edge88, firefox78,
   chrome87, safari14, as Vite's own Vite 7 announcement lists it) makes esbuild 0.25 lower every optional chain to a
   temporary and two null tests, because esbuild's table starts optional chaining at Chrome and Edge 91 (measured:
   `esbuild.transformSync('x=a?.b', { target })` keeps `?.` for chrome91, safari14 and firefox78 and lowers it for
   chrome87, chrome90 and edge88). The compat-table data shows Chrome 80 to 90 failing only one optional-chaining test,
   "spread parameters after optional chaining" (`fn?.(...[], 1)`), and passing the other four. A scan of every built
   chunk found 176 optional calls and none with a spread argument, so Chrome and Edge 87 to 90 run this build's `?.`
   correctly, and Firefox and Safari already ran it natively at their listed versions. The same build with the target
   moved reads index 646,192 B (7,130 B less), r3f 688,507 B (444 B less), panelBundle 61,539 B (515 B less); three and
   rapier are unchanged (at `7a96dd9a`; with `holdsNothing` back on `?.`, the index reads 646,175 B, 6,325 B under the
   unchanged ceiling). That headroom is
   the next lanes' (item 282's lookbook move left its freed bytes as headroom too). Vite 7's own default moves Chrome
   and Edge to 107. Not covered: a future optional call that spreads its arguments would misbehave on Chrome and Edge
   87 to 90 (REVIEW:l8:optional-call-spread-chrome-87-90, LOW). One line to reverse.

---

## 2026-10-31 (lane L8) — [LOOP] the save slot lifecycle: a refresh is no heal, a hidden tab writes nothing, a failed save says so, empty worlds do not pile up, a deleted world stays deleted

**Decided by the L8 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L8 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, seam S2 and section 4), with the load-heal call made by the
command session. Branch `fix/l8-save-slots`. Items 330-342. Each stands while it earns its place. The one save path and
the write epoch landed in lane L2 (item 221): every write of a world slot in `frontend/src` is `saveActiveWorld`'s, but
the World Manager's Create, which writes a new slot of its own (`grep -rn "writeWorld(" frontend/src`); this lane
extends the epoch (item 336) and does not redo it.

330. **A refresh is no heal: the save keeps the player's health and mana, and a load restores them** (the command
   session's call; AUDIT:numeric:load-mid-fight-full-heal). This supersedes item 222's last two sentences, which kept
   the full heal at every load as lane L8's open design call, and item 206's "the load heal ... (L8)". Since lane L2 a
   refresh resumes the newest save in place, so F5 mid-fight was a full heal where the player stood, as often as they
   liked, with the dragon keeping its wounds. `buildSaveData` writes `player_data.health` and `player_data.mana` when
   each is below its maximum, and nothing at full; `loadWorldData` restores each under the maximum the load derives
   from the save's level and gear (`saveSchema.js` `loadedVital`), and loads the maximum when the save holds none or a
   value no living player has (health at or below 0, a mana that is no number). Writing nothing at full is what keeps
   a new world full: the store's placeholder 100 is not a wound of a level-1 maximum of 150. A dead player's save
   (`asRespawned`, item 222) drops both, so it still loads as Respawn leaves them. The four store keys join
   `PERSISTED_KEYS`, so a hit or a cast schedules a save and the unload flush writes it. The rejected half of the
   audit's choice, refusing Load in a fight, is moot: every load is a reload, and a refusal of F5 is not the game's to
   make. A level-up during a load (a retired quest's owed XP) still heals, as a level-up does in play. Gate:
   `tests/gates/refresh-keeps-vitals-gates.test.jsx`.
331. **A hidden page keeps no day clock and writes nothing** (L2 round-2 static F1; registry
   REVIEW:l2:hidden-tab-keeps-clock-and-saves, opened and closed here). On touch nothing pauses a page that is switched
   away from, so a hidden tab's clock ticked, each tick scheduled an autosave, and with two tabs on one world each of
   those writes refused the visible tab's next save (item 221's conflict panel after every Continue). `shouldAdvanceClock`
   (`game/dayNight.js`) takes the page's visibility as its own guard, read live each tick by `useDayNightClock`, and
   `installAutosave` schedules nothing while the page is hidden: a change made then is held and scheduled when the page
   is shown. The hide still flushes a save pending from before it, once. A change held while the page is hidden is
   lost if the tab is closed while still hidden: the round-1 review found no path that earns progress or kills the
   player on a hidden page, so what is lost is mostly mana regen (item 348). Not changed: the other interval timers of a
   hidden touch page (mana regen, the quest chests, the spawner) still run, and save nothing until the page is shown
   (REVIEW:l8:hidden-touch-page-timers-run). Gate: `tests/gates/hidden-tab-gates.test.jsx` (the real App on the touch
   path).
332. **A save that does not land says so, once a run** (the July review's save-write-failure-silent, :937; registry
   AUDIT:persistence:save-write-failure-silent, opened and closed here). `saveActiveWorld` raises `save.failed`
   (warning, en and zh-CN) on the first failed write of a run, a landed save ends the run (the transient
   `_saveFailing`), and a failed index write after the blob landed counts as a failure, as `writeWorld` reports it. Gate:
   `tests/gates/save-failure-gates.test.js`.
333. **(Amended by items 344, a reached shrine is earned, and 346, the room-prune once a run of failures.) A browser
   keeps at most three empty placeholder worlds** (the lane brief's "a rolling slot or a prune beyond K"; the orphan
   half of AUDIT:persistence:returning-player-never-resumed). `worldSaves.js` `pruneEmptySlots` deletes the
   worlds nobody named (the `Save_<time>` placeholder) and nothing was earned in (level 1, no XP, no coins, no block
   edited, no chest, not won, no quest claimed; a save with no progression slice is never empty) beyond the
   `KEEP_EMPTY_SLOTS` (3) newest, the world a page plays among those kept and never deleted. It runs at the boot, before
   the world is chosen; after a new slot's first write; and, with none kept but the slot's own, when a write fails for
   room, which then tries once more, so a real world's save lands where it stopped before. It writes the shortened index
   first and removes the saves only once that has landed, so a refused index write never leaves the index naming saves
   that are gone (785e18d2).
   - **Why not a rolling slot:** one slot per browser for unnamed worlds would write each New World over the last one,
     progress and all. **Why not recency alone:** on a disk an earlier build left, the player's real world is often the
     OLDEST slot, under the orphans each later visit minted; a prune of all but the newest K would delete it.
   - **The one-way door.** Deletion is of a player's data, so the rule deletes only what holds nothing earned and was
     never named. Its blind spot: an item picked up with no XP, coin, block or chest (an empty world by this rule loses
     it). Gate: `tests/gates/slot-prune-gates.test.js` (50 New World sessions leave 3 empty slots, the newest; a world
     with coins, a named one and the real one stay; 40 orphans on disk; the quota retry; a refused index write).
334. **(Superseded in part by item 343: a refresh in the same tab continues the world it was playing; the rule below
   is a new tab's.) A returning player continues the world they earned, not an empty orphan written after it** (amends
   item 200's plain visit, "the first index entry the player owns whose save reads"). `latestOwnedWorld` passes over a world that
   item 333 counts as empty for the newest world that holds something, and continues the newest when none does. A
   named world (the World Manager's Create) is always a choice. Until lane L2 every Start minted an empty slot, so a
   player who gave up looking for their world had their Continue name a level-1 world: AUDIT:persistence:returning-
   player-never-resumed's harm, live for every disk holding those orphans. The cost: a New World played without earning
   anything and left is passed over on the next visit for an older world that holds something. Gates: two cases in
   `slot-prune-gates`, one through the real entry in `tests/gates/returning-player-gates.test.jsx`.
335. **A world deleted while it is played stays deleted** (the July review's delete-current-world-resurrects, :1185;
   registry AUDIT:persistence:delete-current-world-resurrects, opened and closed here). Deleting the world the tab plays
   (mid-game, or from the title, where the boot has loaded the world Continue names) ends the tab's claim and sets the
   transient `_slotDeleted`, which `saveActiveWorld` reads, and the page reloads as a plain visit (no note). Clearing the
   claim alone is what the July code did, and the next autosave minted a new slot for the deleted world. The delete
   button is labelled with the world's name, and the prompt names the world it deletes. Not covered: a delete from
   another tab, whose next save writes the world back (REVIEW:l8:delete-in-another-tab-writes-back). Gate:
   `tests/gates/world-delete-gates.test.jsx`.
336. **A stale tab is told the moment the other tab saves its world** (extends item 221;
   REVIEW:l2:tab-conflict-told-at-next-save). `installAutosave` hands every `storage` event (a browser delivers one to
   each other page of the origin when one writes localStorage) to the store's `noteStorageWrite`, which raises the
   conflict panel at once when the slot was saved since the tab last read or wrote it. Still not covered: a write from
   another tab landing between this tab's read of the index and its own write, in one task
   (REVIEW:l8:slot-write-race-in-one-task). Gate: a case in `tests/gates/two-tab-save-gates.test.jsx`.
337. **A load claims a slot only by its id, and only once it has loaded; chests are read as pairs** (the audit's two
   REFUTED findings, ultra-state-saves-input-1 and -2, kept as this lane's hardening). The claim moved after the
   reducer, a load with no id leaves the tab owning no slot (not the one loaded before), and `liveChests` drops an entry
   that is no pair and chests that are no list, as `liveBlocks` does (item 219). A sweep of 147 corruptions of a save
   (21 fields, 7 shapes each) found none that still throws as it loads, so `boot-guard-gates` stands its throwing save
   in after the claim (`setActiveWorldId` throws for the broken slot), and its failure-path mutants still die. The
   other half the brief named, the World Manager passing the slot id it read, holds since lane L2: every load is the
   boot's, which passes the index entry's id. Gate: `tests/gates/load-hardening-gates.test.js`.
338. **A world switch the browser will not carry is not made, and the player is told**
   (REVIEW:l2:switch-without-session-storage). `switchWorld` returns null without reloading when sessionStorage refuses
   the note, unless the caller passes `orPlainVisit`: the context-loss recovery does, since the lost context leaves
   nothing to stay in, and since item 347 the conflict panel's Reload does too. Their plain visit continues the newest
   world earned in or named: the world just saved, unless that is an empty placeholder (item 334), and then an older
   world that holds something (corrected in round 2; it said "the world just saved"). `goToWorld` returns whether the
   switch was made and raises `save.switchRefused` (en and zh-CN) when it was not; the World Manager shows the same line.
   Gate:
   `tests/gates/switch-without-session-gates.test.jsx`.
339. **A due return fight suspended at exactly 700 HP stays loaded as item 250's arm loads it; the sign the review
   offered is inert** (REVIEW:l3:suspended-due-return-at-700, the command session's call by item 296, closed as
   decided). The offered fix was to require the save's `saved_at` at or after the window's start (2026-10-28T10:41:29Z).
   GitHub's Production deployments (`gh api "repos/wowlegend/Crafty/deployments?environment=Production&per_page=40"`,
   each sha tested with `git merge-base --is-ancestor 92120514 <sha>`, 92120514 being the first commit to write
   `saved_at`) show no deploy carried `saved_at` before 8579918e at 2026-10-31T07:09:42Z, the window's end. So every save
   that holds a `saved_at` was written at or after the window's end, and the rule excludes none of them; and a save with
   none (every save written in the window) cannot be dated by it. No other field the save holds tells the suspended
   fight from the wipe (item 290), so nothing changes: the rare case (a fight suspended at exactly 700) keeps waking at
   its tier's full health.
340. **A world whose Pilgrimage is done is not sent to reach a shrine again**
   (REVIEW:l3:pilgrimage-done-shows-shrine-objective). The HUD objective tracker shows the shrine objective only while
   the world has reached none and Pilgrimage is not among the claimed quests. The shrine record is unchanged: no key is
   invented for a shrine the save does not name, so a shrine's chest still spawns where its reward has not been taken.
   Gate: a case in `tests/gates/shrine-persistence-gates.test.jsx`.
341. **(Its headroom is superseded by item 349: 70 B after round 2.) The lane fits under the index ceiling, 652,500 B,
   with no raise** (item 282). Measured with `npm run build` on the lane's code head `785e18d2` (base 7250aa22, where the index chunk is 649,549 B by item 295): the index chunk is
   652,132 B, 368 B under the ceiling, so the lane adds 2,583 B; the budget script reads 636.8 KB of 637.2 KB with every
   marker check passing. The World Manager's changes are in the lazy panel chunk and cost the download nothing. Nothing
   was moved out: the lane fits, and the next lane to land offsets what it adds beyond the 368 B left.
342. **Opened, each with an owner** (command session, all LOW): REVIEW:l8:hidden-touch-page-timers-run (item 331),
   REVIEW:l8:delete-in-another-tab-writes-back (item 335), REVIEW:l8:slot-write-race-in-one-task (item 336). Not seen in
   a browser or on a device: every gate here runs in jsdom; CI's e2e runs the save paths it already covers
   (`continue.spec.js`, `context-loss.spec.js`, `save-load` and the rest) on the exact sha.

---

## 2026-10-31 — [LOOP] lane L10: Apple audio comes back after iOS stops it, and the soundtrack goes through Web Audio

Lane L10 of the 2026-10-30 deep audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4), PR #70. It
closes `AUDIT:silent:ios-audiocontext-interrupted-never-resumed` and `AUDIT:silent:ios-music-refused-play-swallowed-and-unmutable`
in code; whether a player on a real iPhone or iPad hears the difference is Kevin's device run (item 305).

300. **Any context state other than running or closed is recovered, by suspend() then resume().**
   - **Why.** All three resume sites compared with `'suspended'`, and iOS WebKit leaves a context `'interrupted'` after
     an app switch, a call or Siri, where resume() alone can leave it (WebKit bugs 273511 and 276016), or `'running'`
     with a clock that has stopped (bug 263627). suspend() then resume() recovers both (MDN BaseAudioContext.state,
     "Resuming interrupted play states in iOS Safari"; the workaround in bug 276016). Both are asked for in the same
     turn: WebKit chains them (`AudioContext.cpp`, `m_currentRenderingOperation`), so resume() is inside the gesture.
     A context that is only `'suspended'` gets the resume() alone, as before, so Chromium, which never interrupts one,
     is never asked to suspend a context it is about to start (added after the e2e hangs of item 302, as a precaution:
     nothing showed suspend() caused them).
   - **When.** On every user gesture, in the capture phase on `window`, so the first tap after a return is heard; on
     `visibilitychange` to visible; on `pageshow`. On a return, a running context is restarted only when its clock has
     not moved for 300 ms (`FROZEN_CLOCK_MS`), so a healthy desktop tab is not restarted, which could click. The
     game's own sites (`resumeAudio`, the pad, the arpeggiator) take the same path (`wakeContext`).
   - **Where.** `src/audio/audioRecovery.js`, installed by the SoundProvider's init effect. It changes no level.

301. **The soundtrack goes through the Web Audio graph, and the mix is the one Kevin set.**
   - **Why.** An iPhone locks a media element's volume and reads back 1 (WebKit `HTMLMediaElement::setVolume`), so a
     fade written there played at full volume and Mute All could not silence it; the fade's pause waited for a volume
     that never settled. Each track now runs through `createMediaElementSource` and its own GainNode, where the fade,
     the music slider and Mute All act.
   - **The mix.** Each GainNode feeds `ctx.destination` directly, beside the effects' master bus, as the media
     elements' output did: not through the bus's SFX gain (the SFX slider would then scale the music) and not through
     its limiter (loud effects would then duck the music). Levels, fade slope and balance are unchanged: 0.4 x the
     slider, 0 for the tracks not wanted, and the crossfade's slope of 0.04 per 60 ms (0.67 a second). The element's
     own volume is never written (it stays 1).
   - **The fade runs on the audio clock.** It was 60 ms timer ticks writing a volume; it is now one linear ramp per
     track on its GainNode at that slope (`linearRampToValueAtTime`), and one timer pauses the tracks bound for 0 once
     the longest ramp has run. Why: on the e2e's run 41209984080 a track was still playing 3 s after Mute All in
     Chromium on CI (passed on the retry); a ramp is not slowed by a busy main thread, where eleven ticks in a row
     are, and it moves the gain smoothly where the ticks moved it in steps.
   - **Start and the gesture.** A play() the platform refused is asked for again inside the next gesture, the Start
     tap included. That gesture also plays and pauses each other track once, since WebKit lifts an element's gesture
     restriction when it is played inside one (`HTMLMediaElement::play`), so a dusk or boss crossfade can start its
     track from a timer. A permitted play() clears `paused` before it returns (HTML, the play() method), so a finger's
     pointerdown, which carries no activation, primes nothing.
   - **Mute All** wants no track, so every track fades and is paused by the player's own state, 600 ms from full.
   - **What may sound different, for Kevin's ear (item 305).** The tracks need a running context now, so on a desktop
     whose browser did let the boot play() through, title music that played at load may begin at the first click or
     key instead. On iOS, Web Audio may follow the ring/silent switch where a media element did not. A crossfade is
     now a continuous ramp where it moved in 60 ms steps, at the same slope. On an iPhone the soundtrack is quieter
     against the sound effects: WebKit locked the element's volume at 1 there, so the 0.4 never applied and the track
     played at full volume; it now plays at 0.4 x the slider, about 8 dB lower, the level every other platform already
     played (round 1's static review, finding 2). Nothing here measured any of the four.
   - **The bytes.** The index chunk measured 646,232 B on a05bf328 and 647,661 B here (+1,429 B), under the unchanged
     652,500 B ceiling (item 282); nothing was moved out, as it fits. Merged with main `7250aa22`, where lane L3 has
     landed (649,549 B, item 295), the chunk measures 650,978 B; with item 300's suspend refinement and the fade on the
     audio clock it is 651,079 B, 1,421 B under the ceiling.

302. **The route is run in Chromium on CI (`tests/e2e/music-bus.spec.js`); its mutation proof is owed.** The spec
   wraps the media element and `createMediaElementSource` (each wrapper calls the real one), enters play as the suite
   does (`_boot.js` `startPlayActive`), makes one trusted key press (F2, bound to nothing), and reads that the day
   track plays through a running context with its clock advancing, that Mute All pauses every track (within 3 s on a
   loaded runner; the 1 s bound is the jsdom gate's), and that unmute brings it back. A dispatched CI run of a
   mutant was planned (commit `bf063ee4` points here) and not made: the commit hook runs the unit gates that import
   a staged file, the jsdom gate catches the same mutant, and a commit that skips the hook is a bright line. No local
   browser runs in this lane. So the proof is owed, as registry row
   `REVIEW:l10:music-e2e-mutation-owed` (the mutant and the way to run it). It first entered play by a trusted click
   on the title's Start Adventure, and on two of its first three CI runs (41203933423 and 41208277637, shard 6) the
   page stopped answering and the test ran out its budget; it passed in 53.8 s on the other (41206449396). Keeping the
   title until the click (`2b68fdad`) and pinning the tier (`1aabcb8a`) did not stop it, and with the job killed no
   failure message survived, so the cause is not known: the title path diverges from the suite's own entry, and the
   music route is the other candidate. So the spec now enters play the suite's way and bounds every page read, so a
   page that stops answering names its step; the Start tap stays the jsdom gate's, on the real title menu. The open
   question is registry row `REVIEW:l10:music-e2e-title-hang`. Round 2 found that the music route is not the cause
   (item 306) and ran the owed mutants (item 308).

303. **A no-op stub is banned in the harnesses that drive a real browser** (gate G-ios, audit section S7).
   - **Why.** `touch-probe.mjs`, `ipad-probe.mjs` and `_lookbookPage.mjs` made Chromium look like iOS with
     `document.exitPointerLock = () => {}` and a `pointerLockElement` getter returning null. iOS defines neither, so
     the probes ran a path no iPhone runs and the death crash it hid shipped (`AUDIT:input:ios-death-crash`). They now
     delete both, as they already deleted `requestPointerLock`.
   - **The rule.** `eslint.config.js`, `scripts/visual` and `tests/e2e`: a function that does nothing (an empty body,
     or one yielding only null, undefined, void or `Promise.resolve()`) put in place of a member by assignment or as a
     descriptor's value or getter. A function returning a real value is a replacement and stays allowed: the first
     draft also banned any literal and flagged the e2e specs' four `Math.random = () => 0.999` seeds, so the rule was
     narrowed to the no-op shapes rather than given an exemption. jsdom gates are outside it (item 304). The raw-git
     selectors became one `RAW_GIT` constant, because the e2e block's rule options replace the raw-git block's.
   - **Proven by** `tests/scripts/no-op-stub-ban.test.js` (30 cases, real ESLint config): red 23/30 on a05bf328 (the
     other 7 are the allow half), 12/12 mutants red, identity survived.

304. **`tests/_support/iosDocument.js` is where a jsdom gate meets iOS.** No Pointer Lock (deleted, never stubbed),
   touch signals, an AudioContext that starts suspended and resumes only in a gesture until it first runs, and can be
   left `'interrupted'` (resume() alone keeps it) or frozen; media elements that refuse play() outside a gesture until
   played inside one, an iPhone's locked volume and an iPad's pause on an audible volume write outside a gesture. A
   gesture is the dispatch of an HTML activation-triggering event or a click, and work deferred past it (an effect, a
   timer) is outside it, the strict side. Each rule cites the WebKit source or bug it models. It drives audio and
   music here; the death and panel gates of lanes L1 and L5 still delete the APIs themselves (registry
   `REVIEW:l10:ios-fixture-adoption`).
   - **The gate** `tests/gates/apple-audio-gates.test.jsx`, the real SoundProvider, MusicPlayer and title menu on that
     fixture (12 cases at `a0adf428`: eleven tests, one run on an iPhone and an iPad): red 11 of the 12 against
     a05bf328's `SoundManager.jsx` and `MusicPlayer.jsx` in a scratch copy (the twelfth, that a suspended context is
     only resumed, guards item 300's later refinement), green on the fix, and with `scripts/dev/mutate.sh` 20 of 20
     mutants red on the final code (`59438095`'s trailer lists them) and R1 to R3 for item 300's refinement
     (`82149662`'s), identity surviving each batch. Round 2 adds three cases and seven mutants (item 307).
   - **Tests changed, with the reason.** `tests/gates/audio-resume-gates.test.js` (REMOVED here; at a05bf328) read
     SoundManager's source for `state === 'suspended'`, the guard item 300 replaces; its properties are now driven, so
     it is deleted and the source-grep ledger falls 94 to 93. `settings-a11y-gates`' MusicPlayer regex gives way to the driven slider and
     Mute All cases.

305. **The lived proof is Kevin's**, appended to registry row `REVIEW:l1:ios-device-run`: on an iPhone and an iPad
   (record the iOS versions), sound effects come back after Home for 10 s and return, after a call and after Siri,
   with no reload; the soundtrack plays within a few seconds of Start, the music slider moves it and Mute All
   silences it within a second; past dusk the night track takes over with no tap. Plus the four differences item 301 names.

306. **The title-entry stall is not the music route, so the title entry stays out of `music-bus.spec.js`** (round 2;
   it settles the music half of item 302).
   - **How it was run.** Dispatched runs of a throwaway probe (branches `probe/l10-hang-head` and `probe/l10-hang-ctrl`,
     deleted after): the spec's title form at `f0c027e6`, every page read bounded at 20 s, twenty reads 3 s apart
     after the Start click, four attempts a job with no retries, and the runner's memory sampled every 10 s. Run
     41217226945 ran the head's code with the music route on (four jobs) and off (four jobs: MusicPlayer made no track
     and no gesture callback, read back as `routes 0`); run 41217229685 ran the code of the run that hung, `f0c027e6`.
   - **What it showed.** The page stopped answering with the route off at least as often as with it on: off 10 of 15
     attempts, on 5 of 16, the control 8 of 13. One stall, with the route off, came on the title before any click.
     No attempt whose first read after the click found the spawn chunk built stalled (20 of 20 went on); 10 of the 11
     that found it not yet built stalled, and the other 13 stalls never answered that read. While a page stalled, two
     Chromium processes grew, together to 15.6 to 15.8 GB of the runner's 16 GB in six of the twelve jobs (4.7 to
     12.7 GB in the other six), and five runners were shut down ("The runner has received a shutdown signal"), the
     end runs 41203933423 and 41208277637 met. A page starved this way also missed the spec's 3 s Mute All bound in
     five attempts (control 3, on 2): the pause timer runs on the main thread. On the suite's entry the bound held
     (runs 41209984080, 41212363395).
   - **So.** The music route does not hang a Start click. The stall belongs to the title path on CI's software
     renderer, most often after a Start click that enters play before the spawn chunk is built; whether a player on
     a real GPU can meet it is not measured. Registry `REVIEW:l10:music-e2e-title-hang` stays open with this evidence.
     The title entry passed 9 of 16 attempts with the route on, so the spec keeps the suite's entry, as item 302 left it.

307. **A gesture plays no track in capture mode or while none can be heard** (round 2, `src/ui/MusicPlayer.jsx`).
   - **Capture.** Item 301's gesture callback never read capture mode, so a tap in an e2e or lookbook capture started
     the day track (round 1's dynamic review, probe P3), and MusicPlayer's "capture-safe" comment was false. The
     callback now reads `isCaptureMode()` inside it and resets to the soundtrack's capture value, every track paused,
     rather than returning early (`.claude/rules/game-code.md`). It extends MusicPlayer's own capture guard to the
     play path the lane added; no other subject gains a guard.
   - **Nothing audible.** With the music slider at 0, every tap played the wanted track again at gain 0 and left it
     running (static review finding 4, dynamic R2d2). With music off or Mute All on, the first gesture played and
     paused all three tracks; the code before the lane never called play() with music off. While no track can be
     heard the callback now plays no element. The cost: the other tracks are primed at the first gesture with a track
     wanted, so on iOS a dusk or boss crossfade from a timer needs one gesture after the music comes back; turning it
     back on is itself a tap, and a refused play() is asked for again at the next one. Whether a play() and pause()
     in one gesture took the audio from another app on iOS was never measured; it no longer happens.
   - **Proven by** three new cases in `tests/gates/apple-audio-gates.test.jsx` (now 15): red 3 of 3 on `a0adf428`'s
     MusicPlayer with the other 12 green, then 7 of 7 mutants red with identity surviving (commit `3b8e5e77`). Its
     trailer says music off asked play() "5 more times"; the red run counted 6, two per track.
   - No level, voice or balance changed. The index chunk measures 651,121 B (+42 B), under the 652,500 B ceiling;
     merged with main `a150a93a`, where lane L7 has landed, it measures 652,017 B, 483 B under.

308. **`music-bus.spec.js` reads the day track paused before its key press, and is mutation-proven in Chromium**
   (round 2; closes registry `REVIEW:l10:music-e2e-mutation-owed`).
   - **Why.** Nothing before F2 said the day track was paused, so if CI's Chromium played it with no gesture the spec
     would stay green with the gesture retry deleted (round 1's static review, finding 3). It now reads the day track
     paused before the press, as a SETUP precondition. A first form also required the context not running there;
     on CI the context already runs before the press (dispatched run 41218278485, both attempts), so that read was
     dropped and the header says the spec does not see the gesture's context recovery, which the jsdom gate holds.
   - **The mutants.** The commit hook runs the jsdom gate, which kills these mutants, so none could be committed. Run
     41218631532 (throwaway branch `probe/l10-music-mutants`, deleted after) applied each to `src` on the CI runner
     and ran the spec twice with no retries: identity (a comment edit) passed 2 of 2; Mute All keeping its track
     (`const key = !musicEnabled ? null`) failed 2 of 2 at "a track is still playing 3 s after Mute All"; the gesture
     retry deleted failed 2 of 2 at "the day track is not playing through a running context after a key press".
   - **Retries recorded.** The three retries of run 41212363395 are sightings on their rows:
     `REVIEW:e2e-flakes:touch-gear-tap-canvas-intercepts`, `REVIEW:w2d:forge-walk-settle` and
     `REVIEW:e2e-flakes:mob-floor-roof-floor-infinity`. So are the four of round 2's run 41219390962 (head
     `3c3ac42d`): the dragon fight's burn and zone case red on all three tries, which failed the run
     (`REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`), and one retry each for mob-floor's roof case, heavy
     melee's charged release (`REVIEW:e2e-flakes:heavy-melee-release-nothing`) and the Cut's hunger case
     (`REVIEW:e2e-flakes:the-cut-pauseat-past`). music-bus.spec.js passed its first attempt there.

---

## 2026-10-31 (lane L7) — [LOOP] credit from the effect, not the click: a verb pays, counts and sounds what its owner says it did, a hazard pays nobody, and the world's queries see the terrain, not the debris

**Decided by the lane's builder** under the command session's grant (deep audit lane L7, registry
`AUDIT:lane:L7-credit-from-the-effect`; audit record `docs/superpowers/audits/2026-10-30-deep-audit.md` section 4).
Branch `fix/l7-credit-from-effect` from `7250aa22`. Each fix's gate went red on `7250aa22`'s `frontend/src` in a scratch
tree, then green; each commit's `Mutation-Proof:` trailer names its mutants, every one red, with an identity mutant green.

320. **A single mine is paid, counted and heard when the worker says what it broke, never at the click.** The click
   posts `update_block` tagged `source: 'player'`; `terrain.worker.js` echoes the post's `source` and `drop` on the
   `block_broken` it sends for a cell it emptied, and `world/mineAtHit.js creditBrokenBlock` (it replaces
   `payBrokenBlock`) pays the block, counts one break toward Miner and Deep Digger and plays the break sound at the
   block. A second click before the rebuilt trimesh lands aims at the cell the first emptied, the worker sends nothing,
   and nothing is paid, counted or heard (`AUDIT:numeric:mine-credit-paid-by-click-not-break`). The record at the click
   (`recordingAtClick`, DECISIONS item 270) is unchanged, so the build ledger L6 made still holds. The Delete Tool was
   already paid from its batch's answer. The break sound reaches the module-level answer handler through a sink
   `MinecraftWorld` fills while mounted (its sound hook lives there); a break answered after it unmounts is paid and
   counted, unheard.
321. **A hazard pays nobody.** `creditBrokenBlock` pays, counts and sounds only `source: 'player'`; the dragon's smash
   tags its posts `'dragon'`. Its debris still bursts. A block of the player's that the dragon breaks is lost, as a
   hazard's damage is; the build gate's conservation check (`tests/gates/build-edit-order-gates.test.js`) now counts the
   dragon's breaks as the third place a block can go.
322. **The smash takes the block each column stands on, one a column, and never a chest.** The ground probe answers a
   column's top face, and its floor is the air above the block: at `7250aa22` the gate's smash sent 38 cells and 19 held
   a block, each the second pick, one lower, which was the top block. The pick is the face rounded,
   less one: the audit wrote `ceil(g)-1`, equal on every column it measured (the face whole, or f32 noise just under);
   rounding also holds for noise just over. The second, deeper pick is dropped: with real picks it would let a strike
   that chose only the lower cell hollow the ground under an unbroken top, and in practice the craters were already one
   deep (the floor pick was air). A cell holding a chest record is skipped, so no strike leaves an invisible chest
   (`AUDIT:numeric:dragon-crater-pays-player-and-aims-at-air`).
323. **An empty chest mined comes back as the chest.** The chest's voxel is wood and its record is deleted at the click,
   before the worker answers, so the click tags its post `drop: 'chest'` and the answer pays one chest
   (`AUDIT:numeric:empty-chest-pickup-returns-wood`). Every hotbar block and every Forge good now round-trips.
324. **Every world query and the player's controller exclude dynamic bodies.** The block-break debris is the game's
   only set of them, and for its 2 s the build ray and the outline aimed at the cell it tumbled through, the ground
   probe and the anvil ray met it, the controller climbed it (its autostep includes dynamic bodies) and the ledge vault
   took a cube in flight for a ledge (`AUDIT:verbs:debris-colliders-catch-mine-rays`). `QueryFilterFlags.EXCLUDE_DYNAMIC`
   at the four `Terrain.jsx` rays (outline, ground probe, `castBuildRay`, `castWorldRay`), the ledge vault's two in
   `Components.jsx`, and the controller's sweep (`game/kinematicMove.js moveKinematic` takes the flags as a trailing
   argument). `render/SpatialAudioController.jsx` already counted static bodies only. The chaos harness's mirror of the
   Player loop was not changed: its world has no dynamic bodies, so its queries answer the same either way.
325. **The debris is drawn while it lives, gone when it dies, and asleep until a burst.** Its `instancedMesh` is not
   frustum-culled (three bounds an InstancedMesh by a sphere computed once, from the parked instances, and culled the live
   debris wherever a block was mined: `AUDIT:silent:block-debris-frustum-culled`); a dead cube is parked asleep at its own
   spot (a 20 x 10 grid 0.5 m apart at y -1000, so no two parked cubes touch) and its instance written at zero scale,
   since `@react-three/rapier` 2.2 writes no matrix for a sleeping body and the dead debris would otherwise stay drawn where
   it came to rest; the whole pool is parked so at mount, where all 200 bodies had fallen awake and overlapping for the
   whole session (`AUDIT:ultra:ultra-player-world-8`). Cost: 200 cubes of 12 triangles submitted each frame, against 200
   bodies stepped awake each frame before.
326. **A potion Used at the cap is kept and refused with a notice.** The Inventory's Use refuses a consumable whose every
   effect the cap would clamp away (an XP token is never refused): `deny.alreadyFull`, "Already full: keep it for later",
   zh 已经满了，留着以后用吧 (`AUDIT:numeric:potion-spent-at-full`). Just below the cap a potion is drunk as before.
327. **The XP token rule: a chest's XP token pays its own XP once, when it is Used; picked up, it pays what every chest
   item pays (10 XP).** The Diamond, Star Fragment and Golden Crown dropped carrying their own XP as the pickup's and paid it
   again on Use: a Golden Crown was 400 XP, and the choice `game/consumables.js` names for it, wear it or cash it in, cost
   nothing (`AUDIT:numeric:xp-token-pays-twice`). Use is the one payment because it is the choice; the pickup stays the
   same for every chest item, so a token still reads as loot when it is collected. A shrine's banked loot pays the same
   per item. A mob kill's drops keep their `LOOT_TABLES` XP, which is the kill's (a moss brute's Diamond pays 60 picked
   up and 50 Used). `CHEST_LOOT`'s `effect` and `value` fields are now read by no game code (registry row below).
328. **A strike the AI worker computed for a mob that has since died, begun dissolving, or stopped being a mob is
   dropped.** `game/perfectDodge.js strikesToApply` drops a strike whose mob the lookup no longer finds (AIWorkerSystem
   looks in `mobsQuery`, which a bound ally has left) or finds defeated (`combat/targeting.js isDefeated`, now exported)
   (`AUDIT:desync:stale-ai-reply-strikes-after-death`).
329. **The gates.** Red on `7250aa22`'s src (the log is `<session scratchpad>/l7/red-all-7250aa22.log`, not kept), green after:
   - `tests/gates/verb-ledger-gates.test.jsx` mounts the real `MinecraftWorld` through R3F's reconciler under the real
     `<Physics>` (`@react-three/rapier`'s ESM build, so the two share the reconciler), the real `BlockParticleSystem`, the
     real terrain worker in process (its replies pumped, so a click can land before the answer), the real quest hook and
     the real verb router, with `Math.random` seeded. Rows: two clicks before the answer are one break (at `7250aa22`
     `{broken: 2, sounds: 2}` against one `block_broken`); every hotbar block and Forge good round-trips (the chest came back
     as `{chest: -1, wood: 1}`); the smash breaks only blocks, never a chest, and pays nothing; and for 120 frames, aimed
     through a live debris cube, `castBuildRay`, the outline, `castWorldRay` and the ground probe answer the terrain under it
     while a ray with no exclusion meets the cube (0 of 120 at `7250aa22`).
   - `tests/gates/player-debris-gates.test.jsx` mounts the real Player (the `player-placement-gates` harness): a walk across
     a settled pile rises no more than on clear ground (0.511 m at `7250aa22`) and goes as far; a falling player's chest
     ray meeting a cube in flight does not vault (+0.749 m at `7250aa22`), while a real ledge vaults, also under a cube at
     head height.
   - `tests/gates/debris-lifecycle-gates.test.jsx` mounts the real `BlockParticleSystem` under the real `<Physics>` with a
     renderer that runs three r172's own cull: 0 awake, 0 falling and 0 overlapping parked bodies over 120 frames at mount
     (200 awake and falling at `7250aa22`); live debris in view drawn 60 of 60 frames (0 at `7250aa22`); past 2 s no dead
     instance shown and none awake (red under the half-fix, frustum culling off with no park matrix).
   - `tests/integration/inventory-consume.test.jsx` gains the potion rows; `tests/gates/token-xp-ledger-gates.test.jsx`
     follows every `CHEST_LOOT` row through the real chest and the real Use; `tests/gates/perfect-dodge-gates.test.js` gains
     the stale-strike row.
   - **Tests changed with a rule, the reason in each commit:** `terrain-quest-callback-gates` (a mine with a stub post
     counts nothing until the worker's `block_broken`), `build-edit-order-gates` (the smash's stub answers the cell's top
     face, as the real probe does; conservation counts the dragon's breaks), the L6 gates' import of `creditBrokenBlock`,
     `perfect-dodge-gates` (a strike from a missing mob is dropped, where it was pinned as landing),
     `mob-sense-body-gates` (its archer is a live mob in the ECS), `shrine-persistence-gates` (the shrine banks every
     item's pickup, not the token's own XP).
   - **Not checked here:** no local e2e or browser (CI runs them). The window two clicks need in a browser (within about
     a frame) was made by the pump, not by real input; the AI reply's handler is unchanged and its lookup not driven here;
     the Player-loop rows drive the real Player with Rapier, not the deployed frame loop.
330. **Bytes.** The index chunk (`vite build`) is 649,549 B on `7250aa22` and 650,441 B on `aa5934d4`: 892 B more, under the
   652,500 B ceiling (item 282) with 2,059 B to spare, so nothing was moved out to offset it. The lanes in flight beside
   this one share that room; whichever lands past the ceiling offsets what it adds.
331. **Found, not fixed** (registry): `REVIEW:l7:chest-loot-effect-fields-unread`;
   `REVIEW:l7:orphan-chest-record-pays-a-chest` (a chest record a pre-L7 smash left over air pays a chest for a block
   later mined in its cell); `REVIEW:l7:chest-mined-before-its-answer-pays-wood` (the click's drop tag cannot see a chest
   placement still owed its answer). The last two were found by reading the code and were not run.
332. **Round 2 (tests and records only) corrects item 327's reason: a Golden Crown's two uses are not exclusive.** Item 327
   said the crown's choice, wear it or cash it in, "cost nothing" and that Use is the one payment "because it is the
   choice". The store does not enforce a choice: `game/equipment.js` lets the crown be worn (head), `unequipItem` returns it
   to the bag, and Use cashes it in for 200 XP (`game/consumables.js`), so a player can wear it, take it off and cash it
   in. What holds is narrower, and it is the rule: the token's own XP is paid once, on Use, because Use uses the item up;
   wearing pays no XP, so wearing first costs nothing and adds no XP. Making the two exclusive
   would be a design change nobody has asked for, so none is made. The code comment in `QuestSystem.jsx` ("worn or cashed
   in, not both") said more than the store does and is corrected, as is the stale comment in `BlockParticleSystem.jsx`
   (it still said a dead cube keeps full scale and is teleported; it is parked asleep at zero scale). Round 1 static
   review, findings 1 and 2.
333. **The dragon's smash now breaks about twice as many real blocks per strike, and that is kept.** At `7250aa22` each
   column pushed two picks, the air above its top block and the block, so half of every strike's picks broke nothing; now
   every pick is a block (item 322 recorded the crater's depth, not this count). Measured on the two functions
   (`7250aa22`'s `bossSmash.js` and this lane's), driven as `render/BossEntity.jsx` calls them: radius 5.0, a cap of
   `floor(random * 5) + 4` blocks, centred on the ground under the strike, the ground answering the generator's top face;
   2,213 strikes at random centres over an 800 x 800 area about the hub (787 draws on sea or hub columns skipped), each
   strike drawn identically for both. Both pick 5.94 cells a strike (the cap's mean is 6.0 and nearly always binds: a
   radius-5 disc holds about 78 columns); before, 2.99 of them held a block (49.6% air), after, 5.94 (ratio 1.99). A radius-5 strike is therefore twice
   as hard on the player's placed blocks, which are lost and never paid back (item 321). Kept: the cap of 4 to 8 is the
   number of blocks the author asked a strike to break, and the air picks silently halved it; a gentler hazard is a change
   to that cap in `BossEntity.jsx` (two sites), not a reason to keep aiming at the air. "A block" here is a cell at or
   below the generator's surface; trees, placed blocks and caves are not modelled, and the probe is not kept. Round 1
   static review, finding 3.
334. **The break sound's position is gated.** Item 320 said the sound plays at the block and no gate read where. Row 1 of
   `tests/gates/verb-ledger-gates.test.jsx` now asserts, for the first break and for the control break, that the worker
   emptied the cell the click aimed at and that the last sound is at that cell's centre. `scripts/dev/mutate.sh` on
   `world/mineAtHit.js` (verb-ledger, 4 tests): the identity mutant (a comment) survived; RED: S1 the sound at the world
   origin, S2 no position, S3 the block's corner, not its centre. Round 1 dynamic review, claim 6 and finding F1.
   **Not measured:** how long after the click the sound arrives in a browser. The worker handles messages one at a time
   and the streamer posts up to two `generate` messages every 150 ms, so while chunks stream the sound waits behind them;
   the block's removal always waited for the same answer, so the sound, the debris and the removal now land together. That
   is Kevin's real-device call.
335. **Where each new sub-assertion was seen red.** Round 1's static review found that each red row stopped at its first
   failing `expect`, so later ones were never seen red. Re-run this round on `7250aa22`'s `frontend/src` with every
   `expect` after the first `describe` made soft (`expect.soft`, so a row runs past its first failure; scratch copy, not
   kept), the gates as they stand at the head:
   - **Red at `7250aa22`, each for its own reason:** verb ledger: two clicks `{broken: 2, sounds: 2}`; the chest round trip
     `[chest, ...]`; the smash: 19 of 38 posts held a block, it took the chest's cell, the chest did not survive (the top
     read 48, not 49), and it paid `{grass: 18, wood: 1}`; all four world queries 0 of 120. The commit body of `7ee97985`
     says 36 sent and 14 broken for the smash, which differs: the gate as committed reads 38 and 19. Player debris:
     `{rise: 0.511, walked: 11.89}` against `{0.054, 12.22}` clear (both clauses red); the vault +0.749 m off a cube in
     flight; the head ray's cube took a real ledge's vault away (-0.57 m for more than 0.2). Debris lifecycle: 200 awake and
     200 falling; drawn 0 of 60; past 2 s `{meshDrawn: false, shown: 8, awake: 192}`. Token ledger: Golden Crown 400, not
     210. Potion at full `{count: 1, value: 100, notices: 0}` for `{2, 100, 1}`. Stale strikes `[live, dead, dying,
     bound]` for `[live]`.
   - **The overlap check could not see its own defect and is fixed.** It read 0 at `7250aa22` because it was taken after
     120 frames, when a falling pool has scattered. It is now also read at mount, before the first step, and the larger is
     asserted: 19,900 pairs (all 200 bodies at one point) at `7250aa22`, 0 at the head. Mutants on
     `BlockParticleSystem.jsx` (debris-lifecycle, 2 tests): identity survived; RED: B3 the pool not parked at mount, B4 every
     body parked at one spot (asleep, so only the overlap clause sees it in row 1).
   - **The sound-position rows are red both ways.** At `7250aa22` the sound played twice, at the click's hit point on the
     block's top face (y 49.0 where the block's centre is 48.5); on the head, S1 to S3 (item 334) are red.
   - **Not red at `7250aa22`, proven by mutants.** The potion refusal's notice: its `warn` type was read but its text was
     not (no gate read the kind of notice), so this round adds `'Already full: keep it for later'`; `denyToast.js` mutated
     to `info` (N1) and `GamePanels.jsx` raising `delete-rule` instead (N2) are both RED against `inventory-consume` (5
     tests), the identity mutant surviving. At `7250aa22` the refusal does not exist, so neither assertion can be reached
     there.
   - **Unproven, and said so.** Controls and setup, which are green on both sides by design and whose killability this
     round did not show one by one: row 1's control click, the potion rows just below full (item 326's P4 in `f0b602a0`),
     the changed first row of `perfect-dodge-gates`, and every `SETUP:` precondition.
336. **Found, not fixed** (registry): `REVIEW:l7:break-sound-spatial-trigger-captured-once` (found by reading, not run; for
   the audio lane); and the `mob-floor.spec.js:227` sighting of run 41212401755 (shard 6/8, retry #1 passed) is appended to
   `REVIEW:e2e-flakes:mob-floor-roof-floor-infinity`.

---

## 2026-10-31 — [LOOP] a bundle ceiling never rises to make a build green; the lookbook seam leaves the boot chunk

**The command session's ruling:** a bundle ceiling does not rise to make a red build green. The script says so at
`frontend/scripts/ci/bundle-budget.mjs:30-31` and `CLAUDE.md` says "Never weaken to pass"; two lane items did it anyway.

282. **Growth is offset by moving code players never run out of their download, as here.**
   - **It supersedes** the builder-decided raises in lane L3's item 257 (PR #69, 652,500 B to 656,015 B) and lane L6's
     item 278 (PR #68, 652,500 B to 655,000 B). Neither is on main. The ceiling stays 652,500 B, and each lane fits under
     it or offsets what it adds, saying so in its own item.
   - **What moved.** `render/lookbookSeam.js`, the lookbook probe's door into the production build, installs only for
     `?lookbook=1`, yet every player downloaded it. It is now two modules. `render/lookbookState.js` holds what the game
     reads (the pose, the hand pose, the passes switched off, the dragon's hold, `parseLookbookParam`,
     `applyLookbookPose`, the subscription) and stays in the boot chunk, with every value null, false or empty until the
     seam writes it. `render/lookbookSeam.js` keeps the installer, its validators and the probe's pure helpers, and is its
     own chunk, which `index.jsx` fetches with a dynamic `import()` on a `?lookbook=1` page only. The six game readers
     (`Components.jsx`, `Sun.jsx`, `postFx.jsx`, `playerRender.jsx`, `BossEntity.jsx`, `bossSystem.js`) import the state
     module.
   - **Measured** with `npm run build` on `86f6b5dc` and on this branch: the index chunk 651,328 B to 645,324 B (6,004 B
     less), against the unchanged 652,500 B ceiling, so its headroom goes from 1,172 B to 7,176 B. The new chunk,
     `lookbookSeam-<hash>.js`, is 6,849 B. By the two lanes' own figures, which this lane did not re-measure, L3 adds
     3,515 B and L6 about 2,621 B (653,949 B on `feb456e3`'s 651,328 B), 6,136 B together, which fits.
   - **The boot contract is kept.** A player's page runs `boot(null)` in the same run as the entry module, as before.
     A `?lookbook=1` page awaits the chunk, then sets `window.useGameStore`, installs the seam and starts the game in one
     run, so every observer that waits on the store (the e2e boot, the probes, `scripts/ci/prod-smoke.mjs`) finds the
     seam installed the moment the store exists. Top-level `await` is not available (the build target is vite 6's default,
     `chrome87`, `safari14` and the like, and raising it is a build-wide change this lane did not make), so the wait is
     an `async` function.
   - **The one cost.** If the seam's chunk fails to load, a `?lookbook=1` page stops with the error and does not start
     the game. Only the probe opens that page. The other choice, starting the ordinary game and throwing the error
     later, was left out because no gate would cover it.
   - **The gates.** `scripts/ci/bundle-budget.mjs` gains a marker check, the same shape as the dragon's: an error
     message only the installer carries must be absent from the boot chunk and present in exactly one other. Three
     mutants, each rebuilt: a static import of the seam in `index.jsx` (the check goes red; the index chunk measured
     651,930 B, inside the ceiling, so the ceiling alone would have let the seam back in), the seam never imported (found
     in 0 chunks), and the marker misspelled (found in 0 chunks). `tests/gates/lookbook-install-gates.test.jsx` now
     counts the loads of the seam's module (none on a plain page, one on `?lookbook=1`) and asserts that the store and the
     seam appear in one run; ten mutants of `index.jsx` are red, and the seam's own URL test (its mutant survives
     there by design) is `tests/gates/lookbook-seam-gates.test.js`'s, which gains eight mutants of the split, all red.
   - **Not proven here.** No browser or e2e ran locally. CI runs `lookbook-seam.spec.js`, `ore-glow.spec.js`, every
     other `?lookbook=1` spec and `prod-smoke` on the exact sha, and that is the lived proof that the probe still finds
     the seam.

## 2026-10-31 (lane L6, round 3) — [LOOP] the index chunk's ceiling stays at 652,500 B: item 278's raise is withdrawn and the bytes are cut from code nothing reads; the Delete Tool's notice states its rule

**Ruled by the command session** (consistent with lane L3's): `bundle-budget.mjs` ("RAISING one to make a red build go
green is a reward-hack and is forbidden") and `CLAUDE.md`, "Never weaken to pass", forbid what item 278 did. Round 2's two
reviews had landed (no correctness defect in scope); this round is the fixer's short pass on three points. Branch
`fix/l6-build-tools`.

279. **Item 278 is superseded: the ceiling is back at 652,500 B and the lane fits it.** The raise (`0bfbfc11`) is undone by
   a new commit that sets `max` to 652,500 again, not by a reset. The index chunk, built with `vite build` on a clean
   archive of each commit, went 654,131 B (the merge of main, `4be3e177`, whose changes touch no `frontend/src` file)
   to 653,038 B (`983d5711`), 652,253 B (`1152d96c`) and 652,236 B at the head of the notice fix (`2865a75b`): 1,895 B
   cut from the first figure, 264 B under the ceiling. `983d5711`'s message says 652,964 B; that figure is the tree with
   `payBrokenBlock` folded as well, which is a later commit; the figures here are the measured ones.
   - **What was cut, each name word-bounded across `frontend/src`, `frontend/tests` and `frontend/scripts` at `fdcd9f62`
     with no use but its own definition (`git grep -nw <name> fdcd9f62 -- frontend/src frontend/tests frontend/scripts`
     returns that line alone; at HEAD it returns nothing):**
     - `useGameStore.jsx`, 13 setters: `setPlayerRigidBodyRef`, `setOnSpellCast`, `setOnBlockPlace`, `setOnBlockBreak`,
       `setOnChestOpen`, `setOnPlayerDeath`, `setCheckNearbyChest`, `setOpenNearbyChest`, `setGameCamera`,
       `setCastSpell`, `setChestInventory`, `setInventory`, `setLastDamageTime`. The state each wrote is still read and
       still written with `setState`.
     - `checkNearbyChest`, the store key and QuestSystem's one write of it: published, read by nothing anywhere
       (`openNearbyChest`, which calls the same `checkChestProximity`, is read by `input/talk.js` and stays).
     - `SoundManager.jsx` `useGameSounds`, 7 members: `playFootstep`, `playRoar`, `playGrab`, `playHurl`, `playSlam`,
       `playAnvilHit`, `playBind`. The footsteps and the Aspect verbs play through the store's `playSpatialSound` with the
       same registry names.
     - One copy of each repeated helper: the headroom guard that seven voices spelled out (`audio/headroom.js limitPeak`,
       with `src/audio/headroom.test.js`, which the guard never had: its function, that all ten voices call it with their
       limit, and 300 seeded slams within 0.98), `seededUnit` (`spellVfx.jsx` kept `spellGeometry.js`'s), the resize
       subscriber (`useSpellAnchor.js` kept `hudLayout.js`'s `subscribeResize`), and `payBrokenBlock` as a batch of one.
     - Measured separately on the tree: the setters and the sound members 1,038 B, `checkNearbyChest` about 55 B, the
       `payBrokenBlock` fold about 74 B, the limiter 619 B, `seededUnit` and the subscriber 166 B.
   - **Looked for and not found:** knip and `knip --production` were clean before and after; no i18n key is dead
     (`scripts/ci/i18n-dead-keys.mjs`: 322 keys, 0 dead); of the 103 keys the source publishes with `setState`, none but the one
     above is read by nothing; every registry name in `VOICES` is still named at a trigger. Exact-clone and
     object-member scans over the index chunk's sources found the duplicates above and no more that were safe to take.
   - **Left alone.** Lane L3's boss and squad paths: `setDamageBoss`, `setGetBossPosition` and `setBossActive` are
     unread setters too, and L3 is cutting there. Lane L12 owns the rest of the dead setters. Left in `useGameStore.jsx`
     for whoever owns it next (about 350 B, a behaviour-preserving extraction, outside "unread setters"): `equipItem` and
     `unequipItem` repeat a bag-return block and a stats block. `getPlayerXP` and `isBeastFormActive` are read only by tests.
     The voice factories' shared buffer preamble (29 copies) is not folded: `src/audio/synthVoices.test.js` asserts the
     floored frame count at 20 or more sites in the source, a gate that would need rewriting for a few hundred bytes.
   - **The next lane that grows this chunk meets the ceiling at 264 B of room and says why**, as item 278 meant to.
   - **The notice (round 2's static finding 3, confirmed).** A Delete Tool click that took nothing said "takes only blocks
     you placed", which is untrue of a chest the player placed and of a block placed a moment ago whose record is written when
     the worker answers. It now states the rule and the exception ("The Delete Tool takes back only blocks you placed, never a
     chest"; zh 删除工具只拆你放的方块，不拆箱子), as `deny.deleteRule`, and a click made while an edit is owed its answer says
     nothing (`cellEdits.editsOwed`); the next click takes the block. This amends item 271's wording only. Gated in
     `tests/gates/build-edit-order-gates.test.js` (a placed chest stays and nothing reaches the worker; an owed placement is
     silent and then taken; the ground still says it) and the table gate's text. Nine real mutants red, one identity mutant green.
   - **Found, not fixed** (registry): REVIEW:l6:chest-indicator-interval-after-teardown (one unhandled `window is not defined`
     from ChestIndicator's poll in a related-test run at commit time, 67 files green, gone on the next run).
   - **Not checked:** no local e2e or browser; the silence while an answer is owed is a few frames on a busy worker, which the
     unit gate drives with the worker's replies held back and the real device has not shown.

---

## 2026-10-31 (lane L6, round 2) — [LOOP] the record and the worker agree whatever lands before an answer, the Delete Tool takes back only the player's own blocks in one answer, and every label says the size it builds

**Decided by the command session** under the standing grant (DECISIONS 2026-10-28 item 14), on lane L6's round-1
reviews (static finding 1 and dynamic P8, required; static 2 to 5; dynamic's four cheap items). Branch
`fix/l6-build-tools`, PR #68. Items 270-278.

270. **A placement's late answer never writes over a later record.** Item 231 made a placement record its cells when
   the worker answers, while the single mine and the dragon's smash record theirs at the click. So a right-click and
   then a left-click on the same cell before the answer left the record holding the block and the worker holding air:
   a reload brought the mined block back while the player kept its payment, an empty cell refused every placement
   until then, and a chest became a storage chest over air (reproduced by the round-1 dynamic review: `record=3
   voxelNow=0 voxelAfterReload=3`). Every edit that writes the record now takes a number as it is posted
   (`frontend/src/world/cellEdits.js`); a writer at the click (`world/mineAtHit.js`'s single mine,
   `world/bossSmash.js`) stamps its cells while any batch is owed, and a batch's answer records a cell only when no such
   writer stamped it after the batch was posted. The worker applies messages in order and answers batches in order,
   so only a writer at the click can be newer than an answer. **Not** "the newest edit wins": a second placement of a
   cell before the first's answer is refused by the worker, so the first's block is the one there and must be
   recorded; that rule left the cell unrecorded (mutant M2 below). The ledger lives as long as the page, as the worker
   does, and is emptied whenever no batch is owed. The smash moved out of `render/BossEntity.jsx` unchanged so a gate
   drives it.
271. **The Delete Tool takes back only the blocks the player placed** (supersedes item 233's call to keep a footprint
   harvest of any block). Its left click removes, within its footprint, only cells the store records as placed
   (`worldBlocks` holds every placed cell), each paid back as itself; generated terrain, ore and water are left, and a
   chest is never removed, empty or loaded (round-1 static finding 3: an empty chest cost 8 wood and paid back 1). The
   reason: a build tool takes back what was built, and a 64-block harvest a click, ore included, was an economy rate
   nobody had measured (registry REVIEW:l6:delete-tool-harvest-rate, closed by this). The pickaxe is the way to dig.
   The tool's label now says so ("Remove the blocks you placed, 3x3x3"), and a click whose footprint holds none of
   them says why it took nothing ("The Delete Tool takes only blocks you placed"; zh 删除工具只拆你自己放的方块), so a
   click on the ground does not read as a dead tool.
272. **A batched removal is one message** (round-1 static finding 2). The worker's `cells_edited` now carries the
   blocks a removal took, in place of one `block_broken` for each, so a 64-block click is one message, one record write
   and one inventory write per kind of block, not 64 of each. Debris bursts for the first 4 blocks of an answer only
   (`frontend/src/world/debrisBursts.js`: 32 bodies of the 200-body pool, about the dragon's smash), where each of 64
   messages had woken 8. A lone `block_broken` (the single mine, the smash) is unchanged.
273. **Every label says the size its tool builds at, and the slider ends at the picked tool's largest size**
   (`frontend/src/ui/GamePanels.jsx`; round-1 dynamic C5: at the slider's 10 the panel promised a 10x10x10 cube and a
   10x10 floor, and the cell cap built 4x4x4 and 8x8). The slider runs to 10 for a wall, 8 for a floor, 4 for a cube or
   the Delete Tool, and 1 for Single; the readout and the labels show the size each tool will build. The store keeps
   the size the player slid to, so a wall's 8 comes back after a cube's 4. This reverses the 2026-08-11 note in
   `game/buildFootprint.js` that the slider stays 1 to 10 whatever the mode.
274. **The worker's answers to the build verbs are heard at module scope** (`Terrain.jsx`, `cellEdits.heard`): a
   batch's `cells_edited` and a lone removal's `block_broken` both, so what a click spent or took is paid back and
   recorded whatever unmounts first. Item 230 claimed that while the Delete Tool's payment still came through the
   component's listener (round-1 static finding 4); item 230 is corrected in place. The double-count guard the lane
   had deleted as a source grep (static finding 5) is back as behaviour: `terrain-quest-callback-gates` drives a mine,
   a Delete Tool removal and a placement over the real worker, every reply heard as Terrain.jsx hears it, and a mine
   counts one break, not two (the source-grep population stays at 94).
275. **The gates, red first at round 1's code** (a scratch copy of this round's tree with `placeAtHit.js` from
   `aa523a49`, the one file whose answer wrote over the record; the panel gate against the round-1 panel):
   - `frontend/tests/gates/build-edit-order-gates.test.js` (new): the real worker takes each message as it is posted,
     its replies held until the test hands them over (`tests/_support/terrainWorker.js` `deferred`). Five named
     interleavings (place then mine then answer; a chest placed then mined; the smash over an owed placement; two placements of one
     cell; place, mine, place) and a seeded run of 300 clicks and answers that reads record against worker at every
     quiet point and conserves each block kind. At round 1's placeAtHit: 4 of 6 red, `record: 3, voxel: 0` and
     `record: 6, chest: true`, exactly the review's prediction.
   - `build-tools-worker-gates`: the Delete Tool's oracle is the player's own blocks, chests never taken, one answer
     and no `block_broken`; a new case removes a 64-block own cube: one answer, store writes one more than a one-block
     removal's, debris for 4. `build-tools-table-gates`: each tool's left click on generated ground and on a 3x3x3 of
     the player's own blocks; a new case per tool reads the label at every slider size 1 to 10 against what the verb
     builds (round 1's panel: floor at 9 built 8x8, cube at 5 built 4x4x4, Single read 2, the Delete Tool's label
     named no size). `place-executor-gates` asserts each notice's text, not only that one was raised (dynamic R-N).
   - The chaos harness runs the single mine through the real `mineAtHit` and every batch through the real
     `cellEdits`; a batch's answer arrives half the trimesh lag after the click, so 3 of 4 lags answer late, and a new
     invariant, I8, reads the record against the voxel grid whenever no answer is owed and at the session's end. A load
     drops the answers still owed, as the page's reload does. At round 1's placeAtHit I8 went red in 5 of the 16
     field and origin sessions at seed 1. The Delete Tool's chaos clicks aim at the player's nearest own block 7 times
     in 10; seed 1 still takes 318 to 529 blocks a file (floor 250).
   - e2e: `build-placement.spec.js` places a 3x3x3 in the sky, takes it back with the Delete Tool's left click through
     `GameMethods.terrainVerbs.mine` (dynamic R-O: nothing had driven that closure), checks the payback and the
     record, that generated ground under it is left, and that the cube places again where the worker holds air. CI is
     the arbiter: it was not run here.
   - Mutation runs (`frontend/scripts/dev/mutate.sh`, a throwaway copy of the round-2 tree): 25 real mutants, all 25
     red, and 2 identity mutants (comments in `cellEdits.js` and `GamePanels.jsx`) survived. Each is named on the
     `Mutation-Proof` trailer of `a71dc963` or `aa8f469b`; the e2e case (`70cad2bb`) has no red-first run.
276. **What this round does not change.** The single mine still records at its click and pays from its `block_broken`;
   the stand-in colliders, the body check and the footprints are item 130's and item 232's, untouched. A page reload
   with an answer in flight still loses that click (registry REVIEW:l6:edit-answer-lost-at-reload, amended).
277. **Found, not fixed** (registry): REVIEW:l6:load-hold-empty-column (round-1 dynamic C6b: a load whose saved column
   was dug empty holds the player about 10 s, then sends them to the origin spawn; the load path's to fix, and with
   item 271 the Delete Tool no longer empties a column cheaply); the mob-floor.spec.js:227 and ember.spec.js:202
   sightings on PR #68's run, each on its row.
278. **(Superseded by item 279: the raise is withdrawn and the ceiling is 652,500 B again.) The index chunk's ceiling goes from 652,500 B to 655,000 B** (`frontend/scripts/ci/bundle-budget.mjs`), in its
   own commit. Measured with `vite build` on each tree: main at `8579918e` 649,342 B; lane L6's round 1 on it
   (`aa523a49`) 651,326 B, +1,984 B; main at `feb456e3` (lane L9 landed) 651,328 B, +1,986 B; this lane's head on it
   653,949 B, so round 2 adds about 637 B (the edit-order ledger, the batched removal's payment, the debris choice;
   the smash stays in the dragon's lazy chunk). Each lane fit alone; the two together pass the old ceiling by 1,449 B.
   The growth is the behaviour items 230-233 and 270-272 call for, none of it can load later than the first click,
   and the new ceiling leaves 1,051 B over that head (869 B after item 271's notice, 654,131 B), so the next lane that
   grows the boot chunk meets it and says why.

---

## 2026-10-31 (lane L6) — [LOOP] build tools that do what they say: the worker fills only empty cells and answers which, every footprint grows from the face it is aimed at, the Delete Tool removes its footprint, and the panel reads the store

**Decided by the command session's lane L6 builder** under the standing grant (DECISIONS 2026-10-28 item 14), from
the deep audit's lane L6 (`docs/superpowers/audits/2026-10-30-deep-audit.md` section 4; registry
`AUDIT:lane:L6-build-tools`). Branch `fix/l6-build-tools`. Items 230-237.

230. **The worker fills only an empty cell, and says which cells it changed.** Only `frontend/src/world/terrain.worker.js`
   holds the voxels, so a multi-cell placement wrote every cell of its footprint whatever it held: ore, built stone and a
   loaded chest's wood were replaced with no drop and one debit each, and a cell at y 256 was paid for, sounded and
   dropped (registry AUDIT:numeric:footprint-overwrites-solid-cells, AUDIT:numeric:place-above-world-ceiling-swallows-block).
   A footprint now goes to the worker as one `edit_cells` message (`frontend/src/world/cellEdits.js`, the audit's
   `place_if_empty` widened to the Delete Tool's removal). A cell changes only into the other kind: a block fills only air
   or water (water stays placeable), and a removal takes only a solid block, so it never drains water. No cell outside
   y 0 to 255 is written. The reply `cells_edited` names the cells changed and is posted before the meshes; then each
   chunk the batch names is re-meshed once, stamped with the batch's last seq, so the stand-in of a cell the worker
   refused retires on that mesh like any other (item 132's registry, unchanged). The listener lives at module scope in
   `Terrain.jsx`, as long as the worker, so a click's blocks are paid back or recorded whatever unmounts first.
   Cost: one message and one re-mesh per chunk a click touches, where a 27-cell cube had been 27 messages and 27
   re-meshes; `update_block` stays for the single mine. **Corrected in round 2:** until item 274 a Delete Tool
   removal's payment came through the component's `block_broken` listener, so an unmount lost it, and until item 272
   its removal still posted one `block_broken` per block, so its cost was one message per block taken.
231. **A placement pays at the click and keeps only what the worker filled** (`frontend/src/world/placeAtHit.js`).
   Held back before anything is spent: a cell outside the world (notice "No room: the world ends there"), a block the
   player built, a chest's wood included, since `worldBlocks` records every placed cell ("No room: a block is already
   there"), and a cell the body fills (item 130's guard and notice, unchanged and first). The rest is paid for at the
   click, cell by cell up to the stack, so a second click before the answer cannot spend the same blocks; each paid
   cell's stand-in is made at the click (item 132). On the answer the cells the worker refused are paid back with the
   "already there" notice, and only the filled cells are recorded, sound, spark, earn the day's ember and count once for
   Master Builder; a chest becomes a storage chest only if its cell was filled. `placeAtHit` now resolves to the cells
   filled. **The trade-off:** a stack shorter than its footprint pays for the footprint's first cells, and a solid one
   among them is paid back rather than moved on to a later empty cell. Sending every cell with a budget would fill more,
   but each sent cell needs its stand-in at the click, and a stand-in over air the worker then leaves empty is an
   invisible wall until the answer, the class item 130 closed. **Edge left:** a page reload or world load in the
   milliseconds between a click and its answer loses that click's paid blocks (registry REVIEW:l6:edit-answer-lost-at-reload).
232. **Every footprint grows from the face it is aimed at** (`frontend/src/game/buildFootprint.js`). This reverses the
   2026-08-11 rule in that file, never a numbered item here, that a wall off a floor face grows along +x so as not to be
   "buried": the cell off a top face is the air above the ground, so the strip ran east whichever way the player faced,
   sometimes into their own cell (registry AUDIT:ultra:ultra-game-logic-2), and its gate pinned it. A wall is a column
   rising from the aimed cell, hanging down from a ceiling. A floor or a cube off a side face grows out along the normal
   and is centred across it, where it had been centred on the aimed cell along the normal too, so a third of it sat in
   the block it was placed against; a cube's height rises from the cell and falls from a ceiling. The Delete Tool's
   footprint (item 233) grows into the face. No normal reads as a top face.
233. **The Delete Tool removes its footprint** (`frontend/src/world/mineAtHit.js`, new). "Delete Tool - Remove multiple
   blocks" made a right-click build a 3x3x3 cube of the selected block (up to 64 cells) and left a left-click mining one
   block (registry AUDIT:numeric:delete-tool-places-cube); `buildFootprint`'s comment named a caller that routes delete
   to mine, and none did. Its left-click now sends every cell of its footprint (a cube into the face: down from a top
   face, up from a ceiling, centred across a side face) as one removal; the worker takes each solid block and each is paid
   back as itself by the existing `block_broken`. Water and air are left. A chest with something in it is never sent, as
   the verb router never mines one (`frontend/src/input/verbRouter.js`); an empty chest goes with its cell, paid as its
   wood, as a single mine pays it today. One break sound and one Miner count a click, and none when nothing was taken.
   Its right-click places one block. The economy is the cap's (`MAX_CELLS`, 64 at size 4), the 2026-08-11 call that a
   multi-cell removal is symmetric with a multi-cell placement because mining pays; it lets a player take up to 64 blocks,
   ore included, a click, and is kept rather than cut (the panel's footer already said "Left-click to remove"). The single
   mine moved here from `Terrain.jsx` unchanged, with the `block_broken` payment (`payBrokenBlock`), so the unit suite
   drives the verbs the router calls; lane L7 (credit from the effect) edits them here. **Superseded by item 271:** the
   Delete Tool takes back only the blocks the player placed.
234. **The Building Tools panel reads and writes the store** (`frontend/src/ui/GamePanels.jsx`). It kept its own mode and
   size and wrote them over the store's on every opening, so a chosen mode was lost each time the panel opened (Single,
   size 3). It now shows `buildingMode` and `buildSize` and writes them through the store's setters; each tool button
   carries `aria-pressed`. The store's opening size is 3, the panel's old default, so a fresh player's labels ("Build
   3-high walls") still hold. The store's `selectedBuildBlock`, which only that effect wrote and nothing read, is removed:
   half of the reset plan's architecture row A22 (`isWebGLContextLost` is not touched here).
235. **The gates, red first at `0670a825`'s code** (a scratch copy with the new tests, the new transport module, which
   nothing in that code calls, and the old mine verb extracted verbatim as `mineAtHit.js`):
   - `frontend/tests/gates/build-tools-worker-gates.test.js` (new): the real terrain worker and the real `placeAtHit` and
     `mineAtHit`, 48 seeded placements and removals of random mode, size, face and stack over six boxes whose every
     cell is set through the worker's own edit table (air, water, natural and ore, built, chests with and without
     things in them; two boxes against the world's top and bottom), so each cell's content is known here and not read
     from the code under test. The oracle is exact: the cells filled are the paid cells that held air or water; the
     debit, the record and the chests follow; what the worker holds afterwards is read back cell by cell through
     `update_block`. Floors on what the run reached (cells filled, paid cells refused, water filled, cells off the world,
     built cells met, short stacks, blocks removed, water left, a chest kept and an empty one taken). Two cases drive the
     worker alone: no cell outside the world changes, and a fully refused batch still re-meshes its chunk with its seq.
     At the old code, every check soft (scratch only): 28 solid cells overwritten, 23 of 37 placements debited and
     recorded wrong, 3 cells off the world and 9 chest cells sent.
   - `frontend/tests/gates/build-tools-table-gates.test.jsx` (new): one row per tool the real panel offers, read from
     its buttons (a tool without a row fails): picked, the panel closed and reopened (the mode, the size and the picked
     button kept), then a right-click off a flat ground's top face and off a wall's side and a left-click on the ground,
     against the real worker on a site set cell by cell, each tool's cells written out by hand. At the old code all 5
     rows red at the reopen; with that check removed and the mode restored (scratch only): the wall row along +x, the
     floor and cube off the wall into the wall, the Delete Tool's right-click placing 27 and its left-click taking 1 of 27.
   - `frontend/tests/gates/build-footprint-gates.test.js`: the pinned sideways wall replaced (5 new cases, red at the old
     code); `frontend/tests/gates/place-executor-gates.test.jsx`: its cases written for both the old and the new worker
     protocol, 5 new ones (y 256, a wall run past the top, refused cells paid back and said, a refused chest, a chest
     and a built block held back) and the ember case extended to a refused cell, all 6 red at the old code.
   - `frontend/tests/gates/terrain-quest-callback-gates.test.js` drives `mineAtHit` instead of reading `Terrain.jsx`
     (the source-grep population falls 95 to 94); the puff gate, the invisible-box gate
     (`frontend/tests/integration/place-clear-of-player-rapier.test.jsx`) and the chaos harness answer the batched edit
     as the worker does. The chaos driver's left clicks are the Delete Tool's a fifth of the time, through the real
     `mineAtHit` (floors: 20 clicks, 250 blocks, 12 under the feet, per file), and a session resets the store's world
     record. Seeds 1 to 8 locally: every invariant green on every file, deepest 0.000 m (CI plays seed 1).
   - The commit tier on the core commit's tree without the driver's Delete Tool clicks read I3 in one session (cave,
     60 Hz, lag 2, seed 1, frame 360): a pit the player dug in the two-high tunnel's floor, the arcane form swapped in
     under the ceiling, its walls generated rock. That is the open REVIEW:chaos-play:rim-wedge, which main's driver no
     longer reached. The old placement recorded overwritten generated rock as the player's own blocks, and I3's escape
     test may mine the player's own blocks (REVIEW:chaos-play:own-block-escape-hides-wedge), so with the record honest
     such a wedge reads red where it read as an own shell. The driver change went into that commit (`b1c8c690`) so the
     tier is green on it; seeds 1 to 8 at the lane head are green on every invariant of every file, deepest 0.000 m. Both rows carry the sighting; the wedge is not this lane's to fix.
   - Mutation runs (`frontend/scripts/dev/mutate.sh`, throwaway copies of the lane head): 49 runs, 4 identity mutants
     (comments in the worker, twice, `buildFootprint.js` and the panel) survived; 44 real mutants, 43 red. Red on the
     worker gate: the occupancy check removed, water counted solid, the reply naming every cell, the worker's y guard
     narrowed, a chunk re-meshed only where a cell changed, `placeAtHit`'s off-world and built-block filters, its
     payback, recording every paid cell, the Delete Tool routed to the single mine, a loaded chest sent, an emptied
     chest kept, a removal sending off-world cells, the transport answering with no cells. Red on the executor gate:
     the same filters, payback and record, an unfilled placement crediting, both notices dropped, a refused chest still
     made a storage chest; on the puff and quest gates, an unfilled placement crediting and an empty removal counting.
     Red on the table gate: `aria-pressed` false, the panel showing Single whatever the store holds, the slider writing
     nothing, the store opening at size 1, the Delete Tool's right-click building its cube, the single-mine routing, an
     unrecorded removal, a removal paying two, the empty answer, and three footprint mutants; on the footprint gate,
     six. The one real survivor is expected: the worker's occupancy check removed, against the table gate, whose site
     holds no block in any footprint (the worker gate reds on it). The chaos floors red when the driver's Delete Tool
     click is never taken.
236. **e2e.** `build-placement.spec.js` aimed its synthetic hits 4 m under the camera, inside the ground, and passed only
   because placement overwrote solid cells; it now builds in the sky (y 200) and awaits the place verb's answer.
   `ore-glow.spec.js` awaits it; `the-cut.spec.js` polls the placed cell's record; `place-clear-of-player.spec.js` reads
   the placed cell and the stack when its watch settles, not in the click's own handler. CI is the arbiter: none of
   these ran locally.
237. **Found, not fixed** (registry rows): REVIEW:chaos-play:rim-wedge and REVIEW:chaos-play:own-block-escape-hides-wedge
   amended with item 235's sighting; REVIEW:l6:edit-answer-lost-at-reload (item 231's edge);
   REVIEW:l6:hud-shows-no-build-mode (nothing on the HUD says a build mode is on, so a cube or a removal can surprise
   a player who closed the panel); REVIEW:l6:delete-tool-harvest-rate (item 233's 64 blocks a click, ore included,
   unmeasured against the economy).

---

## 2026-10-31 — [LOOP] the Command Record keeps the glance and gains a terse record below it (amends item 280)

**Kevin, 2026-10-31, after seeing the eli5 page, verbatim:** "the command record looks good as a one-glance summary to
me, but i would want the details (previously you made it basically like a changelog of things?) on it too, if i want
to scroll down to read into the details. what i meant when i said too much text was that the text was a bit too
verbose ... you decide the best shape for this command record html."

281. **The page is the glance on top and a terse record below it** (amends item 280, which made the whole page the
   glance and left the detail to other files). The top is item 280's glance, unchanged: five drawings, one short line
   each, 233 visible words. Below a ground-line divider, "The details": one fact a row, about 15 words at most, no
   paragraphs, every PR linked on GitHub, in six parts: what landed since the 2026-10-27 handover by UTC day (every
   merged PR from #22, and the direct landings that matter: Wave 1, branch protection, the deep audit's record, the
   Command Record's versions); the bug hunt (the invisible box, the audit's 8 HIGH rows, the 3 HIGH rows the fix lanes
   found, the twelve lanes and their state); a selection of the non-routine calls, each with its item; in flight and
   queued, in no promised order; health (the checks, the live site, the open-work count); and the three things waiting
   on Kevin, each with why. The rows use plain words a non-engineer reads (no seam, oracle, cursor, registry, bus or
   the like), and no row claims more than its evidence: the iPhone and iPad crash fix is "should no longer crash" until
   Kevin plays it, and a figure names its screen. Version 14, the first of this shape, carries 1,667 detail words
   (1,900 visible in all), counted over the rendered text in headless Chromium at 1200 px and 390 px; at 390 px
   nothing scrolls sideways, and no row's text is over 15 words.
   - **One data file and one script.** `docs/superpowers/command-record.json` holds every fact: the glance's captions
     and counts, and every detail row with a `src` naming where it was read (not shown on the page).
     `node frontend/scripts/ci/command-record.mjs` writes the page from it, copies the as-of stamp between its markers
     byte for byte, and counts `memory/registry.jsonl` itself, so the open-work row is counted when the page is
     written and ages with it; the CI and live-site rows are dated by their read time, and the page's own as-of stamp
     says its age. `--check` exits 1 when the page is not what the data writes (a manual command; no tier runs it). The script is the eli5 build's Python
     generator ported to Node with no new dependency; with the detail removed and the layout comment restored, its
     output is byte-identical to the page at `feb456e3`. A refresh is a data edit, that command, then the stamp,
     republish and sync of item 280.
   - **Why the detail is on the page and not only in the files.** It still lives in DECISIONS, the registry and git,
     which stay the source of truth; this record is the reading copy of the slice Kevin asked for, and each row's `src`
     points back to them. What item 280 cut was length per line, and this shape keeps each line short.
   - `CLAUDE.md`'s standing principle names the shape, and its session close names the data file and the command.

## 2026-10-31 — [KEVIN] the Command Record is an eli5 page: big pictures, few words

**Kevin's rule, 2026-10-31, verbatim:** "The command record is way too much text, make it always /eli5:eli5 looking."

280. **The Command Record (`docs/superpowers/command-record.html`) is an eli5 page**, made for a reader who knows
   nothing about the game's insides: each section is one big inline drawing with at most one short line under it,
   about 250 visible words in all, in plain words, with no commit ids, run ids, file names or row ids in its body; one
   line at the foot names where the detail lives. Five sections: where the game stands, what is better for players
   since the 2026-10-27 handover, the deep audit's bug hunt, the lanes in flight said as what a player gets, and what
   waits on Kevin. Version 13, the first of this form, carries 233 visible words, counted over the rendered text
   (HTML and drawing labels, the as-of stamp included) in headless Chromium.
   - **The long form is retired**, kept in history: version 12, its last, is commit `002b0b9e`, the parent of this
     entry's commit, so it reaches main when this branch lands by fast-forward. Detail lives where it always did: this
     file, `memory/registry.jsonl` and git history on GitHub.
   - **What a refresh keeps** for `frontend/scripts/ci/artifact-currency.mjs`: one as-of stamp between its markers,
     styled by the four tokens `docs/superpowers/.artifact-sync.json` names for this surface (`--muted`, `--line`,
     `--accent`, `--font-mono`, all declared on `:root`), a `<title>` and no doctype. The stamp still names the
     recorded publish, because this commit neither stamps nor publishes: the publisher runs `--stamp command-record`,
     republishes to the same URL, then runs `--sync command-record`. No gate demanded the long form, so none changed.
   - **What it changes**: the form of the page `CLAUDE.md`'s standing principle names ("Kevin reviews one page, the
     Command Record"); that line now says it is an eli5 page and cites this item.

---

## 2026-10-31 (lane L3) — [LOOP] the store owns per-world state, and a save the resume wiped gets its slain dragon back

**Decided by the L3 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L3 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, seam S1 and section 4; registry
AUDIT:lane:L3-store-owns-world-state). Branch `fix/l3-store-owns-world`. Items 250-259; round 2, built by the fixer on
the round-1 reviews, adds items 290-296 below them and corrects 250, 253, 255, 257 and 259 in place. Each stands while
it earns its place.

250. **A save the context-loss resume wiped is repaired at load to its slain dragon; decided before the boss fix, as
   the audit's one-way door asks.** The wipe: until lane L2 the resume loaded its world in ContextLossPanel's effect,
   after the dragon hook had mounted, and the hook's mirror then wrote its mount-time encounter (the store's initial
   `bossHealth` 700, inactive, not defeated) over the loaded one. `setBossEncounter` writes the tier and the kill night
   only when they are passed, and the mirror passed neither, so both survived: a slain dragon of tier 1 or more came back
   as `{ health: 700, active: false, defeated: false, tier, killNight }`, and the autosave wrote that about 5 s later
   (AUDIT:debt:resume-clobbers-quests-and-boss, verifier 1's disk reading `{health:700, active:false, defeated:false,
   tier:1}`).
   - **The window, from git and GitHub's deployments** (environment Production): the resume is d99a261a (2026-10-27),
     first live in the deploy of da70413f at 2026-10-28T10:41:29Z; lane L2's boot (92120514) first went live in the
     deploy of 8579918e at 2026-10-31T07:09:42Z. The command session's frame started the window at the dragon lane's
     landing (b8d8fdcd, deployed 2026-10-30T12:33:23Z); git does not support that start: the fight and its save
     (2de54dac, 2026-08-03), the tiers (6e7591cb, 2026-09-22) and the resume were all live before it, and the code at
     da70413f has the same mount-time seeds and the same three-field mirror. So the window is about 68 hours, not 19.
   - **The independent sign.** A tier of 1 or more is written only by a kill (the kill beat's tier step), and the wipe
     left it. 700 is tier 0's maximum and below every later tier's (1050 for tier 1, `bossTierStats`), and a return
     wakes at its tier's maximum. So a save holding a tier of 1 or more at exactly 700, inactive and not defeated, is
     the wipe, or a return fight suspended (its chunk failed to load) at exactly 700 HP. A tier-0 save needs no repair:
     no kill leaves tier 0 with the dragon slain except a failed tier step, and a won tier-0 save already loads slain
     (`hydrateBossState`); a tier-0 fight the wipe reset to 700 is indistinguishable from one never begun, and it gets
     the fresh encounter it already loads as.
   - **The repair** (`game/saveSchema.js` `BOSS_WIPE_REPAIR`, run by `migrateRetired` with the save's other
     migrations): a save of that shape whose slot was created before 2026-10-31T07:09:42Z (or has no `created_at`) loads
     slain, `{ health: 0, active: false, defeated: true }` with its tier and kill night as the kill wrote them, so its
     return is due as the slay rule set it (`bossCanReturn`: three nights and four levels). It runs before the first
     autosave (the load) and once per save: the save records it in `migrated` whether or not it matched, as the Cut's
     refund does, and a world that has loaded nothing starts with it recorded, so a later suspended fight at 700 is
     never touched. A return fight the wipe hit mid-way (its HP lost too) comes back as a slain dragon whose return was
     already due: it announces, wakes with its entrance and fights at its tier's full HP.
   - **Not repaired** (corrected by item 290, round 2: this paragraph was wrong): the World Manager's in-place Load into
     a session whose hook had woken the dragon (the hook's later writes carried its own HP, at most 700, and `active:
     true`, over the loaded tier) was said to be a live return fight's shape that no field tells apart, and gone since
     L2. A field does tell them apart, the return not due on the save's own progression, and L2's live boot made that
     shape too (it woke a wiped slot at the lair); item 290 repairs it on every load and says what truly stays
     indistinguishable.
   - Recorded before the boss fix, in its own commit (12f897eb); the repair and its gate,
     `frontend/tests/gates/boss-clobber-repair-gates.test.jsx`, landed in the next (16870cc8), before the hook reads the
     store (f86b7a06, item 251).
251. **The store owns the dragon fight; the hook keeps no copy** (AUDIT:softlocks:boss-hook-ignores-world-load, defence in
   depth after lane L2). `world/bossSystem.js` selects `bossActive`, `bossHealth`, `bossDefeated` and `bossTier` from the
   store and writes them through `setBossEncounter` (a `writeEncounter` helper merges a part into the whole, and passes
   no tier, so only the kill's tier step moves the tier). The mirror effect is deleted, and with it the registration
   effect's `setBossActive`. The phase derives from the health; `damageBoss` reads the store at the call (two hits in a
   frame both land) and announces the phase a hit crosses into, so a load, a spawn or a return at a phase's health
   announces nothing (the old phase effect announced any change, a load's included). On a world load the hook's arrival
   latch, disarm, return notice, kill latch, position and entered record return to the loaded world's, as a mount gives
   them, and the poll re-arms. Every switch is a boot since L2, so no player path loads in place; this keeps the
   primitive correct if one returns. The comment at the old `bossSystem.js:41` that said a load would not reach the hook
   (the audit's lying comment, item 1 of AUDIT:debt:comments-that-lie) went with it.
252. **One world-load event, `worldLoadedAt`** (seam S1: "no world-load event"). The store's `questLoadedAt` was already a
   tick every `loadWorldData` bumps; it is renamed for what it is, since the quest log, the dragon's latches and the
   squad's bodies now all re-seed on it. Three tests that set or read the tick were renamed with it, no assertion's
   meaning changed.
253. **A load with no quest log re-seeds the hook to a new world's log** (AUDIT:persistence:new-world-keeps-old-quests,
   defence in depth). `QuestSystem.jsx` `freshQuestState()` is the new world's log, used by the initializers and by the
   re-seed when the store holds none, where it returned early and kept the old world's quests, claims, counters and
   achievements. (Corrected by item 292, round 2: the store held none only for a save whose key was present and null;
   a save with no key kept the session's log until the load read an absent key as null.)
254. **The bound squad is saved with its world** (AUDIT:verbs:squad-not-saved-and-leaks-across-worlds, the persistence
   half; the soulbind spec 2026-06-10 s2b3 lines 63-65). The store's `squad` is the roster, one `{ type }` per creature,
   in `progression.squad`; a save with none loads none, as ember does. The type is the identity: everything else a
   creature carries derives from it as a bind and a fusion derive it (`game/squadRoster.js` `allyFor`, `game/hybrids.js`
   `hybridAlly`, now the fusion's own factory too), so the spec's listed `maxHealth` is left out: stored, it would be a
   second copy of `MOB_TYPES[type].health`. `world/squadPersistence.js`, installed by App after the boot's load, writes
   the roster on every add and remove of the allies query (a bind, a fusion, the cap's release) and, on a world load
   (and at install), clears the bodies and rebuilds them from the roster one metre outside the follow ring around the
   player, so the squad's first steps walk them in and ground-snap them (`SquadAISystem.jsx` snaps every step it
   orders, never a creature holding still). Rebuilt ids are `ally_<n>` strings, unique against the spawner's numbers. A
   save from before the roster has no squad: the load that wrote it had already dropped it.
255. **A world remembers its shrines, and Pilgrimage counts them** (AUDIT:debt:shrine-facts-session-scoped, the
   persistence half). The store's `reachedShrines` and `rewardedShrines` (chunk keys, `game_state.shrines`) replace the
   session flag `shrineReached` and two hook refs' worth of facts. The HUD objective turns to the Blight Heart once one
   is reached. The reach poll credits any active `reach_shrine` quest up to the number of shrines this world has reached,
   every poll, so a shrine reached before Pilgrimage is offered counts when it is (the verifier's caution: a saved set
   alone would have made that bug permanent). A shrine is REWARDED WHEN ITS CHEST IS OPENED, not when it spawns: a chest
   left shut is owed after a reload and comes back once, where recording the spawn would have lost the unopened reward to
   the reload. The board's own ref still stops a second chest while one is on it. A save from before the record has
   reached none: its player sees the shrine objective until they reach one again, and may open each shrine chest they
   had already opened once more (before this, every reload re-armed them). (Amended by item 293, round 2: the loot of a
   shrine's chest goes into the bag at the open, before the record, so a page closed before the pickup loses neither.)
256. **Every key written to the store is declared in it** (AUDIT:debt:three-call-channels-dead-wires, the declare-keys
   half). 17 keys were written with setState and absent from the initial state at 8579918e. The 16 with readers are
   declared, null until their system publishes them; `shrineReached` was then replaced by item 255. `store.damageMob` had
   no reader (every caller reads `GameMethods.damageMob`), so CombatSystem's write went instead of a dead slot being
   declared. The gate is `tests/scripts/store-keys-declared.test.js`, which parses every src file and reads the writes
   from the syntax tree; it is sited in tests/scripts because its subject is the source's shape. The audit's hunter
   matched member calls only and so missed the three primary-action seams written through the setter Components hands
   `input/primaryInput.js`, and counted three React class-component `setState` keys as the store's.
257. **SUPERSEDED by item 282 (main, the command session's ruling): the ceiling stays 652,500 B, and this lane fits
   under it (item 295, round 2); the raise below is gone from `frontend/scripts/ci/bundle-budget.mjs`.** As first
   decided: **the index chunk's ceiling rises by the lane's own bytes, 3,515 B, and no more** (`frontend/scripts/ci/bundle-budget.mjs`,
   652,500 B to 656,015 B). Measured from a build at each commit (8579918e 649,342 B): the declared keys +374, the save
   repair +488, the store-owned fight +250, the squad +1,571, the shrine record +832; the lane ends at 652,857 B, 357 B
   past the old ceiling. The growth is the lane's features; the in-flight lanes keep the headroom they had.
258. **The proof.** Each gate was red first against 8579918e's src from a scratch copy, then green on the fix, and killed
   by its mutants (receipts in each commit's Mutation-Proof trailer; an identity mutant survived in every batch):
   `tests/gates/boss-clobber-repair-gates.test.jsx` (item 250: 5 of 6 red, the wiped dragon woke at 700),
   `tests/gates/store-owns-encounter-gates.test.jsx` (items 251-253: the hooks mount first, then the world loads; 5 of 5
   red), `tests/gates/squad-roster-gates.test.jsx` (item 254: the real App through page loads; 2 of 2 red),
   `tests/gates/shrine-persistence-gates.test.jsx` (item 255: the real hooks and HUD tracker through the real boot; 4 of
   5 red, the control passing) and `tests/scripts/store-keys-declared.test.js` (item 256: 24 undeclared writes of 17 keys
   and one unreadable write). No e2e was added: a world switch is a reload, which the gates model with a fresh store (or
   a fresh module graph) and the real boot; the lived proof is CI's existing e2e suites on the exact sha. Not proven in a
   browser: the rebuilt squad's first steps onto the ground, and a pre-L3 save's first load in production.
259. **Found, not fixed.** `setBossActive` has no caller in src now (the hook writes the encounter whole); it joins the
   dead-setter half of AUDIT:debt:three-call-channels-dead-wires, lane L12's (deleted in round 2, item 291, with the
   other setters nothing called). The chest board itself still crosses an
   in-place load (closed for players by L2's reload; L3 made only the shrine facts per-world).

**Round 2** (items 290-296), built on the round-1 static and dynamic reviews (static FIX on the ceiling raise and a
false comment, dynamic FIX on wiped saves the repair missed), corrects items 250, 253, 255, 257 and 259 where they
said more than was proven. Each stands while it earns its place.

290. **A return fight its save does not hold due loads slain, on every load** (round-1 dynamic F1, static 4 and 5; the
   one-way door, ruled by the command session). Item 250's repair matched the wipe's own shape, once per save, in slots
   created before the window closed, and the wipe reaches disk past it three ways: the live L2 build (8579918e) boots a
   wiped slot and the arrival poll wakes it, so the save then holds `{ health: 700, active: true, defeated: false,
   tier: 1 }`, which the repair passes over (it needs `active: false`) while recording itself run (the review's probe
   save, kept as `frontend/tests/fixtures/boss-woken-wipe-8579918e.json`); and a tab left open on a pre-L2 build keeps
   running the old resume after the deploy, so it can write the wipe into a save that already records the repair, or
   into a slot created after the window.
   - **The sign.** A tier of 1 or more that is not defeated is a return fight, and the arrival poll wakes one only when
     `bossCanReturn` holds (`game/bossTier.js`: three nights after the kill night, and a level of at least
     `BOSS_BASE_LEVEL + LEVEL_STEP * tier`); its inputs never fall (`nightCount` is written
     only as +1, and nothing lowers `level`). So a save holding a tier of 1 or more, not defeated, whose own
     progression does not hold the return due, holds no fight a player can have reached: it is the wipe, however it was
     written since.
   - **The repair.** `hydrateBossState` (`frontend/src/game/bossPersistence.js`) loads that shape slain, its tier and
     kill night kept, so its return is due as the kill set it, on every load: not once per save and not bounded by the
     window, because the stale tab can write the shape again after any once-only migration has run. The store passes
     the save's level (the session's when the save has none, as the load's own level does). A due return, a tier-0
     fight and a slain dragon load as before. Item 250's arm stays for the one shape only it catches: a return that was
     due, which the wipe reset to 700.
   - **What stays indistinguishable** (this replaces item 250's "Not repaired" paragraph, which said no field told the
     woken wipe from a live fight; item 290's sign does). A due return fight suspended at exactly 700 HP (its chunk
     failed to load), inactive, in a slot created before the window whose repair has not run: item 250's arm loads it
     slain, so it wakes again at its tier's full health (round-1 dynamic, info F; registry
     REVIEW:l3:suspended-due-return-at-700). And a due return that a stale tab wipes after the repair is recorded keeps
     its 700 and fights on at that health, with no entrance. No field the save holds tells either from a live fight.
   - **The gate.** `frontend/tests/gates/boss-clobber-repair-gates.test.jsx` gains the 8579918e blob (repaired on the
     head), a stale tab's wipe written after the record (inactive, and woken), a slot after the window, and item 250's
     own match conditions (the review's surviving mutants KC and KD now die); receipts in cd8b6cfe's trailer.
291. **The store's setters and seams with no caller are deleted** (the dead-setter half of
   AUDIT:debt:three-call-channels-dead-wires, and item 259's `setBossActive`). `setBossActive` (the hook stopped calling
   it in item 251) and `isBossActive()` (a second way to read `bossActive`: the three melee and aim branches in
   `Components.jsx` and the projectile's boss test in `EnhancedMagicSystem.jsx` now read the field), 15 of the 17
   setters the audit counted with no caller, and `checkNearbyChest`, which QuestSystem published and nothing read. Each
   name has 0 word matches across `frontend/src`, the tests (e2e included), the scripts, `ci/` and `.githooks/` after
   the cut. `setBuildingMode` and `setSelectedBuildBlock` stay for lane L6 (PR #68), which is reworking the building
   tools that own them; the store hunks L6 also makes are written as L6 writes them, so the two merge cleanly. This is
   code players never ran, out of their download (item 295). L6 then landed (main a05bf328, its item 279) with 13 of
   these setters and `checkNearbyChest` deleted in the same hunks, `setSelectedBuildBlock` deleted and `setBuildingMode`
   given its caller (the Building Tools panel); this lane's merge of it (3d92e494) adds to L6's cut only
   `setDamageBoss`, `setGetBossPosition`, `setBossActive` and `isBossActive`, and the audit's store-key hunter lists no
   `set*` member without a caller.
292. **A save with no quest log loads a fresh log, its key null or absent** (round-1 static 2, dynamic F3; corrects item
   253). `loadWorldData` kept the session's log when a save had no `questState` key, so an in-place load of a save from
   before the log carried the world loaded before's quests, counters and achievements into it; item 253 and the comment
   in `QuestSystem.jsx` said that save was a fresh log, which held only for a key present and null. The load now reads
   an absent key as null. At a boot the store is fresh, so only an in-place load could see the difference, and no player
   path makes one since L2. Gated in `store-owns-encounter-gates` (the absent-key case).
293. **A shrine's loot goes into the bag when its chest opens, before the record that it paid** (round-1 static 3;
   amends item 255). Item 255 recorded a shrine rewarded at the open and still paid its loot as world drops, which live
   in the ECS alone until they are picked up or banked (`frontend/src/systems/LootSystem.jsx`); the autosave flushes when
   the tab is hidden or closed, so a page closed between the open and the pickup saved the record without the loot, and
   the record keeps the chest from coming back. Of the two ways to keep them together, the loot is banked at the open:
   each item into the bag and its XP granted, then the record written, in one synchronous run that no save can fall
   inside. Recording at collection instead would have to follow every drop of one chest to its pickup or its banking,
   and a close after part of them were picked up would either lose the rest or, unrecorded, re-arm the chest and pay the
   collected part twice. Banking is what LootSystem does with a drop the player is not there for: one notice ("Looted:
   ..."), no pickup pop or chime. The cost: a shrine's reward no longer bursts from its chest as drops; ordinary chests
   keep theirs. Gated in `shrine-persistence-gates` (open, save before any pickup, reload: the record, every item and
   the XP in the save, no second chest).
294. **A rebuilt squad stands at the player's feet, on its own floor where that is known** (round-1 static 6; amends
   item 254). The rebuild stood each creature at the y of the store's `playerPosition`, which just after a load is the
   save's capsule centre (`game/saveSchema.js` `savePosition`), 0.9 m over the feet, and a creature is put on its floor
   only by a step the squad AI orders. Each now starts half a block over its own floor (the height `SquadAISystem` gives
   an ally), found from the player's feet with the squad AI's `groundForMover` rule, and over the feet where no floor is
   known yet; the ring placement is unchanged. Gated in `squad-roster-gates` (the computed start, which also kills the
   review's mutant KH). Not seen in a browser: the squad's first steps after a load.
295. **The lane fits under the index ceiling, 652,500 B, with no raise** (item 282, the command session's ruling,
   supersedes item 257). Measured with `npm run build` on the merge of main 2ab00451 into the lane (94915136): the index
   chunk is 647,955 B, 4,545 B under the ceiling, against main's 645,324 B, so the lane adds 2,631 B net; the budget
   script's own reading is 632.8 KB of 637.2 KB with every marker check passing. With lane L6 merged in too (main
   a05bf328, merged as 3d92e494) the index is 649,549 B, 2,951 B under the ceiling (634.3 KB of 637.2 KB). Round 1
   measured its growth at 3,515 B
   on its own builds, so round 2's fixes and cuts net to about 884 B less (derived from the two measurements, not
   measured per commit). What offsets the growth is the code item 291 deleted, which players never ran. Tried and
   dropped: installing the squad's persistence from a lazy chunk. The squad gate went red on it ("the save holds no
   squad roster": a bind made before the chunk resolves is never written to the roster, and the install's rebuild then
   clears that body), and the persistence runs for every player, so it is not code item 282 moves out of the download.
   One factory, `game/mobTypes.js` `mobEntity`, now makes a mob's entity for the spawner and for a rebuilt bound
   creature, which each wrote out by hand.
296. **Found in round 1 and not fixed here, each with an owner.** The review's mutants KF and KG (an in-place load
   keeping the session's shrines or squad) now die in `store-owns-encounter-gates`. Recorded: a due return suspended at
   exactly 700 refilled by item 250's arm (REVIEW:l3:suspended-due-return-at-700; the fix the review offered, also
   requiring the save's `saved_at` after the window's start, is the command session's call); the in-place defence of a
   disarmed lair that no gate pins (mutant KI; REVIEW:l3:in-place-lair-disarm-unpinned, lane L12); and a pre-L3 save
   that had completed Pilgrimage, which shows the shrine objective again although the quest proves a shrine was reached
   (REVIEW:l3:pilgrimage-done-shows-shrine-objective, LOW).

---

## 2026-10-30 (lane L9) — [LOOP] pools with lifetimes: the chest board follows the player, a pickup has a lifetime and a bound and is banked when it ends, and the zone cap evicts the soonest expiry

**Decided by the command session on lane L9 of the deep audit** (`AUDIT:lane:L9-pools-with-lifetimes`), built by the
lane L9 builder; branch `fix/l9-pools`, from main `0670a825`. Items 240-246; round 2, built by the fixer on the round-1
static and dynamic reviews (both FIX), adds items 247-249 and corrects 240-246 where they said more than was proven. The
brief's own words: "every pool gets a lifetime, a distance bound and an expiry-ordered eviction"; three pools filled and
nothing emptied them.

240. **The quest-chest board is bound by where the player is** (`frontend/src/game/chestBoard.js`, new; the hook is
   `useTreasureChests` in `frontend/src/QuestSystem.jsx`). The periodic spawner capped the board at five UNOPENED chests
   wherever they stood, so five the player had walked away from held every slot for the session. Now the cap counts the
   unopened chests within 120 m (CHEST_COUNT_RADIUS) and a 3 s sweep retires an unopened periodic chest past 240 m
   (CHEST_RETIRE_RADIUS). Two radii, not one, so a chest the player sees at the edge does not vanish as they turn
   back: between the two it holds no slot and can still be walked to. The compass shows chests to 80 m and the spawner
   places a new one 20-60 m out, so a board of five in reach is a board the player can see. A SHRINE chest is never
   retired (the once-per-shrine reward is keyed in `shrineChestsSpawned` and would not respawn); it still counts toward
   the cap while in reach, as before. An opened chest is left to its own 5 s timer. Distances are along the ground.
   Retiring is not losing: a chest holds nothing until it is opened, and the player left it behind. The two radii alone
   did not bound the board for a player who loops through the ring between them; item 249 adds the maximum and states what
   was measured.
241. **A pickup has a lifetime, a cull range and a bound, and a pickup that ends is BANKED, not lost**
   (`frontend/src/game/xpOrbStepper.js`, `frontend/src/systems/XPOrbSystem.jsx`, `frontend/src/systems/LootSystem.jsx`).
   Past 90 world seconds (PICKUP_LIFETIME_S, the low end of the audit's 90-120: it ages on the world clock, so a pause or
   a hitstop does not spend it) or 100 m from the player (PICKUP_CULL_RANGE, the mobs' own cull range), a pickup out of
   reach reports `{ collected: true, expired: true }`; the systems grant its XP, put its item in the bag, tell the player
   in one line what a frame banked (item 248), and remove it. What a fresh kill drops and the XP the player is owed are unchanged (CombatSystem and
   `spawnLootDrop` are untouched, and the gate asserts the XP granted equals the XP the kills dropped, to the point, and
   the items to the item). The banking is QUIET: no pop, no floating XP text and no chime, because those announce a
   pickup in the player's hands at a spot they are looking at. Round 1 wrote that an expired pickup "is by definition
   outside its magnet" (12 m for an orb, 7 m for a drop); it was not (the test came before the magnet in the stepper, so
   an 89.5 s orb 5 m away and flying in was banked mid-flight at 90 s, with no chime; static 3). Now it is true by
   construction: the stepper expires a pickup only from OUTSIDE its own magnet, and one inside is pulled in and collected
   in hand whatever its age (item 248). The audio axis: a chime for a pickup that was not made would be noise, and up to
   six orbs expire together.
242. **A bound beside the lifetime: 64 orbs and 32 drops.** A lifetime bounds a pool only by rate times lifetime. Past
   MAX_XP_ORBS (64, ten kills' worth: a kill drops at most 6 orbs) or MAX_LOOT_DROPS (32), `cutXPOrbs` and `cutLootDrops`
   pick what goes: the pickups out of reach first, oldest first (round 1 took the oldest by age alone, and banked pickups
   the player was standing in; item 248), so the frame-cost reading below is of a pool that cannot grow.
   Each pickup is a shadow-casting mesh and a floor probe a frame; the iPad-class budget is what the bound protects.
   The numbers are arbitrary in the way a cap is: ten kills stranded at once is a fight the player left, and the cost of
   being wrong is that a far pickup is banked a little before its 90 s. Revisit with a measurement.
243. **Frame cost at the bound, the reading the brief asked for.** The gate fills both pools to their bounds (64 orbs, 32
   drops) and counts the floor probes of 600 frames: 96.00 a frame, one per pickup, and about 0.02 ms a frame for both
   systems with a stub floor (one run on this machine; the gate asserts the probe count, never the time). Before: 801 probes a frame at 801 pickups, and 0.65 ms
   a frame for all four systems over a real Rapier floor (the audit verifier's reading, ~0.8 microseconds a pickup), so
   the bound is ~0.08 ms on that floor by extrapolation, not by measurement here. NOT measured: the iPad draw and shadow
   cost of 96 pickups (registry `AUDIT:leaks:pickup-render-cost-at-bound-unmeasured`). Not built, on purpose: the audit's
   "cached rest height" (the probe count is now bounded, and a cached height would leave a pickup hovering over a mined
   block), and its fade (an expiring pickup is out of its magnet and mostly out of sight, the resting frame is
   unchanged, and the repo has no render harness for the pickup meshes to judge a fade in; reversible by a new entry).
244. **The world-switch carry is lane L2's, and lane L2 closed it** (corrected in round 2; round 1 wrote it as open).
   `AUDIT:leaks:stranded-pickups-never-despawn` has two halves: the pile-up and its per-frame cost (this lane) and the
   carry into a new world (L2). Round 1 recorded a consequence of the 100 m cull and of the lifetime: until L2 landed, an
   old world's stale pickups would be banked into the new world on the first frame the player stood more than 100 m from
   them, or within 90 s, where before they banked only on a walk back to the same coordinates (static 4: the transfer
   goes from occasional to guaranteed, and round 1's "the same XP and items arrive, earlier" understated it). That is
   moot on the merged tree: every world switch now saves, leaves a note and reloads the page (`game/worldBoot.js`
   `switchWorld`, `game/pageReload.js`; item 200), so the ECS starts empty and no pickup crosses a world. Read at
   `8579918e`, not run here: the merge was green on the lane's gates and CI, and no gate of this lane drives a switch.
   The registry row is closed with both halves cited.
245. **Element zones evict the soonest expiry, never the zone just cast** (a call-level rule; round 2 widens it to the
   whole cast, item 247) (`frontend/src/game/elementZones.js` `evictSoonest`). `reg.zones.shift()` evicted the first painted, and a refresh
   renews a zone in place, so array order is paint order and a re-imbue that renewed a zone and then overflowed the cap
   (`spawnZone` then `spawnChain`, one bridge tick) evicted the zone it had just renewed, ring and burn, while zones
   seconds from expiry stayed. Two calls the audit's one-line fix did not make: the zone just cast is excluded from the
   candidates (a conductive zone, 8 s, cast into a board of fresh 10 s burns is the soonest of all, and evicting it would
   hand the caller a dead zone that still plays its sound), and a tie goes to the first painted, which is the old order,
   so the old test stands. The first of those two held for one `spawnZone` call only: the next leap of the same cast
   evicted the zone, in the same tick, which is the round-1 finding item 247 answers.
246. **The gate, what it reads, and what it does not** (`frontend/tests/gates/pools-with-lifetimes-gates.test.jsx`, 7
   tests in round 1, 13 after round 2). The audit's own scenario: the pools filled where the player stands, the player 600 m away for ten simulated
   minutes with kills and zone casts still landing, every pool within its bound at every one of 600 samples. Red at
   `0670a825`: 6 of 7 (parked: orbs peaked at 282 of 64, drops 94 of 32, no chest within 60 m at 35 s or at the end, the
   spawn's five still on the board, none of the 3290 XP owed granted, none of the 94 items; walk: a periodic chest on the
   80 m compass in 2 of 20 minutes; a burst of 40 kills held 120 orbs). Green: peaks 36/64 orbs, 12/32 drops, 5/5 chests,
   8/8 zones; a chest within 60 m at 35 s and five at the end; the walk (4200 m, 20 minutes) had a chest on the compass in
   20 of 20 minutes with the board peaking at 3, and all 9 shrine chests it caused still on the board. The audit
   verifier's 6 of 20 for the same walk counted shrine chests, which bypass the cap, and mine counts periodic chests only.
   Mutation proof is in the commit trailers (every real mutant red; the two the gate alone passes, a bound that banks the
   newest and a sweep that retires an opened chest, are red in `xpOrbStepper.test.js` and `chestBoard.test.js`; each run's
   identity mutant stayed green). Round 1's list of mutants was not the list that mattered: the quiet-bank split and the
   120 m radius at the spawner's call site had no mutant, and six and two survived (items 248 and 249). NOT covered: a
   lived browser run (CI's e2e is the arbiter), a real Rapier floor in the cost reading, the zone bridge in THIS gate
   (it drives the registry directly; `ElementZoneSystem` is mounted in the game, `Components.jsx`, and has its own gate
   from round 2, item 247), the debris
   bodies parked asleep from mount (the brief shares that with lane L7), and the audit's untested aggravator, a chest
   placed on a canopy or under water that cannot be opened: it holds a slot while the player is within 120 m and is
   retired beyond 240 m, and an unopened chest still has no lifetime (registry `AUDIT:leaks:chest-unopenable-holds-slot`).
247. **A cast, not a call, is what the zone cap protects; this widens item 245** (round 2; static 1, dynamic F1;
   `frontend/src/game/elementZones.js` `castZone`, `frontend/src/world/ElementZoneSystem.jsx`). Item 245 kept the zone one
   `spawnZone` call had just painted out of the eviction, and the bridge makes two calls a cast (`spawnZone` for the
   impact, `spawnChain` for the leaps), so the next leap evicted the impact in the same tick, and each leap the one before
   it. The dynamic review ran it on the real registry: a conductive imbue with chain 3, two seconds into a board of eight
   fresh frozen zones, left one of its four zones alive at `5e733454` (four of four at `0670a825`), and the bridge played the
   impact's sound for a zone that was already gone, which is the harm item 245 said it prevented. The audit row's OWN case,
   a re-imbue that refreshes a zone and then chains, still lost the refreshed zone whenever the rest of the board outlived
   it (seven frozen zones painted at t 13 against a refreshed zone expiring at 24: A gone at `5e733454`, as at
   `0670a825`; the three boards whose zones expire earlier were already fine). Row `AUDIT:ultra:ultra-game-logic-4` was
   closed on `12783a9a` and did not close; it closes on this case green. Now `castZone(reg, req, mobs, isTarget, now)` paints
   the impact and its chain under one Set, `spawnZone` adds every zone it paints or refreshes to it, and the cap evicts the
   soonest expiry among the zones OUTSIDE the cast (the first painted among equals, so the old test stands). A chain stops
   when every zone on a full board is the cast's own (the impact and seven leaps fill the board; Chain Imbue x2, Wildfire
   and Prism Shard together cap a chain at five, so play does not reach it), and `spawnZone` handed a cast that owns the
   whole board still holds the cap, at the cost of the soonest of the cast's own, never the newcomer. The bridge casts
   through `castZone` and voices only the zone it returns, which is on the board when the call returns. I did not add a
   second "does it still exist" check beside that: it could not fail, and a check that cannot fail is the defect
   `gates-and-probes.md` is about; the gate reads the sound against the board instead. Gates: `elementZones.test.js` (the
   dynamic review's four boards, its frozen-board and burning-chain boards, the chain cap, the fallback) and
   `tests/gates/element-zone-bridge-gates.test.jsx` (the real `ElementZoneSystem`, driven through `requestZone`, its sound
   read against the board at the tick's end; nothing drove that seam before). Mutation proof is in the trailer of
   `3daf1267`; its count ("thirteen mutants") is wrong: the battery is twelve distinct mutants in fourteen runs, plus
   comment-only mutants that stayed green (`fix2/mut-zones.out` in the lane scratch). NOT covered: a lived cast in the
   browser, and the render system's drawing of an evicted zone.
248. **A pickup within reach is the player's, in hand; banking is for what is out of reach, and what a frame banks is told
   once** (round 2; static 2 and 3, dynamic F2, F4, F6; amends 241 and 242; `frontend/src/game/xpOrbStepper.js`,
   `frontend/src/systems/XPOrbSystem.jsx`, `frontend/src/systems/LootSystem.jsx`). Four things round 1 left wrong or
   ungated. (a) An expiry banks only from outside the kind's own magnet; inside it, the magnet finishes the pickup with
   its chime (item 241 says why). (b) The size bound's cut takes the pickups out of reach first, oldest first, and any it
   must cut within the magnet is collected in hand, not banked in silence: 25 kills 3 m from the player gave 89 chimes and
   numbers against 100 before the lane (dynamic F6), the 11 lost being orbs the player was standing in. The distance the
   magnet, the collect and the cut read is one function, half a metre below the camera. (c) What one system banks in one
   frame is one line, however many it banked: "Looted: N items" (the item's name for one) and "+N XP", and the banked XP is
   granted in one call; 30 drops left behind and a step to 160 m raised 30 "Looted" toasts in one frame (dynamic F4), and
   plain-string notices are never deduplicated (`ui/notifications.js`). A pickup in hand keeps its own line, chime, number
   and pop. The "+N XP" line is new: round 1 banked orbs with no word, on the reasoning that the XP bar is the report; a
   pile that pays out 90 s after a fight, or a return trip, deserves one line. (d) The pools gate now counts what the
   systems call: the pickup chime, the floating number, the loot pop and the notification lines (the `feel` record). In
   hand gives all of them; a pickup banked out of reach, by lifetime, cull range or the bound's cut, gives none and one
   line. Red first: the six round-1 mutants (a banked pickup that chimes, pops or shows its number; an in-hand pickup made
   silent) all survived the round-1 gate (`fix2/surv-feel.out`), and the new tests fail four ways on `5e733454`'s source
   (30 lines for 30 banked drops; 96 chimes where 160 pickups were in reach). Mutation proof in the trailer of `eaeccc36`:
   29 distinct mutants, all red, and the one that first survived (the reach point read at the eye, not half a metre below
   it) got its own tests and then died. NOT measured: what the player hears. A cut that collects tens of pickups in hand
   in one frame (a 40-kill burst at 3 m: about 56 orbs and 8 drops over the bound) starts that many pickup sounds in the
   frame; the master bus carries a limiter (`audio/masterBus.js`, threshold -3 dB, ratio 20), so it cannot clip, and
   whether it reads as one loud chime or a burst is Kevin's ear (registry `AUDIT:leaks:cut-chime-burst-unheard`).
249. **The chest board has a maximum, and the 120 m radius is pinned at the spawner's call site** (round 2; static 5,
   dynamic F3 and F5; amends 240; `frontend/src/game/chestBoard.js` `CHEST_BOARD_MAX`). Round 1 gated the board on a
   straight walk (peak 3, bound 8) and the review looped it. Re-measured here with a throwaway probe, a circle walked at
   3.5 m/s, periodic chests at peak (one seed for 60 and 80 m over 40 minutes; three seeds over two hours for 90 to 160 m;
   two seeds over six hours for 125 to 145 m): 8 on a 60 m radius, 11 to 15 on 80 to 110 m, 15 to 16 on 120 m, 15 to 18 on
   125 to 135 m, and on 140 m 11 to 12 in the first hour, 19 by the third and 20 to 21 by the sixth, still rising when the
   run ended; 4 to 5 from 150 m up. Patrols of 150 to 500 m: 5 to 13. Chain length reaches at most five (Chain Imbue x2,
   Wildfire and Prism Shard: `talentTree.js`, `relics.js`), which is why item 247's chain cap is not met in play.
   The cap counts chests within 120 m and the sweep retires past 240 m, and a player who loops through the ring between
   them keeps adding chests where neither applies; "levels off" is true of the paths the review tried (it called one flat
   at 15 over two hours) and not of the rule, so that claim is withdrawn rather than gated. It is not a farm (a chest
   comes at most every 30 s whatever the board holds), but it was a pool nothing bounded, on the lane whose subject is
   pools. So it is bounded: past CHEST_BOARD_MAX (10: five in reach, five the player can still turn back to) the 3 s
   sweep retires the farthest unopened periodic chests; shrine chests (never retired) and opened chests (their own timer)
   neither count toward it nor go. The same circle for three hours now peaks at 10, with a chest within 120 m of the player
   in 180 of 180 minutes (the gate prints both). The sweep runs every 3 s, so a chest spawned between sweeps can stand a
   moment as the eleventh; the gate's 10800 one-second samples never saw it, and I did not prove it cannot happen. The
   120 m radius is pinned where `QuestSystem` hands it to `countNearChests` (dynamic F3): every chest is placed 40 m due
   west of the player (`Math.random` held at 0.5), so one 100 m away must hold its slot and one 145 m away must not; before
   this a spawner counting to 240 m or 60 m passed every gate. Mutation proof in the trailer of `48a1a993`, whose "fifteen
   mutants" is fifteen runs of twelve distinct mutants; one of them, the maximum retiring the NEAREST chests, survives the
   pools gate and is killed by `chestBoard.test.js` alone, so the gate does not pin WHICH chests go. Claim narrowed to what
   is proven: bounded at 10 by construction for the unopened periodic chests, measured on circles (60 to 200 m) and patrols
   (150 to 500 m), not on every path.

---

## 2026-10-30 (lane L2) — [LOOP] every world switch is a boot, and the title continues the player's world

**Decided by the L2 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L2 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, seam S1 and section 4). Branch `feat/l2-boot-is-the-only-load`,
PR #65. Items 200-206, and round 2's 219-224. Each stands while it earns its place.

200. **Every world switch is a boot; this supersedes B2a's "nothing resumes at boot"** (`memory/STATUS.md` B2a, and the
   store's saveActiveWorld note it was written beside). A world's state had six owners and no world-load event: the
   store, hook state seeded at mount (the dragon fight, the quest log, the XP refs), hook refs (quest chests, shrines), the
   undeclared `shrineReached`, the ECS (allies, mobs, orbs, loot) and the Rapier body. `loadWorldData` reset the store
   alone, and every load in the game ran after mount: the context-loss resume wiped the quest log and wrote a slain
   dragon back alive (AUDIT:debt:resume-clobbers-quests-and-boss), a dragon woken before Load or Create New World stayed
   in the hook at 600-700 HP where no hit reached it (AUDIT:softlocks:boss-hook-ignores-world-load), New World kept the
   old quests (AUDIT:persistence:new-world-keeps-old-quests), chests, orbs, loot and mobs crossed into the next world
   (AUDIT:leaks:world-load-keeps-previous-world-state), a Load of a higher save played LEVEL UP
   (AUDIT:desync:level-up-fanfare-on-load), and a returning player started a fresh level-1 world on every visit
   (AUDIT:persistence:returning-player-never-resumed). Now `game/worldBoot.js` `switchWorld` saves the world in play (a
   synchronous localStorage write), leaves a note in sessionStorage and reloads; `startGame.jsx`, called by `index.jsx`,
   runs `bootWorld` before `root.render`, so every owner starts from the loaded world.
   - **The note** (`crafty.boot`, JSON): `{ world }` loads that slot; `{ fresh: true }` starts a world that owns no slot
     until its first save in play; `{ fresh: true, world }` starts a new world in the slot the World Manager's Create
     wrote. Written just before the reload, read and removed at boot whether or not it resolves, gone with the tab. A note
     naming a world that is gone falls back to the plain visit. The old `crafty.resumeWorldId` key is not read: its world
     was saved last, so a plain visit after the deploy lands on it anyway.
   - **The plain visit** loads the first index entry the player owns whose save reads; `writeWorld` puts the world it
     writes first, so that is the most recently written. The load claims the slot (`_sessionWorldId`), so the autosave
     writes back into it and a visit mints no slot. B2a's invariant stands (an autosave writes only a slot the session
     opened or created); what changed is that the boot opens one.
   - **The hold.** The boot's load sets `resumeSpawn` and `worldReloading` (chaos-play items 154, 155, 168), the edits
     wait for Terrain to publish its worker, and the hold asks the ground probe only after load_modifications_done's wipe
     has committed: the hold starts at that event, the audit's threat about releasing on the old colliders.
   - **Switches:** the World Manager's Load and Create New World, the title's New World and the context-loss resume.
     The resume names the tab's own slot, or a fresh world when it owns none, so a loss on a new world's title brings
     the new world back rather than the newest save (red first: the plain-visit fallback alone loads the old world).
   - `loadWorldData` stays as the boot's primitive. The e2e specs that drive it in place (load-hold, world-rebuild,
     save-load, quest-text, the-cut) now test that primitive, not a player path; L3 makes an in-place load correct if one
     returns (the audit's door is two-way).
201. **The title shows Continue (the world's name, its level, when it was last played) and New World** when the boot
   loaded a world, and Start Adventure when it did not (`MenuSystem.jsx`, store `continueWorld`, transient). Continue
   enters the world the boot already loaded; it needs no reload (a routine call: the audit listed Continue among the
   reloading switches, but on a plain visit the world it names is the one in memory). Last played is
   `Intl.RelativeTimeFormat` in the UI locale (`ui/lastPlayed.js`) from a new `saved_at` the save writes; a save from
   before it shows none. Strings `menu.start`, `menu.continue`, `menu.newWorld`, `menu.level`, `menu.lastPlayed` in en and
   zh-CN (the title's one button was hard-coded English). Design: the primitives' primary and secondary Buttons, the
   sword and sparkles icons, the caption in `text-text/85` with the hint strip's shadow over the existing bottom scrim.
   The look is shot by the CI e2e with no save and with one (artifact `title-shots-shard-<n>`, item 205).
202. **A reload mid-fight resumes the fight without its entrance** (REVIEW:w3b:reload-replays-entrance, the audit's first
   L2 threat). The hook's record that a fight had been entered lived in memory, and every switch is now a reload.
   `game/bossPersistence.js` `enteredBefore` seeds it from the loaded store: a fight on, or one the dragon has lost health
   in and not been slain. A fight never begun and a slain dragon's return keep the entrance. No save-format change; L3
   decides the repair of boss saves already clobbered on disk.
203. **Nothing is saved before Start, and a load's pending spot is what a save writes.** App's autosave and every switch
   go through `saveWorldInPlay`, which saves only once the game has started: a title save minted a slot for an empty world
   (a New World pressed and left would have taken the next visit's Continue) and moved "last played". `savePosition`
   returns a pending `resumeSpawn`: until the hold places the body it is in the sky freeze over the origin or held, and a
   save then wrote the freeze over the save's spot. The boot's load ran before the quest system published the
   notification channel, so its notices (a retired quest's reward, the Cut's respec) were lost; `bootWorld` holds them
   in `_bootNotices` and the quest system replays them.
204. **Gates whose subject moved, changed with their reason.** `context-loss-gates`: the boot resume moved from
   ContextLossPanel's effect to `bootWorld`, and before Start the recovery now writes a note naming what the tab holds
   (it wrote none). `hud-hotbar-gates`: the HUD slice has two consumers, not three (the World Manager no longer takes
   the slice), so its scan floor is "at least 2". `hud-slice-reachability`: the Create World row is gone with the
   `startNewWorld` and `loadWorldData` keys the slice no longer carries. `lazy-motion-strict-gates`: the World Manager's
   props. `tests/e2e/context-loss.spec.js` reads the new note key.
205. **The proof.** Red first against 5f00f246 from a scratch copy (logs in the lane's scratch): the returning-player
   gate (visit 2: "the title offers no Continue (state level 1, worlds 1)"), the switch gate (the quest log after the
   resume is the fresh one; after Create and after Load the dragon hook keeps the fight at 600 and 550 HP), the
   entrance gate (two of three cases), `savePosition` (the sky written over the pending spot). The two jsdom gates ran
   on HEAD with three instrument stubs, none changing behaviour: `startGame.jsx` as 5f00f246's `index.jsx` render,
   `data-testid` on the title's one button, and the reload as a module function. Mutation proofs in the commit
   trailers. The lived proof is `tests/e2e/continue.spec.js` on CI: stand on land more than three chunks out, save,
   reload, click Continue while the world builds; body y sampled every drawn frame from the reload to 30 frames after
   the body stands at the save, never more than 1 m under the save at its column, never off it, the autosave writes
   that spot into the one slot, no pageerror. Green on the PR's run 41165714994 (head `fa0be54c`, first attempt; its
   readings: minY equal to the save, never off the column, the slot at the save). Its red half on branches carrying the
   spec's final text, the e2e job narrowed to it: control `mut/l2-ctl` run 41165729043 green on the first attempt;
   `mut/l2-hold` (resolveResumeSpawn places the save at once) run 41165731765 red on all three, "the body dropped more
   than 1 m under the saved height at the save's column" (minY 20.12 against 56.95; the body fell through the world, came
   back at the origin, and the autosave wrote the origin over the slot, the audit's finding) and twice "the boot never
   stood the player at the save" (the fall killed the player); `mut/l2-boot` (startGame renders without the boot's load)
   run 41165734679 red on all three, "the title offers no Continue after the reload". Each branch's unit job failed on
   `ci-required-check.test.js`, which the narrowed matrix breaks, and on the mutated subject's own gates.
   - **The harness took five rounds, each read from its trace.** Waiting for the arrival before clicking lost the title
     to App's world-ready lock, which CI's headless Chromium granted with no gesture (run 41154002602; registry
     REVIEW:l2:headless-grants-gestureless-lock); refusing every lock paused the world from the click, and in that pause
     the save's ground streamed in under the hold mutant, which passed (run 41157732564); a flag armed just before the
     click let the timer's request through while the click waited for the button to settle (run 41162831435, attempt 1).
     The page now grants a lock only to a request made inside a trusted input event, as a browser does. CI drew this page
     at 0.4 to 1.3 frames a second, so the window after the arrival is counted in drawn frames, each up to 0.25 s of world
     time.
206. **What stays open.** The persistence halves of AUDIT:verbs:squad-not-saved-and-leaks-across-worlds and
   AUDIT:debt:shrine-facts-session-scoped (L3), the lifetime half of AUDIT:leaks:stranded-pickups-never-despawn (L9) and
   the load heal of AUDIT:numeric:load-mid-fight-full-heal (L8): their carry, leak, world and wounded-dragon halves are
   this lane's, now closed by the reload (the dragon after a Load is the save's, flushed a moment before). The reload
   also makes the heal easier to reach: a refresh resumes in place, so mid-fight it is one key (F5), not Esc > Manage
   Worlds > Save > Load; the death-screen refresh it opened (alive again where the player fell) is closed by item 222.
   And every plain visit claiming the newest slot made AUDIT:persistence:two-tabs-clobber-world reachable with a second
   tab and Continue alone; item 221 closes it. Opened: a far save's boot streams the origin's chunks first, because the
   world-built signal is chunk 0_0 (REVIEW:l2:far-save-boot-streams-origin-first), and the e2e harness's note that
   headless Chromium refuses a gestureless lock no longer holds on CI (REVIEW:l2:headless-grants-gestureless-lock).

**Round 2** (the fixer, on the round-1 reviews: static FIX, dynamic FIX, no defect in the shipped behaviour). Items
219-224.

219. **A save the boot loads cannot crash every boot, and one that throws says so** (static F1 and F5, dynamic C3 and
   C4). Every visit loads the newest save before the first render, so a save that breaks the world came back on every
   reload of the tab, the crash screen's Reload being a plain visit.
   - Block edits load only as cells (`game/saveSchema.js` `liveBlocks`): `world_data.blocks: [[5, 3]]` loaded and threw
     when Terrain published its worker (`key.split is not a function`), outside the boot's guard. A key that is not
     `x_y_z` and an entry that is no pair are dropped; a list that is no list loads as no edits.
   - A save that throws as it loads leaves nothing of itself: the store reset, the climate sampler reseeded (the load
     seeds it before its reducer), its notices dropped. The title says the world could not be opened and is kept in the
     World Manager (store `bootHeld`, `menu.heldUnreadable`, en and zh-CN); the new world mints its own slot. A routine
     call: the plain visit does not go on to open the next older world, which would read as progress lost from the one
     the player last played; the title names that one, and the rest are in the World Manager.
220. **The crash-loop breaker.** The boot leaves sessionStorage `crafty.bootAttempt` `{ world }` when it loads a world,
   before the first render; `systems/BootSettle.jsx`, mounted in GameScene after the world and the player and armed by
   its effect, takes it back on the world's first frame. A plain visit that finds an attempt naming the world it would
   load holds that world: Start Adventure, one line (`menu.heldStopped`) and Open it anyway, a note naming the world,
   which loads it (a note is a choice; a plain visit is not). A page that held a world leaves the attempt it found
   (`settleBoot` takes back only the page's own), so a refresh of the held title holds it again.
   - Known cost: a reload in the moment between the boot and the world's first frame holds the world too, with the
     same line and one tap back. Clearing at Start or at world-built instead would widen that window to the whole
     build, behind the title; clearing at render would let a mount crash clear it.
   - Not covered: a world that breaks after its first frame (a throw in a later chunk's mesh), and a browser that
     refuses sessionStorage (no attempt, no hold).
   - The proof: `tests/gates/boot-guard-gates.test.jsx` runs the real entry and the real ErrorBoundary with a stood-in
     world that throws at mount (R3F's Canvas rethrows a scene error to its parent, `@react-three/fiber` 9.5); red
     first, "the reload booted the same world into the same crash". The jsdom gates that load one world over several
     pages now stand in a world that runs, or their third visit would be held. `tests/e2e/continue.spec.js` records
     every write and removal of the attempt on its reload: the boot must leave one and the running world must take it
     back. Its red half on branches carrying the final spec text, the e2e job narrowed to it (base c18ff0c3): control
     `mut/l2f-ctl` run 41174504149 green on its first attempt (the attempt set, then removed, none left);
     `mut/l2f-settle` (GameScene mounts no BootSettle) run 41174506142 red on all three attempts, "the world ran and
     its boot's attempt was not taken back", its presence line (the attempt set) passing first. Each branch's unit job
     failed only on `ci-required-check.test.js`, which the narrowed matrix breaks; both branches are deleted.
221. **Two tabs on one world: the stale tab stops saving and says so** (static F2, dynamic F1;
   AUDIT:persistence:two-tabs-clobber-world). The store keeps the slot's `saved_at` as the tab last read it (the claim,
   from the save index) or wrote it, in the transient `_slotSavedAt`. `saveActiveWorld`, which every save of the tab's
   own slot now goes through (the autosave, the flush on hide and unload, every switch, the World Manager's Save
   Current World; Create writes a new slot of its own), reads the index entry first; when its `saved_at` is later than the one the tab knows, or the tab knows none and the index
   has one, it writes nothing and sets `slotConflict`. `ui/SlotConflictPanel.jsx` (App, beside the context-loss panel)
   says so in one line and offers Reload, a switch to the slot; it is a covering surface (`ui/panelState.js`), so input
   leaves the world and the pointer is given back. The manual Save no longer writes its own payload: it kept no name,
   creation date or visibility (AUDIT:persistence:manual-save-renames-and-resets, closed); the autosave keeps
   `is_public` too. Gate: `tests/gates/two-tab-save-gates.test.jsx`, two store instances over one localStorage, the
   clock moved between writes; red first, "tab A's stale save wrote over tab B's 30 minutes: expected 111 to be 1110".
   Not done: telling the stale tab the moment the other writes (a `storage` listener; it is told at its next save, at
   most 5 s of play or the hide flush later), and a write that lands between the index read and the write in one task
   (REVIEW:l2:tab-conflict-told-at-next-save).
222. **A dead player is saved as Respawn leaves them; a living player's refresh heal is lane L8's load-heal call**
   (static F3). A save written while dead stood the player where they fell, and with nothing pending the reload loaded
   the save made alive a few seconds before the death: F5 on the death screen was a way back to life. Now
   `game/saveSchema.js` `asRespawned` is what `saveActiveWorld` writes while `isAlive` is false: no position (the load
   stands the player at the origin spawn, Respawn's place) and the death counted; and `isAlive` is an autosave trigger,
   so the death itself schedules a save and the unload flushes it. Gate: `tests/gates/dead-refresh-gates.test.jsx`; red
   first, the refresh resumed at `{ x: 61.5, y: 40, z: -44.5 }`. A refresh still heals a LIVING player to full, as every
   load does: that is AUDIT:numeric:load-mid-fight-full-heal, lane L8's design call (save health and mana, or refuse
   the switch in a fight), now reachable with one key, and recorded so on its row.
223. **Gates for the round-1 review's surviving mutants.** The dynamic review's M8 (a slain dragon counted as a fight
   entered), M14 (Create writes the world in play into the new slot), M17 (the boot's fresh world ignores Create's
   slot), M16a and M16b (a throwing load not reset, or rethrown into a blank page) each survived the lane's gates. Its
   probes are now gates: the slain dragon's due return wakes with its entrance (`boss-reload-entrance-gates`); Create's
   slot holds a new world at once, the new world owns it, saves into it and mints none of its own
   (`world-switch-boot-gates`, which also kills the static review's `goToWorld({ fresh: true })`); the throwing save is
   item 219's page case. Each RED under its mutant, in the commit trailers.
224. **Recorded, not fixed here.** A browser that refuses sessionStorage writes turns every switch into a reload into
   the newest world, with no word to the player (static F6, REVIEW:l2:switch-without-session-storage). The title's
   look, now with the held line and the conflict panel, was judged on CI's SwiftShader shots, not eye-level lookbook
   frames (static F7, REVIEW:l2:title-look-unjudged-on-lookbook: a real-GPU run is the command session's). A save under
   a minute old reads "played this minute" (dynamic F4, REVIEW:l2:last-played-this-minute). A won world whose dragon
   the old resume wipe wrote back alive at 700 HP now wakes with no entrance, since `enteredBefore` reads it as a fight
   entered (dynamic F3): noted on AUDIT:lane:L3-store-owns-world-state, whose repair decision it informs.

---

## 2026-10-30 (lane L4, round 2) — [LOOP] two jobs: the void line takes a fall out of the world, a stuck-in-rock recovery takes a body in the rock, and the spawn's blind drop is followed

**Decided by the command session on lane L4's round-1 reviews, built by the round-2 fixer** (static and dynamic FIX on
one regression; branch `fix/l4-void-line`, PR #66). Items 213-218.

213. **Two jobs, not one line.** Item 207 lowered the void line to the world's floor (a centre under y 1.4), and with
   it went the only thing that ever moved a body clipped into the rock: a chunk's trimesh is hollow (the mesher closes
   each chunk), so a clipped body falls through the rock until the back of a face stops it, and over a cave that face is
   the cave's ceiling, above the line. The round-1 dynamic review measured it on the real generator
   (`frontend/src/world/terrain.worker.js`, default seed, real Rapier and the Player's controller): 1483 of 6400
   columns within 40 m of the spawn have a ceiling between y 1.5 and 9 under at least 3.5 m of rock, and of 40 bodies
   put in the rock there, all 40 stayed with their centre in solid at `9495a23f`, where the old y 10 line had reset all
   40. The static review found the same end after the spawn's blind drop: the one terrain worker builds chunks one after
   another (`frontend/src/world/Terrain.jsx` makes one; `terrain.worker.js` handles its messages in order), and after a
   respawn far out 0_0 is the top tier's 41st request, so a worker slower than about 0.15 s a chunk is still building it
   when the 6 s wait runs out. The command session's call: the void line handles a fall out of the world, and a
   stuck-in-rock recovery handles a body whose centre is inside solid ground, wherever it is; and the blind drop is
   followed until the corner answers. Both are below.
214. **The stuck-in-rock recovery** (`frontend/src/game/stuckInRock.js`, new). Every STUCK_CHECK_SEC (0.1 s) of the
   frame's real time the Player reads the cell holding the body's centre from the trimeshes, by the odd count of faces a
   ray up its middle crosses (`frontend/src/game/formFit.js` cellSolid, the load fit's reading from items 155-159), and
   moves the body only once its readings have been solid for STUCK_CONFIRM_SEC (0.2 s, three readings): a reading is of
   the colliders, which change between steps as chunks land and re-mesh, and a body truly in the rock is still in it
   three readings on. The spot is the load fit's search (`fitLoadedSpot`, which now takes the body's own shape, so a
   beast form clears the rock by its own reach): the nearest spot within a few decimetres whose cell is not solid and
   where the capsule is clear, else the top of the columns the capsule stands across; through `placeBody`, its fall
   dropped and the camera with it; never the origin. Components.jsx runs it on every frame in play, after the spawn
   branch (the per-frame order is otherwise unchanged); the chaos harness mirrors it. Cost: a frame adds its step to a
   counter; a reading is one ray cast per face above the centre, ten a second; the fit runs only when the body is moved.
   Measured, the debounce guards nothing normal play produces: with the window at 0, no wall slide, press, swap, load or
   respawn in any chaos session (seed 1, 56 sessions, ten readings a second) read a centre in solid, and the mutant
   survived all three files; it is killed only by a reading made to clear within 0.15 s
   (`frontend/tests/gates/stuck-in-rock-gates.test.jsx`) and by the unit test. It is kept: it costs at most 0.2 s on a
   body that is stuck, and it makes one wrong reading harmless. Commit `ab662a2f`.
215. **Item 207's claim, corrected, with the comments and the title that repeated it.** Item 207 said a body clipped
   into the ground falls onto the bottom face of the cells at y 0; that holds only over rock that runs down to y 0. Over
   a cave the ceiling stops it (the gate's three real-world cases stopped at 2.95, 3.95 and 5.95 at `9495a23f`), and at
   the spawn corner, where the capsule straddles the closed edges of four chunks, the body stopped half a metre after the
   chunks landed round it (43.3, in the rock). Item 207 is corrected in place, and so are
   `frontend/src/game/spawnPlacement.js` (VOID_LINE_Y's comment), its unit test's comment, the chaos harness's voidFall
   comment, and the gate "a player clipped into the ground falls through the hollow rock onto the world's bottom face and
   is reset" (`frontend/tests/gates/player-placement-gates.test.jsx`), which now clips over the harness's new cave and
   asserts the player stands on their column's top where they clipped; the bottom face stays as the void line's own case
   ("a player on the world's bottom face, inside its last cells, is reset by the void guard"). SPAWN_PROBE_MAX_SEC's
   comment said "Six seconds covers the top tier's corner and the worker"; it now says the six seconds are past the
   request and do not bound the build. The L4 entry's "Items 207-213" read 207-212 (static finding 4).
216. **The spawn's blind drop is followed** (the static review's option 1). `resolveSpawnGround` marks the fallback after
   the wait `blind: true`; for the wait's length again the Player reads the spawn corner each frame (the wait's own probe
   and cost), and once it answers stands a body whose lowest point is under that ground on it (`followBlindDrop`); a body
   that has walked off the corner, or a corner that never answers, is left to item 214. It is not redundant with item
   214: with the corner's top face across the capsule (the centre 0.4 m over it, the lowest point 0.5 m under), no reading
   of the centre sees the body, and at `9495a23f` it stayed 0.4 m in the ground; the follow stands it at 52.95. Commit
   `ab662a2f`.
217. **The gates.** Red first at `9495a23f`, green at the fix:
   - `frontend/tests/gates/stuck-in-rock-gates.test.jsx` (new): the real Player on terrain.worker.js's nine chunks round
     the spawn. Three cave columns from a scan (216 of 1936 have a ceiling between 1.5 and 9), each at 60 and 120 Hz: red
     6 of 6 (on the ceiling, centre in rock, 0.4 m deep), now each stands on its column's top at the same x and z. The
     blind drop with the corner's chunks landing 8 m into the rock or with their top face across the capsule, at 60 and
     120 Hz: red 4 of 4, now each stands on the corner's ground. A reading that clears within 0.15 s moves no one (0.0001
     m), held a second it stands the player clear (3 m): red on its second half.
   - The chaos gate's seventh invariant, I7: a body clipped into the rock is stood clear within half a second, within a
     metre of where it clipped, before any void reset, and no recovery moves a player who never clipped. The harness's
     world has a cave under the field (`FIELD_CAVE`, cells 2 to 4 of x -15 to -2, z 16 to 29), inside chunk -1_1 only: a
     first cut reaching into -1_0 moved the overhang's sessions (8165 to 8190 frames on seed 1), because a chunk's
     triangulation decides where a body slides. Each field session clips once (the whole capsule put in unbroken rock
     over the cave; seed 2 found a clip whose centre landed in a pocket the player had dug, which is not in the rock, and
     the driver now passes over such cells). Red at `9495a23f`'s code, on the harness's first cut before the recovery was
     wired: 8 of 8 field sessions (still in the rock 30 frames after the clip, on the ceiling at 5.95); on the final harness
     the recovery's removal reds the same 8. Floors for the field file: clips 8, stuckRecoveries 8. The other places'
     sessions are unchanged: on seeds 1 to 8 the cave/overhang and shore/deep/cliff files read what the L4 entry's seed run
     read (frames under the old line 4814 to 5287, shafts out of the world 5 to 7 of 8), with 0 recoveries.
   - `frontend/tests/integration/stuck-in-rock-rapier.test.js` (new: the reading's rate and window, the spot, the
     body's own shape), `frontend/src/game/spawnPlacement.test.js` and `frontend/tests/game/spawnPlacement.test.js` (the
     fallback's `blind`, followBlindDrop). The instruments test shows I7 reading a body left in the rock, a recovery with
     no clip and one stood at the origin.
   - The gate headers name what they cannot see (static finding 3): I6 reads ground under the feet only, so at the line
     it restates the line's height (red when the line is raised, not on a reset it could tell apart), and the chaos
     harness's probe always answers, so the blind drop and its follow run only in `stuck-in-rock-gates`. Commit
     `ab662a2f`, whose message carries the red runs and the mutation proofs.
218. **Found, not fixed** (registry rows): REVIEW:l4:centre-clear-capsule-in-rock (a body whose capsule reaches into the
   rock with its centre in air, anywhere but the spawn corner, is moved by nothing: at `9495a23f` the corner case stayed
   0.4 m in the ground, and item 214 reads only the centre); REVIEW:l4:origin-corner-dug-through-respawn-loop (the spawn
   corner's four columns dug through y 0: every respawn drops, falls out and loops, as at `5f00f246`);
   REVIEW:l4:caves-open-the-world-floor (caves carve the cell at y 0 in 1355 of 6400 columns near the spawn, so a cave's
   floor can open onto the void); REVIEW:l4:round-1-surviving-mutants (SPAWN_PROBE_MAX_SEC at 3.3, the spawn call
   without the frame's step, and the line at 1.85 on the Player gate survived round 1's gates).

The gate on seeds 1 to 8 at the fix (local, the three session files; the field file run again after the clip's driver
fix of item 217): 56 sessions a seed and no invariant red on any seed; the deepest into solid 0.000 m on every seed; in
the field file 8 clips and 8 recoveries a seed (176 to 189 frames in the rock, about 22 a clip), and no recovery in the 48
sessions a seed that never clip; walk-held readings 28, 23, 22, 33, 19, 38, 29 and 29, every one an own shell, none held;
the deep place's shafts out of the world and its frames under the old line as in the L4 entry's seed run. Seed 7 misses one
SETUP floor (field-origin savesLegacy, 0 of 16 saves, floor 2): the clip's draws moved the field sessions' later picks.
Seed 2's swapsRefused miss (items 165 and 170, and the L4 entry's run) is gone: 7 refused.

Mutation proofs (`frontend/scripts/dev/mutate.sh` in a throwaway copy, identity mutants first and last on each batch,
all survived) are in the fix commit's trailer: the recovery off (the module, and the Player loop's call alone), to the
origin, read once a second, without its debounce, and with a reading of air not restarting the window; the blind drop not
followed, the follow reading the centre, the fallback not marked blind, the follow holding a body off the corner; the fit
standing the base capsule for a beast form. Each RED; the debounce's removal survives the chaos files (item 214).

---

## 2026-10-30 (lane L4) — [LOOP] the void line is the world's floor, the void reset and the respawn go back to the spawn one way, and the spawn waits for its ground in seconds

**Decided by lane L4's builder** (registry AUDIT:lane:L4-void-line-and-spawn-recovery, from the deep audit's section 4,
`docs/superpowers/audits/2026-10-30-deep-audit.md`; branch `fix/l4-void-line`). Items 207-212; item 213 on separates the
void line's job from a stuck-in-rock recovery and corrects item 207.

207. **The void line is the world's floor, not y 10.** The void guard reset any body whose centre was under y 10, and the
   deep ocean's seabed is 6 to 10 (`frontend/src/world/oceanProfile.js` DEEP_FLOOR), and a player can dig to the last
   cell at y 0: standing there, they were taken to the origin with no message (registry
   AUDIT:desync:void-guard-fires-inside-the-playable-world, REVIEW:chaos-play:deep-seabed-under-void-line). The world's
   cells run from y 0 up, so no floor is lower than y 1; a body under the world has nothing below it, and one clipped
   into rock that runs down to y 0 falls through the hollow trimesh onto the bottom face of the cells there (a scratch
   probe: from y 4 in the rock it stood at 0.95). [Corrected by item 215: this sentence said a clipped body always reaches
   the bottom face; over a cave the ceiling stops it above the line, and nothing then moved it.]
   `frontend/src/game/spawnPlacement.js` puts the line at the base capsule's centre with
   its lowest point half a metre from both floors (y 1.4); every beast form's centre, standing on either, falls on the
   same side, and the unit test stands every shape `BEAST_FORMS` holds on both. `resolveResumeSpawn` reads the same line,
   so a save on the seabed under y 10 now resumes there (item 156 covered the seabed at 10 only). The chaos harness's deep
   place stands at DEEP_FLOOR (item 156 stood it at 10 to keep it over the old line; superseded). Commit `22955c99`; its
   message leaves out one changed test input, which `c5ea507c`'s message records: `context-loss-gates.test.jsx`'s
   unusable save "a void y" was y 2, where a base capsule stands on the last cell, and is now y 0.5.
208. **The void reset and the respawn after a death go back to the spawn one way.** The respawn moved the body to the
   origin's hold, restarted the probe's wait and moved the camera there (chunk streaming follows the camera, KEVIN-FIX
   C1). The void reset moved only the body: the camera stayed at the fall site, the origin never streamed while the body
   waited, and the probe's count went on from the first spawn's (registry AUDIT:ultra:ultra-player-world-7).
   `spawnPlacement.js returnToSpawn` clears the placed flag, restarts the wait, holds the body over the origin through
   `kinematicMove.js placeBody` (the collider with it) and stops it, resets the stance and puts the camera at the hold's
   eye; `Components.jsx`'s void branch and respawn effect both call it, and the frame order is unchanged. The chaos
   harness calls it too. `teleportPlayer` keeps one caller, the store's load, so `combatStance.js` no longer re-exports it
   (knip --production). Commit `c5ea507c`.
209. **The spawn waits for its ground in seconds: six.** The audit asked for the respawn's late drop at med and high tier
   to be measured. The wait was 120 frames, 2 s at 60 Hz and 1 s at 120 Hz, and the spawn corner's last chunk (0_0) is
   asked for 1.05 s on at low, 1.95 s at med and 3.15 s at high (`frontend/src/world/Terrain.jsx`: two requests every
   150 ms, row by row across the box round the camera's chunk), so the player was dropped from y 60 over ground still
   streaming in. Verifier 39's probe (the real Player loop and Rapier, Terrain.jsx's streamer modelled), ported to a
   120 Hz display, at three tiers and three chunk latencies (0.1, 0.25, 0.5 s), after a death and after a fall under
   the world 390 m out:

   | Code | 60 Hz: ended in the ground | 120 Hz: ended in the ground | Blind drops from y 60 |
   |---|---|---|---|
   | `5f00f246` | 4 of 18 (the void reset's 3 at 0.5 s, the respawn's at high) | 5 of 18 | 33 of 36 runs |
   | `c5ea507c` (item 208, the old wait) | 2 of 18 (high, 0.5 s) | 6 of 18 (every high-tier run, at y 2 to 15.5) | 29 of 36 |
   | `1c58500c` (this item) | 0 | 0 | 0; every run stood 1.05 to 3.61 s on and walked away |

   Item 207 made the second row worse than the first at high tier: y 10 had reset a body sinking through the rock, and in
   those runs the body stopped above the world's bottom face (y 2 to 15.5) at the spawn corner, where the border faces of
   four chunks meet inside the rock (the mesher closes every chunk); why it stops there was not isolated.
   `SPAWN_PROBE_MAX_SEC` (6 s) replaces the frame count; `resolveSpawnGround` takes the seconds waited and the frame's
   step, the Player loop adds its frame's delta. The resume hold's wait is still 600 frames (registry
   REVIEW:l4:resume-wait-counted-in-frames). Commit `1c58500c`.
210. **The chaos gate's sixth invariant, and the dig-then-reset seed.** I6: the void guard resets no player with ground
   under their feet (the logical world, the columns the capsule's footprint covers); the instruments show it seeing a
   reset on open land and none under the world or on its bottom face. Every deep-place session ends by digging a
   two-column shaft through the seabed's last cells and out of the bottom of the world, then respawns; the teleport the
   other places end with puts the body under the world (y -2), not at y 5, which is now inside the rock. Floors:
   voidResets 16 a file; at the shore file framesUnderOldVoidLine 1700 (5188 reached on seed 1) and shaftsThroughWorld 2
   (7 of 8). A one-column shaft did not work as the seed: a capsule within the controller's 0.05 m offset of a wall reads
   grounded on about half its frames and slides down it at the glue speed (registry REVIEW:l4:kcc-grounded-on-wall).
   Commit `22955c99`.
211. **Two items of the brief were already done.** Spawn ground by `worldBlocks.get(key) > 0`: the audit's verifier ran
   `62159bc1`, before item 152 (`3fd4b468`) took the worldBlocks read out of the Player loop; the spawn reads the four
   corner columns by the physics probe (`git merge-base --is-ancestor 3fd4b468 62159bc1` exits 1, and `grep -n
   worldBlocks frontend/src/Components.jsx` lists only the voidhand tint). Raising REVIEW:fix-invisible-box:respawn-counts-
   mined to HIGH: the row was closed by `3fd4b468`, and the verifier's trap (moved 0 m after digging at the origin and
   a void reset) was the read item 152 removed; at `5f00f246` the chaos origin sessions dig that column before their fall
   (floor respawnsAfterOriginMine 2) and none is held.
212. **Found, not fixed.** REVIEW:l4:kcc-grounded-on-wall (item 210) and REVIEW:l4:resume-wait-counted-in-frames (item
   209), each a registry row with its measurement.

The gate on seeds 1 to 8 after the fixes (at `1c58500c`, local, the three session files): 56 sessions a seed, none red,
the deepest into solid 0.000 m on every seed; walk-held readings 32, 21, 26, 30, 22, 37, 28 and 28, every one an own
shell, none held; shafts dug out of the world 7, 7, 7, 5, 6, 7, 5 and 5 of 8; frames under the old line 4814 to 5287 (floor
1700); void resets 56 a seed, I6 0. Seed 2 misses the same SETUP floor as in items 165 and 170 (field-origin
swapsRefused 1, floor 2).

Mutation proofs (`frontend/scripts/dev/mutate.sh` in a throwaway copy; identity mutants first and last, all survived)
are in each commit's trailer: the line back at 10, under the bottom face, over the last cell, and the Player loop's guard
on the old line; I6 never noted; returnToSpawn without the camera, the restarted wait, placeBody or the stance reset;
either branch back to its inline teleport; the wait back at 2 s, counted in 60 Hz frames, or blind to the frame's step.
Each RED.

---

## 2026-10-30 — [LOOP] L11: one fact, one predicate: the sea line, the landmark, the sight line, the kill's tier, the cooldown and the move basis

**Decided by the L11 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L11 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4). Each stands while it earns its place. Six facts had
two producers that could disagree; each now has one predicate or constant, and a consistency gate that drives both
producers and reds when either moves alone. Every gate was run red against 1a3910e7's code before its fix (a scratch copy;
the pre-commit hook refuses a red commit), and mutation-proven with `scripts/dev/mutate.sh` (the numbers are in each
commit's `Mutation-Proof:` trailer).

180. **The sea has one predicate: `oceanProfile.seaFillsCell(y, surfaceY)`.** (AUDIT:ultra:ultra-player-world-9) The terrain
   worker fills water into the cells above a column's surface up to SEA_LEVEL; `climate.surfaceBlockAt` said `isWater` for
   `surfaceY <= SEA_LEVEL`. A surfaceY 28 column is dry sand with nothing above it, so the two disagreed on exactly the
   last dry shoreline column: the wind bed turned to the muffled underwater sound there, and the far-field ring drew the
   strip as sea one column inland. The worker now fills with `seaFillsCell`; `isSeaColumn` is derived from it and is what
   `isWater` returns. The worker has no exports and cannot be imported under vitest, so the gate reads its voxels through
   its message handler (an `update_block` to air answers `block_broken` with the id it replaced), once per column since the
   read replaces the block. On 1a3910e7, 8 of 24 columns disagreed at each of seeds 12345 and 777, every one surfaceY 28.
   The verifier's 18.2% residue on those columns is SoundManager sampling a float position, which this does not touch.
   One more reader of the strip's old meaning was found by CI, not by search (run 41132117834, shard 6/8 red on all three
   attempts): `tests/e2e/place-clear-of-player.spec.js` picked its shore columns by `isWater` on a neighbour, so the dry
   strip counted as the sea and, with the strict predicate, no column qualified ("no beach column one block over the sea
   within 80 m"). It now names the sea line itself (a neighbour at or below SEA_LEVEL) and picks the same columns: the same
   4 candidates, and the same 16 within 80 m of Kevin's spot, checked offline against the old rule.

181. **A landmark exists in one place: `shrines.landmarkAt(cx, cz)`.** (AUDIT:ultra:ultra-player-world-6) A hashed chunk
   holds a landmark only on land (not a water column, surface at least 32). Terrain.jsx drew by that rule; `nearestLandmark`
   used the bare hash, so the cyan beam, the compass, the minimap dot, the HUD objective and the Pilgrimage reach test led
   to a shrine nobody could see. In a 501 x 501 chunk window 824 of 3,508 hashed chunks at seed 12345 (744 at seed 777)
   were not drawn, and 21 and 24 of 121 probe players had one as their nearest. The finder now scans `landmarkAt`, and
   LandmarksRender takes each loaded chunk's landmark from it with no filter of its own. When no drawn landmark lies within
   the radius the finder returns null, as it always could, and the HUD falls back to the Blight Heart. The answer is
   memoised per chunk and cleared when the climate sampler changes seed (`climate.getClimateSeed`), because FarBeacon asks
   for a 33 x 33 chunk window every frame and a climate sample allocates. The gate restates the renderer's rule from the
   sampler alone (so retuning the rule in one place reds it), covers chunks on surface 31 and 32, the line, and a re-seed
   round trip. The renderer's use of `landmarkAt` is pinned by `landmarks-gates`, sliced to the component body; Terrain.jsx
   builds a worker at module top and cannot be rendered under vitest, so that half is structural.

182. **Line of sight reads the true column tops, as a second grid.** (AUDIT:ultra:ultra-game-logic-3) `heightGridAt` writes
   Infinity for a column a mob cannot stand in, and `hasLineOfSight` compares a column with the higher of its two ends plus
   1.2, so a player on a pillar 5 or more blocks above the mob's feet made an Infinity end and nothing blocked. The hunter's
   finite stand-in gives the same sight and loosens `clampMove` (it reads the floor grid); the lane brief said the same.
   `localPath.sightGridAt` replaces each Infinity cell with the column's top (the store's `getMobGroundLevel`), and
   `mobGridsAt` returns both grids, which AIWorkerSystem sends; the worker's cover search reads `sightGrid || heightGrid`
   for line of sight and nothing else changes. A finite floor stays the floor (a roof over open room is not a wall to
   sight). Cost, by reading and not measured on a device: at most one extra top cast per wall cell, 81 at the very most
   per aggro mob per 15 Hz tick, beside the floor probe's multi-cast walk that already runs for all 81; none when no cell
   is a wall. The gate is the verifier's scene on the real parts (real mesher, real Rapier world, real probes, the real
   `ai.worker.js` tick): pillars of 5, 6 and 8 blocks fail on 1a3910e7, 1, 3 and 4 pass, and with no wall there is no cover
   to take. `AUDIT:combat:skeleton-arrows-ignore-terrain` can read the same grid for an archer's sight; this lane does not.

183. **A kill's position is the bus's array.** (AUDIT:numeric:kill-loot-tier-always-zero) `mobKillBus` documents and
   CombatSystem emits `[x, y, z]`; the loot roll read `.x` and `.z`, so every kill rolled at tier 0 and S7's "farther is
   rarer" never applied to a mob kill. It reads `position[0]` and `position[2]`. The gate emits real kills on the real bus
   into the real `useQuestSystem` and reads a zombie's epic Iron Nugget (0.3 x (1 + 0.25 x tier)) with the roll just under
   and just over the chance of the kill's own tier, at five positions that put a large or small y beside x and z. Tiers 1
   to 4 fail on 1a3910e7. The nuggets have no use today (`REVIEW:w2f:forge-orphan-loot`); the row serves only as the
   probe. The emitter's array shape stays pinned by `kill-attribution-gates` (CombatSystem's death path is closure-scoped).

184. **The ability bar's cooldown durations are the machines' constants.** (AUDIT:ultra:ultra-game-logic-6)
   `cooldownMirror.js` imports `GRAB_COOLDOWN_SEC`, `SNARE_COOLDOWN_SEC` and beastTransform's `COOLDOWN_SEC` in place of
   0.6, 1.5 and 1.5. The gate names no number: it drives each real machine through the transition that arms its cooldown
   and holds that, on that frame, the mirror's remaining time is the whole of its duration. On the old mirror, retuning
   each constant (0.9, 2.0, 2.0) reds the matching slot; on the new one the same retunes leave it green, which is the
   point. It also asks that every machine-backed slot the mirror carries be driven, so a fourth cannot ship undriven. Not
   mirrored, and said in the gate: the dodge (its duration is the Player loop's own `cooldown`, handed in) and the imbue
   (no cooldown).

185. **A walk and a dodge read one planar basis, and an in-code deferral is a gate.** (AUDIT:ultra:ultra-game-logic-7)
   `locomotion.moveVector` calls `dodge.planarBasis`; the inline copy and its "unify later" comment are gone. The gate
   drives `moveVector` and `dodgeDirection` over 9 camera lengths (either side of the 0.001 line and the camera looking
   straight up) x 16 angles x 8 key directions and holds that they go the same way; it names no threshold, so moving the
   shared line moves both and stays green, while moving either old copy alone reds it. The row's note also asked for a
   sweep against deferral comments: `tests/scripts/no-deferral-comments.test.js` is a property check over every non-test
   file of `src/` (TODO, FIXME, "unify later" inside a comment), the detector shown first to see each form, sited in
   `tests/scripts/` because its subject is source content. It was red on exactly the one comment this lane removed.

**Not covered:** a lived run (there is no local browser in this lane; CI is the arbiter, `ci ok` on the exact head); the
sight grid's frame cost on an iPad-class device (item 182, by reading only); the Terrain.jsx renderer drawing
`landmarkAt`'s chunks (structural, item 181); the dodge and imbue slots of the mirror (item 184); and the enemy-arrow terrain
test (its own row).

**CI on the lane's head 973bce38** (run 41134824441): `ci ok`, with two first-attempt retries that are not this lane's:
mob-floor.spec.js:227 fails its first attempt in all four recent runs on three branches, two of which touch no mob or
terrain code (`REVIEW:e2e-flakes:mob-floor-roof-floor-infinity`), and hud-at-rest.spec.js:354 failed once, where the run
before it, on identical `src/`, passed it first time (`REVIEW:e2e-flakes:hud-at-rest-tracker-tap-canvas`).

**Round 2: the fixer after the round-1 reviews (static: LAND with six follow-ups; dynamic: FIX on one item).** Items 186-188
continue this lane's range. Main (5f00f246, the chaos-play gate) was merged in first with a merge commit; DECISIONS, Terrain.jsx
and the registry merged without a code conflict.

186. **A position is read at its column: `climate.surfaceBlockUnderfoot(x, z)` floors both axes.** (Supersedes the last sentence
   of item 180, "the verifier's 18.2% residue ... which this does not touch"; AUDIT:ultra:ultra-player-world-9.) The worker
   builds whole columns at integer coordinates, and SoundManager asked `surfaceBlockAt` at `playerPosition`, a float inside a
   column: a point no column has. The round-1 dynamic review measured it over a coastal band at seed 12345: the float sample
   read the wrong state at 12.5% of positions on the dry strip (surfaceY 28) and at 22.9% on the first wet column (surfaceY
   27, up from 0.7% once the predicate was strict, which item 180 had not recorded), while the column sample read 0.0% wrong
   on all three. Item 180 closed the row with the symptom still present, and with part of it new. `ambienceAt(x, z)` is now the
   one call SoundManager makes and goes through `surfaceBlockUnderfoot`; `footstepTypeAt` does too, because a footstep on the
   beach edge had the same defect (grass or snow on a sand column; 28 of 384 positions at each seed). The gate
   (`water-one-predicate-gates`, a second block) picks 8 shore columns per class (surfaceY 27, 28, 29, where a wet column and
   a dry one touch, 150 blocks apart) and drives the real worker's fill and `ambienceAt` over the 4 x 4 positions inside each: 384
   positions per seed. Red on the float sampler: the wind bed wrong at 64 of 384 positions at seed 12345 and 68 at seed 777, the
   footstep at 28 and 28. Not covered: SoundManager's interval itself (a React effect with an audio context; its call is pinned by
   `biome-ambience-gates`, a source check), and a lived run (no local browser). Not done on purpose: `surfaceBlockAt` itself
   still takes a float, because FarField and Ocean sample on purpose at ring and camera points, and flooring there would move
   the far-field silhouette (`REVIEW:l11:far-field-coast-no-frames` is the standing row for that look).

187. **The round-1 follow-ups, each disposed of.** Rows (LOW, open): `REVIEW:l11:sight-roofed-player` (static 1: CONFIRMED by
   a run in round 2, the review's own repro: with one block over the pillar the sight grid reads the roof, 61, the mob does
   not seek cover; the no-roof control does), `REVIEW:l11:sight-grid-every-aggro-mob` (static 2), `REVIEW:e2e-flakes:dragon-fight-parried-bite`
   (static 3 and dynamic: it predates the lane but the lane's effect on its rate is not shown), `REVIEW:l11:weather-samples-float-position`
   (found in round 2: two more player-position samples, in a component no gate drives) and `REVIEW:l11:far-field-coast-no-frames`
   (static: not reachable). Fixed here: static 6, CONFIRMED by a run (the landmark gate's SETUP counted surfaceY 31 and 32
   chunks under the other block's seed, because every describe body runs at collection; it now re-seeds and holds that the
   sampler counts the drawn chunks it counted at collection, red when the re-seed is removed); static 5 (`shrines.js` said both
   that FarBeacon asks every frame and that callers never do) and static 7 (history and audit receipts in three comments,
   against item 15); the `AUDIT` tag left the code comments.

188. **Reviewer verdicts are hypotheses until re-derived.** The static review called finding 1 LOW on a reading; its repro,
   run, shows the sight fix still fails for a roofed player, which is the lane's own headline fix. It stays a row because the
   case needs a roof over a pillar 5 or more blocks high with a wall between and a mob under a quarter health, and the right
   fix (the player's real y as the end height) changes what the worker is sent, which is not a one-line change in a review
   round; the row carries the scene and the numbers so the gate can be written red first.

**Round 3: the fixer after the round-2 reviews (static: FIX; dynamic: FIX, on the same item).** Items 189-191 continue this
lane's range. Main (449ce3ea, lane L5) was merged in first with a merge commit: DECISIONS conflicted at its top and both
sections were kept, and the registry merge left two chaos-play rows twice, identical, which `registry-dedupe` collapsed.

189. **The wind bed samples the camera, because the store's position is rounded.** (Supersedes item 186's premise that
   SoundManager asked about "`playerPosition`, a float inside a column", and the same premise in the sentence of item 180
   that begins "The verifier's 18.2% residue"; AUDIT:ultra:ultra-player-world-9.) PositionTracker writes `playerPosition` as
   `Math.round` of the camera's position, so round 2's floor did nothing in play: the floor of a whole number is that number,
   and the bed read the next column over whenever the player stood at or past the middle of a block. Round 2's gate fed
   `ambienceAt` unrounded positions, and so did the round-1 figures item 186 answered (12.5% and 22.9%), so neither could see
   it. Fed the store's rounded position, the coastal band read the wrong state at 24.6% of the positions inside surfaceY 27
   columns and 14.0% inside surfaceY 28 columns, identically before round 2 and after it (the round-2 dynamic review).
   SoundManager now samples `store.gameCamera.position`, the R3F camera the Player publishes and PositionTracker reads, which
   is what the footsteps already read (Components.jsx hands `footstepTypeAt` the camera's x and z); `playerPosition` is the
   fallback before the Player mounts. PositionTracker is unchanged, so none of the 26 other sites in `src` that read
   `playerPosition` gets a different value. The gate, `wind-bed-live-chain-gates`, drives the chain with one modelled link
   (the Player publishing its camera as `gameCamera`): the camera at a float position, the real PositionTracker frame
   callback, the real store, the real SoundProvider's 8 s interval and the cutoff it ramps the bed's filter to, against the
   real worker's water above the column the camera stands in, over the same 384 shore positions per seed. Red on round 2's
   code at 80 of 384 positions (seed 12345) and 76 (seed 777); the round-2 form, SoundManager on `playerPosition` alone, is
   among its mutants and goes red. Its SETUP holds that a sound fed the store's point is wrong somewhere in the probe set, so
   it goes red if PositionTracker stops rounding: that is a re-aim of the probe, not a defect in the game.

190. **The water gate's footstep reference is the worker's block, not the sampler.** (Static finding 4.) The footstep check
   compared `footstepTypeAt` at a position with `footstepTypeAt` at its column's corner, so a mistake inside it that depends
   only on the floored coordinates (one column over, x and z swapped) gave the same answer on both sides. It now reads the
   block the worker put on top of 8 columns per class where the beach meets the land (surfaceY 29, sand, and 30, the biome's
   own block: sand, grass, snow and dirt at these seeds), 256 positions per seed, and its SETUP holds that the reference has
   more than one footstep and that the float sample steps wrong on it. One column over in x, x and z swapped, every footstep
   sand, and two wrong table entries each go red. The worker harness and the shore picker the two water gates share live in
   `tests/_support/terrainWorker.js`. `biome-ambience-gates` loses its three pins on SoundManager's text
   (`ambienceAt(pp.x, pp.z)`, no `surfaceBlockAt`, `playerPosition`): they required round 2's call exactly as it was, and the
   live-chain gate drives which point the bed samples. The comments that carried round 2's premise, or said that every
   reader of a player's position goes through `surfaceBlockUnderfoot` (WeatherSystem does not), are corrected (static 3).

191. **The records are corrected where they were false.** `AUDIT:ultra:ultra-player-world-9`'s note said round 2 closed the
   residue; it now says why it did not and names round 3 and its gate. `REVIEW:l11:weather-samples-float-position` named the
   float as WeatherSystem's cause and `surfaceBlockUnderfoot` as its fix, which would change nothing, because both sites read
   `playerPosition`; its fix is now the camera, as here (static 2). Item 186's pointer, "the last sentence of item 180", names
   a sentence two more follow (static 5): it is the sentence that begins "The verifier's 18.2% residue". Two flake rows:
   `REVIEW:e2e-flakes:quest-text-no-frame-while-held` gains PR #63's certifying run 41157558361 (quest-text.spec.js:54,
   attempt 1 failed the hold's frame SETUP at frames 0, heldMs 380; retry #1 passed), and
   `REVIEW:e2e-flakes:dragon-fight-parried-bite-move` said one more failed attempt turns `ci ok` red after a failed first
   attempt, where it takes two (`frontend/playwright.config.js:31`, two retries on CI).

**Not covered:** a lived run (no local browser in this lane; CI is the arbiter, `ci ok` on the exact head); the Player's
publication of its camera is modelled in the gate, not driven; WeatherSystem's two samples stay a row.

---

## 2026-10-30 (lane L5, round 2) — [LOOP] the Player loop's half of the predicate is gated, a locked Aspect key reads it, and every way back is gated to ask for the pointer

**Decided by lane L5's round-2 fixer under the standing grant** (DECISIONS 2026-10-28 item 14). Round 1's static and
dynamic reviews of PR #63 both said FIX; this entry answers every finding they said must be fixed before landing, and
corrects two claims of the L5 entry below. Each stands while it earns its place.

178. **The Player loop's half of item 171's predicate is gated in jsdom, and a locked Aspect key reads the predicate.
   This corrects item 174's departure, whose reason was false twice.** Item 174 said a guard in Components' keydown
   "could not be gated in jsdom (the Player is R3F)" and that a key typed into a field "acts on nothing there".
   `tests/gates/player-view-hold-gates.test.jsx` already mounted the real Player with the real Rapier; and
   `denyAspectPress` (`src/input/aspectDeny.js`) read the input gate and `isAlive`, not `isInputLive`, so on touch, where
   the gate stays up under World Manager and under VICTORY, a locked R, V, X or Z typed into World Manager's name field
   or pressed under VICTORY raised a "locked Aspect" toast (REVIEW:l5:aspect-deny-reads-gate). It now reads
   `isInputLive(state, getInput().active)`. The departure itself stands on the true reason: Components' keydown gets no
   text-field guard, because the one text field is on World Manager, a covering surface, and the walk, the five Aspect
   machines and the refusal all read the predicate there.
   - `tests/gates/player-input-live-gates.test.jsx` mounts the real Player, raises the gate, and drives walk, jump,
     dodge, roar, grab, snare, fuse and imbue through their real intents (talents and a full ember bar) under each of 15
     covering surfaces put up by a store write that drops no gate: in play (the presence) walk 3.15 m, jump 1.81 m,
     dodge 4.62 m and every Aspect verb starts; under each surface, 0 m and none starts. Its keydown case types into the
     real World Manager's name field on touch and presses under VICTORY: on the old `denyAspectPress`, 6 and 4 locked
     toasts; on the fix, 0 and 0. Red under the frame reading the gate alone (the code before the lane), under each
     Aspect machine's and the walk's, jump's and dodge's own revert, and under the old refusal (`84dd95b8`;
     REVIEW:l5:player-loop-ungated).
   - **Every way back the player clicks or presses is gated to ask for the pointer once its surface is gone**
     (`tests/gates/close-relock-gates.test.jsx`, `3b9cd2c4`; REVIEW:l5:relock-ungated): each PANEL_FLAG's own close
     control and Esc over each (13 and 13), Keep exploring and Respawn, under the real MenuSystem, useInputManager and
     HUD. Because item 173 made `requestGameLock` refuse under any surface, a caller handing it state read before its
     own close write fails silently, and before this gate reverting MenuSystem's `enterPlay` to the render's gameState,
     or deleting Keep exploring's request, left every unit spec green.
   - **The wheel gate counts the slots a trackpad swipe moves through** (`08fc7e6c`; REVIEW:l5:wheel-gate-final-slot):
     it read the final slot of a 9-slot bar, which a stepper spinning the swipe through 19 slots also reaches. Its first
     case's title no longer claims a fast case on every browser; a fast macOS spin is REVIEW:l5:wheel-mac-medium-spin.
   - `input-live-gates`' chest case opens the chest as Terrain does now, with no release of its own, and its header names
     files that exist (`c1d88395`; REVIEW:l5:chest-case-old-opener).
179. **Item 172's "on touch play is never dropped" is corrected: two touch openers drop it.** The tray rows
   (`src/ui/TouchControls.jsx:324`, `if (yielded) setActive(false)`) and the locked Aspect sector (`:352`) drop `active`
   when they open a panel. Nothing item 172 decided rests on the claim: the predicate holds the world and the verbs
   whether or not an opener drops the gate, which `input-live-gates` checks for both openers. Round 1's other findings,
   each LOW and left for later by its review, are registry rows: REVIEW:l5:wheel-mac-medium-spin (a device question),
   REVIEW:l5:lock-granted-after-surface and REVIEW:l5:open-talents-hand-list; and the first-attempt flake both reviews'
   CI runs showed, which had no row, is REVIEW:e2e-flakes:dragon-fight-parried-bite-move.

**Not covered:** a real device (REVIEW:l5:device-run, Kevin's); whether the browser grants a lock the gates see asked for.

---

## 2026-10-30 — [LOOP] L5: one predicate for "input is live", close lists from PANEL_FLAGS, keys that respect focus, the wheel per notch, and the backdrop per press

**Decided by the L5 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L5 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4). PR #63. Each stands while it earns its place.

171. **Input is live only while nothing covers the game, whatever opened the surface: `src/input/inputLive.js`.** The input
   gate (`getInput().active`) is the pointer lock on desktop and play on touch, and every opener was trusted to drop it.
   Two did not: a chest opened from the world on touch (no lock to lose, so the world ran on behind its scrim and a mob
   could kill the player inside the menu, AUDIT:input:touch-panel-world-runs) and VICTORY, a store write under a held lock
   (AUDIT:input:victory-under-pointer-lock). `isInputLive(state, active)` is the gate open, the player alive and no surface
   up: `coveringSurfaceUp` (`src/ui/panelState.js`: every PANEL_FLAG, VICTORY, the lost-context panel) or the death screen.
   The world clock's pause, performVerb, the primary press, F and T (inside the express router), Shift's dodge, the spell
   keys, G, the wheel, the panel keys' gate, the touch router and the Player loop's walk and Aspect machines read it.
   - **Departure from the brief.** The audit's formula includes `gameStarted`; the verb half leaves it out. In play `active`
     rises only with a granted lock or the touch entry, both of which start the game, and the e2e suite's `forcePlay`
     raises it without starting one (`tests/e2e/_boot.js`), so the term adds nothing in play and would stop every e2e
     that drives a verb. The pause keeps it: the world behind the title runs.
   - The Talents and Feats flags (`showSpellUpgrades`, `showAchievements`) move from useInputManager's React state into
     the store, so one read of the store answers for the clock and the verb gate; useInputManager returns them as before.
172. **A covering surface takes the pointer back itself, and VICTORY is exempt from pause-on-unlock.** InputManager releases
   the lock (L1's `releasePointerLock`) when any covering surface goes up. It is the one release for every opener: the
   panel keys, G and Terrain's chest open no longer release on their own, so item 160's list of release sites loses
   Terrain's chest open. The release opens no pause panel (`shouldOpenPauseOnUnlock`) and no resume overlay
   (`shouldShowResumeOverlay`, fed through App's slice, `store/hudState.js`, which now carries `victoryPending` and
   `isWebGLContextLost`) over the surface; Keep exploring asks for the lock again. Before, Esc was the only way out
   of VICTORY and left Settings open under it. On touch play is never dropped: the predicate holds the world and the
   verbs, and Respawn, Keep exploring and the context-loss panel own their touches by kind (item 164).
173. **The pointer is taken again only when no surface remains, and every close sweep is PANEL_FLAGS.**
   `requestGameLock` refuses while any surface is up, so every caller hands it the store read after its own writes
   (MenuSystem's close controls passed the render's gameState, which still shows the panel closing). `CLOSED_ON_SWITCH`
   is PANEL_FLAGS, so a panel key or a tab closes every other panel, the trade panel, a chest, World Manager and Credits
   included, and Esc closes all thirteen (`closeAllPanels`); a closed villager panel or chest lets go of its villager or
   chest. A panel key pressed twice over the trade panel or a chest used to relock with that panel drawn, its clicks
   editing the world (AUDIT:input:panel-stack-relock-still-live).
174. **Keys respect focus.** InputManager leaves a key whose target takes text to the field (Esc still closes the panel it
   is on), a key mid-composition (`isComposing`, or keyCode 229) to the IME, and Tab in a dialog other than Character to
   that dialog's focus trap; a toggle key's auto-repeat does nothing (AUDIT:softlocks:world-manager-keys-stolen, the July
   review's repeat strobe). B, J and H still switch panels from any dialog; Tab opens and closes Character, whose key it
   is, and no longer switches to it from Settings or the Journal.
   - **Departure from the brief.** The audit asked for the guard in both keydown handlers. Components' own (movement,
     jump, dodge, the Aspect verbs, F and T) has none: a text field is only ever on a panel, and every verb and the walk
     read item 171's predicate, which is false under any panel, so a key typed into a field acts on nothing there. A
     guard there could not be gated in jsdom (the Player is R3F) and would only restate the predicate.
175. **The wheel steps per gesture: 4 px for the first slot, 100 px for each further one, a gesture ending at an 80 ms gap
   or a reversal, one slot per event at most** (`src/input/wheelStep.js`, AUDIT:input:wheel-hotbar-per-event). What a
   notch reports differs by browser: Chrome on Windows 100 px and on Linux 120 px; Firefox 3 lines (40 px each here) on
   Windows, 108 to 138 px where it reports pixels, and 16 px on macOS; Chrome and Safari on macOS 4 px for a slow notch
   and up to 400 px fast; a trackpad starts near 1 px (published measurements, collected by the builder: MDN's mousewheel
   notes, the goxjs/glfw and dvui issue threads, dwv's scrollWheel source). The verifier's sketch, 100 px a slot, would
   make a macOS mouse turn 25 notches a slot. A mostly sideways event is no scroll, and a tile off the bar comes back to
   the first slot.
176. **A modal's backdrop closes only for a press that began on it, and a surface on its way out claims nothing.** The Modal
   primitive records where the pointer went down; the tray tap that opened a panel (its row unmounts on the lift) and a
   drag out of the card no longer close it (the Modal half of AUDIT:input:ipad-tray-ghost-click; its WebKit half stays
   with lane L10). While a panel fades out under AnimatePresence it keeps no `aria-modal` and takes no pointer
   (`useSurfaceProps`, on framer-motion's `useIsPresent`), so L1's ownership by kind no longer gives the first touch after
   a close to the fading panel; the chest and talents panels, which draw their own dialog, use the same props.
177. **Touch keeps one contextual Cast button; no touch force-cast is built.** AUDIT:input:touch-lacks-express-verbs: on
   touch, Cast is the router's right button, so with ground within 8 m nearer than any mob in the narrow aim cone it
   places a block (or says "No Dirt left") where desktop's F would cast. Cast is also touch's only way to place a block, so
   making it always cast would take building away from touch, and a second control is a look change, judged on lookbook
   frames and on Kevin's device, that this lane cannot make. Cast stays the right button. What would change this: a
   touch layout pass that adds a place or force-cast control and is judged on the device; the finding closes as decided.

**Gates**, each red first on 1a3910e7's code (a scratch copy with the gate dropped in; for key-focus, also World Manager's
two new test ids) and mutation-proven with `scripts/dev/mutate.sh` (the numbers are in each commit's `Mutation-Proof:`
trailer):
- `tests/gates/input-live-gates.test.jsx`: exhaustive over device x surface x opener, 49 cases (every surface by a bare
  store write that drops no gate, on desktop and on touch, plus the panel keys, G to a smith and a merchant, the touch tray
  rows and a locked Aspect sector): no wheel step, spell key or F verb, the world held (death excepted), the lock released
  and no pause owed on desktop, the touch router yielding; a panel key twice over trade or a chest never locks with a
  panel drawn; requestGameLock asks for nothing under any of 16 surfaces; Esc closes all 13 PANEL_FLAGS. All 4 red (110
  violations across the 49 cases); 16 real mutants red, the identity green. A fifth case, added when CI's victory e2e
  failed on the fix: the resume overlay, fed by App's real slice, stands aside for VICTORY and the lost-context panel
  (red on the fix's first form, the slice without the two flags).
- `tests/gates/key-focus-gates.test.jsx`: 38 keys into World Manager's name field, none taken, and Esc from it closes
  World Manager; both composition signals open nothing; Tab in Settings wraps inside it, and still closes Character; B,
  H, J and Tab toggle once across one and three auto-repeats. All 4 red; 9 real mutants red, the identity green.
- `tests/gates/wheel-hotbar-gates.test.jsx`: notched mice in three browsers' units, slow and fast; the verifier's
  30-event trackpad stream moves one or two slots; a nudge and sideways swipes move none; coal comes back to slot 0. 3 of
  4 red (the notched case passes on main, the control); 8 real mutants red, the identity green.
- `tests/gates/modal-surface-gates.test.jsx`: after each tray row that opens a Modal, the tap's own click and a drag out
  of the card leave it open and a press on the backdrop closes it; three surfaces taken away inside AnimatePresence claim
  nothing while they leave; on touch the fading trade panel gives the touch to the world. The 3 tests of the time all
  red; 7 real mutants red, the identity green.
- `src/ui/panelState.test.js`: the way-back invariant enumerates VICTORY and the lost-context panel and measures that each
  renders its way back; the resume overlay is suppressed by both.
- `tests/e2e/input-live.spec.js` (CI): VICTORY under a stand-in lock, then an aimed click on the scrim (presence: the
  same click mines first), then Keep exploring; and a touch chest holding the world clock and the walk. The victory case
  was red on main's game code in CI runs 41131019672 and 41133453153, all three attempts each, at the release
  (`exits 0`). On the fix (run 41137409781) it went red again at Keep exploring: PAUSED was drawn over it, because the
  slice App hands MenuSystem (`store/hudState.js`) did not carry `victoryPending`, so the resume overlay could not see the
  surface; the slice carries both covering flags now, and `input-live-gates` holds it through the real slice. The touch
  case is not red-first evidence: its first two forms entered play by `forcePlay`, which does not start the game, and the
  world behind the title runs by design, so its clock ran on main's code and on the fix alike. It now starts the game and
  walks back over the ground its presence walk crossed (the first form's walk read 0 m on main after a 40-frame walk that
  probably ended against something). The jsdom gate is the red-first for the touch chest (REVIEW:l5:touch-chest-e2e-not-red-first).

**Not covered:** a real iPad or iPhone (a hardware keyboard typing into World Manager, a world chest holding the world, a
tray tap not closing its panel in WebKit), which is REVIEW:l5:device-run, Kevin's; a click in a browser on the context-loss
panel under a held lock (jsdom only); Components' keydown for keys typed into a field (item 174).

---

## 2026-10-30 (chaos play, round 3) — [LOOP] a placement moves the collider with the body, so the next frame sweeps from where the player stands

**Decided by the chaos-play lane's round-3 fixer** (the round-2 dynamic review said FIX on one defect; the static review's
finding 1 is the same mechanism and its finding 2 a missing test). Items 168-170.

168. **The load's release and the origin spawn move the collider with the body** (round-2 dynamic blocker; static finding
   1). Rapier moves a body's colliders only at a world step (rapier3d-compat 0.19.2,
   `World.propagateModifiedBodyPositionsToColliders`; @react-three/rapier 2.2.0 never calls it), and at 120 Hz every
   other frame takes no step. Components.jsx's resume branch put the fitted spot with a bare `setTranslation`, so on a
   frame with no step `moveKinematic` swept from the collider still at the held spot, in the wall and the ceiling, and
   wrote that movement onto the fitted spot: a save from the old Save button at the tunnel's mouth, (-4, 32, -8), was
   fitted to (-4.45, 31.05, -8) and went back to y 31.92, 0.4 m into the ceiling cell with the eye in it and no way out.
   The origin spawn had the same shape: after a fall through the world at terminal speed (50 m/s) the frame after the
   spawn swept 0.42 m down from the sky the void guard had held the body in, and stood the capsule 0.117 m into the
   origin's ground for good. `game/kinematicMove.js placeBody` (moved there from `formFit.js`, whose form swaps already
   used it) sets the translation and propagates; the resume branch and the spawn placement call it, in Components.jsx and
   in the chaos harness's copy. Red first on `54e5bd51`: `chaos-play-loads.test.jsx` gains the tunnel case against its
   east wall (x -4.45; red at 120 Hz lag 4 and lag 0, I1 and I2 39 frames each), the tunnel's mouth on both frame phases
   (red at both 120 Hz runs, depth 0.4) and a respawn after a fall at terminal speed on both phases (red at 120 Hz, depth
   0.117); the new `tests/gates/player-placement-gates.test.jsx` mounts the real Player against real Rapier and the
   harness's world and reads the same two cases off Components.jsx's own frame (red: depth 0.4 with the eye in solid;
   depth 0.117). Each 120 Hz case asserts that one of its two phases placed the body on a frame followed by one with no
   world step, so a change of phase cannot pass it over nothing. Every 60 Hz row was green before the fix: at 60 Hz every
   frame steps. Commit `03f54364`.
169. **Every other teleport of the player body was checked against that sweep, and none reaches it.** The respawn effect
   (`isAlive` false to true), the void guard (`teleportPlayer`), the sky freeze before the world is built (`isWorldBuilt`
   is only ever set true, App.jsx), the load's hold, the spawn probe's retry and `loadWorldData`'s teleport each leave the
   next frame in the spawn branch, which returns before the sweep and ends in one of item 168's two placements. The form
   swaps (`enterFormFitted`, `restoreBaseFitted`) already propagated. The DEV and test tools that move the body
   (`devtest/devBridge.js`, `render/lookbookSeam.js` stand, the debug overlay's teleport to (0, 80, 0)) are outside the
   Player loop; the debug teleport lands in open sky.
170. **The hold's corner probe has a test that fails when it is reverted** (static finding 2: the harness asks
   `resumeColumnProbe` itself, so reverting Components.jsx's call left every test green). The cheapest place that runs
   Components.jsx's own branch is the jsdom mount of item 168: a save 0.05 m from a chunk border, with the chunk across it
   not back, is held 20 frames and let go once it is, onto the column's top. Reverted to `store.getMobGroundLevel(r.x,
   r.z)` it lets go on the first frame. No e2e was needed. Commit `03f54364`.

The gate on seeds 1 to 8 after the fix (at `7065b64a`, local, the three session files): 56 sessions a seed, none red,
the deepest into solid 0.000 m on every seed; walk-held readings 33, 21, 25, 28, 21, 33, 27 and 30, every one an own
shell, none held. Seed 2 misses the same SETUP floor as in item 165 (field-origin swapsRefused 1, floor 2). The loads
file, the instruments and the new gate: 70 of 70. The walk-held counts differ from item 165's: the harness's placements
now move the collider at once, so the frames after each load and respawn in a session, and the session from there on,
are not the ones round 2 played.

Mutation proofs (`scripts/dev/mutate.sh` in a throwaway copy; an identity mutant first and last, both survived): on the
gate, the resume branch's bare `setTranslation`, the spawn's bare `setTranslation`, the corner probe reverted, `placeBody`
without its propagate and `placeBody` propagating before the move each RED; on the loads file, `placeBody` without its
propagate, the harness's release and the harness's spawn each RED.

---

## 2026-10-30 (chaos play, round 2) — [LOOP] every save loads clear, the gate cannot pass by accident, and the loop's wiring is driven

**Decided by the chaos-play lane's round-2 fixer** (Workflow wf_66ad2ad9-e69; the static and dynamic reviews of round 1
both said FIX). Round 1's gate (items 150-154) only ever loaded saves it had just written, at a seabed of 22 or higher, in
the base shape, on one seed, and the harness models the Player loop rather than importing it. Items 155-159 and 165-167
(160-164 are lane L1's).

155. **A load stands the base capsule where it fits nearest the saved spot** (static F1, a blocker). Item 154 placed the
   body exactly at the saved position, and saves on disk hold positions no capsule fits at: the old Save button's camera
   rounded to whole metres (0.5 m into a wall, the head up to 1.17 m into a ceiling), the pre-cut fixture's (3, 21, 6) in
   the ground. `game/formFit.js fitLoadedSpot`: the saved centre where the capsule is clear and its centre's cell is not
   solid ground, else the nearest such spot within 0.6 m sideways, 1.2 m down, 0.6 m up, else on the highest column the
   capsule stands across. A trimesh is hollow, so solid ground is read by parity (`cellSolid`: a ray up the cell's column
   crosses each chunk's closed mesh an odd number of times from inside). The gate: a third of the driver's saves are
   old-button saves, I1 and I2 do not read the hold's frames, and I5 bounds them (released within 2 x lag + 12 frames,
   never to the origin); `chaos-play-loads.test.jsx` pins the pre-cut fixture and three old-button saves.
   `quest-text.spec.js`'s fixture position is restored (the load now stands that player on the column's top). Commit
   `4a76f1bb`. **Item 154's hold stands; its placement is superseded by this item.**
   - The fit's corners (found by item 165's seed run): the hold now waits until the four corner columns of the square the
     fit reads answer the probe (`game/spawnPlacement.js resumeColumnProbe`), not only the saved column; a fit run while
     the chunk across a border had not streamed back stood the capsule 0.4 m into it. Commit `f693ab63`.
156. **A save made over the deep ocean resumes there** (static F2, a blocker). The hold took a probe answer as proof the
   column was in only above 15, and the full-ocean seabed lies at 6 to 10: held 600 frames, then reset to the origin. Any
   finite answer is now proof (the height is never used). The harness has a deep-ocean place (seabed 10). Commit
   `5f840cd0`.
157. **A save in a form writes the base capsule's centre over the form's feet** (dynamic finding A, a blocker; the comet's
   centre stood the base capsule 0.13 m into the floor). Each session's save is tried in a form rotated over its place's
   eight sessions; the loads file pins every form, pressed into the cliff and on open ground. Commit `6faa9522`.
158. **The placement guard reads the body, not its collider, after a teleport.** Found by the deep place: a click on the
   frame of a respawn read the capsule where its collider had been before the teleport and put a block 0.4 m into the
   player. Commit `8f2d227c`.
159. **I3: a way out by mining only the player's own blocks, with no click limit; a wedge reads held** (static F3, dynamic
   B). Supersedes item 150's "after at most three left clicks along one heading". A state only mining generated ground
   would leave is a defect; each walk-held reading is printed with its class. The instruments pin I1's tolerance (0.1 m
   into a wall), I3's record and both of I5's readings (round-1 survivors: TOL widened to 0.3, I3 never recorded). Commits
   `cba50fc7`, `f9d7280a`.
165. **The gate on seeds 1 to 8, run locally after the fixes** (CI plays seed 1; `CHAOS_SEED=<n>` plays another):

   | Seed | Sessions (56) red | Walk-held readings | Of them held | Deepest in solid | Denominator floors |
   |---|---|---|---|---|---|
   | 1 | 0 | 31 | 0 | 0.000 m | all met |
   | 2 | 0 | 24 | 0 | 0.000 m | field-origin swapsRefused 1, floor 2 (SETUP) |
   | 3 | 0 | 24 | 0 | 0.000 m | all met |
   | 4 | 0 | 30 | 0 | 0.000 m | all met |
   | 5 | 0 | 21 | 0 | 0.000 m | all met |
   | 6 | 0 | 33 | 0 | 0.000 m | all met |
   | 7 | 0 | 27 | 0 | 0.000 m | all met |
   | 8 | 0 | 30 | 0 | 0.000 m | all met |

   The first run, before item 155's corners, had seed 5 red (origin, 120 Hz, lag 0: 0.4 m into the chunk across a
   border, fixed by `f693ab63`) and seed 2's same floor miss. Seed 2's miss is the driver reaching one refused swap where
   seed 1 reaches three, not a game defect; the floors stay set from seed 1, the seed CI plays.
166. **The Player loop's load and form wiring is driven in the game** (dynamic finding C: reverting it left every unit
   test green). `tests/e2e/load-hold.spec.js`: a load holds the body at the saved height every drawn frame until it lets
   go there; a save 1.5 m in the ground stands the player on the column's top; the golem under a two-high ceiling is
   refused and said, and swaps in on open ground. Proven on dispatched branches carrying this spec's final text, the e2e
   job narrowed to it (the branches stop at `c80c6ae5`, before `f693ab63`; the PR's own CI runs the spec on the lane's
   head): control `mut/chaos-wiring-ctl` run 41128290264, 3 passed on first attempts; the hold condition reverted to
   `!spawnPosSet.current` (`mut/chaos-wiring-hold`, run 41128295530) red on both load cases, 3 of 3 attempts each ("the
   body dropped under the saved height while the world re-streamed", "the load never let the player go"); the load fit's
   line bypassed (`mut/chaos-wiring-fit`, run 41128301592) red on the buried save, 3 of 3 ("the player was left in the
   ground under the column's top"); the frame swap falling back to the unfitted swap (`mut/chaos-wiring-form`, run
   41128307279) red on the golem, 3 of 3 ("the golem was swapped in under the ceiling"). Each branch's unit job failed only
   on `ci-required-check.test.js`, which the narrowed matrix breaks; the other 603 unit files passed. The branches stay on
   origin for the command session to delete. Closes REVIEW:chaos-play:load-hold-e2e.
167. **Small fixes.** F4: a form refused on the frame after the roar gives the roar's price back and cuts the reveal
   (`game/formRefusal.js`, `c80c6ae5`; red first was the absent module, the paid-path wiring is unit-tested only). F5:
   block debris is not an obstacle to the form fit (`89c2aa8f`). F7: item 150 and the instruments' header said all four
   invariants read the voxel grid; I3 reads a sandbox of the landed meshes and live stand-ins, I4 the world's colliders
   (corrected in `cba50fc7` and in item 150 here). F8: five comments cited a test file that never existed (`38892f07`).

**Also found, not fixed here (registry rows, owner the command session):** the deep seabed (6 to 10) lies under the
void line (a body centre under 10), so a player who sinks to it in the deep ocean is reset to the origin
(REVIEW:chaos-play:deep-seabed-under-void-line); a form entered from the store rather than the roar is ended by the
transform timer on the next frame (REVIEW:chaos-play:store-form-ends-next-frame).

---

## 2026-10-30 (chaos play) — [LOOP] a standing gate that plays the game adversarially: the player can always leave

**Decided by the chaos-play lane** (branch `feat/chaos-play-gate`, registry REVIEW:chaos-play:player-can-leave). Kevin
found the invisible box in five minutes of chaotic clicking near the ocean, after a week of reviews that never caught it:
every review and gate was scoped to a diff, nothing played the game adversarially, and the trap shows in no frame and no
console line, only in "can the player still move" (AB episode 1230). Items 150-154.

150. **The chaos-play gate.** `tests/integration/chaos-play-{shore-cliff,cave-overhang,field-origin}.test.jsx` play 48
   seeded sessions (six places: the shore, a cliff face, a two-high tunnel, an overhang, open field, the origin column;
   60 and 120 Hz; trimesh 0, 2, 4 or 8 frames late) against the real Rapier build, the real mesher and the real verb
   executors in the game's frame order, and read four invariants after every frame (I1 and I2 from the voxel grid, I3
   from a sandbox of the landed meshes and live stand-ins, I4 from the world's colliders; corrected by item 167): the
   capsule in no solid cell deeper than 5 mm (a tenth of the controller's 0.05 m offset), the eye in no solid cell, a way out every
   90 frames and at the end (a metre's move within a second walking or jump-walking, or after at most three left clicks
   along one heading: a shell the player built is not a trap), and no stand-in outliving its mesh by a step.
   `chaos-play-instruments.test.jsx` shows each instrument seeing its positive case first. Each file asserts floors on
   the risky events it reached (clicks aimed into the body, wall contacts, two clicks between one pair of frames, swaps
   under a ceiling and against a wall, refused swaps, loads and the frames a load held the body, respawns, respawns
   after an origin-column dig and build) and prints them, so a seed set that stops reaching the dangerous geometry
   fails as SETUP. About 25 s on four workers locally. **Controls:** with e177b5b8's placeAtHit.js (the guard, no
   stand-ins) 41 of 48 sessions go red on I1 (12 also on I2, 1 on I3); with 4a01607b's (no guard) all 48 on I1 and I2,
   5 on I3. I3 reads most of e177b5b8's late-trimesh traps as free because item 131's left click takes a placed block
   around the eye.
   - **The harness keeps a collider far below the world.** Without it, one history made rapier3d-compat 0.19.2 panic
     ("unreachable") in `world.step` at the first collider created after a load's wipe had left only the player's
     capsule in the broad phase. Replaying the recorded world ops on a fresh world did not panic, and the game's own load
     e2e passes on CI; it is a lead, not a finding (registry REVIEW:chaos-play:rapier-panic-after-wipe).
   - **What it does not check:** React's effect order and Terrain.jsx's own wiring (the harness models the wipe, the
     resume branch and the form effect from the code; the e2e suite drives the real ones), mobs, dodge, the accel ramp,
     the camera's bob, chunk streaming by distance, anything rendered.

151. **A form swap places the new capsule where it fits; a form with no room is refused.** Supersedes S2-B1-M1's
   grow-depenetration (the body lifted by the half-height's growth, unswept). The gate found the bull 0.12-0.21 m into
   the ground on open land, the golem 0.25 m into a tunnel's ceiling and held, and ending the comet form left the base
   capsule in the floor or a wall (the restore was called "always a shrink"; the comet and the hawk are narrower than
   the base). `game/formFit.js` keeps the lower end, then takes the nearest spot on a 0.05 m grid (0.35 m sideways,
   0.4 m down, 0.15 m up) clear of every collider, the unindexed ones included; the roar's commit refuses a form with no
   room before the bar is spent ("No room to change shape here"), and the base shape comes back regardless. Rapier
   0.19.2's capsule query missed a capsule half a radius into a roof when the core segment's end lay just short of the
   face, so a passing spot is confirmed by balls along the axis. A refusal costs about 4 ms in node. Commit `d6579509`.

152. **The respawn stands the player on the highest of the four columns its corner stands across.** The spawn is at
   x 0 z 0, where four columns meet; the Player loop read the store's worldBlocks at column 0_y_0 by has() (a mined
   cell counted as ground, and a cell's index taken for its top face) and otherwise probed one column. 6 of 8 origin
   sessions ended held with the capsule 0.4 m into a neighbouring column. `game/spawnPlacement.js spawnCornerGround`
   probes all four and takes the highest; the worldBlocks read is gone from the loop. Commit `3fd4b468`.

153. **A save stands a loaded player at the body's centre.** The World Manager's Save wrote the camera's position
   rounded to whole metres, loaded as the body's centre: up to half a metre into a wall, or the head in a two-high
   ceiling (14 of 48 sessions red on I1 after such a load). `game/saveSchema.js savePosition` is the one reader for the
   Save button, the autosave and the context-loss save. Old saves keep their rounded position (registry
   REVIEW:chaos-play:old-manual-saves-rounded). Commit `bfb61857`.

154. **A load holds the player at the saved position until the new world's column is in.** Between Terrain.jsx's wipe of
   the old chunks and the new chunk's arrival there was no ground: the player fell, and the new trimesh landed around a
   capsule sunk 0.04 m (4 frames) to 0.27 m (8 frames) into the ground, which the controller then read as grounded. The
   store's loadWorldData sets resumeSpawn and worldReloading; the Player's resume hold, until now only for the
   context-loss resume, also runs in play, and does not ask the ground probe until Terrain.jsx has committed the wipe. Commit
   `a3f4a351`; the gate itself is `b25feb0c`.

**Also found, not fixed here (registry rows, owner the command session):** holding jump into any sheer face climbs it,
not only in a one-block shaft: the controller reads ground against the wall on some frames and each re-arms the jump
(a six-high cliff climbed at 60 and 120 Hz; REVIEW:fix-invisible-box:shaft-wall-climb, widened); a capsule sunk into the
rim of a hole it dug under a two-high ceiling neither walks nor jumps out, and three left clicks free it
(REVIEW:chaos-play:rim-wedge); `moveKinematic`'s unswept lift is no longer used by the game
(REVIEW:chaos-play:movekinematic-lift-unused); the load hold's real wiring is not driven by any e2e that asserts the
player was held (REVIEW:chaos-play:load-hold-e2e).

---

## 2026-10-30 — [LOOP] L1: a death on iOS shows YOU DIED, the lock goes on the canvas only, Show Stats and the juice dial, and every button over the game answers a finger

**Decided by the L1 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L1 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4). PR #62. Each stands while it earns its place.

160. **One way to the Pointer Lock API: `src/input/pointerLock.js`.** iOS and iPadOS WebKit define none of it (MDN
   browser-compat-data: `Document.exitPointerLock`, `Document.pointerLockElement` and `Element.requestPointerLock` are
   `safari_ios` `version_added: false`; `chrome_android` from 144). InputManager's death effect called
   `document.exitPointerLock()` bare, and React sent the TypeError from that passive effect to the root error boundary: on
   every iOS browser every death showed the crash page instead of YOU DIED, and the autosave pending then never fired
   (AUDIT:input:ios-death-crash). `releasePointerLock()` calls the API only where the browser has it; `requestGameLock()`
   asks GameScene's requester, which locks the canvas, and locks nothing when there is none. Every call site goes through
   them (InputManager, MenuSystem, App's world-ready lock, HUD's Respawn, the DEV start hook, Terrain's chest open); the
   five `document.body` fallbacks are gone, and with them a `.catch` on a value older engines return as undefined, which
   threw before the touch bridge (AUDIT:ultra:ultra-state-saves-input-10). `contextRecovery.js` keeps its own check,
   which was already guarded.
   - **Departure from the brief.** The audit asked for a release "only when locked and the API exists". The release does
     not ask whether the pointer is locked: `pointerLockElement` is null while a lock request is still pending (MDN), so
     that check skips the release in exactly the window a request is in flight, and on every engine with the API the
     call stays the one it was. The mutant that adds the check survives the gates (they hold no pending request); that
     is the gates' stated limit, not a claim.
   - **The static half.** ESLint (`src`, not tests) errors on any `document.exitPointerLock` member and on
     `document.body.requestPointerLock`: 17 matches in 10 call sites at b48ec9f1, none now. A source rule is not a gate on its own
     (gate-shape); it stops a new bare call before the behavioural gates below would have to.
161. **Owed, and Kevin's: the lived proof on an iPhone and an iPad.** In Safari on each: die once (a mob, or a fall),
   see YOU DIED and not "Something went wrong", tap Respawn and play on; then tap the HUD Settings gear and see Settings
   open. CI shows what Chromium can: `tests/e2e/death-pointer-lock.spec.js` deletes the three API members before the app
   loads and dies on an emulated iPad (red on b48ec9f1's game code, c132513b in run 41117858710, all three attempts:
   `TypeError: document.exitPointerLock is not a function` at InputManager.jsx:138), and its desktop case dies holding a
   stand-in lock and must release it once. Chromium is not WebKit, and the touch emulation is not a finger.
162. **Show Stats is not a panel on touch either.** App passed `otherPanelOpen={showAchievements || showStats}` to
   TouchControls, which refuses action and roar presses while a panel is open, so on touch Show Stats silently disabled
   attack, mining, the heavy and the roar until it was toggled off (AUDIT:softlocks:touch-show-stats-kills-action). It
   passes `showAchievements` only, as `ui/panelState.js` already says of Show Stats.
163. **The hydrate restores the juice choice.** `settingsPersist.js` persists `juiceIntensityChoice` but hydrated only
   `juiceIntensity`, so the first save of any other dial in a later session wrote the default 1 over a saved 40% or over
   the in-game Reduced Motion's 0 (AUDIT:ultra:ultra-game-logic-1, since c832ca56). It restores both.
164. **Every button and modal surface over the live game owns its touch.** Lead AUDIT:input:touch-settings-gear-unreachable
   was decided on CI before any fix: run 41117858710 tapped the HUD Settings gear on an emulated phone (Playwright's
   touchscreen tap after its hit-target check, input live) and Settings never opened, on all three attempts. TouchControls
   cancels the touchstart and touchend of any touch that does not land on a surface it counts as a control, and in
   Chromium a cancelled touch fires no click (this run, and touch-probe's X3 hotbar record, also Chromium). WebKit is
   untested here and is part of item 161; commit 9b89e569's message says the X3 record was Safari on an iPad, which is
   wrong. The same cancel held for every plain button over the live game (read in jsdom; the browser half is the gear's):
   the gear (touch's only way to Settings, How to Play, Manage Worlds and Load), Respawn (play stays live on touch at a
   death, so a touch player was held on the death screen, which no iOS player reached before item 160), Keep exploring
   at the first dragon kill, and the context-loss panel, the way back when iOS drops the WebGL context. The brief proposed marking the gear `data-hud-interactive`; marking surfaces one by one is the hand-kept list
   that missed the other three, so `input/touchOwnership.js` now names ownership by kind: `button, [role="button"],
   [aria-modal="true"], [data-hud-interactive]`. A touch on the world (the canvas, a scrim) is still the router's.
   Registry: REVIEW:l1:touch-overlay-buttons-cancelled records the three beyond the lead, closed.

**Gates**, each red first on b48ec9f1's code (a scratch copy with the gate dropped in) and mutation-proven with
`scripts/dev/mutate.sh` (the numbers are in each commit's `Mutation-Proof:` trailer):
- `tests/gates/pointer-lock-guard-gates.test.jsx`: a death with no Pointer Lock API keeps the game and fires the
  autosave; a death holding a lock releases it once; Tab, J, H and B open their panels and throw nothing with no API and
  release a held lock with one; the real App on touch shows the death screen at a death. 3 of 5 red at b48ec9f1 (the two
  held-lock cases are the controls); 7 real mutants red, 2 identities green, the locked-check mutant surviving (item 160).
- `tests/gates/touch-entry-gate.test.js`: the two cases that pinned the body fallback now assert that Start with no lock
  method locks nothing, and on touch still fires the touch bridge and starts the run when the engine's lock returns
  undefined. Both red at b48ec9f1.
- `tests/gates/touch-show-stats-gates.test.jsx`: the audit verifier's full-App probe: with the readout on, three presses
  and a roar reach the game. Red at b48ec9f1 ([0, 0, 0]).
- `tests/gates/settings-juice-persist-gates.test.js`: three sessions through the real store. 4 of 5 red at b48ec9f1.
- `tests/gates/touch-owned-controls-gates.test.jsx`: the real App on touch; the gear, Keep exploring, the context-loss
  panel and Respawn (after a real death, play still live) keep their touches, while a touch on a canvas is cancelled before
  and after. All four cancelled on the lane's tree before item 164; 4 real mutants red, the identity green. jsdom
  synthesizes no click; the e2e taps (the gear in `touch-controls.spec.js`, Respawn in `death-pointer-lock.spec.js`) are the
  click on CI.

**Not covered:** a real iPhone or iPad (item 161); a tap on Keep exploring or the context-loss panel in a browser (jsdom
only); the release while a lock request is pending (item 160).

---

## 2026-10-30 — [LOOP] W2-L: every animated element renders `m`, under one strict LazyMotion provider

**Decided by the W2-L builder under the standing grant** (DECISIONS 2026-10-28 item 14), as the rest of reset item 14: the
index chunk stops carrying framer-motion features the game never uses. Each stands while it earns its place.

140. **`motion.X` is `m.X` in the 12 modules that animate; `src/ui/MotionProvider.jsx` is the one provider, App's outermost
   element, with `features={domAnimation}` and `strict`.** The inventory (33 elements, 13 `AnimatePresence` blocks) uses
   only `initial`, `animate`, `exit`, `transition`, `style`, `onClick` and `onAnimationComplete`: no `layout`, `layoutId`,
   `drag`, `Reorder`, hover/tap props or motion hooks anywhere, so `domMax` is not needed and `domAnimation` is all that
   is loaded. `src/index.jsx` has the only `createRoot`; the R3F canvases and drei's `<Html>` bubble render no `m`, so one
   provider covers it, and the lazy panel chunk renders inside the same root and context. The features are passed as a
   bundle, not a loader: a loader (`features={() => import(...)}`) was built and measured as an option and not shipped.
   **Measured on the same tree** (`npm run build`, minified bytes): index chunk **681,632 B to 634,075 B, -47,557 B
   (-7.0%)**; gzip 229,012 B to 215,162 B, -13,850 B. The loader variant reads index 597,267 B (-84,365 B, gzip 202,566 B)
   plus a 38,030 B features chunk. The plan's "about 124 KB" was a lens-reported figure for the whole framer-motion share.
   The round-1 dynamic review measured that share by splitting framer-motion into its own chunk (`manualChunks`) on both
   trees: **137,650 B at base and 90,050 B left at head**. What leaves with a synchronous `domAnimation` is drag, layout
   and projection, which nothing here used: 47,557 B. Of the 90,050 B that stays, the loader variant defers about 37 KB
   (its features chunk is 38,030 B), and `domMin`, which drops the gesture features, would take 5,631 B. **Why not the loader's extra
   36.8 KB:** the title overlay is the first thing a player sees and fades in from
   `initial` (opacity 0), so a loader shows an empty title until a second request resolves, and a request that fails leaves
   every panel at opacity 0 for good with nothing thrown; `render/dragonLoader.js` needed a retry and a give-up path for
   exactly this. **Door:** swapping to the loader is one line in `MotionProvider.jsx` plus a `modulepreload` in
   `vite.config.js` (as `preloadGameIcons` does) and a retry, recorded as a new dated entry that names this one; nothing
   else in the 12 modules changes. It is an open registry row (`REVIEW:w2l:loader-door`), as is the smaller `domMin` door
   (`REVIEW:w2l:domin-door`, 5,631 B, which would turn a future gesture prop into a silent no-op).
141. **The index ceiling falls with the chunk: 700,000 B to 652,500 B** (`scripts/ci/bundle-budget.mjs`, `actualAtWrite`
   634,075 B). The headroom kept over the measured size is the 18,368 B the old ceiling left over the old measured size, so
   the lanes still in flight keep exactly the room they had and nothing else gets the 47,557 B freed. Mutants run through
   `npm run build` and the gate: the full `motion` component put back in an index-carried module (`ui/GameHud.jsx`) reads
   682,123 B, RED; `domMax` in the provider reads 682,104 B, RED; the identity edit (a comment) reads 634,075 B, green; the
   full `motion` in a module only the lazy panel chunk carries (`ui/panels/ForgePanel.jsx`) reads 636,434 B, GREEN, so the
   ceiling does not see that case; the strict unit gate does (item 142), and so do the full-motion markers (item 145),
   which read every chunk of the build and name `panelBundle`. The ceiling holds the modules the index chunk carries.
142. **Three gates and an e2e hold it.** `tests/gates/lazy-motion-strict-gates.test.jsx` mounts one real component from each
   of the 12 modules (18 components) under `MotionProvider` and nothing else: a `motion.*` left in any of them throws, and
   two controls show the instrument sees both ways (a `motion.div` under the provider throws; an `m.div` under it draws a
   value strictly between its start and end). `tests/gates/app-motion-provider-gates.test.jsx` renders the real App (the
   two 3D scenes stubbed) and watches the title overlay fade from opacity 0 to 1, which fails when App renders no
   provider; the strict gate cannot see that, because it imports the provider itself.
   `tests/e2e/lazy-motion.spec.js` opens the Talents page by Tab and a real click and samples the card's scale and y and
   the dialog's opacity on the frames the page draws (`tests/e2e/_motionSample.js`), with the page's clock (`performance.now`,
   which framer-motion's frame loop reads) slowed to a fiftieth from the panel's insertion until the sampler is done. Two CI
   runs, each at the spec's first attempt, are why. At normal pace the world drew a frame every 130 to 620 ms and a 350 ms
   spring fit between two of them (scale 0.9 at 921 ms, 1 at 1539 ms): the spring runs against the clock, and the clamp on the
   frame loop's step does not apply to an animation's own clock. Slowing the document timeline through CDP
   `Animation.setPlaybackRate` instead, to stretch the fade, left the fade at opacity 0.012 after 6765 frames. Slowing the
   clock stretches the springs' crossing of their ends to 6 s, ten frames at the slowest cadence seen. Each of the first two heads
   passed on its retry. The third passed at its FIRST attempt (CI run 41072281889, shard 5: 30 samples, strictly between
   the ends on scale 8, y 8, opacity 1): one run that did not flake, with the mechanism above as the reason it should not.
   No flake rate was measured, before or after.
   `tests/gates/motion-sample-gates.test.jsx` runs the sampler on the real panel in jsdom with the thread blocked so that
   frames land 600 ms apart (a jump at normal pace, the first CI failure reproduced; an animation at the slowed clock) and
   the verdict on series known by construction. Mutants, each RED on the test named and each run
   against a green baseline by `scripts/dev/mutate.sh`: `motion` back in each of the 12 modules (12 of 12), the provider
   without `strict`, the provider whose features never load (strict gate and App gate), App with a pass-through provider,
   and twenty-five verdict, sampler and clock mutants; the identity edits stayed green. The e2e itself was not run locally: CI is
   its arbiter, and its mutants are argued in the spec.
143. **What is not proven.** `strict` is dev and test only (framer-motion 12.43 skips the check in a production build), so
   the shipped artifact is held by the bundle budget: the index ceiling for modules the boot chunk carries, and the two
   full-motion markers (item 145) for every chunk. A second React root that
   renders `m` outside the provider would render it frozen and nothing would report it; today there is one `createRoot`.
   The component tests elsewhere (HUD, MenuSystem, QuestSystem and the rest) render `m` without a provider and so without
   animations: they pass, and they never exercised the animation. The Chromium e2e reads the transition at a fiftieth of its
   speed (the page's clock is slowed from the panel's insertion), so it says the transition is there and ends, not how fast it
   plays. No frame of it was looked at on a screen; the feel is Kevin's.
144. **The CI e2e's numeric sample stands in for the plan's "one clip".** The plan row for W2-L
   (`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, "Acceptance on the live game") asks for "Live: panel
   transitions still animate (one clip)". What exists is `tests/e2e/lazy-motion.spec.js`: the real Talents panel in
   Chromium, sampled on the frames the page draws (CI run 41072281889, shard 5, first attempt: **30 drawn-frame samples,
   values strictly between the ends on scale 8, y 8 and opacity 1, the end reached**). The reasons it stands in: the
   question the clip answers for this change is whether a transition still moves, or sits frozen at `initial`, and the
   sample reads exactly that, with a denominator and a verdict, where a clip is a person's look; a clip of the world at
   the normal clock on the CI runner (frames 130 to 620 ms apart) shows the 350 ms spring as a jump, the artifact that
   failed the first two heads; and the lane ran no local browser (`CLAUDE.md`, SSD-light lanes: no local e2e unless a look
   question needs a real GPU, and whether a transition exists is not one), so the CI run is the live game here. What a clip would add and the sample cannot is how the transition looks and how fast it
   plays, and that stays Kevin's (item 143). The plan's text is unchanged; registry row `ACTIVE_PLAN:T21` stays closed
   on this reading.
145. **Two more gates, and the two unit cases that read a tween run on a slowed clock** (round-1 reviews). (a)
   `scripts/ci/bundle-budget.mjs` reads every built chunk for `isProjectionDirty` and `dragElastic`, strings that occur
   only in motion-dom's projection node and framer-motion's drag in 12.43 and that no chunk of the lazy build carries; the
   full `motion` component put back in `ui/panels/ForgePanel.jsx` (index 636,434 B, under the ceiling) puts both in
   `panelBundle` and reds the gate, and in `ui/GameHud.jsx` puts both in the index chunk. Controls: `animationState` and
   `whileHover`, which `domAnimation`'s own code carries, must be found in some chunk, so a minifier change fails the
   gate instead of passing it. (b) `tests/gates/lazy-motion-exit-gates.test.jsx` closes the real Talents panel inside
   `AnimatePresence` under `MotionProvider`: the node must still be in the DOM on the first read, the dialog's opacity
   strictly between 1 and 0 on some read, and the node gone at the end; features without `exit`, without `animation`, or
   with the renderer alone each red it, and the same panel with no provider is the control. (c) The `m.div` control in the
   strict gate and the sampler case that finds the card and the dialog now run at a tenth of real time (`slowPageClock`,
   `clockFactor`), because framer-motion clamps only the frame loop's delta (motion-dom `batcher.mjs`, `maxElapsed` 40) and
   reads every animation's own elapsed time from `performance.now()`, so one stalled frame can step over a whole tween;
   the comment that said otherwise is corrected. (d) The strict gate's population case now says it counts its own table.
   Not done: an ESLint `no-restricted-imports` rule on `motion`, the static review's suggestion; the markers read the
   shipped artifact, which a lint rule does not. One dragon-fight e2e case failed its first attempt on all three CI runs of
   this branch since 30cde21c (41072281889, 41082219534, 41085691344), each time with `calls: []` on the zone or the
   burn, and passed on a retry (the lane touches no dragon, zone or damage code, and its base rate on main is unknown):
   registry row `REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`. A mob-floor SETUP failure on run
   41082219534's first attempt is `REVIEW:e2e-flakes:mob-floor-roof-no-heading`.

---

## 2026-10-30 (round 3) — [LOOP] fix/invisible-box round 3: a chunk's first trimesh is cut where its body is

**Decided by the command session** on round 2's reviews of PR #59. The dynamic review said land. The static review's
finding 1 was confirmed by the command session's run of its repro R1, so it blocks.

136. **A chunk's first trimesh is put where its body is before the cut reads it.**
   - **The defect.** @react-three/rapier 2.2 makes a chunk's body with no translation. The TrimeshCollider's effect
     makes the trimesh on it, and only then does the RigidBody's own effect move the body (`setTranslation(position,
     false)`). Rapier carries a body's move to its colliders at a step or a propagation. So until the next step, a
     first-mounted chunk's trimesh lay in chunk-local coordinates over chunk 0_0, where the player spawns, and item
     133's cut swept the player against it there. That happened on any frame that took no step while chunks streamed
     in.
   - **R1.** Before the step the trimesh sat at x 0 and the cast hit it (toi 0.29997). After the step it sat at x 48
     and the cast missed. With `world.propagateModifiedBodyPositionsToColliders()` before the cast, it sat at x 48 and
     the cast missed.
   - **Where.** `landed()` in `world/placedCellColliders.js` propagates when it lists a trimesh. ChunkMesh's effect runs
     after the RigidBody's, so the body has moved by then.
   - **What else it moves.** Measured in node against rapier3d-compat 0.19.2 with this tree's `moveKinematic`:
     - a pending kinematic move is left alone: the player's collider, `translation()` and `nextTranslation()` are
       unchanged, and the KCC returns the same movement;
     - after a teleport, the player's collider moves to `translation()`, where the next step would put it, so the guard
       and the KCC read the body where it is;
     - the broad phase still misses the trimesh until the step, so the cut stays.
   - **Why not in the cut.** There it would run on every no-step frame with an unindexed collider, in the Player loop.
   - **Cost.** One propagation per chunk landing, over the bodies moved since the last step.

Also in this round:
- **The placement numbering lives beside the worker.** `createEditSeq()` is made at module scope in `Terrain.jsx`, next
  to the worker, and handed to each registry. So a remounted world numbers past the worker's last seq, and an older
  mesh never retires a new cell's stand-in (round 2's static finding 3; the world mounts once in production).
- **Corrected above.** Items 132 to 134 say that a no-step frame happens at any rate, what the cut allocates, and that
  the pending move matters at 60 Hz.

**Gates.**
- **The node gate's harness** now mounts a chunk the first time as @react-three/rapier does, in React's effect order.
  The new case runs one scene three ways, holding W:
  - no chunk event (the control);
  - a far chunk's land laid over the origin, handed to the cut (it must cut the walk: the instrument sees a cut);
  - the far chunk's real first mount (it must walk what the control walks).
- **Red on `c7972f38`:** the trimesh was at x 0 when the sweep ran, and the walk was cut to 0.000 of 0.228 m.
- **Mutants** (`scripts/dev/mutate.sh`):
  - no propagation: RED;
  - propagation moved to after the step: RED;
  - each registry numbering from 1: RED;
  - the numbering copied, not shared: RED;
  - two identity mutants: GREEN.
- **The shore e2e** now asserts that each placing click held a stand-in at the click, and that the count was back to 0
  within the watch's 30 frames.
  - **Red on CI.** The branch `mut/invisible-box-echo-ec42c85e` is `ec42c85e` plus one change: the worker drops the
    click's seq, so every mesh echoes 0. Its dispatched run 41070477369 failed on that spec alone (shard 6: 1 failed,
    11 passed). The first attempt and both retries failed at the new assertion: "the stand-ins after the placing click
    at -100_30_-25 were not back to 0 within 30 drawn frames (held [1, ... 30 times]; ray solid at 1, mesh set at 1)".
    The unit, lint, knip and build job passed on the mutant, because no unit test can see the echo.
  - **Green on the head.** `ec42c85e`, run 41070432988, passed on its first attempt with no retries. Each of the three
    placing clicks held 1 stand-in at the click, and the counts after it read [0,0,0,0].
- **Not gated:**
  - that `Terrain.jsx` hands the module-scope numbering;
  - the Player loop's argument to `moveKinematic`, which carries the cut;
  - `castCollider`'s `stopAtPenetration` (a surviving mutant, registry
    `REVIEW:fix-invisible-box:cut-penetration-unpinned`).

## 2026-10-30 (later) — [LOOP] fix/invisible-box round 2: a placed cell is solid from the click

**Decided by the command session** on round 1's two reviews of PR #59. The dynamic review ran a seeded chaotic clicker
against real Rapier and the real mesher with the placed cell's trimesh landing late: 3 of 10 runs ended held at 2 frames
late, 7 of 10 at 4 (one with the eye inside the block, Kevin's invisible shape), 8 of 10 at 8. The live delay was
unmeasured and is longer on iPad-class devices. So the timing path is closed in code in this PR, not left as a MED row.
These items supersede item 131's "Left open" note.

132. **A placed cell is solid to the player from the click.** `world/placeAtHit.js` asks
   `world/placedCellColliders.js` for a fixed 1 m cuboid at each cell it places. The cuboid stays until the chunk's
   trimesh holding that edit is in Rapier's broad phase, retired by sequence:
   - `update_block` carries `seq`, and `terrain.worker.js` stamps every `chunk_mesh` with the last seq it has applied;
   - ChunkMesh's effect, which runs after its TrimeshCollider's own, marks its chunk's cuboids up to that seq;
   - they go after the next world step, so a mesh made for an earlier message still in flight never retires a later cell.
   They go after the step, not at once, because rapier3d-compat 0.19.2 adds a collider to the broad phase only on a
   step. Measured in node: a cuboid made between steps was missed by `computeColliderMovement` and `castRay` until the
   next step, and the API has no call that refreshes the broad phase. A cuboid also goes when its chunk unmounts and when
   a world load wipes the terrain. Cost: at most `MAX_CELLS` (64) cuboids a click, each alive from the click until one
   step past its chunk's re-mesh. The cut (item 133) allocates on a frame with unindexed colliders: each
   `castCollider` call makes two velocity vectors in Rapier's JS binding (freed in the call) and a hit object when it
   hits. A frame with none allocates nothing for this.
133. **The controller's sweep is cut at colliders made since the last step.** That covers a fresh cuboid and a chunk
   trimesh just mounted or rebuilt. `game/kinematicMove.js` casts the capsule against each one pairwise and stops the
   move the KCC's 0.05 m offset short. @react-three/rapier's stepper subscribes before the Player loop and steps first,
   so in the game only the sweep of a frame that takes no step runs blind. That is every other frame at 120 Hz, and at
   any rate a frame whose accumulator is still under 1/60 s, which frame jitter makes at 60 Hz too.
   - **Why the trimesh too.** Rapier gives a collider made between steps the slot, and the broad-phase leaf, of the
     collider freed last. A lone chunk rebuilt in place gets its own leaf back. Two chunks rebuilt in one React commit
     (every passive cleanup runs before any setup) swap leaves, and a sweep before the step finds neither. In the node
     gate, a player holding W against a two-high step walked through it (x 3.45 to 1.56 at 60 Hz, to -1.57 at 30 Hz).
   - **Cost and limit.** One pairwise cast per such collider, on a frame that has any; every chunk mount and rebuild
     makes one, not only a placement (the allocation is in item 132). The cut is a straight line, so on that frame an
     autostep onto that chunk can be cut short; the next frame climbs. Round 3 found it also swept a first-mounted
     chunk's trimesh over the world origin (item 136).
134. **The placement guard also tests where the body is going.** It tests the capsule at the collider's position and
   offset by `nextTranslation() - translation()`. The world steps before the Player loop moves the body, so between
   frames, where a click is handled, the frame's move is pending at any frame rate, not only above 60 Hz, and the next
   step puts the body there (`kinematicMove.js`). Round 2's dynamic review ran the clicker in the game's order (step,
   then move) with the trimesh at lag 0: on `e177b5b8`'s code, whose guard tested only the stepped position, 4 of 10
   runs ended held at 60 Hz; on round 2's, 0 of 10.
135. **The from-inside left click asks the body's eye, not the camera.** This supersedes item 131's "the camera's own
   cell". `mineTarget` now reads the body from the store and takes its steady eye (`combat/swingOrigin.js`). The camera
   carries the walk bob, the screen shake (2.43 m off the body in a dodge's first frame) and, for the 1.2 s roar, a pose
   4.5 m behind and 2.2 m above the body. Asked of the camera, a roar inside the player's own walls took the wall block
   the camera sat in. The node gate's roar case is red when `mineTarget` takes the ray's origin as the eye, which was `e177b5b8`'s semantics.

**Gates.** All are in `tests/integration/place-clear-of-player-rapier.test.jsx`:
- the static review's late wall at trimesh lags of 2, 4 and 8 frames, with frames of 1/60 and 1/30 s, each swept before
  its step (the worst order);
- an earlier mesh still in flight;
- a ray at the cell between the landing and the step;
- the stand-ins' lifetimes, and two chunks rebuilt in one commit;
- a seeded chaotic clicker at lags of 2, 4 and 8, which counts every frame the capsule reaches into any solid cell.

On `e177b5b8`'s `placeAtHit.js`, `kinematicMove.js` and `buildTarget.js`, all 16 new stand-in and cut cases are red: at 4 and
8 frames late the wall held the player with the eye inside the cell. Mutants (`scripts/dev/mutate.sh`):
- 22 of 22 real mutants red, across the guard, the stand-in module, the cut and `mineTarget`. The cut's offset and
  nearest-hit mutants each survived the first run and got a case.
- Five identity mutants stayed green.

The e2e logs, and does not assert, the live frames from a click to a solid cell, to the chunk's new mesh and to the
stand-in's retirement. The worker's seq echo and Terrain.jsx's wiring are proven by the build and that log, not by a
unit gate. Landed in `9353690a` (items 132-134), `112b8b3e` (item 135, and the gate's bull swapped as the game swaps
it) and `111ca09c` (the e2e log).

## 2026-10-30 — [LOOP] fix/invisible-box: a placement never fills the player's own body

**Decided by the fix lane under the standing grant** (DECISIONS 2026-10-28 item 14), from Kevin's live report of
2026-10-30 against `4a01607b`: "seems to get stuck in an invisible box when travelling near the oceans, or caused by
digging some blocks or something, i was left click / right clicking chaotically." Two independent diagnoses reproduced
the cause in node against real Rapier (one on Kevin's own column, -78, -4) and refuted the others: the collider is built
from the drawn arrays and rebuilt on every edit, so the two never disagree in geometry; a chunk seam cannot open a hole;
water has no faces and no collider, and the ocean was where he stood, not the mechanism.

130. **A right-click never fills a cell the player's body fills.** `world/placeAtHit.js` wrote whatever cell the build
   ray named. Pressed against a step, a level right-click at its face names the cell the camera is in; looking down, the
   feet's cell. The chunk's trimesh collider then held the capsule from inside (0 m walked and 0 m risen over 16 tries),
   and with the eye in the cell every face of the block points away from it, so the FrontSide material drew nothing.
   Now every footprint cell that overlaps a live collider of the player's body is dropped, the rest place and are paid
   for, and the player is told "No room: you're standing there". **The live collider**, so a beast form's wider capsule
   counts. **The capsule itself, not the KCC's 0.05 m offset around it:** a cell inside that band but clear of the
   capsule did not hold the player at gaps of 0 to 0.1 m, and refusing it would refuse a block laid against the
   player's side. Landed in `2fb8c72c`. Gate: `tests/integration/place-clear-of-player-rapier.test.jsx` (5 of 7 red on
   `4a01607b`'s placeAtHit; seven mutants red, an identity mutant green).
131. **From inside a placed block, a left click takes that block.** The build ray from inside meets the block's own
   inner face, so the step past the hit landed in the cell beyond, and the left click mined a neighbour while the box
   stayed: a save written before item 130 can still hold the player that way. `world/buildTarget.js` `mineTarget` now
   returns the camera's own cell when a placed block (`store.worldBlocks`) fills it; the click and the white outline
   share it, so the outline frames the cell the click takes. Generated terrain is the worker's and is not consulted.
   Landed in `c3af8e82`. Gate: the same file's old-save case (red on the extracted old targeting: the three clicks took
   3,31,8, 4,31,9 and 4,30,8 beside the box at 4,31,8; three mutants red, an identity green).

**Lived proof:** `tests/e2e/place-clear-of-player.spec.js`, on a beach column near Kevin's spot: nine real clicks aimed
on their own mousedowns (a pillar ahead, a level right-click at its face, one straight down, the pillar mined, a block
placed and mined behind), then real W, A, S and D; then a block written around the camera as a load writes one, a real
left click, and the walk out. Its red half is the CI run on `14058415` (the burst on the unfixed placement).
**Left open:** a block whose collider lands after a moving player has walked into its cell still holds them; a block
at the feet can be mined by looking down, one at the eye only by item 131
(registry `REVIEW:fix-invisible-box:collider-lands-late`).

## 2026-10-30 — [LOOP] W3-B PR B: every dragon attack has a tell, the skill answers reach it, and so do the Aspect kits

**Decided by the W3-B dragon lane under the standing grant** (DECISIONS 2026-10-28 item 14), building Units 2, 3 and 4 of
`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md` and reset-plan row 25 by the task script
`docs/superpowers/plans/2026-10-30-crafty-w3b-dragon.md`. Each stands while it earns its place.

123. **The dragon's rules are a pure move machine over one shared record.** `game/dragonMoves.js` (in the dragon's lazy
   chunk) mutates `game/bossCombat.js`'s record (in the boot chunk, so the dodge start, the cone, `damageBoss` and the
   systems that hit mobs read it before the dragon has loaded) and returns events `render/BossEntity.jsx` applies. One
   move at a time, each with a windup on the world clock: bite 520 ms and dive-bite 520 ms (parryable), fireball 600 ms,
   roar 900 ms with a 9 m radius and a falloff from 1 to 0.4 (its range defined only through `roarFalloff`), the lava
   placed when its move starts (its zone's 750 ms ring is the one warning), the summons 700 ms. Cooldowns are charged when
   a windup starts. A roll's i-frames make the roar a whiff, impulse included. Every tier carries `tricks` (fireball,
   lava, summon), the one list the machine reads for its non-core moves. **Why:** the fight bit with no warning and roared
   the player across the map from anywhere; a tell for every attack is what makes it a fight (the contract's goal).
124. **The attacks are read from the ground, and their toasts go (amends item 92).** Each windup shows one decal from a
   fixed pool of three meshes in the dragon's own frame loop: the bite a sector of its reach about its heading, the roar
   a ring of 9 m, the fireball a disc of 1.6 m on its mark, the summons a ring of 7 m; the lava keeps its own ring. The
   head's glow climbs to the danger red through the windup (the interim tell on today's model). **Each decal covers
   exactly the ground its move lands on:** a windup commits its aim (the player's feet when it starts, and the heading
   to them); the dragon faces that heading through the windup; the bite lands only inside its quarter-turn sector, and
   the fireball flies to its mark and bursts there, hitting only a player on the disc, which stays on the ground (one
   disc per fireball in flight, capped by its cooldown) until the burst. Why the sector and not a full disc: a bite with
   a front is dodged by stepping aside or behind, which is the read the arc was drawn to teach. `bossAttackCall`, the `attack` class
   in `ui/notifications.js` and the four attack keys are deleted, with the gate that simulated the line through a fight
   (its subject is gone) and the e2e's attack-call states. The phase calls now say what to read. **Why:** an attack
   announced by a toast after it has landed teaches nothing; the ground is where the player looks. One decal costs one
   transparent draw during a windup and none at rest.
125. **The perfect dodge, the heavy and the riposte reach the dragon.** The dodge start appends the record to its targets
   while the dragon fights and is not immune (`withBossTarget`); its bite and dive-bite are parryable, its casts are not.
   A heavy on a staggered dragon refreshes the 1400 ms stagger, the third knocks it down for 3000 ms, then 4000 ms of
   immunity (`registerBossHeavy`): three heavies cannot fit one 1400 ms stagger, since a heavy is ready 700 ms after its
   press, so the chain keeps every roadmap number and makes the knockdown reachable at about one heavy a second.
   `damageBoss(amount, source)` applies the 1.5x riposte to the player's damage only. The melee cone tests the head, chest
   and hips. In phase 0 the dragon dives to the player's feet + 1.2 m when its dive-bite is ready (the first dive one
   6 s cooldown after it wakes, so a fight opens with it circling), and a staggered dragon lands. **Why:** the game's two newest skills did nothing to its last enemy.
126. **One damage path for the dragon (reset-plan row 25).** `bossTargets(mobs)` hands hurl and its slam, the element
   zones and the squad the mobs with the dragon appended while it fights (zones and allies only while it is not
   airborne: they paint and fight on the ground); `CombatSystem.damageMob` routes the dragon's id to `damageBoss` with the
   source; a burning spell starts its burn on the dragon's id; the pure hit tests add an entity's `bodyRadius` (0 for a
   mob). **Why:** three Aspect kits did nothing in the climax fight. The full move of the boss into the ECS stays a later
   step, on its own merits (the reset plan's row 25 wording).

## 2026-10-30 — [LOOP] W3-B PR A: the dragon is a lazy chunk, and the lookbook can hold it

**Decided by the W3-B dragon lane under the standing grant** (DECISIONS 2026-10-28 item 14), building Units 1 and 10 of
`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md` by the task script
`docs/superpowers/plans/2026-10-30-crafty-w3b-dragon.md`. Each stands while it earns its place.

120. **The dragon's Units 1-4 go before move 11's surfaces.** The refute ordered the dragon "after 11"
   (`refute-2026-10-27.md:104`), and the dragon plan's review amendments made move 11's U1 a precondition for its Units 3
   and 5. Move 11's edge telegraph, HDR gain and decal pools are not on main and the reset plan moved them to W3-A
   (`sota-reset.md:539`), which runs beside this lane. **Why:** the tells are the fight's rules ("rules first",
   `upside-2026-10-27.md:52`) and need no shared surface: the decals are the dragon's own fixed pool of three meshes driven
   from `render/BossEntity.jsx`'s one frame loop, which W3-A's telegraph can absorb. Unit 5 (the rig) still waits for
   W3-A's edge telegraph and HDR gain; Units 6-9 are registry rows.
121. **The dragon is its own chunk, and a chunk that never loads suspends the fight.** `render/dragonLoader.js`
   `LazyDragon` replaces GameScene's static mount (index 682,746 -> 676,277 B on the build of that commit; the dragon's
   chunk 8,969 B); `world/bossSystem.js` preloads it when the player qualifies and at mount for a restored fight. The
   lazy dragon sits in its own `<Suspense>`, because React 19 hides every sibling of a lazy that suspends in a revealed
   boundary on a non-transition update and runs their layout-effect cleanups, where R3F's `useFrame` unsubscribes. A
   failed chunk is tried again three times, 5 s apart, then the encounter is SUSPENDED through the store's
   `suspendBossEncounter`: the bar, music and mood end, the HP and tier stay in the save, and the lair re-arms once the
   player has walked out of it: a player still standing there is left in a quiet lair, the chunk is fetched again only
   on a new arrival (three retries per arrival, never on a timer), and the resumed fight plays no second entrance.
   **Why the store:** GameScene's props come from `App.jsx`, which the W2-G lane holds. **Why the walk-out:** re-armed
   at once, a player at the lair woke the fight on the next poll and replayed the entrance and the failing retries
   about every 17 s.
122. **The production build can wake the dragon, only on a `?lookbook=1` page.** `world/bossSystem.js` installs
   `lookbookSpawnDragon` only when the URL carries the exact parameter; the seam's `dragon({ pose, position })`
   (`render/lookbookSeam.js`) reaches it and holds the dragon still (`lookbookDragonHold()`, read per frame by
   `BossEntity`). `scripts/visual/lookbook.mjs --sets dragon` shoots the dragon arena: the dragon over the Blight Heart
   lair, framed from the way a player walks in. **Why:** the fight's looks are judged on real-GPU frames of the shipped
   bundle (W1-H item 1), and the only spawn was DEV-only. A player who types the parameter gets the seam and nothing else
   until a script calls it.

## 2026-10-30 — [LOOP] W2-G: one event bus, a world seed, the DEV bridge out of App, autosave from PERSISTED_KEYS, production knip

**Decided by the W2-G platform lane under the standing grant** (DECISIONS 2026-10-28 item 14), building reset-plan rows
26, 27 and 41 by the task script `docs/superpowers/plans/2026-10-30-crafty-w2g-platform.md`. Row 25 is the dragon
lane's. Each stands while it earns its place.

110. **One typed event bus, `game/eventBus.js`.** A closed set of names (mobKill, levelUp, reward, victory); a name
   outside it throws at subscribe and at emit, so a typo fails where it is written. Positional payloads and
   copy-on-write subscriber arrays, so an emit allocates nothing. An array, where the kill bus had a Set: a callback
   subscribed twice is called twice per emit, and one unsubscribe removes both. Nothing subscribes one callback twice
   (each kill consumer mounts once, with its own). `game/mobKillBus.js` keeps the kill event's two helpers on it
   because `systems/CombatSystem.jsx`, which the dragon lane holds, imports them (registry
   `REVIEW:w2g:mobkillbus-fold`).
111. **The sound layer subscribes; the `window.play*` globals are gone.** The level-up, reward and victory emitters
   emit; `SoundProvider` subscribes through `audio/soundEvents.js`, the one event-to-voice table. `useGameSounds` loses
   its three reward verbs. `window.playSpellCastSound` was never assigned, so it never sounded, and the cast already
   plays `magicCast` at the muzzle: its call is deleted and no cast event replaces it (it would play twice).
   `reward-audio-gates` and `victory-audio-gate`, which read window globals and source text, are deleted;
   `event-sound-gates` drives the real emitters, bus and provider instead.
112. **A world records its seed in `game_state.worldSeed`; New World writes 12345.** In `game_state` so the tombstone
   carries it through a build that does not know it. An absent or unusable seed is 12345, the seed every earlier save
   was played on. `world/worldNoise.js` builds the noise for the terrain worker and the climate sampler alike; a load
   sends the seed on `load_modifications` and re-seeds the sampler. New World keeps 12345 because no new seed is shown to
   give a valid spawn: the Hearth, the shrines, the Blight Heart and the landmarks are placed for 12345's terrain
   (registry `REVIEW:w2g:real-world-seeds`).
113. **The autosave triggers on `PERSISTED_KEYS`, and a change joins a pending save.** `saveSchema.js` declares the keys a
   save records (traced against `buildSaveData` by `autosave-trigger-gates`); `game/autosave.js` `installAutosave`
   triggers on them, so `worldSeed` and `_tombstone`, which App's hand list lacked, now save. The clock writes `gameTime`
   every second, so the old restart-on-change debounce never fired during play; now a save lands 5 s after the first
   unsaved change, mid-combat included. Measured in node on the M3 Max: building and serializing a save takes 0.06,
   0.28 and 1.17 ms at 500, 5,000 and 20,000 block edits. That is not the write a player waits on: in the page,
   `writeWorld` also parses the world list and calls `localStorage.setItem`, synchronously on the main thread, and
   neither is measured, on this machine or an iPad. So the figure does not say whether the autosave can stall a frame
   (registry `REVIEW:w2g:autosave-cost`).
114. **The DEV bridge is `devtest/devBridge.js`, imported inside `if (import.meta.env.DEV)`.** `bundle-budget.mjs`
   checks every CI build: no name `src` registers through `registerTestHook` (59) is the quoted first argument of a
   call in any chunk, and no chunk sets `window.__craftyTest`. It matches the call, not the word, because some hook
   names are ordinary words in the bundle ("start" in react-dom, "viewmodel" a scene name, and store actions such as
   `setTimeOfDay`). One registration, `readCompatMouse` in `Components.jsx`, has no DEV guard; the build drops it only
   because no shipped code reads the registry, and removing one other hook's guard ships it with four more (mutant H3
   of the check's proof). The message of `a1b7fabe` miscounts:
   36 hooks moved (it says 39), and App lost 30 imported names on 18 lines (it says 27 imports).
115. **Production knip runs in CI beside knip.** `.knip.json` marks the shipped entries with `!` and leaves four src
   modules the game never imports out of the production project (`brand.js`, `i18n/keyReachability.js`,
   `theme/contrast.js`, `world/detile.js`). The 51 exports only tests or tooling reach carry `@internal` with the reason
   in the tag: 5 test seams, 12 shader twins or gate oracles, 16 constants and lists their tests enumerate, 5 inputs of a
   script or the tailwind parity test, and 13 no game code calls (registry `REVIEW:w2g:test-only-exports`). The message
   of `377dcec6` says 15 and 15 for the second and third; the counts are 12 and 16. The `start` script duplicated `dev`
   and nothing ran it, so it is deleted.
116. **`atmosphere-isolation-gates` reads one hook's own body.** Its fixed 700-character window after `exitCapture`
   reached `openModal`'s reset, so deleting `exitCapture`'s stayed green; the slice now runs from a hook's registration
   to the next, comments stripped.

## 2026-10-30 — commit `faa65ee1` carries the WRONG message. Read this instead.

`faa65ee1` on `feat/w2d-hud` is titled "fix(render): Show Stats no longer paces the game it measures", another lane's
message. Its author wrote the message to a fixed file name in a scratchpad that sibling agents of the same session
share; the shell refused to overwrite the sibling's file of that name, the next command was not chained on the write,
and `git commit -F` committed the staged work under the sibling's text. The rule kept: a commit is never amended, so
this entry and the next commit's body carry the real message. **What `faa65ee1` contains:** the dragon's attack calls
rank below every other notice in the phone's one line, and its one-off calls still take it at once (item 92, as amended
that day): `world/bossSystem.js` `bossAttackCall` (marked `attack`), `ui/notifications.js` `lineNotification` (one-off
call, then plain notice, then attack call), `render/BossEntity.jsx` raising its four attack calls through it, the gate
`tests/gates/boss-attack-line-gates.test.js` (REMOVED with the attack calls, item 124; a plain notice held 0-800 ms of 4 s at the fireball's 2.4 s before, its
whole 4 s after, over 11,520 simulated fights), the e2e attack-call states, and registry
`REVIEW:w2d:boss-attack-calls-unread`. Its mutation proof is in the next commit's body. The Show Stats change the title
names is not in it.

## 2026-10-29 — [LOOP] W2-D PR B: warm charcoal, three panels, the controls panel, automatic claims

**Decided by the W2-D HUD lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 2(c) and
reset-plan row 12 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md`, stacked on PR A (items 90-94).
Each stands while it earns its place.

95. **The chrome is warm charcoal.** The whole navy ladder moves (panel #2A2420, panelRaise #38302A, panelFrame #302924,
   panelInset #181411, and well, slot, control and track, which carried the same navy), the ink to #120E0B, textMuted
   to #A8A096 and the common rarity tile with them; the public face (theme-color, the no-JavaScript page, the manifest,
   the app icons) follows its ground. **Why:** the world's palette is ember and gold, and the navy read as a second,
   cold palette laid over it (the visuals lens). `tests/theme/tokens.test.js` holds every surface step warmer than it is
   blue; the contrast gate holds every text pair at its floor. The README hero and the og card are frames of the
   production build and still show the navy until the media pipeline (W2-H) re-shoots them (registry
   `REVIEW:w2d:media-after-rekey`).
96. **Three panels where there were seven, a controls panel on H, and quests that claim themselves.** Supersedes the
   E, M, U, L and Q bindings and the Tab achievements panel. Character (Tab: gear, spells, talents) and Journal (J:
   quests, achievements; feats when item 97's work lands) are groups of the panels that were there, each tab opened by its own flag, with a strip of tabs above
   the open panel; Build stays on B; the touch tray offers Character, Talk, Build and Journal. H opens a controls panel
   generated from KEY_MAP (every row's label now a key in both dictionaries) in place of the sheet that faded after 8
   seconds (STATUS C1/c). **A first session (the command session's call):** a desktop player who has not opened the
   panel sees the controls card at rest until they press H or have played 30 s with the card on screen (time paused or
   in a panel does not count); the card is one bare line above the hotbar, six essential keys drawn as the hint is (WASD,
   LMB, RMB, Tab, J, H, each a KEY_MAP key), because the whole list in a panel read 8.47% of a 1280x800 frame at rest by
   the footprint; it then folds to the one-line "H Controls" hint, which stays, on a keyboard only, until H opens the
   panel once. **Measured at rest on this branch's committed head** (lookbook eye set, footprint, real GPU, 2026-10-30
   04:19-04:28Z, at `1791b3d5`, clean tree, after PR A's round 4; the commits after it on this branch changed the e2e spec
   and these records only (`git diff --stat` to `688d3f03`), and then, with PR A's rounds 5 and 6, where a notice shows
   and how wide a keyboard's stack stands beside the boss bar (item 92), which no frame at rest draws (no lookbook frame
   raises the dragon), so these numbers stand for the build; the player has ember and coins, a frame with a nameplate up counts, and each frame
   is shot again with one raised, item 94): a returning player at most 6.58% on Chromium 1280x800 (6.79% with a nameplate), 7.55% on WebKit
   1180x820 (7.76%) and 7.56% on WebKit 820x1180 (7.77%); a first session, with ember and coins as well (an upper bound
   for a new player), at most 7.30% with the card up (7.51% with the card and a nameplate) and 6.70% once it folds (the
   card shows on a keyboard only, so the iPads read as for a returning player: 7.55% and 7.56%); frames
   `evidence/w2d/b-r3-*` (round 3's, of the same HUD on these three targets)
   (`tests/gates/controls-panel-gates.test.jsx`: the fold at 30 s, the clock
   paused off screen, the fold remembered, the hint never on touch). **Seen per browser profile, not per save:**
   `crafty_controls_seen` and `crafty_controls_card_done` sit beside `crafty_onboarded` in localStorage because they
   belong to the person at the browser, so no save field is added and
   the one-way door the brief names (deleted panels' UI state in saves) is not opened: no panel's open state was ever
   saved (`game/saveSchema.js`). Quests claim on completion through `reduceClaim`, the only payer
   (`tests/gates/quest-autoclaim-gates.test.jsx`). **Proof that nothing promised depends on the deleted keys:**
   `tests/e2e/panels.spec.js` reaches every panel the old keys opened through Tab, J and their tabs, by real keys and
   taps; `talents.spec.js` and `canvas-pace-panels.spec.js` reach the talents and the feats the same way; all run by CI.
97. **The feats are not built in this lane.** Reset-plan row 24's feats need a counter for each verb (dodge, heavy,
   perfect dodge, the four Aspects) at the seams in the Player loop (`Components.jsx`) and the Aspect verbs, which this
   lane could not change and prove in a browser in the time it had; the Journal's second tab is labelled Achievements
   and shows the existing panel meanwhile, and "Survivor" stays. Registry `REVIEW:w2d:feats` carries it whole.
98. **Every key the game teaches is a key it binds.** The panel footers (Character's gear and spells, Build, Settings,
   the Journal's quests), the locked-Aspect denial, the respec notice and the villagers' lines named E, M, L, Q and U
   after item 96 removed them; they now name Tab, J, B and Esc, through t() in both locales. The Build panel's "Press 1"
   to "Press 5" under its five tools are deleted: no handler ever bound them (the digits pick a spell, and only with no
   panel open), and so is the title strip's "Q Claim Quest" ("Q 领取任务"), the last place Q was taught.
   `tests/gates/taught-keys-gates.test.jsx` reads every dictionary string, the rendered panels and card, every denial,
   the villagers' lines, the Aspect guide and the talent trees in en and zh-CN, and fails on a key that KEY_MAP does not
   bind when it is named after "press", in parentheses, after 按 or 按住, after "hold", in brackets, or as a keycap
   before its verb (a key before a capitalised word, a key no English word shares before any word, a key before Han);
   an article, a pronoun, a count or a version is not read as a key. Before the strip's hint was deleted that scan read
   red on it, and on nothing else, in both locales.

## 2026-10-29 — [LOOP] W2-D PR A: the HUD at rest, the compass, one notification channel, and no mob mirror

**Decided by the W2-D HUD lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 2(c) and
reset-plan rows 9 (its rest) and 12 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md`. Numbered
from 90 (41-79 are taken; the W2-E follow-up lane holds 80-89). PR B (the re-key, the panels, the feats) records its own
items. Each stands while it earns its place.

90. **The desktop rail is deleted, the level card folds into the hotbar, and quests rest on one line.** The rail's three
   buttons (Inventory, Magic, Building) opened panels that keep their keys (E, M, B; `keyMap.test.js` holds each key to a
   live handler) and their touch-tray buttons (`tests/gates/hud-at-rest-gates.test.jsx` holds the tray rows); the level
   card at `bottom-32` and the touch level readout become one 4 px XP edge above the hotbar with the level beside it;
   the quest tracker rests as the lead quest's line. **Where its list opens:** on touch, a tap on the line (the tracker
   is `data-hud-interactive`, so the touch layer leaves it its taps); on desktop the HUD shows only under pointer lock,
   where no click or hover reaches it, so the full list is the quest log's (L; the Journal on J once item 96 lands).
   **Where things sit at rest** (`ui/hudLayout.js`): nothing covers a 48 px box at the screen's centre, where the
   crosshair is. On desktop the vitals keep the bottom-left corner, lifted above the hotbar's XP edge under 808 px wide
   (the hotbar's 408 px plus, on each side, the stack's 176 px, its 16 px margin and an 8 px gap;
   `tests/gates/hud-at-rest-gates.test.jsx` recomputes it from the classes the two render). Touch has three layouts,
   one per screen shape. **Tall** (640 px wide or more and 720 px tall or more: an iPad either way up): the joystick and
   the action buttons hold both bottom corners and the tray opens down the left edge, so the vitals sit at the top left
   under the quest line and the objective line, and the coin count under the minimap, clear of Pause. **Phone** (upright
   and narrower than 640 px, or upright and under 720 px tall): the nameplate, the boss bar and the toast stack are one
   column under the objective line (144 px down), so none meets another; the dial, the minimap at 60% (without its
   coordinates) and the coin count run down the right edge beside it; the vitals sit on the left edge beside the
   crosshair, 128 px wide so they clear it; and the hotbar sits 8 px from the bottom, where its XP edge clears the cast
   button (9% up, which reaches it under 711 px tall). The tall layout's encounter under the right column put the boss
   bar on the crosshair at 390x844, and under 720 px tall (390x664, Playwright's iPhone 14 with Safari's toolbars) the
   tall layout's tray opener meets the vitals, its coin count the spell row and its XP edge the cast button.
   **Short** (wider than tall and under 720 px: a phone on its side) gives the right edge to the thumb cluster's fans,
   which reach within 73 px of the top at 390 px: the compass stays in the top band at 200 px, the coin count, the
   minimap (at three quarters, without its coordinates) and the dial sit in the top band beside the Pause, the vitals
   sit on the left edge between the tray's opener and the joystick, and the hotbar scales as a phone's. Its middle has
   57 px above the crosshair and 91 under it, so the nameplate sits under the top band (96 px down) and the boss bar
   (compact) and the toast stack in a column under the crosshair. Elsewhere the nameplate and the boss bar are one
   centred column under the top centre's lines (96 px down on a wide screen, 144 px under 900 px wide). The boss bar is
   450 px where there is room, else it leaves a 216 px column clear on each side (88 px on a phone, 82 px in a narrow
   keyboard window), and never under 160 px; on a phone and a short screen it drops its phase line and numbers.
   **Why:** about a fifth of a 1280x800 frame was interface (survey-2026-10-27 finding 11); the acceptance is the chrome
   footprint on lookbook frames (item 94). **Proof that nothing promised depends on the rail, and that nothing
   collides:** `tests/e2e/hud-at-rest.spec.js` (no rail button on screen in a browser; a real grant moves the XP edge;
   with ember and coins banked, at 1280x800, 1180x820, 820x1180, 390x844, 390x664, 375x667 and 844x390, at rest, at rest
   with a notice, with a target's nameplate up, with the nameplate and a notice, with the nameplate and the boss bar,
   and with the boss bar alone, no two of the HUD's rects, the box at the centre and, on touch, the joystick's ring and
   the eight touch buttons a player sees at rest intersect; the toast stack lies inside every viewport and on the
   phones every touch target does; at 820x1180 a finger's tap opens the quest list), run by CI on the PR's head;
   `tests/gates/hud-layout-gates.test.js` pins which layout each of the seven gets and that every touch screen gets
   exactly one. Not measured: other viewports, two toasts at once or a toast with the boss bar up, an upright phone
   under 617 px tall (where the XP edge reaches the cast button again), and a touch screen under 338 px tall, where the
   short layout's vitals reach the joystick (registry `REVIEW:w2d:hud-unmeasured-viewports`,
   `REVIEW:w2d:toast-with-encounter`).
91. **The compass is a component, and its capture guards are not carried over.** `ui/Compass.jsx` renders a fixed pool
   of marker slots once; the HUD ticker writes each slot's transform and text only on change; `ui/compassLayout.js`
   places labels in priority order (boss, HOME, shrine, Blight Heart, NPC, chest, cardinal) and a later label that
   would come within 4 px of a placed one yields, its pip staying. Every label is a `compass.*` key (en, zh-CN); an NPC
   shows its short name. **The guards:** the old block suppressed HOME, shrine, Blight Heart and chests and stopped
   ticking under capture, to keep the retired capture baselines byte-stable (W1-H item 1); the rule says a guard leaves
   when its subject next moves (reset plan row 48), so the component has none. Three source-grep gates that read the
   old strings (shrine-marker, blight-marker, compass-hearth's wiring half) are replaced by
   `tests/gates/compass-markers-gates.test.js`, which drives the real marker builder; the source-grep ledger falls 101
   to 98.
92. **One notification channel: a key renders through t() when shown, and the same key inside 4 s shows once.**
   `addNotification(message, type, { key, vars })` takes a dictionary key or a plain string; `ui/notifications.js`
   decides what it says and whether it shows; a name inside a notice (a dawn's loot, the dragon) is itself a key in
   `vars`, translated when shown. **Every notice the game raises in the stack goes through it:** the dusk warning (`notice.dusk`, once
   per dusk, below the dial it covered), the numbered siege notice at nightfall and the dawn notice
   (`world/survivalSystem.js`; the `SurvivalWarning` banner is deleted), the dragon's five calls
   (`world/bossSystem.js`; its own banner, its state and `bossNotifTimers.js` are deleted, since a toast clears itself)
   and an Aspect's first unlock (`ui/AspectHintToast.jsx` hands the hint to the channel once play is live again, so it
   is not lost behind the Talents panel where it was earned), and the dragon's four attack calls (`render/BossEntity.jsx`:
   the fireball, the roar, the lava and the summons, which were English sentences). **Where the stack stands:** at the
   right edge on its own on a keyboard (under the dial, every notice up; while the boss bar is up, only as wide as the
   room the bar leaves on its right: `ui/hudLayout.js` `toastMaxWidth`, 263 px at 1024 px wide and 192 px from 640 to
   882 px, because at its full 320 px the stack met the 450 px bar in any window under 1,138 px, at 1024x768 the bar at
   x 287-737 and the stack at x 688-1008 from y 164; `tests/gates/hud-layout-gates.test.js` sweeps every keyboard width
   from 640 to 1,920 px and the e2e reads 1024x768; a window under 640 px leaves 58 px and keeps the full stack, registry
   `REVIEW:w2d:toast-narrow-keyboard`) and on a tall touch screen (under the coin count,
   the newest toasts that fit above the touch controls under it, each clamped to three lines: `ui/hudLayout.js`
   `tallToastPlace`). On its side the stack stands left of the right fans' column and stops above the jump, two toasts on
   a 1180x820 iPad, where at the edge two toasts or a three-line call reached the spell opener; upright it keeps the edge
   and stops above the spell opener, four on an 820x1180 iPad. On a phone and a phone on its side the notices join the
   encounter column (item 90), the one band those screens leave clear across the middle (at 844x390 the stack stood 372
   px down, off the screen), and **the column holds one notice at a time** (`ui/notifications.js` `lineNotification`),
   in this order: the newest of the dragon's one-off calls (its arrival, return, phase changes and defeat:
   `world/bossSystem.js` `bossCall`, marked `boss`), else the newest plain notice, else the newest of its attack calls
   (`render/BossEntity.jsx` through `bossAttackCall`, marked `attack`). **Why the attack calls come last:** they repeat
   all fight (the fireball every 2.4 s, the roar every 4.2 s, the lava every 5.2 s, the summons every 8.5 s) and each
   lives 4 s, so one is up almost the whole time; ranked with the one-off calls they left a notice raised in the fight (a
   drop, a quest, a denial a repeated press must answer) at most 0.8 s of its 4 s in the first phase and 0.2 s in the
   second. So an attack call never displaces a live plain notice and yields to one raised while it shows, and a plain
   notice holds the line for its whole life unless a one-off call arrives, which takes the line at once
   (`tests/gates/boss-attack-line-gates.test.js`, REMOVED with the attack calls by item 124: a plain notice at every 10 ms offset over two periods of each cadence,
   11,520 simulated fights, each held 4,000 ms). While the boss bar is up the line shows inside the bar's own line, in
   the name's place beside the dragon's icon, clamped to three lines on a phone and one on a phone on its side, where 14
   px separate the bar from the hotbar's XP edge (`bossCallLines`); with the bar down it is the one toast, four lines at
   most. **Why one at a time in the bar's line, and not held until the bar is down:** a fight lasts minutes, and a notice
   held until the dragon falls arrives after the moment it describes (a denial says why the press just made was refused;
   a drop or a quest belongs to the kill that raised it), and every held notice would arrive at once on top of the
   dragon's defeat. In the line each keeps its own 4 s: a notice behind a one-off call, or an attack call behind a notice,
   shows if it outlives what stands in front of it and is lost if it does not, the cost of a band sized for one line. The stack under the boss bar had no room there: when
   the dragon raised its arrival with the bar up it covered the crosshair's box and the vitals for 4 s at 390x664 and
   375x667 and the hotbar at 844x390, and two toasts reached the vitals with no boss at all. Proof:
   `tests/e2e/hud-at-rest.spec.js` (at every viewport: two notices at once, the arrival with the bar up, the real phase
   call, an attack call alone, a notice raised while it shows, and an attack call raised while a notice shows),
   `tests/gates/hud-notices-gates.test.jsx`, and `tests/gates/hud-layout-gates.test.js` (a full tall stack against
   every touch control at 4,604 tall touch viewports). The boss bar's name, phase line and numbers read through t() in
   both dictionaries. **On touch the stack is the only view of the list:** the
   combat log drew the same live list (each line leaves with its toast), and on touch it sat on the joystick on both
   iPads and on the vitals and the tray's opener on a phone on its side, so it is drawn on a keyboard only
   (`ui/CombatLog.jsx`). Proof nothing is lost: `tests/gates/combat-log-gates.test.js` (the feed that draws 8 lines on a
   keyboard draws none on touch) and `tests/e2e/hud-at-rest.spec.js` (each staged notice's toast on screen at every touch
   viewport with no log, and the log beside it on desktop). The level-up banner is the one transient drawn apart: a
   celebration at the screen's centre (`SimpleExperienceSystem.jsx`), not a notice, so it stays out of the stack, and
   its two lines are dictionary keys (`hud.levelUp`, `hud.levelReached`), read in zh-CN by
   `tests/gates/hud-zh-gates.test.jsx`. **Plain text is not deduped:** the denial notices
   (`ui/denyToast.js`) are plain strings that answer each press, and a first build that dropped a repeated one inside
   4 s made `tests/e2e/ember.spec.js` read a refused roar as "refused in silence". Keyed, the dragon's attack calls are
   deduped like every key: the fireball, raised every 2.4 s in the first phase, shows once in each 4 s. The other English
   notification literals (weather, loot, talk, quest, store) still pass plain strings (registry
   `REVIEW:w2d:notifications-english-literals`).
93. **The 250 ms mob mirror is deleted** (reset plan row 9; arch A17). The minimap and the compass read `mobsQuery` and
   `alliesQuery` on their own clocks; the lookbook hold reads the seam's `mobs()` (with ids) and falls back to the mirror
   only for an older build. `activeHostilesCount` stays, because the music subscribes to it, and is now written on
   change by SpawnerSystem's 1 s pass (it was 4 Hz): the soundtrack can start up to a second after the first hostile
   instead of a quarter second.
94. **The chrome share is the chrome's footprint, read on a held page.** The acceptance number (8% or less of an
   eye-level frame at rest) counts the pixels the HUD's own elements change: the lookbook holds the page's animation
   frames (the canvas keeps one rendered frame), shoots the frame, a twin with the HUD's elements hidden and the canvas
   and touch layer shown, a twin with the canvas alone and the frame again, and counts the pixels where the first two
   differ by more than 2 in any channel, if the first and last agree. The touch layer (its scrim, ring and buttons) is
   reported apart, as the pixels where the two twins differ; the colour count (pixels within 3 of the page's own
   `--ui-*` surface colours) stays as a second column. A frame with a toast in the stack is not at rest and is set aside
   by rule (`scripts/visual/_lookbook.mjs` `atRest`), the siege notice included; a frame with a target's nameplate up
   counts, since that is the HUD while the player looks at a mob, and each frame is shot once more with a nameplate
   raised on the held page (the nameplate twin), whose footprint the run reports beside the frame's. The eye set's
   player has ember banked and coins, so the ember bar and the coin count are drawn. **Why:** a count of surface colours
   reads the palette in both directions: a warm stone texture within 3 of the warm ladder counted as chrome (7.46% on a
   world with none) and a translucent panel whose blend misses every token did not count at all. The footprint reads no
   palette (`tests/gates/lookbook-chrome-gates.test.js`: a warm stone world with no chrome reads 0, a 10% panel over a
   world unlike it reads 10% on either ladder, a panel at alpha 0.6 still counts, the scrim is its own class).
   **Blind spot:** it reads change, so a surface that changes the world under it by 2 or less in every channel is not
   counted: an opaque surface over world pixels of its own colour reads short of its area, and a faint translucent one
   over a world near its colour reads nothing. Warm chrome over a warm world is where that happens: the gate's
   warm-on-warm fixture reads a 10% warm panel over warm stone at 8.28%, and the same panel at alpha 0.15 at 0%.
99. **The HUD at rest is flat and smaller, because the footprint said where the screen went.** With the slim hotbar
   the footprint read 9.91% of a Chromium 1280x800 frame at rest and 10.21% of WebKit 820x1180, over the budget, and
   gave each surface its share: the hotbar 3.4%, the minimap 1.6%, the compass 1.3%, the quest line 1.3%, the vitals
   0.7%, the dial 0.6%, the objective line 0.6%, the XP edge 0.4%. So the hotbar is nine slots with nothing behind them
   (40 px on a keyboard, 48 px on touch, where each is a tap target); the HUD's own surfaces at rest drop the hard offset
   shadow the panels keep (the quest line, the compass, the minimap, the dial, the coin count); the minimap is 112 px
   (was 132), the compass 288 px (was 320), the dial's ring 36 px (was 44), the quest line at most 280 px on a keyboard
   (was 320). **Measured after** (lookbook eye set, every valid frame at rest, real GPU, 2026-10-29 23:22Z): Chromium
   1280x800 at most 6.69%, WebKit 1180x820 7.69%, WebKit 820x1180 7.69%; main before this lane read 22.14% and 11.87%
   at 1280x800 and 820x1180. **A returning player** (round 3): that player had no ember and no coins, so the ember bar and
   the coin count were never drawn. With both banked and each frame shot again with a target's nameplate raised (item
   94), the same HUD read 7.39% on Chromium, 8.44% on both iPads, and 8.34% and 9.44% with the nameplate: over the
   budget. So the vitals are slim 14 px rows (a 10 px track with no offset shadow, the label and value beside it), the
   coin count and the nameplate sit on the world with no panel (WebKit 1180x820: the vitals 1.10% to 0.50%, the coin
   count 0.38% to 0.05%, the nameplate 1.00% to 0.19%), and type on the world carries a one-pixel ink outline
   (`ui/onWorldText.js`), because over a white sky the shadow alone washed the numbers out. **Measured after, on a
   committed head** (lookbook eye set, a returning player with ember and coins, ten valid frames at rest per target and
   each shot again with a nameplate raised, real GPU, 2026-10-30 04:11-04:15Z, at `391bc20b`, clean tree): Chromium
   1280x800 at most 6.58% (6.79% with a nameplate), WebKit
   1180x820 7.55% (7.76%), WebKit 820x1180 7.56% (7.77%). Round 3 read the same numbers on an uncommitted tree; these
   replace them. After `391bc20b` PR A's branch changed this record and the e2e spec only (`git diff --stat` to
   `8cca4468`), and then where a notice shows (item 92: the tall touch stack's place and count, the encounter column's
   one notice, the boss bar's line and its keyed words), which no frame at rest draws (a frame with a toast is set aside
   by item 94's rule, the boss bar shows only in a fight, and an empty stack is 0 px tall), so the numbers stand for the
   build; they were not shot again. The frames `evidence/w2d/a-r3-*` show the same HUD on these three targets, which round 4's phone and
   short layouts do not move. **Why:** the brief's acceptance is the
   share of the screen at rest; the hard shadow is the
   panels' elevation, and a HUD that sits on the world reads as one plane without it.

## 2026-10-29 — [LOOP] W2-J phase 3: closed records behind the tag `records/2026-10-29`, and a generated CHANGELOG

**Decided by the command session** (SOTA reset rows 32 and 57; task script
`docs/superpowers/plans/2026-10-29-crafty-w2j-phase3.md`). Each stands while it earns its place.

100. **Closed records leave HEAD; the annotated tag `records/2026-10-29` keeps them.** It points at main `e900de6b`,
   the tree before the removal. Read one: `git show records/2026-10-29:<path>`; list them:
   `git ls-tree -r --name-only records/2026-10-29 -- docs memory`. 143 files (10.98 MB) went: the 2026-Q2 plan archive
   but two, LOOP-PROGRESS, the inbox's old page KEVIN-REVIEW.html, six of seven dated audits, four dated reviews
   (AUDIT-2026-08-09, CODE-REVIEW-2026-06-20, GOVERNANCE-REVIEW-2026-08-07, LOOP-DOC-SOTA-PLAN-2026-07-27), 38 shipped
   plans, 12 shipped specs with their two reference comps, one research note, the 2026-09 overnight brief and plan with ten of sixteen frames, the
   superseded cursor archive and one perf report. A record stays while a doc-currency canonical doc, a rule file,
   `CLAUDE.md`, a gate, script, test, CI step, a plan dated 2026-10-27 or later, a published page or the inbox names it
   (`docs/superpowers/INDEX.md` lists what stays and why). Four records left although something named them, each only
   as history, and all four are at the tag: `sota-2026-09/OVERNIGHT.md` (the published pages `sota-audit.html` and
   `era-review.html` quote it as the source of dated claims), and `KEVIN-REVIEW.html`,
   `LOOP-PROGRESS-2026-10-28.html` (from `docs/archive/`) and `sota-2026-09/PLAN.md` (the 2026-10-27 harness-sota plan names them as
   units that moved or bannered them). None is a link or a path anyone follows. This supersedes item 13(a)'s in-tree
   `docs/archive/` (2026-10-28): a retired record goes to a dated tag, not a directory. Proof nothing live depended on
   them: each of the 143 file names was grepped over every tracked file. No source file, test, script, gate, rule file,
   `CLAUDE.md` or canonical doc names one as a file to open (`cameraKick.js` names its plan as
   `git show records/2026-10-29:<path>`; ACTIVE_PLAN T15 names OVERNIGHT.md to say it left); what remains are history
   citations in kept records, listed in the registry row `W2J:kept-records-point-at-removed`. The unit suite and the
   build do not prove it: they read no record.
101. **`memory/CHANGELOG.md` is generated** by `frontend/scripts/ci/changelog.mjs --write` (one line per landing:
   a merged PR's title and number, or a landing git proves), at session close. `--check` stays as a manual command and
   no commit hook or CI step runs it. Why: a lane that regenerates in its merge commit writes a stale file, because
   `--write` reads HEAD before that commit exists (it now refuses while a merge is in progress); and a PR's CI checks
   GitHub's synthetic merge (main's first parents) while main's push run checks the lane tip (the lane's first parents),
   which are different landings, so a green PR can turn main red. A freshness check on a changelog is not worth landing
   friction and a red main. Not checked: PR titles against GitHub, and a landing no later commit took in. The
   hand-written history: `git show records/2026-10-29:memory/CHANGELOG.md`.
102. **The root loses its one-file `scripts/`:** the compaction hook is `.claude/hooks/session-start-compact.sh`.

**Door:** two-way. Every removed file is in the tag and in history; the generator and the hook move are reverts, and
the freshness check returns by adding its step to `ci/pipeline.sh`.

## 2026-10-29 — [LOOP] W2-E follow: the beast in first person, the cast, mobs that sense the body, the hands by the fire

**Decided by the W2-E follow lane under the standing grant** (item 14), by its task script
`docs/superpowers/plans/2026-10-29-crafty-w2e-follow.md`, and its review's fix round (PR #52). Items 80-88 (41-69 are
taken and the Cut lane holds 70-79).
Frames: `docs/superpowers/masterpiece-2026-10/evidence/w2e-follow/` (`index.md` there), shot by the lookbook's new
`self` set on production builds, Chromium on ANGLE-Metal at 1280x800 and WebKit at 820x1180.

80. **In first person the player's own beast draws nothing but its shadow; its light stays.** Supersedes item 39 for
   first person (its 0.25 m clearance still holds away from the eye). The before frames: the dragon's wings fill the
   upper corners as two flat orange slabs at noon and midnight, and the bull's halo washes a cyan band behind the hotbar;
   the golem's halo tints the bottom edge; with the head hidden (item 39) the hawk's beak and the dragon's head would float
   on their own. The boxes are shaped to read from the reveal's 4.5 m (`beast-reveal-after.jpg`), not from inside, so
   in first person no part writes colour or depth, the glow spheres and the entrance's burst included, and every box
   still casts its shadow. First person is the follow placing the camera, marked by the Player's loop each frame
   (`render/followView.js`), not the drawn camera standing near the eye: a crit's shake (weight 1.6, trauma 0.8) puts
   the follow's target a median 1.5 m off the eye and, after the follow's 0.85 lerp, the camera outside 1 m on three
   crits in four (2000 seeds), and a rule of 1 m from the eye let the boxes flash back in during fights. When another
   branch placed the camera (the reveal's ends, an eye pose), it is first person within 1 m of the
   steady eye (`beastAvatarParts.js FIRST_PERSON_M`; the reveal leaves it in its first fifth), measured in world space,
   and the clearance is in metres: on a form's first frames the entrance draws the avatar at half scale. The eye stays
   at body + `EYE_HEIGHT_M` in every form: a per-form eye would put the dragon's 2.15 m up, inside the ceiling of a
   two-block passage its 1.44 m capsule fits, and pop at the reveal's handover. What it costs, that nothing on screen
   says which form the player is in, item 87 answers on the gauntlets. The core's light is kept off the hands
   (`lightsHands={false}`, item 82): 0.6 m from them it bleached the gauntlets yellow and salmon.
   Gated by `tests/gates/beast-self-view-gates.test.jsx` (the bob, a kick, a crit's shake and a stack of hits in the
   follow, the form's first frame, the reveal's depth writes) and `player-view-hold-gates.test.jsx` (the real Player and
   Rapier: the follow's mark under a crit, through the reveal, dead and under a lookbook pose). It stands while it earns
   its place.
81. **The cast pushes the wand toward the target, on the cast's own clock, and the fireball cone is gone**
   (`frontend/src/render/handPose.js castPose`). Seen at its apex for the first time, the cast bobbed the wand hand 4 cm
   on the session's wall clock, so it pulled back as often as it pushed, and the fireball's translucent red cone drew as
   a flat shard beside the wand (no outline, no toon, spun per frame). Now the hand pushes 0.12 m, lifts and tips the wand
   forward, peaking halfway through the 150 ms cast; the off hand lifts its orb. The swings and the heavy charge read as
   authored at their apex and near their end on 16:10 and in iPad portrait (no hand through the camera, no impossible
   wrist, the fist inside the frame) and are unchanged; the swing, cast and charge poses allocate nothing per call
   (`chargePose` reads its offset by index: destructuring it built about 184 bytes a call). Gated by
   `tests/gates/hand-pose-gates.test.jsx` and, for the allocation, `hot-path-alloc-gates.test.js` (item 88). It stands
   while it earns its place.
82. **The hands take the world's point lights: the three that put the most light on the eye, mirrored into view
   space** (`render/viewmodel.js mirrorPointLights`, `HAND_POINT_LIGHTS` 3, a fixed count so no hand shader relinks).
   The brazier's light is not pooled, so "the pool's nearest" would have missed the light the row named; every world
   point light now registers (`render/lightPool.jsx`: the pool's lights and `WorldPointLight`, used by the Hearth's
   brazier, the danger fill and the phantom block). Ranked by three's own falloff (cut-off window and decay), by an
   insertion into fixed arrays, no allocation per frame. Beside the brazier at midnight the gauntlets' faces toward the
   fire now warm (`hands-brazier-midnight-before-after.jpg`). Supersedes the "fill and point lights not mirrored" clause of
   item 38. Gated by `tests/gates/viewmodel-gates.test.js` and `viewmodel-layer-gates.test.jsx`, which mounts the pool
   with a pooled light and the layer and reads the pool's own lights registered and the pooled light on the hands. It
   stands while it earns its place.
83. **Mobs, their arrows, the combat stance and the player's blows take the player's place from the body, not the
   camera.** Supersedes the sense point of item 36 (its ledge table, built from `steadyEye`, is unchanged).
   `game/mobSenses.js mobSensePoint` is the body's steady eye (centre + `EYE_HEIGHT_M`), taken from the body sample the
   Player's loop hands `stanceFrame` every live frame (`systems/playerSensePoint.js`; the rigid body's `translation()`
   builds a wasm vector and an object per call in rapier3d-compat 0.19.2; the camera only before the first sample). The
   AI tick, an arrow's aim and its hit test, the leap's direction, `stanceFrame` and the blow's knockback, flinch, spark
   cone and shake bias (`systems/CombatSystem.jsx`) read it, so the roar's reveal, the shake and the kicks move no mob's
   reach and knock no mob the wrong way. Every other reader of the camera as the player's place, from a search for
   `gameCamera`, `playerPosition` (which `systems/PositionTracker.jsx` mirrors from the camera every 200 ms),
   `camera.position` and `getWorldPosition` in `frontend/src`, and whether the camera is right there:
   - **Right (the view's own).** Chunk streaming and centring, the far field, the shadow map's centre, the weather
     (`Terrain.jsx`, `FarField.jsx`, `Atmosphere.jsx`, `WeatherSystem.jsx`): the world is built around what is seen,
     and a lookbook hero pose depends on it. The occlusion rays, the sky dome and sun, the ocean, the light motes, the
     shrine and blight beacons (`Terrain.jsx`), nametag fade (`Nametags.jsx`), the windup chevrons and the quest and
     waypoint markers (`ui/WindupChevrons.jsx`, `HUD.jsx`): they are drawn for the view. The listener and the sounds the
     player's own verbs make at it: spatial audio, biome ambience, thunder, the cast, slam, jump, footstep, roar and grab
     sounds (`SpatialAudioController.jsx`, `SoundManager.jsx`, `LightningDriver.jsx`, `EnhancedMagicSystem.jsx:222`,
     `Components.jsx`). A spell's start (`EnhancedMagicSystem.jsx:230`) and the snare tether's (`Components.jsx`): they
     leave along the crosshair, which is the view's. The light pool's ranking and the hands' light (`render/lightPool.jsx`,
     `render/viewmodel.js`), the touch look, the lookbook's own reads, the debug overlay and the perf probe.
   - **Wrong (the body's).** Fixed here: the AI, the arrows, the leap, the stance and the blow. Left, as registry rows:
     the boss (`render/BossEntity.jsx`, `REVIEW:w2e-follow:boss-senses-camera`); XP orbs and loot
     (`XPOrbSystem.jsx`, `LootSystem.jsx`, `REVIEW:w2e-follow:pickups-at-camera`); and, in
     `REVIEW:w2e-follow:player-place-at-camera`, the chest and shrine reach and the other quest proximity checks
     (`QuestSystem.jsx`, the HUD lane's file), the villager greeting (`render/MobModel.jsx`), the lair trigger
     (`world/bossSystem.js`), the ally squads' follow point (`world/SquadAISystem.jsx`), the grass bend source
     (`OptimizedGrassSystem.jsx`), the fuse pair search and the footstep surface (`Components.jsx`), the manual save's
     position (`WorldManager.jsx`; `App.jsx` and `game/contextRecovery.js` already save the body), the minimap's
     centre (`ui/RadialMinimap.jsx`) and the hit-direction cue's origin (`store/useGameStore.jsx`), the last two in the
     HUD lane's files. Each is off whenever the camera is off the body's eye: the 1.2 s reveal, a lookbook hero pose,
     and every frame the follow carries the shake or a verb kick (`Components.jsx:1503-1505`; a crit's shake puts the
     follow's target a median 1.5 m off the eye, item 80), which the footstep surface (`Components.jsx:1430`) reads
     from the camera the frame before placed. The talk target (`input/talk.js`) and the spawner's ring
     (`SpawnerSystem.jsx`) stay on the camera: in play it stands within the bob of the eye but for the shake and the
     kicks, and spawning around the view is safe.
   Gated by `tests/gates/mob-sense-body-gates.test.jsx` (the tick, an arrow's aim and its hit test, the leap and the
   blow, each with the reveal staged) and, for the allocation, `hot-path-alloc-gates.test.js`. It stands while it earns
   its place.
84. **The beast's hidden parts are judged as the frame draws** (`render/BeastAvatar.jsx`): each part decides in its
   `onBeforeRender`, which three r172 calls with the drawing camera after every frame callback, the Player's loop
   included, has run, so it reads the follow mark and the camera this frame placed (item 80), and the reveal handing
   back to the eye hides the beast on that same frame; the shadow pass calls `onBeforeShadow`, so the boxes still
   cast. It stands while it earns its place.
85. **The first-person follow is gated at the eye within the walk bob** (`tests/e2e/ember.spec.js backAtHead`): the
   camera must come back to body + `EYE_HEIGHT_M` within `EYE_BOB_M`, not 0.6 m. On CI run 40921754876 (a dispatched
   run of branch `mut/w2e-follow-eye`, the follow at + 1.2 m) it went red on all three attempts, and so did
   `talents.spec.js`'s head check, already at `EYE_BOB_M`. The same tightening in `heavy-melee.spec.js` let the mutant
   through (its wait is met by the reveal's closing frames, which stand at the eye by `transformCam.js` itself) and was
   not kept. It stands while it earns its place.
86. **The lookbook has a `self` set** (`scripts/visual/lookbook.mjs shootSelf`): each beast form at the steady eye and
   from the reveal's hold, the light string, the cast and the full charge held at their apex by the seam
   (`render/lookbookSeam.js` `form`, `handPose`, an eye pose with `hands: true`), and the hands beside the brazier at
   midnight. What a still changes against play: no bob, no FOV kick, and the body rests where the human capsule rests,
   so in a form the world sits up to 0.3 m off where that form's capsule would put it (the beast against the eye is
   exact). It stands while it earns its place.
87. **The gauntlets take the beast form's colour while it is on** (`render/viewmodel.js stepFormTint`, `FORM_TINT`,
   driven per frame by `render/playerRender.jsx`): as the beast is a dark ink body with an element rim, the gauntlets'
   ink outlines take the form's colour (`FORM_TINT.colour`: the beast's own rim, `beastAvatarParts.js ELEMENT_COLOR`, for
   the bull, the hawk and the golem), and so does the ember core in each, at the core's HDR gain, eased in by the end of
   the form's 0.55 s entrance and out after it, the fading form keeping its colour until it has gone; the held item's
   outline stays ink. It answers item 80's loss: in first person the beast draws nothing, and now the hands say which
   form is on. Fire takes a crimson, `#D4142C`, on the hands only: the beast's orange `#FF6A2C` stands 24 degrees of OKLCH
   hue and 0.04 of lightness off the plates (`#E8963A`) and 21 degrees and 0.07 off the ember core (`#FF9A2E`), and in the
   frames its rim was a 1-2 px orange-red line on orange and its core sat in the plates' orange; the crimson stands 41
   degrees and 0.19 under the plates and 38 degrees and 0.22 under the ember core (authored), and against the lit plate
   as rendered (`#D26B00`) the rim moved from OKLab 0.065 off to 0.131 and the core from 0.091 to 0.133
   (`gauntlet-fire-colour-before-after.jpg`). Frames (`evidence/w2e-follow/gauntlet-form-colour-*.jpg`, 0.30): the rims
   read crimson, cyan, yellow and violet round both gauntlets. As displayed, the hawk's core stands 0.04 to 0.07 (OKLab) off
   the ember core (both go yellow-white through the core's HDR gain and NEUTRAL), so its rim carries it. Two arms were shot and
   dropped: 0.35 of the glow on the plates read salmon for the bull and pink for the golem on their ember gold
   (`gauntlet-plate-glow-rejected.jpg`), and the core alone shows only a sliver at rest, which read for the bull and the
   golem and not for the hawk or the dragon. Also passed over: a beast viewmodel (claws in place
   of the gauntlets: four new hand models) and the core's own light on the hands (it bleached them at 0.6 m). drei's
   Outlines writes the ink back whenever the hands re-render (an attack starting does it); the tint writes the colour
   again every frame callback, ahead of that frame's draw (not measured in a browser). Gated by
   `tests/gates/form-gauntlet-gates.test.jsx`, with drei's real Outlines, and each form's outline and core standing 0.15
   (OKLab) off the plate as displayed at 0.30 and 0.75 (the fire rim that did not read stood 0.10 to 0.11 off, the hawk's
   that did 0.15), fire 30 degrees of hue and 0.1 of lightness off the plates and the ember core. It stands while it
   earns its place.
88. **Per-frame code is gated for allocation by a young-generation heap probe** (`tests/gates/_youngGrowth.js`,
   `tests/gates/hot-path-alloc-gates.test.js`): new-space growth over runs of 5000 calls that no collection interrupted
   (`node:v8` GCProfiler), with no fixed warm-up: runs continue until the median of the last five kept runs is under
   8 bytes a call or 3 s have passed, and that median is returned, so the runs before the optimiser installs its code
   are outlasted and a call whose compiled code allocates reads high to the end of its budget. Under 8 bytes a call
   passes, beside a control that takes its first five runs (a real Rapier `translation()`, 172 to 189 bytes a call on
   Node 24.13.0, the first probe the highest) and shows the probe sees an allocation. It measures what V8's optimiser leaves: an object it elides (a literal passed to an inlined
   call, a `new THREE.Color()` that does not escape) reads as none, and is none in that process. It covers the hand
   poses, the mobs' sense point and the gauntlets' form tint. Left allocating, as a registry row
   (`REVIEW:w2e-follow:per-frame-alloc-untouched`): the snare search's two vectors and its `translation()` every frame
   in play, and the box distance's rotation read at every draw away from the eye. It stands while it earns its place.

## 2026-10-29 — [LOOP] W2-F step 7: quests name the creatures on screen

**Decided by the W2-F quest-text lane under the standing grant** (DECISIONS 2026-10-28 item 14), building the
quest-text half of reset-plan row 24 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-hunger-quests.md`.
Stacks on step 6 (items 70-74). Each stands while it earns its place.

75. **A hunt's text comes from its creature's display name.** A quest with a `mobType` (five: Zombie Slayer, Spider
   Hunter, Ember Hunter, Undead Destroyer, Brute Breaker) renders its title from `quest.<id>.title` and its objective
   from `quest.defeatType` ("Defeat {count} {mob}") through `t()` (`frontend/src/game/questText.js`). The noun is the
   locale's `mob.<type>.<one|other>`, the form picked by `Intl.PluralRules` for the count; the English nouns are
   generated in `frontend/src/i18n/strings.js` from `MOB_TYPES[type].displayName`, plus "s" except where English does
   not (Ox to Oxen), so in English the nametag and every quest share one word. The zh-CN nouns are written by hand
   (item 77) and the nametag shows the English `displayName` in every locale, so in zh-CN a quest and a nametag can
   name one creature in two words (registry `REVIEW:w2f:quest-text-zh-rest-english`). The zombie quest reads "Husk
   Slayer", "Defeat 10 Husks"; one Husk reads "Defeat 1 Husk". Undead Destroyer keeps its title, which names no one
   creature. Every other quest renders the text it was authored with. **Why:** a quest that says "zombies" beside a
   nametag that says Husk tells the player two names for one creature (reset plan row 24).
76. **No save key moves; the key map is the identity.** A saved quest is found by its id, a hunt counts its
   `mobType`, and `stats.kills_by_type` is keyed by the same MOB_TYPES key, so renaming `zombie_slayer` or `zombie`
   would need a migration and buy the player nothing. The map is frozen as literals in
   `frontend/tests/store/questKeyMap.test.js`, where a pre-change save's hunt at 7 of 10 loads, reads "Defeat 10
   Husks", and three Husk kills finish it under `kills_by_type.zombie`. A hunt's text is never read from the save; a
   load also takes each quest's English title from `QUEST_LIST` (`withCurrentAsk`), so the save and the completion
   notice, which stays English, say "Husk Slayer". **A rollback is half-covered:** a build from before this change
   keeps the saved title and rewrites the objective from its own list (`withCurrentAsk` at `QuestSystem.jsx:122` of
   `1882bd5b`, the list's `'Defeat 10 zombies'` at `:36`), so it shows "Husk Slayer" over "Defeat 10 zombies".
77. **zh-CN names every creature** (Boar 野猪, Ox 牛, Husk 尸傀, Bonepicker 拾骨者, Frontier Spider 边境蜘蛛, Settler 定居者,
   Skitterling 窜蛛, Duskhound 暮犬, Moss Brute 苔藓蛮兽, Ember Husk 余烬尸傀) and the hunts ("击败 10 个尸傀", "尸傀杀手");
   the coverage test makes a new creature name itself in both. The rest of the quest text (the other quests, their
   lore and givers, the notices, the tracker's chrome) stays English in zh-CN (registry
   `REVIEW:w2f:quest-text-zh-rest-english`); the names were chosen here and no native reader has seen them yet. They
   are the quests' words, not the nametags': the nametag stays English in every locale (`nametagFor` reads
   `displayName`), so a zh-CN player reads 尸傀 in the tracker over a nametag that says Husk, and the two would
   disagree again if a nametag were ever translated differently.
78. **The tracker is not restyled** (W2-D collapses it to one line): the HUD tracker and the quest log swap only the
   source of their two text lines. **Not proven, and owed:** the e2e's browser mutants
   (`REVIEW:w2f:quest-text-e2e-mutants-unrun`) and the quest log in a browser (jsdom only).

## 2026-10-29 — [LOOP] W2-F step 6: hunger and the food leave the game

**Decided by the W2-F hunger lane under the standing grant** (DECISIONS 2026-10-28 item 14), finishing reset-plan row
8 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-hunger-quests.md`. Numbered from 70 (41-69 are
taken). Each stands while it earns its place.

70. **Hunger is deleted, not hidden.** W1-B deleted the drain and step 2 (`00c0a8d4`) the HUD bar; what was left goes:
   the store's `hunger`, `setHunger`, `consumeHunger` (the game's only `'starvation'` damage) and `feedPlayer`, the
   respawn's refill, the `GameSystems.jsx` context's copies, the inventory's `feed` effect, the StatBar's `hunger`
   kind, and the showcase's hunger bar (it shows the ember bar, as the HUD does). **Why:** a meter nothing drains and
   no bar shows is a field every reader must still reason about, and its one damage path was one interval away from
   killing players unseen again.
71. **The five foods go with it:** Raw Porkchop, Raw Beef, Cooked Porkchop, Cooked Beef and Rotten Flesh, from the item
   registry, the consumable registry, the loot tables (pig, cow, zombie, duskhound) and the icon set (`meat`, `food`
   and the baked glyph). Their one effect was `feed` (the cooked two also healed 10), so each would have been a Use
   button that spends the item for nothing. No quest, recipe, tutorial, help line or i18n key named one. **The loot
   tables gain nothing in their place:** another drop with no use is the class `REVIEW:w2f:forge-orphan-loot` already
   tracks. The XP a pickup paid moves with them; the expected XP of a kill near spawn (mob XP plus each row's chance
   times its XP) falls for the pig 14.6 to 10.6, the cow 20.9 to 16.9, the zombie 30.75 to 28.65 and the duskhound
   34.7 to 33.2. `tests/gates/retired-items-no-source-gates.test.js` holds that no loot row, reward, starting bag,
   Forge offer or registry hands the player a retired key, and that no consumable feeds.
72. **Old saves.** No build ever wrote hunger into a save (`buildSaveData` never held the key), so a save holding
   `hunger` under `progression` or `game_state` holds an unknown key: the store never reads it and the tombstone writes
   it back for one SAVE_VERSION. The five foods join `RETIRED_INVENTORY_KEYS`: they leave every bag and every chest on
   load and ride the tombstone back into the same container. **Dropped, not credited:** raw meat and rotten flesh only
   fed a meter that drained nothing since W1-B; cooked meat also healed 10, and its one source, the grid, left in step
   5, while the merchant and chests still sell and drop Health Potions (30); and a credit would come back doubled on a
   rollback, which finds the meat as well. The crystals, the wand and the pickaxe set the precedent (items 46, 66). The
   rule is stated and run in `tests/store/hungerCut.test.js`; the pre-cut fixture with food planted keeps level 5 and
   deals finite damage.
73. **The proof nothing still promised depends on what was cut.** `tests/e2e/the-cut.spec.js` boots a fresh profile
   under Playwright's page clock (installed before boot, so every game timer is the fake clock's), reads the HUD's stat
   stack (health, mana, ember, nothing else), then pauses the clock and moves it ten minutes in 120 jumps of 5 s, the
   deleted interval's period, sweeping hostiles after each: health must not fall, while the provider's mana regen
   refills an emptied bar, the day clock advances and frames are drawn; a staged hit after the window shows the reading
   is live; a real left click hurts a staged zombie; the autosave's blob holds no hunger and no food. Its fixture case
   loads a save holding hunger and Raw Beef through the browser. The unit suite was green with the cut (562 files,
   4881 tests). `tests/e2e/hunger-starvation.spec.js` is REMOVED with its subject (last on main at `ddd4fe78`).
74. **Not proven, and owed:** the e2e's browser mutants (CI runs the spec; no local browser run was allowed), and a
   timer faster than 5 s at its real rate across ten minutes (the jumps fire it once each; the unit gate
   `pause-holds-timers-gates` runs the provider's timers at their real rate for 84 minutes in jsdom).

## 2026-10-29 — [LOOP] Vercel deploys main only

**Decided by the command session under the standing grant** (DECISIONS 2026-10-28 item 14). Item 58; the W2-H media
lane holds 50-57 and the Forge lane 60 on.

58. **Only main deploys; previews are off** (`frontend/vercel.json` `git.deploymentEnabled`: `"**": false`,
   `"main": true`). Supersedes the dependabot-only `ignoreCommand` of 2026-07. Why: the Hobby plan allows 100
   deployments per rolling 24 h, and the 24 h to 10:10Z held 136 (105 Preview, 31 Production, read from the GitHub
   deployments API), so PR #46's preview was refused at 09:30Z ("Deployment rate limited — retry in 24 hours") and the
   next production deploy of main would be refused the same way. No check reads a preview: CI runs the suites and
   prod-smoke on the exact sha, and `ci ok` is the only required check. An `ignoreCommand` cannot fix it, because a
   build it cancels still counts toward the quota (Vercel's Ignored Build Step docs); `git.deploymentEnabled` creates
   no deployment, and a branch that matches several keys deploys when any of them is true (Vercel's git-configuration
   docs), so main deploys and every other branch does not. `tests/scripts/supply-chain.test.js` evaluates that rule
   over main, lane, land and dependabot branches. Not proven until observed: a lane push creating no Vercel deployment,
   and the first main push after the quota window drains deploying (registry `DECISIONS:2026-10-29:58`).

## 2026-10-29 — [LOOP] W2-H: one media pipeline; the README hero and the og card are frames of the production build

**Decided by the W2-H lane under the standing grant** (item 14), by its task script
`docs/superpowers/plans/2026-10-29-crafty-w2h-media.md`, whose metric was written before any frame was shot. Items 50-57
and 59 are this lane's (W2-F talents 41-49, 58 another change's, the Forge from 60). The shot table, its budgets and its checks are in
`frontend/scripts/visual/_media.mjs`; the record of what was shot is `docs/media/media.json`.

50. **No shot shows the HUD, and a frame is judged as a stranger sees it.** W2-D will re-key the HUD soon, and a frame
   shown to people who have not played sells the world, not the readout; a HUD-free frame outlives the re-key, so no
   shot is owed a re-shoot when W2-D lands. The HUD is hidden with the store's own switch (`setHudHidden(true)`, the one
   `App.jsx` reads), not by editing the page, and only after the run has seen its vitals stack on screen: a renamed
   test id fails the run instead of passing every frame (`mediaShotVerdict` `hudSeenOn`). Eye shots keep the
   first-person hands, which are the player's own view. **What makes a frame acceptable**, declared before the second
   shoot and judged by opening every frame at full size: (a) it sells the game to someone who has never played: the
   light of the day script (a low golden sun, blue hour, a fire), the Hearth and its people, or the world beyond, with
   one clear subject; (b) the hero and the og card carry no first-person hands, which fill a third of an eye frame;
   (c) nothing reads as a mistake: the subject, every nameplate and every mob whole inside the frame, no edge of the
   world, no flat band of sky or haze over a third of the frame. Tolerated, since the committed frames carry them and
   none of them hides the subject: a secondary building cut at a side edge (the healer's cabin at the hero's right
   edge), a roof tip of a few pixels at the bottom edge (the watchtower's, in the hero, the og card and the social
   preview), trees cut by any edge, the og card's subtitle crossing Bram's stall, and small fixed objects on the pad.
   The two small green tiles on the Hearth's pad in the three poses are its two leaf planters: 0.6 m cubes in leaf
   green (`#3E7D32`) that `HomeAnchorRender` in `frontend/src/world/Terrain.jsx` sets either side of the lodge, at
   (-2.5, 1.4) and (2.7, -1.4); projected through the hero's pose (fov 75) each lands within about 12 px of a tile, and
   from above a cube that small reads as a flat tile (registry `REVIEW:w2h:pad-slabs`). (d) the og card's left third,
   under the wordmark, carries no subject. A frame that fails one is re-shot once with a new recipe or dropped from
   the table. It stands while it earns its place.
51. **ImageMagick encodes, at shoot time only.** The browser shoots each frame as a lossless PNG master at device scale
   2; `magick` downsamples it (Lanczos) and encodes each JPEG to its byte target with `jpeg:extent`, and the og card to
   an 8-bit palette PNG (a photograph as a truecolour PNG is about 1 MB against the card's 400 KB ceiling). No npm
   dependency: `magick` is already on the shooting Mac, as `ffmpeg` is for the lookbook clips, and the gates read the
   committed files, so CI installs nothing. Budgets, 1 KB = 1000 bytes: each JPEG 350 KB, the og card 400 KB, all of
   `docs/media` 3 MB, and the table's own byte targets must fit them (`shotTableProblems`); each committed file is held
   to its shot's target as its ceiling (`mediaProblems`). It stands while it earns its place.
52. **The og card is composed, not cropped:** the og frame under an ink scrim from the left, dark only behind the words
   and clear from the middle on so the frame's own colour carries the rest, the wordmark in the game's own Lilita One in
   the brand gold, and the brand title's subtitle, drawn in the same browser from `ogCardHtml` with the font files the
   game ships; the run checks that the frame loaded as its master before it takes the card. No buttons and no controls
   text (reset plan section 6). `BRAND.ogImageAlt` describes the
   new card, so the head's og and twitter alt text follow it (`public-face.mjs --write`). It stands while it earns its
   place.
53. **`make-og-image.mjs` and the capture baseline `menu.png` are deleted** (REMOVED 2026-10-29), the last
   file of the retired capture oracle with them. Nothing reads either now: the generator's centre-crop tests go with
   it, and `frontend/tests/scripts/social-preview.test.js` checks that the shipped card has the bytes and size
   media.json recorded for the `og` shot. Both files are kept in history at `3e138271`; the baseline, REMOVED from the
   tree, is `git show 3e138271:frontend/tests/visual/baseline/menu.png` (REMOVED 2026-10-29).
54. **The night fight is optional, and this shoot has none.** The seam cannot spawn a mob, so `night-fight` waits up to
   90 s at blue hour for the night's own hostiles, turns to the nearest one 4 to 14 m out and casts with the real F key;
   when none comes it is left out and named. The first shoot of the first table staged one (a skitterling 11.2 m out
   after 7 s). Both shoots of the second table found none within 14 m (the nearest 32 to 63 m). The fight is the first
   of the night shots, so their own clears come after it, but the golden-hour poses before it had already cleared the
   hostiles within 60 m of their cameras, a radius that takes in the Hearth; that this is why none came is the likely
   reading, not a measurement (no run has shot the fight before the poses). The old frame, from another build, is
   deleted rather than kept beside this run's. It stands while it earns its place.
55. **The lookbook's page helpers are shared** (`frontend/scripts/visual/_lookbookPage.mjs`): launching a Chromium that
   gives the game a hardware renderer, entering play and reading the seam, moved out of `lookbook.mjs` unchanged in body.
   The media are shot through the lookbook's own path, not a second one, at the same four times, which the light script
   names (`frontend/src/render/colourScript.js` `LOOK_TIMES`) and both read. A golden hour outside the window the gate
   pins fails (`media-plan-gates`): the setting branch between the sunset key and the day key, nearer the sunset key,
   which is cycle fractions from about 0.4557 (halfway to the day key, s = 0.275) to 0.4841 (the sunset key at
   s = 0.10 is f = 0.5 - asin(0.10)/2pi = 0.4841), both ends excluded; 0.48 sits inside it. The afternoon (0.30) sits
   between the same two keys at the day key, so the bracket alone does not tell the two names apart. It stands while it
   earns its place.
56. **Any mob within 3 m of the camera refuses a frame, a passive animal and a named NPC too, and a mob feed that
   cannot be the world's refuses it as COULD NOT CHECK.** The first shoot passed all nine shots with an ox at arm's
   length in the blue-hour still, because the seam counted hostiles only. The verdict reads every live mob from the ECS
   through the seam's read-only `mobs()` (`frontend/src/render/lookbookSeam.js` `mobList`), not the store's minimap
   mirror, which the HUD lane removes, and it holds every kind of shot to the rule, the poses included. The Hearth's
   four named NPCs cannot be hurt and are always in the world, so a list missing any of them is a dead feed
   (`mobFeed`): the frame fails as COULD NOT CHECK and the run exits 3, never "no mob near". The night fight's target
   search reads the same feed (`fightTarget`), and a search that could not read it leaves the fight COULD NOT CHECK in
   the verdict itself (`mediaShotVerdict` `search`). A pose clears the hostiles within 60 m of its camera
   (`POSE_CLEAR_M`), since from above they show as specks. The clear runs once, before the seam's `play()` and the
   frame's 1.2 s settle, so a hostile that spawns or walks in after it can be in the frame: forest-edge's entry records
   a skeleton 45.2 m from the camera. It stands while it earns its place.
57. **The GitHub social preview is Kevin's one upload.** GitHub has no API for it; `docs/media/social-preview.jpg`
   (1280x640) waits in the repo, and its registry row closes when `usesCustomOpenGraphImage` reads true.
59. **`media.mjs` builds the bundle it shoots, and stamps a commit only on that bundle.** The first version stamped HEAD
   with `dirty: false` on whatever `build/` held, so a stale build was recorded as HEAD. Now the run refuses a tree
   dirty outside its own outputs, builds the production bundle itself into a scratch folder, serves that folder, and
   records per file the commit, the index chunk, the bundle's content identity and the file's own sha256. The identity
   (`buildIdentity`) is a sha256 over every file the bundle serves but the run's own outputs (`BUNDLE_OUTPUTS`): the og
   card, which vite copies from `frontend/public` into the bundle, is written by the run, exempt from the tree check and
   drawn in no frame, so a bundle built from the stamped commit names the same identity whichever card the tree held.
   The tree check reads both sides of a rename (`R  old -> new`), so a file renamed out of the source counts even when
   its new path is an output. `runProvenance` decides the stamp: HEAD only when the tree was clean and
   HEAD held still through the build; a bundle handed in with `--build-dir` (for trying a recipe) is stamped with no
   sha and an unknown tree. `mediaProblems` refuses any file without that provenance, and holds each file to the table
   as well as to media.json: its format, byte target, purpose and time, and its sha256, with every file under
   `docs/media` counted, dotfiles too. It stands while it earns its place.

**What was shot:** every committed frame comes from one run of `media.mjs`, 2026-10-29 10:55-11:00Z, on the bundle it
built from `073a8f0d` (index chunk `index-C8iDePj3.js`, build identity `b63642a016b0d648...`), Chromium in its new
headless mode on ANGLE-Metal (Apple M3 Max), tier high, dpr 1.62 to 1.75, under the lane's GPU lock with the 1-minute
load at 4.6 at the start and 5.9 at the end. The run before it, on `0f0ce44b`, was rejected by item 50's rules: the
watchtower's roof cut by the bottom edge of the hero and the social preview, the forge cut under the og card's
subtitle, a slab at the foot of golden-forest, and no fight. Item 50, judged on the six frames of the second run: the
hero, the og card and the social preview look across the Hearth from above, into the low sun or under blue hour;
golden-forest and blue-hour keep the hands, the sun or the brazier at their centre; forest-edge is the lookbook's place
in a clear afternoon. Accepted with these residuals named: the healer's cabin is cut at the hero's right edge, the
watchtower's roof tip shows at the bottom centre of the hero, the og card and the social preview (a few pixels), the og
card's subtitle crosses Bram's stall, and the Hearth's two leaf planters read as small flat green tiles on the pad in
the three poses (item 50). Six files: JPEG quality 88 to 96 under the targets, the og card at 256 colours, 282,950
bytes; `docs/media` is 1,204,138 bytes of its 3,000,000. The coast and snow-terrace stills are dropped: both read as a
flat band of haze over the top third in either light.

**The build identity was recomputed after the run, not written by it.** The run recorded `0ca68d7c...`, a hash over
every file it served, the og card included; the card in `frontend/public` then was the rejected run's, left there
because the tree check exempts the run's outputs, so that identity named no bundle a build of `073a8f0d` gives. With
the run's outputs left out (item 59), the bundle the run served, kept in the session scratch folder, hashes to
`b63642a016b0d6480438247b3e27ffaecf63ca7ca5754d4f4be12c869d97029e`, and so does a fresh `vite build` of
`git archive 073a8f0d`: 28 files each, identical but for `og-image.png`. media.json's six `buildId` fields carry that
value; no frame was re-shot.

**Door:** two-way; the deleted files are in git history, and a re-shoot is one command
(`node frontend/scripts/visual/media.mjs --only <names>`) on a clean tree and a fresh build.

## 2026-10-29 — [LOOP] W2-F step 5: Mara's Forge replaces the crafting grid

**Decided by the W2-F Forge lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H items 7 and 8
by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-forge.md`. Numbered from 60 (41-49 are the talents
lane's, 50-59 the media lane's). Item 64 amends W1-H item 7's list of three offers. Each stands while it earns its place.

60. **The Forge is one card on Mara, on G** (`frontend/src/game/forge.js`, `frontend/src/ui/panels/ForgePanel.jsx`). It
   lists what she can make for the player now: the weapon line's next blade, the worn relic's next tier, and three
   goods, each price in mined blocks and coins beside what the player holds, a short part marked. `buy` charges the
   price listed under the offer's id (never one carried on the object passed in) or refuses and returns the same
   state; a relic tier bought or outgrown, and a blade held in hand or in a bag, is no longer listed, so it cannot be
   bought twice (a blade stored in a chest is not read: registry `REVIEW:w2f:forge-chest-blade-resold`; the goods stay
   listed, to be bought as often as the player pays). A press the player cannot pay for stays pressable and says what
   is short ("Not enough: 80 coins (have 0)"), so the button is never dead. **Why:** one place that shows every price,
   in place of recipe shapes nobody can see (W1-H item 7).
61. **Starting prices** (`forge.js`): Stone Sword 4 stone and 10 coins, Iron Sword 4 iron and 30, Diamond Sword 4
   diamond and 80; a relic's tier II 3 gold and 40, tier III 3 diamond and 100. A fresh profile's 4 iron pays the Iron
   Sword's blocks, so its first reforge waits only on coins (a night survived pays 10 a night number, a quest 0.4 a
   point of XP). Untested by play: registry `REVIEW:w2f:forge-prices-unplaytested`.
62. **The weapon line reforges the best blade held** (`WEAPON_LINE`: sword 10, Stone Sword 12, Iron Sword 20, Diamond
   Sword 35, damage unchanged in `frontend/src/game/equipment.js`), in hand or in any bag, into the next one: the price
   names that blade and the purchase takes it, adds the next and puts it in hand (what the hand held before goes back
   to the bag). A player with no blade is sold the sword for 4 wood. **Why:** an upgrade, not a second sword in the bag,
   and the hand always ends above every blade held in hand or in a bag (one stored in a chest is not counted: registry
   `REVIEW:w2f:forge-chest-blade-resold`), so the purchase is never a sidegrade. The pickaxe (damage 8, below the
   sword every profile holds) leaves the game: the registry, the weapon slot, the loadout, the held model.
63. **The relic line tempers the worn relic** to tier II and III (`RELIC_MAX_TIER` 3, `frontend/src/game/relics.js`):
   its modifier counts once per tier in `foldVerbMods`, so a tier-III Ember Fang adds 12 s to the roar. The tier
   belongs to the relic, not the slot (`relicTiers`, a persisted progression field and an autosave trigger), so a
   relic swapped out keeps it. A top-tier Lodestone gives a grab five throws, so the hurl pool's bound, derived in
   `hurl.test.js` from the trees and the relics at their top tier, rises and `MAX_FLIGHTS` goes from 6 to 10 (idle
   meshes are hidden). Ember's prices and the talents' numbers do not move. The inventory's inspector reads a relic's
   change at its own tier, and the temper offer says what the next tier does (`frontend/src/ui/relicText.js`, from
   `foldVerbMods`, through the locale), so a tempered relic never reads as tier I.
64. **Goods, and what the grid made that nothing replaces.** The grid was the only source of the storage chest and of
   cobblestone and the renewable one of glass, and the hotbar gate (every hotbar block obtainable) went red without
   them, so the card sells them at the grid's rates and no coins: a Wooden Chest for 8 wood, 4 cobblestone for 4 stone,
   4 glass for 4 sand. This adds a third line to W1-H item 7's list and leaves its lantern for item 67. Cut with no
   successor: every shield and most armour (the grid made them; two quests still give an Iron Helmet, Miner, and an
   Iron Chestplate, Pilgrimage, `frontend/src/QuestSystem.jsx`; the Golden Crown stays chest loot; registry
   `REVIEW:w2f:forge-armour-no-source`), the Health Potion recipe
   (the merchant and chest loot still give potions), cooked meat (step 6 deletes meat), and the ingredient uses of
   Leather, Iron Nugget, Spider Eye and Emerald (registry `REVIEW:w2f:forge-orphan-loot`). **The proof nothing still
   promised depends on the grid:** the hotbar gate now walks each good's price down to the starting loadout or an ore
   drop (`tests/gates/place-executor-gates.test.jsx`), `tests/gates/forge-output-gates.test.js` buys every offer the
   Forge can list and checks it gives a thing the game uses, the full unit suite was green with the grid deleted (557
   files, 4825 tests), and `tests/e2e/forge.spec.js` walks to Mara and buys on CI.
65. **Talking is one verb** (`frontend/src/input/talk.js`): G and the touch tray's Talk button (in the Craft button's
   place) find the nearest living villager within 4 m in the ECS (`mobsQuery`), not the store's 250 ms mirror, and
   route by role as before, the smith now to the Forge; with no villager and no chest in reach a notice says so. The
   tray yields control only when talking opened a panel. Touch had no way to talk to a villager before. The C key and
   the HUD rail's hammer go, the controls panel and the README teach G, and `showCrafting` becomes `showForge`.
66. **Old saves:** a pickaxe in any bag or chest is dropped (`pickaxe` joins `RETIRED_INVENTORY_KEYS`, so it rides the
   tombstone back for one SAVE_VERSION), and one in hand becomes the sword (`saveSchema.js` `liveEquipment`), so no
   hand gets weaker (8 to 10). **Dropped, not credited:** every profile holds one beside a better sword, so a credit
   would be a free tier for everyone. The grid kept no saved state (its escrow lived in React state and went back to the
   bag on close and on pagehide), so nothing else needs a rule. The pre-cut fixture loads at level 5 with its Stone
   Sword in hand and no pickaxe (`tests/store/forge.test.js`).
67. **No lantern offer yet.** Block id 16 does not exist (`frontend/src/world/blockIds.js` ends at 15), and the Forge
   sells nothing that does nothing; W3-A adds the offer with the block, at the lantern brief's price, in the same
   release (registry `MASTERPIECE:the-lantern-and-a-baked/a`).
68. **Not proven, and owed:** the prices' feel (no playtest); the card on touch outside jsdom and on an iPad
   (`REVIEW:w2f:forge-touch-unproven`); the e2e's browser mutants (`REVIEW:w2f:forge-e2e-mutants-unrun`); the relic line
   and the goods in a browser (proven at the store and the card in jsdom); whether a five-throw grab is too strong.
69. **A double press buys one thing** (`ForgePanel.jsx` `BUY_REPEAT_MS`; review of PR #47). A bought blade or relic
   tier is replaced in place by the line's next offer, so the second click of a double press bought that too. After a
   purchase the row's Buy rests for 500 ms, disabled where the player sees it: the two clicks of a double press fall
   inside the system's double-click time, 500 ms by default on Windows (`SetDoubleClickTime`, learn.microsoft.com),
   and no longer a rest leaves repeat purchases of goods unhurried. Each row is keyed by its offer, so a bought tier's
   button leaves the card and a button that held focus cannot buy what replaced it; a pointer press does not focus Buy,
   so Space or Enter pressed for the game cannot fire the last Buy clicked. Keyboard focus does not reach a Buy in the
   game: `InputManager.jsx` catches Tab on the window while a panel is open and closes the Forge. The gate shows a
   focused Buy keeps its keys if a later build lets focus reach it. Proven in jsdom
   (`tests/gates/forge-panel-gates.test.jsx`); a real browser's double click is not.

## 2026-10-29 — [LOOP] W2-F step 4: talents that change verbs, loot relics, and damage from level

**Decided by the W2-F talents lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 6 by
the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-talents.md`. Numbered on from W2-E's entry (the hands,
PR #43, which landed first; its last is 40). Each stands while it earns its place.

41. **Damage, health and mana scale with level alone.** The player's own strength, agility and intellect are 10 each at
   level 1 and gain +2, +1 and +2 a level (`frontend/src/game/progression.js` `levelAttributes`): the five points a level
   paid, placed by rule. Gear folds on top; no talent adds a stat; the solvers and `deriveMaxStats` are unchanged. **The
   band, stated before the change** (`frontend/tests/game/levelDamage.test.js`): at level 1 every attack deals what it
   dealt; at 5, 10 and 20 each attack's expected damage sits between today's unspent and focused builds and within 10%
   of the even build (five points a level shared three ways). Measured: +1% to +8% over even (spells +1% to +4%, melee
   +3% to +8%), every hostile's hits to kill between the two bounds; the level's own stats are pinned as literals beside
   the band, which is wide enough to hold a split with no agility growth. **Why:** with allocation gone, a level must
   still be worth its old five points, and the even build is the one a player who spread points had. **What the band
   leaves out:** its builds hold no talent ranks, and before the Cut 20 of the 26 talent nodes added a stat. A level-10
   player with the even build and nine points in intellect nodes (Elemental Focus 3, Cataclysm 2, Conflux, Soul Bond 3:
   +35) cast a non-crit Fireball III for 264; that level casts 187 now (-29%). The four armour nodes (up to 59 armour,
   which takes armor / (armor + 100) off a hit) have no successor, and armour is outside the band. Whether a stat build
   is owed anything is registry `REVIEW:w2f:talents-stat-build-loss`.
42. **Spells scale with level:** a spell casts at the tier its caster's level reached (`frontend/src/game/spellTiers.js`:
   II at level 2 for fireball and iceball, 3 for lightning and arcane, III at 5), the levels the free mastery click
   allowed, with the same damage and mana table. No player loses a tier the click would have bought.
43. **The refund rule for a save from before the Cut**, recorded once as `talents.cut` (`frontend/src/game/saveSchema.js`):
   a save whose progression holds `attributes` gets floor(P / 5) talent points, P being its unspent attribute points
   plus every point it allocated, and every talent rank back as a point, since every node's meaning changed. The pre-cut
   fixture loads at level 5 with 8 points (20 / 5 = 4, plus 3 unspent and 1 rank) and no ranks; a post-Cut save is never
   respecced. **Why five to one:** a level paid five attribute points beside its talent point, so a normal save converts
   to one point per level gained; the stats those points bought now come from the level, so the player gets both back.
   **Doors:** `attributes` and `spellLevels` ride the progression tombstone, and `crystals` and `wand` a new `blocks`
   bag written back under the live inventory, each for one SAVE_VERSION.
44. **The trees** (`frontend/src/game/talentTree.js`): each root unlocks its verb and needs no prerequisite (a level-2
   player can take one); every other node is one modifier in `frontend/src/game/verbMods.js`'s vocabulary. Wildheart:
   Primal Endurance (+3 s roar, 3 ranks), then Apex Predator (the form's swing +25%) or Untamed (+8 s). Voidhand: Twin
   Grasp (a grab holds two blocks), Long Hold (+4 s, 2 ranks), then Singularity (slam +1.5 m) or Event Horizon (+8 s
   hold). Soulbind: Wide Snare (the aim cone doubles), Pack Warden (+1 slot), then Communion (binds at half health) or
   Warden Bulwark (+1 slot). Elemancer: Chain Imbue (the zone leaps to one more hostile within 8 m, 2 ranks), then
   Conflux (zones 50% wider) or Wildfire (+2 leaps). Exclusivity and respec keep their code; a loaded rank whose node is
   gone, over its limit, behind a missing prerequisite, or beside its rival comes back as a point. Ember's prices do not
   move. A kept grab's next block goes on the next click, hurl or slam, beside the first in the air (item 48).
45. **Relics:** one slot (`equipment.relic`, through the existing equip actions), four relics in the same vocabulary
   (`frontend/src/game/relics.js`): Ember Fang (+4 s roar) from emberhusks and duskhounds, Lodestone (+1 grab throw) from
   moss brutes, Snare Knot (the snare cone doubles) from spiders and skitterlings, Prism Shard (+1 leap) from skeletons,
   each at 4-6%, `epic`, so the zone tier raises them far from spawn. A relic and a talent on one key add up.
46. **Crystals and the wand go whole,** with the wand's mana discount, the four ore-to-crystal trades, the wand trade, the
   starting 8 crystals and wand, and the Magic Crystal recipe row (so a level-1 Fireball costs 15 mana, which was 14
   with the starting wand's 6%). The merchant sells potions for coins; mined blocks wait for the Forge (W1-H item 7).
   `affixes.js` went with them (no importer).
47. **Not proven, and owed.** The feel of the trees and the relic drop rates (no playtest); the Talents page fitting one
   screen; the grab's second throw, the wider snare, the chained imbue, Apex Predator, the slam radius and the relics in
   the running game (proven at their reducers and pure helpers, not by a browser); the e2e's browser mutants; WebKit and
   touch for the Talents page. Each has a registry row.
48. **Review round 1 changed four rules** (each fix commit carries its mutation receipt):
   - **The hurl system flies up to six blocks at once** (`frontend/src/game/hurl.js` `MAX_FLIGHTS`, `flightSlot`;
     `frontend/src/world/HurlSystem.jsx`). This replaces item 44's first version, in which a kept block waited out the
     first throw's 1.5 s flight: that wait also blocked a slam, which never flies, ate the click with no cue, and ran on
     R3F's clock while the flight runs on `worldDelta`, so a pause or a hitstop let the second throw replace the first
     anyway. Six holds two grabs of three blocks inside one flight (`frontend/src/game/hurl.test.js` derives it from the
     trees and relics); a full pool gives up the block flying longest. **Why:** the wait was a workaround for a single
     flight, and the single flight was the cause.
   - **A verb reads its numbers every tick.** The roar's length and the grab's throws and hold are compared against
     `getVerbMods()` as it stands on each frame (`beastTransform.js` `activeSince`, `voidhand.js` `heldSince` and
     `thrown`), as the imbue's chain, the snare and the squad cap already were. **Why:** latched at a verb's start, a
     number outlived its relic: roar with Ember Fang, swap to Lodestone mid-form, grab, and one slot gave both.
   - **The retired crystals and wand leave every bag and every chest** on load, held per bag and per chest
     (`frontend/src/game/saveSchema.js` `liveInventory`, `liveChests`), so no chest can hand one back to the bag.
   - **A saved talent map and a saved spell name are untrusted keys:** the node table has no prototype and
     `spellStatsAt` answers only its own keys, so `constructor` refunds as an unknown id and casts nothing.
49. **Review round 2 changed five rules** (each fix commit carries its mutation receipt):
   - **A block kept after a throw lasts only while the build gives it** (`frontend/src/game/voidhand.js`): when the
     relic or rank that gave a grab its extra throw leaves, the kept block drops on the next tick, before any click can
     launch it. This finishes item 48's second rule, which held for the roar and for a swap before the first throw.
   - **A chain's leap lands only on a hostile no zone of its element covers** (`frontend/src/game/elementZones.js`
     `spawnChain`, which replaces `chainTargets` and its fixed 2 m floor): outside the impact's width as painted and
     outside every zone of the element, the chain's own leaps included. **And one element ticks a body once:**
     `applyZoneEffects` acts on membership for every kind, as it already did for frozen, so overlapping zones of one
     element no longer stack their damage. **Why:** the 2 m floor sat inside every zone's 2.5-3 m radius, so a hostile
     beside the impact got a second zone and twice the ticks; a leap is there to spread the element, not to multiply it
     on one body, which is what "same kind nearby refreshes" already says for a re-imbue. A widened zone also meets its
     neighbours (steam, a rune) at the size it is drawn, and a wider re-imbue widens the zone it refreshes.
   - **Every save this build loads or makes records the Cut's refund as run** (`talents.cut`, `saveSchema.js`
     `TALENT_CUT`): a post-Cut save is recorded too, and a store that has loaded nothing starts with the record. A
     pre-Cut build writes `attributes` into every save it touches, so without this a rollback and a roll forward
     respecced a post-Cut build and paid the refund on top; item 43's "a post-Cut save is never respecced" now holds
     through a rollback. The refund's notice counts the points after the load's other grants, and is not raised with
     nothing to spend.
   - **Every load ends a held grab** (`useGameStore.jsx` `loadWorldData`), as a respec and a death do: the grab's held
     branch reads no talent, so a block carried into a build without the grab was thrown by a verb the player lacked.
   - **The load refund is the unlock rule replayed** (`talentTree.js` `refundUnknownTalents` through `canUnlockTalent`),
     so a rule added to the unlock path reaches loaded saves. One outcome moves: a capstone whose own prerequisite is
     missing no longer takes its rival with it. A saved spell name is looked up by the roster's own keys
     (`frontend/src/game/spells.js` `spellTypeOf`), so item 48's `constructor` casts nothing and raises no false "no mana"
     notice.

## 2026-10-29 — [LOOP] W2-J phase 2: one browser library (Playwright), and `import.meta.main` in place of cli-guard

**Decided by the command session** (SOTA reset rows 39 and 37; plan
`docs/superpowers/plans/2026-10-29-crafty-w2j-phase2.md`, which holds the per-probe table). Each stands while it earns
its place.

1. **`puppeteer` is removed as a dependency.** `@playwright/test` is the repo's one browser library: e2e, the lookbook,
   prod-smoke, the perf runner and the probes. The lockfile is the committed one less puppeteer's own 24-package subtree;
   npm 11.6.2 regenerating it from that state changes nothing further about puppeteer (it re-marks peer flags and drops
   two `@emnapi` entries on the unchanged lock too, so those were left out).
2. **prod-smoke keeps every check it made**, on Playwright's Chromium in its new headless mode with SwiftShader, and
   reads each program's link status at first use, so a canvas the page discards (the title diorama, which R3F 9.5
   unmounts with `forceContextLoss()` before disposing it) no longer reads as "no LINK_STATUS" (the flake on run
   40814659930, attempt 1). CI's gates job installs Playwright's Chromium when the pipeline will run prod-smoke.
3. **22 probes are deleted**, with their port rows: each had no caller in a live doc, gate, script or current lane
   plan, and its last real use was between 2026-06-16 and 2026-09-22. Ported, not deleted: `gpu-cost-probe`,
   `pov-probe`, `ocean-probe` (named by current lane plans), `touch-probe` (the reset plan keeps it), `look-e2e`
   (`npm run test:look`, named by `.claude/rules/physics.md`) and `scripts/perf/run-scenarios.mjs` (`npm run perf:m2`,
   now given a port from the allocator instead of e2e's 4179). Every deleted probe is at `1691217b`
   (`git show 1691217b:frontend/scripts/visual/<name>`).
4. **cli-guard is deleted; every script guards its CLI with `if (import.meta.main)`**, and `engines.node` is
   `>=24.2.0 <25` (Node added the flag in 24.2.0; before it the flag is undefined and every guarded CLI would exit 0
   having done nothing). The protection is now `frontend/tests/scripts/cli-entry.test.js`, which imports every
   exporting script in a child process with output, exit, spawn, file writes and fetch trapped, runs a fixture and a
   real gate by path (also through a symlinked directory), and checks the engines floor. It executes the imports, so
   the guards cli-guard accepted while they gated nothing (an always-true guard, a bare `process.argv[1]` test:
   registry STATUS:G-ledger:22) now fail. The pipeline step and the gate-table row go with it, and the generated tables
   are regenerated without it. cli-guard.mjs is at `1691217b`.

**Door:** two-way; the files and the dependency are in git history.

## 2026-10-28 — [LOOP] W2-E: the hands become a viewmodel, and the eye drops to 1.62 m

**Decided by the W2-E lane under the standing grant** (item 14), by the task script
`docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md`, whose metric was written before any frame was shot. The items
continue the numbering after W2-I's (its last is 32). Readings and frames:
`docs/superpowers/masterpiece-2026-10/evidence/w2e/`.

33. **The hands render inside the composer, as a second render pass with its own camera.** `ViewmodelPass`
   (`frontend/src/render/viewmodel.js`) draws the viewmodel scene right after the world's `RenderPass`, before every
   effect (`GameScene.jsx` PostFX). Why inside: the canvas has no MSAA (`antialias: false`, `multisampling={0}`), so
   only SMAA can smooth the gauntlets' edges; the grade and the Neutral tone mapping keep them in the world's colour;
   and bloom carries the ember core, which is what replaces the hand's point light. Drawn after the composer they
   would be aliased, ungraded and untone-mapped (R3F's composer sets `gl.toneMapping = NoToneMapping`). Why a depth
   range and not the depth clear the plan row named: after each pass that sets `needsDepthBlit` the composer copies the
   depth buffer into the texture GodRays tests the sun against (postprocessing 6.39.5 `EffectComposer.render`,
   `GodRaysEffect.update`), and `ViewmodelPass` sets it so that a gauntlet in front of the sun hides it. After a clear
   that copy would hold the hands alone and the sun would shine through every wall; with the hands left out of the
   copy a clear would work, and the sun would show through the hands. The world's `RenderPass` would copy just before
   it, a second full-resolution copy every frame with GodRays mounted; item 40 keeps it to one.
   The viewmodel camera maps its depth into the front 2% of the buffer instead, so the hands are nearer than any world
   surface beyond 0.102 m (the main near plane is 0.1 m) and still test against each other. It has its own fixed 60
   degree FOV (the main camera's moves 75 to 85 with speed), anchors that follow the aspect so both fists stay in
   frame on a portrait iPad, the world's ambient, hemisphere and key light mirrored into view space, a value floor
   (`max(lit, albedo x 0.45)` in the toon shader), and an HDR ember core above Bloom's threshold. The aura sphere, the
   hand's pooled point light and every shadow flag on the hands are gone; the wand the right hand holds by default
   draws its wood and tip with the same floor, and its translucent aura sphere, the orange sphere the task script's
   goal named, is gone too (the gem stays). It stands while it earns its place.
   **Measured** (local production build, Chromium on ANGLE-Metal, M3 Max, 1280x800 at dpr 2, the eye at bearing 240;
   hand pixels are what the hands change against a pose twin at the same eye, by more than 24 in some channel, so a
   hand pixel about as dark as the ground behind it, an ink outline on dark turf, is not counted and the readings lean
   high; the margin over the declared floor is twice the floor): at midnight (0.75) the mean luma of the
   hand pixels went from 28.7 to 100.2 and the median from 7 to 106, against the floor declared before shooting (mean
   48, median 40). Warm at every time (red over blue: 2.9 at midnight). At point blank, against a tree trunk with the
   body 0.45 m from it, the hand pixels near/far went from 0.02 (the old hands sank into the trunk) to 1.14, and on the
   build after review to 0.97 (declared at least 0.9; `evidence/w2e/index.md`).
34. **The eye sits 1.62 m over the ground: `EYE_HEIGHT_M` 0.67 over the body's centre, not 1.2** (the question W1-D
   left this lane). The capsule is 1.8 m and its centre rests 0.95 m up, so the old eye stood 2.15 m up, 0.30 m above
   the top of the head: blocks read small, the player looked down on every mob, and in any two-block passage the
   body fits through (1.9 m with the controller's gaps) the eye sat 0.15 m inside the ceiling block. 1.62 m is the
   eye of a 1.8 m figure. The swing's cone apex keeps its height (`SWING_DROP_M` 0.8 to 0.27, so it stays 0.4 m over
   the body's centre) and melee reach is unchanged; the snare's aim and the hurl's launch start at the new eye, which
   is where the player now sees from. `playerPosition` (the camera, rounded) reads the same integer at rest. It
   stands while it earns its place.
35. **REVIEW:w2k:dark-polygon-between-hands was a mesh of the old hands, and it went with them.** Corrected after
   review: the first reading, the old hands' shadow, rested on a frame that was not W2-K's framing, and the textured
   darkening its pose twin removes is not W2-K's polygon. W2-K's polygon, cropped from its own frames
   (`docs/superpowers/masterpiece-2026-10/evidence/w2k/after-turf-wall-*.png`), is flat and untextured, carries an ink
   outline along its top edge, and is the colour of the old slab beside it at each time (dark brown at 0.30, navy at
   0.75): the old hands' toon material and outline, so one of their meshes, not their shadow. Every one of those
   meshes is deleted, and none of the after frames looked at shows a flat dark shape between the gauntlets (the list
   is in `evidence/w2e/index.md`). Not done: a frame at W2-K's exact sight, which today's sight finder no longer picks.
   A moved camera also stops counting as a shadow caster (`render/Atmosphere.jsx`), since the hands were the reason it
   did (e9d49bdf): turning the view no longer re-renders the sun's shadow map.
36. **Mobs keep measuring the player from the eye, so item 34 moves which ledges are refuge, and the new table is
   kept.** The AI worker's reach test compares the camera (`game/mobSenses.js` `mobSensePoint`) with the mob's centre,
   0.5 m over its floor. With the eye at 2.15 m a single step onto a block put a player out of an ordinary mob's 2.5
   m vertical reach, which `mobSenses.js` names as what the reach must not do; at 1.62 m an ordinary mob reaches a
   player one block above its floor and not two, the moss brute (3.2) two and not three, and a mob on a ledge reaches
   a player up to three blocks below it and not four (it was four and not five). So a pillar taller than the player
   still keeps ordinary melee out, a step no longer does, and the brute keeps its longer reach. The other choice was
   to measure from the body plus a fixed 1.2 m and keep the old table, which would have kept the one-step refuge and
   tied the AI to a height the camera no longer has. `tests/gates/mob-senses-gates.test.js` holds the table, driven
   through the real worker from `steadyEye`, so a later change to the eye height or a reach lands there. The point the
   game posts, `mobSensePoint`, is the camera's position, which the gate does not read (`mobSenses.test.js` pins it);
   that it carries the camera's shake, kick and the roar's reveal pose is `REVIEW:w2e:mob-sense-from-camera`. It
   stands while it earns its place.
37. **The swing and the heavy charge keep the fist in frame** (`frontend/src/render/handPose.js`). Their offsets were
   authored in metres for the world camera at 75 degrees on a 16:10 window and played unchanged at the viewmodel's 60,
   so the charged fist left a 16:10 frame by half and an iPad's portrait frame whole, and step 2 and the portrait
   finisher swept it off the edge. Each offset is now the same share of the frame at the viewmodel's FOV and the
   window's aspect, and each gesture is then shrunk as a whole, once per aspect, until the fist's projected box stays 95%
   inside at every step (or as inside as at its rest, on a phone in portrait). The cost is travel where the anchor
   leaves no room: step 2 sweeps right from a fist already right of centre, so it crosses a third of the half-width on
   16:10 and 8% on an iPad in portrait, and the charge keeps 78% of its draw on 16:10 and 22% in portrait; the turns are
   whole everywhere. The other choice, starting step 2 at the left so it can sweep right, would pop the fist at the
   swing's start, since every swing begins at the rest anchor. The held item now carries its own rest pose, so the
   swing no longer zeroes the wand's tilt, and an equipped sword or pickaxe takes the hands' value floor. Gated by
   `tests/gates/hand-pose-gates.test.jsx`. It stands while it earns its place.
38. **The key light on the hands follows the world's shadow, and the storm's flash reaches them.** The hands receive no
   shadow, so `frontend/src/render/ViewmodelLayer.jsx` casts one ray from the eye toward the key light every 0.1 s
   against the world's fixed colliders, out to the loaded square's far corner at the largest render distance (102 m),
   and eases the key on the hands to 0 where it is blocked and back where it is open over 0.12 s: in a cave, under a
   roof or a tree the gauntlets no longer take the full sun. The flash rides the hands' sky light as it rides the
   world's. The world's fill and its pooled point lights (the hearth, spell lights) are not mirrored
   (`REVIEW:w2e:hand-light-fill-and-point-lights`). It stands while it earns its place.
39. **The player's own beast draws none of its boxes within 0.25 m of the first-person eye** (the halo and core spheres are not yet covered: registry `REVIEW:w2e:beast-form-eye-in-head`) (`frontend/src/render/BeastAvatar.jsx`,
   `beastAvatarParts.js` `SELF_CLEARANCE_M`). Item 34's eye sits inside the hawk's and the golem's heads and a hand's
   width from the golem's torso and the dragon's neck; such a part writes neither colour nor depth and still casts its
   shadow, and in the transform-cam's reveal every part draws. The other choice was a beast eye at the old 1.2 m. It was
   not taken: the camera is the AI's sense point, so mobs would read the old refuge table in beast form, and the roar's
   reveal hands back to the human eye, so the camera would pop 0.53 m as it settled. It stands while it earns its place.
40. **One depth copy a frame, no draw of an empty viewmodel scene, and the cone apex set from the body.** With GodRays
   mounted, `oneDepthCopy` (`frontend/src/render/viewmodel.js`, applied each frame by `PostTierDriver`) keeps the
   world's `RenderPass` from copying while the viewmodel pass is enabled and follows it, and lets it copy in any other
   arrangement. `ViewmodelPass` draws nothing while the hands group is empty. `SWING_APEX_OVER_BODY_M` (0.4) replaces
   the drop from the eye that item 34 retuned, so an eye change leaves melee reach alone. And a treasure chest that comes
   or goes marks the sun's shadow due, as nothing did once item 35 stopped the camera counting as a caster. It stands
   while it earns its place.

## 2026-10-28 — [LOOP] W2-J phase 1: a short CLAUDE.md, `npm run orient`, a cursor, and the loop docs retired

**Decided by the command session** (SOTA reset rows 29, 38 and 57, and the orient half of 31; plan
`docs/superpowers/plans/2026-10-28-crafty-w2j-phase1.md`). Each stands while it earns its place.

1. **`CLAUDE.md` is 12,000 bytes or less** (enforced: doc-currency's `size` check) and states each standing directive,
   or names the `.claude/rules/` file that carries it at the moment of use, and each invariant with its enforcer.
   Detail and long rationale live in the path-scoped rule file that loads when its code is touched (new:
   `.claude/rules/game-code.md`; the generated table of every gate moved into `.claude/rules/gates-and-probes.md`, which
   loads when a test or script is edited, and `CLAUDE.md` keeps the tiers in three lines) or in the header of the
   script it explains. Numbers in it are generated or absent.
2. **`npm run orient` is the first read** (`frontend/scripts/dev/orient.mjs`): HEAD, CI on main and HEAD, the live
   Production sha, open PRs, unmerged worktrees, the cursor and the registry's counts, read live. The generated read
   order starts with it and no longer names the charter, the drained holistic review or SOTA-INITIATIVE.
3. **LOOP-CHARTER and LOOP-KERNEL-PROMPT retire**, and `SOTA-KICKOFF-PROMPT.md` is deleted; `SOTA-INITIATIVE.md` moves
   to `docs/superpowers/`. Their rules that still bind moved first (the plan's directive table names each rule's new
   home, or why it was dropped). All three stay reachable at `2fef2f32` on main (`git show 2fef2f32:<old path>`), which
   is the archive the restored archive-over-delete rule asks for.
4. **`memory/ACTIVE_PLAN.md` is a cursor** of 60 lines or fewer: the live task table and the next step. Its history is
   git's; its open items are registry rows, two of them added by hand from the old cursors.
5. **The cold-takeover eval checks the instruction surface after a rewrite** (`frontend/scripts/dev/cold-takeover-eval.mjs`).
   What it measures: whether Sonnet 5.5, with only a copy of the repo, orients (runs `npm run orient` or reads the
   cursor) and answers 14 questions within 15 tool calls without stating an inversion its forbidden patterns name, scored by fixed
   patterns that read each answer's local polarity. A rule inverted in other words can still pass: the scorer reads
   the polarity of named phrasings, not of the concept, and its planted control is worded to match those patterns. Twelve are directives: two live only in `.claude/rules/` files (capture guards, probe
   ports and denominators) and two are rules the first rewrite dropped (recording decisions, what to check before an
   edit and a commit). What it does not measure: whether an agent then acts on a directive, any directive no question
   names, or more than a few samples of a stochastic agent. At `bee75223`: two after-runs PASS (14/14, 5 and 7 tool
   calls, both ran orient); a control with stale lines planted on four questions (three in `CLAUDE.md`, one in
   `game-code.md`) FAILs on exactly those four. The first version's results (10/10 after, 9/10 before) were scored by
   a scorer that passed inverted answers on 9 of 10 questions; they are superseded, not evidence.
6. **Kevin's 2026-10-27 mandate to record every non-routine decision is in `CLAUDE.md` again**, with the charter's
   rules that went with it: a hard delete of a referenced file, a new dependency, an external send he approved and a
   reversal are recorded; a large player-facing deletion also records its lived or e2e proof (also in
   `.claude/rules/game-code.md`); a retired doc stays reachable by a named commit or tag. The rewrite had dropped them,
   and the review of PR #42 found it.
7. **`npm run orient` judges main as GitHub has it** (`git ls-remote`), names any drift of the local `origin/main` and
   `main` from it and of the live Production sha from main, and prints the cursor's task table and Next paragraph.
8. **doc-currency also reads the rule files** (`.claude/rules/*.md`) for dangling paths and § citations, counts a
   `.claude/`, `.github/`, `.githooks/` or `ci/` path as a citation, and checks every citation of a CLAUDE.md heading
   (the file name in backticks, then the heading's opening words in double quotes) against CLAUDE.md's `## ` headings.

**Door:** two-way; every removed file is in git history.

## 2026-10-28 — [LOOP] W2-I: the post passes measured on the GPU's own busy time; N8AO deleted, the rest kept

**Decided by the W2-I lane under the standing grant** (DECISIONS 2026-10-28 item 14), by the rule in
`docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md`, written before the measurement and amended twice before the
runs it decides on. The items continue the numbering after the material-grammar entry below (its last is 27), so
"DECISIONS 2026-10-28 item 29" names one item. Readings: `docs/superpowers/masterpiece-2026-10/evidence/w2i/`. Why the lane exists:
Kevin heard his M3 Max run hot on the live site; #24 cut the pixels, this cuts GPU work per frame.

28. **What a pass costs is read from the GPU's own busy time, not from timer queries.** The per-pass timer segments
   summed to 55-63 ms per frame at 60 frames a second, and the whole-frame query (one query per composer.render, opened
   after a sync) read more than the synced wall clock that brackets it in 214 of 240 windows: neither is GPU execution
   time on ANGLE-Metal. The decision instrument is U, the driver's "Device Utilization %" (`ioreg`, no root) times the
   frame interval, in a free-running window, admitted at each time by an all-post control that moved it by 4.6 to 10.3
   ms. The GPU sat at one of two busy levels (about 45% and 87% at the same 60 frames a second), switching every tens of
   seconds, so the windowed run (5 interleaved repetitions of 5 s pairs) under-reads a pass whose pair straddles a
   switch; a fast alternation (the pass off and on every 1.5 s, 18 pairs per arm and time) reads inside one level and,
   by the rule, can only block a deletion. Both stay in the lookbook (`--passes`, `--alt`) for the next pass question.
29. **N8AO is deleted.** U, windowed: 0.32 ms at noon and golden hour (4%), **2.31 ms at midnight (26% of the frame,
   5 of 5 positive)**, material by the rule; the alternation does not block it: 3.41 ms at noon (29%), 3.67 at golden
   hour (25%), 2.58 at midnight (24%), every one of 18 pairs positive each time. The look loss is small: a slight
   darkening under the leaf canopy at noon and golden hour, nothing at midnight, and the mesher's baked vertex AO still
   darkens every block corner. No ink-edge pass replaces it. The r3f chunk loses 141,581 B (829,540 to 687,959 B, 77 KB
   gzipped) and its budget ceiling falls by that, 900,000 to 760,000 B; `n8ao` leaves `package.json` (it stays installed
   as `@react-three/postprocessing`'s own dependency). Two gates keep it out: `scripts/ci/bundle-budget.mjs` fails on
   either of two strings only n8ao's code carries in any chunk, and `scripts/ci/prod-smoke.mjs` fails when the chain the
   production build renders has a pass of N8AO's shape (`chainVerdict`, `CHAIN_ABSENT`). Door: two-way; restoring it is
   one dependency and one element in `GameScene.jsx`, with the ceiling raised back in its own commit.
30. **GodRays and the Sun billboard stay.** U, windowed: 0.17, -0.48 and 0.14 ms (2 to 3 of 5 positive: the busy-level
   switches); not material. The alternation reads 1.33 ms at noon and golden hour, 9% of the frame, under the 10% line,
   and it can only block. The look loss would be large: at golden hour, facing the sun, the sun disc and its warm glow
   are the frame, and without them the sky has no sun and the scene reads as flat overcast. At noon facing the sun the
   shafts wash the upper half of the frame (the lodge roof pale pink-beige instead of maroon), a look note for the light
   and colour lane, not a deletion under this rule. It is the largest remaining pass and the first candidate when
   steady-cool's pixel budgets rise toward dpr 2. **No dynamic import:** `GodRaysEffect` lives in postprocessing's single
   module in the r3f chunk, which boot loads for the composer, Bloom and SMAA anyway, and GameScene already builds the
   effect only when a tier first needs it, so a dynamic import would move nothing off the boot path.
31. **Bloom, SMAA, tone mapping, the grade and the vignette stay.** U, windowed, largest of the three times: Bloom 1.19
   ms (8.1%), SMAA 0.88 (6.6%), tone mapping 0.12, the grade 0.15, the vignette 0.12; none material. The alternation
   reads Bloom 1.17 ms (8%) and SMAA 0.67 to 0.75 (5%).
32. **Not proven, and owed.** Watts: `scripts/dev/power-ab.sh` needs root and stays Kevin's optional row; the GPU-time
   saving is measured, the temperature and fan change are not. The iPad: WebKit was not measured (no timer extension,
   and utilization was read only for Chromium), though `low` never ran N8AO. Other machines, and which busy level a
   player's Mac settles at. Steady-cool's budgets rising toward dpr 2 with the freed time is #24's follow-up, not done
   here. Rapier lazy behind the title (plan row 28) has its own open registry row (`PLAN:sota-reset:28`).

## 2026-10-28 — [LOOP] One material grammar: clustered tones, and top, side and bottom faces (lane W2-K)

**Decided by the command session's W2-K lane** under items 14 and 16 of the 2026-10-28 landing entry, building Units
0-2 of `docs/superpowers/plans/2026-10-27-crafty-material-grammar.md` as its 2026-10-28 amendment scopes them (plan
row 44 of the SOTA reset). Numbered on from that entry's last item. Each stands while it earns its place.

25. **The block textures speak a tone grammar** (`frontend/src/world/proceduralTextures.js`). The bold-flat texture
   look (solid fills, NEAREST up close, no PBR or normal maps) now reads: each material is two to four
   solid tones (`MATERIAL_TONES`), painted in clustered shapes from value noise on a lattice whose cells divide the
   32-texel tile, never per-texel static. **Why:** every layer was per-texel noise (22 to 170 distinct colours, a
   texel sharing its neighbour's colour 1-11% of the time), which reads as static up close and, before the mipmaps,
   crawled at distance; the leaves' 15% near-black "holes" read as mould. **Value held:** each layer keeps its linear
   mean within 15% in luminance and 0.03 in chromaticity of a reference frozen before the repaint
   (`frontend/tests/world/material-before-2026-10-28.json`); measured, every layer is within 5.5% in luminance and 0.012 in chromaticity. The far field,
   the biome tint, the grass blades' match to their turf, the ore glow and the light rig keep their inputs, so the
   light and colour lane's tuning stands. The tones are shaded by rank, not by threshold, so a layer's mean is set by
   its shares. Stone stays grey (`r = g`, `b - r <= 3`) under the ore glow's chroma edge, and the ore tiles' matrix
   is stone without its cracks. **Gates:** `frontend/tests/gates/material-grammar-gates.test.js` (declared tones,
   clustering, seams, the frozen means, no texel under 0.35 of its layer's mean but a nugget, stone never glowing).
   **Cost:** no GPU change (same array, same fetch); the index chunk grew 1,059 B. Mutations are in the commit's
   trailers.
26. **A block's top, sides and underside may show different tiles** (`frontend/src/world/materialGrammar.js`). Grass
   sides show a turf lip over dirt (`grass_side`), snow sides a snow lip over stone (`snow_side`), trunk sides bark
   (`wood_side`) while a cut top keeps its rings; the underside of turf is dirt and of snow is stone. The lip is
   painted in the tile's top six rows (`LIP_TEXELS`), running one or two rows lower in about a third of the columns,
   and the mesher now runs `v` up world Y on every side face (it ran `u` up the wall on X faces), so each block of a
   stacked wall shows its own lip. **Why:** grass hills read as green cliffs with no soil under the turf, and every
   trunk side showed end-grain bullseyes. **How it is chosen:** the terrain's vertex stage takes the face's role from
   its normal and reads the layer from a const table generated from the same `Uint8Array` the node gates read; the
   fragment stage samples that layer, and the biome tint, the ore glow and the leaf feel still key on the block type.
   **Cost:** about five ALU per vertex and one flat varying, no extra texture fetch; the array is 19 layers (103,740 B
   with its chain on the GPU, +16,380); the mesher's time is unchanged (64 real chunks, median ratio 0.999); the index
   chunk grew 2,427 B more (3,486 B for items 25 and 26 together). **Gates:** `material-grammar-gates` (the table
   against literals, the generated GLSL read back as JavaScript for every block and axis normal, the derivation for a
   new id, the variants made of their parents, bark's vertical grain) and `mesher-geometry-gates` (every normal's
   role; `v` rising 1:1 with world Y from a whole block height on all four side directions). **Not proven here:**
   WebKit (iPad). The look on Chromium is in the plan's record, on eye-level lookbook frames.
27. **The face layer is derived in the terrain's vertex stage, never baked into the mesh, and the array's depth is
   derived.** `colors.b` stays unwritten, for the block-light level a later light field writes there (the lantern
   plan, `docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md`, and its brief,
   `docs/superpowers/plans/2026-10-28-crafty-brief-lantern-costed.md`); a gate fails if the generated GLSL reads it.
   The texture array is the block id space plus the face variants (`TEXTURE_LAYER_COUNT`), with the variants above the
   ids, so the lantern's id 16 makes the array 20 deep and moves the variants to 17-19 with no edit to the grammar.
   `frontend/tests/world/proceduralTextures.test.js` held the count at a literal 16; it now asserts the derivation.

## 2026-10-28 — [LOOP] The SOTA reset's standing decisions (W1-H)

**Decided by the command session** under item 14 of the 2026-10-28 landing entry below, from the SOTA reset plan
(`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, lane W1-H). Numbered on their own, so they cannot collide with
that entry's items. Each stands while it earns its place; reversing one takes a new dated entry. The mipmaps decision
(plan row 10) is W1-E's entry, written with its measurement, and is not repeated here.

1. **The capture oracle retires** (plan row 4, lane W2-B). Supersedes "The 31 baselines remain a regression oracle"
   (`docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json:261`) and rule 2 of "How a move counts as done" in
   `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md:26-28`. Why: capture mode turns off weather, mobs, NPCs,
   particles, spawning and the hands, so its frames show a build nobody plays, and shipped source carries 131
   `isCaptureMode()` calls (`rg -c` over `frontend/src`, 2026-10-28) that no player needs. Looks are accepted on the eye-level lookbook (W1-D); DOM-only
   checks use Playwright's `toHaveScreenshot`. No re-baseline is owed meanwhile, so ACTIVE_PLAN task T10 and masterpiece
   Phase 0e are cancelled. `tests/visual/baseline/menu.png` (REMOVED 2026-10-29, W2-H item 53) stays until the media
   pipeline (W2-H) replaces the og-image source.
2. **The umbrella is amended** (plan rows 12, 45-49; section 10). Supersedes the Phase 0-3 structure of the masterpiece plan
   above. (a) A Cut wave (W2-F) removes the sandbox layer before Wave 3 builds, so no lane ports a dead system. (b) The
   platform work (W2-G, W3-D) runs beside the game lanes, not in front of them: the refuter showed the dragon and
   feedback-grammar plans need no ECS rewrite. (c) One HUD lane with one owner (W2-D) takes every HUD change from the
   first-minute plan, the visuals lens and roadmap move 6. (d) Phase 0e and T10 are cancelled (item 1). Phase 3 regroups
   into the First Night (W3-A) and the road of light (W3-B).
3. **Lane briefs plus task scripts of 300 lines or less** (plan row 33). Supersedes Kevin's 2026-06-10 rule that every
   milestone gets a full plan doc before it is built (`CLAUDE.md:248`). Why: the twelve 2026-10-27 lane plans run 771 to
   1,720 lines against code the Cut will change, so their step scripts would be rewritten at lane start anyway. Now an
   unstarted lane carries a brief of one page or less (8 KB) that links to its reset-plan row and states scope, files,
   acceptance and one-way doors. At lane start it writes a task script of 300 lines or less against the code as it is
   then, with red-first steps and the gates it runs. The 2026-10-27 designs stay as reference. Kevin's rule fixed
   building from a spec with no build contract; the brief keeps that and drops the cost. Plan row 29 (W2-J) rewrites
   `CLAUDE.md:248`; until then this entry governs. The first briefs are named in item 9.
4. **One costed build mode** (plan row 19, lane W2-F). Supersedes the builder sandbox in
   `frontend/src/world/placementEconomy.js:6-7` ("CREATIVE mode — the game's default — keeps free placement") and the
   default `gameMode: 'creative'` (`frontend/src/store/useGameStore.jsx:694`). Placing a block spends one mined block in
   every game; the creative/survival toggle and the Mode chip go. Why: free walls make holding a siege no choice, and free
   placement would make build accrual (item 5) farmable. A free-build world may return later as a world type. Door: the
   `gameMode` save field stops being written at the Cut; the tombstone pass-through (plan row 20) carries it one release.
5. **Ember: one meter, and it keeps build accrual** (plan row 21, lane W2-F). Supersedes the four banks, Ferocity, Kinetic,
   Soul and Resonance (`frontend/src/store/useGameStore.jsx:546-561`, `:824-826`), and their four HUD bars. One `ember`
   bar feeds the four spends (roar, grab, snare, imbue). It accrues from day kills and from building, as Resonance does
   today (`frontend/src/game/resonance.js:11`), with a per-day cap. Why: four meters that fill the same way read as one
   meter drawn four times; the choice that matters is the spend. Building stays a source because placement now costs
   blocks (item 4); the cap stops a build-and-break loop. Bank by day, spend by night, stays.
6. **Progression becomes talents that change verbs, plus loot relics** (plan row 22, lane W2-F). Supersedes hand
   attribute allocation (`frontend/src/store/useGameStore.jsx:326-333`, five points a level at `:450-456`), the free
   spell-mastery click (`upgradeSpell`, `frontend/src/world/spellUpgrades.js:90`, REMOVED by W2-F step 4) and the crystal
   wallet with its wand discount (`frontend/src/game/crystalWallet.js`, the 2026-07-14 B3b fix, REMOVED by W2-F step 4). A
   level grants one talent point; a talent changes how a verb plays; relics come from loot; spells scale with level. Why:
   seven axes that each add a number give a player nothing to choose. It needs a damage rebalance first, because
   `solveSpellDamage` reads attributes. `frontend/src/game/affixes.js` (no importer, REMOVED by W2-F step 4) goes with it.
7. **The Forge replaces the crafting grid** (plan row 23, lane W2-F). Supersedes the 3x3 grid
   (`frontend/src/ui/panels/CraftingTable.jsx`, `frontend/src/data/recipes.js`, both REMOVED by W2-F step 5, the C
   key, the touch-tray Craft slot, the pickaxe item) and with it the 2026-07-14 grid fixes (B3a sword patterns, B3d escrow). A Forge card on Mara (G)
   offers three things, each with its cost shown: a weapon upgrade, a relic upgrade and a lantern. Why: hidden recipe
   shapes are guesswork, and a drag grid does not work on iPad. The pickaxe is a weapon stat stick (damage 8), so it
   folds into the weapon line.
8. **The lantern is costed, and the radius rule ships first** (plan row 15). Amends
   `docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md` before block id 16 ships: its grid recipe (1 glass +
   1 coal, Unit 5) and its spawn rule on the baked light field (Unit 6). The lantern is bought at the Forge (item 7), and
   W3-A ships a radius rule: no natural hostile spawn within R of a placed lantern, R starting at 16 m. The light field
   follows as its own lane. Why: a cheap lantern goes everywhere and stops meaning anything, and the radius rule is one
   distance check the siege can build on now, where the light field is a mesher and shader change. Door: block id 16
   enters saves at the first push that lets a player save one, so the radius rule and the Forge price land with the
   block, never after it.
9. **`memory/registry.jsonl` is the one home for open work** (plan row 30). Supersedes the open-work role of STATUS §2,
   its G-ledger and the "Residue: memory/STATUS.md G-ledger" line in ACTIVE_PLAN. The registry holds every open item
   harvested from STATUS §2 and its G-ledger, the ACTIVE_PLAN task list and owed block, the sota-2026-09 QUEUE and
   OPEN-ITEMS files and the masterpiece phase tables. A source item that bundles several fixes is split into one row
   per part (id `key/part`) where a lane closes part of it; some harvested rows (G-ledger 37, 39, 40, OI-47 and two
   E-ter rows) are still bundles, and the lane that closes part of one splits it first, so a merge never closes an
   unbuilt part. Rows follow the plan's schema (`{id, title, playerVisible,
   severity, owner, state, evidence, opened, closedBy}`, plus the harvest key and the plan unit). `evidence` is the
   source line, pinned to the commit on main it was harvested from. `opened` is the date that line was first written
   (`git log -L`), so an item carried into a source when the source was created reads the creation date. A done item
   is closed, never deleted: `closedBy` names the commit that closed it, or the decision or document that did when no
   commit did (a cancellation by decision, a pull request closed unmerged). Kevin owns a row only when it needs his
   device, ear, money, an account sign-in, his explicit OK for an external send, or a decision its source reserves for
   him. Until those sources leave HEAD (plan row 32), `frontend/scripts/ci/registry-harvest.mjs` (run by
   `tests/scripts/registry-harvest.test.js` in every unit run) fails when a source holds an open item with no registry
   row, or yields fewer items than its floor in `frontend/scripts/ci/registry-floors.json`; closing items at the source
   lowers that floor in the same change. `frontend/scripts/ci/registry-append-only.mjs` fails a push, in pre-push and in
   CI, that deletes a row id. New open work goes straight to the registry. The first lane briefs under item 3:
   `docs/superpowers/plans/2026-10-28-crafty-brief-w2b-retire-capture-oracle.md`,
   `docs/superpowers/plans/2026-10-28-crafty-brief-w2d-hud.md`, `docs/superpowers/plans/2026-10-28-crafty-brief-w2f-the-cut.md`,
   `docs/superpowers/plans/2026-10-28-crafty-brief-lantern-costed.md` and
   `docs/superpowers/plans/2026-10-28-crafty-brief-quest-spine.md`.
10. **The three placement-count quests go** (lane W2-F, with item 4). Builder, Architect and World Builder
   (`frontend/src/QuestSystem.jsx`, `QUEST_LIST`: place 20, 100 and 500 blocks) are deleted. Why: under item 4 a placed
   block costs one, but breaking it gives it back (`frontend/src/world/terrain.worker.js:120-130` reports the broken
   block's type; `frontend/src/world/Terrain.jsx:732-742` adds it to the inventory), so placing and breaking one block
   completes all three for 600 XP and 24 wood at no cost. Item 5 caps that loop for ember; a quest counter has no cap.
   Building pays through ember and the siege, and the quest line moves to the spine (the quest-spine brief). Door:
   their ids in saved quest progress ride the tombstone pass-through (plan row 20) for one release.

## 2026-10-28 — [LOOP] Close-quarters combat: the stance, the windup chevrons and the light string (`feat/combat-stance`)

**Decided by the combat-stance lane under the standing grant; the constants an encounter or boss tuner balances
against.** Plan: `docs/superpowers/plans/2026-10-27-crafty-combat-stance.md` (its "Why the numbers are what they are"
section is the derivation). Every value below was printed from the modules on the branch, not copied from the plan.

1. **The stance caps are derived, not typed** (`frontend/src/game/combatStance.js`): retreat **2.0 m/s** (the slowest
   pursuer, the zombie at 3.0, minus a 1.0 m/s closing rate), strafe and advance **6.5 m/s** (the fastest, the
   spider at 6.0, plus 0.5). The clamp acts on the away-from-threat component of the move velocity, whatever key or
   stick produced it. Strafe and advance scale with the form's `moveMult`; all three scale with the walk slows (the
   heavy's charge 0.55, the string's swing slows). A slower pursuer added later reds
   `frontend/tests/gates/stance-roster-gates.test.js`, which names it; the stance itself never refuses a roster at load
   (the module is on App's import chain, so a throw there blanks the game), it holds the retreat at `RETREAT_FLOOR`
   (1.5) and logs the violation.
2. **Engagement**: an aggro'd hostile pursuer within **12 m** whose height difference is within its OWN vertical reach
   (`engageDyM`: 2.5 m, 3.2 for the brute, the 6 m leap for a climber). The height is measured from the point the AI
   worker strikes from (`mobSensePoint`, the eye, in `frontend/src/game/mobSenses.js`), one function for both readers.
   A mob outside its strike reach that makes less than **0.5 m** of its own progress in **1.5 s** stops qualifying
   (the stall release). The stance leaves **2 s** after the last qualifier, blends in over 0.2 s and out over 0.6 s,
   and keeps its threat until another is 1 m nearer.
3. **Exceptions, by name**: the walking moss brute (1.8 m/s) can be backpedalled from on purpose (its threat is the 5.4
   m/s charge), and the skeleton never engages the stance: it kites, and counting it would pin a player walking away
   at the edge of its range.
4. **The boss and the dragon are NOT in the stance**: it scans the ECS mobs, and the boss is not one. A dragon fight with
   no adds keeps the 14 m/s walk. Whether the dragon joins (through its own seam, with a pursuit speed for a flier) is
   the dragon lane's decision (`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md`).
5. **Travel stays Kevin's 14 m/s.** At stance weight 0 the controller's target equals `moveVector`'s exactly.
6. **The combat zoom is accepted as intended**: the existing FOV formula reads the achieved speed, so engaging mid-run
   narrows the view from about 88.5 to about 77.7 degrees. **The by-eye verdict on it is NOT yet taken** (the plan's
   Task 12 dev-session check did not run). If it reads as a jolt, the named fallback is to feed the FOV the pre-clamp
   speed while the stance is engaged.
7. **The night-travel fraction with the stance engaged (refute F1:13) is NOT measured.** It is owed to a dev
   session, together with how many engaged spans ended by the stall rule; a high fraction comes back here as a question,
   never as a silent retune.
8. **The light string** (`frontend/src/game/meleeString.js`): three steps, a **650 ms** window to the next swing, a
   **200 ms** buffer before the 300 ms cooldown ends, a finisher at **1.5x** with a **140 degree** arc and a 2x shove, a
   heavy-tier hitstop and the slam's thump, then **500 ms** of recovery. A dodge keeps an open window alive (the step is
   kept); it never revives a lapsed one. **A thrown heavy ends the string and holds the next light swing 300 ms.** Lost
   input, a beast form and death end it too. The string is the human sword's, not a form's.
9. **The swing slows the walk out of combat too** (0.6 for 120 ms after a light swing, 0.4 for 220 ms after a
   finisher), as the heavy's charge slow already did. It is the milestone's one out-of-combat movement change.
10. **The windup chevrons** (`frontend/src/game/windupChevrons.js`, `frontend/src/ui/WindupChevrons.jsx`): at most 4,
    for hostiles winding up within 12 m and off screen by the camera's projection (so a steep pitch counts), on a frame
    inset 120 px from the top, 96 from the sides, 140 from the bottom on desktop and round(0.11 h) + 170 on touch. The
    layer loads behind a `React.lazy` boundary: in the boot chunk the lane measured +9,024 B against its +9,000 B
    share; lazy, +6,311 B (index 725,739 B on the branch, 34,261 B under the 760,000 B ceiling).

**What is not proven yet, and blocks the merge**: every e2e verdict for the chevrons, the string and the touch proofs
(their headers say `Mutation-Proof: OWED`), the chase sub-assertions at CI's frame rate, and the plan's reviews. Load
above 115 on 14 cores ruled out local runs. The stance's own e2e has local verdicts (Task 5).

## 2026-10-28 — [KEVIN] One CLAUDE.md: the symlink and its directory are gone

**Decided by Kevin, in his words:** "i don't really like how the agents.md symlinks to claude.md in this repo, let's just have one claude.md."

**Supersedes** the layout the file described about itself: the instruction text lived in a directory of its own as AGENTS.md, and the root
`CLAUDE.md` was a symlink to it, so that Antigravity and Gemini could read the same copy.

**What shipped.** `CLAUDE.md` is now a real file at the repo root, with the former AGENTS.md text unchanged apart from its header, its layout block and
the generated blocks (the file's earlier history is under the old path; git cannot pair it with a path that already existed as a link). The
directory is removed; it held nothing else tracked (its two workflow notes were already deleted in `974f9a54`). The three generators (`measure.mjs`,
`gate-table.mjs`, `read-order.mjs`) write into `CLAUDE.md`; `doc-currency` lists it as canonical;
`ci/write-receipt.sh` (itself removed later by item 24) no longer names the removed directory as an input root; the
opsec ledger entry moved with the file.

**Door.** Reversible: a link can be added back in one commit. **What it costs.** A harness that read the old directory (Antigravity, Gemini) no
longer finds the instructions there; none is configured to in this repo.

**Plans and audits dated before this** that say AGENTS.md mean `CLAUDE.md`; they are history and stay as written.

## 2026-10-28 — [LOOP, Kevin-delegated] Landing lifecycle: PRs with free CI, merges by merge commit, six e2e shards; PR #28 parked

**Decided by the command session (Kevin asleep; standing authority).**

1. **Every lane lands through a PR**, because main deploys to the live site on every push and the e2e suite runs
   reliably only in CI (local receipts failed three times on 2026-10-27 on machine load, none on code). Actions are
   free: the repository is public. Kevin asked for the milestone as a PR (#22) for his `/code-review ultra`; the
   pattern is now general.
2. **Merges are local merge commits, never cherry-picks or GitHub squashes** (the repository allows only squash in
   the UI). A cherry-pick on 2026-10-27 left a branch git calls unmerged, deletable only by `git branch -D`, which is
   denied estate-wide; AB's `worktree-reap` (now allowed for this repository only, Kevin 2026-10-27) deletes merged
   branches with `-d`, and Kevin's K55(d) moves stale unmerged ones to `refs/backup/branches/`.
3. **E2E runs in 6 shards** (`17e06ecd`): every shard of #22 hit its 25-minute limit with all finished tests green.
4. **PR #28 is parked as a draft** after two review rounds. It let a docs-only commit borrow CI's e2e verdict from an
   ancestor with the same app identity. Round 1 refuted it (identity ignored ci.yml; a newer red was skipped); round 2
   closed that, and the dynamic review found nothing blocking, but a fail-open mutant (only a commit's newest run
   read) and two pre-existing weaknesses (only each run's latest attempt is read; the base read has no event filter)
   remain. It is a convenience; the landing headroom below allows one PR, which goes to #22. Revisit with a
   fail-closed rule: any push or dispatch run with no verdict on a same-identity commit stops the walk.
5. **Landing is capped by the published operator pages.** `artifact-currency` refuses a push more than 30 commits past
   the pages' publish sha; era-review and sota-audit belong to account 1, which this session (account 2) cannot
   write. Until Kevin's morning answer (ACTIVE_PLAN, "For Kevin" 1), at most one PR lands: #22 first.
6. **Then option (b), taken ~01:30Z while Kevin slept:** the cap had reached every lane (touch-hold's push refused at
   41), so the three page sources were refreshed against measured state (`d00273cd`), read in full before publishing,
   and era-review and sota-audit were published from account 2 at NEW addresses — era-review
   https://claude.ai/artifact/Q1QQLYLxPVYZ8A7Srm1BMF, sota-audit https://claude.ai/artifact/NuwFDNnfZG3gRHv6LH1krr —
   with `.artifact-sync.json` repointed and synced at `d00273cd`. The old account-1 addresses stay in the file as
   `previousUrl`. Reversible: once account 1 is active, republish the same sources there and point back.
7. **E2E moves to 8 shards** (from 6): with the Phase 0 lanes' specs merged, two shards projected to about 20 minutes
   on a first pass with no room for a retry (PR #24 prep). Runner minutes are unchanged and free; wall time per shard falls.
8. **The page cap binds only a push that moves main** (`fix/artifact-currency-scope`, two review rounds). A lane counted
   its OWN commits past the publish sha, which no republish from main could lower, so #24 and then #25 were refused for
   good. Branch pushes now report drift without refusing; a push that moves main (or whose refs are unknown) is still
   refused over 30. A merge made on GitHub runs no hook, so CI checks main's drift on every push to main (full history):
   that is DETECTION after the merge, not prevention. Prevention would need a required check, such as Vercel Deployment
   Checks, which is Kevin's dashboard (T6). Residue goes to `memory/STATUS.md` G-ledger.
9. **A fix that main needs ahead of its lane goes to main by `cherry-pick -x`.** The lightning spec's CI budget was
   committed on `feat/instruments` (a9134e2b), but main was red on the same spec; it went to main as a9a303e9 so main
   could go green before any lane landed. That is not a lane landing: #23 still lands by merge, and git reconciles the
   identical change. Item 2 (merge commits only) governs lanes.
10. **Lanes land in readiness order**, not the fixed 22 -> 24 -> 23 -> 25 queue, once main is green: whichever PR is
   CI-green first lands first. The combat-stance lane (Phase 1) builds on main plus #24 and #25, and lands after both.
11. **Kevin, 2026-10-28 morning: "go with option a for the pages."** Option (a) was: keep the operator pages at their
   ORIGINAL account-1 links and republish them there whenever account 1 is active. It supersedes item 6's move as the
   end state: the account-2 copies (`.artifact-sync.json` `url`) are interim. The session cannot switch accounts, so
   the next time account 1 is the active account, the command session republishes era-review and sota-audit at their
   `previousUrl`, swaps `url` and `previousUrl`, and runs `--sync`. Until then the interim copies stay current, because
   a main push more than 30 commits past their publish point is refused (item 8).
12. **The page cap reports and no longer refuses; the pages state their own age** (supersedes the hard-fail half of the 2026-08-07 artifact-currency decision, 7d30ee27; holistic review wf_16b54287-0f9). Measured: the cap refused 8 pushes, 5 of them correct lane work; it stopped no recorded false claim, and it passed a false "Queued" pill on a page that was at HEAD (41c40c6d). It measures how far the WRITER is behind; Kevin's question in August was whether what he READS is current, which a page answers by printing its own commit and time. After item 8, merging a lane still counted the lane's commits into main's drift, so every landing needed a republish from whichever account owns the pages. Now: drift prints on every push and in CI and refuses nothing; a missing or unusable source, a falsified or undeclared Queued pill, and a missing, duplicated or mismatched as-of stamp still refuse; `--stamp` writes a generated "As of <commit>, <UTC time>" line at the top of each page, naming the commit the page was written against and that commit's time, and `--sync`, run after the publish, records it only when the committed source's stamp names the same commit (it cannot read the published page, so the record is honest only if the stamped source was published first); LOOP-PROGRESS (no URL, no reader) is archived; the Command Record page (`docs/superpowers/command-record.html`) is tracked as a surface. Whether era-review and sota-audit stay living pages or are frozen as dated history is Kevin's call (they are his reading surface); option (a) stands until he says otherwise. This also supersedes items 5, 8 and 11 of this entry where they state the refusal (no push is refused any longer for being more than 30 commits past the pages' publish sha), and under option (a) the Command Record, which the era-review and sota-audit stamps point to, must be readable from the account the pages are published from.
13. **Kevin, 2026-10-28: "agree on your recommendations and changes."** It answers the two calls put to him with
   items 8-12. (a) **ONE page for Kevin: the Command Record.** Kevin, same day: "just maintain one html for
   me to review your achievements/ decisions etc whenever i have time." era-review and sota-audit retire to
   `docs/archive/` as dated history (their last published versions stay readable at their links); no account-1
   republish is owed, so option (a) of item 11 lapses. The Command Record is refreshed at every landing.
   (b) **GitHub required status check on main.** First a CI change: one aggregate job is the only required context
   (required checks match job names, so eight shard names would block main whenever the shard count changes),
   docs-only commits skip the e2e jobs (a skipped check counts as passing), and CI runs on every push to `land/**`.
   Then branch protection through the API: that check required, branches up to date, "do not allow bypassing" on
   (every push here comes from the admin account, which bypasses it otherwise), no force pushes, no deletion. Then
   e2e-freshness's tiers retire in favour of the server-side rule. (c) Kevin applied the narrow allow rules the
   classifier would not let the session grant itself (`git branch -d`, remote deletes of `land/`, `feat/`, `fix/`,
   `gh pr close`, the protection call); `git branch -D` stays denied.
14. **Kevin's overarching principle, 2026-10-28 (standing; it governs every later decision).** Crafty was started in 2025
   by far weaker models and agents, and carries fundamental design, architecture and tech debt and AI slop from them;
   work has accelerated only around Opus 5.5, and later models will go faster still. So **nothing is off limits**: the
   whole game, its architecture and design, every element, visual and idea may be changed, enhanced, deleted or pruned
   as the command session judges best. Full autonomy; Kevin is asked nothing unless absolutely needed. Install any tool
   that helps. Keep the public face (the GitHub repo, and GitHub Pages) beautiful and "ASI-looking cool", and the docs
   in SOTA shape. Consequences: earlier decisions, plans, gates and docs bind only as far as they still earn their place
   on re-reading; a fresh whole-project assessment (2026-10-28) ranks what to delete, rewrite and keep; and the
   harness is shaped so a stronger model can take over cold and move faster (state on disk, small surfaces, generated
   facts, no ceremony that only a weaker model needed).
15. **The public face, tests and comments (Kevin, 2026-10-28: "you decide").** (a) **No GitHub Pages site for now.**
   Kevin meant the repo's own face; the live game on Vercel is the showcase, and a second website is a second surface to
   keep current. The effort goes to the README (a hero clip captured from the real game, a short honest description, how
   to play, the architecture in brief, no emoji markers, no number that can rot unless generated), the About line,
   topics, labels, issue templates and the social preview image. Revisit only if a devlog earns its keep. (b) **Tests
   are in scope like everything else.** Keep a test when it checks behaviour and has shown it can fail on the defect it
   guards; delete or merge tests that pin implementation, source-grep gates and duplicates. (c) **Comments are
   minimal.** A comment says WHY, and only when the code cannot: a non-obvious constraint, an external fact (a library
   quirk with its version and line), a safety or ordering invariant. No history, review narrative, round numbers or
   mutation receipts in code: git and this file hold history, and `Mutation-Proof:` commit trailers hold receipts. So
   the killability-ledger gate, which demands a receipt literal in every check file, retires with the comment pass. The
   pass runs as its own wave after the in-flight lanes land, directory by directory, keeping every load-bearing fact.
16. **Nothing is locked (Kevin, 2026-10-28):** *"when i see things like "Design Language (LOCKED — S1-C)" , remember
   the directive, nothing is locked . you're free to enhance / delete / revise anything."* It restates item 14. The
   live docs still carried labels that read as binding locks to the next agent. They now state the decision, its
   reason, and that it stands only while it earns its place; the command session may enhance, replace or delete it,
   recording the call here. **Rewritten:** `CLAUDE.md` (the design-language heading; the de-monolith,
   `Components.jsx` and engine-core lines, which keep their facts: the Player loop's per-frame order is load-bearing,
   so a split must keep it; the engine core is proven, so a replacement must measure better); `LOOP-CHARTER.md` and
   `LOOP-KERNEL-PROMPT.md` (a recorded decision may be reversed by a new dated entry here; `Components.jsx` was parked,
   not banned; the CUT-gate stays unused as a tool, and deleting a shipped player-facing feature needs an entry here
   with the lived or e2e proof that nothing still promised depends on it, not a KEVIN-REVIEW-BATCH entry first;
   re-baselines, new dependencies, taste and direction calls are the session's); `memory/STATUS.md` (the `[KEVIN]`
   legend, the CUT-gate line, section H, the re-baseline items, the pillar summary); `memory/ARCHITECTURE.md` (the
   Components line); `SOTA-INITIATIVE.md` (its guardrails and process sections); `INDEX.md` (a line near the top on how to
   read old labels, and the UI-system entry); the coherence-pillars spec (a status line; P3); and six 2026-10-27
   plans (coast-water, combat-stance, encounters-siege, first-minute, harness-sota, material-grammar). **Left as written:** dated
   specs and plans before 2026-10-27, archives, reviews and CHANGELOG, which are records (the INDEX line says their
   labels bind nothing); this file's own entries; and what stays Kevin's: his two bright lines (spend no money; never
   force-push or rewrite pushed history, the 2026-10-27 mandate entry) and what only he can do (real-device feel, the
   audio mix by ear, account sign-ins), which is also why S4 stays his. Publishing the repo's public face is the
   session's (item 15). P4's two invariants (no frequent mid-combat re-mesh; input via intent-abstraction, not
   `pointerLockElement`) are engineering constraints, not locks: they bind the session as facts about the iPad-class
   frame budget and input routing, and one may be broken only with a measurement showing that frame budget (or input
   parity) still holds, recorded here. **Guard:** `doc-currency` has a `locks` check. It fails when a canonical doc
   other than this one carries one of six phrasings: `(LOCKED` and `LOCKED —` (capitals; the dash may be em or en),
   `IRREDUCIBLE` (capitals, or "documented irreducible"), and `MUST NOT be split`, `KEEP, don't rewrite` and
   `do not relitigate` (any case). It prints file:line and points here. A line that cites item 16 may quote a label,
   which is how a doc quotes Kevin's directive; any other lock wording passes the check. This file is left out
   because it records and quotes such labels. The PASSED line prints both denominators: the phrasings and the docs.
17. **The killability-ledger gate is retired (command session, 2026-10-28; item 15(c) decided it).** It demanded a
   `Mutation-Proof:` line inside every new check file. Item 15(c) forbids mutation receipts in code, so every new test
   raised its ratchet, and its only green path was a comment the comment pass would delete. The receipt now has one
   home: the `Mutation-Proof:` commit trailer. The `mutation-proof-trailer` gate still demands it on every push, for a
   commit that adds a gate or rewrites a gate's assertions. Removed: the pipeline step, the script, its ledger, its
   test and its row in the gate table. The gate census keeps the population it shared with the ledger and no longer
   scores a receipt inside a file. Neither the old gate nor the trailer gate can check that a receipt is true.
18. **The Wave 1 cuts reach further than the plan first said (command session, 2026-10-28, on game-design grounds).**
   A Settler kill pays 0 XP, banks no Aspect power, earns no kill-quest credit and does not count in `stats.kills`. A
   spell hit on a NEUTRAL mob (a Settler or livestock) pays no per-hit XP. A livestock kill still pays its declared XP,
   so hunting stays rewarded. Spellcaster and Archmage count spells that land on hostiles, once per spell, the Shadow
   Dragon included; a cast, a ground hit or a sky shot counts nothing. One edge is not migrated: an old save that
   finished Spellcaster under the old rule and has not claimed it still pays its 40 XP once.
19. **The homepage is https://crafty-game.vercel.app (command session, 2026-10-28).** The command session added it as
   an alias of the Vercel project the same day; Kevin clicked Add Domain. https://crafty-sand.vercel.app keeps working.
   The play link, the README and the repo's homepage are rendered from `frontend/src/brand.js`.
20. **The block textures are mipmapped, in linear light (command session, lane W1-E, 2026-10-28; plan item #10).** It
   supersedes the "no mipmaps" half of the bold-flat texture lock (`tests/world/proceduralTextures.test.js`,
   2026-06-15, `90c3edf0`) and answers the 2026-09-22 KEVIN-REVIEW-BATCH entry "Distant-terrain mipmaps: one constant,
   your taste call", which items 14 and 16 make the session's call. **Why it was refused:** taste, not a defect.
   The 2026-06-15 gate recorded mipmaps as drift toward "realistic filtering"; `6a33a101` (2026-09-22) built the option
   and fixed the one technical trap, then left it off for Kevin's word. **Each reason, and how it is handled:**
   (a) *the pixel look up close*: magnification stays NEAREST, and minification is NEAREST within a mip level and
   LINEAR between levels. What holds: a face seen head-on keeps level 0's crisp texels out to about 16-28 blocks. What
   does not: the GPU picks the level from the larger of the two screen derivatives, and three r172 applies no
   anisotropy under a NEAREST magnify filter, so ground seen at a low angle from eye height blends toward level 1 from
   about 6-10 blocks out while its texels are still several pixels wide (the meadow grass tops in the evidence crop go
   from speckle to flat colour). The lower figures are at device pixel ratio 1 and the higher at 1.75, estimated from
   the screen geometry (fov 75, eye height) by the two reviews of this lane, not measured per distance. The flattening
   is accepted as the standard voxel trade for no sparkle. A sharper level choice, a negative LOD bias or a shader that
   picks the level from the smaller derivative, is a Wave 2 evaluation, judged on eye-level frames; (b) *a grid line at
   every block edge*: the sampler reads raw `vUv` with REPEAT wrapping (since `6a33a101`), so the UV derivative does not
   jump at block edges; (c) *bleeding between tiles*: this is a texture array, not an atlas, and the chain is built per
   layer; (d) *cutout leaves thinning*: there are none to thin, since the leaf tile is opaque (its "holes" are dark
   texels) and the terrain material has no alpha test; (e) *tone*: the GPU's `generateMipmap` filters the stored bytes,
   which here are sRGB-encoded, and a box filter over those bytes, computed for every tile, darkens at the 1x1 level
   leaves by 4.4%, cobblestone 9.7%, cactus 11.5% and gold ore 17.1% in luminance (grass, dirt, stone, sand, snow and
   water move under 1%). So the chain is built in JS from level 0, in the
   linear light the shader decodes into (pow 2.2), and its 1x1 level equals the far field's per-layer mean, which closes
   the tone step where the near terrain meets the far field. three r172 uploads caller-built levels for an array texture
   only through `CompressedArrayTexture` with `RGBAFormat` (an uncompressed `texSubImage3D` per level), so the texture is
   that class; `image.data` stays level 0 for the far field. (f) *anisotropy*: not available. three r172 skips it while
   magFilter is NEAREST, and a linear magFilter would blur the close-up look; that is why the ground flattening in (a)
   is the remaining ceiling. **Cost:** GPU texture memory 65,536 to 87,360 bytes (+21,824, +33%); the chain builds once
   at boot, about 3.5-4.6 ms for the cold first call and about 0.6 ms warm (node, measured by the repro review at a
   load of 59-77); the index chunk grows 551 bytes. **Frame time:** not established. The walking-clip figures (16.67 ms
   per frame over 1,053 frames before, 16.64 ms over 1,315 after, both at the 60 fps cap) and the scene pass's
   timer-query readings come from two lookbook runs at 14:53-15:00Z, inside the window (about 14:53-15:17Z) in which a
   lookbook port collision between lanes may have served another lane's build, so they are unverified. **Look:** on one
   production page at the player's eye, with only the GPU's minify filter switched, high-frequency energy falls 5-9%
   over the frame against a noise floor of 0.6-2.2%, by 54% on the patch of meadow grass in the evidence crop (seen at a
   grazing angle), and by at most 1.0% in the sky; read back from the GPU, all 87,360 bytes of the chain equal the one
   built in node. That comparison is within one page, so the collision cannot touch it. The crawl in motion is not
   measured: a still frame's energy is not temporal stability, and the before and after walking clips come from the
   unverified lookbook pair. The live acceptance clip on the deployed sha is still owed. Frames, crops, clips and the
   method: `docs/superpowers/masterpiece-2026-10/evidence/mipmaps/index.md`. **Known side effect, not fixed here:** the
   ore-glow mask reads the texel the sampler returns (`oreGlow.js`), and a mipped texel mixes nugget and stone, which
   the mask's smoothstep does not average linearly. Averaged over a face, night glow at the 4x4 level moves iron -61%,
   gold +42%, diamond +80% against level 0, so distant diamond blooms harder at night while distant iron nearly goes
   dark; close up nothing changes. Owner: W2-A (shared-file quick fixes) or the light lane's successor. The likely fix
   is to derive the glow mask from level-0 texels and mip it separately, so the mask is averaged rather than recomputed
   from mixed colour. **Gates:** `tests/world/proceduralTextures.test.js` pins the filters and the full chain;
   `tests/gates/texture-mipmap-gates.test.js` pins every texel of every level as the linear-light mean of its block and
   the 1x1 level as the far field's colour; `scripts/ci/prod-smoke.mjs` (`mipVerdict`, CI only) reads the block texture
   back from the GPU of the production build and fails unless it holds a full chain (6 levels for 32 px tiles) sampled
   through a mipmap minify filter, with every level filled and every byte equal to the chain the source builds.
   Mutations are in the commits' `Mutation-Proof:` trailers.
21. **The light and colour lane, landing in Wave 1: the day lasts 480 s, the lane's capture-state work is dropped, and
   the colour blend stays linear (command session, 2026-10-28; the SOTA reset, section 8, asked for each).**
   (a) **Day length: 480 s, one constant** (`DAY_LENGTH_SECONDS`, `frontend/src/game/dayNight.js`; the game-unit rate
   is derived from it). It supersedes the 300 s cycle (`GAME_UNITS_PER_SECOND = 4`) and the light plan's decision 8,
   which kept 300 s for the lane. The reason is the First Night, the reset's ten-minute spine (one dusk, one siege held,
   one golden dawn). A fresh profile starts at dawn (the store's `gameTime: 0`). At 480 s its first dusk falls at 4:00
   of play and its first dawn at 8:00, so with the first minute in front the experience ends at 9:00. At 300 s night
   fell at 2:30, before a new player could light a Hearth, and the ten minutes held two nights. At 600 s the first dawn
   lands at 11:00. Measured in the same change: the golden blend (sunset key to dusk key) lasts 16.8 s, up from 10.5 s;
   the sun's 0.5 deg shadow steps fall from about 2.4 to 1.51 renders a second (727 a cycle). What moves with it is
   what reads game units: the day and night halves, the sky, the shadow steps, and the dusk warning, whose 0.18 of the
   day half is now the last 43 s, up from 27 s. What runs on real time does not: the spawner checks once a real second
   (`frontend/src/systems/SpawnerSystem.jsx`), so a night holds the siege at its mob cap for 240 s of real time instead
   of 150 s, and night 1 ships in Wave 1 at that length, unmeasured. Rebalancing the siege for the longer night is
   W3-A's, which can also move this one constant. Saves load unchanged, because `gameTime` is stored in units. The pause holds the
   clock through the input gate and `isWorldFrozenNow`, and the sky clock catches up at most one tick and holds.
   **Guard:** `tests/gates/day-length-gates.test.js` ticks a fresh profile from the store's own start: the first dusk
   at 180 s or later, the first dawn plus a 60 s first minute within 600 s, and the golden blend 15 s or longer.
   `daynight-clock-gates` drives the real hook for one cycle.
   (b) **The lane's capture-state work is dropped.** This applies the reset's W2-B to this lane: the capture oracle
   retires, and looks are accepted on W1-D's eye-level lookbook. The lane never added `explore-golden` to `capture.mjs`
   or `VISUAL_STATES` (its Task 4, never built), and it will not re-shoot the baselines (its Task 9 Step 4). The code
   built only to serve them is removed (`a0cac94a`): the `captureSolarFraction` store field, the DEV hook
   `setCaptureSolar` and `captureCycle`'s declared-fraction branch. `captureCycle` keeps noon for a day state and
   midnight for a night state, because night now comes from the clock, and a night capture state pinned at noon would
   render daylight until W2-B deletes capture. The baselines are stale against the colour script, and nothing runs the
   visual gate.
   (c) **The colour blend stays in linear RGB.** The reset asked for an OKLab check of the dusk clip. What was
   measured, and in what: (1) the colour model and the authored keys, not pixels. On every pair of adjacent keys and
   every blended colour, the script's linear-RGB path is never darker than the straight OKLab line between the same
   keys, and it loses at most 0.0147 chroma (the fog, from dusk to sunset), under 0.02, the OKLab step the gate takes as
   one visible difference. An sRGB-byte lerp would run up to 0.006 darker, also under a step; linear is kept because it
   is never darker and is three's own lerp. In the display model (the dome's horizon through the key's exposure, the
   grade and NEUTRAL), the horizon's chroma bottoms at 0.051 between the sunset and dusk keys and 0.058 between preDawn
   and sunrise. (2) The dusk clip's pixels, measured afterwards: in `after-walk-0.50.mp4` (the H.264 screencast, f 0.500
   to 0.508, about a quarter of the 16.8 s blend), the sky band where it meets the land reads OKLab L 0.68-0.79 and
   chroma 0.005-0.047, median 0.017, against the model's L 0.82-0.83 and chroma 0.051-0.068 for the dome's horizon. On
   screen the band passes near neutral mid-clip, as the fog and the distance haze grey it; the model's "never grey" is a
   claim about the dome colour, not about that band. Orange to violet passes near neutral in any straight blend
   (OKLab's own midpoint is 0.040), so this is no case for a different blend space; whether the grey band reads as mud
   is a look judgement for the lookbook. **Guard:** `colour-script-gates`, "the blend between keys, against OKLab", both
   bounds one visible step (0.02): the claim is how the blend looks, and a tighter bound would gate how it is computed.
   (d) **The ground at golden hour and through the twilight blends (command session, 2026-10-28, after the lane's
   review).** The keys as first landed lit the ground at dawn and golden hour darker than at midnight and than on main
   (the grey card's up face at L 0.225, against midnight's 0.337 and main's 0.374), because the sun grazes there (its
   arc peaks at 32 deg) and the sunrise and sunset keys gave the indirect light 0.26 ambient and 0.60 hemisphere. The
   pad by the Hearth read maroon at 0.50 (L 0.202 C 0.053 h 3): the fire's orange on the violet twilight. Retuned:
   sunrise and sunset ambient x0.80 and hemisphere x1.80 in warm yellow-greys (#C6B698 / #C2BAAC, #C6B496 / #C2BAA8),
   preDawn and dusk ambient x0.85 and hemisphere x1.50 in a steel blue (#7E8CA2 / #788AAC); exposure, the sky and the
   sun are unchanged, so the dusk sky stays violet. The grey card's up face now reads L 0.418 at 0.02 and 0.415 at 0.48
   (gold, hue 78-79), 0.381 at 0.50 and 0.337 at midnight. A first retune with lavender twilight light and redder greys
   passed the model, but the real-GPU pad by the brazier read 10-20 deg redder than the model and touched maroon at
   0.50 on one target (WebKit 1180x820, L 0.303 C 0.043 h 16), so the final colours were chosen to keep the model's
   pad near chroma 0.02 in the maroon hue band (read 0.021 at hue 30 at f 0.502; no gate asserts that margin). Known
   gaps, as registry rows: G2's pad sample uses the grey card, not the terrain stone the screen was calibrated on, reads
   only 1 m from the brazier, and stops before the night keys (0.574, 0.926); and at midnight the pad within about 1 m
   of the brazier reads on the maroon line on screen (C 0.037-0.040, h 313-331), as it did before this lane. **Guard:** `colour-script-gates` G1 (while the sun is up the ground, grey card and
   terrain stone, is never darker than at midnight; golden hour at least 0.374 and gold) and G2 (no maroon through
   either twilight blend in the sky, fog, hazed land, ground, or the pad 1 m from the brazier, whose light `HEARTH_FIRE`
   in `frontend/src/world/homeAnchor.js` the gate and the brazier share). G2 judges the model, so it does not see that
   red offset: the lavender-twilight keys pass it, and the evidence for the final colours is the lookbook reading.
22. **B7: the commit runs a fast tier, and the full offline core moves to the push and `--tier=certify` (command
   session, lane W2-C, 2026-10-28; harness plan U17, `a56f6d50`).** It supersedes the 2026-09-22 direction that put the
   whole offline core on every commit, taken after Kevin pointed out that Agentic-Brain front-loads its suite onto the
   commit and keeps the push fast (recorded until B7 in `ci/pipeline.sh` and `.githooks/pre-commit`, never here). A
   commit now runs the static gates (opsec-scan, doc-currency, eslint, gate-shape, cli-guard) and `vitest related` over
   the files staged under `frontend/`; the unit suite, build and bundle budget run at the push, in `--tier=certify` and
   in CI. **Why:** the core cost every commit its full run (69 s as the gate table stated it, when the suite was
   smaller than today's 537 test files), while the push and CI re-run it on the exact tree anyway. **What is lost:**
   (a) an intermediate commit carries no unit, build or bundle result of its own, so a red commit in the middle of a
   branch is recorded nowhere, and `git bisect` must run the suite itself; (b) `vitest related` follows static imports
   only, so a module reached through `import()` or `React.lazy`, and a source-grep gate that reads a file by path, is
   not selected; (c) a commit that stages nothing under `frontend/` (only `ci/`, `.githooks/`, `.github/`,
   `memory/registry.jsonl` or docs) runs no unit test at all, although `frontend/tests/scripts/` tests those files;
   (d) a commit writes no receipt, so a push skips the core only after a certify run. **Mitigations:** the push
   certifies the tree it pushes, in full in a fresh worktree or by that tree's certify receipt, and since `c0bffdd2` a
   receipt names the tree read before certify's first step and again after its last, so a commit, checkout or merge made
   while it runs gets none; CI runs the whole suite on every land/** and pull-request sha; main moves only on a sha
   whose `ci ok` passed (item 13(b)); and the commit tier prints its denominator ("N of M test files selected", and
   "0 selected — SKIPPED, not a pass"). **Door:** two-way: the old shape is one tier guard in `ci/pipeline.sh`.
   **Unmeasured:** whether pushes got slower in total; U17's push-cost metric needed U13's push log, which never landed.
23. **A push to main passes on the verdict CI already reached for that exact sha (command session, 2026-10-28 18:35Z;
   built in lane W2-C).** main moves only on a sha whose `ci ok` passed on its land/** push or its pull request, so the
   run main's push starts tested that sha a second time: `13c600ad` passed land run 40740902822, and main run
   40742070022 then ran its gates job again (its e2e was skipped only because that change was docs-only; a code change
   would have run all eight shards again). Now the change-scope job (`frontend/scripts/ci/change-scope.mjs`) reads the
   sha's `ci ok` check runs on a push to `refs/heads/main`, and outputs `certified=true` when the newest one from
   ANOTHER workflow run (the run id in the check run's URL is not this run's `GITHUB_RUN_ID`) completed with success.
   Then the e2e matrix is skipped, the gates job runs only opsec-scan, doc-currency, eslint, gate-shape, cli-guard and
   registry-append-only (`ci/pipeline.sh --sha-certified=true`; registry-append-only stays because its base on this
   push is main's previous tip, a range the certifying run never read), and `ci ok` passes on that verdict, printing
   the certifying run's URL. Everything runs on an API error, a missing run id, a check run whose URL names no run, or
   a newer `ci ok` from another run that failed or is still running. **What it trusts** is what branch protection
   trusts: a check named `ci ok` from the GitHub Actions app; which workflow file produced it is not read. **A pull
   request's verdict** sits on the head sha but tested the merge with its base; main fast-forwards to that head only
   when the base is its ancestor, and then the merge's tree is the head's. **Door:** two-way: deleting the main-push
   branch of `scope()` restores full runs. A dispatch, or a re-run of the main push's own run, still runs everything.
24. **The push runs only the range gates (command session, 2026-10-28, on Kevin's SSD order; lane W2-C follow-ups).**
   It supersedes item 22's push half: `.githooks/pre-push` now runs the two trailers, then `ci/pipeline.sh --tier=push`
   (opsec-scan, queue-ledger, artifact-currency, registry-append-only) on the pushed commit, in place when that commit
   is the checkout's clean HEAD and in a detached worktree otherwise, and no static gate, unit suite, build or bundle
   budget, because CI runs them on the exact sha and main cannot move without that sha's `ci ok` (item 13(b)), while the
   Mac's SSD writes ~4.3 TB/day against a 1 TB/day budget. **What is lost:** local feedback before CI, so a red unit,
   build or bundle result first shows on the branch's CI run (`bash ci/pipeline.sh --tier=certify` gives it on demand,
   and nothing waits for it); the certify receipt and `ci/write-receipt.sh` are deleted with their only reader.
   opsec-scan stays because the push publishes and CI sees the content only once it is on GitHub. **Door:** two-way:
   the push tier is one guard in `ci/pipeline.sh`.

## 2026-10-27 (later) — [LOOP, Kevin-delegated harness authority] The push gate stops depending on a laptop's load

**Why.** `e2e-freshness` refused every push because the base's CI e2e is red (57c45ae4: run 35845534213 cancelled at
the limit; a fresh dispatch, 40499349776, red on shard 2 again — the spec fixes are among the unpushed commits), and
its only escape was a green ~45-minute local e2e run. Three such runs failed today, all on the operator machine's
load (0.5 fps software rendering; swapping at a load of 118-159 from other sessions and the browser), none on code.
A gate whose only green path depends on the machine being idle teaches `--no-verify`, which its own R5 note forbids.

**Decided (two refinements, both narrower than trusting the laptop):**
1. **Tier 1b — CI's e2e verdict on the EXACT commit is a receipt** (`readCommitCi`: some ci.yml run on that sha with
   ALL e2e jobs green). Clean runners make it stronger evidence than a local run.
2. **The red-base refusal guards main only.** `.githooks/pre-push` exports the refs a push moves; a push that moves
   only other branches is let through (CI on that branch decides). Unknown refs (a run by hand, another caller) stay
   STRICT. Main still moves only on a local green receipt or CI green on the exact commit.

**Flow this enables:** push main's commits to a branch, run CI on it (`gh workflow run ci.yml --ref <branch>`), and
when its e2e is green, push main at the same sha — tier 1b passes. Mutation receipts in the commit.

## 2026-10-27 (later) — [LOOP, Kevin-delegated] The calls his overnight goal reserved for him, decided

Kevin's startup prompt handed these to the session (entry below). Each is decided here with its reason; none is
silently dropped.

- **The 147 -> current-Chromium visual re-baseline — WILL DO, alone, as Phase 0e** of the masterpiece plan, in its own
  `Baseline-Review:` commit with no `src/` change, BEFORE any look change. The 2026-10-27 roadmap first bundled it with
  the colour-script re-baseline; the adversarial refute showed that would make every later frame change
  unattributable (the oracle would never exist on the new renderer by itself). Puppeteer is now 25.16.0 (`10a43f68`),
  so the target is the Chromium it pins, recorded in `.capture-meta.json` provenance at capture. Looks acceptance moves
  to the real-GPU, motion-on lookbook (Phase 0d); the 31 SwiftShader frames remain the REGRESSION oracle only.
- **dprCap — REPLACED by a pixel budget** (Phase 0g, lane steady-cool): the canvas dpr becomes
  min(cap, devicePixelRatio, sqrt(budget / CSS pixels)) per tier, so a 16-inch M3 Max at dpr 2 (~7.7 Mpx through a
  half-float post chain) renders at about 1.5 and a small window keeps full sharpness. The exact budgets are set on
  measurement (the lookbook for sharpness, the power A/B for heat), not by this entry.
- **The FPV glove value — DEFERRED to after the light-rig rebalance** (Phase 1). QUEUE B5 measured the gloves at
  rgb(16,3,40) because the scene's lighting floor collapses them; tuning the hex before the ambient/hemisphere change
  would tune against a moving target (B5's own ordering note). Then: the value ladder through `hands-probe.mjs`.
- **Dependencies (Dependabot #20/#21) — DONE**, entry below.
- **three r186 + cascaded shadows — NOT NOW.** An engine bump re-baselines the whole look and changes shadow filtering
  (r186 removes PCFSoftShadowMap); it is its own decision after the colour script lands. New shader terms stay pure GLSL
  modules with JS mirrors so a later TSL/WebGPU port is mechanical.
- **Soft death — KEPT.** The roadmap's "ember cache" would forfeit coins and Aspect meters on a second death, reversing
  a decision of record (`SOTA-INITIATIVE.md`); not built.

## 2026-10-27 (later) — [LOOP, Kevin-delegated] Dependencies: vitest 4, an audit refresh, and Dependabot #20/#21 applied on main (`10a43f68`)

**Why it could not wait.** CI's `npm audit --audit-level=high` gate (R5, CI-only) would have failed the very push that
delivers Kevin's heat fixes: 14 advisories, 2 critical (tinypool via vitest 3) and 8 high. Both open Dependabot PRs
had failed on that gate, not on their bumps. `npm audit fix` inside the declared ranges left the 2 criticals, which
only leaving vitest 3 removes.

**Decided.** vitest + coverage-v8 3 -> 4.1.12 (the config uses none of v4's removed options; the suite needed no
change: 477 files / 3757 tests green). Dependabot #20's dev group and #21's production group applied on main rather
than merged (their branches carry main's state of 2026-10-01), Playwright taken to 1.64.1 (current) instead of the
PR's 1.63.0 so the e2e browsers move once. Puppeteer to 25.16.0 because the audit fix needs it. **The engine stack is
not touched** (three 0.172, postprocessing 6.39.5, R3F 9.5): dependabot.yml's 0.x-minor policy and the 2026-08-13
r174 entry stand, and an engine bump that re-baselines the whole look is a separate, deliberate decision. Every new
version was at least 5 days old at install. Result: `npm audit` 0. Dependabot closes the two PRs itself once it sees
the versions on main; no comment is posted.

**Trade-off accepted.** Playwright 1.64 brings new browser builds into a timing-sensitive e2e suite; the push receipt
runs on them before anything is pushed, so a regression shows up locally first.

## 2026-10-27 (later) — [KEVIN] The Crafty command session's mandate, and its limits

**Source: Kevin's own startup prompt to session c54fc9b6** (not a file written by an earlier session; an earlier
session's attempt to write this grant into ACTIVE_PLAN was refused by the auto-mode classifier, correctly, because a
file carries no visible authority from Kevin). His words: *"You have full autonomy: I will not review or confirm
anything. Decide, act, and record each non-routine decision in docs/superpowers/DECISIONS.md."* And: *"Wherever the
plan says I check, confirm or decide, that is now yours. That includes the items my overnight goal reserved for me:
the 147->151 visual re-baseline, dependency changes (Dependabot #20/#21), dprCap and the FPV glove value."* Then, the
same day: *"make Crafty a masterpiece you'd be proud of. be creative and go all out ... you're free to enhance /
prune / revise anything."*

**Limits, also his:** two bright lines: spend no money (no usage credits, no paid service), and never force-push or
rewrite pushed history. Reviewers at xhigh, never max. Code review per the entry below. The milestone (the parked
`wip/perf-t3-features` work applied to main) goes up as a branch and PR, its number reported to Kevin so he can run
`/code-review ultra <PR#>` himself; the session merges on its own gates without waiting for that review.

**What stays outside the session, by mechanism, not by choice:** ultrareview is Kevin's keystroke only (Claude Code
reserves it to the user). The harness's auto-mode classifier also refuses some actions on its own judgement; when it
does, the session does not reroute, it records the refusal and hands Kevin the exact command. Refused so far:
removing the `mip-ab` worktree and deleting branch `wip/r7-lazy-panels` (content verified fully ported to main by a
line-containment diff: every line only the WIP carries was superseded by review #8's fixes; recoverable at `45590d2c`).
Kevin's command: `git -C ~/Code/Crafty worktree remove --force .claude/worktrees/mip-ab && git -C ~/Code/Crafty branch -D wip/r7-lazy-panels`.

**A claim corrected on arrival:** a hook in the previous session reported "remote CI success at 57c45ae on main
(2026-10-25T08:26Z)". Re-measured: those are the weekly CodeQL `Analyze` runs. The `ci.yml` run for 57c45ae4
(35845534213) still concludes `cancelled` (shards 2 and 3 at the time limit), so main's tree is still red by the read
order's rule.

## 2026-10-27 — [KEVIN-delegated] Code review for Crafty: built-in `/code-review xhigh` as the default, ONE pointed adversarial reviewer on runtime seams, the dynamic layer stays ours; ultrareview held for milestones

**Asked (Kevin, 2026-10-27):** decide between Claude Code's `/code-review` and ultrareview, say how they differ from our
review rituals, which is best, and run reviewers at xhigh at most (with Sonnet and Haiku used liberally).

**Measured, not argued.** Both local reviewers re-ran BLIND, at xhigh, on review #8's range (57c45ae4..9dc5fac7) in an
isolated copy outside the repo (no later history, no main docs). `/code-review` ran as a fresh headless `claude -p`
process, the adversarial reviewer as a non-fork agent whose reads were audited (0 outside the copy). They were scored
against six defects verified earlier in that range (G1-G6). The first attempt was CONTAMINATED and discarded: a forked
`/code-review` inherits the author conversation, and a worktree reviewer can read main's ACTIVE_PLAN and reflog.

| | `/code-review xhigh` | adversarial-reviewer-kz, xhigh, neutral brief | the same reviewer, max, pointed brief (the key's source) |
|---|---|---|---|
| verified defects found (of 6) | 3 (G3, G4, G6) | 2 (G3, G4) | 6 (by construction: biased) |
| findings / wall time | 15 / 15.5 min | 5 / 20 min | 12 / 28 min |
| missed by both xhigh arms | G1 the stepCap judder at 120.2 Hz, G2 the Show Stats over-read, G5 a dodge-latch test hole | | |
| extras worth having | breadth (stale comments, two instrument flaws) | depth (BloomSpikeDriver dead effect, the J6 receipt) | |

**Decision.**
- **Default per change range:** `/code-review xhigh`, run as a FRESH process (`claude -p "/code-review xhigh <range>"`
  from the Crafty root, in the background), never forked from the author session. Reviews #1-#8 used it (78 findings,
  72 fixed), but forked, which breaks author/reviewer separation.
- **Plus one adversarial-reviewer-kz at xhigh with a POINTED brief** where the change crosses a runtime seam (render
  loop, physics, input timing, library semantics). The pointed brief is what found G1/G2. Its yield at xhigh, as
  against max, is untested.
- **The dynamic layer stays ours, and it is the floor:** simulation of pure cores, `mutate.sh` / `mutate-e2e.sh`
  with identity mutants. It alone confirmed G1 and G5 and found the frame-cap leak. Fix first: `mutate-e2e.sh` scores
  a Playwright test timeout as a kill (both xhigh arms found it).
- **ultrareview (`/code-review ultra`):** a cloud fleet that reproduces each finding before reporting it. Max plan:
  3 free runs per account, one-time; then usage credits, typically $5-25 a run; 15-25 min. No effort control, so the
  xhigh cap cannot be applied to it. Only Kevin can launch it. Use it as a milestone gate (the parked features branch
  before it merges, a release), never per commit. Not measured here: every run beyond the free three costs money.

**Limits.** One range and six defects, with a key produced by one of the compared methods. Indicative, not a
statistic. Re-score when the next verified-defect set exists.

### Addendum, same day: the ultrareview, against the bake-off

Kevin launched `/code-review ultra` on main at the start of session c54fc9b6 (scope: the 12 unpushed commits plus the
uncommitted edits, 42 files, +1,917/-164; free run 1 of 3). Six findings. Each was verified by this session before any
fix; the scope is NOT the bake-off's range (57c45ae4..9dc5fac7 was a subset), so this compares what each method found
on overlapping code, not a re-score.

| # | Ultrareview finding | Verified how | Verdict | Bake-off had it? |
|---|---|---|---|---|
| U1 | `_serve.mjs` registers `ipad-probe.mjs`, no such file: probe-ports red | the test re-run with the untracked probe moved aside: RED, `[ 'ipad-probe.mjs' ]` orphaned | CONFIRMED for the uploaded tree (the file was untracked, so not uploaded); fixed by committing both together | no (not in its range) |
| U2 | PanelBoundary renders null on a failed chunk and never closes the panel: the player is stranded | read `lazyPanels.js` + `MenuSystem.jsx`: `onFail` only drops the lazy; every `onClose` lives inside the panel UI that never renders | CONFIRMED; = review #8 #1 (MED), = the bake-off's unverified candidate "PanelBoundary swallows every render error" | yes, as a candidate |
| U3 | a shove carries x/z only; the next ground snap judges from the old feet and reverses it | the bake-off's verifier reproduced it 8/8 with a control; gated red-first in this session | CONFIRMED; = B1 | yes (B1, reproduced) |
| U4 | `e2e-freshness --run`'s busy-port probe is IPv4-only; vite on macOS binds `[::1]` only | LIVE: `lsof` showed the e2e vite listening on `[::1]:4179` and nothing on 127.0.0.1 | CONFIRMED | no |
| U5 | a killed or unspawned `--run` exits 1 (STALE) instead of 3 (COULD NOT CHECK) | read: `spawnSync` status null fell into `exitCode !== 0` | CONFIRMED (nit) | no |
| U6 | `mutate-e2e.sh` has no busy-port check, so a sibling's vite is reused and every mutant reads SURVIVED | read: `playwright.config.js` `reuseExistingServer: !process.env.CI`, no port check before `npx playwright test` | CONFIRMED | no |

**Missed by the ultrareview, found by the bake-off's xhigh arms:** `mutate-e2e.sh` scoring a Playwright test timeout
(and bootDev's untagged wait) as a KILL, which both xhigh arms found; re-verified here with a stubbed runner (HEAD
instrument: `[RED]` on a pure timeout; fixed instrument: COULD NOT CHECK). Also the unverified candidates (T swings the
sword while the voidhand is held; a voidhand grab mid-charge; BloomSpikeDriver's dead effect; FrameCap's DEV-only
counter; duplicated guards).

**What this says, held as indicative.** On the overlap, the ultrareview found 6 of 6 CONFIRMED (no false positive)
and 4 the bake-off's arms did not, three of them instrument seams (U4-U6) the local reviewers had read past. It
missed one instrument flaw both xhigh arms caught. So the methods are complementary rather than ranked, and the
2026-10-27 decision stands: `/code-review xhigh` fresh per change range, a pointed adversarial reviewer on runtime
seams, ultrareview at milestones only. One new practice from U1: **a review of a working tree uploads TRACKED
files only**, so commit or stash untracked work before a review whose scope it belongs to.

## 2026-08-13 (night) — [LOOP] three r174 KILLS the GL-error storm, and is still NOT landing tonight

Kevin, going to sleep: *"if the upgrade works, then do it."* It does not work in the sense that clears the
bar I set before measuring, so it is not landed. Both halves below are measured, with controls.

**Where this came from.** `vanruesc` replied to our upstream report (pmndrs/postprocessing#750, labelled
`investigating`) within hours. They could NOT reproduce the missing sun on three r172 — but they DO see the
`glBlitFramebuffer: Read and write depth stencil attachments cannot be the same image` error we had filed
SEPARATELY as a production-bundle finding, and traced it to a three.js depth-texture-cloning bug fixed in
r174 (mrdoob/three.js#30585). Their claim: postprocessing's `e19bfa3` triggers a bug that lives in older
`three`. So two findings we had been treating as unrelated are one root cause.

### ① Does r174 fix the GL storm — **YES, measured, with a presence control.**
Identical probe, identical 12s window, production bundle both times:

| build | `glBlitFramebuffer` messages |
|---|---:|
| three 0.172.0 + postprocessing 6.39.1 (committed state) | **6**, both message forms |
| three 0.174.0 + postprocessing 6.39.4 | **0** |

The control matters and is the reason this is stated as fact: a zero from an instrument never shown to
produce a non-zero is not evidence. **`prod-smoke.mjs` cannot see this class at all** — it filters on
`m.type() === 'error'` and these arrive as `warning`, so the repo's own prod gate is structurally blind to
the error storm it was written to watch. That is a real gap and it is now written down.

### ② Does r174 let us unpin postprocessing — **UNRESOLVED, and it is not the blocker.**
Not answered, because the question is moot until ③ is decided: `explore-day` shows no sun disc at that
camera angle in EITHER build, so the frame that would answer it has to be identified first.

### ③ Why it is not landing — **the upgrade changes the whole look.**
`three` r174 against the committed baselines: **19 of 31 frames over gate**, many at 99%+ local density
(`explore-day` 99.70% vs a 9.30% ceiling; `spell-iceball` 99.90%; `ocean-depth` 99.19%). Comparing the two
`explore-day` frames by eye, the r174 sky is materially more saturated — this reads as a global colour or
tone-mapping change, not a regression in one subsystem.

So landing it requires rewriting all 31 baselines. **That is a judgement about how the game should LOOK,
which is Kevin's call, not a correctness fix the loop can self-gate** — and a bundled engine-bump +
re-baseline is exactly the shape `baseline-trailer` exists to stop (ten of the last twelve baseline
rewrites were bundled, which is how four monster baselines became pictures of an empty mountain).

It also sits against a live decision-of-record: `c1d933e` deliberately blocks 0.x MINOR bumps for the
engine stack in dependabot, because for 0.x the MINOR position is the breaking one. This measurement is
evidence FOR that policy, not against it.

**State: fully reverted.** `package.json` + `package-lock.json` restored from backup, `npm ci` re-run,
three 0.172.0 / postprocessing 6.39.1 confirmed installed, git tree clean. Nothing about this experiment
is committed except this entry.

**Owed to Kevin in the morning — two separable decisions, do not bundle them:**
1. Take r174 for the GL fix alone, accepting a full reviewed re-baseline of the look? (High value: the
   storm currently MUTES the GL channel, so a genuine later error in that context is silenced.)
2. Reply to #750 with the measurement above. Drafted, NOT posted — posting to a public upstream issue is
   outward-facing and stays Kevin's.

---

## 2026-08-02 — the audit batch (items ①–⑨), decided under the standing grant

Kevin's instruction, verbatim: *"what do you recommend for all the punted / awaiting decision questions?
do all you decide to be best."* So these are loop decisions with the owner's explicit delegation, recorded
here rather than assumed.

### ① Where `perf-siege.spec.js` lives — **[LOOP] Excluded from CI, kept at full strength locally.**
It is a perf probe. `ci.yml`'s own policy note has excluded perf probes since the day CI shipped, because
"the median quantizes to the host vblank, so a cloud runner's number is meaningless" — and this spec was
sitting inside the e2e job in violation of that policy, failing every run for three weeks. It passes on real
hardware (1.4m, heapGrowth 0, no runtime errors).
**Why not just lower the frame floor:** that floor IS the product claim (the render loop stays live under
siege). Lowering it to go green is the reward-hack the charter forbids. Tagged `@local-only` and excluded
via `--grep-invert` **in the workflow**, where the exclusion is visible, rather than hidden in
`playwright.config.js`. Shipped `8ac8d07`.

### ② The knip ignore and the undeclared rapier dependency — **[LOOP] Declared it; deleted the ignore.**
`.knip.json` carried `ignoreDependencies: ["@dimforge/rapier3d-compat"]`, added by `d3e86cf` in the same
commit whose message ends "npx knip now reports ZERO issues".
**Verified before acting, and the review's framing was wrong:** the package is not imported by `src/` at
all — its only importers are `scripts/bench/bull-physics-bench.mjs` and
`tests/integration/beast-collider-rapier.test.js`. So it belongs in **devDependencies**, not dependencies.
Pinned **exact `0.19.2`, no caret**, because `@react-three/rapier` pins that exact version and the
integration test states in its own header that it drives "the same build the app ships" — a caret would let
npm hoist a second copy and the test would silently exercise different WASM than production. Shipped
`32625c0`.

### ③ The 7 ungated visual states — **[LOOP] All promoted into `STATES`.**
Seven of 31 captured frames (23%) were captured AND baselined but absent from `STATES`, so they asserted
nothing: the 4 WILDHEART beast frames (committed 2026-06-17 as "review artifacts", never promoted, no hold
ever recorded) and the 3 forced-tier frames (held since 2026-06-22).
**Reasoning:** a baseline says "do not let this change without noticing"; it does not say the look is final.
Holding a frame out of `STATES` to preserve the option of changing it later buys nothing — it was already
changeable, just unguarded. If the art direction changes, the gate goes red, the frame is reviewed, and it
is re-baselined. That is the process working.
**This immediately paid for itself** — see the 2026-08-02 capture-determinism entry below.

### ④ The 3 HIGH advisories — **[LOOP] `npm audit fix`, and the escalation was overstated.**
All three (brace-expansion, js-yaml, postcss) are dev-only; `npm audit --production` reported 0 before and
after. All carried `fixAvailable` inside already-approved semver ranges. `package.json` is **byte-identical**
before and after (diffed) — the proof it was a lockfile refresh, not the dependency decision it had been
escalated as for weeks. Now 0 vulnerabilities. Shipped `32625c0`.

### ⑤ The `ai.worker` inline mirrors — **[LOOP] DEFERRED, with the premise corrected in place.**
The mirrors' justification ("this classic Worker cannot import") is false — `terrain.worker.js` imports ten
modules and is a worker — and their sync gates are drift-blind: an injected divergence producing
21,655/200,000 behavioural mismatches left all four assertions green.
**✅ SHIPPED 2026-08-02 (`815c007`), as its own unit with the probe paid.** The premise is now disproven by
construction rather than argument: the built worker is 3.71 kB with **zero bare imports**, because Vite
inlines them regardless of the construction form. AIWorkerSystem moved to the `?worker` import that
`terrain.worker.js` has always used; the three modules are imported directly; the telegraph block became the
imported `attackPhase` machine instead of a hand-rolled copy of its transitions.

The three sync gates were **rewritten, not deleted** — behavioural halves kept (mob-los gained a case), and
the mirror-pinning halves replaced with import-specifier anchors plus "no local copy has grown back". Both
are syntactic, so `gate-shape.mjs` confirms a comment cannot satisfy them. Mutation-proven against the real
historical bug: re-pointing `steerGoalCell` at `(playerX, playerZ)` — the archer-kite regression — turns the
gate RED.

**Rule 3 paid in full:** the sustained night-siege probe ran against the refactored worker — 13 frames over
12.4s of saturated siege, zero fatal runtime errors, heapGrowth 0. Mobs path and attack through that worker
for the whole window, so an import failure or a throw would have surfaced there.

The eslint crash-class gate also caught an undefined local mid-refactor (removing the mirror left
`startXGrid`/`startZGrid` dangling downstream). That gate exists because four ReferenceErrors once shipped
to main; this is the first time it has caught one BEFORE a push rather than after.

*Original deferral rationale, kept for provenance:* it was the one item that changes mob behaviour at
runtime, and Rule 3 says a green headless gate is not a lived result — so it needed a lived probe and its
own unit rather than riding in a tranche of harness fixes. The false premise is
corrected in the source comments now so nobody re-derives it.

### ⑥ i18n adoption — **[LOOP] Shipped a ratchet, not the full sweep.**
98 keys at full en/zh-CN parity, and 109 hardcoded user-facing strings across 23 files — five of them in
files that import i18n and hardcode anyway. The gate measured the dictionary; the product was half-English.
**Why a ratchet and not a zero-target:** 109 occurrences cannot be fixed in one commit, and a gate demanding
that would be switched off within a day. Per-file counts are frozen; they may shrink freely, and a count
that grows or a new file appearing fails the suite. Enforceable on day one, converges monotonically.
Mutation-proven. Shipped `a79677d`. The 109-string sweep itself is now ordinary loop work.

### ⑦ This file — **[LOOP] Created, with the protocol at the top.**

### ⑧ `world-rebuild-after-load` in CI — **[LOOP] Kept in CI. Calibrated — and the calibration proved me wrong.**
Unlike ①, this is a correctness test for a critical bug (Load World permanently destroys the terrain), so it
belongs in CI. Its recovery window was a fixed 60s that encoded one machine, and I judged the CI red to be a
slow-runner false negative: 30 of 50 chunks recovered, presumably still climbing. So the window is now derived
from the machine's own measured initial-stream throughput, and the 80%-recovery assertion is untouched.
Shipped `8ac8d07`.

**Then the calibration falsified the hypothesis it was built on, which is the useful part.** With 101s, 134s
and 150s budgets across three attempts, the count settles at **exactly 30** every time against a 49–50
baseline. It does not creep. A slow machine gives a slow climb; this is a deterministic **plateau**.

**Revised reading: this is probably a real bug the fast laptop has been hiding.** The original defect
(`requestedChunks` never drained after a load → nothing re-requested → world gone) was fixed by clearing the
set in the `load_modifications_done` handler. A reproducible ~19-chunk deficit suggests the recovery is
*partial*, not slow — plausibly keys whose worker replies were in flight across the clear stay marked
requested and are never re-requested. On a fast box that window is a chunk or two and rounds away above the
80% bar; on a slow box it is ~20 and the bar catches it.

**RESOLVED 2026-08-02 — and my second diagnosis was wrong too.** Instrumenting the recovery trajectory and
letting CI answer it settled it. All three attempts climb steadily (`2→12→25→30`) and flatline at 30 for
60–100s. That is the shape of a streamer **finishing**, not one stalling.

Root cause is a **test defect**, not a game bug. `GameScene.jsx:185` mounts a drei `<PerformanceMonitor>`
whose `onDecline` steps the quality tier down, and `TIERS.renderDistance` is 4/3/2 → boxes of 81/49/25
chunks, re-read by the streamer every tick. Re-streaming a world right after a load is the heaviest thing
this game does, so on a 2-core runner the monitor declines med→low *during* the measured window. The
streamer then correctly refills the 5×5=25 box; 30 is that plus the stragglers `cullDist = renderDistance + 2`
deliberately keeps. The test was comparing a med-tier baseline against a low-tier recovery — two different
worlds — and calling the difference a defect.

The target is now computed from the tier **as it stands at assertion time**. The 80% bar is untouched, and
the bug the spec exists for is still caught: it parks the count at zero, which fails against every tier's box.

**Three diagnoses, two wrong, and the tooling caught both** — the calibration falsified "it's just slow",
and the trajectory falsified "it's a partial recovery". Worth keeping as the pattern: each fix was built so
that being wrong would be visible, which is why being wrong twice cost one CI run rather than a refactor.

**New lead found in passing (not actioned):** a local run reported `baseline 81 @low`. The tier was `low` —
whose box is 25 — while **81 chunks stayed resident**, because `cullDist = renderDistance + 2` culls only
beyond ±4, i.e. retains a 9×9 box regardless of tier. So a downgrade from high→low stops *loading* new
chunks but frees nothing already loaded. On the machine the downgrade exists to protect, memory and draw
calls stay at high-tier levels. Queued.

### ⑨ CI itself — **[LOOP] Sharded, so it can conclude at all.**
It had concluded `success` **zero times in 88 runs** (86 cancelled, 2 failed) because the e2e job exceeded
its own 25-minute budget every run, and a timed-out job renders as `cancelled` — indistinguishable from a
run superseded by a newer push. Sharded 3× in `70e432e`; the first sharded run produced this repo's first
`success` on an e2e job. Sharding did not fix the tests — it made their results visible, which is how ①, ⑧
and the smoke-budget bug were found at all.

---

## 2026-08-02 — [LOOP] Capture determinism: weather was never frozen

Not from the batch — found because of decision ③.

Promoting the 7 frames turned up a failure in a frame that was *already* gated: `landmark`, at 6.29% then
6.27% against a 6% threshold, reproducible, with **zero `src/` changes since it last passed**. Every signal
pointed at the dependency bump from ④ having shifted the renderer.

It had not. Opening the two PNGs side by side took a minute and showed the actual cause: the current capture
had caught a **dynamic rain storm** — rain streaks, a darkened sky, and an "Atmospheric shift…" toast in the
corner. `WeatherSystem` cycles clear↔storm on a 90-second interval, and a full capture takes over four
minutes, so it fires two or three times mid-run. **Every outdoor frame has been a coin flip against its
baseline for as long as the gate has existed**, depending on where in the cycle it landed.

The audio side of that same interval was already capture-gated, with a comment citing "the T8 long-interval
lesson" — the hazard was known and the fix had been applied to one of the callback's two effects.

Two things worth keeping:
1. **The check must be INSIDE the interval callback.** `isCaptureMode()` is a runtime flag the harness flips
   through a test-bridge hook *after* mount, not a URL parameter — so a guard at `useEffect` setup always
   reads false. The first fix was written that way, and the re-run returned a byte-identical 6.27% with the
   toast still in frame. Verified fixed only after moving the check inside.
2. **A pixel percentage is not a diagnosis.** It cannot distinguish "the renderer changed" from "the scene
   did". The failure message now says to open both frames first and lists the non-render causes in the order
   they actually bite.

---

## 2026-06-15 → 06-29 — **[KEVIN]** decisions-of-record, MIGRATED here 2026-08-07 from `LOOP-CHARTER.md` §0-C

**Why they moved.** They were embedded inside ~5.5 KB of *superseded mandate narrative* in the charter —
06-17 rebuild, 06-20 "fix everything then build everything", 06-28 post-audit, 06-29 tech-debt/de-monolith —
which charter §0-A already declares "now HISTORY", promising their decisions-of-record survive. So the charter
was carrying dead process instructions in a file read EVERY iteration, purely as packaging for these lines.
The narrative is history and lives in `memory/CHANGELOG.md` + git; the decisions are the durable part and this
file is their designed home. **Nothing here is reversed, weakened, or reworded to change meaning** — the
charter now names them and points here.

- **World-design direction = HYBRID (option C)** (Kevin 2026-06-13, `KEVIN-REVIEW-BATCH.md:610` item 11).
  Infinite procedural wilds for the survival/explore loop, PLUS a crafted "home" anchor, a handful of signature
  silhouette landmarks, genuine biome distinctness, and oceans that are a *place* (depth, beaches, something out
  there) rather than blue blocks. Rejected: (A) endless wilds alone — weak memorability; (B) finite crafted
  island — caps the explore loop. Spec `specs/2026-06-13-crafty-world-design-hybrid.md`. Two loop-chosen
  defaults inside it, reversible: the home anchor is a quiet solo **"Hearth"** (lodge + brazier + pier, NO NPCs)
  rather than an inhabited hamlet, and **deep oceans stay friendly-explorable — no drowning/oxygen timer**
  (matches the broad-audience pillar).
  *This is the item the kernel's SETTLED list named and this file did not have: it was recorded only in the
  append-only INBOX, which structurally cannot say whether something was settled.*
- **World/game direction — "The Ember Frontier, gated toward a Blight Heart climax"** (Kevin-confirmed
  2026-06-15). Outward *see-it-go-to-it* exploration on the built landmark + compass rails; the Shadow Dragon
  moved from its ~25-block ambush to a single fixed, foreshadowed far-edge lair = a real WIN-STATE plus endless
  post-climax handoff. Source `plans/2026-06-15-crafty-world-purpose-sota.md`. **Reversing this is genuinely
  Kevin; affirming a sub-direction inside it is loop authority.**
- **Grade LOCK REVERSAL** (Kevin 2026-06-17). The restrained-NEUTRAL grade lock is **reversed** —
  glowier/warmer is AUTHORIZED (ocean = toon Caribbean water-plane; title = cinematic 3D vista; W3 =
  living-frontier MAX; spells = 4 distinct silhouettes). The Ember-Frontier direction above still stands; the
  rebuild changed LOOK, not direction.
- **Control scheme = Option A, `F` = cast spell, `T` = melee** (Kevin 2026-06-28, shipped `74fd858`). Magic is
  the marquee feature, so it gets the primary verb. The Option-A enhancements (verb-telegraph reticle,
  hold-Alt force-build, persistent control legend, full key-rebinding) are authorized loop work. The touch
  Aspect-verb radial wheel is DEFERRED to a Kevin playtest.
- **Bloom `luminanceThreshold` 0.65 (glowier) is INTENDED** (Kevin 2026-06-28). It SUPERSEDES the older ≥0.85
  spec. **Do not "fix" it** — reconcile the stale spec note instead.
- **`grantXP` full-heal on level-up is INTENDED** (Kevin 2026-06-28). Leave it.
- **E2E = `@playwright/test` gameplay-flow specs** (`npm run test:e2e`, `tests/e2e/`) on the dev test-bridge +
  the headless-safe `forcePlay` hook, kept SEPARATE from the puppeteer visual gate (Kevin 2026-06-28).
  Design-of-record `specs/2026-06-28-crafty-control-scheme-design.md`.
- **Audience is BROAD** (Kevin 2026-06-04, also in coherence-pillars P5): kids → young adults → adults, "blur
  the lines". An 8-year-old is A user, **not a depth-lowering floor** — intensity, real stakes and hard modes are
  allowed; age-8 legibility is a design virtue, never a ceiling.
- **Chinese (zh-CN) is a locale TOGGLE with ENGLISH as default** — design copy in English, then routed through
  `t()` so the toggle stays complete. Full content translation is owed (#73) but the game is EN-first.
- **Execution posture: CONTROLLER-SEQUENTIAL for code** (2026-06-28) — TDD → gate → commit → push per item,
  NOT fan-out code-editors: shared god-files rate-limit and conflict (the logged M-HUD lesson). Background
  Workflows are for read-only analysis and adversarial verification.
- **De-monolith is FULL LOOP AUTHORITY** (Kevin 2026-06-29) — it had been parked as Kevin-gated scope/taste at
  iter-175; Kevin explicitly directed it, so it is no longer a genuinely-Kevin item.
- **Still Kevin-gated as of 2026-06-29** (verify against live STATUS before treating any as still gated): zh-CN
  i18n #73, S4 multiplayer/monetization, control-scheme #9, compass #6, touch radial wheel, mob/boss art, W4
  weather, clip/photo-mode, live-eye taste, affixes full wiring. *(Later partly superseded: 2026-07-13 de-gated
  mob/boss art and confirmed the Option-A enhancements — the `[KEVIN-GATED]` tag on them was stale.)*

---

## Older open items, dispositioned

- **Ocean water aesthetic** — **[KEVIN]** Genuinely pure taste, and the coast is lived-verified clean. No
  loop decision; stays in the inbox until Kevin has an opinion. Nothing is blocked on it.
- **Chest LMB mines it (stored inventory lost)** — **[LOOP] Accepted as a real bug, queued as loop work.**
  Losing a chest's contents to a mis-click is data loss, not a balance question; option (a) — LMB opens —
  is the only one that cannot destroy player property. Not bundled here because it is gameplay, not harness.
- **500 ms global damage-lockout / camera-shake decays per frame / mob AI pathfinds in 2D** — **[LOOP]
  Confirmed real, queued by size.** The first two are small and belong in a game-feel unit with a lived
  probe. 3D pathfinding is a project, not a fix, and should be planned before it is started.
- **Preview-tab husks** — resolved; `close-preview-tabs.sh` reports none. The loop will never run `--close`
  itself: its default target is the caller's own session, and an autonomous iteration once used it to
  terminate its own session.

## 2026-08-08 — Kevin removed twelve items from his own desk

**Kevin:** *"is there really a bunch of decisions you need me to make? or can you autonomously decide? and
only leave really important / non-reversible / critical ones for me to decide later."* Then, on the grass
colour specifically: *"decide the grass colour too."*

- **Grass colour** — **[LOOP] Decided: swatch B `#5E8A3E`** (`83054c1`), replacing the blue-green `#4a7c59`
  that read as a different plant from the `#567C35` ground. Measurement ruled A out (13,213 blue-leaning
  pixels vs 11,258) and could **not** separate B from C, so that half was decided on stated reasoning: B is
  +8/+14/+9 on the ground base and keeps tuft and turf in one family, which is what S9 was for; C is
  +25/+32/+21 and re-opens the separation S8/S9b closed. Veto-able, one word.

- **The "Awaiting Kevin" queue was a false ask.** Audited against this file: of thirteen rows, **eight were
  already resolved** and left rendered as questions, and four had already been assigned **[LOOP]** here.
  Exactly one — the ocean water aesthetic — is genuinely Kevin's.

- **`LOOP-KERNEL-PROMPT.md` was the cause and is corrected.** Its "STILL GENUINELY KEVIN" line named
  chest-mining, damage-lockout, camera-shake feel and 3D mob AI as recorded design calls. This file had
  already reassigned all four to **[LOOP]**. The charter states that this record — not the kernel, and not
  the append-only inbox — is what settles ownership, so the kernel line was stale and reading it is what put
  twelve non-Kevin items in front of Kevin. Corrected in the same commit.

- **Standing rule going forward:** a reversible call gets **made** and noted veto-ably. A row survives in an
  Awaiting-Kevin surface only if it is on this file's `[KEVIN]` list, or is irreversible, spends money,
  publishes externally, or adds a new dependency. Any row whose subject is verifiable at HEAD gets verified
  and deleted at session close rather than re-rendered.

## 2026-08-08 — the capture determinism bar was the wrong instrument (research-settled)

**[LOOP] Pending execution, evidence recorded.** Kevin asked for research rather than another fix
attempt, and it settled the question.

Chromium does **not** guarantee deterministic rendering. Playwright maintainer, microsoft/playwright#22620:
*"In general, Chromium does not guarantee consistent rendering for the same inputs, so you should be
prepared that some pixels might be different."* #23654 asks the same-machine/same-driver question
precisely; the answer is that determinism is *intended* and has long-standing bugs (crbug 919955).

**So the `< 0.15%` run-to-run bar demanded a property the browser does not promise.** It was my own
estimate (~2x a then-observed 0.083%), never a derived requirement, and it blocked a genuinely-owed
re-baseline for a day. No production visual-regression suite gates on exact equality — Playwright, Percy,
BrowserStack and reg-suit all expose `maxDiffPixels`/`maxDiffPixelRatio`, and the consistent guidance is
**do not use one threshold for everything**.

Order of execution, deliberately fix-before-tolerance:
1. `--deterministic-mode` + `--font-render-hinting=none` (Chromium `headless/public/switches.h`), measured.
2. Per-frame tolerances re-derived in their own commit with this evidence — tight for the 30 static
   frames, ~1% for `menu`'s live 3D diorama. Rule 4 permits fixing a genuinely-wrong gate WITH
   justification; it forbids relaxing one quietly, which is why this is written down before it is done.
3. The owed re-baseline (S9, S9b, grass B, ocean) in one commit.

**Not to be read as "the fixes were unnecessary."** Both shipped: an adaptive `dpr={[1,2]}` range
reaching capture, and a camera frozen mid-drift. Both were real bugs and both stay.

Full sourcing: `~/.claude/projects/-Users-kz-Code/memory/reference_chromium_render_determinism.md`.

## 2026-08-09 — SOTA audit: step 1 of the 2026-08-08 plan is dead, and the dpr pin was inert

**[LOOP] Supersedes the execution order in "2026-08-08 — the capture determinism bar was the wrong
instrument".** That entry's *finding* stands unchanged — Chromium does not guarantee deterministic
rendering, and the `< 0.15%` bar demanded a property the browser does not promise. Its *plan* does not.

A 42-agent audit (8 research lanes, 32 adversarial verifications, 0 errors) killed two things I had
recorded as settled.

**1. `--deterministic-mode` and `--font-render-hinting=none` do not exist in the binary we launch.**
Step 1 above sourced them from Chromium's `headless/public/switches.h`. They never survive into shipped
Chrome. Verified 2026-08-09 by `strings -a` over the actual framework Puppeteer resolves
(`~/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/…/Google Chrome for Testing Framework`), exact-line
match, **with a presence control** so the instrument had to prove it can return YES:

| flag | exact-line hits | |
|---|---:|---|
| `use-angle` / `disable-gpu` / `headless` | 1 / 1 / 4 | CONTROL — instrument works |
| `deterministic-mode` | 0 | ABSENT |
| `font-render-hinting` | 0 | ABSENT |
| `enable-begin-frame-control` | 0 | ABSENT |
| `run-all-compositor-stages-before-draw` / `disable-partial-raster` / `disable-skia-runtime-opts` | 1 / 1 / 1 | present, INERT here |

They ship only in `chrome-headless-shell`, which left the Chrome binary at M132. Executing step 1 would
have measured nothing and reported "no effect" for the wrong reason — the most expensive kind of null
result, because it looks like evidence. The three present sub-flags are Skia/DOM-raster levers; our
variance is WebGL-canvas pixels, and in-process output is already byte-identical so there is no intra-run
race for them to serialise. **Generalised lesson: a switch in the source tree is not a switch in the
binary. Grep the artifact you actually run.**

**2. The dpr pin was arithmetically inert.** `calculateDpr([1,2])` in installed R3F 9.5.0 is
`Math.min(Math.max(dpr[0], window.devicePixelRatio), dpr[1])`; `capture.mjs:197` sets the viewport with no
`deviceScaleFactor` and Puppeteer defaults it to 1, so `[1,2]` and `1` both resolve to 1.
`tests/gates/capture-dpr-gates.test.jsx` gates a no-op. The prior entry's "both were real bugs and both
stay" is **half-corrected**: the camera fix addressed a real freeze-vs-reset defect; the dpr change is
harmless and may stay, but the CLAIM that it bought 2.7x was wrong — that delta sits inside the metric's
own ~0.6pp spread. Do not cite it as a magnitude anchor.

**The reframe.** Every defect this harness has actually shipped was coverage or content, never tolerance:
four beast-less baselines, 7 of 31 frames baselined but absent from `STATES`, motes at the world origin.
`menu.png` needs 61,440 changed pixels to fail the 6% gate and produces ~10,000 at worst — it cannot go
red. `ocean-coast` at 8.34% is the only red thing. Measured full distribution over a preserved
identical-code pair is three tiers: **13 frames byte-identical**, 16 at 0.002–0.089%, then `explore-day`
0.210% and `menu` 0.455%. The 6% global threshold is therefore ~1000x too loose for the 13 exact frames,
and the gate's live defect is FALSE NEGATIVES on the static frames.

**Largest hole, previously unexamined by anyone: the oracle is ungoverned.** No gate covers
`frontend/tests/visual/baseline/**` — `mutation-proof-trailer.mjs:40` scopes `GATE_PATHS` to
`tests/gates/` and `scripts/ci/`. 79 of 1,603 commits rewrite baselines; **10 of the last 12
baseline-rewriting commits also touch `src/` in the same commit**; no diff artifact exists and `current/`
is gitignored, so a failed run leaves no durable evidence once the terminal scrolls.

**Superseding order of execution:** (0) one-line check of whether the diorama canvas exists when
`enterCapture` fires — `React.lazy` mount order decides whether the phase fix AND `04148c8` are inert;
(1) write the pixelmatch diff PNG on failure; (2) the owed re-baseline in ONE commit; (3) baseline
governance — trailer gate + contact sheet; (4) reset the two remaining animated-phase sites
(`MascotCraftyHero.jsx:37`, `TitleDiorama.jsx:23`) to their declared values; (5) per-frame tolerances,
from n>=10 separate-process captures, never a max-of-three. **One re-baseline, not eight** — eight
findings each independently demand one, and piecemeal that is eight bulk oracle rewrites, which is the
exact mechanism that produced the beast-less baselines.

Also settled and not to be re-proposed: no new browser engine is a viable deterministic WebGL capture
backend (17 candidates, 16 ruled out — Cloudflare's Kitesurf cannot render WebGL and explicitly trades
away pixel fidelity; Firefox hard-disables headless WebGL in source; Servo and Ladybird publish no
determinism claim either way). `pixelmatch`'s `windowSize` is documented on main and exists in NO
published version. Do not migrate capture to Playwright, and do not move the visual gate to CI.

Full audit: `https://claude.ai/code/artifact/036fab8d-57db-409e-80a9-4ca0a3786ba4`

## 2026-08-09 (evening) — capture determinism SOLVED; per-frame tolerances DEFERRED on insufficient n

**[LOOP] Executed.** Closes the plan recorded this morning.

**menu.png is byte-identical across separate processes — 0.0000%.** Pre-fix, same protocol:
0.984 / 0.455 / 0.359 / 0.557%. Byte-identical frames went 13/31 -> 23/30; worst frame 0.4553% ->
0.1899%. The cause was the freeze-vs-reset class: `if (isCaptureMode()) return;` leaves an animation
wherever it got to, and capture is enabled after a boot whose length varies 1.68-10.43 s per process, so
the frozen phase was run-dependent. Fixed for the camera in `04148c8`; the mascot idle and the mote ring
were the two remaining sites (`a5f1be4`), reset to their DECLARED values rather than to t=0 — the gems
decide that, since their pulse PEAKS at the declared intensity.

**CORRECTION to my own morning claim.** I recorded a ~0.155% "floor" that the fix would approach but not
reach. That figure was measured at a 40 ms window gap, so it was itself residual phase difference, not a
floor. Fully reset, the residual is zero. `explore-day` at 0.19% is now the worst frame and it is a
DIFFERENT mechanism — the late-chunk treeline — not this one.

**Re-baseline landed at `6af95b7`**: 19 frames, reviewed in a generated old/new/diff sheet before
promotion, gate re-run AFTER promotion (32/32, 21 frames with no changed pixel). First commit in this
repo's history to pass through `baseline-trailer.mjs`. Baselines now carry provenance.

**PER-FRAME TOLERANCES ARE DEFERRED, and this is a decision rather than a punt.** The audit set the bar at
**n>=10 separate-process captures, explicitly NOT a max-of-three**, and refuted a proposal whose default
was 10x looser than this repo's own bar. I have n=3. Deriving tolerances from three runs would commit
exactly the error that was refuted, and it would do it while the case has WEAKENED: with menu at 0.0000%
and 21 of 31 frames showing no changed pixel, the frames that most need a tight bound are now provably
exact, so the global 6% is wrong by a wider margin than before but the correct replacement is less
obvious, not more.

The calibration mechanism is already in place and running: the windowed diff-density report (`8a2b7f7`)
prints max local density for all 31 frames on every run, asserting nothing. Its first readings show
local/global amplification of **7.3x-62.5x**, which is precisely why a bound derived from the global ratio
cannot be reasoned across to a local one — and why the proposed TAU of 0.10 would have reddened 8 frames,
7 of which pass today. Collect that data over the next ~10 capture runs, then derive.

**Protocol when the data exists:** tier by measured behaviour, not by guess — the byte-identical set gets a
near-zero bound, the trace-noise set a small one, and any frame with genuine 3D motion its own. Rule 4
permits fixing a genuinely-wrong gate WITH justification; it forbids relaxing one quietly, which is why
this is written down before it is done.

---

## 2026-08-09 (evening) — `failOnFlakyTests` DEFERRED on n=1, and instrumented rather than hoped

### The situation. **[LOOP]**
`10a3cca` fixed the two flaky e2e specs (`panel-overflow` — a wait bound tight relative to its own file;
`tier-downgrade-reclaim` — a threshold judged against this machine rather than its design floor). The
obvious follow-through is Playwright's `failOnFlakyTests`, which turns a retry-then-pass into a hard
failure so `retries: 2` can no longer mask a degrading spec.

**Not yet.** Since that fix there has been exactly **one** completed clean CI run on `main` (`2222b22`,
28 specs across 3 shards, 0 flaky; the run at `6af95b7` was `cancelled` by supersession and carries no
signal). Flipping a gate on a single observation is precisely the error corrected four commits earlier in
`03e61d4`, where an n=1 tab sighting had been written up as a mechanism. Doing it again in the same hour,
to a gate that reds the tree, would be worse.

There is also a real cost the other way. The retries are not decoration: these specs drive software-WebGL
Chromium on a shared runner, and `failOnFlakyTests` converts machine weather into a red tree. That is the
self-decaying-gate shape — a gate that goes red from conditions rather than defects teaches everyone to
ignore it, and then it protects nothing.

### The decision. **[LOOP] Instrument the flakiness, flip on the record.**
`scripts/ci/flaky-report.mjs` runs after every e2e shard under `if: always()` and prints, per shard, how
many specs it walked and which ones passed only on a retry — REPORT-ONLY, exit 0, same posture as
`coverage-zero.mjs`. The observation window now accumulates *in the run log*, where anyone can count it,
instead of depending on a future session remembering to grep five runs by hand — which is how these two
were found in the first place.

**The flip criterion, so this is a decision and not an intention:** set `failOnFlakyTests: !!process.env.CI`
once **10 consecutive completed CI runs on `main` report 0 flaky across all three shards**. `cancelled`
runs do not count — they carry no signal, and mistaking one for a result is the exact confusion that hid
88 runs' worth of failure in July. If a spec does appear, fix the spec; do not restart the count by
loosening it.

### One thing worth recording about the instrument itself.
Its recursive descent into nested suites is load-bearing, not defensive polish: three e2e files use
`test.describe`, **including `panel-overflow.spec.js`** — one of the two specs this exists to watch. Proven
against a real Playwright artifact rather than a fixture: on a genuine depth-2 report the shipped walker
reports `walked 1`, and the non-recursive mutant reports `walked 0` while still printing "no flaky specs".
A top-level-only walk would have been blind to exactly the spec it was built for, and would have said so in
the language of a clean run. The `walked` denominator and the cross-check against Playwright's own
`stats.flaky` are what make that failure loud instead of reassuring.

---

## 2026-08-09 (late) — the SOTA audit's four "explicitly not checked" items, now checked

The audit closed with an honest limit: *"Explicitly not checked, because no execution was permitted:
whether the gate is ever actually run; whether antialiasing is granted under the software rasteriser; the
diorama's mount order relative to capture-mode entry; any post-fix measurement of the menu residual. Every
'this will help' claim above is mechanism-verified, not outcome-verified."* Kevin asked what to do about
them. Execution is permitted now, so they were measured rather than reasoned about. **[LOOP]**

### ① Is the visual gate ever actually run? — **No, not automatically, and that stays true by decision.**
It is in neither `.githooks/pre-push` nor `ci.yml`; the hook contains only a comment reminding a human to
run it. Measured 733 s (37 s of which is literal sleeps), and every baseline is macOS arm64 against Ubuntu
x86-64 runners, so CI would compare across a published cross-platform pixel-parity problem.

What was *unanswerable* before is answerable now: `tests/visual/baseline/.capture-meta.json` (REMOVED 2026-10-28, W2-B) (landed with
the provenance work) stamps `startedAt`/`finishedAt` on every capture. Last run **2026-08-09 04:52:11 ->
05:07:36, 925 s, `complete: true`, `crashes: 0`**, on ANGLE/SwiftShader Vulkan 1.3.0, darwin-arm64. Before
that file existed, "when was this oracle last exercised" had no answer at all — which is the more important
half of the audit's question. The instrument now exists; the scheduling stays manual.

### ② Is antialiasing granted under `--use-angle=swiftshader`? — **Yes: 4x MSAA, and it is honoured.**
Probed with the capture's exact launch flags (throwaway probe, deleted; no port bound): requesting
`antialias: true` returns `granted: true` with `SAMPLES 4`, `MAX_SAMPLES 4`; requesting `false` returns
`SAMPLES 0`. The software rasteriser is not silently ignoring the request in either direction.

**What that explains — and, carefully, what it does not.** Only ONE surface asks for it:
`TitleDiorama.jsx:143` (`antialias: true`), which is the `menu` frame. `GameScene.jsx:125` sets
`antialias: false` because post-processing handles AA. So the single frame with MSAA enabled was the single
noisiest frame, and its diff signature was *"hairline outlines tracing every edge of the mascot"* — exactly
what an MSAA resolve does to a small geometric difference. **AA was the AMPLIFIER, not the cause.** MSAA is
deterministic given identical geometry, and the residual went to 0.0000% once the animated-phase reset
landed with no AA change at all. Recording this so nobody later reads "AA was on" as the diagnosis and
disables it: that would blur the frame without removing a single source of variance.

It also confirms the comparator is configured correctly. `pixelmatch`'s `includeAA` default of `false` is
the antialiasing-AWARE setting (the name reads backwards), and the gate leaves it at the default. Against a
frame that genuinely carries 4x MSAA, that default is the right one and is now measured, not assumed.

### ③ Diorama mount order relative to capture-mode entry — **checked earlier this session**, at Kevin's
explicit instruction, and recorded in the preceding entry's order of execution as step (0). The canvas is
present when `enterCapture` fires, so neither the phase fix nor `04148c8` is inert.

### ④ Post-fix measurement of the menu residual — **done: 0.0000%, byte-identical across separate
processes**, from 0.984/0.455/0.359/0.557%. Evidence in the "capture determinism SOLVED" entry above.

### And one recommendation the audit made that was never separately decided.
Under "Declined on purpose -> Moving the visual gate to CI", the audit kept a carve-out: *"Worth doing
cheaply: a Linux self-consistency job that captures twice and diffs run A against run B, touching no
baseline."* The preceding entry says "do not move the visual gate to CI", which settles the MIGRATION but
not this. Deciding it explicitly rather than letting it evaporate: **[LOOP] declined.** Its signal —
does capture reproduce itself — is now covered twice at a fraction of the cost, by
`assertIntraPageDeterminism` (a standing gate, no baseline, cannot rot) and by the measured 0.0000%
cross-process result. A second ~15-minute Ubuntu job per push, on a platform we ship no baselines for,
would buy a third reading of a question already answered exactly.

---

## 2026-08-09 (late) — Phase C step 1: the deterministic capture CLOCK, and what probing it revealed

### Why suppression was ever the design. **[LOOP]**
Substituting for reality needs two primitives and this repo only ever had one. `captureMode.js` shipped
seeded per-key PRNG streams in `captureRandom`; **nothing ever substituted TIME.** So against 72 clock
reads, any system left running under capture advances by WALL TIME — and boot length varies 1.68-10.43 s
per process, so the frame samples a run-dependent phase. Turning systems OFF was the only way to get a
stable frame, and that is why 116 `isCaptureMode()` sites across 61 files exist, 31 of them early-returns.

`src/devtest/captureClock.js` supplies the missing half: under capture, time is a pure function of HOW
MANY FRAMES HAVE BEEN RENDERED. Two processes reaching frame 90 by different routes read the same clock.
`CAPTURE_DT` is a fixed 1/60 and deliberately NOT the display's refresh rate — reading the monitor would
make Kevin's 120 Hz ProMotion screen and a CI runner render different frames from identical code.

### The non-obvious bug, found before it shipped.
This app mounts **three** `<Canvas>` elements (GameScene, TitleDiorama, MascotStudio), each with its own
render loop. Had each advanced the counter, a frame would cost three ticks — and because the diorama is
`React.lazy`, the RATE would change the instant its chunk resolved. Elapsed time would then depend on when
a network-ish event landed: **the same run-dependent phase the clock exists to remove, reintroduced by its
own fix.** Ticks are deduped on `document.timeline.currentTime`, which by spec advances once per animation
frame and reads identically for every callback within it.

### What probing the running app changed about the plan.
The clock was probed in a real headless browser rather than assumed to work. It ticks — and after **2
seconds of wall time under capture, only 2 frames had elapsed**, i.e. 33 ms of virtual time. That is
SwiftShader's ~1 fps, and it is correct behaviour, but it has a consequence for the rest of Phase C that
was not in the plan:

**A frame-indexed clock alone does not put motion into the frame.** Waiting wall-clock time before a shot
now advances the world by almost nothing, so an un-suppressed system would be captured at its start pose —
deterministic, and just as uninformative as suppression. So the remaining work needs a HARNESS change as
well as per-subsystem edits: **step the clock to a declared frame index, then shoot** (`advance N frames`
→ `shot()`), which makes the captured phase an explicit, reviewable constant instead of an emergent
property of how fast the machine happened to render.

That ordering matters and is recorded before the work rather than discovered during it: converting a
subsystem from suppression to substitution WITHOUT step-then-shoot would produce frames that are stable,
still, and no more informative than today's.

### Also recorded: a leak I caused, and the guard that half-caught it.
The probe called `srv.kill()`; `_serve.mjs` returns `{ server, url, waitReady, shutdown }`. The `finally`
threw and vite was orphaned on port 4181. `kill-test-procs.sh` then REFUSED to sweep — correctly, by
design, because the process was under 3 minutes old and could have been a live run. Killed by PID, port
verified clear, probe deleted. The standing rule earns its place again: hand-started means hand-killed,
and a throwaway probe must use the helper's actual contract rather than a plausible-looking method name.

---

## 2026-08-11 — [KEVIN] full design authority over every feature, advertised or not

Kevin, verbatim: *"for any 'advertised' feature (or non-advertised feature), you should deeply and
holistically evaluate if it's worth keeping / wiring up / or deleting. any feature / characteristic of
this game is up for enhancement / modification / deletion as you decide best. no need to wait for my
decision."*

**This supersedes the 2026-08-11 batching decision.** Thirty-three audit findings were filed to
`KEVIN-REVIEW-BATCH.md` on the grounds that "a feature built, advertised and never wired" is a product
call rather than a bug. That reasoning was correct under the old authority and is now moot: the call is
mine. Those entries stay in the batch file as a RECORD of what was decided and why, but they are no
longer blocked on an answer.

**What the grant does NOT change**, because none of it was about design authority:
- Irreversible or outward-facing actions still stop for Kevin — force-push, external send, money,
  accounts, publishing, a NEW dependency, hard-deleting a referenced file.
- Every deletion still needs the same evidence a fix does: the consumer graph traced, the finding
  mutation-proven, and ARCHIVE-over-DELETE where the artifact has independent value.
- Recorded decisions are not silently reversed. A reversal is a new dated entry naming the one it
  supersedes — this entry being the example.

**The bar I will hold myself to,** since "as you decide best" is the whole instruction and a lazy
reading of it is "delete everything unwired": the question is not *is this code reachable* but *does
this make the game better*. A feature reachable by four entry surfaces and localized into two languages
was someone's intent; deleting it is a real cost, not a tidy-up. Wiring costs build time and adds
surface to maintain. I will state which of the two I chose and why, per feature, in the commit that
does it — and where a feature is genuinely worth having but too large for the current unit, it goes to
`ROADMAP.md` as a named unit rather than being deleted for convenience or left rotting for honesty.

---

## 2026-08-11 — Phase C step 3: the capture clock becomes a COMMANDED clock

**Supersedes the free-running half of "2026-08-09 (late) — Phase C step 1: the deterministic capture
CLOCK".** That entry stands on everything else: the clock exists, `CAPTURE_DT` is deliberately not the
display refresh rate, and the three-canvas dedupe on `document.timeline.currentTime` is correct. What is
reversed is one sentence — *"under capture, time is a pure function of HOW MANY FRAMES HAVE BEEN
RENDERED"*. That is exactly what made the phase run-dependent.

### The premise that was wrong, measured rather than argued. **[LOOP]**
`advanceCaptureFrame` runs from `CaptureClockTicker`, mounted in all three `<Canvas>` elements, so the
counter climbs once per RENDERED frame. The harness then waits wall-clock time before each shot, on a
renderer managing about 1 fps. So "frame index at shot time" is a function of how many frames the machine
drew — which is the machine, not the code. Probed on ONE box, identical code, identical schedule, five
sample points, two runs:

| | phase samples |
|---|---|
| run 1 | 6, 10, 13, 15, 16 |
| run 2 | 6, 11, 13, 14, 16 |

Two of five diverge without leaving the machine. Across a fast laptop and a CI runner the spread is
unbounded. **This is the same run-dependent phase the clock was built to remove, reproduced one level up,
inside the fix.** It was invisible because it is latent: nothing read the clock, so nothing could vary
because of it. It would have gone live with the first subsystem converted — which is to say, it would
have been discovered as flapping baselines rather than as a design error.

### And a second reason, which is the one that makes freezing necessary rather than tidy.
`shot()` photographs only after `waitForStableFrame` reports two consecutive IDENTICAL frames. A world
animating off a still-ticking clock never produces two identical frames. **A stability wait and a
free-running clock cannot both be satisfied once anything reads the clock** — the world has to be STILL
at the declared phase to be photographable twice. This was not visible while every animated system was
suppressed, because a suppressed world is still by construction.

### The decision. **[LOOP]**
`setCaptureFrame(n)` sets the phase ABSOLUTELY and freezes the clock; `resetCaptureClock()` thaws, so each
captured state is free to tick during its own setup and is then pinned before its shot. `shot()` in
`frontend/scripts/visual/capture.mjs` (REMOVED 2026-10-28, W2-B) pins before the stability wait, records what the page actually
returned, and the run prints the denominator and fails on any frame shot at an undeclared phase.
`CAPTURE_PHASE_FRAMES = 90` — 1.5 s of virtual time, one constant rather than a per-state parameter,
because a phase that varies by state is one more thing a baseline diff can disagree about for a reason
nobody remembers.

### What this constrains, and it is a real limit rather than a caveat.
Under a commanded clock the world jumps from 0 to the declared phase in ONE step. That is exact for any
animation which is a closed-form function of absolute time (a shader `time` uniform, a sway, a rotation),
and WRONG for an integrator that accumulates per-frame deltas — 90 small steps and one large step are not
the same trajectory. Stepping an integrator honestly would mean rendering 90 frames per shot at ~1 fps,
i.e. 90 seconds x 31 states, which is not a harness anyone will run.

**So the conversion candidates are closed-form animations, and integrator-driven systems stay
suppressed.** That residue is a correct stopping point, not unfinished work, and it should be stated that
way when the suppression census is worked rather than discovered again per subsystem.

### Also recorded: a commit title that outran its diff.
`7d743d6` is titled "step-then-shoot" and says it wired the hook "so the harness can drive it". It touched
`App.jsx`, `captureClock.js` and that module's gate. `capture.mjs` had zero references to it. The
primitive and the bridge hook shipped; the caller never did, and no gate asserted the CALLER — this
repo's most-repeated defect class, inside the harness built to catch it. `tests/scripts/capture-preflight.test.js` (REMOVED 2026-10-28, W2-B)
now asserts it, and the assertion goes red against exactly the `7d743d6` state.

---

## 2026-09-22 — commit `5348c0b8` carries the WRONG message. Read this instead.

**What happened.** I wrote a defensive line into a commit script:

```
git commit -F <scratchpad>/msg.txt 2>/dev/null || true
```

intending a no-op — a leftover path that I expected to fail harmlessly, guarded by `|| true`. It did not
fail. `msg.txt` still existed from earlier in the same session (the MSAA / render-cost work, already
committed separately as `9c52cd02`), so the command SUCCEEDED and committed the staged gate work under
that stale, unrelated message. It was pushed before I read the output.

**The lesson, and it is the one this repo keeps paying for in a new costume:** `|| true` does not make a
command a no-op, it makes its FAILURE invisible. I had reasoned about what the command would do when the
file was absent and never about what it would do when present — the same shape as every gate in this
campaign that was green over input it never examined. A guard that hides an outcome is not a guard.

**What `5348c0b8` actually contains** (9 files; the message describing MSAA, dprCap and godRaySamples
belongs to `9c52cd02` and the commits around it):

- the last six check files brought above 0/5 on `gate-census.mjs` — `chrome-brand-conformance`,
  `title-screen-brand`, `heartbeat-stable-interval`, `touch-wiring`, `hud-declutter`, `npc-spawn`
- `tests/gates/_srcWalk.js` — `strip()` fixed to remove TRAILING `// comments`, which it never had. The
  helper ~10 gates share, whose whole purpose is to stop a gate being satisfied by prose, was doing half
  its job. It reddened a carrier list written an hour earlier the moment it was fixed.
- `tests/sanity.test.js` — documented as deliberately 0/5 (it has no subject; its job is to prove the
  runner executed anything at all) and given the one case it lacked: proof that an assertion can FAIL.
- brand conformance widened from 2 files to all 308, and its patterns strengthened as a result: the old
  file had deliberately weakened `confetti` to an implementation-signature match because a historical
  comment would have tripped the bare word. Stripping comments solves that properly.
- `touch-wiring`'s pointer-lock check widened from 4 hand-named files to repo-wide — which immediately
  disproved the claim I wrote into it. There are TWO readers of `document.pointerLockElement` in code,
  not one: `Components.jsx:510` (the authority, owns `pointerlockchange`, writes `setActive()`) and
  `input/pointerLook.js:32` (guards its own mousemove on the lock being held at all, deliberately not on
  which element holds it). That is a real tension with this repo's "consumers read `getInput().active`"
  rule, and it is now pinned as a PAIR so a third reader reds.

Campaign state at that commit: **32 check files at 0/5 → 0**; the five remaining 0/5 rows are
`scripts/ci` helper modules, which are not checks and are each driven by tests elsewhere.
