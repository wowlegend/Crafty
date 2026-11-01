#!/usr/bin/env node
/**
 * command-record.mjs — writes the Command Record page, docs/superpowers/command-record.html, from its facts,
 * docs/superpowers/command-record.json (DECISIONS 2026-10-31 items 280 and 281).
 *
 * THE SHAPE. On top, the glance: five sections, each one big drawing with one short line (item 280). Below a ground
 * line, the details: one fact a row, for Kevin to scroll into (item 281): what landed by day, the bug hunt, the calls
 * made, what is in flight, health and what waits on him. A refresh is a data edit plus this command.
 *
 * WHAT IT KEEPS. The as-of stamp between `<!-- asof:begin -->` and `<!-- asof:end -->` is copied from the page byte for
 * byte, because `artifact-currency.mjs --stamp` owns it; a page without exactly one stamp is refused, not re-stamped.
 *
 * WHAT IT READS. The data file, and memory/registry.jsonl for two sections, read from the rows' v2 fields when the page
 * is written (DECISIONS 2026-10-31 (registry v2) item 361), so they age like the rest of it: the health section's open
 * work (by severity, what waits on Kevin, closed) and "Waiting on you", which lists every open row Kevin owns, highest
 * first, grouped by lane when there is more than one. Neither is kept by hand in the data file. CI, the deploy and the PRs are read by whoever refreshes the
 * data (gh, curl) and written there with the time they were read: this script makes no network call.
 *
 * WHY `n()` IS NOT `toFixed(1)`. It rounds an exact half to even, as the coordinates on the published page were
 * written; toFixed rounds it up, which would move every x.25 by a tenth and change the drawings' bytes.
 *
 *   node scripts/ci/command-record.mjs               write the page
 *   node scripts/ci/command-record.mjs --check       exit 1 if the page is not what the data file writes
 *   node scripts/ci/command-record.mjs --out <path>  write it elsewhere (the stamp still comes from the page)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA = join(ROOT, 'docs/superpowers/command-record.json');
const PAGE = join(ROOT, 'docs/superpowers/command-record.html');
const REGISTRY = join(ROOT, 'memory/registry.jsonl');
const REPO = 'https://github.com/wowlegend/Crafty';
const BEGIN = '<!-- asof:begin -->';
const END = '<!-- asof:end -->';

const H = Math.sqrt(3) / 2;

function n(v) {
  if (Object.is(v, -0)) return '-0';
  const q = Math.abs(v) * 4;
  const s = Number.isInteger(q) && q % 4 === 1 ? `${v < 0 ? '-' : ''}${((q - 1) / 4 + 0.2).toFixed(1)}` : v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

const pts = (...p) => p.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- drawing primitives
function cube(x, y, s, m) {
  const h = H * s;
  const top = pts([x, y], [x + h, y + s / 2], [x, y + s], [x - h, y + s / 2]);
  const left = pts([x - h, y + s / 2], [x, y + s], [x, y + 2 * s], [x - h, y + 1.5 * s]);
  const right = pts([x, y + s], [x + h, y + s / 2], [x + h, y + 1.5 * s], [x, y + 2 * s]);
  let out = `<polygon class="${m}-l e" points="${left}"/><polygon class="${m}-r e" points="${right}"/>`
    + `<polygon class="${m}-t e" points="${top}"/>`;
  if (m === 'grass') {
    const b = s * 0.22;
    out += `<polygon class="grass-t" points="${pts([x - h, y + s / 2], [x, y + s], [x, y + s + b], [x - h, y + s / 2 + b])}"/>`
      + `<polygon class="grass-t3" points="${pts([x, y + s], [x + h, y + s / 2], [x + h, y + s / 2 + b], [x, y + s + b])}"/>`;
  }
  return out;
}

const tile = (x, y, s, m) => {
  const h = H * s;
  return `<polygon class="${m}-t e" points="${pts([x, y], [x + h, y + s / 2], [x, y + s], [x - h, y + s / 2])}"/>`;
};

const at = (ox, oy, s, i, j, k = 0) => [ox + (i - j) * H * s, oy + (i + j) * s / 2 - k * s];

/** Painter's order: back to front by i + j, then upward by k, then by i (a stable sort keeps the rest). */
function scene(ox, oy, s, cells) {
  const sorted = [...cells].sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2] || a[0] - b[0]);
  return sorted.map(([i, j, k, m]) => cube(...at(ox, oy, s, i, j, k), s, m)).join('');
}

function floor(ox, oy, s, ni, nj, m = 'grass') {
  let out = '';
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) out += tile(...at(ox, oy, s, i, j), s, m);
  return out;
}

const rect = (x, y, w, h, cls, rx = 0) =>
  `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(rx)}"` : ''}/>`;

/** A blocky player, feet at (x, y), 36 units tall at sc 1. */
function fig(x, y, sc = 1.0, ghost = false) {
  const w = (v) => v * sc;
  const c = (k) => (ghost ? 'ghost' : k);
  return [
    rect(x - w(5), y - w(12), w(4), w(12), c('legs')),
    rect(x + w(1), y - w(12), w(4), w(12), c('legs')),
    rect(x - w(9), y - w(25), w(3), w(11), c('skin')),
    rect(x + w(6), y - w(25), w(3), w(11), c('skin')),
    rect(x - w(6), y - w(26), w(12), w(15), c('tunic')),
    rect(x - w(5), y - w(37), w(10), w(10), c('skin')),
    rect(x - w(5), y - w(37), w(10), w(3), c('hair')),
  ].join('');
}

function check(cx, cy, r) {
  const d = `M${n(cx - r * 0.45)},${n(cy + r * 0.02)} L${n(cx - r * 0.1)},${n(cy + r * 0.36)} L${n(cx + r * 0.48)},${n(cy - r * 0.32)}`;
  return `<circle class="ok" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
    + `<path class="tick" stroke-width="${n(Math.max(2, r * 0.2))}" d="${d}"/>`;
}

