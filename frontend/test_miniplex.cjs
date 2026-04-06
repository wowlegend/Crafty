const { World } = require('miniplex');
const world = new World();
world.add({ id: 1, pos: { x: 0, y: 0 } });
const query = world.with('pos');
console.log("Success! Entities:", query.entities.length);
