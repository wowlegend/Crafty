// Narrative layer over the EXISTING QUEST_LIST (QuestSystem.jsx) + the reach_shrine -> Blight-Heart
// spine. Pure data + helpers (no new quest SYSTEM): lore/giver fields + a re-theming map that turns
// generic chores ("Defeat 5 mobs") into frontier story beats, WITHOUT changing each quest's type/
// target (so the existing drivers + claim flow are untouched). The hub NPCs are the givers.
// CHAIN_ORDER DELETED 2026-08-11. It declared a five-quest narrative spine -- first_blood, hunter,
// pilgrim, nightwatch, champion -- and nothing read it, while quest offering follows QUEST_LIST's own
// authoring order, which interleaves builder / miner / spellcaster / zombie_slayer / spider_hunter
// between those beats. So the file declared one story order and the game told another. The LORE map
// below IS consumed (loreFor / themedDescription), so the narrative survives; what is gone is a second,
// unread opinion about sequence that contradicted the real one.

/**
 * Quest ids this module writes lore for. EXPORTED so a gate can walk the map's own keys: the first draft
 * of that gate iterated a hardcoded list instead, so renaming a key here just made loreFor return null and
 * the check passed. A denominator that does not come from the thing under test is not a denominator.
 */
export function loreQuestIds() {
  return Object.keys(LORE);
}

const LORE = {
  first_blood: { giver: 'Old Pike the Warden', lore: 'The Blight pushes monsters to our gate. Draw first blood, and prove you can hold the frontier.' },
  hunter: { giver: 'Mara the Smith', lore: 'Five more, and I will forge you something worth carrying past the shrines.' },
  pilgrim: { giver: 'Old Pike the Warden', lore: 'Light the frontier shrine. Each one we reclaim weakens the Blight Heart at the edge of the world.' },
  nightwatch: { giver: 'Sister Wren', lore: 'When the sun falls the siege comes. Survive three nights and the outpost will trust you with the road.' },
  champion: { giver: 'Bram the Trader', lore: 'Clear the frontier of fifty horrors and the path to the Blight Heart lies open.' },
};

const THEMED = {
  first_blood: 'Cut down the first horror at the gate',
  hunter: 'Thin the frontier pack -- defeat 5',
  builder: 'Raise the outpost walls -- place 20 blocks',
  miner: 'Quarry stone for the forge -- break 30 blocks',
  spellcaster: 'Practice the old wardings -- cast 10 spells',
  pilgrim: 'Walk the pilgrim road to a frontier shrine',
  nightwatch: 'Hold the wall through 3 nights of siege',
  champion: 'Break the frontier horde -- defeat 50',
};

export function loreFor(questId) { return LORE[questId] || null; }
export function themedDescription(quest) { return (quest && THEMED[quest.id]) || (quest && quest.description) || ''; }