/** In progress: an ember disc with a turning arrow. */
function busy(cx, cy, r) {
  const a = r * 0.5;
  const d = `M${n(cx + a)},${n(cy)} A${n(a)},${n(a)} 0 1 1 ${n(cx)},${n(cy - a)}`;
  const head = pts([cx - r * 0.02, cy - a - r * 0.2], [cx + r * 0.26, cy - a], [cx - r * 0.02, cy - a + r * 0.2]);
  return `<circle class="run" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
    + `<path class="tick" stroke-width="${n(Math.max(2, r * 0.16))}" d="${d}"/>`
    + `<polygon class="on-run" points="${head}"/>`;
}

function arrow(x1, y1, x2, y2, cls = 'go', w = 3) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = w * 3.2;
  const bx = x2 - L * Math.cos(ang);
  const by = y2 - L * Math.sin(ang);
  const p1 = [bx + L * 0.6 * Math.sin(ang), by - L * 0.6 * Math.cos(ang)];
  const p2 = [bx - L * 0.6 * Math.sin(ang), by + L * 0.6 * Math.cos(ang)];
  return `<line class="${cls}-line" stroke-width="${n(w)}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(bx)}" y2="${n(by)}"/>`
    + `<polygon class="${cls}-head" points="${pts([x2, y2], p1, p2)}"/>`;
}

function bug(cx, cy, r, kind) {
  const legs = [];
  for (const dy of [-0.35, 0.15, 0.65]) {
    const y = cy + dy * r;
    legs.push(`M${n(cx - r * 0.55)},${n(y)} L${n(cx - r * 1.15)},${n(y + r * 0.25)}`);
    legs.push(`M${n(cx + r * 0.55)},${n(y)} L${n(cx + r * 1.15)},${n(y + r * 0.25)}`);
  }
  legs.push(`M${n(cx - r * 0.2)},${n(cy - r * 1.3)} L${n(cx - r * 0.5)},${n(cy - r * 1.75)}`);
  legs.push(`M${n(cx + r * 0.2)},${n(cy - r * 1.3)} L${n(cx + r * 0.5)},${n(cy - r * 1.75)}`);
  return `<path class="bugleg-${kind}" stroke-width="${n(Math.max(1.2, r * 0.14))}" d="${legs.join(' ')}"/>`
    + `<circle class="bug-${kind}" cx="${n(cx)}" cy="${n(cy - r * 1.05)}" r="${n(r * 0.45)}"/>`
    + `<ellipse class="bug-${kind}" cx="${n(cx)}" cy="${n(cy + r * 0.1)}" rx="${n(r * 0.72)}" ry="${n(r)}"/>`
    + `<line class="bugsplit" stroke-width="${n(Math.max(1, r * 0.1))}" x1="${n(cx)}" y1="${n(cy - r * 0.7)}" x2="${n(cx)}" y2="${n(cy + r * 1.05)}"/>`;
}

const text = (x, y, s, size, cls = 'lbl', anchor = 'middle') =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="${anchor}">${esc(s)}</text>`;

const svg = (vb, label, body, cls = 'art') => `<svg class="${cls}" viewBox="${vb}" role="img" aria-label="${esc(label)}">${body}</svg>`;

function sparkle(cx, cy, r, cls = 'gold-t') {
  const p = pts([cx, cy - r], [cx + r * 0.25, cy - r * 0.25], [cx + r, cy], [cx + r * 0.25, cy + r * 0.25],
    [cx, cy + r], [cx - r * 0.25, cy + r * 0.25], [cx - r, cy], [cx - r * 0.25, cy - r * 0.25]);
  return `<polygon class="${cls}" points="${p}"/>`;
}

// ---------------------------------------------------------------- 1. Where it stands
function picStands(d) {
  const ox = 200, oy = 84, s = 26;
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!(i === 3 && j === 3)) cells.push([i, j, 0, 'grass']);
  cells.push([3, 3, 0, 'water'], [0, 0, 1, 'stone'], [1, 0, 1, 'stone'], [0, 1, 1, 'stone'],
    [1, 1, 1, 'ember'], [0, 3, 1, 'wood'], [0, 3, 2, 'wood'], [0, 3, 3, 'leaf']);
  const h = H * s;
  const L = [ox - 4 * h, oy + 3 * s];
  const F = [ox, oy + 5 * s];
  const R = [ox + 4 * h, oy + 3 * s];
  const A = [ox + 6, oy + 6.4 * s];
  const under = `<polygon class="under-l" points="${pts(L, F, [ox - 2 * h, oy + 4.6 * s], A)}"/>`
    + `<polygon class="under-r" points="${pts(F, R, [ox + 2.4 * h, oy + 4.5 * s], A)}"/>`;
  const [fx, fy] = at(ox, oy, s, 2, 2);
  const [px, py] = at(ox, oy, s, 0, 0, 1);
  const flag = `<line class="pole" x1="${n(px)}" y1="${n(py + s / 2)}" x2="${n(px)}" y2="${n(py - 34)}"/>`
    + `<polygon class="flag" points="${pts([px, py - 34], [px + 30, py - 25], [px, py - 16])}"/>`;
  const [gx, gy] = at(ox, oy, s, 1, 1, 1);
  const glow = `<circle class="glow" cx="${n(gx)}" cy="${n(gy + s / 2)}" r="30"/>`;
  const live = rect(318, 34, 118, 46, 'pill-live', 23)
    + '<circle class="live-dot" cx="346" cy="57" r="9"/>'
    + text(396, 67, d.live, 28, 'lbl on-live')
    + '<path class="wave" d="M300,40 Q290,57 300,74 M290,32 Q276,57 290,82"/>';
  const green = check(516, 120, 66) + text(516, 226, d.green, 28);
  return svg('0 0 640 250', d.alt, glow + under + scene(ox, oy, s, cells) + fig(fx, fy + s / 2, 1.0) + flag + live + green);
}

