import React from 'react';
import { m } from 'framer-motion';
import { Panel, Button, Icon, Modal } from './primitives/index.js';
import { useT } from '../i18n/i18n.js';

// The Journal's feats tab: the achievements and the run's stats. An on-demand panel, so it rides the lazy panel chunk
// (ui/panels/lazyPanels.js) and stays out of the boot chunk; the achievements themselves (QuestSystem.jsx ACHIEVEMENTS)
// and the stats it reads are the quest system's.
export const AchievementsPanel = React.memo(({ achievements, unlockedAchievements, stats, onClose }) => {
    const t = useT();
    const statCells = [
        { value: stats.kills, label: 'Kills', color: 'text-danger' },
        { value: stats.spells, label: 'Spells', color: 'text-spell-arcane' },
        { value: stats.chests, label: 'Chests', color: 'text-accent' },
        { value: stats.blocks_placed, label: 'Built', color: 'text-success' },
        { value: stats.blocks_broken, label: 'Mined', color: 'text-info' },
        { value: stats.deaths, label: 'Deaths', color: 'text-warn' },
    ];

    return (
        <Modal
            testId="achievements-panel"
            label="Achievements"
            className="absolute inset-0 z-50 grid place-items-center bg-ink/75 animate-fade-in"
            onClose={onClose}
        >
            <m.div
                initial={{ scale: 0.8, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 30 }}
                className="max-w-lg w-full mx-4 max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                <Panel variant="raise" className="overflow-hidden p-0 max-h-[80vh] flex flex-col">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink flex-none">
                        <span className="flex items-center gap-2 font-display text-xl uppercase tracking-wide text-accent">
                            <Icon name="star" size={24} className="text-accent" /> Achievements
                        </span>
                        <Button variant="ghost" size="icon" text="text-text-muted" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9">
                            <Icon name="close" size={18} />
                        </Button>
                    </div>

                    <div className="p-5 overflow-y-auto">
                        <div className="text-text-muted text-xs mb-4 tabular-nums">
                            {unlockedAchievements.size} / {achievements.length} unlocked
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {achievements.map(ach => {
                                const unlocked = unlockedAchievements.has(ach.id);
                                return (
                                    <Panel
                                        key={ach.id}
                                        variant="inset"
                                        bg={unlocked ? 'bg-slot' : 'bg-panel-inset'}
                                        className={unlocked ? 'p-3' : 'p-3 opacity-50'}
                                    >
                                        <div className="mb-1 text-2xl">
                                            {unlocked
                                                ? <Icon name={ach.icon} size={28} className="text-accent" />
                                                : <Icon name="lock" size={28} className="text-text-muted" />}
                                        </div>
                                        <div className={`text-xs font-bold ${unlocked ? 'text-accent' : 'text-text-muted'}`}>
                                            {ach.title}
                                        </div>
                                        <div className="text-text-muted text-xs mt-0.5">{ach.description}</div>
                                    </Panel>
                                );
                            })}
                        </div>

                        {/* Stats summary */}
                        <div className="mt-5 pt-4 border-t-chrome border-ink">
                            <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-text mb-2">
                                <Icon name="upgrade" size={16} className="text-text-muted" /> Stats
                            </h3>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                {statCells.map(cell => (
                                    <Panel key={cell.label} variant="inset" bg="bg-slot" className="text-center p-2">
                                        <div className={`${cell.color} font-bold text-lg tabular-nums`}>{cell.value}</div>
                                        <div className="text-text-muted">{cell.label}</div>
                                    </Panel>
                                ))}
                            </div>
                        </div>
                    </div>
                </Panel>
            </m.div>
        </Modal>
    );
});
