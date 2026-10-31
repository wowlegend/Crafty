import { useGameStore } from './store/useGameStore';
import { subscribeMobKill } from './game/mobKillBus.js';
import { EVENTS, emit } from './game/eventBus.js';
import { questMatches } from './game/questMatch.js';
import { killXP } from './game/killReward.js';
import { GameMethods } from './GameMethods';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { isCaptureMode } from './devtest/captureMode';
import { isWorldFrozenNow } from './game/worldClock.js';
import { isTouchUIMode } from './input/touchDevice';
import { Panel, Button, Icon, Toast, Modal } from './ui/primitives/index.js';
import { useT, tIn } from './i18n/i18n.js';
import { questTitle, questDescription } from './game/questText.js';
import { LOOT_TABLES, CHEST_LOOT } from './data/lootTables.js';
import { zoneTier } from './world/zoneTier.js';
import { nearestLandmark } from './world/shrines.js';
import { loreFor, themedDescription } from './game/questLore.js';
import { getItemRarity } from './data/items.js';
import { tierLootChance } from './game/lootTier.js';
import { questRewards } from './game/questRewards.js';
import { reduceClaim, MAX_ACTIVE_QUESTS } from './game/questClaim.js';
import { resolveChestHeights } from './game/captureRest.js';
import { toNotification, admits, notificationText, TOAST_MS } from './ui/notifications.js';
import { TOUCH_TOAST_TOP } from './ui/hudLayout.js';

// Quest & Progression System: Quests, Loot Drops, Treasure Chests, Achievements
// Loot DATA (LOOT_TABLES + CHEST_LOOT) lives in src/data/lootTables.js (pure module).
// Re-exported here so existing importers of these names from QuestSystem keep working.
export { LOOT_TABLES, CHEST_LOOT };

// A hunt kills one creature (game/questText.js). Its title and objective are written in English from the creature's
// display name, so the title a save keeps, which a build from before this one still shows, names the creature as the
// tracker does. That build rewrites the objective from its own list, so after a rollback the title reads "Husk Slayer"
// over "Defeat 10 zombies".
const enT = (key, vars) => tIn('en', key, vars);
function hunt(q) {
    return { ...q, type: 'kill_type', title: questTitle(enT, 'en', q), description: questDescription(enT, 'en', q) };
}

export const QUEST_LIST = [
    // Beginner quests
    { id: 'first_blood', title: 'First Blood', icon: 'sword', description: 'Defeat your first mob', type: 'kill', target: 1, xpReward: 30, tier: 1 },
    { id: 'hunter', title: 'Hunter', icon: 'bow', description: 'Defeat 5 mobs', type: 'kill', target: 5, xpReward: 75, tier: 1, itemReward: { item: 'Iron Sword', count: 1 } },
    { id: 'miner', title: 'Miner', icon: 'pickaxe', description: 'Break 30 blocks', type: 'block_break', target: 30, xpReward: 60, tier: 1, itemReward: { item: 'Iron Helmet', count: 1 } },
    { id: 'spellcaster', title: 'Spellcaster', icon: 'magic', description: 'Land 10 spells on enemies', type: 'spell_hit', target: 10, xpReward: 40, tier: 1 },

    // Intermediate quests
    hunt({ id: 'zombie_slayer', icon: 'zombie', mobType: 'zombie', target: 10, xpReward: 120, tier: 2 }),
    hunt({ id: 'spider_hunter', icon: 'spider', mobType: 'spider', target: 8, xpReward: 100, tier: 2 }),
    { id: 'pilgrim', title: 'Pilgrimage', icon: 'compass', description: 'Reach a frontier shrine', type: 'reach_shrine', target: 1, xpReward: 100, tier: 2, itemReward: { item: 'Iron Chestplate', count: 1 } },
    { id: 'collector', title: 'Collector', icon: 'coins', description: 'Open 5 treasure chests', type: 'chest_open', target: 5, xpReward: 80, tier: 2 },
    // Surviving the night siege is a tracked goal, driven by the dawn transition (onNightSurvived). Tier 2 keeps it out
    // of a new game's first three quests, which are the first three tier-1 rows above.
    { id: 'nightwatch', title: 'Nightwatch', icon: 'star', description: 'Survive 3 nights', type: 'survive_nights', target: 3, xpReward: 120, tier: 2 },
    // A targeted hunt for the charred siege husk (the night-siege themed hostile).
    hunt({ id: 'ember_hunter', icon: 'skull', mobType: 'emberhusk', target: 10, xpReward: 130, tier: 2 }),

    // Advanced quests
    { id: 'champion', title: 'Champion', icon: 'trophy', description: 'Defeat 50 mobs', type: 'kill', target: 50, xpReward: 300, tier: 3, itemReward: { item: 'Diamond Sword', count: 1 } },
    { id: 'archmage', title: 'Archmage', icon: 'magic', description: 'Land 100 spells on enemies', type: 'spell_hit', target: 100, xpReward: 250, tier: 3 },
    { id: 'treasure_master', title: 'Treasure Master', icon: 'crown', description: 'Open 20 treasure chests', type: 'chest_open', target: 20, xpReward: 200, tier: 3 },
    hunt({ id: 'undead_destroyer', icon: 'skull', mobType: 'skeleton', target: 25, xpReward: 200, tier: 3 }),
    // The endurance capstone of the survival dimension.
    { id: 'siege_veteran', title: 'Siege Veteran', icon: 'shield', description: 'Survive 7 nights', type: 'survive_nights', target: 7, xpReward: 350, tier: 3 },
    // An elite-hunt goal for the rare 220-HP moss brute (the heavy-tank kill the loot pass rewards richly).
    hunt({ id: 'brute_breaker', icon: 'trophy', mobType: 'moss_brute', target: 5, xpReward: 220, tier: 3 }),
];