// ---------------------------------------------------------------- 2. the cards
const CARDS = {
  box() {
    const ox = 92, oy = 70, s = 22;
    let b = floor(ox, oy, s, 3, 2);
    const [gx, gy] = at(ox, oy, s, 0, 1, 1);
    const h = H * s;
    const ghost = `<polygon class="ghost" points="${pts([gx, gy], [gx + h, gy + s / 2], [gx, gy + s], [gx - h, gy + s / 2])}"/>`
      + `<polyline class="ghost" points="${pts([gx - h, gy + s / 2], [gx - h, gy + 1.5 * s], [gx, gy + 2 * s], [gx + h, gy + 1.5 * s], [gx + h, gy + s / 2])}"/>`
      + `<line class="ghost" x1="${n(gx)}" y1="${n(gy + s)}" x2="${n(gx)}" y2="${n(gy + 2 * s)}"/>`;
    const [sx, sy] = at(ox, oy, s, 0, 0, 1);
    b += cube(sx, sy, s, 'stone') + ghost;
    b += arrow(gx + 4, gy + 1.3 * s, 140, 92, 'go', 3.2);
    return b + fig(160, 116, 1.0) + check(176, 26, 14);
  },
  continue() {
    let b = rect(14, 10, 172, 120, 'night', 10);
    for (const [x, y, r] of [[34, 26, 1.6], [62, 18, 1.2], [150, 22, 1.8], [172, 40, 1.2], [126, 32, 1.1], [40, 48, 1.1]]) {
      b += `<circle class="star" cx="${x}" cy="${y}" r="${r}"/>`;
    }
    b += '<circle class="moon" cx="100" cy="30" r="10"/>';
    b += rect(42, 54, 116, 32, 'gold-btn', 8) + text(100, 76, 'Continue', 17, 'lbl on-gold');
    return b + rect(58, 94, 84, 22, 'btn-2', 6) + text(100, 109, 'New World', 11, 'lbl on-night');
  },
  dragon() {
    let b = floor(100, 78, 20, 3, 3);
    b += '<ellipse class="tell" cx="100" cy="108" rx="31" ry="15.5"/>';
    b += '<line class="breath" x1="138" y1="34" x2="104" y2="104"/>';
    b += `<polygon class="dragon-2" points="${pts([84, 36], [64, 8], [100, 31])}"/>`;
    b += '<path class="dragon" d="M74,41 Q52,44 44,60 Q58,50 76,46 Z"/>';
    b += '<ellipse class="dragon" cx="95" cy="41" rx="24" ry="8"/>';
    b += `<polygon class="dragon" points="${pts([112, 37], [127, 28], [141, 31], [131, 39], [116, 45])}"/>`;
    b += `<polygon class="dragon" points="${pts([90, 37], [110, 4], [124, 15], [106, 39])}"/>`;
    b += '<circle class="eye" cx="132" cy="31" r="1.8"/>';
    b += fig(160, 128, 0.85);
    return b + '<path class="motion" d="M140,104 h-10 M142,112 h-12 M140,120 h-9"/>';
  },
  death() {
    let b = rect(20, 24, 98, 106, 'device', 10) + rect(27, 31, 84, 92, 'night', 4);
    b += '<path class="heart" d="M69,92 C52,80 52,66 62,64 C66,63 69,66 69,69 C69,66 72,63 76,64 C86,66 86,80 69,92 Z"/>';
    b += rect(96, 12, 60, 120, 'device', 11) + rect(101, 22, 50, 100, 'night', 5);
    b += text(126, 62, 'YOU', 13, 'lbl px died') + text(126, 82, 'DIED', 13, 'lbl px died');
    b += '<path class="respawn" d="M118,100 A8,8 0 1 0 126,92"/><polygon class="respawn-head" points="124,87 131,92 124,97"/>';
    return b + check(168, 22, 14);
  },
  rock() {
    let b = '';
    const x0 = 10, y0 = 30, c = 18, r = 18;
    ['grass', 'dirt', 'stone', 'stone', 'stone', 'bedrock'].forEach((m, ri) => {
      for (let ci = 0; ci < 10; ci++) {
        const x = x0 + ci * c, y = y0 + ri * r;
        if (ci === 7 && ri < 5) {
          b += rect(x, y, c, r, 'hole');
          continue;
        }
        b += rect(x, y, c, r, `${m}-l e`);
        if (m === 'grass') b += rect(x, y, c, 5, 'grass-t');
      }
    });
    b += fig(x0 + 7 * c + 9, y0 + 5 * r, 0.5);
    b += check(x0 + 7 * c + 9 + 26, y0 + 4 * r + 2, 11);
    const gx = x0 + 2 * c + 9;
    b += fig(gx, y0 + 4 * r - 1, 0.5, true);
    b += arrow(gx, y0 + 3 * r - 6, gx, y0 + 4, 'go', 2.6);
    return b + fig(gx, y0, 0.5);
  },
  mac() {
    let b = rect(22, 10, 156, 96, 'device', 8) + rect(29, 17, 142, 82, 'screen', 3);
    b += `<polygon class="device-2" points="${pts([6, 108], [194, 108], [184, 118], [16, 118])}"/>`;
    const full = 112.0;
    b += rect(44, 34, full, 18, 'bar-before', 4);
    b += rect(44, 66, full * 4.2 / 7.7, 18, 'bar-now', 4);
    b += text(44, 30, 'before', 12, 'lbl on-screen', 'start') + text(44, 62, 'now', 12, 'lbl on-screen', 'start');
    for (let i = 1; i < 8; i++) {
      const x = 44 + i * full / 7.7;
      b += `<line class="tickline" x1="${n(x)}" y1="54" x2="${n(x)}" y2="57"/>`;
    }
    return b;
  },
  look() {
    const x = 56, y = 18, s = 38, q = 6;
    let b = cube(x, y, s, 'grass');
    for (const [dx, dy, cls] of [[-12, 14, 'grass-t2'], [8, 22, 'grass-t3'], [-2, 8, 'grass-t3'], [14, 12, 'grass-t2']]) {
      b += `<polygon class="${cls}" points="${pts([x + dx, y + dy - q / 2], [x + dx + q * H, y + dy], [x + dx, y + dy + q / 2], [x + dx - q * H, y + dy])}"/>`;
    }
    b += rect(112, 34, 80, 58, 'sky', 6);
    b += `<polygon class="hill" points="${pts([112, 92], [112, 72], [140, 60], [166, 70], [192, 62], [192, 92])}"/>`;
    b += '<circle class="sun" cx="176" cy="46" r="6"/>';
    return b + rect(117, 84, 16, 3, 'hud-a', 1.5) + rect(117, 79, 11, 3, 'hud-b', 1.5);
  },
  build() {
    let b = scene(50, 50, 22, [[0, 0, 0, 'stone'], [1, 0, 0, 'stone'], [0, 1, 0, 'stone'], [0, 0, 1, 'stone']]);
    b += '<line class="pick-handle" x1="20" y1="18" x2="52" y2="54"/>';
    b += '<path class="pick-head" d="M12,30 Q22,10 42,8 Q30,16 26,30 Z"/>';
    b += sparkle(64, 20, 6);
    b += arrow(86, 70, 116, 70, 'go', 3);
    const wx = 160, wy = 46, ws = 20;
    b += scene(wx, wy, ws, [[0, 0, 0, 'stone'], [1, 0, 0, 'stone'], [0, 1, 0, 'stone'], [1, 0, 1, 'stone']]);
    const [gx, gy] = at(wx, wy, ws, 0, 0, 1);
    const hh = H * ws;
    b += `<polygon class="ghost-gold" points="${pts([gx, gy], [gx + hh, gy + ws / 2], [gx + hh, gy + 1.5 * ws], [gx, gy + 2 * ws], [gx - hh, gy + 1.5 * ws], [gx - hh, gy + ws / 2])}"/>`;
    return b + text(44, 132, 'mine', 13) + text(158, 132, 'build', 13);
  },
};

