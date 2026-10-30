import { describe, it, expect, afterEach } from 'vitest';
import { toNotification, admits, lineNotification, TOAST_MS } from '../../src/ui/notifications.js';
import { bossCall, bossAttackCall } from '../../src/world/bossSystem.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

/**
 * THE ONE LINE THROUGH A FIGHT (DECISIONS 2026-10-29 item 92). Where the encounter column holds one notice at a time (a
 * phone, a phone on its side: ui/hudLayout.js toastsInEncounter), the dragon's attack calls repeat all fight
 * (render/BossEntity.jsx: the fireball every 2.4 s in the first phase, the roar every 4.2 s in the second, the lava every
 * 5.2 s and the summons every 8.5 s in the third), each living 4 s. A plain notice raised in the fight (a drop, a quest, a
 * denial a repeated press must answer) holds the line for its whole life unless one of the dragon's one-off calls (its
 * arrival, return, phase changes, defeat) arrives first, and that call takes the line at once.
 *
 * The fight is simulated on the channel's own pure parts: each call is what the real helper hands the store's
 * addNotification (world/bossSystem.js bossAttackCall for the attack calls, bossCall for the one-off ones), admitted
 * by `admits` and kept TOAST_MS, as QuestSystem.jsx useQuestSystem keeps it, and the line read with `lineNotification`
 * every 10 ms. A plain notice is raised at every 10 ms offset over two periods of each cadence, after two periods of
 * fight, with no one-off call and with one 1.5 s after it.
 *
 * NOT CHECKED HERE: that render/BossEntity.jsx raises its four calls through bossAttackCall in a running world (registry
 * REVIEW:w2d:boss-attack-calls-unread), and the hook's own timers (tests/gates/notification-channel-gates.test.jsx drives
 * them).
 */
const STEP = 10;
const PLAIN = ['Mob dropped: Bone', 'loot', undefined];

/** What `raise(key, type)` hands the store's addNotification: [message, type, opts]. */
const handed = (raise, key, type) => {
  let got = null;
  useGameStore.setState({ addNotification: (...a) => { got = a; } });
  raise(key, type);
  return got;
};
afterEach(() => useGameStore.setState({ addNotification: undefined }));

/** The channel's live list as useQuestSystem keeps it: admitted by `admits`, each kept TOAST_MS from when it was raised. */
function channel() {
  const recent = new Map();
  let live = [];
  let id = 0;
  return {
    add(now, [message, type, opts]) {
      const n = toNotification(message, type, opts);
      if (!admits(recent, n.dedupe, now)) return null;
      if (n.dedupe != null) recent.set(n.dedupe, now);
      const entry = { id: id++, ...n, timestamp: now };
      live = [...live, entry];
      return entry;
    },
    expire(now) { live = live.filter((x) => now - x.timestamp < TOAST_MS); },
    line: () => lineNotification(live),
    live: () => live,
  };
}

/** A fight from t = 0 with each attack call raised every `period` ms, a plain notice at `tp` and, if given, a one-off call
 *  at `oneOffAt`: how long the plain notice held the line, and what the line showed when the one-off call was raised. */
function fight(attacks, tp, oneOff = null, oneOffAt = null) {
  const end = tp + TOAST_MS;
  const events = [];
  for (const a of attacks) for (let t = 0; t <= end; t += a.period) events.push({ at: t, call: a.call });
  events.push({ at: tp, call: PLAIN, plain: true });
  if (oneOff) events.push({ at: oneOffAt, call: oneOff });
  events.sort((x, y) => x.at - y.at);
  const ch = channel();
  let plain = null, lost = null, atOneOff = null, i = 0;
  for (let t = 0; t <= end; t += STEP) {
    ch.expire(t);
    while (i < events.length && events[i].at <= t) {
      const e = events[i++];
      const n = ch.add(t, e.call);
      if (e.plain) plain = n;
    }
    const line = ch.line();
    if (t === oneOffAt) atOneOff = line;
    if (plain && lost === null && line !== plain) lost = t;
  }
  return { hold: (lost ?? end) - tp, atOneOff };
}

