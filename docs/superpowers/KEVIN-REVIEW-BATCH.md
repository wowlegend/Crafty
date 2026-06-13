# Kevin — Review / Decide Batch (Crafty SOTA master-plan autonomous run)

> **🔄 REFRESHED 2026-06-10 (pre-loop clean line). LIVE items below; EVERYTHING under "HISTORICAL" further
> down is pre-2026-06-10 — its statuses are superseded (WILDHEART shipped+merged; the look reference was
> locked + built; VOIDHAND designed + M1 shipped; the loot-showcase capture state shipped; music policy is
> now LOOP-OWNED per the charter). Under the autonomous loop this file is the ASYNC review surface: the
> loop appends decisions-of-record + before/after eyeballs here and keeps building; nothing here blocks it
> except the physically-Kevin items.**
>
> **LIVE — needs Kevin (when convenient; none block the loop):**
> 1. **🎬 Beast-frame eyeball (#64):** the 4 punchy roster frames (`frontend/tests/visual/current/beast-*.png`)
>    still await your ratify/drop call; the capture-reliability fix comes first (the frames flake — tracked).
> 2. **📱 M2 iPad FPS run — READY (2026-06-10, one-tap, ~5 min, bundles #63):** the harness SHIPPED and the
>    desktop gate PASSED (C−B 0.00ms median / +0.10ms p95 vs the 1.5/3.0ms budget, ANGLE Metal M3 Max —
>    full verdict + numbers in `memory/S2B2-M2-PERF.md`). Your part: Mac `cd /Users/kz/Code/Crafty/frontend
>    && npx vite --host` → iPad Safari `http://<mac-LAN-ip>:5173/?perf=B` (wait for the on-screen DONE
>    numbers) → then `?perf=C` → compare medians vs the budget (no Safari inspector needed). **Same session:
>    the #63 WILDHEART golem check** per `memory/S2B1-M2-PERF.md` §4. Does NOT block M3 — the loop proceeds.
>    *M2 decisions-of-record (loop, charter §5; reversal = plan-doc/PhantomBlockSystem edits):* budget pinned
>    at the STATE-REVIEW rec (1.5ms median / 3ms p95, C−B) · phantom pointLight moved to a fixed light pool
>    (always-mounted, intensity-gated — D-scenario-verified no edge hitch) · probe SM-skip in Components
>    (dev-only) · desktop runner = headless-new + Metal (headed Chrome is occlusion-suspended from agent
>    contexts; renderer string stamped in every report).
> 3. **🕹️ Playtest eyeballs queued:** **VOIDHAND FPV-FEEL (2026-06-10, the spec's M3 human gate):** press V
>    near a block → the phantom orbits → LEFT-click HURLS it at a mob (ballistic arc, element spark at
>    impact) → or RIGHT-click SLAMS a 3m AoE at the phantom's current orbit position (time the orbit = the
>    aim skill — a loop taste-decision, flag if it reads as random instead of skillful). Question to answer:
>    "does the aim feel learnable?" **M4 additions to the same playtest:** unlock Kinetic Grasp in the
>    Voidhand tree → day-kills fill the violet bar → V costs 25 → **hurl a mob INTO YOUR WALL = 3× (the
>    anvil — does the bonus READ?)**. *M4 decisions-of-record (reversal = one-liners): HUD bar renders only
>    when the talent is unlocked (no meter for a locked ability; keeps baselines); gold "WALL HIT!" label +
>    wall flash deferred to M7; walls PRISTINE on anvil hits (Decision #3 rec); kinetic = the phantom-rim
>    violet #B36BFF (one identity color per Aspect).* **M7 LOOK lock (2026-06-10, judged in-world):**
>    BEFORE frames at `.superpowers/s2b2-voidhand-m7-refs/held-*.png` — the night phantom already reads as
>    ink-silhouette + crisp violet rim (kept); building: faint emissive face-lift (night identity), impact
>    core-flash, gold WALL HIT! label. Element held-tint = NO (spec rec confirmed). **M7 SHIPPED (iters
>    26-30): AFTER frames are in beside the BEFOREs** (`after-t1-locked-1.png` = the night grass-block
>    identity restored; `flash-slam-v2-*` = the impact glint+bloom; the full flash envelope is numeric —
>    see the design doc). In-playtest: hurl a mob into your wall and watch for the gold WALL HIT! + the
>    bigger flash — that's the 3x landing. **AUDIO (2026-06-10, the interleave unit): the game now SOUNDS its
>    Aspects** — the roar finally roars (low feral sweep), grab chirps a whole-tone shimmer (the voidhand
>    motif), hurl whooshes, slam thumps with the camera kick, anvil hits ping gold. All synthesized in-engine
>    (#74 loop decision: ALL-SYNTH — external gen rejected v1, reversal = S4 side-by-side). EAR CHECK: do the
>    five read as one coherent family with the existing pad/arp? Tunables = the generate*Sound builders.
>    **SOULBIND SNARE (2026-06-10, M4): the third Aspect's verb plays** — unlock Soul Snare in the talent
>    tree, bank Soul on day kills, weaken a hostile to <=30% (its health bar turns JADE = bindable), hold X
>    aimed at it ~1.1s (a jade tether tightens) -> the bind chime + the creature joins you re-tinted jade.
>    UPDATE (M6 shipped): FUSE is live — bind two creatures (spider+zombie / cow+skeleton /
>    skeleton+spider), stand by them, hold X: a jade thread braids them into ONE hybrid (Dreadweaver /
>    Bonehide Bulwark / Marrowspinner). The Soul bar (jade) reads under the Kinetic bar once Soul Snare
>    is unlocked. ****🎼 ASPECT STINGERS (music-motif v2):** each Aspect now SINGS at its signature moment — transform
>    (a primal saw rise), slam (a falling gravity phrase), FUSE (a warm major arp), the day's first
>    zone (a lydian shimmer). All rare by design. EAR CHECK: do they feel premium or intrusive?
>
> **🦴 NEW MOBS (the content interleave):** three new night-siege types — the SKITTERLING (tiny
>    violet spider-legged swarm), the DUSKHOUND (dark-plum fast quad), the MOSS BRUTE (huge slow tank,
>    spawns rare via the new weighted table). Duskhound+skeleton FUSE into the GRIMHOUND. Card:
>    .superpowers/mob-variety-refs/mobs-card-1.png — eyeball IN-GAME at night: do the three read
>    distinct mid-siege? Is the brute scary enough?
>
> **🏆 THE SPINE IS COMPLETE — the ELEMANCER playtest protocol (~4 min):** unlock Elemental Focus →
>    Elemental Imbue in the talent panel (the HOW IT PLAYS card is right above). Build by day — watch
>    the white-gold bar fill from mining/placing. Press Z (the ring haloes the crosshair), cast at the
>    ground: the zone paints + its voice plays. Try: 1 (fire — the burn zone chars the ground when it
>    dies), 2 onto a fire zone (ice — STEAM, both vanish), 4 then 1 onto the rune (arcane — the next
>    zone comes out BIGGER), 3 near water (lightning pulses). Mobs crossing burn; frozen mobs crawl.
>
> **🜔 ELEMANCER M6 (the look) eyeball cue:** zones now RENDER — element-colored breathing rings on
>    ink skirts (fire orange/ice blue/lightning yellow/arcane violet), char scorch where fires burned
>    out, the four synth voices at spawn, the white-gold Resonance bar. The judge card verified
>    color/geometry; the EMISSIVE pop is night-context — eyeball one night siege with zones down:
>    do the rings read premium against dark terrain? (.superpowers/s2b4-elemancer-refs/zones-card-1.png)
>
> **🜂 YOUR ASPECT-UX ASK — SHIPPED:** the talent panel (the Aspects panel) now opens every column
>    with a HOW IT PLAYS card: the key (R/V/X/Z), what banks the meter, and the loop in 3-4 steps
>    (e.g. SOULBIND: weaken to a third [jade bar] → hold X → it fights for you → two together + X =
>    FUSE). Header retitled — the four-powers/four-keys model is stated in one line. EYEBALL: open the
>    talent panel; is the loop clear enough that Marcus could run each Aspect from the card alone?
>
> **🛠️ YOUR 2026-06-10 PLAYTEST FIXES — ALL SIX SHIPPED (re-verify protocol, ~3 min):**
>    (1) RESPAWN: die FAR from spawn (>100 blocks out — the bug only triggered there), respawn → you
>    should land and MOVE immediately; (2) ESC in-game → the PAUSE/settings menu (not the title screen);
>    close it → you're back in control; (3) open/close EVERY panel (inventory/crafting/magic/build/
>    trading/achievements/talents) → the cursor never vanishes mid-menu, the lock restores on close;
>    (4) die → the DEATH SCREEN is unoccluded (no title menu over it), Respawn is clickable immediately;
>    (5) you can NOT fire while dead. Root causes + the 6-commit trail in
>    docs/superpowers/plans/2026-06-11-crafty-kevin-respawn-pointerlock-cleanup.md. FOLLOW-UPS FLAGGED:
>    real world-pause while menus are open (mobs currently keep moving); the 4 panel flags → store.
>
> EYEBALL ASK (2 min, now with the showcase shortcut — `window.__craftyTest.call('soulbindShowcase')` in the dev console renders the 5-creature judge card):** the loop's headless judges verified FUNCTION (mesh census:
>    allies render; fusion births hybrids live) but a clean AESTHETIC frame defeated 4 instruments — in
>    YOUR playtest please eyeball: the jade family (tether/tint/bar) reads as ONE Aspect? the 3 hybrid
>    silhouettes read distinct? (The showcase fixture shipped — the console shortcut above.) **FEEL PASS (post-Aspect): allies now
>    visibly SWING (a squash-stretch pulse on each attack) and binding/fusion lands a jade halo ceremony —
>    watch for both in the siege.)** Also: cool-rim ice/lightning in live play · punchy glow in-world · the FPV
>    beast-form interim treatment once #71 ships · mob knockback/feel after the #68 15Hz-AI change ·
>    **#72 click-feel (2026-06-10):** every click now routes to exactly ONE verb (swinging at mobs can't
>    erode your walls; casts can't place blocks; chest-open is occlusion-correct) — verify mine/place/
>    melee/cast all FEEL unchanged in normal play. **Heads-up: mining/placing had been SILENTLY BROKEN at
>    HEAD** (a rapier field rename made the old listener compute NaN coordinates — sounds played, no real
>    edit) — the router work found + fixed it, so block-editing genuinely works again; if building feels
>    "suddenly different", that's why. *Decision-of-record (loop): target-priority routing, no lanes/modes;
>    a hotbar hand-slot lane model is the recorded reversal path (revisit w/ #71 hotbar honesty).*
> 4. **🔗 SOULBIND (B3) design batch (2026-06-10 — the loop proceeds on the recs, reversals recorded):**
>    the design-of-record is `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md`. Your four
>    calls (§8): (1) v1 = "player stays the tank" (enemies never target allies until the v2 worker-faction
>    milestone — rec YES; the alternative was the schedule risk every design lens flagged); (2) pets vs
>    squad — two companion systems would coexist; rec: keep pets cosmetic, fold tame into SOULBIND at v2;
>    (3) the 3-hybrid roster taste (Dreadweaver/Bonehide Bulwark/Marrowspinner) + spectral jade #3DFFB0;
>    (4) squad cap 2+1-talent, costs 35/50. Also locked en route: kill-bus killer-attribution ships FIRST
>    (closes an ally-AFK-farm exploit that exists the moment any ally can kill).
> 5. **🜔 ELEMANCER (B4) design batch (2026-06-10 — the loop proceeds on the recs):** the design-of-record
>    is `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md`. The headline: v1 is an
>    OVERLAY-ONLY chemistry Aspect (zero voxel edits — your iPad perf gate stays respected; real terrain
>    mutation is a designed v2 seam). Your calls (§8): (1) the fantasy honesty — pristine trees DON'T burn
>    in v1; fire spreads along YOUR built wood + reagent blocks (rec YES: building becomes the fuel);
>    (2) the Resonance meter banks from BUILD verbs, not kills (rec YES — the novel economy);
>    (3) white-gold #F5D76E identity + the four zone looks (judged at M6's showcase card); (4) the tunables.
> 6. **🜔 ELEMANCER M5 playtest cue (2026-06-10):** the verb PLAYS — mine/place by day to bank
>    Resonance (watch it on the save), unlock Elemental Imbue (after Elemental Focus), press Z (the
>    white-gold IMBUE ring appears at screen center), cast at the ground: the element's zone paints
>    in. Fire onto a frozen zone = both vanish (steam); cast onto an arcane rune = the zone comes
>    out bigger. (Zones are logic-only until M6 paints them — judge by mob behavior: burn ticks,
>    frozen crawl, the rune draws aggro.)
> 7. **💰 Standing S4 decisions (unchanged, parked by design):** monetization model · multiplayer scope.
> 8. **📜 Master-plan v2 rewrite (2026-06-10, under your authority grant) — async ratify:** SOTA-INITIATIVE.md
>    fully rewritten as a LIVING plan (v1 preserved at `git show ddfdf96:SOTA-INITIATIVE.md`). One NEW
>    loop-PROPOSED policy inside it needs your eventual yes/no: **S3 early-entry relaxation** — recorded
>    decision stays "S3 after ALL 4 Aspects"; proposed escape hatch = enter at ≥3 Aspects IF a forcing event
>    lands (touch becomes load-bearing externally, or a hard perf wall). Reversal = delete the clause.
> 9. **🧰 Two small items the HISTORICAL sweep would otherwise bury:** #32 vitest 3→4 security bump (dev-only
>    exposure — confirm transfer to loop, or dismiss) · the forced-med/low tier baselines from S2-A-M4b
>    (ratify into the gate, or hand the call to the loop).
>    **UPDATE 2026-06-13 (dependabot #29, now concrete):** `npm audit` = 6 vulns (1 critical + 5 high), ALL in
>    the build/test toolchain (esbuild 0.17–0.28 → vite → vitest/plugin-react/vite-node; GHSA-gv7w-rqvm-qjhr —
>    esbuild Deno-module integrity RCE via `NPM_CONFIG_REGISTRY`). **Dev/build-time ONLY — esbuild/vite are not
>    in the shipped game bundle, so no end-user exposure.** The clean fix is `vite@8` = a 2-major breaking jump
>    from the current Vite 6 (touches build + the vitest config + the visual-capture pipeline) → the loop will
>    schedule it as its OWN migration milestone (folds with the #32 vitest bump above), not a casual fix. No
>    action needed from you; flag if you want it prioritized ahead of the S3 stream.
>
> **Decisions TRANSFERRED to the loop (charter §5, Kevin 2026-06-10):** music tooling + per-Aspect motif
> policy (#74) · loot-beam punchiness · hotbar honesty approach · coin sinks · named regions · deep-night
> obsidian · taste-tunables previously listed as "pending Kevin" — the loop decides on evidence, logs the
> decision + reversal path HERE, and proceeds.
>
> ---
>
> ## HISTORICAL (pre-2026-06-10 — statuses superseded EXCEPT where re-listed in LIVE above; kept for the record)

> **🐾 PLAYABLE — S2-B1 WILDHEART M0-M5 built (7/8 milestones, 2026-06-07).** Bank Ferocity by day-kills → roar in the night siege → become an element-beast that now FIGHTS + MOVES distinctly (M5 combat + locomotion re-skin). Each milestone TDD-gated + adversarial-reviewed (the M5 review caught a real spark/form-desync — a lightning-hawk could throw fire sparks after a spell-switch — fixed pre-merge by deriving the spark from the LOCKED form). **M5 taste-tunables (all reversible — proceeding on my defaults unless you redirect; full table + in-app motion check in `memory/S2B1-M5-MOTION.md`):** the per-form damage/cooldown/move/gravity/jump numbers; **`turnRate` OMITTED** (camera-relative pointer-lock = no turn-rate seam; a tank-turn would be an S3 controller change, not a table field); the **dodge-roll + ledge-vault are deliberately form-INVARIANT** (i-frame fairness + traversal reliability — flag if you want a comet-far / golem-short dodge); the mob-layer hit-spray threshold now tracks form-multiplied damage (heavy forms spray more — intended). **NEXT = M6** (signature talent nodes incl. the `wildheart_roar` unlock) → M7-M8 (the LOOK — still gated on the ONE blocking look-reference decision below).

> **🐾 HARD GATE — S2-B1 WILDHEART design spec ready for your review (2026-06-07).** The LEAD Aspect (beast-transform). DESIGN-OF-RECORD at `docs/superpowers/specs/2026-06-07-crafty-s2b1-wildheart-design.md`, produced by an 11-agent design-workflow (5 code-seam mappers + 2 live-research lanes → synth → 3 adversarial reviewers) then reconciled by me. **The review earned its keep — it caught 4 BLOCKING defects I'd otherwise have built:** death-restore wired to the wrong transition (would strand a kid in beast-form through the death screen), ferocity accrual stomping the already-owned `onMobKill` slot (would silently break quests), an unlock-node crash in `foldTalentEffects`, and a fake input-abstraction. All corrected in v2. **CONCEPT (locked in the S2 spec):** hold-roar → become an element-beast (the loaded spell-element picks the form); your 2 attack intents re-skin per beast (zero new menu); a Ferocity meter banks in the day, unleashes in the night siege. **TWO-LAYER:** the mechanics are blind-buildable + TDD-gated; **the LOOK (the morph VFX + the 4 beast forms) is a reference-LOCK + in-world decision (the VFX discipline) — I will NOT blind-build it.**
> &nbsp;&nbsp;**THE ONE GENUINE BLOCKING DECISION (spec §8 #1, blocks only the look milestones M7/M8):** lock the beast-look REFERENCE direction — options I researched: **Bayonetta Origins** (crisp-not-blobby north star + literal roar), **Brawl Stars** (closest bright/kid-safe comp), **LoL transform-ults**, **Genshin elemental bursts**, **Hades** (or a blend). I'll prototype in-world (real Caribbean context, grayscale-judged), not a sky-studio frame.
> &nbsp;&nbsp;**The rest of §8 are reversible taste-tunables — I'll PROCEED on the spec's recommendations unless you redirect:** ferocity tuning (kills-only + per-tier scaling; bleed-to-zero at dawn), beast roster + the **counter-intuitive element map** (fire→comet / **ice→bull** / lightning→hawk / arcane→golem — flag if you'd rather fire→the heavy charger), talent taxonomy, per-beast combat-differentiation depth + collider/locomotion numbers, the bull's debris-shove (FPS-gated), the Ferocity HUD "feral" color token, and the roar keybinding.
> &nbsp;&nbsp;**Ask:** approve the design to start the build (M1 = the transactional collider-swap + restore-invariant, the de-risk-first item — decision-independent), and lock (or defer) the look reference whenever — it only gates M7/M8. The mechanics M1-M6 + M3.5 proceed without it.

> **🪙 SHIPPED — S2-A-M3c (loot juice) merged → ALL of M3 (the stakes loop) done.** Drop-beams now **tier by rarity** (taller/brighter for legendary, off the locked palette) + a rarity-tinted **pickup pop** + the pickup sound. **EYEBALL GAP (player-experience lens):** the beam/pop LOOK is NOT covered by the visual gate — loot drops need mob kills, which don't happen in the 12 capture states, so no automated test renders them. Whether it reads well per rarity / the pop feels right is **unverified**. Want me to (a) add a dev "loot-showcase" capture state (a fixture drop, so the gate + your eyeball both see it), (b) record a short clip, or (c) leave it for your next playtest? Tunable look constants live in `frontend/src/game/lootJuice.js`.

> **🎵 MUSIC — you asked how I'll treat/enhance it + flagged your ElevenLabs API key (CLI access).** My plan + the tooling question are answered in-thread (this turn). TL;DR: the engine side (adaptive layering/transitions) is the real upgrade and is tool-agnostic; for GENERATING the stems, ElevenLabs Music is a strong SOTA option (others: Suno/Udio higher-fidelity-songs but licensing/API maturity varies; Stable Audio for loopable game stems). **Decide later** (per you) — when we hit the music pass (folded into S2-B per the master plan). Not blocking.

> **🌗 SHIPPED — S2-A-M3a (day/night clock) + M3b (night siege + survive-to-dawn reward) merged (2026-06-03).** Day↔night now auto-cycles (your "still day after the dragon" fixed). Night = an **escalating siege** (more/hostile mobs per night survived, capped); **survive to dawn → reward** = scaling XP + a guaranteed rarity-climbing loot drop + **coins** (a new persistent currency seeding the future S4 shop). **Death = SOFT** (respawn, keep everything — your pick; locked by a test). **KNOBS to tune anytime (reversible constants):** siege ramp (maxMobs 16→40, hostileChance 0.7→0.95 over ~6 nights), dawn reward (50 XP + 10 coins per night survived + 1 loot drop, rarity climbing rare→epic→legendary). **ONE design Q:** night currently keeps the **dusk** mood and **obsidian (the dark dramatic mood) stays BOSS-only** (cleaner signature) — do you want deep/late nights to also tint toward obsidian? Default = no. 507 unit · 12/12 visual. **NEXT = M3c loot-juice** (rarity drop-beams + pickup pop — none exists today).

> **🗺️ CONTENT-DIVERSITY — you asked "when do we address mob variety/designs, landscape gen/designs, music?" (2026-06-03). Honest answer: none is a first-class milestone in the master plan — they're SEAMS (the same blind-spot that hit projectile-variety).** Current state: **mobs** = 6 box-template swaps (color + box-proportions + stats; render language done S1-B, but no distinct creature designs/behaviors); **landscape** = basic height-grid biome gen + S1 materials (no designed-biome variety); **music** = 3 procedural chord loops (day/night/boss), reactive — the plan literally says "audio folds into S1 polish" but S1 didn't deepen it. Why late = deliberate (pillar P1: signature DEPTH via the 4 Aspects before content BREADTH). **My proposed scheduling (proceeding unless you redirect):** (1) **music** — a light per-context motif pass folded into each S2-B Aspect (cheapest high-impact, rides work already happening); (2) **mob/bestiary designs** — a dedicated pass AFTER S2-B3 Soulbind (so creature designs serve the capture/transform mechanics); (3) **landscape/biome designs** — a "world design" milestone late-S2 (look/feel) with gen-systems hardening in S3. All three get concretely surfaced + measured by the **pre-S2-B content-variety sub-audit you already greenlit.** Want them formalized as named milestones in `SOTA-INITIATIVE.md` now, or keep folded + let the audit drive it? (Default: add to the plan + let the audit drive.)

> **💰 MONETIZATION — sell-power question RESOLVED (legal) + open (your S4 model choice). (2026-06-03, you asked + I verified multi-source.)** **Sell-power is NOT illegal / not a certain legal blocker** → per your rule, dropped the blanket no-P2W veto; it's no longer a pillar (monetization = an S4 decision, not a coherence invariant). **The certain legal lines that DO bind us** (FTC Genshin $20M = COPPA + deceiving kids about odds + *randomized lootboxes* to under-16): no randomized **gacha/lootboxes** (esp. to minors), **COPPA** (under-16 purchases need parental consent; no kid dark-patterns), odds-disclosure if random. Web-first = no app-store rules (keep ~97%); later iOS/Mac app adds Apple odds-disclosure-if-random + the 30% cut (Apple doesn't ban sell-power). **Commercial reality (your "more viral/sells more" hypothesis — half-right but mostly backwards for us):** P2W = more per-whale (0.19% players ≈ 48% rev) BUT hurts retention/word-of-mouth/virality; **cosmetics are the #1 IAP category (≈80% of revenue in Fortnite/Roblox/League)** + power the clip-worthy viral loop; Chinese→Western "detox" (gacha→cosmetics+fair-pass) RAISED retention while whales still spent. For a virality-led broad-audience game, fair/cosmetic-led beats P2W. Caveat: Crafty is PvE/co-op not competitive PvP → convenience/progression sales are more tolerable. **YOUR S4 DECISION (full evidence in `specs/crafty-coherence-pillars.md` S4 note):** cosmetic-led + transparent pass + optional convenience (my data-backed rec) — OR hybrid w/ some sold progression — OR sell-power (legal, your call). No randomized gacha either way. Not needed until S4; logged.

> **🎨 TASTE — the 4-Aspect talent-tree node taxonomy (M2c/A4 shipped on best judgment; reversible data table at `frontend/src/game/talentTree.js`).** The inert talent tree is now LIVE + structured into the 4 Aspects. These are FOUNDATIONAL stat nodes (the per-Aspect SIGNATURE abilities — beast-transform / gravity-grab / capture / reactive-terrain — come in S2-B). Each node = `+N` per rank to a core stat, which flows to combat (dmg/crit/mitigation) AND HP/mana pools. **Tune any name/number, or tell me to redesign:**
> &nbsp;&nbsp;• **Voidhand** (kinetic bruiser): Kinetic Force +3 STR/rk · Gravity Ward +6 armor/rk · Crushing Pull +2 STR/rk (needs Kinetic Force)
> &nbsp;&nbsp;• **Wildheart** (primal vitality/speed): Beast Vigor +3 STR/rk (HP) · Feral Swiftness +4 AGI/rk (crit) · Blood Frenzy +3 AGI/rk (needs Feral Swiftness)
> &nbsp;&nbsp;• **Soulbind** (warden/support): Soul Bond +3 INT/rk · Warden's Aegis +5 armor/rk · Spirit Link +2 INT/rk (needs Soul Bond)
> &nbsp;&nbsp;• **Elemancer** (elemental caster): Elemental Focus +4 INT/rk (mana) · Volatile Edge +3 AGI/rk (spell crit) · Cataclysm +3 INT/rk (needs Elemental Focus)
> &nbsp;&nbsp;Open Qs: are 3 nodes/tree enough for now, or want more depth pre-S2-B? · STR/AGI/INT/armor only, or add bespoke stats (lifesteal, cooldown, move-speed — would need new system wiring)?

> **✅ FIXED (2026-06-03, you reported it): boss fights now trigger the OBSIDIAN mood.** You defeated the Shadow Dragon + stayed in day-mode. Root cause: nothing in gameplay ever wrote `dangerLevel` (the obsidian-mood driver), so the boss-obsidian signature atmosphere never fired in real play (a known S1-audit A5 gap). Fixed: `useBossSystem` now bridges `bossActive → setDangerLevel(2)` (clears to 0 on defeat) → an active boss drives the obsidian atmosphere. Merged `a428df7`, capture-guarded, 425 unit · 12/12 visual.
> **✅ DECIDED (Kevin 2026-06-03): day↔night auto-cycle → WAIT for M3.** The cycle mechanism exists (`setGameTime` flips `isDay`) but nothing ticks `gameTime` (permanent day; manual Settings toggle only) — the day→build→night-SIEGE→dawn arc is the M3 "stakes loop". Not pulling it forward.
> **🌗 NOW BUILDING — S2-A-M3 (the stakes loop), decomposed M3a/M3b/M3c (2026-06-03). Feel/balance knobs below = reversible constants, proceeding on best judgment per "keep building + batch for me"; redirect any.**
> &nbsp;&nbsp;• **M3a — day/night CLOCK (building now):** wires a ticker so day↔night actually cycles (your "still day after the dragon" report) + fixes a latent flip bug (`setGameTime` only flipped on landing *exactly* on a 600-multiple → a resumed save at e.g. `gameTime=437` never flipped; now flips on boundary-CROSSING, robust). **KNOB: full cycle = 5 min (2.5 day / 2.5 night), pauses in menus / at click-to-play / on death / during visual-capture.** Alternatives: 8-min cozier / 3-min frantic — one constant (`GAME_UNITS_PER_SECOND`).
> &nbsp;&nbsp;• **M3b — night SIEGE + survive-to-dawn + reward (next, design for your input):** today `useSurvivalMode` is a stub (just a nightCount + toast; the "night danger" interval body is *empty*). PROPOSED default: each night ramps hostile spawn rate/count (escalating per night survived), ties into the existing `dangerLevel`→obsidian-mood (night = danger 1, deep-night/boss = 2); **survive to dawn → a reward** (proposed: bonus XP + a guaranteed loot drop scaling with night number). **Death stakes (your call):** proposed SOFT (respawn at base, keep progression — friendly for broad audience) vs HARD (drop some loot/penalty). I'll default SOFT unless you want stakes.
> &nbsp;&nbsp;• **M3c — loot juice (after M3b):** today drops have NO pickup feedback (grep: zero beam/flash VFX). PROPOSED: rarity-colored drop-beam (common→legendary tint, reusing the locked palette) + a pickup pop/sound. Pure feel layer.
> &nbsp;&nbsp;Open Qs for you: cycle length OK at 5 min? · death = soft or hard? · dawn reward shape (XP+loot vs currency vs cosmetic)?
> **✅ DECIDED (Kevin 2026-06-03): projectile-variety pass → AFTER S2-B (the Aspects).** Today the 4 spells share one projectile shape (colour + secondary-effect only). Scheduled as its own per-element spell-VFX-variety **signature pass with mockups for review** (distinct geometry/motion: fireball comet / iceball shatter-shard / lightning forked-chain / arcane piercing-orb), to run after the Aspects land.
> **🔍 PROCESS SELF-REFLECTION + ENHANCEMENT (Kevin asked "why weren't these caught?", 2026-06-03).** Honest root-cause: (a) the obsidian bug was NOT missed — the S1 audit *found* it (no gameplay `dangerLevel` writer); I *deferred* the cheap fix inside M3 → sequencing error, not detection. (b) projectile-sameness was a genuine plan gap (S1-D = spell *feel*, S2-B = ability *identity*; per-element *look* was unowned). Common root = an engineering/code-correctness lens under-weighting **player-experienced content quality** (the "sampler trap" at the asset level). **Enhanced the QA cadence (spec §7) with 4 standing additions:** (1) **content-variety / instance-sameness** check (are N instances distinct or colour-swaps?); (2) **signature-fires-in-prod** check (every mood/effect needs a *gameplay* trigger, not just a dev hook); (3) **finding-triage by cost×player-visibility** (cheap+visible → ship standalone NOW, never bundle into a deferred milestone); (4) **builder applies the player/artist lens** (play/look at the real flow before "done", not just tests-green). Captured as an EEE lesson + `feedback_player_experience_lens` memory. **PROPOSAL: a focused content-variety + signature-fires sub-audit as a pre-S2-B gate** (S2-B is signature work where instance-distinctness is the whole point) — would surface other likely-uniform content (mob distinctness, loot-beam variety, per-action sound variety) + any other dev-hook-only signals like `dangerLevel` was. Want it run before S2-B?

> **✅ S2-A-M2a COMPLETE + MERGED (2026-06-03) — progression-persistence core + save consolidation (the A3 "comprehensive save" + the slop teardown you green-lit).** RPG progression (level/XP/attributes/equipment/talents/spellLevels/**chests**/position) now **survives a reload** + **autosaves** (local-first, debounced on transitions + build/mine + tab-close). **Your "why are there both worldmanager and savegame" — answered + fixed:** there weren't two real systems; `useGameStore.saveGame`/`loadGame` were **dead axios calls to a backend that doesn't exist** (zero callers) — **deleted**. `WorldManager` (localStorage) was the only live path; now everything routes through ONE `buildSaveData` serializer (was the payload duplicated 4×). Also tore out: a 4× duplicated max-stat formula (→ one `progression.js`), a GameSystems **HP-ratchet bug** (+20 HP every equip toggle), and a baked `frost_shield` armor mutation (now derived). 406 unit · 12/12 visual · build clean; final adversarial review APPROVED.
> &nbsp;&nbsp;**DECISION I made (ratify or redirect): cloud save = deferred to S4.** Crafty is single-player + offline today; I made the save **local-first (localStorage)** and marked the WorldManager cloud-axios branches `// S4: cloud sync — backend not yet implemented`. Accounts/backend are an S4 concern per the master plan. OK?
> &nbsp;&nbsp;**✅ RESOLVED (2026-06-03, you asked me to "do the logged-for-later things"):** both carry-forwards are now FIXED + merged (`97f645a`). QuestSystem's divergent local quests/completedQuestIds/stats/unlockedAchievements now mirror into a serializable store `questState`, ride `buildSaveData`, restore via `loadWorldData` + a resync tick, and trigger autosave — so **quest progress + achievements survive a reload + autosave**, same as the rest of the slice. `test:unit` 413 · 12/12 visual. (Implementation: low-risk mirror+resync, gameplay logic untouched; the dead `achievements` store field is now superseded by `questState.unlockedAchievements` — left as harmless back-compat for a future slop pass.) **"Comprehensive save" is now honest to players.**

> **✅ S1-D SIGNATURES COMPLETE → ALL OF S1 COMPLETE (2026-06-02).** RESOLVED: mascot = **B "Crafty Hero"** (Kevin picked; polished + title-wired + stronger gem-glow); spell-VFX = premium-energy fireball (#1 polish done); cast-arc + atmosphere elevation done. 12/12 visual states. **1 OPEN TUNABLE for Kevin (low-priority, tweak anytime — documented knobs):** **magic-hour color band** — eyeball `frontend/tests/visual/baseline/explore-day.png` (+ explore-night/boss-obsidian); premium-not-candy is my default, dial via `src/render/mood.js MOOD_GRADE` (saturation/brightness/contrast per mood) + `src/render/LightMotes.jsx uScale` (mote presence).
> **✅ RESOLVED (2026-06-02, Kevin asked): studio-fixture mote isolation** — the always-on light motes were bleeding ~0.25% into the 3 sky-studio gate fixtures (character/boss-closeup, spell-cast). Fixed via a dedicated `captureStudio` store flag (declarative identity — the studio-card hooks SET it; `GameScene` gates `<LightMotes>` off when true; decoupled from `hudHidden`). Motes preserved in all in-world frames; the 3 studio frames re-baselined mote-free. New static gate `tests/gates/atmosphere-isolation-gates.test.js` (5 tests) + visual 12/12. ([[feedback_visual_regression_fixture_isolation]].)
> **✅ RESOLVED (2026-06-02, Kevin caught it): mob/character ink-outline regression** — outlines appeared at spawn then vanished mid-session. Root cause: `TIERS.low.charOutline` was false + the in-game `PerformanceMonitor.onDecline` ratchets the tier one-way to `low` under FPS pressure (mob-spawn → FPS drop → downgrade → outlines unmount permanently). Fix: `low.charOutline → true` (the cheap signature ink outline is now tier-independent; perf budget comes from the expensive toggles, not the outline). Red-first gate ("charOutline ON at every tier") + unit 332 + build clean (visual baselines force `high`, unaffected).
> **🔬 FLAGGED FOR S3 (perf-tier calibration — needs real-device profiling, the audit's #1 risk; NOT fixed blind):** (1) the `PerformanceMonitor` downgrade is a ONE-WAY ratchet (onDecline only, no onIncline) → tier never recovers even if FPS rebounds. (2) **Tier calibration (CORRECTED — my earlier ≤8 claim was STALE):** `high` IS reachable on modern 16GB+/8-core desktop Chrome (`navigator.deviceMemory` reports up to 16/32 per MDN, satisfying `>=12`); **Safari/Firefox lack the API → start at `low`**. Genuine residue: the one-way ratchet (no `onIncline` → a transient FPS dip never recovers) + the visual suite has **no forced-med/low baseline** (only forced-high). S3 (real-device profiling): add `onIncline` + recalibrate thresholds (treat `undefined` as mid, not 0) + add med/low baselines. (`outlineWorldEdge` in that list was a **fictional/never-built** flag.) Full ledger → `memory/REALITY-AUDIT-S1-2026-06-02.md`.
> **⏸️ `challenge-memory` audit — POSTPONED (Kevin 2026-06-02):** deferred past the S1 boundary; **surface it for Kevin's decision when S2 is done** (not before). Ritual in `feedback_memory_hygiene.md`; memory dir is git-backed → safe whenever run.

> **🔒 SECURITY (your call — queued, task #32): vitest 3.2.4 → 4.x bump (GHSA-5xrq-8626-4rwp, Critical).** Real risk to us ~nil: vitest is a **dev-only** devDependency (never shipped to players), we run `vitest run` not the vulnerable `--ui`/`--api` listening server, and `@vitest/ui` isn't installed — the exploit path isn't exercised. The only fix is a **breaking major bump** (3→4, no 3.x patch). **Recommended: defer past the M-build** (a breaking test-framework migration mid-TDD is the wrong moment). Two options: (a) **dismiss** the 2 Dependabot alerts as not-exploitable-in-our-usage; or (b) **migrate post-M1** on its own branch (bump + re-run unit/visual + fix any v4 breakages). I lean (b) soon.

> Accumulated while building out the master plan autonomously (per Kevin 2026-06-01: "keep building the entire plan, batch anything for me to review/decide for when you complete it, assume all approvals"). Each item = a rendered frame to eyeball or a decision to ratify. Nothing here blocks the build; I proceed on best judgment + log it here. **Review at the end (or any time).**

## 🖼️ Frames to eyeball (visual taste check)
- **S1-C-M1 showcase (DONE, on `main`):** `frontend/tests/visual/baseline/primitives-showcase-{en,zh}.png` — the bold-flat design system, matched to `final-A`. (You caught the first divergence; this is the fixed version.)
- **S1-C-M2a HUD (DONE):** `frontend/tests/visual/baseline/{explore-day,explore-night,boss-obsidian}.png` — the in-game HUD migrated to bold-flat (StatBars with icons, Slot hotbar, bold-flat spell chip + minimap/compass + XP/level; ❤/🍖 emoji + minecraft-bevel gone). My audit: hotbar crisp, StatBars clean. **Mid-migration mix is expected** — the top-left quest panel + top-right controls panel are still the old languages (quests=neon→M2c; controls=its own→folded into M2c). The HUD layout/positions are unchanged from before (M2a migrated chrome, not layout).

## 🤔 Decisions to ratify (proceeded on best judgment)
- **HUD layout polish (deferred):** M2a migrated the HUD *chrome* but kept the existing *layout* (bar positions, the quest panel + controls panel + spell chip all clustering top). A dedicated HUD *layout* pass (hierarchy, spacing, thumb-zone, decluttering) could be an S1-D or M2-polish item — flag if you want it scheduled.
- **zh-body font = real Alibaba PuHuiTi 3.0** (subset common-CJK, 2.9MB lazy) — sourced from a jsDelivr npm mirror (`alibabapuhuiti-3-55-regular`), verified genuine. OK as the shipping zh body?
- **game-icons.net = CC BY 3.0** → a credits screen is owed (scheduled for M3). OK to keep game-icons (vs Lucide-only)?
- **Monetization / S4** (cosmetics + transparent pass, NO gacha) — when I reach S4 I'll surface the concrete monetization plan here for your sign-off before any pricing/store wiring.

## 📋 Known tech-debt / residuals carried (non-blocking)
- explore-night ~0.06% residual (terrain chunk-stream meshing order) — under the 6% gate, separate subsystem.
- `showcase-scene.png` 753KB lives in `src/ui/` (DEV-only, tree-shaken from prod) — could be compressed; cosmetic.
- GameSystems/SimpleExperienceSystem VFX overlays still use raw Tailwind color classes (`text-red-500` etc.) on dramatic effects (not chrome) — a future raw-Tailwind→token pass if desired.

## ✅ Phases completed this run (all merged to `main`, gates green)
- S1-C-M1 (token foundation + primitives + i18n) + fidelity pass + all tech-debt + residuals.
- S1-C-M2a (HUD consolidation → bold-flat).
- _(appended as phases complete…)_

- **S1-C-M2b modals (DONE):** `frontend/tests/visual/baseline/inventory-open.png` — the migrated Inventory modal (glass→bold-flat: Panel shell, paper-doll + gear Slots, rarity-FILLED item grid w/ 2-tone icons, Combat-Stats panel, gold Equip). All 5 modals migrated. (CraftingTable/Magic/Building/Settings not separately captured — verified via build + the shared pattern.) Note: `AchievementsPanel` (QuestSystem) still glass → migrating in M2c.

- **S1-C-M2c neon→bold-flat (DONE):** `frontend/tests/visual/baseline/achievements-open.png` — migrated AchievementsPanel + QuestTracker; explore-day/night/boss-obsidian re-baselined (bold-flat quest panel/boss bar/notifications). The **single-UI-language hard gate is now GREEN**. Achievement/quest TEXT still has emoji (🔪/👣/⚔️…) — that's M3's data-decouple. **NEW: M2d** will retire the last 3 in-game glass usages (`SimplifiedNPCSystem.jsx` NPC trading modal + dialogue bubble).

- **S1-C-M2d NPC glass (DONE):** `SimplifiedNPCSystem.jsx` NPC trading modal + dialogue bubble + controls panel → bold-flat (the last in-game glass). Gate tightened to ban `backdrop-blur` in-game (only App.jsx pre-game splash + dev DebugOverlay excluded — both non-game-chrome). Not in a capture state (mounted via NPC-proximity) — no frame to eyeball; verified via build + the tightened gate. **S1-C UI consolidation COMPLETE.**

- **S1-C-M3 icons + emoji-decouple (DONE → S1-C COMPLETE):** **all emoji removed from `src/` (215→0)**; formalized the game-icon system (19 new filled game-icons.net glyphs, CC BY 3.0) + a centralized `src/data/items.js` registry; zero-emoji hard gate GREEN. **Frames to eyeball (re-baselined):** `frontend/tests/visual/baseline/{menu,explore-day,explore-night,boss-obsidian,inventory-open,achievements-open}.png`.
  - **`menu.png`** — the 🧙‍♂️ mascot → a filled **wizard-hat** icon; "Start Adventure" → sword icon + text. (Mascot is a *placeholder* — the real signature mascot is S1-D phase-2.)
  - **`achievements-open.png`** — unlocked = filled game-icons (footprints/sword/skull/star/pickaxe…), locked = lucide lock; quest tracker shows per-quest icons.
  - **`inventory-open.png`** — item tiles use filled 2-tone icons with rarity fills; **the deliberate rarity FIX is visible: Golden Crown now renders as a GOLD legendary tile** (was grey/common under the old emoji-prefix bug). My audit: icons render crisp, semantically correct, consistent bold-flat. No emoji anywhere.
  - I verified these 3 myself; the other 3 (explore/boss) changed only in quest-tracker/compass/boss-bar icons (sub-threshold). **One taste call for you:** the placeholder wizard-hat mascot on the title screen — fine until the S1-D real mascot, or want it sooner?

## 🤔 Decisions ratified in M3 (proceeded on best judgment)
- **game-icons.net KEPT + credited** — a `CreditsScreen.jsx` (reachable from Settings) attributes game-icons.net (CC BY 3.0) + the fonts. (Answers the M2 open question "OK to keep game-icons vs Lucide-only?" — kept, properly credited.)
- **Deliberate rarity fix shipped** — decoupling emoji from item names exposed + fixed a latent bug (emoji prefix broke exact-match rarity → Golden Crown/Star Fragment were COMMON, Mana Potion/Emerald/Ender Pearl mis-tiered). Now correct. Damage/Shield Scroll bumped common→rare (buff consumables) as a taste enhancement. Flag if you'd tier any item differently.
- **3D loot-drop sprite** — the floating loot drop previously painted the item's emoji on a canvas billboard; that emoji glyph was removed (kept the rarity-colored octahedron + light beam). A proper game-icon billboard on physical drops would be a small SVG→WebGL-texture task (candidate for S3 polish) — flag if wanted.
