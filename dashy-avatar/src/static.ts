import { createDashy, STATE_KEYS, type Dashy, type DashyOptions, type DashyState, type Geometry, type Shape } from './core';
import { layout, type Style } from './render';
import { createDecor, faceDecorSvg, particlesSvg, shadowSvg, type Decor, type DecorLook } from './decor';
import type { Look } from './timeline';
import { smallGeometry, type Variant } from './small';
import { DEFAULT_COLORS, type Colors } from './definition';
import { backgroundDefs, type Background } from './photo';

export const ALL_STATES: DashyState[] = [...STATE_KEYS];

/** Moment (ms) at which a state is photographed. `received` hands over to `working` after 650 ms, so it is taken earlier. */
const SAMPLE_MS: Partial<Record<DashyState, number>> = { received: 400 };
const DEFAULT_SAMPLE_MS = 3000;

/**
 * One deterministic still of a state, straight from core.ts: same seed and pointer, 60 fps, first frame
 * at or after the sample moment where the eyes are open (never a half-blink). Moving states (working,
 * dancing) are simply a pose of the loop.
 */
export function settledGeometry(state: DashyState, shape: Shape = 'square', seed = 3): Geometry {
  const d = createDashy({ seed });
  d.setShape(shape);
  d.setState(state, 0);
  const end = SAMPLE_MS[state] ?? DEFAULT_SAMPLE_MS;
  let G!: Geometry;
  for (let ms = 0; ms <= end + 1500; ms += 1000 / 60) {
    d.pointer(0, 0, ms);
    G = d.step(ms);
    if (ms >= end && G.eyes[0].blink === 0) break;
  }
  return G;
}

