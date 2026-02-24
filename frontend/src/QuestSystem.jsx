import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Quest & Progression System: Quests, Loot Drops, Treasure Chests, Achievements



const LOOT_TABLES = {
    pig: [
        { item: '🥩 Raw Porkchop', chance: 0.8, xp: 5 },
        { item: '🦴 Bone', chance: 0.3, xp: 2 },
    ],
    cow: [
        { item: '🥩 Raw Beef', chance: 0.8, xp: 5 },
        { item: '🧶 Leather', chance: 0.5, xp: 3 },
        { item: '🦴 Bone', chance: 0.2, xp: 2 },
    ],
    zombie: [
        { item: '🧟 Rotten Flesh', chance: 0.7, xp: 3 },
        { item: '🗡️ Iron Nugget', chance: 0.3, xp: 8 },
        { item: '💎 Emerald', chance: 0.05, xp: 25 },
    ],
    skeleton: [
        { item: '🦴 Bone', chance: 0.9, xp: 3 },
        { item: '🏹 Arrow', chance: 0.6, xp: 4 },
        { item: '🗡️ Iron Nugget', chance: 0.2, xp: 8 },
    ],
    spider: [
        { item: '🕸️ Spider Eye', chance: 0.6, xp: 5 },
        { item: '🧵 String', chance: 0.8, xp: 3 },
        { item: '💜 Ender Pearl', chance: 0.03, xp: 30 },
    ],
};


const CHEST_LOOT = [
    { item: '❤️ Health Potion', chance: 0.6, effect: 'heal', value: 30 },
    { item: '💙 Mana Potion', chance: 0.5, effect: 'mana', value: 40 },
    { item: '⚔️ Damage Scroll', chance: 0.3, effect: 'buff_damage', value: 1.5, duration: 30 },
    { item: '🛡️ Shield Scroll', chance: 0.25, effect: 'buff_defense', value: 0.5, duration: 30 },
    { item: '💎 Diamond', chance: 0.15, effect: 'xp', value: 50 },
    { item: '👑 Golden Crown', chance: 0.05, effect: 'xp', value: 200 },
    { item: '🌟 Star Fragment', chance: 0.08, effect: 'xp', value: 100 },
];


const QUEST_LIST = [
    // Beginner quests
    { id: 'first_blood', title: '🗡️ First Blood', description: 'Defeat your first mob', type: 'kill', target: 1, xpReward: 30, tier: 1 },
    { id: 'hunter', title: '🏹 Hunter', description: 'Defeat 5 mobs', type: 'kill', target: 5, xpReward: 75, tier: 1 },
    { id: 'builder', title: '🧱 Builder', description: 'Place 20 blocks', type: 'block_place', target: 20, xpReward: 50, tier: 1 },
    { id: 'miner', title: '⛏️ Miner', description: 'Break 30 blocks', type: 'block_break', target: 30, xpReward: 60, tier: 1 },
    { id: 'spellcaster', title: '✨ Spellcaster', description: 'Cast 10 spells', type: 'spell_cast', target: 10, xpReward: 40, tier: 1 },

    // Intermediate quests
    { id: 'zombie_slayer', title: '🧟 Zombie Slayer', description: 'Defeat 10 zombies', type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2 },
    { id: 'spider_hunter', title: '🕷️ Spider Hunter', description: 'Defeat 8 spiders', type: 'kill_type', mobType: 'spider', target: 8, xpReward: 100, tier: 2 },
    { id: 'explorer', title: '🧭 Explorer', description: 'Travel 500 blocks from spawn', type: 'distance', target: 500, xpReward: 100, tier: 2 },
    { id: 'collector', title: '💰 Collector', description: 'Open 5 treasure chests', type: 'chest_open', target: 5, xpReward: 80, tier: 2 },
    { id: 'architect', title: '🏗️ Architect', description: 'Place 100 blocks', type: 'block_place', target: 100, xpReward: 150, tier: 2 },

    // Advanced quests
    { id: 'champion', title: '🏆 Champion', description: 'Defeat 50 mobs', type: 'kill', target: 50, xpReward: 300, tier: 3 },
    { id: 'archmage', title: '🧙 Archmage', description: 'Cast 100 spells', type: 'spell_cast', target: 100, xpReward: 250, tier: 3 },
    { id: 'treasure_master', title: '👑 Treasure Master', description: 'Open 20 treasure chests', type: 'chest_open', target: 20, xpReward: 200, tier: 3 },
    { id: 'world_builder', title: '🌍 World Builder', description: 'Place 500 blocks', type: 'block_place', target: 500, xpReward: 400, tier: 3 },
    { id: 'undead_destroyer', title: '💀 Undead Destroyer', description: 'Defeat 25 skeletons', type: 'kill_type', mobType: 'skeleton', target: 25, xpReward: 200, tier: 3 },
];


