import { useGameStore } from './store/useGameStore';
import { subscribeMobKill } from './game/mobKillBus.js';
import { GameMethods } from './GameMethods';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isCaptureMode } from './devtest/captureMode';
import { isTouchUIMode } from './input/touchDevice';
import { Panel, Button, Slot, Icon, Toast, Modal } from './ui/primitives/index.js';
import { useT } from './i18n/i18n.js';
import { LOOT_TABLES, CHEST_LOOT } from './data/lootTables.js';
import { zoneTier } from './world/zoneTier.js';
import { nearestLandmark } from './world/shrines.js';
import { loreFor, themedDescription } from './game/questLore.js';
import { getItemRarity } from './data/items.js';
import { tierLootChance } from './game/lootTier.js';

// Quest & Progression System: Quests, Loot Drops, Treasure Chests, Achievements
// Loot DATA (LOOT_TABLES + CHEST_LOOT) lives in src/data/lootTables.js (pure module).
// Re-exported here so existing importers of these names from QuestSystem keep working.
export { LOOT_TABLES, CHEST_LOOT };

export const QUEST_LIST = [
    // Beginner quests
    { id: 'first_blood', title: 'First Blood', icon: 'sword', description: 'Defeat your first mob', type: 'kill', target: 1, xpReward: 30, tier: 1 },
    { id: 'hunter', title: 'Hunter', icon: 'bow', description: 'Defeat 5 mobs', type: 'kill', target: 5, xpReward: 75, tier: 1 },
    { id: 'builder', title: 'Builder', icon: 'hammer', description: 'Place 20 blocks', type: 'block_place', target: 20, xpReward: 50, tier: 1 },
    { id: 'miner', title: 'Miner', icon: 'pickaxe', description: 'Break 30 blocks', type: 'block_break', target: 30, xpReward: 60, tier: 1 },
    { id: 'spellcaster', title: 'Spellcaster', icon: 'magic', description: 'Cast 10 spells', type: 'spell_cast', target: 10, xpReward: 40, tier: 1 },

    // Intermediate quests
    { id: 'zombie_slayer', title: 'Zombie Slayer', icon: 'zombie', description: 'Defeat 10 zombies', type: 'kill_type', mobType: 'zombie', target: 10, xpReward: 120, tier: 2 },
    { id: 'spider_hunter', title: 'Spider Hunter', icon: 'spider', description: 'Defeat 8 spiders', type: 'kill_type', mobType: 'spider', target: 8, xpReward: 100, tier: 2 },
    { id: 'pilgrim', title: 'Pilgrimage', icon: 'compass', description: 'Reach a frontier shrine', type: 'reach_shrine', target: 1, xpReward: 100, tier: 2 },
    { id: 'collector', title: 'Collector', icon: 'coins', description: 'Open 5 treasure chests', type: 'chest_open', target: 5, xpReward: 80, tier: 2 },
    { id: 'architect', title: 'Architect', icon: 'building', description: 'Place 100 blocks', type: 'block_place', target: 100, xpReward: 150, tier: 2 },
    // Survival-progression: surviving the night siege is now a tracked GOAL (ties the onboarding promise +
    // the siege/dawn audio to the quest loop). Driven by the dawn transition (onNightSurvived), tier >= 2 so
    // the initial active set (tier-1 first-3) is unchanged -> capture frames stable.
    { id: 'nightwatch', title: 'Nightwatch', icon: 'star', description: 'Survive 3 nights', type: 'survive_nights', target: 3, xpReward: 120, tier: 2 },
    // A targeted hunt for the charred siege husk (the night-siege themed hostile).
    { id: 'ember_hunter', title: 'Ember Hunter', icon: 'skull', description: 'Defeat 10 emberhusks', type: 'kill_type', mobType: 'emberhusk', target: 10, xpReward: 130, tier: 2 },

    // Advanced quests
    { id: 'champion', title: 'Champion', icon: 'trophy', description: 'Defeat 50 mobs', type: 'kill', target: 50, xpReward: 300, tier: 3 },
    { id: 'archmage', title: 'Archmage', icon: 'magic', description: 'Cast 100 spells', type: 'spell_cast', target: 100, xpReward: 250, tier: 3 },
    { id: 'treasure_master', title: 'Treasure Master', icon: 'crown', description: 'Open 20 treasure chests', type: 'chest_open', target: 20, xpReward: 200, tier: 3 },
    { id: 'world_builder', title: 'World Builder', icon: 'globe', description: 'Place 500 blocks', type: 'block_place', target: 500, xpReward: 400, tier: 3 },
    { id: 'undead_destroyer', title: 'Undead Destroyer', icon: 'skull', description: 'Defeat 25 skeletons', type: 'kill_type', mobType: 'skeleton', target: 25, xpReward: 200, tier: 3 },
    // The endurance capstone of the survival dimension.
    { id: 'siege_veteran', title: 'Siege Veteran', icon: 'shield', description: 'Survive 7 nights', type: 'survive_nights', target: 7, xpReward: 350, tier: 3 },
    // An elite-hunt goal for the rare 220-HP moss brute (the heavy-tank kill the loot pass rewards richly).
    { id: 'brute_breaker', title: 'Brute Breaker', icon: 'trophy', description: 'Defeat 5 moss brutes', type: 'kill_type', mobType: 'moss_brute', target: 5, xpReward: 220, tier: 3 },
];

