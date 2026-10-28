import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isFatalMessage, seamVerdict, LOOKBOOK_SEAM_METHODS,
  installArrayTextureRecorder, readBlockTextureArray, mipVerdict,
} from '../../scripts/ci/prod-smoke.mjs';
import { installLookbookSeam, _resetLookbookForTest } from '../../src/render/lookbookSeam.js';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';

// The production bundle is the ONE artifact this repo ships and the one nothing ever loaded. Every
// harness drives the dev server, so `npm run build` proved it COMPILED and bundle-budget proved it was
// the right SIZE, while whether it RUNS went unasked — against a repo whose signature defect is
// "compiles, gates green, never runs".
//
// This tests the one pure decision in that smoke test: which messages are worth failing over. A filter
// that excludes too much turns the smoke test into a green light over a broken bundle, which is strictly
// worse than not having it.
describe('prod-smoke: the noise filter keeps its teeth', () => {
  it('treats a real application error as fatal', () => {
    expect(isFatalMessage('Uncaught TypeError: t.foo is not a function')).toBe(true);
    expect(isFatalMessage('THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false')).toBe(true);
    expect(isFatalMessage('Failed to load module script')).toBe(true);
  });

  it('excludes environment noise that cannot indicate a broken bundle', () => {
    expect(isFatalMessage('Failed to load resource: favicon.ico 404')).toBe(false);
    expect(isFatalMessage('net::ERR_CONNECTION_REFUSED')).toBe(false);
    expect(isFatalMessage('Download the React DevTools for a better experience')).toBe(false);
  });

  it('excludes the pointer-lock gesture error, which only a headless page can produce', () => {
    // MEASURED, not assumed: the title screen auto-advances into gameplay and gameplay requests pointer
    // lock. A real visitor arrives by clicking START ADVENTURE, which IS a user gesture; a headless page
    // cannot produce one. Excluding it is about the probe, not about lowering the bar.
    expect(isFatalMessage('NotAllowedError: A user gesture is required to request Pointer Lock.')).toBe(false);
  });

  it('does not fail on an empty or missing message', () => {
    expect(isFatalMessage('')).toBe(false);
    expect(isFatalMessage(null)).toBe(false);
    expect(isFatalMessage(undefined)).toBe(false);
  });

  it('the exclusions are NARROW — a real error merely mentioning an excluded word still fails', () => {
    // The trap in every allowlist: a pattern loose enough to swallow the thing it was never meant to.
    expect(isFatalMessage('TypeError: cannot read favicon of undefined in renderer boot')).toBe(true);
    expect(isFatalMessage('Pointer Lock failed: WebGL context lost')).toBe(true);
  });
});

