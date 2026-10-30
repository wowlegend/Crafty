// Type drawn on the world with no panel behind it (the vitals' numbers, the coin count, a target's nameplate) keeps a
// one-pixel ink outline and a soft shadow, so it reads over a white sky as well as over dark stone.
const INK = 'rgb(var(--ui-ink))';
export const ON_WORLD_TEXT = Object.freeze({
  textShadow: `1px 0 0 ${INK}, -1px 0 0 ${INK}, 0 1px 0 ${INK}, 0 -1px 0 ${INK}, 0 1px 3px ${INK}`,
});
