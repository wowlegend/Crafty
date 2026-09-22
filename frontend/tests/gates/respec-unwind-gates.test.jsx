// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { World } from 'miniplex';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { squadCapFor, BASE_SQUAD_CAP } from '../../src/game/soulbind.js';
import { releaseOverCap } from '../../src/game/allegiance.js';
import { makeImbueState, decideImbue } from '../../src/game/elemancer.js';
import { SpellUpgradePanel, RESPEC_ARM_MS } from '../../src/ui/SpellUpgradePanel.jsx';

/**
 * A RESPEC REFUNDS THE POINTS — AND ENDS WHAT THEY BOUGHT (QUEUE R1.4, R1.8).
 *
 * The C4 respec refunded every rank and derived the caps down, and its gate proved exactly that. What it
 * did not do was unwind the STATE those ranks had granted: a third ally bound under Pack Bond stayed (the
 * squad cap only gated NEW snares), and a beast form, a held grab or an armed imbue carried straight
 * through the refund. Take the talent, use it, respec, keep it — free and repeatable. And the button that
 * wipes the build sat beside the close button with no confirmation.
 *
 * Driven for real: the store action, a real miniplex world, the imbue reducer, and the panel in jsdom.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 store: respec leaves beastFormActive set                       -> store-unwind RED
 *   M2 store: respec leaves voidhandHeld set                          -> store-unwind RED
 *   M3 soulbind: Pack Bond no longer adds a slot                      -> cap RED
 *   M4 allegiance: plausible-wrong — release the STRONGEST first      -> release-order RED
 *   M5 allegiance: release nothing (early return)                     -> release RED
 *   M6 elemancer: the armed branch ignores `owned`                    -> imbue RED
 *   M7 elemancer: plausible-wrong — `!ctx.owned` (disarms old callers) -> imbue back-compat RED
 *   M8 panel: one press commits                                       -> two-press RED
 *   M9 panel: the arm never expires                                   -> disarm-timeout RED
 *
 * BLIND SPOT: SquadAISystem's frame loop is an R3F useFrame and is not rendered here; that it CALLS
 * releaseOverCap with squadCapFor is asserted structurally in talent-choice-gates, the weak kind.
 */

const s = () => useGameStore.getState();

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('R1.4 — the store unwinds live grants on respec', () => {
  beforeEach(() => {
    useGameStore.setState({
      talentPoints: 0,
      unlockedTalents: { wildheart_vigor: 1, wildheart_roar: 1, voidhand_grasp: 1 },
      beastFormActive: true, activeBeastForm: 'fire', beastCharging: false,
      voidhandHeld: true, heldPhantom: { color: '#A9966E' },
    });
  });

  it('a beast form and a held grab both end when the talents that granted them are refunded', () => {
    s().respecTalentPoints();
    expect(s().unlockedTalents).toEqual({});
    expect(s().talentPoints).toBe(3);
    expect(s().beastFormActive, 'the form outlived its talent').toBe(false);
    expect(s().activeBeastForm).toBe(null);
    expect(s().voidhandHeld, 'the grab outlived its talent').toBe(false);
    expect(s().heldPhantom).toBe(null);
  });
});

describe('R1.4 — the squad cap is an invariant, not a gate on new binds', () => {
  it('Pack Bond adds exactly one slot to the base', () => {
    expect(squadCapFor({})).toBe(BASE_SQUAD_CAP);
    expect(squadCapFor(undefined)).toBe(BASE_SQUAD_CAP);
    expect(squadCapFor({ soulbind_pack: 1 })).toBe(BASE_SQUAD_CAP + 1);
  });

  function squad() {
    const world = new World();
    const add = (id, maxHealth, extra = {}) => world.add({ id, isAlly: true, type: 'wolf', position: { x: 0, y: 0, z: 0 }, maxHealth, ...extra });
    add('a', 60); add('b', 20); add('hy', 10, { hybridId: 'emberwolf' });
    return { world, allies: world.with('isAlly', 'position', 'type') };
  }

  it('over the cap, the weakest PLAIN bind departs first — a fused hybrid is kept', () => {
    const { world, allies } = squad();
    const gone = releaseOverCap(world, allies.entities, 2);
    expect(gone.map((e) => e.id)).toEqual(['b']);
    expect(allies.entities.map((e) => e.id).sort()).toEqual(['a', 'hy']);
  });

  it('at or under the cap, nobody leaves', () => {
    const { world, allies } = squad();
    expect(releaseOverCap(world, allies.entities, 3)).toEqual([]);
    expect(allies.entities).toHaveLength(3);
  });

  it('the respec path end to end: Pack Bond refunded -> the cap falls -> the third ally departs', () => {
    const { world, allies } = squad();
    useGameStore.setState({ talentPoints: 0, unlockedTalents: { soulbind_snare: 1, soulbind_pack: 1 } });
    expect(releaseOverCap(world, allies.entities, squadCapFor(s().unlockedTalents))).toEqual([]);
    s().respecTalentPoints();
    releaseOverCap(world, allies.entities, squadCapFor(s().unlockedTalents));
    expect(allies.entities).toHaveLength(BASE_SQUAD_CAP);
  });
});

describe('R1.4 — an armed imbue disarms when the talent is gone', () => {
  const armed = { ...makeImbueState(), armed: true };
  const ctx = { imbueEdge: false, castFired: false, active: true, alive: true, canIgnite: true };

  it('owned:false disarms the stance', () => {
    expect(decideImbue(armed, { ...ctx, owned: false })).toEqual({ sm: { armed: false }, action: 'disarm' });
  });

  it('owned absent (an older caller) is NOT read as false — the stance holds', () => {
    expect(decideImbue(armed, ctx).action).toBe('none');
    expect(decideImbue(armed, { ...ctx, owned: true }).action).toBe('none');
  });
});

describe('R1.8 — respec takes two presses', () => {
  beforeEach(() => {
    useGameStore.setState({ talentPoints: 0, unlockedTalents: { wildheart_vigor: 1 } });
  });

  it('the first press arms (and changes the label); only the second respecs', () => {
    render(<SpellUpgradePanel onClose={() => {}} />);
    const btn = screen.getByTestId('talent-respec');
    fireEvent.click(btn);
    expect(s().unlockedTalents, 'one press wiped the build').toEqual({ wildheart_vigor: 1 });
    expect(btn.getAttribute('data-armed')).toBe('true');
    expect(btn.textContent).toMatch(/Confirm/);
    fireEvent.click(btn);
    expect(s().unlockedTalents).toEqual({});
    expect(s().talentPoints).toBe(1);
  });

  it('an armed press disarms itself — a stray first press is never cashed later', () => {
    vi.useFakeTimers();
    render(<SpellUpgradePanel onClose={() => {}} />);
    const btn = screen.getByTestId('talent-respec');
    fireEvent.click(btn);
    act(() => { vi.advanceTimersByTime(RESPEC_ARM_MS + 50); });
    expect(btn.getAttribute('data-armed')).toBe('false');
    fireEvent.click(btn); // this is a FIRST press again
    expect(s().unlockedTalents).toEqual({ wildheart_vigor: 1 });
  });
});
