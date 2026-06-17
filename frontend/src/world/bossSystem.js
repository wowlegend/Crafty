// bossSystem.js — the Shadow Dragon boss state machine + the bossActive->dangerLevel obsidian-mood
// bridge (extracted from AdvancedGameFeatures S3-M4 p4; mounted once in App). Verbatim.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { BOSS_CONFIG } from '../game/bossConfig.js';
import { blightHeartSite } from './blightHeart.js';
import { HITSTOP } from '../game/trauma.js';

export const useBossSystem = (playerLevel) => {
    const [bossActive, setBossActive] = useState(false);
    const [bossHealth, setBossHealth] = useState(BOSS_CONFIG.health);
    const [bossMaxHealth] = useState(BOSS_CONFIG.health);
    const bossPositionRef = useRef(null);
    const [bossDefeated, setBossDefeated] = useState(false);
    const [bossPhase, setBossPhase] = useState(0);
    const [bossNotification, setBossNotification] = useState(null);
    const bossSpawned = useRef(false);

    // S9: the Shadow Dragon now AWAITS at the fixed Blight Heart lair (NOT a level-5 ambush at the player).
    // Once you are strong enough (level 5), poll for ARRIVAL at the lair (~24 blocks) -- the dragon awakens
    // when you REACH the foreshadowed, compass-marked destination. A useEffect keyed on [playerLevel] does
    // NOT re-fire as the player MOVES, so a poll is required to detect arrival. Transient store reads ->
    // Game-Loop-Isolation. The DEV forceBossSpawn (boss-closeup fixture) is a separate effect, untouched.
    useEffect(() => {
        if (playerLevel < 5 || bossSpawned.current || bossDefeated) return;
        const lair = blightHeartSite();
        const interval = setInterval(() => {
            if (bossSpawned.current) return;
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            if (Math.hypot(playerPos.x - lair.x, playerPos.z - lair.z) > 24) return; // not at the lair yet
            bossSpawned.current = true;
            setBossNotification('The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]');
            setTimeout(() => setBossNotification(null), 6000);
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
        const hpPercent = bossHealth / bossMaxHealth;
        for (let i = BOSS_CONFIG.phases.length - 1; i >= 0; i--) {
            if (hpPercent <= BOSS_CONFIG.phases[i].hpPercent) {
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
                        setTimeout(() => setBossNotification(null), 5000);
                    }
                }
                break;
            }
        }
    }, [bossHealth, bossMaxHealth, bossPhase]);

    const damageBoss = useCallback((amount) => {
        if (!bossActive || bossHealth <= 0) return;

        setBossHealth(prev => {
            const newHealth = Math.max(0, prev - amount);
            if (newHealth <= 0) {
                setBossActive(false);
                setBossDefeated(true);
                setBossNotification('BOSS DEFEATED! You have slain the Shadow Dragon! +600 XP!');
                setTimeout(() => setBossNotification(null), 6000);
                if (GameMethods.grantXP) {
                    GameMethods.grantXP(BOSS_CONFIG.xpReward, 'Shadow Dragon Defeated!');
                }
                // Reward player with Legendary Crown or material drops
                const store = useGameStore.getState();
                if (store.addToInventory) {
                    store.addToInventory('Crown of the Dragon King', 1);
                    store.addToInventory('Dragon Scale', 3);
                }
                // M2 #7 climactic boss-kill beat: a brief slow-mo freeze + a bloom flash punctuate the
                // slaying (the victory stinger + overlay already fire via bossDefeated). Reuses the M1
                // hitstop ('boss' tier) + the bloom-spike. FEEL/timing -> Kevin #50.
                useGameStore.setState({ hitstopUntil: performance.now() + HITSTOP.boss });
                if (store.triggerBloomSpike) store.triggerBloomSpike(450);
            }
            return newHealth;
        });
    }, [bossActive, bossHealth]);

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
                bossPositionRef.current = pos;
                setBossActive(true);
                setBossPhase(0);
            } });
        }
    }, [damageBoss, bossPositionRef, bossActive]);

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
