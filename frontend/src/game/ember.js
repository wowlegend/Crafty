/**
 * ember.js — the one Aspect meter (DECISIONS 2026-10-28 W1-H item 5). Pure: no store, no React.
 *
 * Day kills by the player's own hand and building by day fill it; the four Aspect verbs spend it at the prices their
 * own meters charged; dawn empties it (the store's setGameTime). Building is capped per day because, with placement
 * costed, a place-and-break loop costs nothing but clicks. Kills are not capped: each one is a fight with a live mob.
 */
import { bankForKill } from './mobBank.js';

export const EMBER_MAX = 100;

export const ROAR_COST = 100; // the roar takes a full bar
export const GRAB_COST = 25;
export const SNARE_COST = 35;
export const FUSE_COST = 50;
export const IMBUE_COST = 30;

export const PLACE_GAIN = 2; // per placement action, not per cell: a footprint is one action

// At least the dearest of the cheap verbs, so a day of building alone pays for any one grab, bind or imbue; below the
// fuse and the roar, so the free loop can never pay for those.
export const DAILY_BUILD_CAP = 40;

/** Rounded and clamped to [0, EMBER_MAX]; anything that is not a finite number reads 0. */
export function clampEmber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(EMBER_MAX, Math.round(v)));
}

export function canAfford(ember, cost) {
  return clampEmber(ember) >= cost;
}

/** What a player kill of `mobType` pays: its bank by day, nothing at night. */
export function emberForKill(mobType, isDay) {
  return isDay ? bankForKill(mobType) : 0;
}

export function emberForPlace(isDay) {
  return isDay ? PLACE_GAIN : 0;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A saved build-day record, sanitized. `night` is the night count of the day it belongs to (during day k the store's
 * nightCount reads k, so it names the day); `built` is the ember building has put in the bar that day.
 */
export function readBuildDay(raw) {
  if (!isPlainObject(raw)) return { night: 0, built: 0 };
  const night = typeof raw.night === 'number' && Number.isFinite(raw.night) ? Math.max(0, Math.floor(raw.night)) : 0;
  const built = typeof raw.built === 'number' && Number.isFinite(raw.built)
    ? Math.max(0, Math.min(DAILY_BUILD_CAP, Math.round(raw.built)))
    : 0;
  return { night, built };
}

/** How much building may still add on the day named by `night`. A record from another day counts as empty. */
export function dailyCap(record, night) {
  const r = readBuildDay(record);
  return r.night === night ? DAILY_BUILD_CAP - r.built : DAILY_BUILD_CAP;
}

/**
 * One placement action's accrual: `{ ember, record }` after it. The allowance is charged with what ENTERED the bar, so a
 * placement at a full bar spends none of it.
 */
export function accrueBuild(ember, record, night, isDay) {
  const before = clampEmber(ember);
  const gain = Math.min(emberForPlace(isDay), dailyCap(record, night));
  if (gain <= 0) return { ember: before, record: readBuildDay(record) };
  const after = clampEmber(before + gain);
  const r = readBuildDay(record);
  const built = (r.night === night ? r.built : 0) + (after - before);
  return { ember: after, record: { night, built } };
}

const RETIRED_BANKS = ['ferocityBanked', 'kineticBanked', 'soulBanked', 'resonanceBanked'];

/** The four retired Aspect banks added into one bar: each clamped as its own load clamped it, then the sum. */
export function migrateBanks(progression) {
  if (!isPlainObject(progression)) return 0;
  return clampEmber(RETIRED_BANKS.reduce((sum, key) => sum + clampEmber(progression[key]), 0));
}

/**
 * A save's ember. A save that has the key is read as is; one that predates the bar gets its four banks summed. The
 * tombstone writes the retired banks back on every save, so reading them again would refill an emptied bar.
 */
export function emberFromSave(progression, fallback = 0) {
  if (!isPlainObject(progression)) return clampEmber(fallback);
  if (Object.prototype.hasOwnProperty.call(progression, 'ember')) return clampEmber(progression.ember);
  return migrateBanks(progression);
}

/**
 * Whether pressing `verb` asks for a spend the bar cannot pay, as far as the press alone can tell. A press that releases
 * (ending a beast form, dropping a held block, disarming an imbue) is not a spend. X starts a snare or a fuse and the
 * snare is the cheaper, so below the snare's price X is short whatever it would start. Between the two prices only a fuse
 * is short, and whether X would start one (a pair near the player with a recipe) is known only to the frame loop, which
 * raises that notice itself (game/soulbind.js decideFuse, 'short').
 */
export function emberShort(verb, { ember, beastFormActive, voidhandHeld, imbueArmed } = {}) {
  switch (verb) {
    case 'roar': return !beastFormActive && !canAfford(ember, ROAR_COST);
    case 'grab': return !voidhandHeld && !canAfford(ember, GRAB_COST);
    case 'snare': return !canAfford(ember, SNARE_COST);
    case 'imbue': return !imbueArmed && !canAfford(ember, IMBUE_COST);
    default: return false;
  }
}
