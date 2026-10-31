// The headroom guard the synth voices end with, shared so the bank has one limiter: a buffer whose peak passes `limit` is
// scaled down to it and a quieter one is left untouched, which keeps the "unclipped" contract deterministic (the voices
// that sum random or overlapping parts can RARELY pass full scale, about 4% of seeds for the slam).
export function limitPeak(d, limit) {
    let peak = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (peak > limit) for (let i = 0; i < d.length; i++) d[i] *= limit / peak;
}
