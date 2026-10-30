// The Talents page (Character's third tab, on Tab): the four Aspect trees, the points to spend, and respec. Spells scale with level and have no
// section here (DECISIONS 2026-10-28 W1-H item 6).
import React from 'react';
import { m } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Icon } from './primitives/index.js';
import { ASPECT_TREES, canUnlockTalent, talentBlockedBy } from '../game/talentTree.js';
import { ASPECT_GUIDE } from '../game/aspectGuide.js';

/** How long a first respec press stays armed before it quietly disarms. */
export const RESPEC_ARM_MS = 3000;

export const SpellUpgradePanel = React.memo(({ onClose }) => {
    const t = useT();
    const talentPoints = useGameStore(state => state.talentPoints || 0);
    const unlockedTalents = useGameStore(state => state.unlockedTalents || {});
    const spendTalentPoint = useGameStore(state => state.spendTalentPoint);
    const respecTalentPoints = useGameStore(state => state.respecTalentPoints);
    const spentRanks = Object.values(unlockedTalents).reduce((n, v) => n + (v || 0), 0);
    // R1.8: respec wipes the whole build and sits beside the close button, so it takes TWO presses — the
    // first arms it (the label changes), the second commits. It disarms itself after RESPEC_ARM_MS, so a
    // stray first press can never be cashed by an unrelated later one.
    const [respecArmed, setRespecArmed] = React.useState(false);
    React.useEffect(() => {
        if (!respecArmed) return undefined;
        const id = setTimeout(() => setRespecArmed(false), RESPEC_ARM_MS);
        return () => clearTimeout(id);
    }, [respecArmed]);
    const getPlayerLevel = useGameStore(state => state.getPlayerLevel);
    const playerLevel = getPlayerLevel ? getPlayerLevel() : 1;

    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('a11y.progression')}
            tabIndex={-1}
            className="absolute inset-0 z-50 overflow-y-auto bg-ink/75"
        >
            {/* B5: the OUTER element is the scroll container; this inner min-h-full flex wrapper centers the
                panel when it fits AND keeps its top (header + close X) reachable when it overflows. The
                4-column panel is ~1962px tall at 1280x800, and items-center on the scroll element itself
                clipped the header 556px above the viewport (the close X was unreachable). */}
            <div className="flex min-h-full items-center justify-center p-4">
            <m.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="max-w-5xl w-full"
            >
                <Panel variant="raise" data-testid="progression-panel" className="p-6 flex flex-col">
                    {/* Header */}
                    <div data-testid="progression-header" className="flex items-center justify-between mb-6 pb-4 border-b-chrome border-ink">
                        <div>
                            <h2 className="flex items-center gap-2 font-display text-3xl uppercase tracking-wide text-accent">
                                <Icon name="sparkles" size={28} className="flex-none" /> Talents
                            </h2>
                            <p className="text-text-muted text-xs mt-1">{t('talent.intro')}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Panel variant="inset" bg="bg-slot" className="px-4 py-2 text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">{t('talent.points')}</div>
                                <div className="font-display text-2xl text-accent tabular-nums">{talentPoints}</div>
                            </Panel>
                            <Panel variant="inset" bg="bg-slot" className="px-4 py-2 text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">{t('talent.playerLevel')}</div>
                                <div className="font-display text-2xl text-spell-arcane tabular-nums">{playerLevel}</div>
                            </Panel>
                            {/* C4/Q24: the respec. Without a caller the store action is dead config —
                                a table entry nothing reads, which is the mistake this session already
                                shipped twice. Disabled rather than hidden when there is nothing to
                                refund, so the affordance is discoverable before you have spent. */}
                            <Button
                                variant="ghost"
                                size="sm"
                                data-testid="talent-respec"
                                disabled={spentRanks === 0}
                                aria-label={respecArmed ? t('talent.respecConfirm') : t('talent.respec')}
                                title={t('talent.respecHint')}
                                data-armed={respecArmed ? 'true' : 'false'}
                                onClick={() => {
                                    if (!respecArmed) { setRespecArmed(true); return; }
                                    setRespecArmed(false);
                                    if (respecTalentPoints) respecTalentPoints();
                                }}
                                text={respecArmed ? 'text-spell-fire' : 'text-text-muted'}
                                className="px-3"
                            >
                                {respecArmed ? t('talent.respecConfirm') : t('talent.respec')}
                            </Button>
                            <Button variant="ghost" size="icon" text="text-text-muted" aria-label={t('ui.close')} onClick={onClose} className="w-10 h-10">
                                <Icon name="close" size={18} />
                            </Button>
                        </div>
                    </div>

                    {/* Branches Columns Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {ASPECT_TREES.map((branch, index) => (
                            <Panel key={index} variant="inset" bg="bg-panel" className="p-4 flex flex-col gap-4">
                                <h3 className={`flex items-center justify-center gap-2 font-display text-lg text-center border-b-chrome border-ink pb-2 ${branch.accent}`}>
                                    {branch.icon && <Icon name={branch.icon} size={18} className="flex-none" />}
                                    <span>{branch.title}</span>
                                </h3>
                                {/* the Aspect-UX clarity pass: HOW IT PLAYS (game/aspectGuide.js) */}
                                {ASPECT_GUIDE[branch.aspect] && (
                                    <Panel variant="inset" className="p-3 bg-panel-inset">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{t('talent.howItPlays')}</span>
                                            <span className={`font-display text-sm px-2 py-0.5 rounded border-chrome border-ink bg-slot ${branch.accent}`}>{ASPECT_GUIDE[branch.aspect].key}</span>
                                        </div>
                                        <div className={`text-[10px] font-bold mb-1.5 ${branch.accent}`}>{ASPECT_GUIDE[branch.aspect].meter}</div>
                                        <ol className="flex flex-col gap-1">
                                            {ASPECT_GUIDE[branch.aspect].steps.map((step, si) => (
                                                <li key={si} className="text-text-muted text-[11px] leading-snug flex gap-1.5">
                                                    <span className={`font-display flex-none ${branch.accent}`}>{si + 1}.</span>
                                                    <span>{step}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </Panel>
                                )}
                                <div className="flex flex-col gap-3.5">
                                    {branch.nodes.map((node) => {
                                        const currentLvl = unlockedTalents[node.id] || 0;
                                        const isPrereqMet = !node.prereq || (unlockedTalents[node.prereq] || 0) > 0;
                                        const isMaxed = currentLvl >= node.limit;
                                        // C4/Q24: ask the SAME predicate the store asks. This panel used to
                                        // re-derive the rules itself, which is how the store's missing prereq
                                        // check went unnoticed for so long — the UI greyed the node out, so
                                        // nobody could reach the hole by clicking, and the authority stayed
                                        // wrong. One predicate means the panel cannot disagree with the store.
                                        const blockedBy = talentBlockedBy(node.id, unlockedTalents);
                                        const canUpgrade = canUnlockTalent(node.id, unlockedTalents, talentPoints);

                                        return (
                                            <Panel
                                                key={node.id}
                                                variant="inset"
                                                bg={isMaxed || isPrereqMet ? 'bg-slot' : 'bg-panel-inset'}
                                                className={isMaxed || isPrereqMet ? 'p-3 relative' : 'p-3 relative opacity-40'}
                                            >
                                                {/* Prerequisite lock overlay */}
                                                {!isPrereqMet && (
                                                    <div className="absolute top-2 right-2 text-xs text-danger flex items-center gap-1 font-bold">
                                                        <Icon name="lock" size={12} className="flex-none" /> Locked
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between">
                                                    <div className="font-bold text-sm text-text">{node.name}</div>
                                                    <div className="flex gap-0.5">
                                                        {Array.from({ length: node.limit }).map((_, l) => (
                                                            <div
                                                                key={l}
                                                                className={`w-2.5 h-2.5 rounded-sm border-chrome border-ink ${
                                                                    l < currentLvl ? branch.dot : 'bg-track'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <p className="text-text-muted text-xs mt-1.5 leading-relaxed">{node.desc}</p>

                                                {node.prereq && (
                                                    <div className="text-[10px] text-spell-arcane mt-1 font-bold">
                                                        Prerequisite: {branch.nodes.find(n => n.id === node.prereq)?.name || node.prereq}
                                                    </div>
                                                )}

                                                {/* C4/Q24: an either/or node must SAY why it is closed. A
                                                    disabled control with no reason reads as a bug, and the
                                                    choice is the feature — the player needs to see that
                                                    taking one shut the other. */}
                                                {blockedBy && (
                                                    <div className="text-[10px] text-text-muted mt-1 font-bold" data-testid={`talent-excluded-${node.id}`}>
                                                        {t('talent.excludedBy')} {branch.nodes.find(n => n.id === blockedBy)?.name || blockedBy}
                                                    </div>
                                                )}

                                                <div className="mt-3 flex items-center justify-between border-t-chrome border-ink pt-2">
                                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider tabular-nums">
                                                        Rank {currentLvl}/{node.limit}
                                                    </span>
                                                    {isMaxed ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-accent font-display uppercase tracking-wider">{t('talent.maxRank')} <Icon name="star" size={12} className="flex-none" /></span>
                                                    ) : isPrereqMet ? (
                                                        <Button
                                                            variant="primary"
                                                            size={null}
                                                            disabled={!canUpgrade}
                                                            onClick={() => spendTalentPoint(node.id)}
                                                            data-testid={`talent-take-${node.id}`}
                                                            className="gap-2 px-3 py-1 text-[10px] tracking-widest"
                                                        >
                                                            {t('ui.upgrade')}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-danger font-bold">{t('talent.requiresParent')}</span>
                                                    )}
                                                </div>
                                            </Panel>
                                        );
                                    })}
                                </div>
                            </Panel>
                        ))}
                    </div>

                </Panel>
            </m.div>
            </div>
        </m.div>
    );
});
