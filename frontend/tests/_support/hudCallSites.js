import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the HUD contract's DENOMINATOR comes from.
 *
 * HUD_CALLABLE_KEYS was hand-maintained beside the selector and had drifted into being exactly the
 * selector's own function-valued keys. So the contract check asked "is every key I selected a function",
 * which the selector guarantees, and could not answer the question anyone cares about: does every handler
 * the HUD CALLS exist. It had never gone red for any of the six omissions recorded in hudState.js's own
 * comments, and a seventh (setActiveChestCoords) was live when this scanner was written.
 *
 * THIS LIVES OUTSIDE tests/gates/ ON PURPOSE. gate-shape ratchets the population of gate files that call
 * readFileSync, because a gate asserting on SOURCE TEXT is the weak shape this repo is trying to shrink --
 * and it is right to flag one. But reading source to build a denominator is not the same act as asserting
 * on source: the assertion still runs against the real, executed selector. Keeping the scan in a fixture
 * module says which of the two this is, in the one place a classifier can see.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

const CALL = /gameState\.([A-Za-z_$][\w$]*)\s*\(/g;
const ANY_USE = /gameState\.([A-Za-z_$][\w$]*)/g;
/** A file that builds its OWN slice is not a consumer of the HUD slice, whatever it calls its variable. */
const OWN_SLICE = /const\s+gameState\s*=/;

function srcFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) srcFiles(full, out);
    else if (/\.(js|jsx)$/.test(name) && !name.includes('.test.')) out.push(full);
  }
  return out;
}

/**
 * Handlers called on a `gameState` that ARRIVED AS A PROP — i.e. the HUD slice.
 *
 * GamePanels, TradingInterface and CraftingTable each build their own `const gameState =
 * useGameStore(useShallow(...))`, so their ~20 call sites are a different contract; folding them in would
 * be a scan that reports on the wrong object.
 *
 * @returns {{names: string[], files: string[]}} the handler names, and the files they were found in, so a
 * caller can assert a non-zero denominator rather than trusting a silent empty result.
 */
export function handlersCalledOnHudSlice() {
  const names = new Set();
  const files = [];
  for (const f of srcFiles()) {
    if (f.endsWith('hudState.js')) continue; // the producer, not a consumer
    const text = readFileSync(f, 'utf8');
    if (OWN_SLICE.test(text)) continue;
    const found = [...text.matchAll(CALL)].map((m) => m[1]);
    if (found.length) files.push(f);
    for (const n of found) names.add(n);
  }
  return { names: [...names].sort(), files };
}

/**
 * Every `gameState.X` MENTION anywhere in src, called or merely passed by reference.
 * `onWorldLoad={gameState.loadWorldData}` is a use; requiring the open paren reported that key as fiction.
 */
export function everyGameStateUse() {
  const names = new Set();
  for (const f of srcFiles()) {
    if (f.endsWith('hudState.js')) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(ANY_USE)) names.add(m[1]);
  }
  return [...names].sort();
}
