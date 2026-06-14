import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { KICK_PROFILES } from '../../src/game/cameraKick.js';

// The "signature-fires-in-prod" insurance: every camera-kick profile is actually DISPATCHED in the
// Player loop (melee/cast on the verb triggers, slam on the VOIDHAND slam, land on the landing edge).
// A refactor that drops a dispatch turns this red instead of silently killing the game-feel.
const __dir = dirname(fileURLToPath(import.meta.url));
const components = readFileSync(resolve(__dir, '../../src/Components.jsx'), 'utf8');

describe('camera-kick profiles are all dispatched (game-feel)', () => {
  it('KICK_PROFILES defines melee/cast/slam/land', () => {
    for (const k of ['melee', 'cast', 'slam', 'land']) {
      expect(KICK_PROFILES[k], `${k} profile missing`).toBeTruthy();
    }
  });
  it('Components dispatches each profile via addKick', () => {
    for (const k of ['melee', 'cast', 'slam', 'land']) {
      expect(components, `KICK_PROFILES.${k} not dispatched in Components`).toMatch(new RegExp(`KICK_PROFILES\\.${k}`));
    }
    expect(components).toMatch(/addKick\(kickRef\.current/);
  });
});
