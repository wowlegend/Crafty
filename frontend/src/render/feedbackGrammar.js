// feedbackGrammar.js — what a mob's edge says this frame (plan docs/superpowers/plans/2026-10-27-crafty-feedback-grammar.md,
// M1). Every bright thing on a mob means something. A windup heats the ink outline and the rim's colour toward DANGER
// over the ramp squared (the coil's own ease), and the body keeps its two toon bands, so the threat reads from the edge
// at any distance, hour and tier; the old whole-body emissive flood hid the bands exactly when the mob had to be read.
// PURE: no React, no store. MobModel writes what mobLook returns into its materials' uniforms.
import * as THREE from 'three';
import { windupRamp, WINDUP_MS } from '../game/attackTelegraph.js';
import { isStaggered } from '../game/perfectDodge.js';
import { OUTLINE, RIM } from './characterStyle.js';

/** The danger colour an edge heats to. Unlit, it reaches the screen as about sRGB (0.95, 0.25, 0.13) through the
 *  Neutral tone map: danger red, and under the bloom threshold, so a mob's eyes stay its only glow. */
export const DANGER = '#ff3a00';
/** Contact (M2): the outline's colour while a hit flashes. The body's lit band goes white with it (characterStyle.js
 *  FLASH_GLSL), by the feedback dial, so reduced motion keeps the white edge alone. */
export const CONTACT = '#ffffff';
// The contact sequence. FLASH holds while the stamp is younger than FLASH_MS OR fewer than MIN_FLASH_FRAMES have been
// drawn, so a slow frame still shows one; SQUASH then holds for SQUASH_MS AND at least MIN_SQUASH_FRAMES, so it lasts
// about 50 ms at 120 Hz and at 30 fps alike (a frame count would last 25 ms on one and 100 ms on the other).
export const FLASH_MS = 70;
const MIN_FLASH_FRAMES = 1;
export const SQUASH_MS = 50;
export const MIN_SQUASH_FRAMES = 2;
const SQUASH_AMPS = [1, 0.6, 0.25]; // the squash curve's knots at a third and two thirds of its window, 0 at its end
const INK = new THREE.Color(OUTLINE.color);
const RIM_REST = new THREE.Color(RIM.color);
const HOT = new THREE.Color(DANGER);
const WHITE = new THREE.Color(CONTACT);

/** One mob's contact sequence for this frame: 'flash', 'squash' or 'rest'. `seq` is the mob's own record ({} at mount),
 *  advanced here; a new `lastHit` stamp restarts FLASH. */
export function hitSequence(seq, now, lastHit) {
  if (lastHit && lastHit !== seq.stamp) {
    // A stamp first seen a second after it was struck (a mob drawn after the hit) is spent, not replayed.
    const spent = now - lastHit > 1000;
    seq.stamp = lastHit;
    seq.flashFrames = seq.squashFrames = spent ? MIN_SQUASH_FRAMES : 0;
    seq.squashStart = spent ? lastHit : 0;
  }
  if (!seq.stamp) return 'rest';
  if (!seq.squashStart) {
    if (now - seq.stamp < FLASH_MS || seq.flashFrames < MIN_FLASH_FRAMES) { seq.flashFrames += 1; return 'flash'; }
    seq.squashStart = now;
  }
  if (now - seq.squashStart < SQUASH_MS || seq.squashFrames < MIN_SQUASH_FRAMES) { seq.squashFrames += 1; return 'squash'; }
  return 'rest';
}

/** The squash's amplitude at `now`: the SQUASH_AMPS curve across SQUASH_MS from the squash's start, 0 after it. */
export function squashAmp(seq, now) {
  const k = ((now - seq.squashStart) / SQUASH_MS) * 3;
  if (!(k >= 0) || k >= 3) return 0;
  const i = Math.floor(k);
  return SQUASH_AMPS[i] + ((SQUASH_AMPS[i + 1] ?? 0) - SQUASH_AMPS[i]) * (k - i);
}

/**
 * The look this frame, into `out` ({ phase, telegraph, flash, squash, outline: Color, rim: Color }). `now` is the wall
 * clock the hit is stamped on, `wnow` the world clock the worker stamps windupUntil on, `juice` the feedback dial
 * (0 under reduced motion), `seq` the mob's contact record. Contact beats a stagger, which beats a telegraph, which
 * beats rest. A windup ramps over the entity's own windupMs when it has one.
 */
export function mobLook(entity, now, wnow, juice, seq, out) {
  out.phase = hitSequence(seq, now, entity.lastHit);
  const flash = out.phase === 'flash';
  const live = !flash && !isStaggered(entity, wnow) && entity.windupUntil > wnow;
  const r = live ? windupRamp(wnow, entity.windupUntil, entity.windupMs ?? WINDUP_MS) : 0;
  out.telegraph = r * r;
  out.flash = flash ? juice : 0;
  out.squash = out.phase === 'squash' ? squashAmp(seq, now) * juice : 0;
  out.outline.copy(INK).lerp(HOT, out.telegraph);
  if (flash) out.outline.copy(WHITE);
  out.rim.copy(RIM_REST).lerp(HOT, out.telegraph);
  return out;
}

/** Write a look into one of a mob's materials: a drei <Outlines> hull takes the edge colour, a rim material the rim
 *  colour and the flash; anything else (the eyes, the cover aura) is left alone. Never the colour or the emissive, so
 *  every part keeps its authored tone and an authored glow. */
export function applyMobLook(m, look) {
  if (m.uniforms?.thickness) m.uniforms.color.value.copy(look.outline);
  else if (m.userData?.rim) {
    m.userData.rim.uRimColor.value.copy(look.rim);
    m.userData.rim.uFlash.value = look.flash;
  }
}
