// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { installNoticeLog } from '../../scripts/visual/_firstNight.mjs';

/**
 * THE NOTICE LOG COUNTS NOTICES, NOT INSERTIONS (scripts/visual/_firstNight.mjs installNoticeLog; DECISIONS 2026-11-01
 * (W3-A PR C) item 490). tests/e2e/first-night.spec.js and scripts/visual/first-night.mjs count horns and lines with it,
 * and a toast mounted again (a single line handing back to it, a layout change, the boss bar taking the line) used to
 * count twice, which would turn "one horn" red on a correct game. Driven here on a real DOM: the same id added three
 * ways is one notice, two ids are two, and an element with no key is not a notice.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 1 test, each observed RED:
 *   N1 the id ignored (every insertion logged, the phase-1 shape) -> "one notice, however often it is added"
 *   N2 plausible-wrong: deduplicated by key, so a second real notice of one key is lost -> "two ids are two notices"
 *   N3 the nested scan dropped (only the added node itself read) -> "a notice inside an added subtree"
 *   I0 identity (a comment edit in _firstNight.mjs) SURVIVED.
 *
 * NOT CHECKED HERE: that the game puts the ids on its toasts (QuestSystem.jsx NotificationStack, ui/BossHealthBar.jsx);
 * the e2e beats read them in the running game.
 */
const tick = () => new Promise((r) => setTimeout(r, 0));
const toast = (key, id) => {
  const el = document.createElement('div');
  el.setAttribute('data-notification-key', key);
  if (id !== undefined) el.setAttribute('data-notification-id', String(id));
  return el;
};

beforeAll(() => installNoticeLog());

describe('the notice log', () => {
  it('one notice, however often it is added; two ids are two notices; a notice inside an added subtree; no key, no notice', async () => {
    const stack = document.createElement('div');
    document.body.appendChild(stack);
    stack.appendChild(toast('notice.siege.first', 7));
    await tick();
    stack.replaceChildren(toast('notice.siege.first', 7)); // the same notice, mounted again
    await tick();
    const bar = document.createElement('div');
    bar.appendChild(toast('notice.siege.first', 7)); // and again, as the boss bar's line, inside its subtree
    document.body.appendChild(bar);
    await tick();
    expect(window.__fnNotices.map((n) => n.key), 'one notice, however often it is added').toEqual(['notice.siege.first']);
    stack.appendChild(toast('notice.siege.first', 8)); // a second real notice of the same key
    const wrap = document.createElement('section');
    wrap.appendChild(toast('notice.dawn', 9));
    document.body.appendChild(wrap);
    stack.appendChild(toast('', 10));
    await tick();
    expect(window.__fnNotices.map((n) => `${n.key}#${n.id}`), 'two ids are two notices; a notice inside an added subtree')
      .toEqual(['notice.siege.first#7', 'notice.siege.first#8', 'notice.dawn#9']);
  });
});
