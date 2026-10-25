import type { BlinkConfig } from './timeline';
import type { Geometry } from './core';
import type { DecorStyle } from './decor';

/** How Dashy looks, beyond colours. Everything optional; the defaults are the original Dashy. */
export interface Style extends DecorStyle {
  /** Body corner radius 0..1 (0 = sharp, 0.2 = the square, 1 = circle). Overrides `shape`. */
  roundness?: number;
  /** Outline thickness in core units, 0..6. Default 1. */
  outlineWidth?: number;
  /** Eye width in core units (16..60). Default 34. */
  eyeWidth?: number;
  /** Distance of each eye from the centre (24..46). Default 34. */
  eyeSpacing?: number;
  /** Eye height multiplier (0.5..1.4). Default 55/66. */
  eyeScale?: number;
  /** Eye corners 0..1: 1 = pill (default), 0 = rectangle. */
  eyeRoundness?: number;
  /** A highlight in the eyes, 0..1. Default 0. */
  shine?: number;
}
/** How Dashy moves. */
export interface Motion {
  /** Ambient life 0..2. Default 1. */ ambient?: number;
  /** Head turn 0..2. Default 1. */ perspective?: number;
  /** Playback speed 0.25..3. Default 1. */ speed?: number;
  /** Bounciness of the body 0.4..2.5. Default 1. */ bounce?: number;
  /** Follow the pointer with his eyes. Default true. */ followPointer?: boolean;
  blink?: BlinkConfig;
}

const f = (v: number) => v.toFixed(2);

export interface EyeLayout {
  group: string;
  pill: { x: string; y: string; width: string; height: string; rx: string };
  lid: { x: string; y: string; width: string; height: string; transform: string };
  low: { cx: string; cy: string; rx: string; ry: string };
  shine: { cx: string; cy: string; r: string };
}
export interface Layout {
  outlineWidth: string; outlineRx: string; clipRx: string;
  body: string; face: string; eyes: EyeLayout[];
}

/** Geometry -> the exact SVG attribute values. Shared by the live DOM drawing (svg.ts) and the static export (static.ts). */
export function layout(G: Geometry, small = false, style: Pick<Style, 'eyeRoundness' | 'shine' | 'outlineWidth'> = {}): Layout {
  const round = Math.max(0, Math.min(1, style.eyeRoundness ?? 1)), shine = small ? 0 : Math.max(0, Math.min(1, style.shine ?? 0));
  const b = G.body, fc = G.face;
  return {
    outlineWidth: small ? '8' : f(Math.max(0, Math.min(6, style.outlineWidth ?? 1))).replace(/\.00$/, ''),
    outlineRx: f(Math.max(0, G.rx - 0.5)),
    clipRx: f(G.rx),
    body: `translate(${f(b.tx)} ${f(b.ty)}) rotate(${f(b.rot)}) scale(${f(b.sx)} ${f(b.sy)}) translate(-150 -260)`,
    face: `translate(${f(fc.tx)} ${f(fc.ty)}) rotate(${f(fc.rot)}) scale(${f(fc.sx)} ${f(fc.sy)})`,
    eyes: G.eyes.map(e => {
      const hw = e.ew / 2, eh = e.eh, yb = -eh / 2 + e.cov * eh;
      const ry = eh * 0.62, yt = eh / 2 - e.low * eh;
      const lower = e.low > 0.001;
      return {
        group: `translate(${f(e.x)} ${f(e.y)}) rotate(${f(e.tilt)})`,
        pill: { x: f(-hw), y: f(-eh / 2), width: f(e.ew), height: f(eh), rx: f(Math.min(hw, eh / 2) * round) },
        lid: { x: '-90', y: f(yb - 140), width: '180', height: '140', transform: `rotate(${f(e.lidA)} 0 ${f(yb)})` },
        shine: shine > 0 ? { cx: f(-e.ew * .2), cy: f(-eh * .24), r: f(Math.min(e.ew, eh) * (.1 + .12 * shine)) } : { cx: '0', cy: '0', r: '0' },
        low: lower ? { cx: '0', cy: f(yt + ry), rx: f(e.ew * 0.95), ry: f(ry) } : { cx: '0', cy: '0', rx: '0', ry: '0' },
      };
    }),
  };
}

export interface FaceMotionOptions {
  /** Multiplies how far the face moves inside the block (core.ts moves a small figure, a block is big). Default 2.2. */
  gain?: number;
  /** Squash and stretch of the face, same idea. Default 2. */
  squashGain?: number;
  /** Minimum distance in core units between the eyes and the edge of the block. Default 12. */
  margin?: number;
}
export interface FaceMotion { tx: number; ty: number; rot: number; sx: number; sy: number }

/**
 * Body mode, "the block is Dashy and the block stands still": all the life is in the face. This turns core.ts's face
 * (made for a 220-unit body) into the transform of the face group on a block of any shape and size, in the same coordinate
 * system as the viewBox (the block centre is 150,150; one unit = short side / 220 px).
 * Pure. Presentation only: it amplifies and limits the numbers core.ts gives, it adds no movement of its own.
 * The eyes are guaranteed to stay at least `margin` units inside the block: the shift is limited by the radius that holds both
 * eyes, whatever the tilt, so no rotation or squash can push them out.
 */
export function faceMotion(G: Geometry, w: number, h: number, o: FaceMotionOptions = {}): FaceMotion {
  const gain = o.gain ?? 2.2, squashGain = o.squashGain ?? 2, margin = o.margin ?? 12;
  const u = Math.min(w, h) / 220;
  const hw = w / (2 * u), hh = h / (2 * u); // half size of the block in units
  const dev = (v: number) => Math.max(-0.2, Math.min(0.2, (v / 1.01 - 1) * squashGain));
  const sx = 1.01 * (1 + dev(G.face.sx)), sy = 1.01 * (1 + dev(G.face.sy));
  // radius (in units, around the face centre) that contains every corner of both eyes, whatever the tilt, after scaling
  let r = 0;
  for (const e of G.eyes) r = Math.max(r, Math.hypot(Math.abs(e.x) + e.ew / 2 + 0.2 * e.eh, Math.abs(e.y) + e.eh / 2 + 0.2 * e.ew));
  r *= Math.max(sx, sy);
  const ax = Math.max(0, hw - margin - r), ay = Math.max(0, hh - margin - r);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  return { tx: 150 + clamp((G.face.tx - 150) * gain, ax), ty: 150 + clamp((G.face.ty - 150) * gain, ay), rot: G.face.rot, sx, sy };
}
