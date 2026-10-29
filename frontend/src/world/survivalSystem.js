// survivalSystem.js — the day/night survival hook (extracted from AdvancedGameFeatures S3-M4 p2:
// same nightCount-single-SoT + dawn-reward behavior; mounted once in App). It deliberately
// does NOT write dangerLevel (the boss bridge is the sole dangerLevel writer — siege-gates locks this).
import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { siegeWarning } from '../game/dayNight.js';
import { resolveDawn } from './dawnSurvival.js';

// The nightfall and dawn notices go to the one notification channel (ui/notifications.js) as dictionary keys.
const notify = (notice, type) => useGameStore.getState().addNotification?.(notice.key, type, { vars: notice.vars });

export const useSurvivalMode = (isDay) => {
    // nightCount is the STORE's single source of truth (lifted out of local useState in M3b) so the spawn system
    // (SimplifiedNPCSystem -> siegeParams) reads the same value; this hook reads it at the edge only (getState).
    const prevIsDay = useRef(true);

    useEffect(() => {
        if (prevIsDay.current && !isDay) {
            // Night falls: surface a NUMBERED + tiered warning so the siege has a readable ladder + a
            // survival score. B2f: this hook NO LONGER writes nightCount — the siege ratchet is advanced
            // solely by the clock (setGameTime -> crossedIntoNight). It used to call incrementNight() on
            // this reactive isDay-edge, which fired on a LOAD too (loadWorldData flips isDay), silently
            // adding a phantom siege night per reload. nightCount is already correct here (setGameTime
            // bumped it in the same tick that flipped isDay).
            notify(siegeWarning(useGameStore.getState().nightCount), 'danger');
        }

        if (!prevIsDay.current && isDay) {
            // This edge fires on a load as well as a dawn, so nothing that must happen only at a real dawn belongs here
            // (the ember bar empties in setGameTime, on the clock's crossing).
            // Dawn: reward surviving the night just passed. nightCount was bumped at
            // nightfall, so it equals the night survived. grantDawnReward guards
            // once-per-night INTERNALLY (via the persisted lastRewardedNight), so a
            // re-fired transition, a hook remount, or a reload mid-run cannot double-grant.
            // resolveDawn owns the DECISION (credit the survive_nights quest once per genuinely-survived
            // night, gated on the grant descriptor so a re-fired/duplicate dawn cannot double-count) + the
            // notice. grantDawnReward is injected — it carries the grant side effect AND the persisted
            // once-per-night guard (null on remount/reload). Behavioral seam: world/dawnSurvival.test.js.
            const { creditSurvivedNight, notice } = resolveDawn(
                useGameStore.getState().nightCount,
                useGameStore.getState().grantDawnReward,
            );
            if (creditSurvivedNight) useGameStore.getState().onNightSurvived?.();
            notify(notice, 'warn');
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

};
