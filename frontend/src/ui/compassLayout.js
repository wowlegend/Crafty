// compassLayout.js — where each compass marker and its label sit on the strip (the HUD lane's task script, decision 4).
//
// The strip shows the half of the horizon ahead: a bearing `fov / 2` either side of the heading maps to the strip's
// edges. Labels are wider than their pips, so two markers a few degrees apart (HOME and an NPC at the Hearth) would print
// one label over the other. Each label is placed in priority order, and a later one whose box would come within GAP_PX
// of a placed label yields: its label is hidden, its pip stays, so the direction is still shown.

/** Marker kinds, most important first: a later kind's label yields to an earlier one's. */
export const COMPASS_PRIORITY = Object.freeze(['boss', 'home', 'shrine', 'blight', 'npc', 'chest', 'cardinal']);
/** The least clear space between two shown labels, px. */
export const GAP_PX = 4;

/** An angle in radians wrapped to [-PI, PI). */
export function wrapAngle(a) {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** The compass bearing (radians; 0 north, -Z; clockwise) from (px, pz) to (x, z), the convention the heading uses. */
export const bearingTo = (x, z, px, pz) => Math.atan2(x - px, -(z - pz));

/** How a hub NPC is named on the strip: the part of its name before " the " ("Mara the Smith" reads "Mara"). */
export const npcShortName = (name) => String(name ?? '').split(' the ')[0];

/**
 * Lay out `markers` ([{ id, kind, bearing, labelWidth }]) on a strip `stripPx` wide facing `heading` with a field of
 * view `fov` (radians). Returns the markers in view, in priority order, as [{ id, kind, x, labelX, labelVisible }]:
 * `x` is the pip's position, `labelX` the label's centre, clamped so the label stays on the strip.
 */
export function layoutCompass(markers, { heading, fov, stripPx, gap = GAP_PX }) {
  const half = fov / 2;
  const rank = (k) => {
    const i = COMPASS_PRIORITY.indexOf(k);
    return i < 0 ? COMPASS_PRIORITY.length : i;
  };
  const inView = [];
  for (const m of markers) {
    const diff = wrapAngle(m.bearing - heading);
    if (!(Math.abs(diff) < half)) continue;
    const x = (diff / half) * (stripPx / 2) + stripPx / 2;
    const w = Math.max(0, m.labelWidth || 0);
    const labelX = Math.min(Math.max(x, w / 2), stripPx - w / 2);
    inView.push({ id: m.id, kind: m.kind, x, labelX, w, order: inView.length });
  }
  inView.sort((a, b) => rank(a.kind) - rank(b.kind) || a.order - b.order);
  const placed = [];
  return inView.map((m) => {
    const clear = placed.every((p) => Math.abs(p.labelX - m.labelX) >= (p.w + m.w) / 2 + gap);
    if (clear) placed.push(m);
    return { id: m.id, kind: m.kind, x: m.x, labelX: m.labelX, labelVisible: clear };
  });
}