describe('prod-smoke: the lookbook seam ships in the production bundle, and only behind ?lookbook=1', () => {
  const ran = (seam) => ({ entryRan: true, seam });
  const open = (methods, timer = { installed: true, reason: null }) => ({ entryRan: true, methods, timer });
  it('passes when the seam is absent on a plain page and whole with the parameter', () => {
    expect(seamVerdict({ plain: ran('undefined'), opened: open([...LOOKBOOK_SEAM_METHODS]) }).ok).toBe(true);
  });
  it('fails when the bundle lost the install, when a method is gone, and when a plain page carries the seam', () => {
    const missing = seamVerdict({ plain: ran('undefined'), opened: open(null) });
    expect(missing.ok).toBe(false);
    expect(missing.line).toMatch(/MISSING from the production bundle/);
    const partial = seamVerdict({ plain: ran('undefined'), opened: open(LOOKBOOK_SEAM_METHODS.filter((m) => m !== 'look')) });
    expect(partial.ok).toBe(false);
    expect(partial.line).toMatch(/lacks look$/);
    const leaked = seamVerdict({ plain: ran('object'), opened: open([...LOOKBOOK_SEAM_METHODS]) });
    expect(leaked.ok).toBe(false);
    expect(leaked.line).toMatch(/WITHOUT \?lookbook=1/);
  });
  it('fails when passTimes() cannot load the pass timer chunk, however that shows', () => {
    for (const [timer, re] of [
      [{ installed: false, reason: 'passTimes threw: Failed to fetch dynamically imported module' }, /did not install the pass timer.*Failed to fetch/],
      [{ installed: false, reason: 'no pass timer in this build' }, /did not install the pass timer.*no pass timer in this build/],
      [null, /did not install the pass timer.*no report/],
    ]) {
      const v = seamVerdict({ plain: ran('undefined'), opened: open([...LOOKBOOK_SEAM_METHODS], timer) });
      expect(v.ok, JSON.stringify(timer)).toBe(false);
      expect(v.line).toMatch(re);
    }
    expect(seamVerdict({ plain: ran('undefined'), opened: open([...LOOKBOOK_SEAM_METHODS]) }).line).toMatch(/the pass timer loads/);
  });
  it('a page whose entry module never ran is COULD NOT CHECK, never an absence', () => {
    for (const r of [
      { plain: { entryRan: false, seam: 'undefined' }, opened: open([...LOOKBOOK_SEAM_METHODS]) },
      { plain: ran('undefined'), opened: { entryRan: false, methods: null } },
    ]) {
      const v = seamVerdict(r);
      expect(v.ok, JSON.stringify(r)).toBe(false);
      expect(v.line).toMatch(/COULD NOT CHECK/);
    }
  });
  it('demands exactly the methods the real seam installs', () => {
    _resetLookbookForTest();
    const win = { location: { search: '?lookbook=1' } };
    installLookbookSeam(win, { store: { getState: () => ({}) }, setActive() {}, getActive: () => false, cycleOf: () => 0, glInfo: () => null, contextLosses: () => 0 });
    expect(Object.keys(win.__craftyLookbook).sort()).toEqual([...LOOKBOOK_SEAM_METHODS]);
  });
});

/**
 * The block texture's mip chain on the GPU (DECISIONS 2026-10-28 item 20). The live check runs in CI only, against
 * the production build under SwiftShader. Here the recorder and the reader run against a fake WebGL 2 context that
 * stores what texStorage3D allocates and texSubImage3D writes, fed by a MODEL of three r172's upload for this
 * texture (WebGLTextures.js getMipLevels and the CompressedArrayTexture + RGBAFormat branch of uploadTexture), not
 * by three itself: a real context, framebuffer completeness and readPixels are only exercised by the live run.
 */
