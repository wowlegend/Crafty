// Lazy CJK font loader. Called only when the locale flips to zh-CN, so English
// users never fetch the (large) CJK woff2. Idempotent: injects each FontFace
// once via the CSS Font Loading API, then resolves when the browser reports them
// ready. No-op in non-browser (test) envs lacking FontFace.
let _loaded = false;
export function _cjkLoadedForTest() { return _loaded; }

const FACES = [
  { family: 'Smiley Sans',          url: '/fonts/smiley-sans-v1.woff2',  desc: { weight: '400', style: 'oblique' } },
  { family: 'Alibaba PuHuiTi 3.0',  url: '/fonts/puhuiti-regular.woff2', desc: { weight: '400', style: 'normal' } },
];

export async function loadCjkFonts() {
  if (_loaded) return;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    _loaded = true;
    return;
  }
  _loaded = true;
  await Promise.all(FACES.map(async ({ family, url, desc }) => {
    try {
      const face = new FontFace(family, `url(${url}) format('woff2')`, desc);
      document.fonts.add(face);
      await face.load();
    } catch (e) {
      if (import.meta?.env?.DEV) console.warn('[cjkFonts] failed', family, e);
    }
  }));
}
