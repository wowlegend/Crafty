// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/**
 * EVERY KEY THE GAME TEACHES IS A KEY IT BINDS. Three panels replaced seven (DECISIONS 2026-10-29 item 96), and a
 * footer that still says "Press L to close" or a hint that says "open Talents (U)" teaches a key that does nothing. A
 * key is named in three shapes: after "press" ("Press Tab or Esc to close", "press G to unlock"), in parentheses
 * ("in Character (Tab)"), and in Chinese after 按 ("按 J 或 Esc 关闭") or in full-width parentheses (（Tab）). Every key
 * so named must be one KEY_MAP binds (its `key`, a composite like 1–4 or WASD read as its parts; Esc and ESC are one).
 *
 * WHAT IT READS, en and zh-CN alike: every dictionary string (vars filled with samples); the rendered panels whose
 * footers name keys (the Journal's quest log, Inventory, Magic, Build, Settings) and the controls card, hint and panel;
 * deniedReason's every kind; each villager greeting; the Aspect guide and the talent trees' text.
 * NOT READ: an English literal passed straight to addNotification at a call site that is not one of these (registry
 * REVIEW:w2d:notifications-english-literals), and text drawn on a canvas.
 */
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { STRINGS } from '../../src/i18n/strings.js';
import { tIn } from '../../src/i18n/i18n.js';
import { KEY_MAP } from '../../src/game/keyMap.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { QuestLog } from '../../src/ui/QuestLog.jsx';
import { Inventory, MagicSystem, BuildingTools, SettingsPanel } from '../../src/ui/GamePanels.jsx';
import { ControlsCard, ControlsHint, ControlsPanel } from '../../src/ui/CombatInstructions.jsx';
import { deniedReason } from '../../src/game/deniedReason.js';
import { VILLAGER_GREETINGS } from '../../src/game/villagerGreetings.js';
import { ASPECT_GUIDE } from '../../src/game/aspectGuide.js';
import { ASPECT_TREES } from '../../src/game/talentTree.js';

afterEach(() => { cleanup(); useGameStore.setState({ locale: 'en' }); });

const NAME = '(?:[A-Z][A-Za-z0-9]*|\\d)';
const PRESS = new RegExp(`(?:(?<![A-Za-z])p|P)ress(?:es)?\\s+(${NAME}(?:\\s+or\\s+${NAME})*)`, 'g');
const PAREN = /[(（]\s*([A-Z]|Tab|Esc|ESC|Space|Shift|F\d{1,2})\s*[)）]/g;
const HAN_PRESS = /按\s*([A-Za-z0-9]+)(?:\s*或\s*([A-Za-z0-9]+))?/g;

/** The keys a piece of text names, as written. */
function keysNamed(text) {
  const out = [];
  for (const m of text.matchAll(PRESS)) out.push(...m[1].split(/\s+or\s+/));
  for (const m of text.matchAll(PAREN)) out.push(m[1]);
  for (const m of text.matchAll(HAN_PRESS)) out.push(m[1], ...(m[2] ? [m[2]] : []));
  return out;
}

const norm = (k) => (/^(esc|escape)$/i.test(k) ? 'ESC' : k);
/** Every key KEY_MAP binds, a composite read as its parts. */
const BOUND = new Set(KEY_MAP.flatMap((r) => {
  const k = r.key;
  if (/^\d[–-]\d$/.test(k)) { const [a, b] = k.split(/[–-]/).map(Number); return Array.from({ length: b - a + 1 }, (_, i) => String(a + i)); }
  if (k === 'WASD') return [k, ...k.split('')];
  return [norm(k)];
}));

const SAMPLE_VARS = { aspect: 'WILDHEART', key: 'R', n: 2, m: 12, level: 3, count: 3, mob: 'x', name: 'Mara', xp: 50, coins: 10,
  item: 'x', boss: 'x', roman: 'II' };
const strings = (value) => (typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(strings)
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);

/** Every source of taught text, in `locale`: [where, text]. */
function taught(locale) {
  // The hint shows once the first-run card has folded, until the panel is opened: set that, so it draws.
  useGameStore.setState({ locale, controlsSeen: false, controlsCardDone: true });
  const out = [];
  for (const [k, v] of Object.entries(STRINGS[locale])) out.push([`strings ${k}`, typeof v === 'string' ? tIn(locale, k, SAMPLE_VARS) : '']);
  const panels = [
    ['quest log', <QuestLog quests={[]} onClose={() => {}} />],
    ['inventory', <Inventory onClose={() => {}} />],
    ['magic', <MagicSystem onClose={() => {}} />],
    ['build', <BuildingTools onClose={() => {}} />],
    ['settings', <SettingsPanel onClose={() => {}} showStats={false} setShowStats={() => {}} onOpenWorldManager={() => {}} onOpenCredits={() => {}} />],
    ['controls card', <ControlsCard />],
    ['controls hint', <ControlsHint />],
    ['controls panel', <ControlsPanel onClose={() => {}} />],
  ];
  for (const [where, el] of panels) {
    const { container, unmount } = render(el);
    // Text node by text node: textContent runs neighbours together ("UsePress Tab").
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const parts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue);
    out.push([where, parts.join('\n')]);
    unmount();
  }
  for (const kind of ['no-mana', 'no-ember', 'aspect-locked', 'no-block', 'no-block-forge', 'no-talk', 'unknown']) {
    out.push([`denied ${kind}`, deniedReason(kind, kind === 'aspect-locked' ? 'WILDHEART' : '')]);
  }
  for (const k of VILLAGER_GREETINGS) out.push([`villager ${k}`, tIn(locale, k)]);
  for (const s of strings(ASPECT_GUIDE)) out.push(['aspect guide', s]);
  for (const s of strings(ASPECT_TREES)) out.push(['talent trees', s]);
  return out;
}

