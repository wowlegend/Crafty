// accrualHooks.js — the Aspect-economy kill-bus accrual bridges (extracted from
// AdvancedGameFeatures S3-M4: same player-kill / day-only / capture-guarded attribution contract).
// Non-R3F useEffect subscriptions to the mob-kill bus; mounted once in App.
import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { subscribeMobKill } from '../game/mobKillBus.js';
import { ferocityForKill } from '../game/ferocity.js';
import { kineticForKill } from '../game/kinetic.js';
import { soulForKill } from '../game/soul.js';

// S2-B1-M4: bank Ferocity on a DAY mob-kill (via the M3.5 fan-out bus). Day-only so the "bank in the
// day, unleash in the siege" loop holds; capture-guarded so the visual gate is unaffected. Mount once
// (App). The store clamps to [0,MAX]; this just feeds the signed per-kill delta.
export const useFerocityAccrual = () => {
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        // S2-B3-M1: only YOUR kills bank Ferocity (ally kills would AFK-farm the meter)
        if (source === 'player' && s.isDay && !isCaptureMode()) s.accrueFerocity(ferocityForKill(mobType));
    }), []);
};

// S2-B2-M4: the Kinetic twin — day kills bank grab charge (spent per combat grab, dawn-bled).
export const useSoulAccrual = () => {
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        // S2-B3: only YOUR kills bank Soul (the M1 attribution contract)
        if (source === 'player' && s.isDay && !isCaptureMode()) s.accrueSoul(soulForKill(mobType));
    }), []);
};

export const useKineticAccrual = () => {
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        // S2-B3-M1: only YOUR kills bank Kinetic (the same attribution contract as Ferocity)
        if (source === 'player' && s.isDay && !isCaptureMode()) s.accrueKinetic(kineticForKill(mobType));
    }), []);
};
