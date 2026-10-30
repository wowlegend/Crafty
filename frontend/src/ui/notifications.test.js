import { describe, it, expect, afterEach } from 'vitest';
import { toNotification, admits, notificationText, lineNotification, TOAST_MS } from './notifications.js';
import { useGameStore } from '../store/useGameStore.jsx';

afterEach(() => useGameStore.setState({ locale: 'en' }));

describe('one notification channel', () => {
  it('the same key twice inside the window shows once; after the window, again', () => {
    const recent = new Map();
    const a = toNotification('notice.dusk', 'warn');
    expect(admits(recent, a.dedupe, 1000)).toBe(true);
    recent.set(a.dedupe, 1000);
    expect(admits(recent, toNotification('notice.dusk', 'warn').dedupe, 1000 + TOAST_MS - 1), 'a repeat inside the window showed').toBe(false);
    expect(admits(recent, a.dedupe, 1000 + TOAST_MS)).toBe(true);
  });

  it('plain text is never dropped (a repeated denial answers each press); an explicit key dedupes it', () => {
    const recent = new Map([['Looted: Bone', 0], ['loot', 0]]);
    expect(toNotification('Looted: Bone', 'loot').dedupe).toBeNull();
    expect(admits(recent, toNotification('Looted: Bone', 'loot').dedupe, 10)).toBe(true);
    expect(admits(recent, toNotification('Looted: Bone', 'loot', { key: 'loot' }).dedupe, 10)).toBe(false);
  });

  it('a key renders in the current language when shown; plain text renders as written', () => {
    const dusk = toNotification('notice.dusk', 'warn');
    expect(dusk).toMatchObject({ key: 'notice.dusk', type: 'warn' });
    expect(notificationText(dusk)).toMatch(/^Dusk/);
    useGameStore.setState({ locale: 'zh-CN' });
    expect(notificationText(dusk)).toBe('黄昏将至，夜幕即将降临，快做好防御！');
    expect(notificationText(toNotification('Looted: Bone'))).toBe('Looted: Bone');
  });

  it('a notice raised with `boss` is one of the dragon\'s calls, and carries the mark; any other does not', () => {
    expect(toNotification('notice.bossAwakens', 'danger', { boss: true }).boss).toBe(true);
    expect(toNotification('notice.dusk', 'warn')).not.toHaveProperty('boss');
    expect(toNotification('Looted: Bone', 'loot', { boss: false })).not.toHaveProperty('boss');
  });
});

describe('one line, one notice at a time (the encounter column: ui/hudLayout.js toastsInEncounter)', () => {
  const plain = (id, key) => ({ id, ...toNotification(key, 'warn') });
  const call = (id, key) => ({ id, ...toNotification(key, 'danger', { boss: true }) });

  it('the newest of the dragon\'s calls, before any newer notice', () => {
    const live = [plain(1, 'notice.dusk'), call(2, 'notice.bossPhase2'), call(3, 'notice.bossPhase3'), plain(4, 'notice.dawn')];
    expect(lineNotification(live).id).toBe(3);
  });

  it('with no call up, the newest notice; with none up, nothing', () => {
    // Presence first: the same list with a call in it picks the call, so the reading below is the rule, not a blind pick.
    expect(lineNotification([plain(1, 'notice.dusk'), call(2, 'notice.bossAwakens'), plain(3, 'notice.dawn')]).id).toBe(2);
    expect(lineNotification([plain(1, 'notice.dusk'), plain(2, 'notice.dawn')]).id).toBe(2);
    expect(lineNotification([])).toBeNull();
    expect(lineNotification(undefined)).toBeNull();
  });
});
