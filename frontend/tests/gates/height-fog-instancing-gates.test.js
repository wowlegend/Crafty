import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { installHeightFog } from '../../src/render/Atmosphere.jsx';

// THE PATCHED fog_vertex IS COMPILED INTO EVERY MATERIAL THREE FOGS, so it may read only what every stock vertex
// shader that includes it has declared by then. A chunk that reads `transformed` compiles for meshes and fails for
// every fogged SpriteMaterial, whose shader never declares it.
//
// This EXECUTES the patch (it mutates THREE.ShaderChunk), expands each stock shader in THREE.ShaderLib up to its
// `#include <fog_vertex>`, and checks every name the patched chunk reads against what is declared there. It is a
// declaration check, not a compiler: it ignores #ifdef, so a name declared under one define counts everywhere.
// tests/e2e/height-fog-instancing.spec.js links and draws the shaders on a GPU, and guards that each instance and
// each sprite is fogged at its own world Y.

// What three's vertex prefix declares for every non-raw program ahead of the material's source (three 0.172
// WebGLProgram.js:657-663 uniforms, :683-685 attributes). instanceMatrix is left out: it is declared only under
// USE_INSTANCING (:665-667), so a chunk that reads it fails every non-instanced program. A read guarded by
// #ifdef USE_INSTANCING also reads as undeclared here, because this check ignores #ifdef.
const PREFIX_DECLARED = [
  'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic',
  'position', 'normal', 'uv',
];

// GLSL words a shader never declares. A builtin missing here reads as undeclared, which fails loud, never silently.
const GLSL_WORDS = new Set([
  'void', 'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4',
  'mat2', 'mat3', 'mat4', 'true', 'false', 'if', 'else', 'for', 'return', 'const', 'in', 'out', 'inout',
  'abs', 'clamp', 'cos', 'cross', 'dot', 'exp', 'floor', 'fract', 'inverse', 'length', 'max', 'min', 'mix', 'normalize',
  'pow', 'sin', 'smoothstep', 'sqrt', 'step', 'transpose',
]);

const INCLUDE = /^[ \t]*#include +<([\w./]+)>/gm;
// A declaration: a GLSL type followed by the declared name (`varying float vFogDepth`, `vec4 mvPosition = ...`).
const DECLARATION = /\b(?:bool|u?int|float|[biu]?vec[234]|mat[234](?:x[234])?|sampler\w+)\s+([A-Za-z_]\w*)/g;

function expand(glsl, depth = 0) {
  if (depth > 32) throw new Error('#include nesting deeper than 32');
  return glsl.replace(INCLUDE, (_, name) => {
    const chunk = THREE.ShaderChunk[name];
    if (chunk === undefined) throw new Error(`no THREE.ShaderChunk named ${name}`);
    return expand(chunk, depth + 1);
  });
}

/** The code with comments and preprocessor lines blanked. */
const codeOf = (glsl) => glsl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/^[ \t]*#.*$/gm, ' ');

/** Every name the code reads, less GLSL words and member or swizzle accesses (`.xyz`). */
function namesRead(glsl) {
  const names = new Set();
  for (const m of codeOf(glsl).matchAll(/(\.\s*)?\b([A-Za-z_]\w*)/g)) {
    if (!m[1] && !GLSL_WORDS.has(m[2])) names.add(m[2]);
  }
  return [...names];
}

const patchedChunk = () => {
  installHeightFog();
  return THREE.ShaderChunk.fog_vertex;
};

describe('height fog — the patched fog_vertex reads only what every fogged stock shader declares', () => {
  it('installs a fog_vertex chunk at all — otherwise everything below is vacuous', () => {
    const src = patchedChunk();
    expect(typeof src).toBe('string');
    expect(src.length).toBeGreaterThan(40);
    expect(src, 'the height varying is gone; this is not the patched chunk').toContain('vFogWorldY');
  });

  it('every stock vertex shader that includes fog_vertex declares each name the chunk reads, before the include', () => {
    const read = namesRead(patchedChunk());
    // The two varyings the chunk writes: if the parse missed them it would check nothing.
    expect(read, 'the parse did not find the varyings the chunk writes').toEqual(expect.arrayContaining(['vFogDepth', 'vFogWorldY']));

    const fogged = Object.entries(THREE.ShaderLib).filter(([, s]) => s.vertexShader.includes('#include <fog_vertex>'));
    // THE DENOMINATOR: the stock materials three fogs, the sprite among them.
    expect(fogged.map(([key]) => key), 'a stock shader that includes fog_vertex is not being checked').toEqual(
      expect.arrayContaining(['basic', 'lambert', 'phong', 'toon', 'standard', 'physical', 'matcap', 'points', 'dashed', 'shadow', 'sprite'])
    );

    const undeclared = {};
    for (const [key, { vertexShader }] of fogged) {
      const before = codeOf(expand(vertexShader.slice(0, vertexShader.indexOf('#include <fog_vertex>'))));
      const declared = new Set([...PREFIX_DECLARED, ...[...before.matchAll(DECLARATION)].map((m) => m[1])]);
      const missing = read.filter((name) => !declared.has(name));
      if (missing.length) undeclared[key] = missing;
    }
    expect(undeclared, 'fog_vertex reads names these stock shaders have not declared, so it does not compile for them').toEqual({});
  });

  it('is idempotent — installing twice must not nest the patch', () => {
    installHeightFog();
    const once = THREE.ShaderChunk.fog_vertex;
    installHeightFog();
    expect(THREE.ShaderChunk.fog_vertex).toBe(once);
  });
});
