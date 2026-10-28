// survivalSystem.js — the day/night survival hook (extracted from AdvancedGameFeatures S3-M4 p2:
// same nightCount-single-SoT + dawn-bleed + dawn-reward behavior; mounted once in App). It deliberately
// does NOT write dangerLevel (the boss bridge is the sole dangerLevel writer — siege-gates locks this).
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { siegeWarning } from '../game/dayNight.js';
import { resolveDawn } from './dawnSurvival.js';

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
            // Night falls: surface a NUMBERED + tiered warning so the siege has a readable ladder + a
            // survival score. B2f: this hook NO LONGER writes nightCount — the siege ratchet is advanced
            // solely by the clock (setGameTime -> crossedIntoNight). It used to call incrementNight() on
            // this reactive isDay-edge, which fired on a LOAD too (loadWorldData flips isDay), silently
            // adding a phantom siege night per reload. nightCount is already correct here (setGameTime
            // bumped it in the same tick that flipped isDay).
            const night = useGameStore.getState().nightCount;
            setSurvivalWarning(siegeWarning(night));
            setTimeout(() => setSurvivalWarning(null), 4000);
        }

        if (!prevIsDay.current && isDay) {
            // Ember empties at dawn: a bar banked by day is spent by night or lost, so no night opens with the last
            // one's leftovers (a second-night power spike, or a stale full bar arming the next roar).
            useGameStore.getState().setEmber(0);
            // Dawn: reward surviving the night just passed. nightCount was bumped at
            // nightfall, so it equals the night survived. grantDawnReward guards
            // once-per-night INTERNALLY (via the persisted lastRewardedNight), so a
            // re-fired transition, a hook remount, or a reload mid-run cannot double-grant.
            // resolveDawn owns the DECISION (credit the survive_nights quest once per genuinely-survived
            // night, gated on the grant descriptor so a re-fired/duplicate dawn cannot double-count) + the
            // HUD message. grantDawnReward is injected — it carries the grant side effect AND the persisted
            // once-per-night guard (null on remount/reload). Behavioral seam: world/dawnSurvival.test.js.
            const { creditSurvivedNight, message } = resolveDawn(
                useGameStore.getState().nightCount,
                useGameStore.getState().grantDawnReward,
            );
            if (creditSurvivedNight) useGameStore.getState().onNightSurvived?.();
            setSurvivalWarning(message);
            setTimeout(() => setSurvivalWarning(null), 3000);
        }

        prevIsDay.current = isDay;
    }, [isDay]);

    // NOTE: night does NOT write dangerLevel. A night->dangerLevel(1) write could stomp an
    // active boss's dangerLevel=2 at a dusk/dawn transition (the boss bridge below is the
    // SOLE dangerLevel writer). Night's LOOK is the clock's: render/colourScript.js keys a
    // moonlit night on the sun's elevation, and the mood is only the danger overlay
    // (moodTarget does not floor night at 1). Night danger is delivered by the escalating siege spawn-ramp
    // (siegeParams); a siege-night overlay needs a siege signal the mood does not have yet
    // (roadmap move 10). The obsidian mood (level 2) stays the BOSS signature.

    return { nightCount, survivalWarning };
};
