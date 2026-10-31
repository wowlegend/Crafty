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
import { phaseForHealth, enteredBefore } from '../game/bossPersistence.js';
import { isWorldFrozenNow, worldNow } from '../game/worldClock.js';
import { bossCombat, bossDamage } from '../game/bossCombat.js';
import { preloadDragon, shouldPreloadAtMount } from '../render/dragonLoader.js';
import { parseLookbookParam } from '../render/lookbookSeam.js';
import { registerTestHook } from '../devtest/testBridge.js';
import { readImpulses, clearImpulses } from '../devtest/impulseLog.js';
import { requestZone } from '../game/elemancerChannel.js';
import { requestHurl } from '../game/hurlChannel.js';

/** One of the dragon's one-off calls (this hook's: the arrival, the return, the phase changes, the defeat) to the one
 *  notification channel (ui/notifications.js) as a dictionary key, marked `boss`, so where one line holds the notices it
 *  takes that line from any other. A toast there clears itself, so nothing here is left to set state after an unmount. */
export const bossCall = (key, type, vars) => useGameStore.getState().addNotification?.(key, type, { vars, boss: true });
const bossNotice = (key, vars) => bossCall(key, 'danger', vars);
/** Write part of the encounter: the store's setBossEncounter takes the whole of it, and the tier and kill night only when
 *  passed, so a write here never moves them. */
