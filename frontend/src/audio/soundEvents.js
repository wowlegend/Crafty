import { EVENTS, on } from '../game/eventBus.js';

/** Each bus event that has a sound, and the voice (audio/synthVoices.js VOICES) it plays. */
export const EVENT_VOICES = Object.freeze({
  [EVENTS.levelUp]: 'levelUp',
  [EVENTS.reward]: 'fanfare',
  [EVENTS.victory]: 'victory',
});

/** Subscribe `play(voice)` to every event in EVENT_VOICES; returns one unsubscribe for all of them. */
export function subscribeEventSounds(play) {
  const offs = Object.entries(EVENT_VOICES).map(([name, voice]) => on(name, () => play(voice)));
  return () => { for (const off of offs) off(); };
}