// ---------------------------------------------------------------- 3. the bug hunt
function picBugs(d) {
  let b = text(30, 42, d.total, 26, 'lbl', 'start');
  for (let k = 0; k < Math.min(d.small, 35); k++) b += bug(46 + (k % 7) * 42, 88 + Math.floor(k / 7) * 36, 10, 's');
  b += '<line class="divider" x1="338" y1="30" x2="338" y2="240"/>';
  b += text(370, 42, d.big, 26, 'lbl', 'start');
  const spots = [[392, 110], [457, 110], [522, 110], [587, 110], [392, 196], [457, 196], [522, 196], [587, 196]];
  spots.slice(0, d.bigCount).forEach(([cx, cy], idx) => {
    b += bug(cx, cy, 24, 'b');
    b += idx >= d.fixedCount ? busy(cx + 26, cy - 30, 14) : check(cx + 26, cy - 30, 14);
  });
  b += check(376, 258, 11) + text(394, 266, d.fixed, 20, 'lbl', 'start');
  b += busy(500, 258, 11) + text(518, 266, d.busy, 20, 'lbl', 'start');
  return svg('0 0 640 284', d.alt, b);
}

// ---------------------------------------------------------------- 4. working on now
const NOW = {
  chest: () => rect(104, 64, 92, 52, 'wood-l e', 4) + rect(100, 40, 100, 28, 'wood-t e', 10)
    + rect(144, 40, 12, 76, 'gold-l') + rect(141, 62, 18, 16, 'gold-t e', 3)
    + sparkle(88, 34, 10) + sparkle(214, 50, 8) + sparkle(204, 18, 6),
  shrine: (state) => rect(186, 38, 26, 78, 'stone-l e') + rect(180, 30, 38, 12, 'stone-t e', 3)
    + '<circle class="glow" cx="199" cy="22" r="14"/><circle class="ember-t" cx="199" cy="22" r="6"/>'
    + fig(104, 116, 1.25) + fig(146, 116, 1.25)
    + `<polygon class="dragon" points="${pts([60, 52], [84, 40], [98, 46], [86, 56], [72, 60])}"/>`
    + `<polygon class="dragon-2" points="${pts([66, 50], [60, 28], [78, 44])}"/>`
    + (state === 'ok' ? check(232, 30, 13) : ''),
  // The stall's and the shrine's marker follow the cell's state: a tick only once the work is done. The stall shows a stuck bar
  // and a turning arrow while it is open and a full bar once fixed.
  stall: (state) => rect(86, 24, 128, 90, 'device', 8) + rect(93, 31, 114, 76, 'screen', 4)
    + rect(118, 42, 64, 24, 'tag tag-idle', 12) + text(150, 59, 'Start', 14, 'lbl on-tag')
    + rect(106, 80, 88, 10, 'slot-line', 5)
    + (state === 'ok' ? rect(106, 80, 88, 10, 'bar-now', 5) + check(214, 28, 13)
      : rect(106, 80, 34, 10, 'bar-before', 5) + busy(214, 28, 13)),
  slots: () => rect(118, 22, 96, 70, 'slot slot-3', 8) + rect(108, 34, 96, 70, 'slot slot-2', 8)
    + rect(98, 46, 96, 70, 'slot', 8) + rect(106, 54, 42, 30, 'sky', 4)
    + `<polygon class="hill" points="${pts([106, 84], [106, 72], [122, 64], [148, 72], [148, 84])}"/>`
    + rect(156, 58, 30, 6, 'slot-line', 3) + rect(156, 70, 22, 6, 'slot-line', 3)
    + rect(106, 92, 58, 6, 'slot-line', 3),
};

function picNow(d) {
  const origin = [[0, 0], [300, 0], [0, 240], [300, 240]];
  const b = d.cells.map((c, i) => `<g transform="translate(${origin[i][0]},${origin[i][1]})">` + NOW[c.pic](c.state)
    + rect(110, 132, 80, 30, `tag tag-${c.state}`, 15) + text(150, 153, c.tag, 17, 'lbl on-tag')
    + text(150, 196, c.lines[0], 23) + text(150, 224, c.lines[1], 23) + '</g>').join('');
  return svg('0 0 600 480', d.alt, b, 'art art-narrow');
}

