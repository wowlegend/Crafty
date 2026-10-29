// _r3f.jsx — mount a component through R3F's OWN reconciler, with a renderer that draws nothing, and step its frames.
//
// WHY. The per-frame wiring of the sky (which value a useFrame reads, which uniform it writes) lives inside useFrame
// bodies, and the usual jsdom shape here (mock useFrame, render with react-dom) cannot run them: react-dom turns
// `<mesh ref>` into a DOM element, so a body that writes `mesh.position` throws. Here the component mounts through
// @react-three/fiber's createRoot with `frameloop: 'never'`, so every `<mesh>`, `<directionalLight>` and material is the
// real THREE object, and `step()` calls R3F's own `advance()`, which runs every useFrame subscriber in order with the
// delta it is given. Nothing is drawn (the renderer's `render` is a no-op): this sees what a frame WRITES, never pixels.
//
// USE. The mock must be declared in the test file (vi.mock is hoisted per file), before this helper is imported:
//   vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
//   const { mountR3F } = await import('./_r3f.jsx');
//
// WHY THE ESM BUILD (measured 2026-10-27). @react-three/fiber has no `exports` map, so Node loads its CJS `main`, which
// requires three's CJS build: a SECOND THREE namespace. applyProps' `instanceof THREE.Color` then fails against the ESM
// Colors the components construct, and `<meshBasicMaterial color="#FFFAF0">` is assigned as a STRING
// (`mesh.material.color.copy is not a function`). The ESM build imports the same three the components do.
// <Canvas> calls extend(THREE); a bare createRoot does not, so this does.
import * as THREE from 'three';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A renderer with the surface R3F's configure and render touch, drawing nothing. */
function fakeRenderer(canvas) {
  return {
    domElement: canvas, shadowMap: { enabled: false, type: THREE.PCFShadowMap }, xr: null,
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping, toneMappingExposure: 1,
    setPixelRatio() {}, getPixelRatio: () => 1, setSize() {}, render() {}, dispose() {},
    // drei's Outlines reads the drawing buffer's size when it mounts.
    getDrawingBufferSize: (target) => target.set(canvas.width, canvas.height),
  };
}

/**
 * Mount `element` in an R3F root. Returns { store, three(), step(n, dt), unmount() }. `step` advances the root's clock by
 * `dt` seconds per frame (default 1/60) and runs `n` frames (default 1); every useFrame sees exactly that delta.
 */
export async function mountR3F(element, { width = 800, height = 600 } = {}) {
  const { createRoot, advance, act, extend } = await import('@react-three/fiber');
  extend(THREE);
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: () => fakeRenderer(canvas), frameloop: 'never', size: { width, height, top: 0, left: 0 }, events: undefined });
  });
  let store = null;
  await act(async () => { store = root.render(element); });
  let t = 0;
  return {
    store,
    three: () => store.getState(),
    async step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        t += dt;
        await act(async () => { advance(t, true, store.getState()); });
      }
    },
    async unmount() { await act(async () => { root.unmount(); }); },
  };
}
