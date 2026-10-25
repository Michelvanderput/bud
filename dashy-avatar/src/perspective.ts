/**
 * Head turn: a little 3D for a flat face. The face is treated as a ball with the eyes on its surface; when Dashy looks
 * sideways the ball turns, so the eye on the far side is seen at a slant (narrower) and the near eye is a touch closer
 * (a touch bigger). Looking up or down squashes the eyes in height the same way.
 * Pure, and it only ever makes the eyes smaller or barely bigger, so they cannot be pushed out of the body.
 */
const R = 120;          // radius of the ball the eyes sit on
const F = 620;          // focal length of the camera
const MAX_YAW = .36, MAX_PITCH = .22; // radians at full gaze (about 21 and 13 degrees)

export interface EyePerspective { fw: number; fh: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * @param gx gaze -1..1 (right is positive), @param gy gaze -1..1 (down is positive)
 * @param eyeX distance of this eye from the face centre in core units, negative for the left eye
 * @param strength 0 = flat (factors are 1), 1 = default
 */
export function eyePerspective(gx: number, gy: number, eyeX: number, strength = 1): EyePerspective {
  if (strength <= 0) return { fw: 1, fh: 1 };
  const yaw = clamp(gx, -1, 1) * MAX_YAW * strength, pitch = clamp(gy, -1, 1) * MAX_PITCH * strength;
  const x0 = clamp(eyeX, -R * .9, R * .9), z0 = Math.sqrt(R * R - x0 * x0);
  const a0 = Math.atan2(x0, z0);
  // yaw: rotate around the vertical axis; the angle between the eye's surface normal and the line of sight grows on the far side
  const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw), z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
  const aYaw = Math.atan2(x1, z1);
  // pitch: same around the horizontal axis (the eye sits at height 0, so only its depth changes)
  const z2 = z1 * Math.cos(pitch), y2 = -z1 * Math.sin(pitch);
  const aPitch = Math.atan2(y2, z2);
  const near = F / (F - z2) / (F / (F - z0)); // perspective: closer to the camera = bigger
  return {
    fw: clamp((Math.cos(aYaw) / Math.cos(a0)) * near, .55, 1.08),
    fh: clamp(Math.cos(aPitch) * near, .6, 1.05),
  };
}
