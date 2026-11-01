// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { World } from 'miniplex';
import { useEntities } from '../../src/systems/_npcShared';

// A REMOVED MOB IS NOT DRAWN (W3-A PR A round 2). SimplifiedNPCSystem draws one MobModel per entity in useEntities'
// list, and Nametags one tag. miniplex 2.0.0 emits onEntityRemoved BEFORE it takes the entity out of the query's
// entities (@miniplex/bucket remove), so a hook that snapshot the query at that event kept the entity it was told was
// gone: its model stayed drawn, frozen in its last pose, until the next spawn or removal. The lookbook's frame() found
// it (a mob model in view with no live mob, the round-1 review's staged captain still in the next frame). Driven on the
// real hook with a real miniplex world: what the component renders after each add and remove.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 2 tests, each RED, an identity mutant SURVIVED:
//   K15a the snapshot taken at the removal event again -> "a removed entity leaves the list at once"
//   K15b the added entity read as the one gone -> "an added entity joins the list"

afterEach(() => cleanup());

function List({ query }) {
  const entities = useEntities(query);
  return <div data-testid="ids">{entities.map((e) => e.id).sort().join(',')}</div>;
}

describe('useEntities: the list is the query, after every add and remove', () => {
  it('a removed entity leaves the list at once, whichever it is', () => {
    const world = new World();
    const q = world.with('isMob');
    const [a, b, c] = ['a', 'b', 'c'].map((id) => world.add({ id, isMob: true }));
    const { getByTestId } = render(<List query={q} />);
    expect(getByTestId('ids').textContent, 'the denominator: three mobs listed').toBe('a,b,c');
    act(() => { world.remove(c); });
    expect(getByTestId('ids').textContent, 'the last one removed').toBe('a,b');
    act(() => { world.remove(a); });
    expect(getByTestId('ids').textContent, 'a middle one removed (miniplex moves the last into its slot)').toBe('b');
    act(() => { world.remove(b); });
    expect(getByTestId('ids').textContent, 'the only one removed').toBe('');
  });

  it('an added entity joins the list beside the one there at mount', () => {
    const world = new World();
    const q = world.with('isMob');
    world.add({ id: 'a', isMob: true });
    const { getByTestId } = render(<List query={q} />);
    act(() => { world.add({ id: 'b', isMob: true }); });
    expect(getByTestId('ids').textContent).toBe('a,b');
  });
});