const ACHIEVEMENTS = [
    { id: 'first_step', title: '👣 First Steps', description: 'Enter the world', icon: '👣', auto: true },
    { id: 'first_kill', title: '⚔️ Warrior', description: 'Defeat your first mob', icon: '⚔️', stat: 'kills', target: 1 },
    { id: 'serial_killer', title: '💀 Serial Slayer', description: 'Defeat 25 mobs', icon: '💀', stat: 'kills', target: 25 },
    { id: 'centurion', title: '🏛️ Centurion', description: 'Defeat 100 mobs', icon: '🏛️', stat: 'kills', target: 100 },
    { id: 'first_spell', title: '✨ Apprentice', description: 'Cast your first spell', icon: '✨', stat: 'spells', target: 1 },
    { id: 'wizard', title: '🧙 Wizard', description: 'Cast 50 spells', icon: '🧙', stat: 'spells', target: 50 },
    { id: 'first_chest', title: '📦 Treasure Hunter', description: 'Open your first chest', icon: '📦', stat: 'chests', target: 1 },
    { id: 'level5', title: '⭐ Rising Star', description: 'Reach Level 5', icon: '⭐', stat: 'level', target: 5 },
    { id: 'level10', title: '🌟 Shining Star', description: 'Reach Level 10', icon: '🌟', stat: 'level', target: 10 },
    { id: 'survivor', title: '💪 Survivor', description: 'Die and respawn 3 times', icon: '💪', stat: 'deaths', target: 3 },
    { id: 'miner_ach', title: '⛏️ Deep Digger', description: 'Break 100 blocks', icon: '⛏️', stat: 'blocks_broken', target: 100 },
    { id: 'builder_ach', title: '🏠 Master Builder', description: 'Place 200 blocks', icon: '🏠', stat: 'blocks_placed', target: 200 },
];


