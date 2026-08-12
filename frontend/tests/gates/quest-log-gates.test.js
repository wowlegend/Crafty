// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestLog } from '../../src/ui/QuestLog.jsx';
import { KEY_MAP } from '../../src/game/keyMap.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, '../../src', p), 'utf8');

// THE QUEST LOG, RENDERED INSTEAD OF GREPPED.
//
// This gate matched three bare substrings against QuestLog.jsx: /Modal/, /lore/ and /giver/. Every one
// is satisfied by an import line, a comment, a prop name in a destructure, or a CSS class that happens
// to contain the letters — and none of them says whether a quest's lore or giver ever reaches the
// screen. The panel is a read-only narrative surface whose ENTIRE purpose is to display those two
// fields, so "the file mentions lore" is as close to zero evidence as a gate gets.
//
// It is plain jsdom-renderable and takes its quests as a prop, so it just gets rendered.
const QUESTS = [
  {
    id: 'q1', title: 'First Blood', icon: 'sword', giver: 'Mara the Smith',
    lore: 'Something stirs beyond the gate, and it is not a wolf.',
    description: 'Cut down the first horror at the gate', progress: 0, target: 1, completed: false,
  },
  {
    id: 'q2', title: 'Hunter', icon: 'sword', giver: 'Warden Ilse',
    lore: 'The pack thins when the pack leader falls.',
    description: 'Thin the frontier pack — defeat 5', progress: 3, target: 5, completed: false,
  },
  { id: 'q3', title: 'Builder', description: 'Raise the outpost walls', progress: 20, target: 20, completed: true },
];

afterEach(cleanup);

describe('the quest log DISPLAYS the narrative fields it exists for', () => {
  it('renders every active quest, not just the first', () => {
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    for (const q of QUESTS) {
      expect(screen.getByText(q.title), `"${q.title}" is missing from the log`).toBeTruthy();
    }
  });

  it('shows each quest GIVER — the field a /giver/ grep could not see', () => {
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    expect(screen.getByText('Mara the Smith')).toBeTruthy();
    expect(screen.getByText('Warden Ilse')).toBeTruthy();
  });

  it('shows each quest LORE line', () => {
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    expect(screen.getByText(/Something stirs beyond the gate/)).toBeTruthy();
    expect(screen.getByText(/The pack thins/)).toBeTruthy();
  });

  it('omits giver and lore cleanly when a quest has neither', () => {
    // The negative case. A panel that printed "undefined" for the third quest would satisfy every
    // assertion above — and that is a real shape, since only authored quests carry lore; the endless
    // bounty fallback does not.
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    expect(screen.getByText('Builder')).toBeTruthy();
    expect(screen.queryByText(/undefined/i), 'a quest without lore renders the word "undefined"').toBeNull();
  });

  it('renders each objective and its progress', () => {
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    expect(screen.getByText(/Thin the frontier pack/)).toBeTruthy();
    expect(screen.getByText('3 / 5'), 'the progress readout is missing or wrong').toBeTruthy();
    expect(screen.getByText('20 / 20')).toBeTruthy();
  });

  it('says something useful when there are NO quests, rather than rendering an empty box', () => {
    const { container } = render(createElement(QuestLog, { quests: [], onClose: () => {} }));
    expect(container.textContent.length, 'an empty log paints nothing at all').toBeGreaterThan(20);
  });
});

describe('the quest log is a real modal, closable the ways a modal must be', () => {
  it('uses the shared Modal primitive — asserted by its ROLE, not by the word "Modal"', () => {
    // What the /Modal/ grep was reaching for: the shared modal grammar. The primitive's observable
    // contract is the dialog role plus aria-modal, neither of which an import line or a comment can fake.
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('Tab is TRAPPED inside it — the contract the Modal primitive actually provides', () => {
    // Measured while writing this: the Modal primitive handles ONLY Tab. It does not listen for Escape
    // at all, so the old gate's comment ("focus-trap/Escape parity") was half wrong — Escape closes
    // panels globally from InputManager, not from the primitive. Asserting Escape here would have been
    // aiming at the wrong layer; the panel's own contract is the trap.
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => {} }));
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    expect(focusables.length, 'nothing focusable inside — the trap has nothing to trap').toBeGreaterThan(0);

    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement), 'Tab escaped the modal — focus leaked to the page behind it').toBe(true);
  });

  it('and the GLOBAL Escape path clears the flag that opens it', () => {
    // The other half, at the layer that owns it: InputManager's Escape branch closes every panel, and
    // the quest log has to be in that list or Escape leaves it stranded on screen. Structural because
    // the handler needs the live store and a mounted InputManager; anchored to the setter call form.
    expect(read('InputManager.jsx'), 'Escape does not close the quest log — it would stay open')
      .toMatch(/state\.setShowQuestLog\(false\)/);
  });

  it('the close button closes it too', () => {
    let closed = 0;
    render(createElement(QuestLog, { quests: QUESTS, onClose: () => { closed++; } }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(closed).toBe(1);
  });
});

describe('the log is REACHABLE — the half a render test cannot see', () => {
  it('L is advertised in the binding table', () => {
    // Two live keybinds once shipped advertised NOWHERE (8a5e008), L among them. The keyMap suite gates
    // the advertised<->handled correspondence in both directions; this pins that the row still exists,
    // since a log nobody can open is the same as no log.
    const row = KEY_MAP.find((r) => r.code === 'KeyL');
    expect(row, 'L is no longer advertised — the quest log becomes undiscoverable').toBeTruthy();
  });

  it('the store carries the flag, and the panel is mounted where the flag is read', () => {
    // Structural by necessity — mounting MenuSystem's whole AnimatePresence block needs the live store,
    // a quest system and a canvas. Anchored to the JSX element form rather than a bare token, so a
    // mention in a comment or an unused import cannot satisfy it.
    expect(read('store/useGameStore.jsx')).toMatch(/showQuestLog:/);
    expect(read('MenuSystem.jsx'), 'QuestLog is not mounted in MenuSystem — the flag opens nothing')
      .toMatch(/<QuestLog[\s/>]/);
  });
});
