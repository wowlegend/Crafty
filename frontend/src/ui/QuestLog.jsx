import React from 'react';
import { Modal, Panel, Icon, Button } from './primitives/index.js';

// The full quest LOG panel (L). Reuses the AchievementsPanel Modal grammar (bold-flat,
// Escape/backdrop close via the Modal primitive). Each active quest shows its giver + lore
// (questLore.js, applied in QuestSystem at M-NARRATIVE.2) + the themed objective + progress.
// Read-only narrative surface — claiming still happens via Q in the QuestTracker. Mounted in
// MenuSystem's panel AnimatePresence; capture-irrelevant (a modal, never in the world baselines).
export const QuestLog = React.memo(({ quests = [], onClose }) => {
    return (
        <Modal
            testId="quest-log-panel"
            label="Quest Log"
            className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in"
            onClose={onClose}
        >
            <Panel
                variant="raise"
                className="w-[460px] max-w-[95vw] max-h-[80vh] overflow-hidden shadow-elev-xl p-0 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink flex-none">
                    <div className="flex items-center gap-3">
                        <Icon name="scroll" size={26} className="text-accent" />
                        <span className="font-display text-xxl tracking-wide">Quest Log</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body — active quest list */}
                <div className="flex flex-col gap-3 px-5 pt-5 pb-5 overflow-y-auto">
                    {quests.map((q) => {
                        const target = q.target || 1;
                        const pct = Math.min(100, Math.round(((q.progress || 0) / target) * 100));
                        return (
                            <Panel key={q.id} variant="inset" className="bg-slot p-3">
                                <div className="flex items-center gap-2 text-text font-bold text-sm">
                                    {q.icon && <Icon name={q.icon} size={16} className="text-accent flex-none" />}
                                    <span className="flex-1 min-w-0">{q.title}</span>
                                    {q.completed && <Icon name="check" size={15} className="text-success flex-none" />}
                                </div>
                                {q.giver && <div className="text-[11px] text-accent uppercase tracking-wider mt-0.5">{q.giver}</div>}
                                {q.lore && <div className="text-xs text-text-muted italic mt-1 leading-snug">{q.lore}</div>}
                                <div className="text-[11px] text-text-muted mt-2">{q.description}</div>
                                {/* Objective progress */}
                                <div className="mt-1.5">
                                    <div className="h-2 rounded-sm bg-panel-inset border-chrome border-ink overflow-hidden">
                                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="text-[10px] text-text-muted tabular-nums text-right mt-0.5">{q.progress || 0} / {target}</div>
                                </div>
                            </Panel>
                        );
                    })}
                    {quests.length === 0 && (
                        <div className="text-text-muted text-sm text-center py-6">No active quests. Speak to the warden at the gate.</div>
                    )}
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset flex-none">
                    Press L to close • Q claims a finished quest from the tracker
                </div>
            </Panel>
        </Modal>
    );
});