describe('every key a player-facing string names is a key KEY_MAP binds', () => {
  for (const locale of ['en', 'zh-CN']) {
    it(`${locale}: the panels, the notices, the denials and the villagers teach only bound keys`, () => {
      const pieces = taught(locale);
      const named = pieces.flatMap(([where, text]) => keysNamed(text).map((k) => [where, k]));
      // Presence: the instrument reads text and finds keys in it before it judges any.
      expect(pieces.filter(([w, text]) => !w.startsWith('strings') && !text.length).map(([w]) => w), 'a rendered source drew no text').toEqual([]);
      const seen = new Set(named.map(([, k]) => norm(k)));
      for (const k of ['Tab', 'J', 'ESC', 'G', 'B']) expect(seen.has(k), `${locale}: no text names ${k}; the scan is blind`).toBe(true);
      const unbound = named.filter(([, k]) => !BOUND.has(norm(k))).map(([where, k]) => `${where}: ${k}`);
      console.log(`taught-keys ${locale}: ${pieces.length} texts, ${named.length} key mentions, ${seen.size} distinct keys: ${[...seen].sort().join(' ')}`);
      expect(unbound, `${locale}: a string teaches a key nothing binds`).toEqual([]);
    });
  }

  it('the scan sees each shape a key is named in, and an unbound one', () => {
    expect(keysNamed('Press L to close • Q claims a finished quest')).toEqual(['L']);
    expect(keysNamed('Press Tab or Esc to close')).toEqual(['Tab', 'Esc']);
    expect(keysNamed('not yet unlocked — open Talents (U)')).toEqual(['U']);
    expect(keysNamed('按 J 或 Esc 关闭')).toEqual(['J', 'Esc']);
    expect(keysNamed('在角色面板（Tab）中打开天赋')).toEqual(['Tab']);
    expect(['L', 'U', 'Q', 'E', 'M'].filter((k) => BOUND.has(k)), 'a deleted key is bound again').toEqual([]);
    expect(['Tab', 'J', 'B', 'H', 'G', 'ESC', '3', 'W'].every((k) => BOUND.has(k))).toBe(true);
  });
});