// Endless end-game BOUNTY: once the authored QUEST_LIST is exhausted, claimQuest falls back to these so the
// goal feed never dries up. Target + reward scale gently with how many bounties you've already done. Pure +
// a unique `bounty_<seq>` id so it never collides with a claimed/active quest. type 'kill' = any mob counts.
export function makeRepeatableQuest(seq) {
    const n = Math.max(0, Math.floor(Number(seq) || 0));
    return {
        id: `bounty_${n}`,
        title: `Bounty ${n + 1}`,
        icon: 'trophy',
        description: `Defeat ${15 + n * 5} mobs`,
        type: 'kill',
        target: 15 + n * 5,
        xpReward: 150 + n * 50,
        tier: 3,
        repeatable: true,
    };
}

const ACHIEVEMENTS = [
    { id: 'first_step', title: 'First Steps', description: 'Enter the world', icon: 'footprints', auto: true },
    { id: 'first_kill', title: 'Warrior', description: 'Defeat your first mob', icon: 'sword', stat: 'kills', target: 1 },
    { id: 'serial_killer', title: 'Serial Slayer', description: 'Defeat 25 mobs', icon: 'skull', stat: 'kills', target: 25 },
    { id: 'centurion', title: 'Centurion', description: 'Defeat 100 mobs', icon: 'landmark', stat: 'kills', target: 100 },
    { id: 'first_spell', title: 'Apprentice', description: 'Cast your first spell', icon: 'magic', stat: 'spells', target: 1 },
    { id: 'wizard', title: 'Wizard', description: 'Cast 50 spells', icon: 'wizard', stat: 'spells', target: 50 },
    { id: 'first_chest', title: 'Treasure Hunter', description: 'Open your first chest', icon: 'chest-closed', stat: 'chests', target: 1 },
    { id: 'level5', title: 'Rising Star', description: 'Reach Level 5', icon: 'star', stat: 'level', target: 5 },
    { id: 'level10', title: 'Shining Star', description: 'Reach Level 10', icon: 'star', stat: 'level', target: 10 },
    { id: 'survivor', title: 'Survivor', description: 'Die and respawn 3 times', icon: 'strength', stat: 'deaths', target: 3 },
    { id: 'miner_ach', title: 'Deep Digger', description: 'Break 100 blocks', icon: 'pickaxe', stat: 'blocks_broken', target: 100 },
    { id: 'builder_ach', title: 'Master Builder', description: 'Place 200 blocks', icon: 'home', stat: 'blocks_placed', target: 200 },
];

