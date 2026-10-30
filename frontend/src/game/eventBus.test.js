import { describe, it, expect, beforeEach } from 'vitest';
import { EVENTS, on, emit, subscriberCount, _resetBus } from './eventBus.js';

beforeEach(() => _resetBus());

describe('the event bus', () => {
  it('delivers the positional payload to every subscriber of that event, and only that event', () => {
    const kills = [];
    const levels = [];
    on(EVENTS.mobKill, (t, p, s) => kills.push([t, p, s]));
    on(EVENTS.mobKill, (t) => kills.push([t]));
    on(EVENTS.levelUp, (lvl) => levels.push(lvl));
    emit(EVENTS.mobKill, 'zombie', [1, 2, 3], 'player');
    expect(kills).toEqual([['zombie', [1, 2, 3], 'player'], ['zombie']]);
    expect(levels).toEqual([]);
    emit(EVENTS.levelUp, 4);
    expect(levels).toEqual([4]);
  });

  it('a name outside EVENTS throws at subscribe and at emit, so a typo cannot go unheard', () => {
    expect(() => on('levelup', () => {})).toThrow(/not an event/);
    expect(() => emit('levelup')).toThrow(/not an event/);
    expect(() => emit(EVENTS.levelUp, 2), 'control: a real name does not throw').not.toThrow();
  });

  it('unsubscribe stops delivery, and a second unsubscribe is harmless', () => {
    let n = 0;
    const off = on(EVENTS.reward, () => n++);
    expect(subscriberCount(EVENTS.reward)).toBe(1);
    off();
    off();
    expect(subscriberCount(EVENTS.reward)).toBe(0);
    emit(EVENTS.reward);
    expect(n).toBe(0);
  });

  it('one throwing subscriber does not stop the others', () => {
    let reached = false;
    on(EVENTS.victory, () => { throw new Error('a reactor failed'); });
    on(EVENTS.victory, () => { reached = true; });
    expect(() => emit(EVENTS.victory)).not.toThrow();
    expect(reached).toBe(true);
  });

  it('a dispatch walks the subscribers it began with: one added or removed during it takes effect from the next', () => {
    const order = [];
    let offB;
    const late = () => order.push('late');
    on(EVENTS.reward, () => { order.push('a'); offB(); on(EVENTS.reward, late); });
    offB = on(EVENTS.reward, () => order.push('b'));
    emit(EVENTS.reward);
    expect(order, 'the first dispatch saw a change made during it').toEqual(['a', 'b']);
    order.length = 0;
    emit(EVENTS.reward);
    expect(order).toEqual(['a', 'late']);
  });
});
