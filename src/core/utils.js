// Shared math / RNG helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
}

export const cellKey = (x, y, z) => `${x},${y},${z}`;

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// 8-direction keys ordered by screen angle (atan2(screenX, screenZ); front = toward viewer).
export const DIR_KEYS = [
  "front", "front_right", "right", "back_right",
  "back", "back_left", "left", "front_left",
];

// World-space direction (wx, wz) -> 8-dir sprite key, given the camera orbit yaw.
export function worldDirToSpriteKey(wx, wz, cameraYaw) {
  const c = Math.cos(cameraYaw);
  const s = Math.sin(cameraYaw);
  const sx = c * wx - s * wz; // screen right
  const sz = s * wx + c * wz; // toward viewer
  if (sx * sx + sz * sz < 1e-8) return "front";
  const angle = Math.atan2(sx, sz); // 0 = front, +45deg = front_right
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return DIR_KEYS[index];
}
