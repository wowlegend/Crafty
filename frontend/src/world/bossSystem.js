// bossSystem.js — the Shadow Dragon boss state machine + the bossActive->dangerLevel obsidian-mood
// bridge (extracted from AdvancedGameFeatures S3-M4 p4; mounted once in App). Verbatim.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { bossTierStats, bossCanReturn, BOSS_BASE_LEVEL } from '../game/bossTier.js';
import { blightHeartSite } from './blightHeart.js';
import { HITSTOP } from '../game/trauma.js';
import { applyBossDamage, runBossKillEffects } from '../game/bossKill.js';
import { runIsolatedEffects } from '../game/isolatedEffects.js';
import { bossEntranceBeat, ENTRANCE } from '../game/bossEntrance.js';
import { phaseForHealth } from '../game/bossPersistence.js';
import { makeNotifClearTracker } from './bossNotifTimers.js';

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
    const [bossNotification, setBossNotification] = useState(null);
    const bossSpawned = useRef(false);
    const bossKilledRef = useRef(false); // idempotency latch: kill side-effects fire EXACTLY once even if damageBoss is called twice in a frame (melee + spell) or the updater double-invokes under StrictMode

    // Track the boss-notification auto-clear timeouts so they can't fire setBossNotification AFTER unmount
    // (the audit's setState-after-unmount leak). Extracted to bossNotifTimers.js (behavioral test, V1).
    const notifTracker = useRef(null);
    if (!notifTracker.current) notifTracker.current = makeNotifClearTracker(setBossNotification);
    const scheduleNotifClear = useCallback((ms) => notifTracker.current.schedule(ms), []);
    useEffect(() => () => notifTracker.current.clearAll(), []);

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
        const lair = blightHeartSite();
        const interval = setInterval(() => {
            if (bossSpawned.current) return;
            if (bossTier > 0 && bossDefeated) {
                const s = useGameStore.getState();
                if (!bossCanReturn({ tier: bossTier, killNight: s.bossKillNight, nightCount: s.nightCount, level: playerLevel })) return;
                if (!returnAnnounced.current) {
                    returnAnnounced.current = true;
                    setBossNotification(`The Blight Heart stirs again -- the ${stats.name} waits at the lair.`);
                    scheduleNotifClear(6000);
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
                notify: () => { setBossNotification(`The Blight Heart stirs -- the ${stats.name} awakens! [Climax]`); scheduleNotifClear(6000); },
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
    }, [playerLevel, bossDefeated, bossTier, stats, scheduleNotifClear]);

    useEffect(() => {
        // The threshold walk moved to game/bossPersistence.phaseForHealth so the rehydrate seeds the phase
        // with the SAME function that advances it here. Two copies of one derivation is how a restored
        // fight ends up in a phase its health does not justify.
        const i = phaseForHealth(bossHealth, bossMaxHealth);
        if (bossPhase !== i) {
            setBossPhase(i);
            let alertMsg = '';
            if (i === 1) {
                alertMsg = 'PHASE 2: The Shadow Dragon lands! Pushing you back with ROARS!';
            } else if (i === 2) {
                alertMsg = 'PHASE 3: The Shadow Dragon is ENRAGED! Watch out for LAVA ZONES and Skeleton Summons!';
            }
            if (alertMsg) {
                setBossNotification(alertMsg);
                scheduleNotifClear(5000);
            }
        }
    }, [bossHealth, bossMaxHealth, bossPhase, scheduleNotifClear]);

    // B2h: the updater is now PURE — it only computes the new health. The kill's ~8 side effects moved to
    // the post-commit effect below, so a throwing reward can no longer void the win (they used to run inside
    // this updater, with the idempotency latch set first and markGameWon last — one throw stranded the win).
    const damageBoss = useCallback((amount) => {
        if (!bossActive || bossHealth <= 0) return;
        setBossHealth(prev => applyBossDamage(prev, amount).newHealth);
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
            ['notify', () => { setBossNotification(`BOSS DEFEATED! You have slain the ${stats.name}! +${stats.xpReward} XP!`); scheduleNotifClear(6000); }],
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
    }, [bossActive, bossHealth, scheduleNotifClear, stats, bossTier]);

    useEffect(() => {
        useGameStore.setState({ damageBoss: damageBoss });
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
                bossSpawned.current = true;
                bossKilledRef.current = false; // a dev re-spawn can be killed again
                bossPositionRef.current = pos;
                setBossActive(true);
                setBossPhase(0);
            } });
        }
    }, [damageBoss, bossPositionRef, bossActive]);

    // A-bis B2g: mirror the ENCOUNTER to the store, which is what saveSchema serializes. Its own effect,
    // keyed on all three values, deliberately NOT folded into the callback-registration effect above:
    // that one is keyed on [damageBoss, bossPositionRef, bossActive], so health mirrored there would only
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
        bossDefeated, bossPhase, bossNotification, damageBoss,
        bossTier, bossName: stats.name,
    };
};
