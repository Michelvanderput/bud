import type { EyeGeometry, Geometry } from './core';

/** Sizes (px) at or below which the "auto" variant switches to the small drawing. */
export const SMALL_MAX_PX = 32;
export type Variant = 'full' | 'small' | 'auto';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const EYE_WIDEN = 1.35;

/**
 * Small-size variant (24 to 32 px, e.g. menu bar or favicon). Pure: takes what core.ts computed and
 * simplifies it, so no animation of its own is introduced.
 * - body: no spring physics (squash, bounce, rotation are dropped; the body stays still)
 * - face: follows the gaze only, without rotation or squash
 * - eyes: wider, no tilt; a lid of 10% or more becomes at least 25% thick (lighter ones, like idle, are dropped so he does not look sleepy) and slants harder,
 *   a happy lower lid is at least 40%, so the expression survives at a few pixels
 */
export function smallGeometry(G: Geometry): Geometry {
  return {
    cur: G.cur,
    rx: G.rx,
    body: { tx: 150, ty: 260, rot: 0, sx: 1, sy: 1 },
    face: { tx: G.face.tx, ty: G.face.ty, rot: 0, sx: 1.01, sy: 1.01 },
    eyes: G.eyes.map((e): EyeGeometry => ({
      ...e,
      tilt: 0,
      ew: e.ew * EYE_WIDEN,
      cov: e.cov > 0.1 ? clamp(0.25 + e.cov * 0.9, 0, 0.9) : 0,
      lidA: clamp(e.lidA * 1.6, -40, 40),
      low: e.low > 0.001 ? Math.max(e.low, 0.4) : 0,
    })),
  };
}
