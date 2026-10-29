// A 1-HP zombie staged where the player's next swing will meet it, for the specs that need one kill (talents, forge).
//
// WHY A SHARED HELPER. Both specs staged their zombie 2.5 m along the camera's facing on whatever floor stood there, then
// turned the camera at it. The melee cone (combat/cone.js isPointInCone, through GameMethods.checkMobsInMeleeCone)
// measures from the swing's apex over the BODY and drops a target more than 2.2 m above or below it or past 4.5 m, so a
// zombie on another level of the hub's raised grade, or one placed from a camera that was not at the body, sat outside
// the cone; the click then fell through the verb router to the ground and mined it. CI showed it in both specs: the
// talents spec failed three attempts of run 40869763411 and the forge spec runs 40853867973 and 40864829848, each page
// with one more stone or grass in the hotbar than it started with and the zombie still at 1/100.
//
// THE RULE. Walk twelve headings around the body for a column 2.5 m out whose floor is within 0.6 m of the player's,
// skipping any within 60 degrees of a mob of `avoidRole`; spawn there, bring it to 1 HP, turn the camera level along
// the heading, and accept it only when the game's own melee cone from the swing's apex holds it. A heading that fails
// is recorded and its zombie removed; none passing is a SETUP failure naming every heading tried.
//
// Installed by value: page.evaluate serialises it, so it closes over nothing and takes the apex
// (combat/swingOrigin.js SWING_APEX_OVER_BODY_M) as an argument.

/** In the page: `{ id, k }` for the staged zombie and its heading, or `{ why }`. */
export function stageMeleeZombie({ apex, avoidRole = null }) {
  const s = window.useGameStore.getState();
  const cam = window.__threeCamera;
  const body = s.playerRigidBodyRef?.current?.translation();
  if (!body) return { why: 'SETUP: no player body' };
  const origin = { x: body.x, y: body.y + apex, z: body.z };
  const feet = cam.position.y - 1.6;
  const own = s.getMobFloor(body.x, body.z, feet);
  const floor = Number.isFinite(own) ? own : feet;
  const avoid = avoidRole ? window.__craftyTest.call('readMobs').find((e) => e.role === avoidRole) : null;
  const tried = [];
  for (let k = 0; k < 12; k++) {
    const yaw = (k * Math.PI) / 6;
    const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    if (avoid) {
      const ax = avoid.x - body.x, az = avoid.z - body.z, al = Math.hypot(ax, az) || 1;
      if ((dir.x * ax + dir.z * az) / al > 0.5) { tried.push(`${k}: toward ${avoidRole}`); continue; }
    }
    const gx = body.x + dir.x * 2.5, gz = body.z + dir.z * 2.5;
    const f = s.getMobFloor(gx, gz, feet);
    if (!Number.isFinite(f) || Math.abs(f - floor) > 0.6) { tried.push(`${k}: floor ${f} vs ${floor}`); continue; }
    const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
    s.spawnMob(gx, gz, 'zombie', f);
    const m = window.__craftyTest.call('readMobs').find((e) => !before.has(e.id));
    if (!m) return { why: 'SETUP: spawnMob added no zombie' };
    window.GameMethods.damageMob(m.id, m.health - 1, 'physical', 'ally');
    const left = window.__craftyTest.call('readMobs').find((e) => e.id === m.id)?.health;
    if (left !== 1) return { why: `SETUP: the staged zombie has ${left} HP, not 1` };
    cam.rotation.order = 'YXZ'; cam.rotation.x = 0; cam.rotation.y = yaw; cam.updateMatrixWorld();
    if (window.GameMethods.checkMobsInMeleeCone(origin, dir, 4.5, Math.PI / 2).some((e) => e.id === m.id)) return { id: m.id, k };
    tried.push(`${k}: outside the melee cone`);
    window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
  }
  return { why: `SETUP: no heading near the player holds a zombie in the melee cone (${tried.join('; ')})` };
}