// ---------------------------------------------------------------- 5. your turn
const YOU = {
  devices: () => rect(40, 40, 86, 112, 'device', 10) + rect(47, 48, 72, 96, 'night', 4)
    + rect(112, 30, 52, 108, 'device', 10) + rect(117, 40, 42, 88, 'night', 4)
    + '<circle class="tap" cx="138" cy="86" r="14"/><circle class="tap" cx="138" cy="86" r="24"/>'
    + '<circle class="tap-dot" cx="138" cy="86" r="6"/>',
  ears: () => '<path class="band" d="M52,104 V88 A48,48 0 0 1 148,88 V104"/>'
    + rect(38, 96, 26, 50, 'cup', 10) + rect(136, 96, 26, 50, 'cup', 10)
    + '<path class="wave-s" d="M74,112 Q82,121 74,130 M84,104 Q98,121 84,138"/>'
    + '<path class="wave-s" d="M126,112 Q118,121 126,130 M116,104 Q102,121 116,138"/>'
    + [[86, 40], [100, 22], [114, 46]].map(([x, y]) => `<line class="slider" x1="${x}" y1="8" x2="${x}" y2="62"/>`
      + rect(x - 6, y, 12, 8, 'knob', 2)).join(''),
  lens: () => rect(30, 34, 110, 120, 'paper', 8)
    + [70, 52, 80, 44, 64].map((w, i) => rect(44, 52 + i * 18, w, 6, 'codeline', 3)).join('')
    + '<circle class="lens" cx="124" cy="98" r="32"/>'
    + '<line class="lens-handle" x1="146" y1="122" x2="172" y2="150"/>'
    + rect(96, 8, 98, 26, 'tag tag-idle', 13) + text(145, 27, 'optional', 15, 'lbl on-tag'),
};

function picYou(d) {
  const b = d.cols.map((c, i) => {
    const cx = 100 + 200 * i;
    return `<g transform="translate(${cx - 100},0)">` + YOU[c.pic]() + '</g>' + text(cx, 196, c.lines[0], 22) + text(cx, 224, c.lines[1], 22);
  }).join('');
  return svg('0 0 600 240', d.alt, b, 'art');
}

const MATS = {
  grass: ['#6fbf4a', '#86572c', '#6a4421'], dirt: ['#a2723f', '#86572c', '#6a4421'], stone: ['#a9b2bd', '#8a939f', '#6d7581'],
  bedrock: ['#4c5361', '#3b414d', '#2d323c'], dark: ['#4c5361', '#3b414d', '#2d323c'], wood: ['#cf9f60', '#a9783f', '#875c2d'],
  leaf: ['#4f9e3a', '#3d822c', '#2f6822'], ember: ['#ffbe55', '#f2802a', '#c9581a'], gold: ['#ffd970', '#e9b43a', '#c18c1e'],
  water: ['#5eaee8', '#3f8bc8', '#2e6ea4'],
};
/** The dark palette, written twice in the page: under the media query and under [data-theme="dark"]. */
const DARK = [
  '--bg: #0d131c;', '--panel: #162030;', '--fg: #e4eaf2;', '--muted: #9ba9bc;', '--line: #273347;',
  '--accent: #f39051;', '--ok: #3fbf75;', '--on-ok: #062012;', '--run: #6a9ee6;', '--idle: #8592a6;',
  '--on-tag: #0b1220;', '--edge: rgba(0, 0, 0, 0.45);', '--hole: #0a0f17;', '--ghost: #a3b3ca;',
  '--device: #3b4555;', '--device-2: #4b5567;', '--screen: #0f1724;', '--dragon: #8463cc;',
  '--dragon-2: #64489f;', '--bug-s: #8794a8;', '--bug-b: #ff7a63;', '--live: #ff5a52;', 'color-scheme: dark;',
];
const MAT_TOKENS = Object.entries(MATS).map(([m, [t, l, r]]) => `  --${m}-t: ${t}; --${m}-l: ${l}; --${m}-r: ${r};`).join('\n');
const MAT_RULES = Object.keys(MATS)
  .map((m) => `.${m}-t { fill: var(--${m}-t); } .${m}-l { fill: var(--${m}-l); } .${m}-r { fill: var(--${m}-r); }`).join('\n');

// ---------------------------------------------------------------- the details (item 281)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PILL = { fixed: 'ok', landed: 'ok', open: 'run', 'in flight': 'run' };

function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`command-record.json: "${iso}" is not a YYYY-MM-DD day`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function link(r) {
  if (r.pr) return `<a href="${REPO}/pull/${r.pr}">#${r.pr}</a>`;
  if (r.commit) return `<a href="${REPO}/commit/${r.commit}">change</a>`;
  if (r.href) return `<a href="${esc(r.href)}">${esc(r.label)}</a>`;
  return '';
}

const pill = (state) => `<span class="pill pill-${PILL[state] ?? 'idle'}">${esc(state)}</span>`;

function rows(items, cls = '') {
  const li = items.map(({ lead, text: t, tail }) =>
    `<li><span class="lead">${lead}</span><span>${esc(t)}</span>${tail === undefined ? '' : `<span class="tail">${tail}</span>`}</li>`);
  return `<ul class="rows${cls ? ` ${cls}` : ''}">\n${li.join('\n')}\n</ul>`;
}

const sec = (id, title, sub, body) => `<section class="dsec" aria-labelledby="${id}">\n<h3 id="${id}">${esc(title)}</h3>`
  + `${sub ? `\n<p class="dsub">${esc(sub)}</p>` : ''}\n${body}\n</section>`;

