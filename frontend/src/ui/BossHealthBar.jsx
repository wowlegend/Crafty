// BossHealthBar.jsx — the boss HUD health bar (extracted from AdvancedGameFeatures S3-M4 p4).
import React from 'react';
import { Panel, StatBar, Icon } from './primitives/index.js';
import { BOSS_CONFIG } from '../game/bossConfig.js';

// It sits in the HUD's encounter column (HUD.jsx), which gives it `width` (ui/hudLayout.js bossWidth); `compact` (a phone,
// where the bar is about 200 px wide, and a phone on its side, whose 91 px under the crosshair hold 85 and not 106:
// ui/hudLayout.js compactBoss) keeps the name and the bar and drops the phase line and the numbers.
export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase, bossName, width = 450, compact = false }) => {
    if (!bossActive) return null;

    const hpPercent = (bossHealth / bossMaxHealth) * 100;

    let subText = 'Phase 1: Aerial Barrage';
    if (bossPhase === 1) subText = 'Phase 2: Grounded Carnage [Knockback Roars]';
    if (bossPhase === 2) subText = 'Phase 3: Enraged Inferno [Lava Circles & Summons]';

    return (
        <div data-testid="boss-health-bar" className="pointer-events-none" style={{ width }}>
            <Panel variant="raise" className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-display uppercase tracking-wide text-danger text-base leading-none">
                        <Icon name="dragon" size={18} className="flex-none" /> {bossName || BOSS_CONFIG.name /* C3: 'Shadow Dragon Risen II' */}
                    </span>
                    {!compact && (
                        <span className="text-text-muted font-bold text-xs text-right">
                            {subText}
                        </span>
                    )}
                </div>
                {/* Bold-flat boss bar: inset danger StatBar replaces the emissive gradient. */}
                <StatBar kind="health" value={bossHealth} max={bossMaxHealth} className="w-full" />
                {!compact && (
                    <div className="mt-1.5 flex justify-between text-[10px] text-text-muted font-semibold tabular-nums">
                        <span>HP {bossHealth} / {bossMaxHealth}</span>
                        <span>{Math.round(hpPercent)}% REMAINING</span>
                    </div>
                )}
            </Panel>
        </div>
    );
});
