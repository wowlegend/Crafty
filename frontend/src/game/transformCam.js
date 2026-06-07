/**
 * transformCam.js — S2-B1-M7a: the WILDHEART third-person TRANSFORM-CAM (pure).
 *
 * The hybrid beachhead (Kevin 2026-06-07): on roar, a ~1.2s third-person camera pulls back behind the
 * player to SHOW the beast morph (the clip-worthy reveal), then returns to first-person. This module is
 * the PURE geometry+timing of that move — Components owns the ref-timer + applies the pose to the live
 * camera (Game-Loop-Isolation). It BLENDS the FPV pose (f=0 identity — head, looking forward) toward a
 * third-person pose (f=1 — behind+above, looking at mid-body) by an envelope, so f=0 is byte-identical
 * to the existing first-person camera and there is no degenerate camera==lookAt frame.
 *
 * All numbers are Kevin-tunable (the in-world dial is M7d). FPV combat aim/hit-reg is untouched — this
 * is a transient camera OVERRIDE during the roar window only.
 */
export const TRANSFORM_CAM_SEC = 1.2;  // total window: anticipation pull-back -> reveal hold -> return

const HEAD_Y = 1.2;     // FPV eye height above the rigidbody translation (matches Components' head-lerp)
const BODY_Y = 0.6;     // third-person look-at height (mid-body)
const MAX_DIST = 4.5;   // how far behind the player the third-person camera sits
const RISE_Y = 1.0;     // how much the camera rises as it pulls back

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); }; // smoothstep
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * transformCamEnvelope(progress) -> blend factor f in [0,1] over the window:
 *   pull BACK (0 -> 1) during [0, 0.30], HOLD the reveal (=1) during [0.30, 0.75], RETURN (1 -> 0)
 *   during [0.75, 1]. f=0 means full FPV, f=1 means full third-person.
 */
export function transformCamEnvelope(progress) {
  const p = clamp01(progress);
  if (p < 0.30) return smooth(p / 0.30);
  if (p < 0.75) return 1;
  return 1 - smooth((p - 0.75) / 0.25);
}

/**
 * transformCamPose(playerPos, forward, progress) -> { position:[x,y,z], lookAt:[x,y,z] }.
 * `playerPos` = the rigidbody translation [x,y,z]; `forward` = a horizontal facing unit vector [fx, fy, fz]
 * (fy ignored — captured at roar-start so the reveal is a stable behind-shot, not mouse-jittered).
 * Blends FPV (f=0) -> third-person (f=1) by the envelope. f=0 returns EXACTLY the FPV head pose.
 */
export function transformCamPose(playerPos, forward, progress) {
  const f = transformCamEnvelope(progress);
  const [px, py, pz] = playerPos;
  const fx = forward[0], fz = forward[2];
  // FPV pose (f=0): at the head, looking forward.
  const fpvPos = [px, py + HEAD_Y, pz];
  const fpvLook = [px + fx, py + HEAD_Y, pz + fz];
  // Third-person pose (f=1): behind (-forward * MAX_DIST) + above (RISE_Y), looking at mid-body.
  const tpvPos = [px - fx * MAX_DIST, py + HEAD_Y + RISE_Y, pz - fz * MAX_DIST];
  const tpvLook = [px, py + BODY_Y, pz];
  return {
    position: [lerp(fpvPos[0], tpvPos[0], f), lerp(fpvPos[1], tpvPos[1], f), lerp(fpvPos[2], tpvPos[2], f)],
    lookAt: [lerp(fpvLook[0], tpvLook[0], f), lerp(fpvLook[1], tpvLook[1], f), lerp(fpvLook[2], tpvLook[2], f)],
  };
}