export const useQuestSystem = () => {
    // S2a: seed the persistable working state from the store's questState mirror
    // (set by loadWorldData) when present, else the fresh-game defaults.
    const [quests, setQuests] = useState(() => {
        const saved = useGameStore.getState().questState;
        if (saved && saved.quests) return saved.quests;
        // Initialize active quests (first 3 from tier 1)
        // M-NARRATIVE.2: enrich with the frontier lore/giver + a themed description (story flavor over the
        // generic chore). type/target/xpReward stay untouched (the {...q} spread), so every driver + the
        // claim flow are unchanged; loreFor returns {} for non-chain quests (spreads nothing).
        return QUEST_LIST.filter(q => q.tier === 1).slice(0, 3).map(q => ({
            ...q,
            description: themedDescription(q),
            ...(loreFor(q.id) || {}),
            progress: 0,
            completed: false,
            claimed: false,
        }));
    });

    const [completedQuestIds, setCompletedQuestIds] = useState(() => new Set(useGameStore.getState().questState?.completedQuestIds || []));
    const [stats, setStats] = useState(() => useGameStore.getState().questState?.stats || {
        kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0,
        blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1,
    });
    const [lootDrops, setLootDrops] = useState([]);
    const [achievements, setAchievements] = useState([]);
    const [unlockedAchievements, setUnlockedAchievements] = useState(() => new Set(useGameStore.getState().questState?.unlockedAchievements || ['first_step']));
    const [notifications, setNotifications] = useState([]);
    const notifId = useRef(0);
    const lootId = useRef(0);

    // S2a — MIRROR (hook -> store, one-way): keep a JSON-safe snapshot of the
    // persistable state in the store so buildSaveData can serialize it. Sets are
    // flattened to arrays here. This effect ONLY writes questState; it does not
    // read questLoadedAt, so it cannot fight the re-seed below (no feedback loop).
    useEffect(() => {
        useGameStore.getState().setQuestState({
            quests,
            completedQuestIds: [...completedQuestIds],
            stats,
            unlockedAchievements: [...unlockedAchievements],
        });
    }, [quests, completedQuestIds, stats, unlockedAchievements]);

    // S2a — RE-SEED ON LOAD (store -> hook): when loadWorldData bumps the resync
    // tick, re-seed the local working state from the loaded snapshot. Gated by a
    // mount guard so the initial render (already seeded via the useState initializers)
    // doesn't clobber state. This effect watches ONLY questLoadedAt; the mirror
    // watches the state values -> the two never feed each other.
    const questLoadedAt = useGameStore((s) => s.questLoadedAt);
    const didMountQuest = useRef(false);
    useEffect(() => {
        if (!didMountQuest.current) { didMountQuest.current = true; return; }
        const qs = useGameStore.getState().questState;
        if (!qs) return;
        if (qs.quests) setQuests(qs.quests);
        setCompletedQuestIds(new Set(qs.completedQuestIds || []));
        if (qs.stats) setStats(qs.stats);
        setUnlockedAchievements(new Set(qs.unlockedAchievements || ['first_step']));
    }, [questLoadedAt]);

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
                addNotification(`Achievement Unlocked: ${ach.title}!`, 'achievement');
                if (window.playFanfare) window.playFanfare(); // reward beat: the unlock is now HEARD, not just seen
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
                addNotification(`Quest Complete: ${quest.title}! Click Q to claim reward.`, 'quest');
                if (window.playFanfare) window.playFanfare(); // reward beat: the completion is now HEARD, not just seen
            }

            return { ...quest, progress: newProgress, completed: nowComplete };
        }));
    }, [addNotification]);

    // S8c: the Pilgrimage quest — fire reach_shrine progress when the player reaches a NEW shrine (within
    // ~10 blocks of the nearest landmark). Claimed-once via reachedShrines (keyed by chunk) so re-visits
    // don't re-fire. Capture-suppressed; ~3s poll with transient store reads -> Game-Loop-Isolation. Gives
    // the outward journey a concrete GOAL (replaces the dead Travel-500 explorer quest, which had no driver).
    const reachedShrines = useRef(new Set());
    useEffect(() => {
        if (isCaptureMode()) return;
        const interval = setInterval(() => {
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            const s = nearestLandmark(playerPos.x, playerPos.z);
            if (!s) return;
            const key = `${s.cx}_${s.cz}`;
            if (reachedShrines.current.has(key)) return;
            if (Math.hypot(playerPos.x - s.worldX, playerPos.z - s.worldZ) > 10) return;
            reachedShrines.current.add(key);
            // Mirror a transient flag so the HUD ObjectiveTracker can switch the spawn-direction cue from
            // "reach the frontier shrine" to "shatter the Blight Heart" once any shrine is reached.
            useGameStore.setState({ shrineReached: true });
            updateQuestProgress('reach_shrine');
        }, 3000);
        return () => clearInterval(interval);
    }, [updateQuestProgress]);

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

            // Find next uncompleted authored quest; once the authored list is exhausted, fall back to an
            // endless scaling BOUNTY so the goal feed never dries up. The bounty seq = how many bounties
            // already exist (claimed + active) -> a unique `bounty_<seq>` id that can't collide.
            const bountyCount = [...claimedIds].filter(id => String(id).startsWith('bounty_')).length
                + active.filter(a => String(a.id).startsWith('bounty_')).length;
            const nextQuest = QUEST_LIST.find(q => !claimedIds.has(q.id) && !active.some(a => a.id === q.id))
                || makeRepeatableQuest(bountyCount);
            if (nextQuest && active.length < 3) {
                active.push({ ...nextQuest, description: themedDescription(nextQuest), ...(loreFor(nextQuest.id) || {}), progress: 0, completed: false, claimed: false });
            }

            return active;
        });

        // Grant XP reward
        if (reward > 0 && GameMethods.grantXP) {
            GameMethods.grantXP(reward, 'Quest Reward');
            addNotification(`+${reward} XP from quest reward!`, 'reward');
        }
    }, [completedQuestIds, addNotification]);

    // Record mob kill and generate loot
    const onMobKill = useCallback((mobType, position, source) => {
        // S2-B3-M1: quest/achievement kill credit = YOUR kills only (ally kills bank nothing)
        if (source !== 'player') return;
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
        // S7 reward: far from spawn = rarer drops. The kill-position zone tier boosts non-common rows
        // (common staples unchanged); tier 0 near spawn is identical to the legacy roll (no regression).
        const killTier = zoneTier(position?.x ?? 0, position?.z ?? 0);
        lootTable.forEach(loot => {
            const chance = tierLootChance(loot.chance, getItemRarity(loot.item), killTier);
            if (Math.random() < chance) {
                drops.push(loot);
                if (GameMethods.spawnLootDrop) {
                    GameMethods.spawnLootDrop(loot.item, loot.xp || 5, position);
                }
            }
        });

        if (drops.length > 0) {
            const dropNames = drops.map(d => d.item).join(', ');
            addNotification(`Mob dropped: ${dropNames}`, 'loot');
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

    // Record a survived night (fired once per dawn from useSurvivalMode, gated on the dawn reward
    // actually granting -> exactly once per genuinely-survived night). Drives the survive_nights quests.
    const onNightSurvived = useCallback(() => {
        updateQuestProgress('survive_nights');
    }, [updateQuestProgress]);

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
        useGameStore.setState({ onSpellCast: onSpellCast });
        useGameStore.setState({ onBlockPlace: onBlockPlace });
        useGameStore.setState({ onBlockBreak: onBlockBreak });
        useGameStore.setState({ onChestOpen: onChestOpen });
        useGameStore.setState({ onPlayerDeath: onDeath });
        useGameStore.setState({ onNightSurvived: onNightSurvived });
        useGameStore.setState({ addNotification: addNotification });
    }, [onSpellCast, onBlockPlace, onBlockBreak, onChestOpen, onDeath, onNightSurvived, addNotification]);

    // S2-B1-M3.5: mob kills now flow through the fan-out bus (was a single store.onMobKill slot a 2nd
    // consumer like ferocity would have clobbered). Quests subscribe; the kill-path emits. Unsub on unmount.
    useEffect(() => subscribeMobKill(onMobKill), [onMobKill]);

    return {
        quests, stats, lootDrops, achievements: ACHIEVEMENTS,
        unlockedAchievements, notifications, claimQuest, updateLevel,
    };
};

