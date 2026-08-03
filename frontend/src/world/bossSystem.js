// bossSystem.js — the Shadow Dragon boss state machine + the bossActive->dangerLevel obsidian-mood
// bridge (extracted from AdvancedGameFeatures S3-M4 p4; mounted once in App). Verbatim.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { BOSS_CONFIG, BOSS_LOOT } from '../game/bossConfig.js';
import { blightHeartSite } from './blightHeart.js';
import { HITSTOP } from '../game/trauma.js';
import { applyBossDamage, runBossKillEffects } from '../game/bossKill.js';
import { phaseForHealth } from '../game/bossPersistence.js';
import { makeNotifClearTracker } from './bossNotifTimers.js';

export const useBossSystem = (playerLevel) => {
    // A-bis B2g: seed from the STORE, which is what the save restores into, instead of from BOSS_CONFIG.
    // These were plain `useState(BOSS_CONFIG.health)` / `useState(false)`, so a reload mid-fight handed the
    // dragon back all 700 HP. Lazy initialisers: read once at mount, after loadGame has hydrated the store.
    const [bossActive, setBossActive] = useState(() => useGameStore.getState().bossActive);
    const [bossHealth, setBossHealth] = useState(() => useGameStore.getState().bossHealth);
    const [bossMaxHealth] = useState(BOSS_CONFIG.health);
    const bossPositionRef = useRef(null);
    const [bossDefeated, setBossDefeated] = useState(() => useGameStore.getState().bossDefeated);
    // Seeded from the restored HP, NOT 0. The effect below announces every phase change, so mounting at
    // 17% HP with phase 0 would fire "PHASE 3: ENRAGED!" on load — announcing a transition the player
    // passed before they quit. Same derivation the effect uses, so mount produces no change to announce.
    const [bossPhase, setBossPhase] = useState(() =>
        phaseForHealth(useGameStore.getState().bossHealth, BOSS_CONFIG.health));
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
    useEffect(() => {
        // S9c: a persisted win (gameWon) keeps the slain dragon from auto-respawning into a beaten game.
        if (playerLevel < 5 || bossSpawned.current || bossDefeated || useGameStore.getState().gameWon) return;
        const lair = blightHeartSite();
        const interval = setInterval(() => {
            if (bossSpawned.current) return;
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            if (Math.hypot(playerPos.x - lair.x, playerPos.z - lair.z) > 24) return; // not at the lair yet
            bossSpawned.current = true;
            setBossNotification('The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]');
            scheduleNotifClear(6000);
            let y = 35; // spawn high up over the lair
            const getGy = useGameStore.getState().getMobGroundLevel;
            if (getGy) {
                const gy = getGy(lair.x, lair.z);
                if (gy !== null && !isNaN(gy)) y = gy + 15;
            }
            bossPositionRef.current = [lair.x, y, lair.z];
            setBossActive(true);
        }, 1500);
        return () => clearInterval(interval);
    }, [playerLevel, bossDefeated]);

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
            ['notify', () => { setBossNotification('BOSS DEFEATED! You have slain the Shadow Dragon! +600 XP!'); scheduleNotifClear(6000); }],
            ['grantXP', () => GameMethods.grantXP && GameMethods.grantXP(BOSS_CONFIG.xpReward, 'Shadow Dragon Defeated!')],
            ['loot', () => { if (store.addToInventory) for (const [item, qty] of BOSS_LOOT) store.addToInventory(item, qty); }],
            // M2 #7 climactic boss-kill beat: a brief slow-mo freeze ('boss'-tier hitstop) + a bloom flash.
            ['hitstop', () => useGameStore.setState({ hitstopUntil: performance.now() + HITSTOP.boss })],
            ['bloom', () => store.triggerBloomSpike && store.triggerBloomSpike(450)],
            ['win', () => store.markGameWon && store.markGameWon()], // S9c: the persisted win — LAST + idempotent
        ]);
    }, [bossActive, bossHealth, scheduleNotifClear]);

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
    };
};
