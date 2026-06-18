// Narrative layer over the EXISTING QUEST_LIST (QuestSystem.jsx) + the reach_shrine -> Blight-Heart
// spine. Pure data + helpers (no new quest SYSTEM): lore/giver fields + a re-theming map that turns
// generic chores ("Defeat 5 mobs") into frontier story beats, WITHOUT changing each quest's type/
// target (so the existing drivers + claim flow are untouched). The hub NPCs are the givers.
export const CHAIN_ORDER = ['first_blood', 'hunter', 'pilgrim', 'nightwatch', 'champion'];

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
