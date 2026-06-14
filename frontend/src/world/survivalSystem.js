// survivalSystem.js — the day/night survival hook (extracted from AdvancedGameFeatures S3-M4 p2:
// same nightCount-single-SoT + dawn-bleed + dawn-reward behavior; mounted once in App). It deliberately
// does NOT write dangerLevel (the boss bridge is the sole dangerLevel writer — siege-gates locks this).
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { siegeWarning } from '../game/dayNight.js';

export const useSurvivalMode = (isDay) => {
    // nightCount is the STORE's single source of truth (lifted out of local useState
    // in M3b) so the spawn system (SimplifiedNPCSystem -> siegeParams) reads the same
    // value. Subscribe here for the warning/reward HUD; the spawn loop reads it
    // transiently via getState (Game-Loop-Isolation).
    const nightCount = useGameStore((s) => s.nightCount);
    const [survivalWarning, setSurvivalWarning] = useState(null);
    const prevIsDay = useRef(true);

    useEffect(() => {
        if (prevIsDay.current && !isDay) {
            // Night falls: bump the shared nightCount (drives the escalating siege), then surface a
            // NUMBERED + tiered warning so the siege has a readable ladder + a survival score.
            useGameStore.getState().incrementNight();
            const night = useGameStore.getState().nightCount; // post-increment = the night just begun
            setSurvivalWarning(siegeWarning(night));
            setTimeout(() => setSurvivalWarning(null), 4000);
        }

        if (!prevIsDay.current && isDay) {
            // S2-B1-M4: Ferocity bleeds to zero at dawn — banked combat-fury doesn't carry across
            // nights (prevents a second-night power spike + a stale bank auto-arming the next roar).
            useGameStore.getState().setFerocityBanked(0);
            // S2-B2-M4: Kinetic mirrors Ferocity at dawn (Kevin Decision #2) — no carry across nights.
            useGameStore.getState().setKineticBanked(0);
            // S2-B3-M2: Soul joins the dawn bleed (the same no-carry contract).
            useGameStore.getState().setSoulBanked(0);
            // S2-B4-M2: Resonance joins too — yesterday's building charge doesn't carry.
            useGameStore.getState().setResonanceBanked(0);
            // Dawn: reward surviving the night just passed. nightCount was bumped at
            // nightfall, so it equals the night survived. grantDawnReward guards
            // once-per-night INTERNALLY (via the persisted lastRewardedNight), so a
            // re-fired transition, a hook remount, or a reload mid-run cannot double-grant.
            const survived = useGameStore.getState().nightCount;
            const r = survived > 0 ? useGameStore.getState().grantDawnReward(survived) : null;
            // Credit the survive_nights quests exactly once per genuinely-survived night: grantDawnReward
            // returns its descriptor only when it actually granted (null on a re-fired/duplicate dawn), so
            // gating on `r` inherits that once-per-night guard (no double-count on remount/reload).
            if (r) useGameStore.getState().onNightSurvived?.();
            setSurvivalWarning(r
                ? `Dawn! +${r.xp} XP, +${r.coins} coins, ${r.lootItem}!`
                : 'Dawn breaks! You survived the night!');
            setTimeout(() => setSurvivalWarning(null), 3000);
        }

        prevIsDay.current = isDay;
    }, [isDay]);

    // NOTE: night does NOT write dangerLevel. moodTarget() already floors night at
    // mood 1 (dusk) via its `night` term, so a night->dangerLevel(1) write was a no-op
    // for mood AND could stomp an active boss's dangerLevel=2 at a dusk/dawn transition
    // (the boss bridge below is the SOLE dangerLevel writer). Night danger is delivered
    // by the escalating siege spawn-ramp (siegeParams) + the existing dusk mood; the
    // obsidian mood (level 2) stays the BOSS signature. Deep-night-obsidian is a
    // deliberate mood-design decision batched to Kevin (KEVIN-REVIEW-BATCH).

    return { nightCount, survivalWarning };
};
