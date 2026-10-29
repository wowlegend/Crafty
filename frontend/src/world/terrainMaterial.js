// terrainMaterial.js — the near terrain's land material and the shader patch its onBeforeCompile runs.
//
// It lives apart from Terrain.jsx because that module cannot be imported under node (it starts the terrain worker at
// module scope and pulls in React, rapier and the store), and a shader patch nothing can run is checked only by reading
// its text. Here a node gate hands onBeforeCompile three's own shader source and reads what three would compile
// (tests/gates/terrain-shader-patch-gates.test.js). Terrain.jsx draws every chunk with this material and writes its
// per-frame uniforms through userData.shader.
import * as THREE from 'three';
import { BIOME_TINT, AO_FLOOR } from './biomeTable.js';
import { TERRAIN_SURFACE } from './terrainSurface.js';
import { biomeTintGlsl, biomeTintMask } from './terrainTint.js';
import { sharedVoxelTextures } from './proceduralTextures.js';
import { sunDirRef, cloudCoverRef } from '../render/mood.js';
import { cloudShadowGlsl } from '../render/cloudField.js';
import { aerialGlsl } from '../render/aerialPerspective.js';
import { landGradeGlsl } from '../render/landGrade.js';
import { oreGlowTable, oreGlowGlsl, oreGlowTexture } from './oreGlow.js';
import { leafFeelGlsl } from './leafFeel.js';
import { faceLayerGlsl, TEXTURE_LAYER_COUNT } from './materialGrammar.js';

// The textures are baked on the first compile, not at import: Terrain.jsx imports this module before it spawns the
// terrain worker, so a bake here would hold the main thread ahead of the worker instead of running beside it.
let baked = null;
function bakedTextures() {
    if (!baked) {
        const voxelTextures = sharedVoxelTextures(); // the ONE block texture array (the far field averages the same one)
        // The nuggets' glow, baked from the array's level 0 and mipped on its own.
        baked = { voxelTextures, oreGlowTex: oreGlowTexture(voxelTextures) };
    }
    return baked;
}

// The opaque land material: water is the Ocean.jsx plane's, so every quad drawn here is land (de-tile, vertex AO,
// danger-mood grade, aerial perspective).
export const terrainMaterial = new THREE.MeshStandardMaterial({
    ...TERRAIN_SURFACE,
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide
});