export const useQuestSystem = () => {
    const [quests, setQuests] = useState(() => {
        // Initialize active quests (first 3 from tier 1)
        return QUEST_LIST.filter(q => q.tier === 1).slice(0, 3).map(q => ({
            ...q,
            progress: 0,
            completed: false,
            claimed: false,
        }));
    });

    const [completedQuestIds, setCompletedQuestIds] = useState(new Set());
    const [stats, setStats] = useState({
        kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0,
        blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1,
    });
    const [lootDrops, setLootDrops] = useState([]);
    const [achievements, setAchievements] = useState([]);
    const [unlockedAchievements, setUnlockedAchievements] = useState(new Set(['first_step']));
    const [notifications, setNotifications] = useState([]);
    const notifId = useRef(0);
    const lootId = useRef(0);

    // Add notification popup
    const addNotification = useCallback((text, type = 'info') => {
        const id = notifId.current++;
        setNotifications(prev => [...prev, { id, text, type, timestamp: Date.now() }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    }, []);

    // Check and unlock achievements
    const checkAchievements = useCallback((currentStats) => {
        ACHIEVEMENTS.forEach(ach => {
            if (unlockedAchievements.has(ach.id)) return;
            if (ach.auto) return; // Already unlocked on init

            const statValue = ach.stat === 'kills' ? currentStats.kills :
                ach.stat === 'spells' ? currentStats.spells :
                    ach.stat === 'chests' ? currentStats.chests :
                        ach.stat === 'level' ? currentStats.level :
                            ach.stat === 'deaths' ? currentStats.deaths :
                                ach.stat === 'blocks_broken' ? currentStats.blocks_broken :
                                    ach.stat === 'blocks_placed' ? currentStats.blocks_placed : 0;

            if (statValue >= ach.target) {
                setUnlockedAchievements(prev => new Set([...prev, ach.id]));
                addNotification(`🏆 Achievement Unlocked: ${ach.title}!`, 'achievement');
            }
        });
    }, [unlockedAchievements, addNotification]);

    // Update quest progress
    const updateQuestProgress = useCallback((type, amount = 1, extra = {}) => {
        setQuests(prev => prev.map(quest => {
            if (quest.completed || quest.claimed) return quest;

            let matches = false;
            if (quest.type === type) matches = true;
            if (quest.type === 'kill_type' && type === 'kill_type' && quest.mobType === extra.mobType) matches = true;
            if (quest.type === 'kill' && (type === 'kill' || type === 'kill_type')) matches = true;

            if (!matches) return quest;

            const newProgress = Math.min(quest.progress + amount, quest.target);
            const nowComplete = newProgress >= quest.target;

            if (nowComplete && !quest.completed) {
                addNotification(`✅ Quest Complete: ${quest.title}! Click Q to claim reward.`, 'quest');
            }

            return { ...quest, progress: newProgress, completed: nowComplete };
        }));
    }, [addNotification]);

    // Claim quest reward and add new quest
    const claimQuest = useCallback((questId) => {
        let reward = 0;
        setQuests(prev => {
            const updated = prev.map(q => {
                if (q.id === questId && q.completed && !q.claimed) {
                    reward = q.xpReward;
                    return { ...q, claimed: true };
                }
                return q;
            });

            // Remove claimed, add next available quest
            const active = updated.filter(q => !q.claimed);
            const claimedIds = new Set([...completedQuestIds, questId]);
            setCompletedQuestIds(claimedIds);

            // Find next uncompleted quest
            const nextQuest = QUEST_LIST.find(q => !claimedIds.has(q.id) && !active.some(a => a.id === q.id));
            if (nextQuest && active.length < 3) {
                active.push({ ...nextQuest, progress: 0, completed: false, claimed: false });
            }

            return active;
        });

        // Grant XP reward
        if (reward > 0 && window.addExperience) {
            window.addExperience(reward, 'Quest Reward');
            addNotification(`🎁 +${reward} XP from quest reward!`, 'reward');
        }
    }, [completedQuestIds, addNotification]);

    // Record mob kill and generate loot
    const onMobKill = useCallback((mobType, position) => {
        // Update stats
        setStats(prev => {
            const newStats = {
                ...prev,
                kills: prev.kills + 1,
                kills_by_type: { ...prev.kills_by_type, [mobType]: (prev.kills_by_type[mobType] || 0) + 1 },
            };
            checkAchievements(newStats);
            return newStats;
        });

        // Update quest progress
        updateQuestProgress('kill');
        updateQuestProgress('kill_type', 1, { mobType });

        // Generate loot drops
        const lootTable = LOOT_TABLES[mobType] || [];
        const drops = [];
        lootTable.forEach(loot => {
            if (Math.random() < loot.chance) {
                drops.push({
                    id: lootId.current++,
                    ...loot,
                    position: [...position],
                    timestamp: Date.now(),
                });
            }
        });

        if (drops.length > 0) {
            setLootDrops(prev => [...prev, ...drops]);
            const dropNames = drops.map(d => d.item).join(', ');
            addNotification(`💎 Loot: ${dropNames}`, 'loot');

            // Auto-collect after delay + grant XP + add to inventory
            setTimeout(() => {
                drops.forEach(drop => {
                    if (window.addExperience) {
                        window.addExperience(drop.xp, drop.item);
                    }
                    if (window.addToInventory) {
                        window.addToInventory(drop.item, 1);
                    }
                });
                setLootDrops(prev => prev.filter(d => !drops.some(dd => dd.id === d.id)));
            }, 2000);
        }
    }, [updateQuestProgress, checkAchievements, addNotification]);

    // Record spell cast
    const onSpellCast = useCallback(() => {
        setStats(prev => {
            const newStats = { ...prev, spells: prev.spells + 1 };
            checkAchievements(newStats);
            return newStats;
        });
        updateQuestProgress('spell_cast');
    }, [updateQuestProgress, checkAchievements]);

    // Record block place
    const onBlockPlace = useCallback(() => {
        setStats(prev => {
            const newStats = { ...prev, blocks_placed: prev.blocks_placed + 1 };
            checkAchievements(newStats);
            return newStats;
        });
        updateQuestProgress('block_place');
    }, [updateQuestProgress, checkAchievements]);

    // Record block break
    const onBlockBreak = useCallback(() => {
        setStats(prev => {
            const newStats = { ...prev, blocks_broken: prev.blocks_broken + 1 };
            checkAchievements(newStats);
            return newStats;
        });
        updateQuestProgress('block_break');
    }, [updateQuestProgress, checkAchievements]);

    // Record chest open
    const onChestOpen = useCallback(() => {
        setStats(prev => {
            const newStats = { ...prev, chests: prev.chests + 1 };
            checkAchievements(newStats);
            return newStats;
        });
        updateQuestProgress('chest_open');
    }, [updateQuestProgress, checkAchievements]);

    // Record death
    const onDeath = useCallback(() => {
        setStats(prev => {
            const newStats = { ...prev, deaths: prev.deaths + 1 };
            checkAchievements(newStats);
            return newStats;
        });
    }, [checkAchievements]);

    // Track player level
    const updateLevel = useCallback((level) => {
        setStats(prev => {
            const newStats = { ...prev, level };
            checkAchievements(newStats);
            return newStats;
        });
    }, [checkAchievements]);

    // Expose globally for other systems to call
    useEffect(() => {
        window.onMobKill = onMobKill;
        window.onSpellCast = onSpellCast;
        window.onBlockPlace = onBlockPlace;
        window.onBlockBreak = onBlockBreak;
        window.onChestOpen = onChestOpen;
        window.onPlayerDeath = onDeath;
    }, [onMobKill, onSpellCast, onBlockPlace, onBlockBreak, onChestOpen, onDeath]);

    return {
        quests, stats, lootDrops, achievements: ACHIEVEMENTS,
        unlockedAchievements, notifications, claimQuest, updateLevel,
    };
};



export const QuestTracker = React.memo(({ quests, onClaim }) => {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="absolute top-4 left-4 z-20 pointer-events-auto" style={{ maxWidth: 280 }}>
            <motion.div
                className="rounded-xl overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, rgba(15, 15, 30, 0.9), rgba(30, 20, 50, 0.85))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 215, 0, 0.2)',
                    boxShadow: '0 0 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
            >
                <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer"
                    onClick={() => setExpanded(!expanded)}
                    style={{ borderBottom: expanded ? '1px solid rgba(255,215,0,0.15)' : 'none' }}
                >
                    <span className="text-yellow-400 font-bold text-sm">📜 Quests</span>
                    <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
                </div>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-3 py-2 space-y-2"
                        >
                            {quests.map(quest => (
                                <div key={quest.id} className="relative">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 mr-2">
                                            <div className="text-white text-xs font-semibold">{quest.title}</div>
                                            <div className="text-gray-400 text-xs">{quest.description}</div>
                                        </div>
                                        {quest.completed && !quest.claimed && (
                                            <span
                                                className="px-2 py-0.5 rounded text-xs font-bold animate-pulse"
                                                style={{
                                                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                                    color: '#000',
                                                    boxShadow: '0 0 10px rgba(255,215,0,0.4)',
                                                }}
                                            >
                                                Press Q
                                            </span>
                                        )}
                                    </div>

                                    {/* Progress bar */}
                                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                                background: quest.completed
                                                    ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                                                    : 'linear-gradient(90deg, #FFD700, #FFA500)',
                                                boxShadow: quest.completed ? '0 0 6px #4ade80' : '0 0 6px rgba(255,215,0,0.3)',
                                            }}
                                            animate={{ width: `${(quest.progress / quest.target) * 100}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                    <div className="text-gray-500 text-xs mt-0.5 text-right">
                                        {quest.progress}/{quest.target} {quest.completed && '✅'}
                                    </div>
                                </div>
                            ))}

                            {quests.length === 0 && (
                                <div className="text-gray-500 text-xs text-center py-2">All quests completed! 🎉</div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
});



export const NotificationStack = React.memo(({ notifications }) => {
    const colorMap = {
        quest: { bg: 'rgba(34, 197, 94, 0.9)', border: '#4ade80' },
        achievement: { bg: 'rgba(234, 179, 8, 0.9)', border: '#FFD700' },
        loot: { bg: 'rgba(139, 92, 246, 0.9)', border: '#a78bfa' },
        reward: { bg: 'rgba(59, 130, 246, 0.9)', border: '#60a5fa' },
        info: { bg: 'rgba(107, 114, 128, 0.9)', border: '#9ca3af' },
    };

    return (
        <div className="absolute top-20 right-4 z-30 pointer-events-none space-y-2" style={{ maxWidth: 320 }}>
            <AnimatePresence>
                {notifications.map(notif => {
                    const colors = colorMap[notif.type] || colorMap.info;
                    return (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 100, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.8 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-lg"
                            style={{
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                backdropFilter: 'blur(8px)',
                                boxShadow: `0 0 15px ${colors.border}40`,
                            }}
                        >
                            {notif.text}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
});






export const AchievementsPanel = React.memo(({ achievements, unlockedAchievements, stats, onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
        >
            <motion.div
                initial={{ scale: 0.8, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 30 }}
                className="game-panel p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
                style={{
                    background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.95), rgba(30, 20, 60, 0.95))',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '16px',
                    boxShadow: '0 0 40px rgba(255, 215, 0, 0.1)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-yellow-400 text-xl font-bold">🏆 Achievements</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
                </div>

                <div className="text-gray-400 text-xs mb-4">
                    {unlockedAchievements.size} / {achievements.length} unlocked
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {achievements.map(ach => {
                        const unlocked = unlockedAchievements.has(ach.id);
                        return (
                            <div
                                key={ach.id}
                                className="rounded-xl p-3 relative overflow-hidden"
                                style={{
                                    background: unlocked
                                        ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.1))'
                                        : 'rgba(255,255,255,0.03)',
                                    border: unlocked
                                        ? '1px solid rgba(255,215,0,0.4)'
                                        : '1px solid rgba(255,255,255,0.08)',
                                    opacity: unlocked ? 1 : 0.5,
                                }}
                            >
                                <div className="text-2xl mb-1">{unlocked ? ach.icon : '🔒'}</div>
                                <div className={`text-xs font-bold ${unlocked ? 'text-yellow-400' : 'text-gray-500'}`}>
                                    {ach.title}
                                </div>
                                <div className="text-gray-400 text-xs mt-0.5">{ach.description}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Stats summary */}
                <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <h3 className="text-white text-sm font-bold mb-2">📊 Stats</h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-red-400 font-bold text-lg">{stats.kills}</div>
                            <div className="text-gray-400">Kills</div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-purple-400 font-bold text-lg">{stats.spells}</div>
                            <div className="text-gray-400">Spells</div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-yellow-400 font-bold text-lg">{stats.chests}</div>
                            <div className="text-gray-400">Chests</div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-green-400 font-bold text-lg">{stats.blocks_placed}</div>
                            <div className="text-gray-400">Built</div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-blue-400 font-bold text-lg">{stats.blocks_broken}</div>
                            <div className="text-gray-400">Mined</div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="text-orange-400 font-bold text-lg">{stats.deaths}</div>
                            <div className="text-gray-400">Deaths</div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
});



export const useTreasureChests = (playerPosition) => {
    const [chests, setChests] = useState([]);
    const [openedChestIds, setOpenedChestIds] = useState(new Set());
    const lastChestCheck = useRef(0);
    const chestId = useRef(0);

    // Generate chest near player periodically
    useEffect(() => {
        const interval = setInterval(() => {
            if (!playerPosition) return;

            // Max 5 chests at a time
            if (chests.length - openedChestIds.size >= 5) return;

            // Random position 20-60 blocks from player
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 40;
            const x = playerPosition.x + Math.cos(angle) * dist;
            const z = playerPosition.z + Math.sin(angle) * dist;

            // Get ground height securely
            let y = 15;
            if (window.getMobGroundLevel) {
                const h = window.getMobGroundLevel(x, z);
                if (typeof h === 'number' && !isNaN(h)) y = h + 1;
            }

            const newChest = {
                id: chestId.current++,
                position: [x, y, z],
                opened: false,
            };

            setChests(prev => [...prev, newChest]);
        }, 30000); // New chest every 30 seconds

        return () => clearInterval(interval);
    }, [playerPosition, chests.length, openedChestIds.size]);

    // Spawn initial chest near player
    useEffect(() => {
        if (playerPosition && chests.length === 0) {
            const angle = Math.random() * Math.PI * 2;
            const x = playerPosition.x + Math.cos(angle) * 15;
            const z = playerPosition.z + Math.sin(angle) * 15;

            let y = 15;
            if (window.getMobGroundLevel) {
                const h = window.getMobGroundLevel(x, z);
                if (typeof h === 'number' && !isNaN(h)) y = h + 1;
            }

            setChests([{ id: chestId.current++, position: [x, y, z], opened: false }]);
        }
    }, [playerPosition]);

    // Check if player is near a chest (Strict 3D Proximity)
    const checkChestProximity = useCallback(() => {
        if (!playerPosition) return null;

        for (const chest of chests) {
            if (openedChestIds.has(chest.id)) continue;

            const dx = playerPosition.x - chest.position[0];
            const dy = playerPosition.y - chest.position[1];
            const dz = playerPosition.z - chest.position[2];
            const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist3D < 3) return chest;
        }
        return null;
    }, [playerPosition, chests, openedChestIds]);

    // Open a chest
    const openChest = useCallback((chestIdToOpen) => {
        setOpenedChestIds(prev => new Set([...prev, chestIdToOpen]));

        // Generate random loot
        const loot = [];
        CHEST_LOOT.forEach(item => {
            if (Math.random() < item.chance) {
                loot.push(item);
            }
        });

        // Always give at least 1 item
        if (loot.length === 0) {
            loot.push(CHEST_LOOT[0]); // Health potion fallback
        }

        // Push all looted items directly to the player's persistent inventory instead of instant consumption
        loot.forEach(item => {
            if (window.addToInventory) {
                window.addToInventory(item.item, 1);
            }
        });

        // Notify quest system
        if (window.onChestOpen) window.onChestOpen();

        // Remove chest after 5 seconds
        setTimeout(() => {
            setChests(prev => prev.filter(c => c.id !== chestIdToOpen));
        }, 5000);

        return loot;
    }, []);

    // Expose check and open for the game
    useEffect(() => {
        window.checkNearbyChest = checkChestProximity;
        window.openNearbyChest = () => {
            const chest = checkChestProximity();
            if (chest) return openChest(chest.id);
            return null;
        };
    }, [checkChestProximity, openChest]);

    return { chests, openedChestIds, checkChestProximity, openChest };
};



export const ChestIndicator = React.memo(({ playerPosition, chests, openedChestIds }) => {
    const [nearbyChest, setNearbyChest] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!playerPosition) return;

            for (const chest of chests) {
                if (openedChestIds.has(chest.id)) continue;
                const dx = playerPosition.x - chest.position[0];
                const dz = playerPosition.z - chest.position[2];
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 3) {
                    setNearbyChest(chest);
                    return;
                }
            }
            setNearbyChest(null);
        }, 250);

        return () => clearInterval(interval);
    }, [playerPosition, chests, openedChestIds]);

    if (!nearbyChest) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
            style={{ marginTop: 60 }}
        >
            <div
                className="px-4 py-2 rounded-lg text-center"
                style={{
                    background: 'linear-gradient(135deg, rgba(255,215,0,0.9), rgba(255,165,0,0.9))',
                    boxShadow: '0 0 20px rgba(255,215,0,0.5)',
                    border: '2px solid #FFD700',
                }}
            >
                <div className="text-black font-bold text-sm">📦 Treasure Chest!</div>
                <div className="text-yellow-900 text-xs">Press G to open</div>
            </div>
        </motion.div>
    );
});

export default useQuestSystem;