const writeEncounter = (patch) => {
    const s = useGameStore.getState();
    s.setBossEncounter({ health: s.bossHealth, active: s.bossActive, defeated: s.bossDefeated, ...patch });
};
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
    // THE STORE IS THE ENCOUNTER (deep audit 2026-10-30, lane L3). The hook selects it and writes it through
    // setBossEncounter, and keeps no copy. A copy seeded at mount and mirrored back reached the save, but no load re-read
    // it: a load into the mounted game left the old fight in the hook where no hit reached it
    // (AUDIT:softlocks:boss-hook-ignores-world-load), and the context-loss resume's mirror wrote the copy over the
    // world it had just loaded (DECISIONS 2026-10-31 item 250).
    const bossActive = useGameStore((s) => s.bossActive);
    const bossHealth = useGameStore((s) => s.bossHealth);
    const bossDefeated = useGameStore((s) => s.bossDefeated);
    // QUEUE C3: the dragon returns, a tier stronger per kill (game/bossTier.js). Tier 0 is the original fight.
    // Every number that used to read BOSS_CONFIG — max health, XP, loot, name — reads the tier's stats.
    const bossTier = useGameStore((s) => s.bossTier || 0);
    const worldLoadedAt = useGameStore((s) => s.worldLoadedAt);
    const stats = useMemo(() => bossTierStats(bossTier), [bossTier]);
    const bossMaxHealth = stats.health;
    // Derived from the health, never stored (game/bossPersistence.js phaseForHealth). A phase the player's damage crosses
    // into is announced by damageBoss, so a load or a spawn at a phase's health announces nothing.
    const bossPhase = phaseForHealth(bossHealth, bossMaxHealth);
    const bossPositionRef = useRef(null);
    const bossSpawned = useRef(false);
    // Bumped by suspendEncounter: the arrival poll below is an effect that returned before arming its interval while a
    // fight was on, and resetting bossSpawned alone would not run it again.
    const [rearm, setRearm] = useState(0);
    // After a give-up the lair stays disarmed until the player has walked out of it: a player still standing there
    // would wake the fight on the next poll, and every wake retries a chunk that may never load (a tab left open
    // across a deploy), so the retries are bounded by arrivals, not by a timer.
    const lairDisarmed = useRef(false);
    // A suspended fight was already entered: its next wake resumes it without the entrance beat. So was a fight the page
    // loaded mid-way (game/bossPersistence.js enteredBefore).
    const resumeQuietly = useRef(enteredBefore(useGameStore.getState()));
    const bossKilledRef = useRef(false); // idempotency latch: kill side-effects fire EXACTLY once even if damageBoss is called twice in a frame (melee + spell) or the updater double-invokes under StrictMode
    const returnAnnounced = useRef(false);

    // A world loaded into the mounted game (store loadWorldData bumps worldLoadedAt): the refs above are the loaded
    // world's, as a mount gives them, and the arrival poll re-arms. Every switch is a boot since lane L2, so at a boot the
    // hook mounts on the loaded world and this does not run; it keeps an in-place load correct if one returns. Declared
    // before the arrival poll, so a load that also changes the tier or the defeat resets the latch before the poll reads it.
    const loadSeen = useRef(worldLoadedAt);
    useEffect(() => {
        if (loadSeen.current === worldLoadedAt) return;
        loadSeen.current = worldLoadedAt;
        bossSpawned.current = false;
        lairDisarmed.current = false;
        returnAnnounced.current = false;
        bossKilledRef.current = false;
        bossPositionRef.current = null;
        resumeQuietly.current = enteredBefore(useGameStore.getState());
        setRearm((n) => n + 1);
    }, [worldLoadedAt]);


    // S9: the Shadow Dragon now AWAITS at the fixed Blight Heart lair (NOT a level-5 ambush at the player).
    // Once you are strong enough (level 5), poll for ARRIVAL at the lair (~24 blocks) -- the dragon awakens
    // when you REACH the foreshadowed, compass-marked destination. A useEffect keyed on [playerLevel] does
    // NOT re-fire as the player MOVES, so a poll is required to detect arrival. Transient store reads ->
    // Game-Loop-Isolation. The DEV forceBossSpawn (boss-closeup fixture) is a separate effect, untouched.
    //
    // C3 TIERS. Tier 0 keeps that rule exactly (level 5, and a won game never re-arms it). A slain tier
    // (defeated, tier >= 1) waits until bossCanReturn — RETURN_NIGHTS nights since the kill AND LEVEL_STEP
    // more levels — is announced ONCE when it becomes due, and wakes when the player walks back to the lair.
    useEffect(() => {
        if (bossSpawned.current) return;
        if (bossTier === 0 && (playerLevel < BOSS_BASE_LEVEL || bossDefeated || useGameStore.getState().gameWon)) return;
        // The player qualifies for a fight, so its code downloads now, usually minutes before the arrival. A slain
        // tier waits for its return to be due, below; a disarmed lair waits for the player to walk out.
        if (!(bossTier > 0 && bossDefeated) && !lairDisarmed.current) preloadDragon();
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
            const atLair = Math.hypot(playerPos.x - lair.x, playerPos.z - lair.z) <= 24;
            if (lairDisarmed.current) {
                // Walking out re-arms it, and the chunk is fetched again then, ahead of the return.
                if (!atLair) { lairDisarmed.current = false; preloadDragon(); }
                return;
            }
            if (!atLair) return;
            bossSpawned.current = true;
            const quiet = resumeQuietly.current;
            resumeQuietly.current = false;
            // E-ter/E4: the ARRIVAL is the climax of the run and used to be this notification and nothing
            // else, while the KILL fires eight isolated effects. Freeze + swell + shake now land with it.
            // Capture-SUPPRESSED: the visual gate has a boss state, and a bloom spike or shake at spawn
            // would make those frames non-deterministic (same guard the A5 dangerLevel bridge uses).
            const bStore = useGameStore.getState();
            if (!quiet) runIsolatedEffects(bossEntranceBeat({
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
                bossKilledRef.current = false;
                returnAnnounced.current = false;
                writeEncounter({ health: stats.health, defeated: false, active: true });
            } else {
                writeEncounter({ active: true });
            }
        }, 1500);
        return () => clearInterval(interval);
    }, [playerLevel, bossDefeated, bossTier, stats, rearm]);

    // A fight restored by a reload is on from the first frame: its chunk is wanted now, not at an arrival.
    useEffect(() => {
        if (shouldPreloadAtMount(useGameStore.getState())) preloadDragon();
    }, []);

    // The dragon's chunk could not be loaded after every retry (render/dragonLoader.js): the fight is SUSPENDED, not
    // lost. The bar, the music and the mood end through bossActive's own effects, the HP and the tier stay in the store
    // (the save writes them), and the lair re-arms once the player has walked out of it, so the next arrival tries the
    // chunk again and resumes the same fight at the saved HP, without a second entrance.
    const suspendEncounter = useCallback(() => {
        bossSpawned.current = false;
        lairDisarmed.current = true;
        resumeQuietly.current = true;
        writeEncounter({ active: false });
        setRearm((n) => n + 1);
    }, []);

    // B2h: the damage only computes the new health; the kill's side effects run in the post-commit effect below, so a
    // throwing reward cannot void the win. It reads the store at the call, so two hits in one frame (melee and a spell)
    // both land, and the second sees the first's health. `source` is the damage source CombatSystem uses
    // (combat/damageSource.js): the player's hits take the riposte while the dragon is staggered (game/bossCombat.js
    // bossDamage), an ally's or a hazard's never do. The phase a hit crosses into is announced here, where the player
    // caused it, read off the same phaseForHealth the bar uses.
    const damageBoss = useCallback((amount, source = 'player') => {
        const s = useGameStore.getState();
        if (!s.bossActive || !(s.bossHealth > 0)) return;
        const max = bossTierStats(s.bossTier || 0).health;
        const dealt = bossDamage(amount, source, bossCombat, worldNow());
        const health = applyBossDamage(s.bossHealth, dealt).newHealth;
        writeEncounter({ health });
        const was = phaseForHealth(s.bossHealth, max);
        const phase = phaseForHealth(health, max);
        if (phase > was) {
            if (phase === 1) bossNotice('notice.bossPhase2');
            else if (phase === 2) bossNotice('notice.bossPhase3');
        }
    }, []);

    // B2h: the boss-kill beat. Fires ONCE (bossKilledRef latch) when health reaches 0, AFTER the health
    // commit — never inside a setState updater. Each effect runs in ISOLATION and the WIN LATCH runs LAST,
    // so a throwing reward (grantXP, loot) cannot prevent markGameWon. This is the game's win; it must not
    // be strandable by a reward that throws.
    useEffect(() => {
        if (!bossActive || bossHealth > 0 || bossKilledRef.current) return;
        bossKilledRef.current = true;
        const store = useGameStore.getState();
        runBossKillEffects([
            ['deactivate', () => writeEncounter({ active: false })],
            ['defeated', () => writeEncounter({ defeated: true })],
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
        // Dev-only force-spawn for the boss-closeup visual fixture: drops the dragon at a
        // fixed sky-studio position with no level/HP gate. Tree-shaken from prod builds.
        if (import.meta.env.DEV) {
            useGameStore.setState({ forceBossSpawn: (pos) => {
                preloadDragon();
                bossSpawned.current = true;
                bossKilledRef.current = false; // a dev re-spawn can be killed again
                bossPositionRef.current = pos;
                writeEncounter({ active: true });
            } });
            // The dragon fight's e2e (tests/e2e/dragon-fight.spec.js): wake it at a place, at a phase's health; read the
            // shoves the player was given; and hand the zone and hurl channels a request the way a cast or a throw does.
            registerTestHook('spawnDragonAt', (pos, { phase = 0 } = {}) => {
                preloadDragon();
                bossSpawned.current = true;
                bossKilledRef.current = false;
                bossPositionRef.current = [pos[0], pos[1], pos[2]];
                writeEncounter({ health: phase > 0 ? Math.floor(stats.health * stats.phases[phase].hpPercent) : stats.health, active: true });
            });
            registerTestHook('readImpulses', () => readImpulses());
            registerTestHook('clearImpulses', () => clearImpulses());
            registerTestHook('requestZoneAt', (pos, kind = 'burning') => requestZone({ kind, pos: { x: pos[0], y: pos[1], z: pos[2] } }));
            registerTestHook('requestHurlAt', (origin, dir) => requestHurl({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] }, '#A9966E'));
        }
    }, [damageBoss, suspendEncounter, stats]);

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
            writeEncounter({ active: true });
            return { position: [at[0], at[1], at[2]] };
        } });
        return () => useGameStore.setState({ lookbookSpawnDragon: null });
    }, []);

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
