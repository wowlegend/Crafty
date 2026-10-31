// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { STRINGS } from '../../src/i18n/strings.js';

/**
 * A SAVE THAT DOES NOT LAND SAYS SO (the July review's save-write-failure-silent, :937; lane L8). worldSaves.js swallows
 * a storage throw and writeWorld returns false, and the store ignored that false: at the origin's quota (the deep
 * audit's verifier filled it in 814 sessions) or in a browser that refuses storage, every save, the real world's too,
 * stopped with no word, and a player who closed the tab lost everything since the last save that landed. Now a save
 * whose write fails raises one notice (save.failed), once for a run of failures, and again only after a save has
 * landed in between.
 *
 * The real store and the real worldSaves over jsdom's localStorage; Storage.prototype.setItem throws the browser's
 * QuotaExceededError for the keys a case names. The notification channel is a recorder in the store's own slot (the
 * quest system publishes the real one there, and toNotification renders a dictionary key: ui/notifications.js).
 * BLIND SPOT: a real browser's quota (the throw is stood in), and whether a toast over the title can be seen.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   F1 a failed write raises no notice                                       -> RED expected
 *   F2 plausible-wrong: every failed save raises one (a toast every 5 s)     -> RED expected
 *   F3 plausible-wrong: a landed save does not end the run (a later failure is silent) -> RED expected
 *   F4 the index write's failure is not a failure                            -> RED expected
 *   F0 identity (a comment edit)                                             -> must SURVIVE
 */

const S = () => useGameStore.getState();
let failKeys = null; // a predicate on the storage key, or null for none
let notices = [];

const save = () => S().saveActiveWorld({ x: 1.5, y: 40, z: 2.5 });
const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState(useGameStore.getInitialState(), true);
  notices = [];
  useGameStore.setState({ addNotification: (...args) => notices.push(args), gameStarted: true });
  failKeys = null;
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (failKeys && failKeys(String(k))) throw quota();
    return real.call(this, k, v);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

const failed = () => notices.filter(([key]) => key === 'save.failed').length;

describe('a save whose write fails tells the player, once a run', () => {
  it('a full storage: the first failed save raises the notice, the next ones do not, a landed save ends the run', () => {
    expect(save(), 'SETUP: a save into empty storage did not land').toBe(true);
    // PRESENCE: the recorder sees nothing for a save that lands.
    expect(failed(), 'a save that landed raised the failure notice').toBe(0);
    failKeys = (k) => k.startsWith('crafty_world_save_');
    S().addCoins(5);
    expect(save(), 'SETUP: the stubbed quota did not fail the write').toBe(false);
    expect(failed(), 'a save that did not land said nothing').toBe(1);
    expect(notices.find(([key]) => key === 'save.failed')[1], 'the notice is not a warning').toBe('warning');
    save(); save();
    expect(failed(), 'every failed save raised its own notice: a toast every few seconds while the storage is full').toBe(1);
    failKeys = null;
    expect(save(), 'a save after the storage freed did not land').toBe(true);
    failKeys = (k) => k.startsWith('crafty_world_save_');
    save();
    expect(failed(), 'a failure after a landed save said nothing').toBe(2);
  });

  it('the blob lands and the index write fails: that save did not land either, and says so', () => {
    expect(save(), 'SETUP: a save into empty storage did not land').toBe(true);
    failKeys = (k) => k === 'crafty_world_saves';
    S().addCoins(5);
    expect(save(), 'a save whose index write failed reported success').toBe(false);
    expect(failed(), 'a save whose index write failed said nothing').toBe(1);
  });

  it('the notice has words in both languages', () => {
    expect([typeof STRINGS.en['save.failed'], typeof STRINGS['zh-CN']['save.failed']], 'save.failed is missing a language').toEqual(['string', 'string']);
  });
});