export const QuestTracker = React.memo(({ quests, onClaim }) => {
    // Collapse-by-default on touch: on a phone the expanded log ate ~60% of the width and its
    // pointer-events body covered the top-left of the move-joystick zone. Desktop stays expanded.
    // Evaluate the default at RENDER time (not just at mount) so it's correct even when the capture
    // harness flips showTouch after mount; a user tap then overrides it. null = use the per-mode default.
    const touch = isTouchUIMode();
    const [userToggled, setUserToggled] = useState(null);
    const expanded = userToggled === null ? !touch : userToggled;

    return (
        <div className="absolute top-4 left-4 z-20 pointer-events-auto" style={{ maxWidth: touch ? 220 : 280 }}>
            <Panel variant="raise" className="overflow-hidden p-0">
                <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 bg-panel-raise"
                    onClick={() => setUserToggled(!expanded)}
                >
                    <span className="flex items-center gap-1.5 font-display uppercase tracking-wide text-accent text-sm">
                        <Icon name="scroll" size={16} className="text-accent" /> Quests
                    </span>
                    <Icon name="chevron" size={14} className={`text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-3 py-2 space-y-2 border-t-chrome border-ink overflow-hidden"
                        >
                            {quests.map(quest => (
                                <div key={quest.id} className="relative">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 mr-2">
                                            <div className="flex items-center gap-1.5 text-text text-xs font-bold">
                                                {quest.icon && <Icon name={quest.icon} size={14} className="flex-none text-accent" />}
                                                <span>{quest.title}</span>
                                            </div>
                                            <div className="text-text-muted text-xs">{quest.description}</div>
                                        </div>
                                        {quest.completed && !quest.claimed && (
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => onClaim(quest.id)}
                                                className="px-2 py-0.5 text-xs"
                                            >
                                                {touch ? 'Claim' : 'Press Q'}
                                            </Button>
                                        )}
                                    </div>

                                    {/* Progress bar — bold-flat inset track + flat fill */}
                                    <div className="mt-1 h-2 bg-track rounded-sm border-chrome border-ink overflow-hidden">
                                        <motion.div
                                            className={`h-full ${quest.completed ? 'bg-success' : 'bg-accent'}`}
                                            animate={{ width: `${(quest.progress / quest.target) * 100}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                    <div className="text-text-muted text-xs mt-0.5 text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1 justify-end">
                                            {quest.progress}/{quest.target}
                                            {quest.completed && <Icon name="check" size={12} className="text-success" />}
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {quests.length === 0 && (
                                <div className="flex items-center justify-center gap-1.5 text-text-muted text-xs text-center py-2">
                                    All quests completed! <Icon name="party" size={14} className="text-accent" />
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </Panel>
        </div>
    );
});

// Data-level notification type -> Toast status (left-bar color).
const NOTIF_STATUS = {
    quest: 'success',
    achievement: 'success',
    reward: 'success',
    loot: 'info',
    info: 'info',
    success: 'success',
    warn: 'warn',
    warning: 'warn',
    danger: 'danger',
};
// Data-level notification type -> a lucide chrome Icon name. This centralizes the
// status glyph so the message strings no longer need a leading emoji.
const NOTIF_ICON = {
    achievement: 'trophy',
    quest: 'check',
    reward: 'gift',
    loot: 'gift',
    warning: 'warning',
    warn: 'warning',
    danger: 'skull',
    success: 'check',
    info: 'sparkles',
};

export const NotificationStack = React.memo(({ notifications }) => {
    return (
        <div className="absolute top-20 right-4 z-30 pointer-events-none space-y-2" style={{ maxWidth: 320 }}>
            <AnimatePresence>
                {notifications.map(notif => {
                    const status = NOTIF_STATUS[notif.type] || 'info';
                    const iconName = NOTIF_ICON[notif.type] || 'sparkles';
                    return (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 100, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.8 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            <Toast status={status} className="w-full text-sm font-bold">
                                <Icon name={iconName} size={16} className="flex-none" />
                                <span>{notif.text}</span>
                            </Toast>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
});

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
            <motion.div
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
                        <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
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
                                        className={`p-3 ${unlocked ? 'bg-slot' : 'bg-panel-inset opacity-50'}`}
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
                                    <Panel key={cell.label} variant="inset" className="bg-slot text-center p-2">
                                        <div className={`${cell.color} font-bold text-lg tabular-nums`}>{cell.value}</div>
                                        <div className="text-text-muted">{cell.label}</div>
                                    </Panel>
                                ))}
                            </div>
                        </div>
                    </div>
                </Panel>
            </motion.div>
        </Modal>
    );
});

export const useTreasureChests = () => {
    const addNotification = useGameStore(state => state.addNotification);
    const [chests, setChests] = useState([]);
    const [openedChestIds, setOpenedChestIds] = useState(new Set());
    const lastChestCheck = useRef(0);
    const chestId = useRef(0);

    // Generate chest near player periodically
    useEffect(() => {
        // Dev capture mode: suppress quest-chest spawning entirely. Chests spawn at a
        // RANDOM angle/distance RELATIVE to the live player entity, and the player
        // drifts during the capture settle window, so even a seeded position yields a
        // run-varying Compass distance label + 3D chest screen-position. Zero chests =
        // deterministic frame. No-op in normal gameplay.
        if (isCaptureMode()) return;
        const interval = setInterval(() => {
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;

            // Max 5 chests at a time
            if (chests.length - openedChestIds.size >= 5) return;

            // Random position 20-60 blocks from player.
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 40;
            const x = playerPos.x + Math.cos(angle) * dist;
            const z = playerPos.z + Math.sin(angle) * dist;

            // Get ground height securely
            let y = 15;
            let resolved = false;
            if (useGameStore.getState().getMobGroundLevel) {
                const h = useGameStore.getState().getMobGroundLevel(x, z);
                if (typeof h === 'number' && !isNaN(h)) {
                    y = h + 1;
                    resolved = true;
                }
            }

            const newChest = {
                id: chestId.current++,
                position: [x, y, z],
                opened: false,
                resolved,
            };

            setChests(prev => [...prev, newChest]);
        }, 30000); // New chest every 30 seconds

        return () => clearInterval(interval);
    }, [chests.length, openedChestIds.size]);

    // Spawn initial chest near player
    useEffect(() => {
        // Dev capture mode: suppress the initial chest too (see periodic spawner above) —
        // its screen position / Compass distance is non-deterministic against the drifting
        // player. No-op in normal gameplay.
        if (isCaptureMode()) return;
        const playerPos = useGameStore.getState().playerPosition;
        if (playerPos && chests.length === 0) {
            const angle = Math.random() * Math.PI * 2;
            const x = playerPos.x + Math.cos(angle) * 15;
            const z = playerPos.z + Math.sin(angle) * 15;

            let y = 15;
            let resolved = false;
            if (useGameStore.getState().getMobGroundLevel) {
                const h = useGameStore.getState().getMobGroundLevel(x, z);
                if (typeof h === 'number' && !isNaN(h)) {
                    y = h + 1;
                    resolved = true;
                }
            }

            setChests([{ id: chestId.current++, position: [x, y, z], opened: false, resolved }]);
        }
    }, [chests.length]);

    // S8c-bis: a guaranteed reward chest at each frontier shrine -- the deferred S8 destination payoff.
    // Lives HERE (the hook that owns setChests) so no cross-hook bridge is needed. Deterministic +
    // once-per-shrine (keyed by chunk in a ref Set) + capture-guarded (shrines can sit near origin, so the
    // guard keeps chests out of the deterministic baselines). Mirrors the reach_shrine `reachedShrines`
    // poll. Game-Loop-Isolation: setInterval + transient getState reads, not a useFrame subscription.
    const shrineChestsSpawned = useRef(new Set());
    useEffect(() => {
        if (isCaptureMode()) return;
        const interval = setInterval(() => {
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            const s = nearestLandmark(playerPos.x, playerPos.z);
            if (!s) return;
            if (Math.hypot(playerPos.x - s.worldX, playerPos.z - s.worldZ) > 12) return;
            const key = `${s.cx}_${s.cz}`;
            if (shrineChestsSpawned.current.has(key)) return;
            shrineChestsSpawned.current.add(key);

            let y = 15;
            let resolved = false;
            const getLevel = useGameStore.getState().getMobGroundLevel;
            if (getLevel) {
                const h = getLevel(s.worldX, s.worldZ);
                if (typeof h === 'number' && !isNaN(h)) { y = h + 1; resolved = true; }
            }
            // EXEMPT from the periodic spawner's 5-cap: a guaranteed, once-per-shrine reward.
            setChests(prev => [...prev, { id: chestId.current++, position: [s.worldX, y, s.worldZ], opened: false, resolved, shrine: true }]);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Check if player is near a chest (Strict 3D Proximity)
    const checkChestProximity = useCallback(() => {
        const playerPos = useGameStore.getState().playerPosition;
        if (!playerPos) return null;

        for (const chest of chests) {
            if (openedChestIds.has(chest.id)) continue;

            const dx = playerPos.x - chest.position[0];
            const dy = playerPos.y - chest.position[1];
            const dz = playerPos.z - chest.position[2];
            const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist3D < 4.5) {
                return chest;
            }
        }
        return null;
    }, [chests, openedChestIds]);

    // Open a chest
    const openChest = useCallback((chestIdToOpen) => {
        setOpenedChestIds(prev => new Set([...prev, chestIdToOpen]));

        const chest = chests.find(c => c.id === chestIdToOpen);
        const position = chest ? chest.position : [0, 15, 0];

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

        // S8c-bis: shrine chests pay MORE on the frontier -- (1 + zoneTier) extra guaranteed rolls biased
        // to the rarer half of CHEST_LOOT. zoneTier already caps at MAX_TIER, so far shrines reward more
        // (matching the S7 lootTier risk/reward philosophy). Non-shrine chests are unchanged.
        if (chest && chest.shrine) {
            const tier = zoneTier(chest.position[0], chest.position[2]);
            const pool = CHEST_LOOT.slice(Math.floor(CHEST_LOOT.length / 2));
            for (let i = 0; i < 1 + tier; i++) {
                loot.push(pool[Math.floor(Math.random() * pool.length)] || CHEST_LOOT[0]);
            }
        }

        // Spawn physical loot items in the 3D scene
        loot.forEach(item => {
            const xpValue = item.effect === 'xp' ? item.value : 10;
            if (GameMethods.spawnLootDrop) {
                GameMethods.spawnLootDrop(item.item, xpValue, position);
            }
        });

        const dropNames = loot.map(l => l.item).join(', ');
        if (addNotification) {
            addNotification(`Chest dropped: ${dropNames}`, 'loot');
        }

        // Notify quest system
        if (useGameStore.getState().onChestOpen) useGameStore.getState().onChestOpen();

        // Remove chest after 5 seconds
        setTimeout(() => {
            setChests(prev => prev.filter(c => c.id !== chestIdToOpen));
            setOpenedChestIds(prev => {
                const next = new Set(prev);
                next.delete(chestIdToOpen);
                return next;
            });
        }, 5000);

        return loot;
    }, [chests, addNotification]);

    // Periodically update un-opened chests Y coordinates if they were spawned with default Y <= 16
    useEffect(() => {
        const interval = setInterval(() => {
            const getLevel = useGameStore.getState().getMobGroundLevel;
            if (!getLevel) return;
            
            setChests(prev => prev.map(chest => {
                if (!chest.resolved) {
                    const h = getLevel(chest.position[0], chest.position[2]);
                    if (typeof h === 'number' && !isNaN(h) && h > 0) {
                        return {
                            ...chest,
                            position: [chest.position[0], h + 1, chest.position[2]],
                            resolved: true
                        };
                    }
                }
                return chest;
            }));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Expose check and open for the game, as well as the active treasure chests list
    useEffect(() => {
        useGameStore.setState({ checkNearbyChest: checkChestProximity });
        useGameStore.setState({ openNearbyChest: () => {
            const chest = checkChestProximity();
            if (chest) return openChest(chest.id);
            return null;
        }});
        // In capture mode the visual fixtures own treasureChestsList (e.g. the
        // character-closeup studio chest); don't let the quest system clobber it.
        if (!isCaptureMode()) {
            useGameStore.setState({ treasureChestsList: chests.filter(c => !openedChestIds.has(c.id)) });
        }
    }, [checkChestProximity, openChest, chests, openedChestIds]);

    return { chests, openedChestIds, checkChestProximity, openChest };
};

export const ChestIndicator = React.memo(({ chests, openedChestIds }) => {
    const [nearbyChest, setNearbyChest] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;

            for (const chest of chests) {
                if (openedChestIds.has(chest.id)) continue;
                const dx = playerPos.x - chest.position[0];
                const dy = playerPos.y - chest.position[1];
                const dz = playerPos.z - chest.position[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < 4.5) {
                    setNearbyChest(chest);
                    return;
                }
            }
            setNearbyChest(null);
        }, 250);

        return () => clearInterval(interval);
    }, [chests, openedChestIds]);

    if (!nearbyChest) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
            style={{ marginTop: 60 }}
        >
            <Panel variant="base" className="bg-accent text-text-inverse px-4 py-2 text-center flex items-center gap-2">
                <Icon name="chest" size={22} className="text-text-inverse flex-none" />
                <div className="text-left">
                    <div className="font-display uppercase tracking-wide text-sm leading-tight">Treasure Chest!</div>
                    <div className="text-xs font-bold opacity-80">Press G to open</div>
                </div>
            </Panel>
        </motion.div>
    );
});

