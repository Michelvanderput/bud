import { createDashy, type DashyState, type Geometry, type Shape } from './core';
import { layout } from './render';
import { smallGeometry, type Variant } from './small';
import { DEFAULT_COLORS, type Colors } from './definition';
import { backgroundDefs, type Background } from './photo';

export const ALL_STATES: DashyState[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy'];

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
  /** Body, eye and outline colours. Default: white body, near-black eyes. */
  colors?: Partial<Colors>;
  /** Extra space around the body, in the 300-unit coordinate system. Default 20 (= viewBox 20..280). */
  margin?: number;
  /** Title text for screen readers / file previews. */
  title?: string;
  /** Prefix for clipPath/mask ids so several SVGs can share one page. */
  idPrefix?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A self-contained static SVG of one geometry (no scripts, no external references). */
export function renderSvg(G0: Geometry, o: StaticOptions = {}): string {
  const small = o.variant === 'small';
  const L = layout(small ? smallGeometry(G0) : G0, small);
  const id = o.idPrefix ?? 'd';
  const m = o.margin ?? 20, size = 300 - 2 * m;
  const c = { ...DEFAULT_COLORS, ...o.colors };
  const eye = (side: 'L' | 'R', i: number) => {
    const e = L.eyes[i];
    const attrs = (a: Record<string, string>) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
    return { mask: `<mask id="${id}m${side}" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect fill="#fff" ${attrs(e.pill)}/><rect fill="#000" ${attrs(e.lid)}/><ellipse fill="#000" ${attrs(e.low)}/></mask>`,
      use: `<g transform="${e.group}"><rect x="-80" y="-100" width="160" height="200" fill="${esc(c.eyes)}" mask="url(#${id}m${side})"/></g>` };
  };
  const l = eye('L', 0), r = eye('R', 1);
  const bgd = o.background ? backgroundDefs(o.background, id) : null;
  const bg = bgd ? `<rect x="0" y="0" width="300" height="300" fill="${bgd.fill}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m} ${m} ${size} ${size}" role="img">
<title>${esc(o.title ?? 'Dashy')}</title>
<defs><clipPath id="${id}c"><rect x="40" y="40" width="220" height="220" rx="${L.clipRx}"/></clipPath>${bgd ? bgd.defs : ''}${l.mask}${r.mask}</defs>
${bg}<g transform="${L.body}"><rect x="40.5" y="40.5" width="219" height="219" rx="${L.outlineRx}" fill="${esc(c.body)}" stroke="${esc(c.outline)}" stroke-width="${L.outlineWidth}"/><g clip-path="url(#${id}c)"><g transform="${L.face}">${l.use}${r.use}</g></g></g>
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
