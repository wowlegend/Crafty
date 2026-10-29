// accrualHooks.js — the ember kill-bus bridge, mounted once in App: a non-R3F useEffect subscription to the mob-kill
// bus. Only the player's own kills pay (an ally's or a hazard's would fill the bar while the player stood idle), and
// never under capture. The day rule (bank by day, spend by night) is emberForKill's, the one place it is written.
import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { subscribeMobKill } from '../game/mobKillBus.js';
import { emberForKill } from '../game/ember.js';

export const useEmberAccrual = () => {
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        if (source === 'player' && !isCaptureMode()) s.gainEmber(emberForKill(mobType, s.isDay));
    }), []);
};
