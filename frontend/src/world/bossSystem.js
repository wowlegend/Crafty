// bossSystem.js — the Shadow Dragon boss state machine + the bossActive->dangerLevel obsidian-mood
// bridge (extracted from AdvancedGameFeatures S3-M4 p4; mounted once in App). Verbatim.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { bossTierStats, bossCanReturn, bossNameKey, BOSS_BASE_LEVEL } from '../game/bossTier.js';
import { blightHeartSite } from './blightHeart.js';
import { HITSTOP } from '../game/trauma.js';
import { applyBossDamage, runBossKillEffects } from '../game/bossKill.js';
import { runIsolatedEffects } from '../game/isolatedEffects.js';
import { bossEntranceBeat, ENTRANCE } from '../game/bossEntrance.js';
import { phaseForHealth } from '../game/bossPersistence.js';
import { isWorldFrozenNow, worldNow } from '../game/worldClock.js';
import { bossCombat, bossDamage } from '../game/bossCombat.js';
import { preloadDragon, shouldPreloadAtMount } from '../render/dragonLoader.js';
import { parseLookbookParam } from '../render/lookbookSeam.js';

/** One of the dragon's one-off calls (this hook's: the arrival, the return, the phase changes, the defeat) to the one
 *  notification channel (ui/notifications.js) as a dictionary key, marked `boss`, so where one line holds the notices it
 *  takes that line from any other. A toast there clears itself, so nothing here is left to set state after an unmount. */
export const bossCall = (key, type, vars) => useGameStore.getState().addNotification?.(key, type, { vars, boss: true });
const bossNotice = (key, vars) => bossCall(key, 'danger', vars);
/** Where the lookbook wakes the dragon: LOOKBOOK_DRAGON_CLEAR_M from the lair toward the spawn, clear of the lair's
 *  9 m monolith (world/Terrain.jsx BlightMonolith), and in the air over that ground, where its first phase flies (13 m
 *  up, render/BossEntity.jsx) and a camera below it sees it against the sky rather than the lair's black ground. */
const LOOKBOOK_DRAGON_HOVER_M = 12;
const LOOKBOOK_DRAGON_CLEAR_M = 14;
export function lookbookDragonSpot() {
    const lair = blightHeartSite();
    const len = Math.hypot(lair.x, lair.z) || 1;
    return [Math.round(lair.x - (lair.x / len) * LOOKBOOK_DRAGON_CLEAR_M), Math.round(lair.z - (lair.z / len) * LOOKBOOK_DRAGON_CLEAR_M)];
}