function registryRows() {
  const all = readFileSync(REGISTRY, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (all.length === 0) throw new Error(`${REGISTRY}: no rows, so there is nothing to count`);
  return all;
}

const SEVERITY_RANK = Object.freeze({ HIGH: 0, MED: 1, LOW: 2 });
const liveWork = (rows) => rows.filter((r) => (r.state === 'open' || r.state === 'in-flight') && r.kind !== 'lane');

/** PURE. The health section's open-work row: the open work rows (lanes are not work) by severity, in 15 words or fewer. */
export function openWorkRow(rows) {
  const work = liveWork(rows);
  const n = (f) => work.filter(f).length;
  const closed = rows.filter((r) => r.state === 'closed').length;
  return {
    lead: 'Open work',
    text: `${work.length} open: ${n((r) => r.severity === 'HIGH')} high, ${n((r) => r.severity === 'MED')} medium, `
      + `${n((r) => r.severity === 'LOW')} low; ${n((r) => r.owner === 'Kevin')} wait on you; ${closed} closed.`,
  };
}

/** What a Kevin row asks of him, by its kind, in one word. */
const ASK = Object.freeze({ decision: 'Decide', instrument: 'Check', process: 'Do' });

/** PURE. "Waiting on you": every open row Kevin owns, highest first, as [{lane, rows: [{what, why}]}] by lane. */
export function waitingRows(rows) {
  const byLane = new Map();
  const mine = liveWork(rows).filter((r) => r.owner === 'Kevin')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of mine) {
    if (!byLane.has(r.lane)) byLane.set(r.lane, []);
    byLane.get(r.lane).push({ what: ASK[r.kind] ?? 'Look', why: r.title });
  }
  return [...byLane].map(([lane, list]) => ({ lane, rows: list }));
}

function details(d) {
  const log = d.log.rows.map((day) => `<h4>${dayLabel(day.day)}</h4>\n`
    + rows(day.rows.map((r) => ({ lead: link(r), text: r.text })))).join('\n');
  const bugRows = (list) => rows(list.map((r) => ({ lead: pill(r.state), text: r.text, tail: `${esc(r.lane)} ${link(r)}` })), 't3');
  const laneRows = (list) => rows(list.map((r) => ({ lead: esc(r.lane), text: r.text, tail: `${pill(r.state)} ${link(r)}` })), 't3');
  const hunt = d.hunt.groups.map((g) => `<h4>${esc(g.title)}</h4>\n${bugRows(g.rows)}`).join('\n')
    + `\n<h4>${esc(d.hunt.lanes.title)}</h4>\n${laneRows(d.hunt.lanes.rows)}`;
  const calls = rows(d.calls.rows.map((r) => ({ lead: esc(r.item), text: r.text })));
  const registry = registryRows();
  const health = rows([...d.health.rows.map((r) => ({ lead: esc(r.label), text: r.text })), openWorkRow(registry)], 'wide');
  const groups = waitingRows(registry);
  const laneTitle = (id) => registry.find((r) => r.id === id)?.title ?? id;
  const waiting = groups.map((g) => `${groups.length > 1 ? `<h4>${esc(laneTitle(g.lane))}</h4>\n` : ''}`
    + rows(g.rows.map((r) => ({ lead: esc(r.what), text: r.why })), 'wide')).join('\n');
  return [
    '<section class="details" aria-labelledby="s-details">',
    '<div class="ground" aria-hidden="true"></div>',
    `<header class="sec"><h2 id="s-details">${esc(d.title)}</h2><p class="sub">${esc(d.sub)}</p></header>`,
    sec('d-log', d.log.title, d.log.sub, log),
    sec('d-hunt', d.hunt.title, d.hunt.sub, hunt),
    sec('d-calls', d.calls.title, d.calls.sub, calls),
    sec('d-next', d.next.title, d.next.sub, laneRows(d.next.rows)),
    sec('d-health', d.health.title, d.health.sub, health),
    sec('d-waiting', d.waiting.title, d.waiting.sub, waiting),
    '</section>',
  ].join('\n');
}

const DETAIL_CSS = `
/* the details: one fact a row under a ground line (DECISIONS 2026-10-31 item 281) */
.details { display: grid; gap: 2.25rem; }
.details > * { min-width: 0; }
.ground { height: 22px; border-radius: 4px; background: repeating-linear-gradient(90deg, transparent 0 21px, var(--edge) 21px 22px), linear-gradient(var(--grass-t) 0 6px, var(--dirt-t) 6px 14px, var(--stone-l) 14px); }
.dsec { display: grid; gap: 0.5rem; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 1.3rem; line-height: 1.15; margin: 0; text-wrap: balance; }
h4 { margin: 0.75rem 0 0; color: var(--muted); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; }
.dsub { margin: 0; color: var(--muted); }
.rows { --lead: 4.75rem; list-style: none; margin: 0; padding: 0; }
.rows.wide { --lead: 9rem; }
.rows li { display: grid; grid-template-columns: var(--lead) minmax(0, 1fr); gap: 0.15rem 0.75rem; align-items: baseline; padding-block: 0.45rem; border-top: 1px solid var(--line); font-size: 1rem; line-height: 1.4; }
.rows.t3 li { grid-template-columns: var(--lead) minmax(0, 1fr) auto; }
.rows li > * { min-width: 0; }
.lead { font-family: var(--font-mono); font-size: 0.85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.wide .lead { font-family: var(--font-body); font-size: 1rem; font-weight: 700; color: var(--fg); }
.tail { display: flex; gap: 0.5rem; align-items: baseline; white-space: nowrap; font-family: var(--font-mono); font-size: 0.85rem; color: var(--muted); }
.rows a { color: var(--accent); text-underline-offset: 3px; }
.rows a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pill { display: inline-block; font-family: var(--font-body); font-size: 0.78rem; font-weight: 700; line-height: 1; padding: 0.3rem 0.55rem; border-radius: 999px; color: var(--on-tag); background: var(--idle); }
.pill-ok { background: var(--ok); } .pill-run { background: var(--run); }
@media (max-width: 34rem) {
  .rows.t3 li { grid-template-columns: var(--lead) minmax(0, 1fr); }
  .rows .tail { grid-column: 2; }
  .rows.wide { --lead: 6.5rem; }
}`;

// ---------------------------------------------------------------- the page
function stampOf(html) {
  const b = html.indexOf(BEGIN);
  const e = html.indexOf(END);
  if (b < 0 || e < b || html.indexOf(BEGIN, b + 1) >= 0) {
    throw new Error(`${PAGE}: needs exactly one as-of stamp between ${BEGIN} and ${END}; run artifact-currency.mjs --stamp command-record`);
  }
  return html.slice(b, e + END.length);
}

