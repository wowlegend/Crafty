import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { getLiveZones } from './ElementZoneSystem';

const ZONE_POOL = 24; // the design's decal cap (rings + their ink skirts share it)
const CHAR_POOL = 16; // scorch ring-buffer (oldest-overwritten)

// the world-side element palette (theme/tokens MAGIC family — zones speak ELEMENT colors;
// white-gold stays the player-side identity, M6 reference-lock)
const PALETTE = {
  burning: '#FF7A3C',
  frozen: '#6FC8FF',
  conductive: '#FFE066',
  resonant: '#B36BFF',
};
const CHAR_INK = '#141414';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * ElementZoneRenderSystem — S2-B4-M6: zones become VISIBLE. Two always-mounted instanced
 * pools at the SCENE ROOT (the GPUSparkSystem precedent — NOT under the player's body:
 * a transformed parent would carry world-positioned rings along with it; and NOT a rotated
 * parent group: instance matrices compose in mesh-local space, so a -90° parent swizzles
 * world positions — the flat orientation is baked into the GEOMETRY instead).
 * THE CAPTURE STANCE (plan + review-verified): the LOGIC is gated (the bridge keeps the
 * live registry empty in every normal capture) — this renderer stays UN-gated so the
 * showcase card can inject zones and draw them; the breathing pulse freezes via now=0.
 * Char: a burning zone that vanishes leaves a scorch (annihilation/evict too — ACCEPTED:
 * fire was there); a 2-frame grace after the dawn flip absorbs the bridge-order race
 * (the renderer mounts earlier in the tree and would otherwise see zones vanish AFTER
 * consuming the isDay edge — the review's one-frame-race finding).
 */
export function ElementZoneRenderSystem() {
  const ringRef = useRef();
  const skirtRef = useRef();
  const charRef = useRef();
  const prevZonesRef = useRef(new Map()); // id -> {x,y,z,kind} drawn last frame
  const charsRef = useRef([]);            // the scorch ring-buffer
  const charWriteRef = useRef(0);
  const prevIsDayRef = useRef(true);
  const dawnGraceRef = useRef(0);

  // flat-on-ground baked ONCE into the geometries (rings/discs are XY-plane natives)
  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(0.72, 1, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const charGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.9, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const skirtGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(1.05, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  // r172 creates instanceColor LAZILY on first setColorAt — with zones empty (game start
  // AND every baseline capture) an unguarded instanceColor.needsUpdate would throw every
  // frame. Prime ALL instances at mount (the BlockParticleSystem idiom).
  useLayoutEffect(() => {
    _c.set('#ffffff');
    if (ringRef.current) {
      for (let i = 0; i < ZONE_POOL; i++) ringRef.current.setColorAt(i, _c);
      ringRef.current.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame((state) => {
    const ring = ringRef.current;
    const skirt = skirtRef.current;
    const char = charRef.current;
    if (!ring || !char || !skirt) return;

    const store = useGameStore.getState(); // transient read (Game-Loop-Isolation)
    const zones = getLiveZones().zones;
    const now = isCaptureMode() ? 0 : state.clock.getElapsedTime();

    // dawn: scorch doesn't outlive the night; the 2-frame grace absorbs the
    // renderer-before-bridge order on the flip frame (see the header note).
    if (store.isDay && !prevIsDayRef.current) {
      charsRef.current = [];
      charWriteRef.current = 0;
      dawnGraceRef.current = 2;
    }
    prevIsDayRef.current = store.isDay;

    // the char diff: burning ids that vanished since last frame leave a scorch
    if (dawnGraceRef.current > 0) {
      dawnGraceRef.current -= 1;
    } else {
      for (const [id, z] of prevZonesRef.current) {
        if (z.kind !== 'burning') continue;
        let alive = false;
        for (const q of zones) if (q.id === id) { alive = true; break; }
        if (!alive) {
          if (charsRef.current.length < CHAR_POOL) charsRef.current.push({ x: z.x, y: z.y, z: z.z, r: z.r });
          else { charsRef.current[charWriteRef.current % CHAR_POOL] = { x: z.x, y: z.y, z: z.z, r: z.r }; }
          charWriteRef.current += 1;
        }
      }
    }
    prevZonesRef.current.clear();
    for (const z of zones) prevZonesRef.current.set(z.id, { x: z.pos.x, y: z.pos.y, z: z.pos.z, kind: z.kind, r: z.radius });

    // the zone rings: element color + a gentle breath (the resonant rune breathes ~2x —
    // it reads as ALIVE); frozen at now=0 under capture.
    const n = Math.min(zones.length, ZONE_POOL);
    _q.identity();
    for (let i = 0; i < n; i++) {
      const z = zones[i];
      const rate = z.kind === 'resonant' ? 5 : 2.2;
      const sc = z.radius * (1 + 0.06 * Math.sin(now * rate + z.id));
      _p.set(z.pos.x, z.pos.y + 0.06, z.pos.z);
      _s.set(sc, 1, sc);
      _m.compose(_p, _q, _s);
      ring.setMatrixAt(i, _m);
      ring.setColorAt(i, _c.set(PALETTE[z.kind] || '#ffffff'));
      // the INK SKIRT: a dark disc under the ring — the toon answer to additive wash-out
      // (additive color over a bright backdrop reads pastel; over ink it POPS).
      _p.set(z.pos.x, z.pos.y + 0.05, z.pos.z);
      _s.set(z.radius, 1, z.radius);
      _m.compose(_p, _q, _s);
      skirt.setMatrixAt(i, _m);
    }
    ring.count = n;
    skirt.count = n;
    ring.instanceMatrix.needsUpdate = true;
    skirt.instanceMatrix.needsUpdate = true;
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;

    // the scorch
    const chars = charsRef.current;
    const cn = Math.min(chars.length, CHAR_POOL);
    for (let i = 0; i < cn; i++) {
      const k = chars[i];
      _p.set(k.x, k.y + 0.04, k.z); // under the rings (+0.06) — no coplanar ambiguity
      _s.set(k.r, 1, k.r);
      _m.compose(_p, _q, _s);
      char.setMatrixAt(i, _m);
    }
    char.count = cn;
    char.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* char FIRST (normal blend under), rings after (additive on top) */}
      <instancedMesh ref={charRef} args={[charGeo, undefined, CHAR_POOL]} count={0} frustumCulled={false}>
        <meshBasicMaterial color={CHAR_INK} transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={skirtRef} args={[skirtGeo, undefined, ZONE_POOL]} count={0} frustumCulled={false}>
        <meshBasicMaterial color="#10131a" transparent opacity={0.42} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={ringRef} args={[ringGeo, undefined, ZONE_POOL]} count={0} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.55}
          blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
