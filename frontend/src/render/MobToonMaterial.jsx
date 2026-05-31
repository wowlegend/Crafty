// R3F wrapper: a per-instance MeshToonMaterial with the shared 2-band gradient
// + the fresnel rim baked in at construction (so onBeforeCompile is set before
// first compile). `rimStrength` is tier-gated by the caller (0 disables the rim
// cheaply without a recompile). Kept in a .jsx file + isolated from the pure
// characterStyle.js so the unit test stays renderer-free.
import { MeshToonMaterial } from 'three';
import { extend } from '@react-three/fiber';
import { getToonGradient, installRim, RIM } from './characterStyle';

class MobToonMaterialImpl extends MeshToonMaterial {
  constructor() {
    super();
    this.gradientMap = getToonGradient();
    installRim(this); // strength overridable per-instance via userData.rim
  }
}
extend({ MobToonMaterialImpl });

export function MobToonMaterial({ color, rimStrength = RIM.strength, ...props }) {
  return (
    <mobToonMaterialImpl
      attach="material"
      color={color}
      onUpdate={(self) => { if (self.userData.rim) self.userData.rim.uRimStrength.value = rimStrength; }}
      {...props}
    />
  );
}