function render(data, stamp) {
  const g = data.glance;
  const cards = g.better.cards.map((c) => `<figure class="card">${svg('0 0 200 140', c.alt, CARDS[c.pic](), 'art card-art')}`
    + `<figcaption>${esc(c.caption)}</figcaption></figure>`).join('\n');
  const parts = {
    MAT_TOKENS, MAT_RULES, DETAIL_CSS, STAMP: stamp, DARK4: DARK.map((l) => `    ${l}`).join('\n'),
    DARK2: DARK.map((l) => `  ${l}`).join('\n'), S1: picStands(g.stands), CAP1: esc(g.stands.caption),
    SUB2: esc(g.better.sub), CARDS: cards, S3: picBugs(g.bugs), CAP3: esc(g.bugs.caption), S4: picNow(g.now),
    CAP4: esc(g.now.caption), S5: picYou(g.you), CAP5: esc(g.you.caption), DETAILS: details(data.details),
  };
  let page = TEMPLATE;
  for (const [k, v] of Object.entries(parts)) page = page.split(`@@${k}@@`).join(v);
  const left = page.match(/@@[A-Z0-9_]+@@/);
  if (left) throw new Error(`command-record: the template's ${left[0]} has no value`);
  return page;
}

function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? resolve(args[outAt + 1] ?? '') : PAGE;
  const old = readFileSync(PAGE, 'utf8');
  const page = render(JSON.parse(readFileSync(DATA, 'utf8')), stampOf(old));
  if (args.includes('--check')) {
    if (page !== old) {
      console.error('✗ command-record: the page is not what docs/superpowers/command-record.json writes; run node frontend/scripts/ci/command-record.mjs');
      process.exit(1);
    }
    console.log('✓ command-record: the page is what the data file writes');
    return;
  }
  writeFileSync(out, page);
  console.log(`command-record: wrote ${out} (${page.length.toLocaleString('en-US')} bytes)`);
}