// Endless end-game BOUNTY: once the authored QUEST_LIST is exhausted, claimQuest falls back to these so the
// goal feed never dries up. Target + reward scale gently with how many bounties you've already done. Pure +
// a unique `bounty_<seq>` id so it never collides with a claimed/active quest. type 'kill' = any mob counts.
export function makeRepeatableQuest(seq) {
    // `Number.isFinite` and not just `Math.max(0, ...)`: the old sanitiser already handled undefined,
    // NaN, negatives and numeric strings, but Infinity walked straight through it — Math.floor(Infinity)
    // is Infinity and Math.max(0, Infinity) is Infinity — producing `bounty_Infinity` with target and
    // xpReward both Infinity. That is a quest the player can never complete, sitting at the head of a
    // feed whose entire job is to never run out. Found by sweeping the input shapes while proving this
    // function total (repeatable-quest-gates.test.js), which is the property that lets nextQuest drop its
    // dead null-guard.
    const raw = Math.floor(Number(seq) || 0);
    const n = Number.isFinite(raw) ? Math.max(0, raw) : 0;
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

// save-data shape guards: persisted questState comes from localStorage and may be corrupt / tampered /
// version-mismatched; coerce to safe shapes so a bad save can't crash the quest system on load (new Set(5) throws).
const _arrOr = (v, fb) => (Array.isArray(v) ? v : fb);
const _objOr = (v, fb) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fb);
// _objOr shape-checks the CONTAINER; these guards then trusted every field inside it. A save whose stats
// object is missing a key yields `undefined + 1` = NaN on the next increment, and `NaN >= target` is false
// for every threshold -- so Warrior, Serial Slayer and Centurion become permanently unreachable with no
// error at all, while the achievements panel renders the string "NaN". Coerce the FIELDS, not just the box.
export const _numOr = (v, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
export const _statsOr = (v) => {
  const o = _objOr(v, {});
  return {
    ...o,
    kills: _numOr(o.kills), spells: _numOr(o.spells), blocks_placed: _numOr(o.blocks_placed),
    blocks_broken: _numOr(o.blocks_broken), chests: _numOr(o.chests), distance: _numOr(o.distance),
    deaths: _numOr(o.deaths), level: _numOr(o.level, 1),
    kills_by_type: _objOr(o.kills_by_type, {}),
  };
};

// A save keeps a quest's progress; what the quest asks for, and its English title, come from this file. Otherwise a quest retyped here would
// sit in an old save waiting for an event nothing sends any more, under text that describes the old ask.
const withCurrentAsk = (q) => {
  const def = q && QUEST_LIST.find((d) => d.id === q.id);
  return def ? { ...q, type: def.type, title: def.title, description: themedDescription(def) } : q;
};

// The quest offered when one is claimed: the next authored quest neither claimed nor active, else an endless scaling
// BOUNTY, so the goal feed never dries up (seq = bounties already claimed or active, which keeps each id unique). The
// lore and theming belong to this component, so it lives here and not in the pure reducer (game/questClaim.js), which
// only decides IF there is room for one. No null guard after the `||`: makeRepeatableQuest returns an object literal
// unconditionally, so the fallback is TOTAL (asserted in repeatable-quest-gates).
const nextQuest = (claimedIds, active) => {
    const bountyCount = [...claimedIds].filter(id => String(id).startsWith('bounty_')).length
        + active.filter(a => String(a.id).startsWith('bounty_')).length;
    const next = QUEST_LIST.find(q => !claimedIds.has(q.id) && !active.some(a => a.id === q.id))
        || makeRepeatableQuest(bountyCount);
    return {
        ...next,
        description: themedDescription(next),
        ...(loreFor(next.id) || {}),
        progress: 0,
        completed: false,
        claimed: false,
    };
};

// A saved feed can come back short: a save's active entry for a retired quest is held out of it
// (game/saveSchema.js RETIRED_QUEST_IDS). A claim only ever refills one slot, so a short feed would stay short; it is
// topped up to MAX_ACTIVE_QUESTS on load, the way a claim refills.
const fillFeed = (quests, completedQuestIds) => {
    const feed = [...quests];
    const claimed = new Set(_arrOr(completedQuestIds, []));
    while (feed.filter((q) => q && !q.claimed).length < MAX_ACTIVE_QUESTS) feed.push(nextQuest(claimed, feed.filter(Boolean)));
    return feed;
};

// A fresh quest log, as a new world starts it: the first three tier-1 quests, no claims, zero counters and the
// achievement every player starts with. New objects on every call, since the hook's state replaces them by reference.
// M-NARRATIVE.2: each quest is enriched with the frontier lore/giver and a themed description (story flavor over the
// generic chore). type/target/xpReward stay untouched (the {...q} spread), so every driver and the claim flow are
// unchanged; loreFor returns {} for non-chain quests (spreads nothing).
const freshQuestState = () => ({
    quests: QUEST_LIST.filter(q => q.tier === 1).slice(0, 3).map(q => ({
        ...q,
        description: themedDescription(q),
        ...(loreFor(q.id) || {}),
        progress: 0,
        completed: false,
        claimed: false,
    })),
    completedQuestIds: [],
    stats: {
        kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0,
        blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1,
    },
    unlockedAchievements: ['first_step'],
});

export const useQuestSystem = () => {
    // S2a: seed the persistable working state from the store's questState mirror
    // (set by loadWorldData) when present, else the fresh-game defaults.
    const [quests, setQuests] = useState(() => {
        const saved = useGameStore.getState().questState;
        if (saved && Array.isArray(saved.quests)) return fillFeed(saved.quests.map(withCurrentAsk), saved.completedQuestIds);
        return freshQuestState().quests;
    });

    const [completedQuestIds, setCompletedQuestIds] = useState(() => new Set(_arrOr(useGameStore.getState().questState?.completedQuestIds, [])));
    const [stats, setStats] = useState(() => _objOr(useGameStore.getState().questState?.stats, freshQuestState().stats));
    // The LIVE mirror of `stats`. applyStats reads and writes it, so a batch of kills accumulates
    // correctly without any state updater doing work a re-render would have to repeat.
    const statsRef = useRef(stats);
    const [unlockedAchievements, setUnlockedAchievements] = useState(() => new Set(_arrOr(useGameStore.getState().questState?.unlockedAchievements, ['first_step'])));
    // The LIVE mirror of the set above. Seeded from the same value, written in the same breath as every
    // setUnlockedAchievements, and read by checkAchievements. Even with the side effects moved out of the
    // updaters, a BATCH of kills calls applyStats N times before any re-render, so the render closure is
    // still stale for calls 2..N. The ref is what makes call 2 see call 1's unlock.
    const unlockedRef = useRef(unlockedAchievements);
    const [notifications, setNotifications] = useState([]);
    const notifId = useRef(0);
    // R1: synchronous in-tick mirrors of the claim-relevant state (assigned in the render body below).
    const questsRef = useRef(quests);
    const completedRef = useRef(completedQuestIds);

    // S2a — MIRROR (hook -> store, one-way): keep a JSON-safe snapshot of the
    // persistable state in the store so buildSaveData can serialize it. Sets are
    // flattened to arrays here. This effect ONLY writes questState; it does not
    // read worldLoadedAt, so it cannot fight the re-seed below (no feedback loop).
    useEffect(() => {
        useGameStore.getState().setQuestState({
            quests,
            completedQuestIds: [...completedQuestIds],
            stats,
            unlockedAchievements: [...unlockedAchievements],
        });
    }, [quests, completedQuestIds, stats, unlockedAchievements]);

    // S2a — RE-SEED ON LOAD (store -> hook): when loadWorldData bumps the world-load
    // tick, re-seed the local working state from the loaded snapshot. Gated by a
    // mount guard so the initial render (already seeded via the useState initializers)
    // doesn't clobber state. This effect watches ONLY worldLoadedAt; the mirror
    // watches the state values -> the two never feed each other. A world whose save holds no log (a new world's, or a
    // save from before the log) is a fresh log: the defaults, as the initializers seed them.
    const worldLoadedAt = useGameStore((s) => s.worldLoadedAt);
    const didMountQuest = useRef(false);
    useEffect(() => {
        if (!didMountQuest.current) { didMountQuest.current = true; return; }
        const qs = useGameStore.getState().questState || freshQuestState();
        if (Array.isArray(qs.quests)) setQuests(fillFeed(qs.quests.map(withCurrentAsk), qs.completedQuestIds));
        setCompletedQuestIds(new Set(_arrOr(qs.completedQuestIds, [])));
        if (_objOr(qs.stats, null)) {
            const restoredStats = _statsOr(qs.stats);
            statsRef.current = restoredStats; // or a load would keep counting from the pre-load totals
            setStats(restoredStats);
        }
        const restored = new Set(_arrOr(qs.unlockedAchievements, ['first_step']));
        unlockedRef.current = restored; // the ref is the live read — a restore that skipped it would
        // re-fire every already-earned achievement's toast on the first kill after loading a save.
        setUnlockedAchievements(restored);
    }, [worldLoadedAt]);

    // The one notification channel (ui/notifications.js): a dictionary key or a plain string; a key is dropped when the
    // same one showed inside one toast's life.
    const recentNotifications = useRef(new Map());
    const addNotification = useCallback((message, type = 'info', opts = {}) => {
        const n = toNotification(message, type, opts);
        const now = Date.now();
        if (!admits(recentNotifications.current, n.dedupe, now)) return;
        if (n.dedupe != null) recentNotifications.current.set(n.dedupe, now);
        const id = notifId.current++;
        setNotifications(prev => [...prev, { id, ...n, timestamp: now }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(x => x.id !== id));
        }, TOAST_MS);
    }, []);

    // Check and unlock achievements.
    //
    // THE GUARD READS A REF, not the render closure. checkAchievements is called from INSIDE a setStats
    // updater, and React 19 batches: a cleave, a chain-lightning arc or an element zone kills several mobs
    // in one synchronous task, so N updaters run before any re-render. Every one of them saw the SAME
    // pre-update Set captured at the last render, so `first_kill` fired on updater 1 and fired again on
    // updater 2 -- two toasts and two fanfares for one achievement, and the same at the 25 and 100
    // thresholds. setUnlockedAchievements is functional so the Set itself stayed correct; what doubled was
    // everything the player actually perceives. The ref is written in the same breath as the state, so the
    // second updater in a batch sees the first one's unlock.
    const checkAchievements = useCallback((currentStats) => {
        ACHIEVEMENTS.forEach(ach => {
            if (unlockedRef.current.has(ach.id)) return;
            if (ach.auto) return; // Already unlocked on init

            const statValue = ach.stat === 'kills' ? currentStats.kills :
                ach.stat === 'spells' ? currentStats.spells :
                    ach.stat === 'chests' ? currentStats.chests :
                        ach.stat === 'level' ? currentStats.level :
                            ach.stat === 'deaths' ? currentStats.deaths :
                                ach.stat === 'blocks_broken' ? currentStats.blocks_broken :
                                    ach.stat === 'blocks_placed' ? currentStats.blocks_placed : 0;

            if (statValue >= ach.target) {
                unlockedRef.current = new Set([...unlockedRef.current, ach.id]); // claim it BEFORE the side effects
                setUnlockedAchievements(prev => new Set([...prev, ach.id]));
                addNotification(`Achievement Unlocked: ${ach.title}!`, 'achievement');
                emit(EVENTS.reward);
            }
        });
    }, [addNotification]); // no unlockedAchievements dep: the ref is the live read, and depending on
    // the state would re-create this callback on every unlock without fixing the batching at all.

    // Update quest progress
    const updateQuestProgress = useCallback((type, amount = 1, extra = {}) => {
        setQuests(prev => prev.map(quest => {
            if (quest.completed || quest.claimed) return quest;

            // B6a/B6b: the ONE matcher lives in the pure, unit-tested game/questMatch.js. The inline version
            // here (a) advanced a generic 'kill' quest on BOTH the 'kill' AND 'kill_type' dispatch onMobKill
            // fires for one death (every "Defeat N mobs" quest completed at half cost), and (b) matched a
            // kill_type quest for ANY mob, never comparing quest.mobType (every hunt advanced on any kill).
            if (!questMatches(quest, type, extra)) return quest;

            const newProgress = Math.min(quest.progress + amount, quest.target);
            const nowComplete = newProgress >= quest.target;

            if (nowComplete && !quest.completed) {
                addNotification(`Quest Complete: ${quest.title}!`, 'quest');
                emit(EVENTS.reward);
            }

            return { ...quest, progress: newProgress, completed: nowComplete };
        }));
    }, [addNotification]);

    // S8c: the Pilgrimage quest. A shrine is reached within ~10 blocks of the nearest landmark, and the world records it
    // (the store's reachedShrines, saved with the world, keyed by chunk); the HUD ObjectiveTracker turns from "reach the
    // frontier shrine" to "shatter the Blight Heart" once one is. The quest is CREDITED FROM THAT RECORD, every poll,
    // whenever it is in the feed: a shrine reached before Pilgrimage is offered counts when it is (deep audit lane L3; it
    // used to count only a reach while the quest was active, and a saved record alone would have made that permanent).
    // Capture-suppressed; ~3s poll with transient store reads -> Game-Loop-Isolation. Gives the outward journey a
    // concrete GOAL (replaces the dead Travel-500 explorer quest, which had no driver).
    useEffect(() => {
        const interval = setInterval(() => {
            // INSIDE the callback: this effect's deps are [] and the harness flips the capture flag AFTER
            // mount, so a guard on the setup path is provably false every time and suppresses nothing.
            if (isCaptureMode() || isWorldFrozenNow()) return;
            const store = useGameStore.getState();
            const playerPos = store.playerPosition;
            if (!playerPos) return;
            const s = nearestLandmark(playerPos.x, playerPos.z);
            if (s && Math.hypot(playerPos.x - s.worldX, playerPos.z - s.worldZ) <= 10) store.reachShrine(`${s.cx}_${s.cz}`);
            const reached = useGameStore.getState().reachedShrines.length;
            const q = questsRef.current.find((x) => x.type === 'reach_shrine' && !x.completed && !x.claimed);
            if (q && Math.min(reached, q.target) > q.progress) updateQuestProgress('reach_shrine', Math.min(reached, q.target) - q.progress);
        }, 3000);
        return () => clearInterval(interval);
    }, [updateQuestProgress]);

    // R1 — LIVE MIRRORS of the claim-relevant state ("latest ref" pattern).
    // React state is asynchronous and batched. Quests claim themselves on completion (below), and they routinely
    // complete in pairs (one zombie kill finishes both `first_blood` and `zombie_slayer`), so two claims land in one
    // tick. Reading `completedQuestIds` from a render closure, or capturing the claimed quest from inside a setState
    // updater, would let the 2nd claim in a tick grant NO reward and ERASE the 1st quest from the save. These refs are
    // the synchronous truth WITHIN a tick; state stays the render truth. Locked by quest-multiclaim-gates and
    // quest-autoclaim-gates.
    questsRef.current = quests;
    completedRef.current = completedQuestIds;

    // Claim quest reward and add the next quest.
    const claimQuest = useCallback((questId) => {
        // Reduce PURELY from the live (ref) state — never from a stale closure, never from inside an updater.
        const next = reduceClaim(
            { quests: questsRef.current, completedQuestIds: completedRef.current },
            questId,
            nextQuest,
        );
        // Not claimable (already claimed / not complete) -> a true no-op. This is what makes a repeated
        // dispatch of the same id provably unable to double-pay.
        if (!next.claimed) return;

        // Commit to the refs IMMEDIATELY so a SECOND claim in this same tick sees this one.
        questsRef.current = next.quests;
        completedRef.current = next.completedQuestIds;
        setQuests(next.quests);
        setCompletedQuestIds(next.completedQuestIds);

        // B4: grant the FULL reward bundle (xp + coins + optional item). Paid from the PURE reduction's
        // `claimed`, so batching can never swallow it.
        const r = questRewards(next.claimed);
        const store = useGameStore.getState();
        if (r.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(r.xp, 'Quest Reward');
        if (r.coins > 0 && store.addCoins) store.addCoins(r.coins);
        if (r.item && store.addToInventory) store.addToInventory(r.item.item, r.item.count);
        const parts = [];
        if (r.xp > 0) parts.push(`+${r.xp} XP`);
        if (r.coins > 0) parts.push(`+${r.coins} coins`);
        if (r.item) parts.push(`+${r.item.count} ${r.item.item}`);
        if (parts.length) addNotification(`Quest reward: ${parts.join(', ')}!`, 'reward');
    }, [addNotification]);

    // Quests claim themselves on completion (the HUD lane, DECISIONS 2026-10-29 item 96): there is no claim key or button
    // any more. claimQuest reduces from the live refs and reduceClaim is still the only payer, so two quests completing
    // in one tick each pay once, and a quest already claimed is a no-op.
    useEffect(() => {
        for (const q of quests) if (q.completed && !q.claimed) claimQuest(q.id);
    }, [quests, claimQuest]);

    /**
     * Apply a stat delta, then check achievements ONCE.
     *
     * checkAchievements used to be called from INSIDE the setStats updater, and React dev-mode
     * DOUBLE-INVOKES updaters to surface impurity -- which is exactly what a toast and a fanfare inside
     * one are. Measured: a single kill produced TWO fanfares. Batching made it worse, not different: a
     * cleave, a chain arc or a zone tick runs N updaters before any re-render, and every one of them read
     * the same pre-update Set from the render closure, so the same achievement announced itself once per
     * victim. The set itself stayed correct because setUnlockedAchievements is functional; what doubled
     * was everything the player perceives, which is why nothing downstream noticed.
     *
     * So the updater is pure now -- it returns a value and does nothing else -- and the effects run here,
     * against a REF that is written in the same breath. The ref is also what makes the batch case correct:
     * updater 2 of a cleave sees updater 1's unlock.
     */
    const applyStats = useCallback((mutate) => {
        const next = mutate(statsRef.current);
        statsRef.current = next;
        setStats(next);
        checkAchievements(next);
    }, [checkAchievements]);

    // Record mob kill and generate loot
    const onMobKill = useCallback((mobType, position, source) => {
        // S2-B3-M1: quest/achievement kill credit = YOUR kills only (ally kills bank nothing)
        if (source !== 'player') return;
        // A kill worth no XP (a Settler) is not quarry: it counts toward no kill quest and no kill achievement either.
        if (killXP(mobType) > 0) {
            applyStats(prev => ({
                ...prev,
                kills: prev.kills + 1,
                kills_by_type: { ...prev.kills_by_type, [mobType]: (prev.kills_by_type[mobType] || 0) + 1 },
            }));
            updateQuestProgress('kill');
            updateQuestProgress('kill_type', 1, { mobType });
        }

        // Generate loot drops
        const lootTable = LOOT_TABLES[mobType] || [];
        const drops = [];
        // S7 reward: far from spawn = rarer drops. The kill-position zone tier boosts non-common rows
        // (common staples unchanged); tier 0 near spawn is identical to the legacy roll (no regression).
        const killTier = zoneTier(position?.[0] ?? 0, position?.[2] ?? 0); // the bus carries [x, y, z] (game/mobKillBus.js), not {x, z}
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
    }, [updateQuestProgress, applyStats, addNotification]);

    // Record spell cast. Casting pays no quest progress: the spell quests count spells that land on an enemy.
    const onSpellCast = useCallback(() => {
        applyStats(prev => ({ ...prev, spells: prev.spells + 1 }));
    }, [applyStats]);

    const onSpellHit = useCallback(() => {
        updateQuestProgress('spell_hit');
    }, [updateQuestProgress]);

    // Record block place
    const onBlockPlace = useCallback(() => {
        applyStats(prev => ({ ...prev, blocks_placed: prev.blocks_placed + 1 }));
        updateQuestProgress('block_place');
    }, [updateQuestProgress, applyStats]);

    // Record block break
    const onBlockBreak = useCallback(() => {
        applyStats(prev => ({ ...prev, blocks_broken: prev.blocks_broken + 1 }));
        updateQuestProgress('block_break');
    }, [updateQuestProgress, applyStats]);

    // Record chest open
    const onChestOpen = useCallback(() => {
        applyStats(prev => ({ ...prev, chests: prev.chests + 1 }));
        updateQuestProgress('chest_open');
    }, [updateQuestProgress, applyStats]);

    // Record death
    const onDeath = useCallback(() => {
        applyStats(prev => ({ ...prev, deaths: prev.deaths + 1 }));
    }, [applyStats]);

    // Record a survived night (fired once per dawn from useSurvivalMode, gated on the dawn reward
    // actually granting -> exactly once per genuinely-survived night). Drives the survive_nights quests.
    const onNightSurvived = useCallback(() => {
        updateQuestProgress('survive_nights');
    }, [updateQuestProgress]);

    // Track player level
    const updateLevel = useCallback((level) => {
        applyStats(prev => ({ ...prev, level }));
    }, [applyStats]);

    // Expose globally for other systems to call
    useEffect(() => {
        useGameStore.setState({ onSpellCast: onSpellCast });
        useGameStore.setState({ onSpellHit: onSpellHit });
        useGameStore.setState({ onBlockPlace: onBlockPlace });
        useGameStore.setState({ onBlockBreak: onBlockBreak });
        useGameStore.setState({ onChestOpen: onChestOpen });
        useGameStore.setState({ onPlayerDeath: onDeath });
        useGameStore.setState({ onNightSurvived: onNightSurvived });
        useGameStore.setState({ addNotification: addNotification });
        // The boot's load ran before this channel existed (game/worldBoot.js bootWorld holds its notices).
        const held = useGameStore.getState()._bootNotices;
        if (held && held.length) {
            useGameStore.setState({ _bootNotices: [] });
            for (const args of held) addNotification(...args);
        }
        // B6c: `updateLevel` was returned from this hook and published NOWHERE, so nothing ever called it.
        // `stats.level` therefore never moved off 1, and the two level achievements ('Rising Star' at 5,
        // 'Shining Star' at 10) could never unlock — 2 of the 12 were dead on arrival. Every sibling event
        // above is published here for its emitter to call; this one was simply left out of the list.
        useGameStore.setState({ onLevelChanged: updateLevel });
    }, [onSpellCast, onSpellHit, onBlockPlace, onBlockBreak, onChestOpen, onDeath, onNightSurvived, addNotification, updateLevel]);

    // S2-B1-M3.5: mob kills now flow through the fan-out bus (was a single store.onMobKill slot a 2nd
    // consumer like the meter accrual would have clobbered). Quests subscribe; the kill-path emits. Unsub on unmount.
    useEffect(() => subscribeMobKill(onMobKill), [onMobKill]);

    return {
        quests, stats, achievements: ACHIEVEMENTS,
        unlockedAchievements, notifications, claimQuest, updateLevel,
    };
};

/** The quest the one-line tracker shows: the first not yet claimed (a completed one waits there for its claim). */
export const leadQuest = (quests) => (quests || []).find((q) => !q.claimed) || null;

const QuestRow = ({ quest, t, locale }) => (
    <div className="relative">
        <div className="flex items-start justify-between">
            <div className="flex-1 mr-2">
                <div className="flex items-center gap-1.5 text-text text-xs font-bold">
                    {quest.icon && <Icon name={quest.icon} size={14} className="flex-none text-accent" />}
                    <span>{questTitle(t, locale, quest)}</span>
                </div>
                <div className="text-text-muted text-xs">{questDescription(t, locale, quest)}</div>
            </div>
        </div>
        {/* Progress bar — bold-flat inset track + flat fill */}
        <div className="mt-1 h-2 bg-track rounded-sm border-chrome border-ink overflow-hidden">
            <m.div
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
);

// ONE OBJECTIVE LINE AT REST (the HUD lane's task script, decision 3): the lead quest's title, its objective and its
// count, so the quests hold one line of the screen rather than a panel. On touch a tap opens the full list (the tracker
// is `data-hud-interactive`, so the touch layer leaves its taps to it: input/touchOwnership.js). On desktop the HUD shows
// only under pointer lock, where no click or hover reaches it: the full list is the Journal's (J). A quest claims itself
// when it completes, so nothing here waits on a key.
export const QuestTracker = React.memo(({ quests }) => {
    const touch = isTouchUIMode();
    const [expanded, setExpanded] = useState(false);
    const t = useT();
    const locale = useGameStore((s) => s.locale) || 'en';
    const lead = leadQuest(quests);

    return (
        <div data-testid="quest-tracker" data-hud-interactive className="absolute top-4 left-4 z-20 pointer-events-auto" style={{ maxWidth: touch ? 236 : 280 }}>
            <Panel variant="raise" shadow="shadow-none" className="overflow-hidden p-0">
                <div className="flex items-center bg-panel-raise">
                    <button
                        type="button"
                        data-testid="quest-tracker-line"
                        aria-expanded={expanded}
                        className="flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 text-left"
                        onClick={() => setExpanded(!expanded)}
                    >
                        <Icon name="scroll" size={14} className="flex-none text-accent" />
                        {expanded ? (
                            <span className="flex-1 font-display uppercase tracking-wide text-accent text-xs">{t('hud.quests')}</span>
                        ) : lead ? (
                            <span className="min-w-0 truncate text-xs">
                                <span className="font-bold text-text">{questTitle(t, locale, lead)}</span>
                                <span className="text-text-muted">{' · '}{questDescription(t, locale, lead)}</span>
                            </span>
                        ) : (
                            <span className="text-xs text-text-muted">{t('hud.questsDone')}</span>
                        )}
                        {lead && !expanded && <span className="flex-none text-xs tabular-nums text-text-muted">{lead.progress}/{lead.target}</span>}
                        <Icon name="chevron" size={12} className={`flex-none text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                </div>

                <AnimatePresence>
                    {expanded && (
                        <m.div
                            data-testid="quest-tracker-list"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-3 py-2 space-y-2 border-t-chrome border-ink overflow-hidden"
                        >
                            {quests.map((quest) => (
                                <QuestRow key={quest.id} quest={quest} t={t} locale={locale} />
                            ))}
                            {quests.length === 0 && (
                                <div className="flex items-center justify-center gap-1.5 text-text-muted text-xs text-center py-2">
                                    {t('hud.questsDone')} <Icon name="party" size={14} className="text-accent" />
                                </div>
                            )}
                        </m.div>
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

/** Clamp a toast's words to `lines` lines, an ellipsis ending the last. */
const clampLines = (lines) => ({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' });

export const NotificationStack = React.memo(({ notifications, inline = false, single = false, maxWidth = 320, right = 16, lines = null }) => {
    const t = useT();
    // Standing on its own at the right edge (a keyboard, a tall touch screen): below the day-phase dial (top 68 px, 72 px
    // tall), which a toast must not cover (STATUS G-ledger 38/a), and on touch below the minimap under the dial and the
    // coin count under it (HUD.jsx CoinReadout), `right` px from the edge (ui/hudLayout.js tallToastPlace). `inline`: in
    // the encounter column (a phone, a phone on its side: HUD.jsx Encounter), where those screens leave a band clear
    // across the middle. `single`: one toast at a time, the leaving one gone before the next arrives, so two never stand
    // in a column sized for one. `lines`: each toast's words clamped, so a counted stack keeps its height.
    const place = inline ? { maxWidth } : { maxWidth, right, top: isTouchUIMode() ? TOUCH_TOAST_TOP : 164 };
    return (
        <div data-testid="notification-stack" className={`${inline ? '' : 'absolute z-30 '}pointer-events-none space-y-2`} style={place}>
            <AnimatePresence mode={single ? 'wait' : 'sync'}>
                {notifications.map(notif => {
                    const status = NOTIF_STATUS[notif.type] || 'info';
                    const iconName = NOTIF_ICON[notif.type] || 'sparkles';
                    return (
                        <m.div
                            key={notif.id}
                            data-testid="notification"
                            data-notification-key={notif.key || ''}
                            initial={{ opacity: 0, x: 100, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.8 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            <Toast status={status} className="w-full text-sm font-bold">
                                <Icon name={iconName} size={16} className="flex-none" />
                                <span style={lines ? clampLines(lines) : undefined}>{notificationText(notif, t)}</span>
                            </Toast>
                        </m.div>
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

export const useTreasureChests = () => {
    const addNotification = useGameStore(state => state.addNotification);
    const [chests, setChests] = useState([]);
    const [openedChestIds, setOpenedChestIds] = useState(new Set());
    const chestId = useRef(0);
    // live mirrors so the mount-once spawner interval reads current counts without resetting its cadence (#41)
    const chestsRef = useRef(chests); chestsRef.current = chests;
    const openedRef = useRef(openedChestIds); openedRef.current = openedChestIds;

    // Generate chest near player periodically
    useEffect(() => {
        // Dev capture mode: suppress quest-chest spawning entirely. Chests spawn at a
        // RANDOM angle/distance RELATIVE to the live player entity, and the player
        // drifts during the capture settle window, so even a seeded position yields a
        // run-varying Compass distance label + 3D chest screen-position. Zero chests =
        // deterministic frame. No-op in normal gameplay.
        const interval = setInterval(() => {
            // INSIDE the callback. Deps are [] and the harness flips the capture flag AFTER mount, so a
            // guard on the setup path is provably false every time and suppressed nothing.
            if (isCaptureMode() || isWorldFrozenNow()) return;
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;

            // Max 5 chests at a time
            if (chestsRef.current.length - openedRef.current.size >= 5) return;

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
    }, []); // mount-once: the 30s cadence must NOT reset on every chest spawn/open (live counts via refs above)

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
        // DEPS ARE [] AND THAT IS THE WHOLE FIX. They used to be [chests.length], which reads as "spawn one
        // at the start" and actually means "there shall always be at least one chest" — re-evaluated on
        // every transition to zero. The board hits zero by design (opening a chest schedules its removal
        // 5s later), so the loop was: open, loot, wait five seconds, a fresh chest appears 15 units away,
        // repeat. An unbounded loot and XP farm needing no movement and no combat.
        //
        // A once-ref was tried alongside this and REMOVED as inert: with [] deps nothing can re-fire the
        // effect, so no mutation could redden the ref, and a line no mutation can redden is a decoration.
        // A retry-until-playerPosition-arrives variant was also tried and abandoned — [chests.length] does
        // not re-fire on 0 -> 0, and subscribing to playerPosition would re-render this hook every frame,
        // violating Game-Loop-Isolation. The store seeds playerPosition to a truthy default, so the
        // late-position case cannot arise. Topping the board up afterwards is the 30s spawner's job,
        // which enforces its own 5-cap.
    }, []);

    // S8c-bis: a guaranteed reward chest at each frontier shrine -- the deferred S8 destination payoff.
    // Lives HERE (the hook that owns setChests) so no cross-hook bridge is needed. Deterministic +
    // once-per-shrine + capture-guarded (shrines can sit near origin, so the guard keeps chests out of the deterministic
    // baselines). ONCE PER SHRINE, PER WORLD: opening its chest records the shrine as rewarded in the store (saved with the
    // world), and a rewarded shrine spawns none again; the ref is the board's own record that a chest for the shrine is
    // on it, which dies with the board. A chest left shut is owed after a reload, and comes back once.
    // Game-Loop-Isolation: setInterval + transient getState reads, not a useFrame subscription.
    const shrineChestsSpawned = useRef(new Set());
    useEffect(() => {
        const interval = setInterval(() => {
            // INSIDE the callback — same reason as the two sibling pollers above.
            if (isCaptureMode() || isWorldFrozenNow()) return;
            const playerPos = useGameStore.getState().playerPosition;
            if (!playerPos) return;
            const s = nearestLandmark(playerPos.x, playerPos.z);
            if (!s) return;
            if (Math.hypot(playerPos.x - s.worldX, playerPos.z - s.worldZ) > 12) return;
            const key = `${s.cx}_${s.cz}`;
            if (shrineChestsSpawned.current.has(key) || useGameStore.getState().rewardedShrines.includes(key)) return;
            shrineChestsSpawned.current.add(key);

            let y = 15;
            let resolved = false;
            const getLevel = useGameStore.getState().getMobGroundLevel;
            if (getLevel) {
                const h = getLevel(s.worldX, s.worldZ);
                if (typeof h === 'number' && !isNaN(h)) { y = h + 1; resolved = true; }
            }
            // EXEMPT from the periodic spawner's 5-cap: a guaranteed, once-per-shrine reward.
            setChests(prev => [...prev, { id: chestId.current++, position: [s.worldX, y, s.worldZ], opened: false, resolved, shrine: true, shrineKey: key }]);
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
            if (chest.shrineKey) useGameStore.getState().rewardShrine(chest.shrineKey);
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
            
            // Identity-preserving: returns the SAME array when nothing resolved, so a no-op tick does
            // not mint a new React state value and re-render every consumer once every 3 seconds forever.
            setChests(prev => resolveChestHeights(prev, getLevel).chests);
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
    const t = useT();
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
        <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
            style={{ marginTop: 60 }}
        >
            <Panel variant="base" bg="bg-accent" text="text-text-inverse" className="px-4 py-2 text-center flex items-center gap-2">
                <Icon name="chest" size={22} className="text-text-inverse flex-none" />
                <div className="text-left">
                    <div className="font-display uppercase tracking-wide text-sm leading-tight">{t('chest.treasure')}</div>
                    <div className="text-xs font-bold opacity-80">{t('chest.pressG')}</div>
                </div>
            </Panel>
        </m.div>
    );
});

