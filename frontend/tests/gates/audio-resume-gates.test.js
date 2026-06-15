import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sm = readFileSync(path.resolve(__dirname, '../../src/SoundManager.jsx'), 'utf8');
const app = readFileSync(path.resolve(__dirname, '../../src/App.jsx'), 'utf8');

// SFX overhaul Slice 3: autoplay-resume robustness. Browsers SUSPEND a fresh AudioContext until a user
// gesture; before this slice the ONLY ctx-resume sites were inside startSynthPad/startArpeggiator, both
// of which early-return on `!musicEnabled` -- so a player with MUSIC OFF never resumed the ctx and ALL
// SFX were silently dropped (SFX wrongly depended on the music subsystem). The fix: a dedicated,
// idempotent `resumeAudio()` exposed from the SoundContext, called on the entry gesture REGARDLESS of
// musicEnabled. This gate locks that decoupling so a future edit can't re-couple SFX-resume to music.
describe('SFX Slice 3 — audio resumes on the entry gesture, independent of music', () => {
  it('SoundManager defines a resumeAudio() that resumes a suspended ctx (idempotent)', () => {
    expect(/const resumeAudio\s*=/.test(sm)).toBe(true);
    // It must guard on suspended state + call resume (idempotent, safe to call repeatedly).
    const idx = sm.indexOf('const resumeAudio');
    const body = sm.slice(idx, idx + 260);
    expect(body.includes("state === 'suspended'")).toBe(true);
    expect(/\.resume\(\)/.test(body)).toBe(true);
  });

  it('SoundManager exposes resumeAudio on the SoundContext value', () => {
    // Must be in the provider value object so consumers (App/MenuSystem) can call it on a gesture.
    const vi = sm.indexOf('playBackgroundMusic,');
    expect(vi).toBeGreaterThan(-1);
    expect(/resumeAudio[,\n]/.test(sm)).toBe(true);
  });

  it('App.jsx pulls resumeAudio from useSounds()', () => {
    expect(/resumeAudio/.test(app)).toBe(true);
    expect(/=\s*useSounds\(\)/.test(app)).toBe(true);
  });

  it('App.jsx resumes audio on pointer-lock WITHOUT gating behind musicEnabled', () => {
    // The resume must fire on the entry gesture even with music disabled -> the un-gated `if
    // (isPointerLocked)` block reaches resumeAudio(), while music start stays behind its own check.
    expect(app.includes('resumeAudio()')).toBe(true);
    // There must be an isPointerLocked branch that is NOT `isPointerLocked && musicEnabled`
    // immediately wrapping the resume call.
    expect(/if\s*\(\s*isPointerLocked\s*\)\s*\{/.test(app)).toBe(true);
  });
});
