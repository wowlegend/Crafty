import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('hub render gates', () => {
  const hub = strip(read('render/HubRender.jsx'));
  it('renders via voxelKit Cube (locked toon art direction, NOT PBR)', () => {
    expect(hub).toMatch(/<Cube\b/);
    expect(hub).not.toMatch(/metalness|roughness/);
  });
  it('iterates HUB_BUILDINGS (the deterministic layout)', () => {
    expect(hub).toMatch(/HUB_BUILDINGS/);
  });
  it('EVERY glow is frame-driven — no render-body capture guard survives here', () => {
    // THIS ASSERTION WAS REPLACED 2026-08-11, and the reason is the point.
    //
    // It used to require `!isCaptureMode() && <Emissive>` per glow, and it was GREEN for the entire life
    // of the defect it was written to prevent. `isCaptureMode()` is a mutable module-level flag with no
    // subscription channel, so a render-body read only re-evaluates when something re-renders that
    // component — and these buildings are static: no props, nothing above them changing, mounted long
    // before the harness flips the flag. They rendered once with it false and the forge fire and lookout
    // lantern shipped straight into the deterministic baselines.
    //
    // So the old gate asserted the presence of the exact pattern that does not work. It checked the text
    // and never the behaviour, which is this repo's signature failure. The replacement requires the
    // frame-driven component instead, and the BEHAVIOUR is covered by
    // tests/gates/capture-glow-gates.test.jsx, which drives frames and asserts visibility tracks the flag.
    const glows = hub.match(/<CaptureNullGlow\b/g) || [];
    expect(glows.length, 'HubRender has no glows at all — this gate would then be vacuous').toBeGreaterThan(0);

    // No bare Emissive: it would carry no capture behaviour of its own.
    expect(hub, 'a bare <Emissive> is back in HubRender — it has no capture guard').not.toMatch(/<Emissive\b/);
    // And no render-body guard, the shape that silently failed.
    expect(hub, 'a render-body isCaptureMode() guard is back — it does not re-evaluate here').not.toMatch(/!isCaptureMode\(\)\s*&&/);
  });
  it('Terrain.jsx mounts HubRender next to HomeAnchorRender', () => {
    const terrain = read('world/Terrain.jsx');
    expect(terrain).toMatch(/<HubRender\b/);
  });
});
