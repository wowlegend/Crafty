// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { loadCjkFonts, _cjkLoadedForTest, _resetCjkForTest, FACE_COUNT_FOR_TEST } from './cjkFonts.js';

// ONE TRANSIENT FAILURE KILLED THE FONTS FOR THE WHOLE SESSION.
//
// `_loaded = true` ran BEFORE the loads were attempted, and each failure was swallowed by a DEV-only
// warn. So the first toggle to zh-CN latched the module shut whatever happened: a flaky network on that
// one request permanently disabled the CJK webfonts for the rest of the session, and in production there
// was no signal at all — the UI simply rendered CJK in a fallback face and nothing said why.
//
// "Have we loaded" and "is a load in flight" are different questions, and collapsing them into one flag
// is the whole defect. They are two flags now: the in-flight one dedupes concurrent callers, and the
// loaded one is set only by an attempt that actually got a face.
const realFontFace = globalThis.FontFace;

describe('loadCjkFonts — a failed load may be retried', () => {
  afterEach(() => {
    globalThis.FontFace = realFontFace;
    _resetCjkForTest();
  });

  const install = ({ fail, count } = {}) => {
    globalThis.FontFace = class {
      constructor(family) {
        this.family = family;
        if (count) count.n++;
      }
      load() { return fail ? Promise.reject(new Error('network')) : Promise.resolve(this); }
    };
    document.fonts = { add() {} };
  };

  it('does not latch when every face fails, so the next toggle tries again', async () => {
    install({ fail: true });
    expect(await loadCjkFonts(), 'a total failure reported success').toBe(false);
    expect(_cjkLoadedForTest(), 'the module latched shut on a failed load').toBe(false);
  });

  it('a retry after a transient failure SUCCEEDS — the whole point', async () => {
    install({ fail: true });
    await loadCjkFonts();
    install({ fail: false });
    expect(await loadCjkFonts(), 'the retry was refused because the first attempt had latched').toBe(true);
    expect(_cjkLoadedForTest()).toBe(true);
  });

  it('latches once it HAS loaded, so a later toggle does not re-download', async () => {
    install({ fail: false });
    await loadCjkFonts();
    const count = { n: 0 };
    install({ fail: false, count });
    await loadCjkFonts();
    expect(count.n, 'a successful load was repeated on the next toggle').toBe(0);
  });

  it('dedupes CONCURRENT calls onto one attempt', async () => {
    const count = { n: 0 };
    install({ fail: false, count });
    await Promise.all([loadCjkFonts(), loadCjkFonts(), loadCjkFonts()]);
    expect(FACE_COUNT_FOR_TEST(), 'there are no faces, so this assertion checks nothing').toBeGreaterThan(0);
    expect(count.n, 'three concurrent callers each started their own download').toBe(FACE_COUNT_FOR_TEST());
  });

  it('reports false rather than throwing when the platform has no FontFace at all', async () => {
    delete globalThis.FontFace;
    await expect(loadCjkFonts()).resolves.toBe(false);
  });
});