const compileShader = (shader) => {
    const { voxelTextures, oreGlowTex } = bakedTextures();
    shader.uniforms.mood = { value: 0.0 }; // 0 explore, 1 dusk, 2 obsidian (spec §4)
    shader.uniforms.voxelTextures = { value: voxelTextures };
    shader.uniforms.skyHorizon = { value: new THREE.Color(0.6, 0.75, 0.9) }; // S2 aerial-perspective haze target (set per-frame from the sky frame, skyFrameRef)
    // S11 sky-coloured AO. Initialised to a neutral grey at the floor's luminance, so a frame drawn before the first
    // useFrame tick writes the sky colour shows no wrong colour.
    shader.uniforms.uAoFloor = { value: new THREE.Color(AO_FLOOR, AO_FLOOR, AO_FLOOR) };
    // EXTERNAL-BASELINE #5: cloud shadows. The clock and the sun are written per frame (Terrain.jsx's useFrame).
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSunDir = { value: sunDirRef.current.clone() };
    shader.uniforms.uCloudCover = { value: cloudCoverRef.current };
    // EXTERNAL-BASELINE-R2 #3: the ore nuggets glow at night (world/oreGlow.js). A static per-layer table.
    shader.uniforms.uOreGlow = { value: oreGlowUniform };
    shader.uniforms.uOreGlowTex = { value: oreGlowTex };

    // Vertex Shader: forwards land varyings (blockType, world height/pos, AO) to the fragment.
    shader.vertexShader = `
        flat varying float vBlockType;
        flat varying float vBiome; // Q14 biome id (color.g) — flat: per-column, never interpolated
        varying float vWorldY;
        attribute float aAO; // S1 vertex AO factor 0..3 (mesher cornerAO), forwarded to vAO
        varying float vAO;
        varying vec3 vWorldPos; // S(tex) de-tile: world position for per-cell value variation
        ${LEAF_GLSL.vertexDecl}
        ${FACE_GLSL.vertexDecl}
        #ifndef USE_UV
        varying vec2 vUv;
        #endif
        ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `
        void main() {
            vBlockType = color.r;
            vBiome = color.g; // Q14: biome id, baked into the free channel by the mesher
            vAO = aAO; // S1 vertex AO 0..3 -> fragment diffuse multiplier
            vUv = uv;
            ${FACE_GLSL.vertex}
`
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vWorldY = (modelMatrix * vec4(position, 1.0)).y; // world height (drives the land aerial-perspective grade)
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz; // S(tex) de-tile: world cell for per-cell value variation
        // LEAF SWAY (EXTERNAL-BASELINE-R2 #2; world/leafFeel.js): leaves-only, phase from WORLD position so a merged
        // canopy moves as a mass. vWorldPos above stays the rest position (the de-tile jitter must not crawl).
        ${LEAF_GLSL.vertex}
        `
    );

    // Fragment Shader: land albedo (texture-array sample + linear decode), de-tile jitter, vertex AO,
    // danger-mood grade, and the distance aerial-perspective haze.
    shader.fragmentShader = `
        precision highp sampler2DArray;
        uniform sampler2DArray voxelTextures;
        uniform float mood;
        uniform vec3 skyHorizon; // S2 aerial-perspective haze colour (= sky horizon, set per-frame from mood)
        uniform vec3 uAoFloor;   // S11 the colour a fully-occluded corner reads as (sky HUE, fixed luminance)
        flat varying float vBlockType;
        flat varying float vBiome; // Q14 biome id from the vertex stage
        ${FACE_GLSL.fragmentDecl}
        ${TINT_GLSL.decl}
        ${CLOUD_SHADOW_GLSL.decl}
        ${ORE_GLOW_GLSL.decl}
        varying float vWorldY;
        varying float vAO; // S1 vertex AO 0..3 from the mesher (diffuse darkening in concave corners)
        varying vec3 vWorldPos; // S(tex) de-tile: world position for per-cell value variation
        #ifndef USE_UV
        varying vec2 vUv;
        #endif
        ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        float layerIndex = floor(vBlockType + 0.5); // Round to nearest integer to prevent floating-point interpolation drift/truncation to layer 0
        
        // The tile this face shows (world/materialGrammar.js): a block's top, side or underside layer. layerIndex
        // stays the block type, which the ore glow and the leaf feel key on; the biome tint keys on texLayer.
        ${FACE_GLSL.fragment}
        // Sample the tile from its array layer. Raw vUv, NOT fract(vUv): the texture wraps REPEAT, and fract
        // makes the UV derivative jump at every block edge, where the GPU would then pick the smallest mip
        // and draw a grid line around every block.
        vec4 texColor = texture(voxelTextures, vec3(vUv.x, vUv.y, texLayer));
        
        // Set the diffuse color to the sampled texture (before lighting calculations).
        // The block texture array (a CompressedArrayTexture of plain RGBA8 levels) stores sRGB-display bytes at
        // every mip level, and is sampled through a custom sampler2DArray (so material.colorSpace is a no-op).
        // Decode to linear here, upstream of lighting, so PBR + the renderer's sRGB output are correct.
        diffuseColor = vec4(diffuse * pow(texColor.rgb, vec3(2.2)), texColor.a);

        // Danger-mood grade (spec §4): terrain cools + desaturates toward dusk, near-monochrome
        // at obsidian. The arithmetic lives in render/landGrade.js — the far field grades by the SAME lines.
        ${LAND_GRADE_GLSL}

        // S(tex) de-tile: subtle per-world-cell value jitter (mirrors world/detile.js tileValueOffset) so a
        // field of one block type stops reading as stamped identical tiles. Bounded +/-0.08, flat (no normal
        // map). Static world cell -> capture-deterministic. No water guard: the mesher emits no water faces,
        // which mesher-geometry-gates.test.js asserts (water above, beside, under and pocketed in stone, no
        // vertex typed 9); a water face reaching this material needs a guard here first.
        float dh = sin(floor(vWorldPos.x) * 12.989 + floor(vWorldPos.y) * 78.233 + floor(vWorldPos.z) * 37.719) * 43758.5453;
        diffuseColor.rgb *= (1.0 + (fract(dh) - 0.5) * 0.16);

        // S1 vertex ambient occlusion: per-corner AO (aAO 0..3 from the mesher cornerAO) darkens concave
        // corners / crevices / under-overhangs so the voxel terrain reads with FORM (soft contact-shadow)
        // instead of flat-shaded-per-face. Applied to the albedo BEFORE lighting. Static geometry attribute
        // -> capture-deterministic.
        // The floor is a COLOUR, not a grey scalar: a contact shadow is lit by the sky, so a
        // crevice at noon is blue and at dusk is warm — the single cheapest thing that stops voxel AO
        // reading as dirt. Its LUMINANCE is held at 0.55 in every mood (see aoFloorColor):
        // multiplying by the sky colour directly would crush crevices toward black at dusk and at night,
        // which is the opposite of the intent. Static vAO attribute + a mood-driven uniform that snaps
        // with mood -> capture-deterministic, same contract as skyHorizon two terms below.
        diffuseColor.rgb *= mix(uAoFloor, vec3(1.0), clamp(vAO / 3.0, 0.0, 1.0));

        // BIOME TINT. Six of ten biomes share surfaceBlock 1, so without it they read alike at ground level.
        // The multiplier arrives luminance-normalised from the CPU, so this shifts HUE without darkening —
        // one multiply, no branch, no texture fetch. Index clamped: a corrupt attribute must not read out of
        // bounds. Only the natural surface tiles take it, keyed by the tile the face shows
        // (world/terrainTint.js); the array and the clamp are sized from BIOME_NAMES.
        ${TINT_GLSL.apply}
        `
    );

    // ORE GLOW (EXTERNAL-BASELINE-R2 #3; world/oreGlow.js) and LEAF TRANSLUCENCY (R2 #2; world/leafFeel.js): right after
    // three sums the material's emissive, so the glow
    // is light the surface GIVES (unshadowed, untouched by AO) and the bloom halos it. texColor and layerIndex come from
    // the <color_fragment> patch above, earlier in the same main(); vUv is the land's varying.
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        ${ORE_GLOW_GLSL.apply}
        ${LEAF_GLSL.fragment}
        `
    );

    // CLOUD SHADOWS (EXTERNAL-BASELINE #5; render/cloudField.js cloudShadowGlsl). Right after the lights are
    // summed and before they are combined: only the DIRECT terms are dimmed, so ambient and sky bounce stay.
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        ${CLOUD_SHADOW_GLSL.apply}
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        #include <opaque_fragment>

        // S2 aerial perspective (non-water LAND): distant terrain hazes toward the sky-horizon colour so far
        // mountains read as atmospheric DEPTH, not an oppressive dark wall (complements the height-fog, which
        // only fogs LOW areas, so tall distant terrain never faded). Pure view-distance + a gentle distance
        // desaturation -> capture-deterministic (camera pinned in capture; skyHorizon snaps with mood). Tunables:
        // the 38->165 distance band + the 0.22 desat / 0.55 haze strengths (eyeball explore/hearth/landmark).
        // The arithmetic lives in render/aerialPerspective.js — the far field hazes by the SAME lines.
        ${AERIAL_GLSL}
        `
    );
};

