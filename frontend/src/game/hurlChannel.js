// hurlChannel.js — S2-B2-M3: the transient verb channel between the Components SM apply-site
// (producer, on a 'hurl'/'slam' SM action) and HurlSystem's useFrame (consumer). Module-level
// single-slot transients — the proven perfProbe requestHurl/consumeHurl pattern (GLI-clean:
// no React, no store, no per-frame allocation beyond the rare request object).

let _hurl = null;
let _slam = null;

export function requestHurl(origin, dir, color) { _hurl = { origin, dir, color }; }
export function consumeHurlRequest() { const r = _hurl; _hurl = null; return r; }
export function requestSlam(center, color) { _slam = { center, color }; }
export function consumeSlamRequest() { const r = _slam; _slam = null; return r; }