const TEMPLATE = `<title>Crafty Command Record</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&amp;family=Bungee&amp;family=JetBrains+Mono:wght@400&amp;display=swap">
<style>
/* Layout: one 60rem column. The glance: each section a heading, one big drawing on a panel, one line under it (DECISIONS 2026-10-31 item 280). Below a ground line, the details: one fact a row (item 281). */
:root {
  --bg: #edf1f7;
  --panel: #dfe6f0;
  --fg: #14202f;
  --muted: #4e5c70;
  --line: #c4cedb;
  --accent: #b8470f;
  --ok: #1d7f48;
  --on-ok: #ffffff;
  --run: #2a5fa8;
  --idle: #5d6a7d;
  --on-tag: #ffffff;
  --edge: rgba(16, 24, 38, 0.28);
  --hole: #c1cad7;
  --ghost: #56657b;
  --night: #1b2440;
  --star: #f3ead2;
  --died: #ff6b5e;
  --device: #2a313d;
  --device-2: #3d4553;
  --screen: #f6f8fb;
  --gold-btn: #f2c14e;
  --on-gold: #2b1c00;
  --dragon: #3c2a5c;
  --dragon-2: #2a1d43;
  --tell: #e8590c;
  --bug-s: #7d8899;
  --bug-b: #b5372a;
  --skin: #efbf88;
  --hair: #5a3a1e;
  --tunic: #e0662a;
  --legs: #38404e;
  --sky: #9fd0f5;
  --live: #d9302c;
@@MAT_TOKENS@@
  --grass-t2: #82cf5b; --grass-t3: #5aa83c;
  --font-display: "Bungee", "Arial Black", Impact, system-ui, sans-serif;
  --font-body: "Atkinson Hyperlegible", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
@@DARK4@@
  }
}
:root[data-theme="dark"] {
@@DARK2@@
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 1.0625rem;
  line-height: 1.45;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 1.75rem 3rem;
}
.wrap { max-width: 60rem; margin: 0 auto; display: grid; gap: 3rem; }
.wrap > * { min-width: 0; }
h1, h2 { font-family: var(--font-display); font-weight: 400; margin: 0; line-height: 1.1; text-wrap: balance; }
h1 { font-size: clamp(2rem, 1.4rem + 3vw, 3.1rem); letter-spacing: 0.01em; }
h2 { font-size: clamp(1.55rem, 1.25rem + 1.4vw, 2.2rem); color: var(--fg); }
h2::after { content: ""; display: block; width: 2.4rem; height: 0.32rem; margin-top: 0.5rem; background: var(--accent); }
.sec { display: grid; gap: 1rem; }
.sub { margin: -0.4rem 0 0; color: var(--muted); font-size: 1.05rem; }
figure { margin: 0; }
.pic { display: grid; gap: 0.85rem; }
.pic > svg { background: var(--panel); border-radius: 18px; padding: clamp(0.5rem, 2vw, 1.25rem); }
.pic figcaption { font-size: clamp(1.1rem, 1rem + 0.5vw, 1.35rem); font-weight: 700; max-width: 40ch; text-wrap: balance; }
svg.art { display: block; width: 100%; max-width: 100%; height: auto; box-sizing: border-box; }
svg.art-narrow { max-width: 38rem; justify-self: center; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (min-width: 52rem) { .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; } }
.card { background: var(--panel); border-radius: 16px; padding: 10px 12px 14px; display: grid; gap: 6px; align-content: start; min-width: 0; }
.card figcaption { font-size: 1rem; line-height: 1.35; }
.foot { margin: 0; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.95rem; }
.foot a { color: var(--accent); text-underline-offset: 3px; }
.foot a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* the drawings */
.e { stroke: var(--edge); stroke-width: 1; stroke-linejoin: round; }
@@MAT_RULES@@
.grass-t2 { fill: var(--grass-t2); } .grass-t3 { fill: var(--grass-t3); }
.under-l { fill: var(--stone-l); } .under-r { fill: var(--stone-r); }
.hole { fill: var(--hole); }
.ok { fill: var(--ok); } .run { fill: var(--run); } .on-run { fill: var(--on-ok); }
.tick { fill: none; stroke: var(--on-ok); stroke-linecap: round; stroke-linejoin: round; }
.go-line { stroke: var(--ok); stroke-linecap: round; } .go-head { fill: var(--ok); }
.lbl { fill: var(--fg); font-family: var(--font-body); font-weight: 700; }
.px { font-family: var(--font-display); font-weight: 400; }
.on-gold { fill: var(--on-gold); } .on-night { fill: var(--star); } .on-tag { fill: var(--on-tag); }
.on-live { fill: var(--fg); } .on-screen { fill: var(--fg); font-weight: 700; }
.died { fill: var(--died); }
.ghost { fill: none; stroke: var(--ghost); stroke-width: 1.6; stroke-dasharray: 4 3; }
.ghost-gold { fill: none; stroke: var(--gold-l); stroke-width: 2; stroke-dasharray: 4 3; }
.skin { fill: var(--skin); } .hair { fill: var(--hair); } .tunic { fill: var(--tunic); } .legs { fill: var(--legs); }
.pole { stroke: var(--legs); stroke-width: 2.5; } .flag { fill: var(--tunic); }
.glow { fill: var(--ember-t); opacity: 0.28; }
.pill-live { fill: none; stroke: var(--live); stroke-width: 3; }
.live-dot { fill: var(--live); }
.wave { fill: none; stroke: var(--live); stroke-width: 3; stroke-linecap: round; opacity: 0.7; }
.night { fill: var(--night); } .star { fill: var(--star); } .moon { fill: var(--star); opacity: 0.9; }
.gold-btn { fill: var(--gold-btn); } .btn-2 { fill: none; stroke: var(--star); stroke-width: 1.4; }
.tell { fill: var(--tell); fill-opacity: 0.3; stroke: var(--tell); stroke-width: 2.4; stroke-dasharray: 5 3; }
.breath { stroke: var(--tell); stroke-width: 2; stroke-dasharray: 2 4; stroke-linecap: round; }
.dragon { fill: var(--dragon); } .dragon-2 { fill: var(--dragon-2); } .eye { fill: var(--ember-t); }
.motion { fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
.device { fill: var(--device); } .device-2 { fill: var(--device-2); } .screen { fill: var(--screen); }
.heart { fill: var(--died); opacity: 0.85; }
.respawn { fill: none; stroke: var(--star); stroke-width: 2.4; stroke-linecap: round; } .respawn-head { fill: var(--star); }
.bar-before { fill: var(--tell); } .bar-now { fill: var(--ok); }
.tickline { stroke: var(--muted); stroke-width: 1; }
.sky { fill: var(--sky); } .hill { fill: var(--grass-t); } .sun { fill: var(--gold-t); }
.hud-a { fill: var(--tell); } .hud-b { fill: var(--water-l); }
.pick-handle { stroke: var(--wood-l); stroke-width: 5; stroke-linecap: round; } .pick-head { fill: var(--dark-t); }
.bug-s { fill: var(--bug-s); } .bug-b { fill: var(--bug-b); }
.bugleg-s { fill: none; stroke: var(--bug-s); stroke-linecap: round; } .bugleg-b { fill: none; stroke: var(--bug-b); stroke-linecap: round; }
.bugsplit { stroke: var(--panel); }
.divider { stroke: var(--line); stroke-width: 2; }
.tag-ok { fill: var(--ok); } .tag-run { fill: var(--run); } .tag-idle { fill: var(--idle); }
.slot { fill: var(--screen); stroke: var(--muted); stroke-width: 2; } .slot-2 { opacity: 0.8; } .slot-3 { opacity: 0.6; }
.slot-line { fill: var(--line); }
.tap { fill: none; stroke: var(--gold-btn); stroke-width: 2.5; } .tap-dot { fill: var(--gold-btn); }
.band { fill: none; stroke: var(--device); stroke-width: 7; stroke-linecap: round; } .cup { fill: var(--device); }
.wave-s { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
.slider { stroke: var(--muted); stroke-width: 2.5; stroke-linecap: round; } .knob { fill: var(--accent); }
.paper { fill: var(--screen); stroke: var(--line); stroke-width: 2; } .codeline { fill: var(--line); }
.lens { fill: var(--sky); fill-opacity: 0.35; stroke: var(--device); stroke-width: 7; }
.lens-handle { stroke: var(--device); stroke-width: 10; stroke-linecap: round; }
@media (prefers-reduced-motion: no-preference) {
  .live-dot { animation: live 2s ease-in-out infinite; }
  @keyframes live { 50% { opacity: 0.35; } }
}@@DETAIL_CSS@@
</style>

<div class="wrap">
@@STAMP@@
<header><h1>Crafty Command Record</h1></header>

<section class="sec" aria-labelledby="s-stands">
<h2 id="s-stands">Where it stands</h2>
<figure class="pic">@@S1@@<figcaption>@@CAP1@@</figcaption></figure>
</section>

<section class="sec" aria-labelledby="s-better">
<h2 id="s-better">Better for players</h2>
<p class="sub">@@SUB2@@</p>
<div class="cards">
@@CARDS@@
</div>
</section>

<section class="sec" aria-labelledby="s-bugs">
<h2 id="s-bugs">The bug hunt</h2>
<figure class="pic">@@S3@@<figcaption>@@CAP3@@</figcaption></figure>
</section>

<section class="sec" aria-labelledby="s-now">
<h2 id="s-now">Working on now</h2>
<figure class="pic">@@S4@@<figcaption>@@CAP4@@</figcaption></figure>
</section>

<section class="sec" aria-labelledby="s-you">
<h2 id="s-you">Your turn</h2>
<figure class="pic">@@S5@@<figcaption>@@CAP5@@</figcaption></figure>
</section>

@@DETAILS@@

<p class="foot">Details live in DECISIONS, the registry and the git history on <a href="https://github.com/wowlegend/Crafty">GitHub</a>.</p>
</div>
`;

if (import.meta.main) main();