export interface StaticOptions {
  variant?: Exclude<Variant, 'auto'>;
  /** Fill behind the body for app icons (full bleed): a colour, or a linear/radial gradient. Omit for transparent. */
  background?: Background;
  /** Body, eye and outline colours (and blush, mouth, accent for the decor). Default: white body, near-black eyes. */
  colors?: Partial<Colors>;
  /** Extra space around the body, in the 300-unit coordinate system. Default 20 (= viewBox 20..280). */
  margin?: number;
  /** Title text for screen readers / file previews. */
  title?: string;
  /** Prefix for clipPath/mask ids so several SVGs can share one page. */
  idPrefix?: string;
  /** Eye roundness, shine and outline width (see Style). */
  style?: Style;
  /** Mouth, blush, shadow and effects to draw with this frame (from createDecor or settledFrame). Omit for just the eyes. */
  decor?: Decor;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The pieces of one frame: what goes in <defs> and what is drawn. Shared by the still and the animated export. */
function renderParts(G0: Geometry, o: StaticOptions, id: string): { defs: string; body: string } {
  const small = o.variant === 'small';
  const L = layout(small ? smallGeometry(G0) : G0, small, o.style);
  const c = { ...DEFAULT_COLORS, ...o.colors };
  const D = small ? undefined : o.decor;
  const shine = L.eyes[0].shine.r !== '0';
  const eye = (side: 'L' | 'R', i: number) => {
    const e = L.eyes[i];
    const attrs = (a: Record<string, string>) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
    return { mask: `<mask id="${id}m${side}" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect fill="#fff" ${attrs(e.pill)}/><rect fill="#000" ${attrs(e.lid)}/><ellipse fill="#000" ${attrs(e.low)}/></mask>`,
      use: `<g transform="${e.group}"><rect x="-80" y="-100" width="160" height="200" fill="${esc(c.eyes)}" mask="url(#${id}m${side})"/>${shine ? `<circle ${attrs(e.shine)} fill="#fff" mask="url(#${id}m${side})"/>` : ''}</g>` };
  };
  const l = eye('L', 0), r = eye('R', 1);
  const dc = { mouth: esc(c.mouth), blush: esc(c.blush), accent: esc(c.accent), glyph: esc(c.eyes) };
  const faceDecor = D ? faceDecorSvg(D, dc) : '';
  const fx = D ? particlesSvg(D, dc, G0.body.tx - 150, G0.body.ty - 260) : '';
  return {
    defs: `<clipPath id="${id}c"><rect x="40" y="40" width="220" height="220" rx="${L.clipRx}"/></clipPath>${l.mask}${r.mask}`,
    body: `${D ? shadowSvg(D, dc) : ''}<g transform="${L.body}"><rect x="40.5" y="40.5" width="219" height="219" rx="${L.outlineRx}" fill="${esc(c.body)}" stroke="${esc(c.outline)}" stroke-width="${L.outlineWidth}"/><g clip-path="url(#${id}c)"><g transform="${L.face}">${faceDecor}${l.use}${r.use}</g></g></g>${fx}`,
  };
}

/** A self-contained static SVG of one geometry (no scripts, no external references). */
export function renderSvg(G0: Geometry, o: StaticOptions = {}): string {
  const id = o.idPrefix ?? 'd';
  const m = o.margin ?? 20, size = 300 - 2 * m;
  const P = renderParts(G0, o, id);
  const bgd = o.background ? backgroundDefs(o.background, id) : null;
  const bg = bgd ? `<rect x="0" y="0" width="300" height="300" fill="${bgd.fill}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m} ${m} ${size} ${size}" role="img">
<title>${esc(o.title ?? 'Dashy')}</title>
<defs>${P.defs.replace(/(<\/clipPath>)/, `$1${bgd ? bgd.defs : ''}`)}</defs>
${bg}${P.body}
</svg>
`;
}

export interface Frame { G: Geometry; D: Decor }
export interface RecordOptions extends DashyOptions {
  shape?: Shape;
  style?: Style;
  /** Length in ms. Default 2000. */
  durationMs?: number;
  /** Frames per second. Default 24. */
  fps?: number;
  /** Let the state settle for this long before recording. Default 1200 ms (0 for received, so the jump is in it). */
  warmupMs?: number;
  /** A custom expression on top of the state: eyes and decor. */
  look?: Look | null;
  decorLook?: DecorLook | null;
}

/** Applies a Style to a fresh core (body corners and eyes). */
export function applyStyle(d: Dashy, style: Style = {}, shape?: Shape) {
  if (shape) d.setShape(shape);
  if (style.roundness !== undefined) d.setCornerRadius(style.roundness * 110);
  if (style.eyeWidth !== undefined) d.setEyeWidth(style.eyeWidth);
  if (style.eyeSpacing !== undefined) d.setEyeSpacing(style.eyeSpacing);
  if (style.eyeScale !== undefined) d.setEyeScale(style.eyeScale);
}

/** Deterministic frames of a state, straight from core.ts and decor.ts: for animated exports and sprite sheets. */
export function recordFrames(state: DashyState, o: RecordOptions = {}): Frame[] {
  const { shape, style = {}, durationMs = 2000, fps = 24, warmupMs, look, decorLook, ...core } = o;
  const d = createDashy({ seed: 3, ...core }); applyStyle(d, style, shape);
  const decor = createDecor(style);
  d.setState(state, 0); if (look) d.setLook(look); if (decorLook) decor.setLook(decorLook);
  const warm = warmupMs ?? (state === 'received' ? 0 : 1200), dt = 1000 / 60, out: Frame[] = [];
  let t = 0;
  for (; t < warm; t += dt) { d.pointer(0, 0, t); decor.step(d.step(t), t); }
  const n = Math.max(1, Math.round(durationMs / 1000 * fps));
  for (let i = 0; i < n; i++) {
    const target = warm + i * 1000 / fps;
    let G = d.step(t);
    while (t < target) { t += dt; d.pointer(0, 0, t); G = d.step(t); }
    out.push({ G, D: decor.step(G, t) });
  }
  return out;
}

/** One still with decor: settledGeometry plus the mouth, blush and effects of that moment. */
export function settledFrame(state: DashyState, o: Omit<RecordOptions, 'durationMs' | 'fps' | 'warmupMs'> = {}): Frame {
  const { shape, style = {}, look, decorLook, ...core } = o;
  const d = createDashy({ seed: 3, ...core }); applyStyle(d, style, shape);
  const decor = createDecor(style);
  d.setState(state, 0); if (look) d.setLook(look); if (decorLook) decor.setLook(decorLook);
  const end = SAMPLE_MS[state] ?? DEFAULT_SAMPLE_MS;
  let G!: Geometry, D!: Decor;
  for (let ms = 0; ms <= end + 1500; ms += 1000 / 60) {
    d.pointer(0, 0, ms);
    G = d.step(ms); D = decor.step(G, ms);
    if (ms >= end && G.eyes[0].blink === 0) break;
  }
  return { G, D };
}

/**
 * An animated SVG (SMIL, no scripts): every frame is drawn once and shown in turn. Plays in browsers and most
 * design tools; loops forever.
 */
export function renderAnimatedSvg(frames: Frame[], fps = 24, o: Omit<StaticOptions, 'decor'> = {}): string {
  const id = o.idPrefix ?? 'a';
  const m = o.margin ?? 20, size = 300 - 2 * m, n = frames.length, dur = (n / fps).toFixed(3);
  const bgd = o.background ? backgroundDefs(o.background, id) : null;
  let defs = bgd ? bgd.defs : '', body = bgd ? `<rect x="0" y="0" width="300" height="300" fill="${bgd.fill}"/>` : '';
  frames.forEach((fr, i) => {
    const P = renderParts(fr.G, { ...o, decor: fr.D }, `${id}${i}_`);
    defs += P.defs;
    const k = (x: number) => (x / n).toFixed(4);
    const anim = n === 1 ? '' : i === 0 ? `<animate attributeName="visibility" values="visible;hidden" keyTimes="0;${k(1)}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>`
      : `<animate attributeName="visibility" values="hidden;visible${i < n - 1 ? ';hidden' : ''}" keyTimes="0;${k(i)}${i < n - 1 ? ';' + k(i + 1) : ''}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>`;
    body += `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${anim}${P.body}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m} ${m} ${size} ${size}" role="img">
<title>${esc(o.title ?? 'Dashy')}</title>
<defs>${defs}</defs>
${body}
</svg>
`;
}

/**
 * For app icons: the pose of a moving body is a random moment of a bounce, so keep the expression (eyes, gaze) and
 * hold the body still. A barely-there lid (under 10%, as in idle) would only shave a flat spot off the round eye
 * top at 1024 px, so it is dropped here.
 */
export function stillGeometry(G: Geometry): Geometry {
  return { ...G, eyes: G.eyes.map(e => (e.cov < 0.1 ? { ...e, cov: 0 } : e)), body: { tx: 150, ty: 260, rot: 0, sx: 1, sy: 1 }, face: { ...G.face, rot: 0, sx: 1.01, sy: 1.01 } };
}
