// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from '../../src/audio/synthVoices.js';
import { VictoryOverlay } from '../../src/GameSystems.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, '../../src', p), 'utf8');

// SFX Slice 4 — the CLIMAX payoff was SILENT. VictoryOverlay (Blight Heart shattered -> the win screen,
// the single biggest beat in the game) was purely presentational and fired no sound. A dedicated
// triumphant `victory` voice is now wired on the overlay's mount through the codebase's window.* sound
// bridge, the same pattern window.playFanfare and window.playLevelUpSound use.
//
// THE OLD GATE FOUND 'VictoryOverlay' IN THE SOURCE AND READ THE NEXT 600 CHARACTERS. A proximity slice
// is a measurement of FORMATTING: adding a comment, extracting a helper, or moving the effect below the
// JSX all break it while the sound still plays, and moving an unrelated `window.playVictory` into that
// window satisfies it while the overlay stays silent. The overlay renders in jsdom, and the bridge is a
// property on `window`, so the actual question — does mounting it make the sound fire — is one render.
afterEach(() => { cleanup(); delete window.playVictory; });

describe('the victory climax actually fires its sting', () => {
  it('mounting the overlay calls the bridged victory sound, exactly once', () => {
    const playVictory = vi.fn();
    window.playVictory = playVictory;
    render(createElement(VictoryOverlay, { onDismiss: () => {} }));
    expect(playVictory, 'the win screen is silent — the biggest beat in the game fires no sound').toHaveBeenCalledTimes(1);
  });

  it('a re-render does not re-fire it', () => {
    // `[]` deps. A sting that retriggers on every render turns the win screen into a stutter.
    const playVictory = vi.fn();
    window.playVictory = playVictory;
    const { rerender } = render(createElement(VictoryOverlay, { onDismiss: () => {} }));
    rerender(createElement(VictoryOverlay, { onDismiss: () => {} }));
    rerender(createElement(VictoryOverlay, { onDismiss: () => {} }));
    expect(playVictory).toHaveBeenCalledTimes(1);
  });

  it('renders without the bridge present — audio can be unavailable', () => {
    // Capture mode and a headless run both have no audio context, so window.playVictory is simply absent.
    // An unguarded call there would blank the win screen with a TypeError.
    delete window.playVictory;
    expect(() => render(createElement(VictoryOverlay, { onDismiss: () => {} }))).not.toThrow();
  });

  it('and the overlay it fires from is really the win screen', () => {
    // The presence case: a component that rendered nothing would satisfy the assertions above while the
    // player saw no victory screen at all.
    window.playVictory = vi.fn();
    const { container } = render(createElement(VictoryOverlay, { onDismiss: () => {} }));
    expect(container.textContent, 'the victory overlay renders no VICTORY headline').toContain('VICTORY');
  });
});

describe('the sound the sting resolves to is real', () => {
  it('a victory voice is registered and synthesises', () => {
    expect(typeof VOICES.victory, 'no victory voice — playVictory would resolve to nothing').toBe('function');
  });

  it('SoundManager exposes playVictory, wired to that voice', () => {
    // Textual, deliberately and narrowly: SoundManager is a provider whose verbs are built inside a hook,
    // and the thing being checked is a single key-to-voice mapping. Anchored to the mapping form rather
    // than to a proximity window, so formatting cannot move it.
    expect(read('SoundManager.jsx')).toMatch(/playVictory:\s*\(\)\s*=>\s*playSound\(['"]victory['"]\)/);
  });

  it('App publishes it onto the window the overlay reads', () => {
    // The bridge's other end. Without this the overlay calls a property nobody ever set — which is
    // exactly the shape of the four "shipped, compiling, gated green, never RUNNING" defects in the log.
    expect(read('App.jsx')).toMatch(/window\.playVictory\s*=/);
  });
});