export const useBossSystem = (playerLevel) => {
    // A-bis B2g: seed from the STORE, which is what the save restores into, instead of from BOSS_CONFIG.
    // These were plain `useState(BOSS_CONFIG.health)` / `useState(false)`, so a reload mid-fight handed the
    // dragon back all 700 HP. Lazy initialisers: read once at mount, after loadGame has hydrated the store.
    const [bossActive, setBossActive] = useState(() => useGameStore.getState().bossActive);
    const [bossHealth, setBossHealth] = useState(() => useGameStore.getState().bossHealth);
    // QUEUE C3: the dragon returns, a tier stronger per kill (game/bossTier.js). Tier 0 is the original fight.
    // Every number that used to read BOSS_CONFIG — max health, XP, loot, name — reads the tier's stats.
    const [bossTier, setBossTier] = useState(() => useGameStore.getState().bossTier || 0);
    const stats = useMemo(() => bossTierStats(bossTier), [bossTier]);
    const bossMaxHealth = stats.health;
    const bossPositionRef = useRef(null);
    const [bossDefeated, setBossDefeated] = useState(() => useGameStore.getState().bossDefeated);
    // Seeded from the restored HP, NOT 0. The effect below announces every phase change, so mounting at
    // 17% HP with phase 0 would fire "PHASE 3: ENRAGED!" on load — announcing a transition the player
    // passed before they quit. Same derivation the effect uses, so mount produces no change to announce.
    const [bossPhase, setBossPhase] = useState(() =>
        phaseForHealth(useGameStore.getState().bossHealth, bossTierStats(useGameStore.getState().bossTier || 0).health));
    const bossSpawned = useRef(false);
    // Bumped by suspendEncounter: the arrival poll below is an effect that returned before arming its interval while a
    // fight was on, and resetting bossSpawned alone would not run it again.
    const [rearm, setRearm] = useState(0);
    const bossKilledRef = useRef(false); // idempotency latch: kill side-effects fire EXACTLY once even if damageBoss is called twice in a frame (melee + spell) or the updater double-invokes under StrictMode


    // S9: the Shadow Dragon now AWAITS at the fixed Blight Heart lair (NOT a level-5 ambush at the player).
    // Once you are strong enough (level 5), poll for ARRIVAL at the lair (~24 blocks) -- the dragon awakens
    // when you REACH the foreshadowed, compass-marked destination. A useEffect keyed on [playerLevel] does
    // NOT re-fire as the player MOVES, so a poll is required to detect arrival. Transient store reads ->
    // Game-Loop-Isolation. The DEV forceBossSpawn (boss-closeup fixture) is a separate effect, untouched.
    //
    // C3 TIERS. Tier 0 keeps that rule exactly (level 5, and a won game never re-arms it). A slain tier
    // (defeated, tier >= 1) waits until bossCanReturn — RETURN_NIGHTS nights since the kill AND LEVEL_STEP
    // more levels — is announced ONCE when it becomes due, and wakes when the player walks back to the lair.
    const returnAnnounced = useRef(false);
    useEffect(() => {
        if (bossSpawned.current) return;
        if (bossTier === 0 && (playerLevel < BOSS_BASE_LEVEL || bossDefeated || useGameStore.getState().gameWon)) return;
        // The player qualifies for a fight, so its code downloads now, usually minutes before the arrival. A slain
        // tier waits for its return to be due, below.
        if (!(bossTier > 0 && bossDefeated)) preloadDragon();
        const lair = blightHeartSite();
        const interval = setInterval(() => {
            if (bossSpawned.current || isWorldFrozenNow()) return;
            if (bossTier > 0 && bossDefeated) {
                const s = useGameStore.getState();
                if (!bossCanReturn({ tier: bossTier, killNight: s.bossKillNight, nightCount: s.nightCount, level: playerLevel })) return;
                if (!returnAnnounced.current) {
                    returnAnnounced.current = true;
                    preloadDragon();
                    bossNotice('notice.bossReturns', { boss: bossNameKey(bossTier) });
                }
            }
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            if (Math.hypot(playerPos.x - lair.x, playerPos.z - lair.z) > 24) return; // not at the lair yet
            bossSpawned.current = true;
            // E-ter/E4: the ARRIVAL is the climax of the run and used to be this notification and nothing
            // else, while the KILL fires eight isolated effects. Freeze + swell + shake now land with it.
            // Capture-SUPPRESSED: the visual gate has a boss state, and a bloom spike or shake at spawn
            // would make those frames non-deterministic (same guard the A5 dangerLevel bridge uses).
            const bStore = useGameStore.getState();
            runIsolatedEffects(bossEntranceBeat({
                notify: () => bossNotice('notice.bossAwakens', { boss: bossNameKey(bossTier) }),
                // The REAL camera shake, not setScreenShake -- that one drives DamageOverlay's red vignette,
                // so the arrival used to paint the take-damage cue over the climax. No clear timeout is
                // needed any more: trauma decays itself, frame-rate independently.
                shake: bStore.isCaptureMode ? null : () => {
                    bStore.triggerCameraShake?.(ENTRANCE.shakeWeight);
                },
                bloom: bStore.isCaptureMode ? null : () => bStore.triggerBloomSpike?.(ENTRANCE.bloomMs),
                hitstop: bStore.isCaptureMode ? null : () => useGameStore.getState().triggerHitstop(ENTRANCE.hitstopMs),
            }));
            let y = 35; // spawn high up over the lair
            const getGy = useGameStore.getState().getMobGroundLevel;
            if (getGy) {
                const gy = getGy(lair.x, lair.z);
                if (gy !== null && !isNaN(gy)) y = gy + 15;
            }
            bossPositionRef.current = [lair.x, y, lair.z];
            // A RETURN starts a fresh fight at its tier's health (the slain tier sat at 0, defeated). A fight
            // restored by a reload is NOT a return — it is re-placed at the lair with the HP it was saved at
            // (review 2026-09-22: keyed on the tier alone, a reload refilled every wounded return fight).
            if (bossTier > 0 && bossDefeated) {
                setBossHealth(stats.health);
                setBossDefeated(false);
                setBossPhase(0);
                bossKilledRef.current = false;
                returnAnnounced.current = false;
            }
            setBossActive(true);
        }, 1500);
        return () => clearInterval(interval);
    }, [playerLevel, bossDefeated, bossTier, stats, rearm]);

    // A fight restored by a reload is on from the first frame: its chunk is wanted now, not at an arrival.
    useEffect(() => {
        if (shouldPreloadAtMount(useGameStore.getState())) preloadDragon();
    }, []);

    // The dragon's chunk could not be loaded after every retry (render/dragonLoader.js): the fight is SUSPENDED, not
    // lost. The bar, the music and the mood end through bossActive's own effects, the HP and the tier stay (the mirror
    // below saves them), and the lair re-arms, so the next arrival tries the chunk again and resumes at the saved HP.
    const suspendEncounter = useCallback(() => {
        bossSpawned.current = false;
        setBossActive(false);
        setRearm((n) => n + 1);
    }, []);

    useEffect(() => {
        // The threshold walk moved to game/bossPersistence.phaseForHealth so the rehydrate seeds the phase
        // with the SAME function that advances it here. Two copies of one derivation is how a restored
        // fight ends up in a phase its health does not justify.
        const i = phaseForHealth(bossHealth, bossMaxHealth);
        if (bossPhase !== i) {
            setBossPhase(i);
            if (i === 1) bossNotice('notice.bossPhase2');
            else if (i === 2) bossNotice('notice.bossPhase3');
        }
    }, [bossHealth, bossMaxHealth, bossPhase]);

    // B2h: the updater is now PURE — it only computes the new health. The kill's ~8 side effects moved to
    // the post-commit effect below, so a throwing reward can no longer void the win (they used to run inside
    // this updater, with the idempotency latch set first and markGameWon last — one throw stranded the win).
    // `source` is the damage source CombatSystem uses (combat/damageSource.js): the player's hits take the riposte while
    // the dragon is staggered (game/bossCombat.js bossDamage), an ally's or a hazard's never do.
    const damageBoss = useCallback((amount, source = 'player') => {
        if (!bossActive || bossHealth <= 0) return;
        const dealt = bossDamage(amount, source, bossCombat, worldNow());
        setBossHealth(prev => applyBossDamage(prev, dealt).newHealth);
    }, [bossActive, bossHealth]);

    // B2h: the boss-kill beat. Fires ONCE (bossKilledRef latch) when health reaches 0, AFTER the health
    // commit — never inside a setState updater. Each effect runs in ISOLATION and the WIN LATCH runs LAST,
    // so a throwing reward (grantXP, loot) cannot prevent markGameWon. This is the game's win; it must not
    // be strandable by a reward that throws.
    useEffect(() => {
        if (!bossActive || bossHealth > 0 || bossKilledRef.current) return;
        bossKilledRef.current = true;
        const store = useGameStore.getState();
        runBossKillEffects([
            ['deactivate', () => setBossActive(false)],
            ['defeated', () => setBossDefeated(true)],
            ['notify', () => bossNotice('notice.bossDefeated', { boss: bossNameKey(bossTier), xp: stats.xpReward })],
            ['grantXP', () => GameMethods.grantXP && GameMethods.grantXP(stats.xpReward, `${stats.name} Defeated!`)],
            ['loot', () => { if (store.addToInventory) for (const [item, qty] of stats.loot) store.addToInventory(item, qty); }],
            // C3: the next dragon is a tier stronger, and its return is counted from TONIGHT. Before the win
            // latch, isolated like every effect here, so a throwing reward cannot strand the tier either.
            ['tier', () => {
                const next = bossTier + 1;
                useGameStore.getState().setBossEncounter({
                    health: 0, active: false, defeated: true, tier: next, killNight: useGameStore.getState().nightCount,
                });
                bossSpawned.current = false;
                setBossTier(next);
            }],
            // M2 #7 climactic boss-kill beat: a brief slow-mo freeze ('boss'-tier hitstop) + a bloom flash.
            ['hitstop', () => useGameStore.getState().triggerHitstop(HITSTOP.boss)],
            ['bloom', () => store.triggerBloomSpike && store.triggerBloomSpike(450)],
            // VICTORY for the FIRST dragon only — keyed on the tier it HAD, captured at the kill, so it does not
            // depend on the 'tier' step above succeeding (R4.5) and a return kill never raises it (R5.5).
            ['victory', () => { if (bossTier === 0) useGameStore.setState({ victoryPending: true }); }],
            ['win', () => store.markGameWon && store.markGameWon()], // S9c: the persisted win — LAST + idempotent
        ]);
    }, [bossActive, bossHealth, stats, bossTier]);

    useEffect(() => {
        useGameStore.setState({ damageBoss: damageBoss, suspendBossEncounter: suspendEncounter });
        useGameStore.setState({ getBossPosition: () => bossPositionRef.current });
        // Publish boss-active lifecycle to the STORE value (single source of truth).
        // This is the key SoundManager reads (`state.bossActive`) to start/stop the
        // boss battle music, and the store's `isBossActive()` function now returns it
        // too — so both paths stay in lockstep with the real boss lifecycle. Driven
        // here because every transition (level>=5 spawn, death, dev force-spawn) routes
        // through the local `bossActive` useState this effect is keyed on.
        useGameStore.getState().setBossActive(bossActive);
        // Dev-only force-spawn for the boss-closeup visual fixture: drops the dragon at a
        // fixed sky-studio position with no level/HP gate. Tree-shaken from prod builds.
        if (import.meta.env.DEV) {
            useGameStore.setState({ forceBossSpawn: (pos) => {
                preloadDragon();
                bossSpawned.current = true;
                bossKilledRef.current = false; // a dev re-spawn can be killed again
                bossPositionRef.current = pos;
                setBossActive(true);
                setBossPhase(0);
            } });
        }
    }, [damageBoss, suspendEncounter, bossPositionRef, bossActive]);

    // THE LOOKBOOK'S DRAGON (DECISIONS 2026-10-30 item 122): the production build's one way to wake the dragon without
    // the fight's level and lair gates, installed only when the page URL carries ?lookbook=1 (render/lookbookSeam.js
    // parseLookbookParam), so the game a player loads has no spawn seam. The lookbook probe shoots the fight on a real
    // GPU through it; its `dragon()` holds the pose.
    useEffect(() => {
        if (typeof window === 'undefined' || !parseLookbookParam(window.location?.search)) return undefined;
        useGameStore.setState({ lookbookSpawnDragon: ({ position } = {}) => {
            let at = position;
            if (!at) {
                const [x, z] = lookbookDragonSpot();
                const gy = useGameStore.getState().getMobGroundLevel?.(x, z);
                if (gy === null || gy === undefined || !Number.isFinite(gy)) {
                    throw new Error('lookbook: the lair\'s ground is not loaded yet; pose the camera there and wait');
                }
                at = [x, gy + LOOKBOOK_DRAGON_HOVER_M, z];
            }
            preloadDragon();
            bossSpawned.current = true;
            bossKilledRef.current = false;
            bossPositionRef.current = [at[0], at[1], at[2]];
            setBossActive(true);
            return { position: [at[0], at[1], at[2]] };
        } });
        return () => useGameStore.setState({ lookbookSpawnDragon: null });
    }, []);

    // A-bis B2g: mirror the ENCOUNTER to the store, which is what saveSchema serializes. Its own effect,
    // keyed on all three values, deliberately NOT folded into the callback-registration effect above:
    // that one is keyed on [damageBoss, suspendEncounter, bossPositionRef, bossActive], so health mirrored there would only
    // reach the store when active FLIPPED — stale through the entire fight, which is the bug this fixes.
    // Adding health to those deps instead would re-register damageBoss/getBossPosition on every damage
    // tick. This effect runs on state transitions, not per frame, so Game-Loop-Isolation holds.
    useEffect(() => {
        useGameStore.getState().setBossEncounter({ health: bossHealth, active: bossActive, defeated: bossDefeated });
    }, [bossHealth, bossActive, bossDefeated]);

    // A5 dangerLevel bridge: an ACTIVE Shadow Dragon drives the obsidian danger mood
    // (dangerLevel=2 -> moodTarget=2 -> the obsidian atmosphere/grade), cleared to 0 on
    // defeat/despawn. Without this, nothing in prod ever writes dangerLevel, so the
    // boss-obsidian signature mood never fired in real play (S1-audit A5 gap). Capture
    // fixtures drive mood via dev hooks, so skip there to keep the visual gate stable.
    useEffect(() => {
        if (useGameStore.getState().isCaptureMode) return;
        useGameStore.getState().setDangerLevel(bossActive ? 2 : 0);
    }, [bossActive]);

    return {
        bossActive, bossHealth, bossMaxHealth, bossPositionRef,
        bossDefeated, bossPhase, damageBoss,
        bossTier, bossName: stats.name,
    };
};
