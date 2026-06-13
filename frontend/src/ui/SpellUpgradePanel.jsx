// Extracted from AdvancedGameFeatures S3-M4 (the AGF dissolve, part 1): verbatim, same behavior.
import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Icon } from './primitives/index.js';
import { ASPECT_TREES } from '../game/talentTree.js';
import { ASPECT_GUIDE } from '../game/aspectGuide.js';

export const SpellUpgradePanel = React.memo(({ onClose }) => {
    const t = useT();
    const talentPoints = useGameStore(state => state.talentPoints || 0);
    const unlockedTalents = useGameStore(state => state.unlockedTalents || {});
    const spendTalentPoint = useGameStore(state => state.spendTalentPoint);
    const getPlayerLevel = useGameStore(state => state.getPlayerLevel);
    const playerLevel = getPlayerLevel ? getPlayerLevel() : 1;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-ink/75"
        >
            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                className="max-w-5xl w-full"
            >
                <Panel variant="raise" className="p-6 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b-chrome border-ink">
                        <div>
                            <h2 className="flex items-center gap-2 font-display text-3xl uppercase tracking-wide text-accent">
                                <Icon name="sparkles" size={28} className="flex-none" /> Aspects — Talent Trees
                            </h2>
                            <p className="text-text-muted text-xs mt-1">Four powers, four keys. Each Aspect banks its own meter and spends it on a signature verb — the HOW IT PLAYS card in each column shows the loop.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Panel variant="inset" className="px-4 py-2 bg-slot text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Talent Points</div>
                                <div className="font-display text-2xl text-accent tabular-nums">{talentPoints}</div>
                            </Panel>
                            <Panel variant="inset" className="px-4 py-2 bg-slot text-center">
                                <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Player Level</div>
                                <div className="font-display text-2xl text-spell-arcane tabular-nums">{playerLevel}</div>
                            </Panel>
                            <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-10 h-10 p-0 text-text-muted">
                                <Icon name="close" size={18} />
                            </Button>
                        </div>
                    </div>

                    {/* Branches Columns Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {ASPECT_TREES.map((branch, index) => (
                            <Panel key={index} variant="inset" className="p-4 bg-panel flex flex-col gap-4">
                                <h3 className={`flex items-center justify-center gap-2 font-display text-lg text-center border-b-chrome border-ink pb-2 ${branch.accent}`}>
                                    {branch.icon && <Icon name={branch.icon} size={18} className="flex-none" />}
                                    <span>{branch.title}</span>
                                </h3>
                                {/* the Aspect-UX clarity pass: HOW IT PLAYS (game/aspectGuide.js) */}
                                {ASPECT_GUIDE[branch.aspect] && (
                                    <Panel variant="inset" className="p-3 bg-panel-inset">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">How it plays</span>
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
                                        const canUpgrade = talentPoints > 0 && isPrereqMet && !isMaxed;

                                        return (
                                            <Panel
                                                key={node.id}
                                                variant="inset"
                                                className={`p-3 relative ${
                                                    isMaxed
                                                        ? 'bg-slot'
                                                        : !isPrereqMet
                                                        ? 'bg-panel-inset opacity-40'
                                                        : 'bg-slot'
                                                }`}
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

                                                <div className="mt-3 flex items-center justify-between border-t-chrome border-ink pt-2">
                                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider tabular-nums">
                                                        Rank {currentLvl}/{node.limit}
                                                    </span>
                                                    {isMaxed ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-accent font-display uppercase tracking-wider">Max Rank <Icon name="star" size={12} className="flex-none" /></span>
                                                    ) : isPrereqMet ? (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            disabled={!canUpgrade}
                                                            onClick={() => spendTalentPoint(node.id)}
                                                            className="px-3 py-1 text-[10px] tracking-widest"
                                                        >
                                                            Upgrade
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-danger font-bold">Requires Parent Node</span>
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
            </motion.div>
        </motion.div>
    );
});
