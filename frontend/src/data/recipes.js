// recipes.js — the crafting recipe set (extracted from ui/panels/CraftingTable.jsx, byte-exact for the
// existing rows). A recipe = { name, pattern (a minimal sub-grid of item/block tokens, null = empty),
// output ({ itemName: count }) }. The panel normalizes the 3x3 grid to its minimal sub-grid and matches
// it against these patterns. Tokens are either BLOCK keys (lowercase: 'wood','coal','iron') or ITEM
// display names ('Iron Nugget','Leather','Raw Porkchop'); outputs route through addToInventory ->
// inventory.blocks[name] (the bucket the hotbar/consume paths read). Kept pure so the set is unit-testable.
export const RECIPES = [
    // Swords & Weapons
    {
        name: 'Stone Sword',
        pattern: [[null, 'cobblestone', null], [null, 'cobblestone', null], [null, 'wood', null]],
        output: { 'Stone Sword': 1 }
    },
    {
        name: 'Iron Sword',
        pattern: [[null, 'iron', null], [null, 'iron', null], [null, 'wood', null]],
        output: { 'Iron Sword': 1 }
    },
    {
        name: 'Iron Sword (Nuggets)',
        pattern: [[null, 'Iron Nugget', null], [null, 'Iron Nugget', null], [null, 'wood', null]],
        output: { 'Iron Sword': 1 }
    },
    {
        name: 'Diamond Sword',
        pattern: [[null, 'diamond', null], [null, 'diamond', null], [null, 'wood', null]],
        output: { 'Diamond Sword': 1 }
    },
    // Shields
    {
        name: 'Wooden Shield',
        pattern: [['wood', 'wood', 'wood'], ['wood', 'wood', 'wood'], [null, 'wood', null]],
        output: { 'Wooden Shield': 1 }
    },
    {
        name: 'Iron Shield',
        pattern: [['iron', 'iron', 'iron'], ['iron', 'iron', 'iron'], [null, 'iron', null]],
        output: { 'Iron Shield': 1 }
    },
    {
        name: 'Diamond Shield',
        pattern: [['diamond', 'diamond', 'diamond'], ['diamond', 'diamond', 'diamond'], [null, 'diamond', null]],
        output: { 'Diamond Shield': 1 }
    },
    // Helmets
    {
        name: 'Leather Helmet',
        pattern: [['Leather', 'Leather', 'Leather'], ['Leather', null, 'Leather']],
        output: { 'Leather Helmet': 1 }
    },
    {
        name: 'Iron Helmet',
        pattern: [['iron', 'iron', 'iron'], ['iron', null, 'iron']],
        output: { 'Iron Helmet': 1 }
    },
    {
        name: 'Diamond Helmet',
        pattern: [['diamond', 'diamond', 'diamond'], ['diamond', null, 'diamond']],
        output: { 'Diamond Helmet': 1 }
    },
    {
        name: 'Golden Crown',
        pattern: [['gold', 'gold', 'gold'], ['gold', null, 'gold']],
        output: { 'Golden Crown': 1 }
    },
    // Chestplates
    {
        name: 'Leather Chestplate',
        pattern: [['Leather', null, 'Leather'], ['Leather', 'Leather', 'Leather'], ['Leather', 'Leather', 'Leather']],
        output: { 'Leather Chestplate': 1 }
    },
    {
        name: 'Iron Chestplate',
        pattern: [['iron', null, 'iron'], ['iron', 'iron', 'iron'], ['iron', 'iron', 'iron']],
        output: { 'Iron Chestplate': 1 }
    },
    {
        name: 'Diamond Chestplate',
        pattern: [['diamond', null, 'diamond'], ['diamond', 'diamond', 'diamond'], ['diamond', 'diamond', 'diamond']],
        output: { 'Diamond Chestplate': 1 }
    },
    // Boots
    {
        name: 'Leather Boots',
        pattern: [['Leather', null, 'Leather'], ['Leather', null, 'Leather']],
        output: { 'Leather Boots': 1 }
    },
    {
        name: 'Iron Boots',
        pattern: [['iron', null, 'iron'], ['iron', null, 'iron']],
        output: { 'Iron Boots': 1 }
    },
    {
        name: 'Diamond Boots',
        pattern: [['diamond', null, 'diamond'], ['diamond', null, 'diamond']],
        output: { 'Diamond Boots': 1 }
    },
    // Tools & Materials
    {
        name: 'Stone Pickaxe',
        pattern: [['cobblestone', 'cobblestone', 'cobblestone'], [null, 'wood', null], [null, 'wood', null]],
        output: { pickaxe: 1 }
    },
    {
        name: 'Bow',
        pattern: [['wood', 'String', null], ['wood', null, 'String'], ['wood', 'String', null]],
        output: { 'Arrow': 5 }
    },
    {
        name: 'Torch',
        pattern: [['coal'], ['wood']],
        output: { torch: 4 }
    },
    {
        name: 'Glass',
        pattern: [['sand']],
        output: { glass: 1 }
    },
    {
        name: 'Planks',
        pattern: [['wood']],
        output: { planks: 4 }
    },
    {
        name: 'Magic Crystal',
        pattern: [['diamond', 'gold']],
        output: { crystals: 4 }
    },
    // Cooking — turn raw meat (mob loot) into cooked food (better sustain) over coal. Completes the
    // food loop: kill -> raw drop -> cook -> eat. Outputs are the consumable Cooked cuts GamePanels eats.
    {
        name: 'Cooked Porkchop',
        pattern: [['Raw Porkchop'], ['coal']],
        output: { 'Cooked Porkchop': 1 }
    },
    {
        name: 'Cooked Beef',
        pattern: [['Raw Beef'], ['coal']],
        output: { 'Cooked Beef': 1 }
    },
    // Alchemy — craft healing on demand from gathered loot (proactive sustain the chest/coin/dawn/food
    // sources don't give). Emerald is the healing essence, bound by spider-eye reagents. Output heals 30.
    {
        name: 'Health Potion',
        pattern: [['Spider Eye', 'Emerald', 'Spider Eye']],
        output: { 'Health Potion': 1 }
    }
];
