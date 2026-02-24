export const BLOCK_TYPES = Object.freeze({
    grass: Object.freeze({ color: '#567C35', name: 'Grass Block', texture: 'grass' }),
    dirt: Object.freeze({ color: '#976D4D', name: 'Dirt', texture: 'dirt' }),
    stone: Object.freeze({ color: '#707070', name: 'Stone', texture: 'stone' }),
    wood: Object.freeze({ color: '#8F7748', name: 'Oak Wood', texture: 'wood' }),
    birch_wood: Object.freeze({ color: '#E8DCC8', name: 'Birch Wood', texture: 'birch' }),
    leaves: Object.freeze({ color: '#3B8C2A', name: 'Leaves', texture: 'leaves' }),
    glass: Object.freeze({ color: '#F0F8FF', name: 'Glass', texture: 'glass', transparent: true }),
    water: Object.freeze({ color: '#3F76E4', name: 'Water', texture: 'water', transparent: true }),
    lava: Object.freeze({ color: '#FF4500', name: 'Lava', texture: 'lava', emissive: true }),
    diamond: Object.freeze({ color: '#4FD0E7', name: 'Diamond Ore', texture: 'diamond', emissive: true }),
    gold: Object.freeze({ color: '#FCEE4B', name: 'Gold Ore', texture: 'gold' }),
    iron: Object.freeze({ color: '#D8AF93', name: 'Iron Ore', texture: 'iron' }),
    coal: Object.freeze({ color: '#2F2F2F', name: 'Coal Ore', texture: 'coal' }),
    sand: Object.freeze({ color: '#DBD3A0', name: 'Sand', texture: 'sand' }),
    cobblestone: Object.freeze({ color: '#7F7F7F', name: 'Cobblestone', texture: 'cobblestone' }),
    flower_red: Object.freeze({ color: '#FF3333', name: 'Red Flower', texture: 'flower', transparent: true }),
    flower_yellow: Object.freeze({ color: '#FFD700', name: 'Yellow Flower', texture: 'flower', transparent: true })
});

export const BLOCK_TYPE_KEYS = Object.keys(BLOCK_TYPES);
export const HOTBAR_BLOCKS = BLOCK_TYPE_KEYS.slice(0, 9);
