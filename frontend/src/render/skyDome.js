// The sky dome: a 3-stop gradient (horizon -> mid -> top), sun glow, twilight stars + moon, and clouds.
//
// Its own module (it was inline in Atmosphere.jsx) because Atmosphere.jsx cannot be imported under node, so
// nothing could drive the shader it builds: the material is pure and a test can read its uniforms and the
// GLSL it generates. Atmosphere owns the per-frame writes.
import * as THREE from 'three';
import { cloudGlsl } from './cloudField.js';

// A 3-stop gradient skydome (horizon -> mid -> top) + soft sun glow. Always drawn
// behind everything (depthTest/Write off, renderOrder -1, fog off) and follows the
// camera so the sky reads as infinite. Colours are mood-driven (set each frame).
export function makeSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2E4A7A') },
      midColor: { value: new THREE.Color('#6FB7C9') },
      horizonColor: { value: new THREE.Color('#FFD9A0') },
      sunColor: { value: new THREE.Color('#FFE9B0') },
      sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.3) },
      uStar: { value: 0 }, // twilight star/moon layer intensity (peaks at dusk; 0 at day/obsidian)
      uTime: { value: 0 }, // cloud drift clock — fed from devtest/captureClock.frameElapsed, never wall time
      uCloudTint: { value: new THREE.Color(1, 1, 1) }, // cloud colour, from the mood (cloudField.cloudTint)
      uCloudCover: { value: 1 }, // 0..1 — Atmosphere resets it to 0 for the sky-studio subject cards
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      uniform float uStar;
      uniform float uTime;
      uniform vec3 uCloudTint;
      uniform float uCloudCover;
      varying vec3 vDir;
      ${cloudGlsl()}
      // GLSL hash: deterministic per integer cell (capture-stable: same vDir -> same stars each run).
      float hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.22, h)); // thin pale horizon band
        col = mix(col, topColor, smoothstep(0.28, 0.85, h));             // vivid blue dominates the dome
        col = mix(col, horizonColor, smoothstep(0.0, -0.25, h));         // ground fade below horizon
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 9.0) * 0.45;                            // tighter warm sun glow
        col += sunColor * pow(s, 120.0) * 1.3;                           // bright sun disc (blooms)
        // iter-165 TWILIGHT NIGHT SKY (stars + moon), gated by uStar (dusk-only; day/obsidian = 0
        // -> those frames stay byte-identical). Additive, matching the sun-glow technique above.
        if (uStar > 0.001) {
          float up = smoothstep(0.05, 0.35, h);          // upper dome only — no horizon/ground stars
          vec3 sd = normalize(vDir) * 34.0;              // star-field cell frequency
          vec3 cell = floor(sd);
          vec3 f = fract(sd);
          float hsh = hash13(cell);
          float starOn = step(0.985, hsh);              // ~1.5% of cells -> sparse, not noise
          float hb = hash13(cell + 19.3);               // 2nd hash: in-cell jitter + brightness
          vec2 jit = vec2(fract(hb * 7.0), fract(hb * 13.0));
          float d = length(f.xy - 0.5 - (jit - 0.5) * 0.6);
          float star = starOn * smoothstep(0.10, 0.0, d) * (0.45 + 0.55 * hb); // round point, varied
          col += vec3(0.85, 0.90, 1.0) * star * up * uStar * 2.2;             // cool-white stars
          // MOON — a soft cool hero disc high in the FRONT-upper sky (-Z, toward the capture/explore
          // view). The sun-disc technique (pow), cooler + static, so the global Bloom blows it out.
          vec3 moonDir = normalize(vec3(0.32, 0.30, -0.90)); // upper-RIGHT, in-FOV, opposite the sun
          float md = max(dot(normalize(vDir), moonDir), 0.0);
          // A DEFINED cool moon disc (bold-flat coherent — a clean disc reads as a moon even against
          // a brightish dusk sky, unlike a soft pow-glow). ~3deg radius with a soft edge, + a halo.
          float disc = smoothstep(0.9982, 0.9991, md);
          col = mix(col, vec3(0.88, 0.92, 1.0), disc * uStar);               // clean cool moon disc
          col += vec3(0.60, 0.66, 0.90) * pow(md, 26.0) * 0.40 * uStar;      // soft cool halo (blooms)
        }
        // CLOUDS (EXTERNAL-BASELINE #5): the shared field (render/cloudField.js) seen along the view ray from
        // the camera — the SAME plane the terrain samples toward the sun for their shadows. Flat two-tone
        // shapes, a lit body and a slightly shaded core, soft edges; no raymarch. Last, so a cloud covers
        // the sun and the stars behind it rather than being painted over by them.
        float cloudUp = smoothstep(0.02, 0.22, h);
        float cloudN = cloudNoise(cloudPlane(cameraPosition, normalize(vDir), uTime));
        float cloudD = smoothstep(CF_LO, CF_HI, cloudN);
        float cloudCore = smoothstep(CF_HI, CF_HI + 0.14, cloudN);
        vec3 cloudCol = mix(uCloudTint, uCloudTint * 0.84, cloudCore);
        col = mix(col, cloudCol, cloudD * cloudUp * 0.92 * uCloudCover);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
