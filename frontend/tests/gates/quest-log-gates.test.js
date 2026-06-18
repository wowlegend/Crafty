import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('quest log gates', () => {
  const ql = read('ui/QuestLog.jsx');
  it('uses the shared Modal primitive (focus-trap/Escape parity, like AchievementsPanel)', () => {
    expect(ql).toMatch(/Modal/);
  });
  it('renders lore + giver + objective per active quest', () => {
    expect(ql).toMatch(/lore/);
    expect(ql).toMatch(/giver/);
  });
  it('store has a showQuestLog flag + L opens it', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/showQuestLog:/);
    expect(read('InputManager.jsx')).toMatch(/KeyL/);
  });
  // Live architecture: the store-driven modal panels mount in MenuSystem.jsx's
  // AnimatePresence block (HUD.jsx holds only the always-on HUD), so QuestLog
  // mounts there alongside AchievementsPanel/Inventory.
  it('MenuSystem mounts QuestLog inside the panel AnimatePresence block', () => {
    expect(read('MenuSystem.jsx')).toMatch(/QuestLog/);
  });
});
