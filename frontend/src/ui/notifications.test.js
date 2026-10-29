import { describe, it, expect, afterEach } from 'vitest';
import { toNotification, admits, notificationText, TOAST_MS } from './notifications.js';
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
});
