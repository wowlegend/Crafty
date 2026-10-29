// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as THREE from 'three';
import { render, cleanup } from '@testing-library/react';

/**
 * THE HANDS ARE THE COMPOSER'S FIRST PASS AFTER THE WORLD (GameScene.jsx PostFX; DECISIONS 2026-10-28 item 33).
 *
 * The viewmodel draws only if GameScene's <EffectComposer> carries its pass: @react-three/postprocessing 3.0.4 adds the
 * composer's own RenderPass first, then each child that is a Pass as a pass and each run of Effects as one EffectPass,
 * in child order (dist/index.js, the composer's layout effect), so deleting the pass from PostFX, with its import, is a
 * change only a reading of the composer's children can see. This renders the real PostFX with the composer
 * stubbed to keep the children it is handed, and reads them: the viewmodel's own pass object is the first child, ahead
 * of every effect, with GodRays mounted and without.
 * BLIND SPOT: that the package turns that child into a pass, and that the live composer calls it every frame, is
 * tests/e2e/viewmodel.spec.js.
 */
const h = vi.hoisted(() => ({ children: null }));
vi.mock('@react-three/postprocessing', async (importOriginal) => ({
  ...(await importOriginal()),
  EffectComposer: ({ children }) => {
    h.children = React.Children.toArray(children);
    return null;
  },
}));
// GameScene's other imports load at module scope; two of them cannot in jsdom (Terrain spawns a Worker at import).
vi.mock('../../src/world/Terrain', () => ({ MinecraftWorld: () => null }));
vi.mock('../../src/Components', () => ({ Player: () => null }));

const { PostFX } = await import('../../src/GameScene.jsx');
const { getViewmodel } = await import('../../src/render/viewmodel.js');

/** The composer's children, named: the viewmodel pass by identity, a JSX tag by its string, a component by its name. */
const named = () => h.children.map((c) => {
  if (c.type === 'primitive') return c.props.object === getViewmodel().pass ? 'viewmodel-pass' : 'another-primitive';
  if (typeof c.type === 'string') return c.type;
  const t = c.type.type || c.type.render || c.type; // memo and forwardRef wrap the function
  return t.displayName || t.name || 'anonymous';
});

describe('GameScene PostFX hands the composer the viewmodel pass first', () => {
  for (const withGodRays of [false, true]) {
    it(`the viewmodel's pass is the first child, ahead of every effect (GodRays ${withGodRays ? 'mounted' : 'absent'})`, () => {
      h.children = null;
      const sun = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
      render(<PostFX sunMesh={sun} withGodRays={withGodRays} />);
      cleanup();
      expect(h.children, 'SETUP: PostFX never rendered its composer').not.toBeNull();
      const names = named();
      expect(names.length, `SETUP: too few composer children to order: ${names}`).toBeGreaterThanOrEqual(6);
      expect(names.filter((n) => n === 'viewmodel-pass'), `the viewmodel pass is not in the composer: ${names}`).toHaveLength(1);
      expect(names[0], `the viewmodel pass is not the first pass after the world: ${names}`).toBe('viewmodel-pass');
    });
  }
});
