// PetIndicator.jsx — the pet HUD panel (extracted from AdvancedGameFeatures S3-M4 p3).
import React from 'react';
import { Panel, Icon } from './primitives/index.js';
import { useGameStore } from '../store/useGameStore';

export const PetIndicator = React.memo(({ pets }) => {
    const petOrder = useGameStore(state => state.petOrder || 'follow');
    if (pets.length === 0) return null;

    // Order badge -> flat status fill (follow=success/green, stay=warn/amber, attack=danger/red).
    let orderFill = 'bg-success';
    if (petOrder === 'stay') orderFill = 'bg-warn';
    if (petOrder === 'attack') orderFill = 'bg-danger';

    return (
        <div className="absolute bottom-40 left-4 z-20 pointer-events-none">
            <Panel variant="raise" className="px-4 py-3 space-y-2 max-w-[200px]">
                <div className="flex items-center justify-between border-b-chrome border-ink pb-1">
                    <span className="font-display text-[10px] uppercase tracking-wider text-accent">Pets ({pets.length}/3)</span>
                </div>

                {/* Active Command Overlay Badge — flat status fill */}
                <div className={`text-center py-1 rounded-sm text-[9px] font-display uppercase text-text-inverse tracking-widest border-chrome border-ink ${orderFill}`}>
                    Order: {petOrder}
                </div>

                <div className="space-y-1.5 pt-1">
                    {pets.map(pet => (
                        <div key={pet.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <Icon name={pet.type === 'pig' ? 'pig' : 'cow'} size={14} className="flex-none text-accent" />
                                <span className="text-text font-bold truncate max-w-[80px]">{pet.name}</span>
                            </div>
                            <span className="text-success font-bold text-[10px] tabular-nums">HP {pet.health}</span>
                        </div>
                    ))}
                </div>
                <div className="text-[8px] text-text-muted text-center font-bold uppercase tracking-wider pt-0.5 border-t-chrome border-ink">
                    Press T to cycle order
                </div>
            </Panel>
        </div>
    );
});
