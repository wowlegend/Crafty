import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rememberAuthoredColor, restoreAuthoredColor, applyHitFlash } from '../../src/render/mobFlash.js';
import { featureColor } from '../../src/game/mobFeatures.js';

// THE HIT-FLASH WAS A WALK-AND-STOMP.
//
// MobModel's flash traversed the whole group and wrote ONE colour — the body colour derived from
// `entity.color` — into every flashable material. But feature materials are authored DIFFERENTLY:
// `featureColor(tone, base)` returns '#e6dcc4' for bone and a 0.55-scaled base for dark. Nothing in the
// imperative layer recorded what each material's declared colour was, so the first hit-flash to resolve
// overwrote every feature tone with the body colour — permanently, since nothing ever restores them.
//
// The villager's nose, every bone-toned feature and every darkened accent went flat after one hit. And it
// is invisible in a still frame of an unhit mob, which is why the visual baselines never caught it: the
// damage has to be inflicted first.
//
// The fix gives each material a record of its OWN authored colour, so restore means "back to what this
// material declared" rather than "back to what the body declared".
describe('rememberAuthoredColor / restoreAuthoredColor — per-material, not per-group', () => {
  const mat = (hex) => {
    const m = new THREE.MeshToonMaterial({ color: hex });
    m.emissive = new THREE.Color(0x000000);
    return m;
  };

  it('records the colour a material was authored with', () => {
    const m = mat('#e6dcc4');
    rememberAuthoredColor(m);
    expect(m.userData.authoredColor.getHexString()).toBe('e6dcc4');
  });

  it('restores each material to ITS OWN colour, not a shared one — the whole defect', () => {
    // Two materials, deliberately different, exactly as a body and a bone feature are.
    const body = mat('#228B22');
    const bone = mat('#e6dcc4');
    [body, bone].forEach(rememberAuthoredColor);

    applyHitFlash([body, bone], new THREE.Color('#ff0000'), true);
    expect(body.color.getHexString(), 'body did not flash').toBe('ff0000');
    expect(bone.color.getHexString(), 'feature did not flash').toBe('ff0000');

    [body, bone].forEach(restoreAuthoredColor);
    expect(body.color.getHexString()).toBe('228b22');
    expect(
      bone.color.getHexString(),
      'the bone feature came back as the BODY colour — its authored tone was stomped'
    ).toBe('e6dcc4');
  });

  it('survives repeated hits without drifting', () => {
    // The permanent part of the bug: nothing restored the feature, so every hit compounded. Three cycles.
    const bone = mat('#e6dcc4');
    rememberAuthoredColor(bone);
    for (let i = 0; i < 3; i++) {
      applyHitFlash([bone], new THREE.Color('#ff0000'), true);
      restoreAuthoredColor(bone);
    }
    expect(bone.color.getHexString(), 'the tone drifted across repeated hits').toBe('e6dcc4');
  });

  it('remember is idempotent — a re-render must not capture the FLASH colour as authored', () => {
    // The trap in the fix. If remember ran again while flashing, it would record red as the authored
    // colour and the material would restore to red forever. Worse than the original bug.
    const bone = mat('#e6dcc4');
    rememberAuthoredColor(bone);
    applyHitFlash([bone], new THREE.Color('#ff0000'), true);
    rememberAuthoredColor(bone); // a re-render mid-flash
    restoreAuthoredColor(bone);
    expect(bone.color.getHexString(), 'the flash colour was captured as authored').toBe('e6dcc4');
  });

  it('restore is a no-op on a material that was never remembered, rather than throwing', () => {
    const m = mat('#123456');
    expect(() => restoreAuthoredColor(m)).not.toThrow();
    expect(m.color.getHexString()).toBe('123456');
    expect(() => restoreAuthoredColor(null)).not.toThrow();
  });

  it('applyHitFlash reports the DENOMINATOR it touched', () => {
    // Every assertion above reads a colour. A flash that touched nothing would leave a fresh material at
    // its authored colour too, and pass. The count is what separates the two.
    const a = mat('#111111');
    const b = mat('#222222');
    expect(applyHitFlash([a, b], new THREE.Color('#ff0000'), true)).toBe(2);
    expect(applyHitFlash([], new THREE.Color('#ff0000'), true)).toBe(0);
    expect(applyHitFlash(null, new THREE.Color('#ff0000'), true)).toBe(0);
  });

  it('featureColor really does return something different from the base — the premise', () => {
    // If featureColor returned the base for every tone, the whole finding would be vacuous and these
    // tests would pass against the broken code. Assert the premise rather than assume it.
    expect(featureColor('bone', '#228B22')).not.toBe('#228B22');
    expect(featureColor('dark', '#228B22')).not.toBe('#228B22');
    expect(featureColor('body', '#228B22')).toBe('#228B22');
  });
});