describe('prod-smoke: the block texture mip chain reaches the GPU', () => {
  const GL = {
    TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_BINDING_2D_ARRAY: 0x8c1d, READ_FRAMEBUFFER: 0x8ca8, READ_FRAMEBUFFER_BINDING: 0x8caa,
    COLOR_ATTACHMENT0: 0x8ce0, FRAMEBUFFER_COMPLETE: 0x8cd5, FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    RGBA: 0x1908, RGBA8: 0x8058, UNSIGNED_BYTE: 0x1401, TEXTURE_IMMUTABLE_LEVELS: 0x82df, TEXTURE_MIN_FILTER: 0x2801,
  };
  const GL_MIN_FILTER = new Map([
    [THREE.NearestFilter, 0x2600], [THREE.LinearFilter, 0x2601], [THREE.NearestMipmapNearestFilter, 0x2700],
    [THREE.LinearMipmapNearestFilter, 0x2701], [THREE.NearestMipmapLinearFilter, 0x2702], [THREE.LinearMipmapLinearFilter, 0x2703],
  ]);

  /** A fresh class per call, so each recorder wraps its own prototype once. */
  function fakeGL2Class() {
    class FakeGL2 {
      constructor() { this.boundArray = null; this.boundRead = null; this.textures = new Map(); this.minFilters = new Map(); }
      createTexture() { return {}; }
      bindTexture(target, texture) { this.boundArray = texture; }
      getParameter(p) {
        if (p === this.TEXTURE_BINDING_2D_ARRAY) return this.boundArray;
        if (p === this.READ_FRAMEBUFFER_BINDING) return this.boundRead;
        return null;
      }
      texStorage3D(target, levels, internalformat, width, height, depth) {
        const data = Array.from({ length: levels }, (_, l) => new Uint8Array(Math.max(1, width >> l) ** 2 * 4 * depth));
        this.textures.set(this.boundArray, { levels, data });
      }
      texSubImage3D(target, level, x, y, z, width, height, depth, format, type, src) { this.textures.get(this.boundArray).data[level].set(src); }
      texParameteri(target, p, v) { if (p === this.TEXTURE_MIN_FILTER) this.minFilters.set(this.boundArray, v); }
      getTexParameter(target, p) {
        if (p === this.TEXTURE_IMMUTABLE_LEVELS) return this.textures.get(this.boundArray)?.levels ?? 0;
        return this.minFilters.get(this.boundArray) ?? 0x2702;
      }
      createFramebuffer() { return { attachment: null }; }
      bindFramebuffer(target, fb) { this.boundRead = fb; }
      framebufferTextureLayer(target, attachment, texture, level, layer) { this.boundRead.attachment = { texture, level, layer }; }
      checkFramebufferStatus() {
        const a = this.boundRead.attachment;
        return a && a.level < this.textures.get(a.texture).levels ? this.FRAMEBUFFER_COMPLETE : this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      }
      readPixels(x, y, width, height, format, type, dst, offset) {
        const { texture, level, layer } = this.boundRead.attachment;
        const per = width * height * 4;
        dst.set(this.textures.get(texture).data[level].subarray(layer * per, (layer + 1) * per), offset);
      }
      deleteFramebuffer() {}
    }
    Object.assign(FakeGL2.prototype, GL);
    return FakeGL2;
  }

  /** three r172's upload of this texture, modelled: levels = mipmaps.length (else 1), each level one texSubImage3D. */
  function uploadLikeThreeR172(gl, texture, { fillLevels = Infinity } = {}) {
    const levels = texture.mipmaps.length > 0 ? texture.mipmaps.length : 1;
    const mipmaps = texture.mipmaps;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, GL_MIN_FILTER.get(texture.minFilter));
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, mipmaps[0].width, mipmaps[0].height, texture.image.depth);
    mipmaps.forEach((m, i) => {
      if (i < fillLevels) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, i, 0, 0, 0, m.width, m.height, texture.image.depth, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
    });
  }

  const source = createProceduralVoxelTextures();
  const dims = { size: source.image.width, layers: source.image.depth };
  const expected = { ...dims, chain: source.mipmaps };

  /** Upload each texture into one fake context through the recorder, then read the block array back. */
  function gpu(textures, opts) {
    const Gl = fakeGL2Class();
    const sink = {};
    installArrayTextureRecorder(Gl.prototype, sink);
    const gl = new Gl();
    for (const t of textures) uploadLikeThreeR172(gl, t, opts);
    const elsewhere = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, elsewhere);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    const reading = readBlockTextureArray(dims, sink.__craftySmokeArrays || []);
    return { reading, restored: gl.boundArray === elsewhere && gl.boundRead === fb };
  }
  const withMips = (mipmaps, extra = {}) => Object.assign(createProceduralVoxelTextures(), extra, mipmaps ? { mipmaps } : {});

  it('passes on the chain the source builds, says what it checked, and leaves the bindings as it found them', () => {
    const { reading, restored } = gpu([source]);
    const v = mipVerdict(reading, expected);
    expect(v.ok, v.line).toBe(true);
    expect(v.line).toBe('block texture mips: 6 levels on the GPU (NEAREST_MIPMAP_LINEAR), every level filled in all 15 drawn layers, all 87,360 bytes equal the chain the source builds');
    expect(restored).toBe(true);
  });

  it('the mipmaps array emptied: three r172 throws before it allocates, so nothing is found and nothing passes', () => {
    const emptied = withMips([]);
    expect(() => gpu([emptied])).toThrow(TypeError);
    const Gl = fakeGL2Class();
    const sink = {};
    installArrayTextureRecorder(Gl.prototype, sink);
    try { uploadLikeThreeR172(new Gl(), emptied); } catch { /* the page throws here too */ }
    const v = mipVerdict({ ...readBlockTextureArray(dims, sink.__craftySmokeArrays || []), worldBuilt: true }, expected);
    expect(v.ok).toBe(false);
    expect(v.control).toBe(true);
    expect(v.line).toMatch(/COULD NOT CHECK — no 32x32x16 TEXTURE_2D_ARRAY was allocated by texStorage3D \(arrays seen: none; spawn chunk loaded: true\)/);
  });

  it('the chain cut to level 0, in the source as well, fails on the level count', () => {
    const cut = [source.mipmaps[0]];
    const v = mipVerdict(gpu([withMips(cut)]).reading, { ...expected, chain: cut });
    expect(v.ok).toBe(false);
    expect(v.line).toBe('block texture mips: 1 level(s) on the GPU; a full chain for 32 px tiles is 6');
  });

  it('levels allocated and never filled fail as EMPTY, at level 1', () => {
    const v = mipVerdict(gpu([source], { fillLevels: 1 }).reading, expected);
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/^block texture mips: level 1 is EMPTY on the GPU in 15 of the 15 drawn layers/);
  });

  it('one empty layer at one level fails and names it', () => {
    const holed = source.mipmaps.map((m) => ({ ...m, data: m.data.slice() }));
    const n = holed[3].width;
    holed[3].data.fill(0, 5 * n * n * 4, 6 * n * n * 4);
    const v = mipVerdict(gpu([withMips(holed)]).reading, expected);
    expect(v.ok).toBe(false);
    expect(v.line).toBe('block texture mips: level 3 is EMPTY on the GPU in 1 of the 15 drawn layers (5)');
  });

  it("a byte-space chain (what the GPU's generateMipmap computes) fails on the bytes", () => {
    const l0 = source.mipmaps[0].data;
    const byteSpace = source.mipmaps.map((m, level) => {
      if (level === 0) return m;
      const block = 1 << level, n = m.width, out = new Uint8Array(m.data.length);
      for (let layer = 0; layer < dims.layers; layer++) {
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            for (let c = 0; c < 4; c++) {
              let s = 0;
              for (let v = y * block; v < (y + 1) * block; v++) for (let u = x * block; u < (x + 1) * block; u++) s += l0[((layer * dims.size + v) * dims.size + u) * 4 + c];
              out[((layer * n + y) * n + x) * 4 + c] = Math.round(s / (block * block));
            }
          }
        }
      }
      return { ...m, data: out };
    });
    const v = mipVerdict(gpu([withMips(byteSpace)]).reading, expected);
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/^block texture mips: level 1: \d+ of 16384 bytes on the GPU differ from the chain the source builds/);
  });

  it('a minify filter that reads level 0 alone fails, whatever the levels hold', () => {
    const v = mipVerdict(gpu([withMips(null, { minFilter: THREE.NearestFilter })]).reading, expected);
    expect(v.ok).toBe(false);
    expect(v.line).toBe('block texture mips: the minify filter is 0x2600, which samples level 0 alone');
  });

  it('two block-sized arrays, or a reader that saw nothing at level 0, are COULD NOT CHECK', () => {
    const twice = mipVerdict(gpu([source, source]).reading, expected);
    expect(twice.ok).toBe(false);
    expect(twice.line).toMatch(/2 32x32x16 arrays were allocated; cannot tell which is the block texture/);
    const { reading } = gpu([source]);
    const blind = mipVerdict({ ...reading, levels: reading.levels.map((l) => l.map(() => 0)) }, expected);
    expect(blind.ok).toBe(false);
    expect(blind.line).toMatch(/COULD NOT CHECK — level 0 read back all zero/);
  });
});
