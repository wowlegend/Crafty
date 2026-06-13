// BossHealthBar.jsx — the boss HUD health bar (extracted from AdvancedGameFeatures S3-M4 p4).
import React from 'react';
import { Panel, StatBar, Icon } from './primitives/index.js';
import { BOSS_CONFIG } from '../game/bossConfig.js';

export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase }) => {
    if (!bossActive) return null;

    const hpPercent = (bossHealth / bossMaxHealth) * 100;

    let subText = 'Phase 1: Aerial Barrage';
    if (bossPhase === 1) subText = 'Phase 2: Grounded Carnage [Knockback Roars]';
    if (bossPhase === 2) subText = 'Phase 3: Enraged Inferno [Lava Circles & Summons]';

    return (
        <div className="absolute top-36 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none" style={{ width: 450 }}>
            <Panel variant="raise" className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-display uppercase tracking-wide text-danger text-base leading-none">
                        <Icon name="dragon" size={18} className="flex-none" /> {BOSS_CONFIG.name}
                    </span>
                    <span className="text-text-muted font-bold text-xs text-right">
                        {subText}
                    </span>
                </div>
                {/* Bold-flat boss bar: inset danger StatBar replaces the emissive gradient. */}
                <StatBar kind="health" value={bossHealth} max={bossMaxHealth} className="w-full" />
                <div className="mt-1.5 flex justify-between text-[10px] text-text-muted font-semibold tabular-nums">
                    <span>HP {bossHealth} / {bossMaxHealth}</span>
                    <span>{Math.round(hpPercent)}% REMAINING</span>
                </div>
            </Panel>
        </div>
    );
});