const FIGHTS = [
  { name: 'phase 1, the fireball every 2.4 s', attacks: [['notice.bossFireball', 'warning', 2400]] },
  { name: 'phase 2, the roar every 4.2 s', attacks: [['notice.bossRoar', 'danger', 4200]] },
  { name: 'phase 3, the lava every 5.2 s', attacks: [['notice.bossLava', 'danger', 5200]] },
  { name: 'phase 3, the summons every 8.5 s', attacks: [['notice.bossSummon', 'warning', 8500]] },
  { name: 'phase 3, the lava and the summons together', attacks: [['notice.bossLava', 'danger', 5200], ['notice.bossSummon', 'warning', 8500]] },
];
const ONE_OFF_AFTER = 1500;

describe('a plain notice raised in a fight holds the one line', () => {
  it('for its whole life, or until a one-off call, at every offset over two periods of each attack cadence', () => {
    const oneOff = handed(bossCall, 'notice.bossPhase2', 'danger');
    let checked = 0, want = 0;
    const short = [], report = [];
    for (const f of FIGHTS) {
      const attacks = f.attacks.map(([key, type, period]) => ({ period, call: handed(bossAttackCall, key, type) }));
      const period = Math.max(...attacks.map((a) => a.period));
      want += 2 * (2 * period / STEP);
      let min = Infinity, max = -Infinity;
      for (let o = 0; o < 2 * period; o += STEP) {
        const tp = 2 * period + o;
        const alone = fight(attacks, tp);
        min = Math.min(min, alone.hold); max = Math.max(max, alone.hold);
        if (alone.hold < TOAST_MS) short.push(`${f.name}, raised ${o} ms in: held ${alone.hold} ms of ${TOAST_MS}`);
        const cut = fight(attacks, tp, oneOff, tp + ONE_OFF_AFTER);
        if (cut.hold < ONE_OFF_AFTER) short.push(`${f.name}, raised ${o} ms in, a phase call ${ONE_OFF_AFTER} ms later: held ${cut.hold} ms`);
        if (cut.atOneOff?.key !== 'notice.bossPhase2') short.push(`${f.name}, raised ${o} ms in: the phase call did not take the line at once (${cut.atOneOff?.key ?? cut.atOneOff?.text ?? null})`);
        checked += 2;
      }
      report.push(`${f.name}: held ${min}-${max} ms`);
    }
    console.log(`boss attack line: ${checked} fights; ${report.join('; ')}`);
    expect(checked).toBe(want);
    expect(checked).toBe(2 * (480 + 840 + 1040 + 1700 + 1700));
    expect(short.length, `${short.length} of ${checked} fights cut a plain notice short (${report.join('; ')}); first: ${short.slice(0, 4).join(' | ')}`).toBe(0);
  });

  it('with no other notice up, each attack call takes the line while it lives', () => {
    // Presence for the reading above: the attack calls still show; a rule that dropped them would hold the plain notice too.
    let checked = 0;
    for (const f of FIGHTS) {
      const attacks = f.attacks.map(([key, type, period]) => ({ period, key, call: handed(bossAttackCall, key, type) }));
      const ch = channel();
      const end = 2 * Math.max(...attacks.map((a) => a.period)) + TOAST_MS;
      for (let t = 0; t <= end; t += STEP) {
        ch.expire(t);
        for (const a of attacks) if (t % a.period === 0) ch.add(t, a.call);
        const live = ch.live();
        if (!live.length) continue;
        expect(ch.line(), `${f.name} at ${t} ms`).toBe(live[live.length - 1]);
        checked++;
      }
    }
    expect(checked, 'no tick had an attack call up').toBeGreaterThan(1000);
  });
});
