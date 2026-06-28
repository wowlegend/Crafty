// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The audit flagged "attribute-point allocation buttons never E2E'd". The "+" buttons render only when
// attributePoints > 0 and call the REAL allocateAttribute store action (bumps the base attr +1, spends
// one point, re-derives max stats). This renders the REAL Inventory panel and clicks the REAL "+"
// buttons (by aria-label), asserting the store mutated. jsdom needs no SoundProvider here — Inventory
// uses store actions directly, not useGameSounds (proven by inventory-consume.test.jsx).
const g = () => useGameStore.getState();
const ORIGINAL = {
  attributes: g().attributes,
  maxHealth: g().maxHealth,
  maxMana: g().maxMana,
  playerHealth: g().playerHealth,
};
const seedPoints = (attributePoints) =>
  useGameStore.setState({ attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints } });

beforeEach(() => {
  seedPoints(3);
});
afterEach(() => {
  cleanup();
  useGameStore.setState({ ...ORIGINAL });
});

describe('Inventory attribute allocation (jsdom) — real "+" buttons spend points', () => {
  it('clicking + on Strength raises strength by 1 and spends one point', () => {
    render(<Inventory onClose={() => {}} />);
    expect(g().attributes.attributePoints).toBe(3);

    fireEvent.click(screen.getByLabelText('Allocate point to Strength'));

    expect(g().attributes.strength).toBe(11);
    expect(g().attributes.attributePoints).toBe(2);
  });

  it('allocating across attributes decrements the shared point pool each time', () => {
    render(<Inventory onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Allocate point to Agility'));
    fireEvent.click(screen.getByLabelText('Allocate point to Intellect'));

    const a = g().attributes;
    expect(a.agility).toBe(11);
    expect(a.intellect).toBe(11);
    expect(a.attributePoints).toBe(1); // 3 - 2
  });

  it('with zero points the allocate buttons are not rendered (gated on attributePoints > 0)', () => {
    seedPoints(0);
    render(<Inventory onClose={() => {}} />);

    expect(screen.queryByLabelText('Allocate point to Strength')).toBeNull();
    expect(screen.queryByLabelText('Allocate point to Agility')).toBeNull();
    expect(screen.queryByLabelText('Allocate point to Intellect')).toBeNull();
    expect(g().attributes.attributePoints).toBe(0); // unchanged
  });
});
