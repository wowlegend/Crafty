// shadowReset.js — a shadow that follows its tier (plan docs/superpowers/plans/2026-09-23-crafty-perf-heat-ipad.md,
// Task 5). three r172 allocates a light's shadow render target, and updates its shadow camera's projection, ONLY when
// `shadow.map === null` (WebGLShadowMap.render) — but it takes the per-frame VIEWPORT from the current `mapSize`. So a
// quality-tier change (PerformanceMonitor steps an iPad low -> med -> high: map 512 -> 1024 -> 2048, extent +-40 ->
// +-72) left the old 512 target rendered through a 2048 viewport over a stale frustum: shadows cut, shifted and
// scaled — Kevin's "visuals very buggy" on iPad is the prime suspect. Dropping the map makes three build a new one at
// the new size on its next shadow render; the projection is refreshed here because pierced shadow-camera-* props
// never refresh it.

/** Drop `shadow`'s render target (three re-allocates it at the current mapSize) and refresh its projection. */
export function resetShadowForConfig(shadow) {
  if (!shadow) return false;
  const had = !!shadow.map;
  if (shadow.map) {
    shadow.map.dispose();
    shadow.map = null;
  }
  shadow.camera?.updateProjectionMatrix?.();
  return had;
}
