// BossHealthBar.jsx — the boss HUD health bar (extracted from AdvancedGameFeatures S3-M4 p4).
import React from 'react';
import { Panel, StatBar, Icon } from './primitives/index.js';
import { useT } from '../i18n/i18n.js';
import { bossNameKey } from '../game/bossTier.js';
import { notificationText } from './notifications.js';

const PHASE_KEY = ['boss.phase1', 'boss.phase2', 'boss.phase3'];
const CALL_TONE = { danger: 'text-danger', warn: 'text-warn', warning: 'text-warn' };

/** Clamp a line of type to `lines` lines, an ellipsis ending the last. */
const clampLines = (lines) => ({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' });

// It sits in the HUD's encounter column (HUD.jsx), which gives it `width` (ui/hudLayout.js bossWidth); `compact` (a phone,
// where the bar is about 200 px wide, and a phone on its side, whose 91 px under the crosshair hold 85 and not 106:
// ui/hudLayout.js compactBoss) keeps the name and the bar and drops the phase line and the numbers. `call`: where the
// encounter column holds the notices (ui/hudLayout.js toastsInEncounter), the one it shows takes the name's place in the
// bar's own line beside the dragon's icon, clamped to `callLines` (ui/hudLayout.js bossCallLines), for its life.
export const BossHealthBar = React.memo(({ bossActive, bossHealth, bossMaxHealth, bossPhase, bossTier = 0, width = 450, compact = false, call = null, callLines = 1 }) => {
    const t = useT();
    if (!bossActive) return null;

    const hpPercent = (bossHealth / bossMaxHealth) * 100;
    const name = bossNameKey(bossTier);
    const tone = call && CALL_TONE[call.type];

    return (
        <div data-testid="boss-health-bar" className="pointer-events-none" style={{ width }}>
            <Panel variant="raise" className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Icon name="dragon" size={18} className="flex-none text-danger" />
                        {call ? (
                            <span data-testid="boss-call" data-notification-key={call.key || ''} role={tone ? 'alert' : 'status'}
                                className={`min-w-0 text-xs font-bold ${tone || 'text-text'}`} style={clampLines(callLines)}>
                                {notificationText(call, t)}
                            </span>
                        ) : (
                            <span className="font-display uppercase tracking-wide text-danger text-base leading-none">{t(name.key, name.vars)}</span>
                        )}
                    </span>
                    {!compact && (
                        <span className="text-text-muted font-bold text-xs text-right">
                            {t(PHASE_KEY[bossPhase] || PHASE_KEY[0])}
                        </span>
                    )}
                </div>
                {/* Bold-flat boss bar: inset danger StatBar replaces the emissive gradient. */}
                <StatBar kind="health" value={bossHealth} max={bossMaxHealth} className="w-full" />
                {!compact && (
                    <div className="mt-1.5 flex justify-between text-[10px] text-text-muted font-semibold tabular-nums">
                        <span>{t('boss.hp', { hp: bossHealth, max: bossMaxHealth })}</span>
                        <span>{t('boss.remaining', { pct: Math.round(hpPercent) })}</span>
                    </div>
                )}
            </Panel>
        </div>
    );
});
