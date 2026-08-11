// Lazy CJK font loader. Called only when the locale flips to zh-CN, so English
// users never fetch the (large) CJK woff2. Idempotent: injects each FontFace
// once via the CSS Font Loading API, then resolves when the browser reports them
// ready. No-op in non-browser (test) envs lacking FontFace.
let _loaded = false;
let _inflight = null; // dedupes concurrent calls WITHOUT claiming success — see loadCjkFonts
export function _cjkLoadedForTest() { return _loaded; }
/** Test-only: the module singleton would otherwise carry a latch between cases. */
export function _resetCjkForTest() { _loaded = false; _inflight = null; }
/** Test-only: the denominator for the concurrency assertion, so it cannot silently check zero. */
export function FACE_COUNT_FOR_TEST() { return FACES.length; }

const FACES = [
  { family: 'Smiley Sans',          url: '/fonts/smiley-sans-v1.woff2',  desc: { weight: '400', style: 'oblique' } },
  // puhuiti-regular.woff2 is the REAL Alibaba PuHuiTi 3.0 (55 Regular), subset to the
  // common CJK block (U+4E00-9FFF) + Latin/digits/CJK punctuation/fullwidth forms so
  // future zh strings still render. Source: AlibabaPuHuiTi-3-55-Regular.ttf (8.5MB,
  // digitally signed; name[1]='Alibaba PuHuiTi 3.0') via jsDelivr npm mirror.
  { family: 'Alibaba PuHuiTi 3.0',  url: '/fonts/puhuiti-regular.woff2', desc: { weight: '400', style: 'normal' } },
];

export async function loadCjkFonts() {
  if (_loaded) return true;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    _loaded = true; // no FontFace API at all -- nothing to retry, so latching is correct here
    return false;
  }
  // LATCH ONLY ON SUCCESS. `_loaded = true` used to run BEFORE the loads were attempted, and every
  // failure was swallowed by a DEV-only warn -- so one transient network failure on the first toggle to
  // zh-CN permanently disabled the CJK webfonts for the whole session, with no signal at all in
  // production. The guard against a concurrent second call is a separate concern from "did it work", so
  // it gets a separate flag: in-flight callers await the SAME promise, and a run in which every face
  // failed leaves the door open for the next toggle to try again.
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const results = await Promise.all(FACES.map(async ({ family, url, desc }) => {
      try {
        const face = new FontFace(family, `url(${url}) format('woff2')`, desc);
        document.fonts.add(face);
        await face.load();
        return true;
      } catch (e) {
        if (import.meta?.env?.DEV) console.warn('[cjkFonts] failed', family, e);
        return false;
      }
    }));
    _loaded = results.some(Boolean);
    _inflight = null;
    return _loaded;
  })();
  return _inflight;
}
