// hdrGain.js — lifting a colour past the composer's bloom threshold (feedback-grammar plan M4).
//
// A material's toneMapped flag does nothing in this scene: three tone-maps a material only when it renders straight to
// the screen (WebGLPrograms, currentRenderTarget === null), and the scene always renders into the composer's half-float
// buffer, tone-mapped once after Bloom. So what makes a colour bloom is its LUMINANCE in that buffer: a gain on the
// colour. The weights are the ones three hands every shader's luminance() (ColorManagement.getLuminanceCoefficients,
// Rec. 709 in the linear working space), which is what the bloom pass's threshold compares against.
import * as THREE from 'three';

/** The composer's bloom threshold (GameScene <Bloom luminanceThreshold>): the one home for the number. */
export const BLOOM_THRESHOLD = 0.65;

const W = THREE.ColorManagement.getLuminanceCoefficients(new THREE.Vector3());

/** A linear colour's luminance, by the bloom pass's own weights. */
export const linearLuminance = (c) => W.x * c.r + W.y * c.g + W.z * c.b;

/** The gain that lifts `hex` to `threshold * margin` luminance. */
export const hdrGain = (hex, threshold, margin) => (threshold * margin) / linearLuminance(new THREE.Color(hex));