/**
 * BIOME TINT — the uniform, precomputed on the CPU (world/biomeTable.js BIOME_TINT) so the shader is one multiply.
 * Each biome's tint is normalised to unit luminance, so the strength dial shifts HUE only and never brightness: a
 * plain `c * tint` would darken every biome, since all ten tints have luminance below white. One table, which the
 * wind-grass blades read too, so the ground and the blades cannot drift apart.
 */
const biomeTintUniform = BIOME_TINT;
// Sized from the biome table and from the grammar's layer count, which the texture array is built to
// (material-grammar-gates.test.js holds the two equal), so no literal can fall out of step with the data it indexes.
const TEX_LAYERS = TEXTURE_LAYER_COUNT;
const TINT_GLSL = biomeTintGlsl(undefined, TEX_LAYERS);
const CLOUD_SHADOW_GLSL = cloudShadowGlsl(); // the same field the sky dome draws (render/skyDome.js)
const AERIAL_GLSL = aerialGlsl(); // shared with the far field (world/FarField.jsx)
const LAND_GRADE_GLSL = landGradeGlsl(); // shared with the far field (world/FarField.jsx)
const biomeTintMaskUniform = biomeTintMask(TEX_LAYERS);
const ORE_GLOW_GLSL = oreGlowGlsl(TEX_LAYERS);
const LEAF_GLSL = leafFeelGlsl();
const FACE_GLSL = faceLayerGlsl();
const oreGlowUniform = oreGlowTable(TEX_LAYERS);

terrainMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uBiomeTint = { value: biomeTintUniform };
    shader.uniforms.uBiomeTintMask = { value: biomeTintMaskUniform };
    compileShader(shader);
    terrainMaterial.userData.shader = shader;
};
