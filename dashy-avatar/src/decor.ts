/**
 * Decor: everything on top of the two eyes. A mouth, blush, a shine in the eyes, a ground shadow and little effects
 * (Zzz, hearts, sparkles, a question mark...). Pure like core.ts: no DOM, no timers, no randomness. You pass the time and
 * the geometry core.ts gave you, it hands back what to draw. Effects are a function of the time since they started,
 * so a still or an exported animation replays exactly.
 */
import type { DashyState, Geometry } from './core';

export type Effect = 'none' | 'zzz' | 'hearts' | 'sparkles' | 'stars' | 'question' | 'exclaim' | 'sweat' | 'tear'
  | 'notes' | 'steam' | 'dots' | 'thought' | 'confetti' | 'waves'
  | 'sob' | 'snow' | 'flame' | 'rain' | 'bulb' | 'spinner' | 'check' | 'cross' | 'bubbles' | 'bolt';
export const EFFECTS: readonly Effect[] = ['none', 'zzz', 'hearts', 'sparkles', 'stars', 'question', 'exclaim', 'sweat', 'tear', 'notes', 'steam', 'dots', 'thought', 'confetti', 'waves',
  'sob', 'snow', 'flame', 'rain', 'bulb', 'spinner', 'check', 'cross', 'bubbles', 'bolt'];

/** What an expression can set beyond the eyes. All optional: what is left out comes from the state. */
export interface DecorLook {
  /** 0..1 */ blush?: number;
  /** mouth curve, -1 (frown) .. 1 (smile) */ mouth?: number;
  /** how far the mouth is open, 0..1 */ open?: number;
  /** mouth width, 0.3..1.6 (1 = 26 units) */ mouthWidth?: number;
  fx?: Effect;
}
export const DECOR_RANGE: Record<'blush' | 'mouth' | 'open' | 'mouthWidth', [number, number]> = { blush: [0, 1], mouth: [-1, 1], open: [0, 1], mouthWidth: [.3, 1.6] };

type Full = Required<DecorLook>;
const d = (mouth: number, open: number, mouthWidth: number, blush: number, fx: Effect): Full => ({ mouth, open, mouthWidth, blush, fx });
export const STATE_DECOR: Record<DashyState, Full> = {
  idle: d(.25, 0, 1, 0, 'none'), received: d(.3, .35, .8, 0, 'exclaim'), working: d(0, 0, .7, 0, 'none'),
  thinking: d(-.1, 0, .6, 0, 'thought'), waiting: d(0, 0, .8, 0, 'none'), blocked: d(-.5, 0, .9, 0, 'sweat'),
  done: d(.9, .3, 1.1, .3, 'sparkles'), happy: d(.8, .15, 1.1, .4, 'none'), sad: d(-.7, 0, .9, 0, 'tear'),
  angry: d(-.6, 0, .8, 0, 'steam'), strict: d(-.2, 0, .9, 0, 'none'), dancing: d(.9, .5, 1, .3, 'notes'),
  sleepy: d(0, .2, .5, 0, 'zzz'), surprised: d(0, 1, .6, 0, 'exclaim'), love: d(.8, 0, 1, .9, 'hearts'),
  confused: d(-.25, 0, .8, 0, 'question'), excited: d(1, .7, 1.2, .5, 'confetti'), scared: d(-.4, .4, .7, 0, 'sweat'),
  curious: d(.1, .2, .5, 0, 'none'), proud: d(.6, 0, 1.1, .2, 'sparkles'), dizzy: d(-.1, .3, .7, 0, 'stars'),
  bored: d(-.1, 0, .7, 0, 'dots'), wink: d(.7, 0, 1, .3, 'sparkles'), talking: d(.2, .3, .8, 0, 'none'),
  listening: d(.1, 0, .6, 0, 'waves'), shy: d(.3, 0, .5, 1, 'none'),
  laughing: d(1, .85, 1.25, .5, 'sparkles'), crying: d(-.9, .45, .9, .2, 'sob'), sick: d(-.35, .1, .7, 0, 'bubbles'),
  cool: d(.45, 0, .6, 0, 'none'), mischief: d(.75, 0, .75, .15, 'none'), determined: d(-.15, 0, .7, 0, 'bolt'),
  relieved: d(.4, .1, .9, .15, 'sweat'), nervous: d(-.2, .1, .7, 0, 'sweat'), cold: d(-.3, .15, .6, 0, 'snow'),
  hot: d(-.1, .35, .8, .7, 'flame'), starstruck: d(.6, .55, .9, .4, 'stars'), nodding: d(.5, 0, .9, .1, 'check'),
  searching: d(0, .1, .5, 0, 'question'), loading: d(0, 0, .6, 0, 'spinner'), success: d(.9, .3, 1.1, .3, 'check'),
  error: d(-.4, .2, .8, 0, 'cross'), idea: d(.5, .4, .7, 0, 'bulb'), gloomy: d(-.5, 0, .8, 0, 'rain'),
};

export interface DecorStyle {
  /** Draw a mouth. Default false: Dashy is two eyes. */
  mouth?: boolean;
  /** 'auto' (default): blush when the state or expression wants it; 'always'; 'off'. */
  blush?: 'auto' | 'always' | 'off';
  /** Little effects around the body. Default true. */
  effects?: boolean;
  /** Ground shadow. Default false. */
  shadow?: boolean;
}

export interface Particle {
  kind: Exclude<Effect, 'none'>;
  /** core units, in body space (the 300 x 300 system, before the body moves) */
  x: number; y: number; scale: number; rot: number; opacity: number;
  /** a variant index (confetti colour, which note...) */
  v: number;
}
export interface Mouth { x: number; y: number; curve: number; open: number; width: number }
export interface Blush { x: number; y: number; opacity: number }
export interface Decor {
  mouth: Mouth | null;
  blush: Blush[];
  shadow: { cx: number; rx: number; opacity: number } | null;
  particles: Particle[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** Deterministic 0..1 per integer, for per-particle variation without randomness. */
const hash = (n: number, k = 0) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return (h >>> 0) / 4294967295; };

/**
 * An emitter: a new particle every `period` ms, each living `life` ms. Calls `make` with the particle's index and its
 * progress 0..1, for every particle alive at `t` (ms since the effect started).
 */
function emit(t: number, period: number, life: number, make: (i: number, p: number) => Particle | null, out: Particle[], first = 0) {
  const newest = Math.floor((t - first) / period);
  for (let i = Math.max(0, newest - Math.ceil(life / period)); i <= newest; i++) {
    const p = (t - first - i * period) / life;
    if (p < 0 || p >= 1) continue;
    const q = make(i, p); if (q) out.push(q);
  }
}
const fade = (p: number, inn = .15, out = .3) => Math.min(smooth(p / inn), smooth((1 - p) / out));

/** The particles of one effect `t` ms after it started. `G` gives the eye positions for effects that come from the eyes. */
export function effectAt(fx: Effect, t: number, G?: Geometry): Particle[] {
  const out: Particle[] = [];
  const P = (kind: Particle['kind'], x: number, y: number, scale: number, rot: number, opacity: number, v = 0): Particle => ({ kind, x, y, scale, rot, opacity, v });
  switch (fx) {
    case 'none': break;
    case 'zzz': emit(t, 900, 2700, (i, p) => P('zzz', 222 + p * 26 + Math.sin(p * 6 + i) * 4, 70 - p * 50, .6 + p * .7, -12 + Math.sin(i) * 8, fade(p)), out); break;
    case 'hearts': emit(t, 520, 2200, (i, p) => { const s = hash(i); return P('hearts', 70 + s * 160 + Math.sin(p * 7 + i) * 8, 90 - p * 80, (.5 + hash(i, 1) * .5) * (.6 + smooth(p / .2) * .4), Math.sin(p * 5 + i) * 14, fade(p)); }, out); break;
    case 'sparkles': emit(t, 380, 1100, (i, p) => { const a = hash(i) * Math.PI * 2, r = 118 + hash(i, 1) * 26; return P('sparkles', 150 + Math.cos(a) * r, 150 + Math.sin(a) * r * .95, Math.sin(p * Math.PI) * (.6 + hash(i, 2) * .6), p * 90, 1); }, out); break;
    case 'stars': for (let k = 0; k < 4; k++) { const a = t / 650 + k * Math.PI / 2; out.push(P('stars', 150 + Math.cos(a) * 70, 42 + Math.sin(a) * 14, .75 + Math.sin(a) * .2, t / 6 + k * 40, smooth(t / 300) * (.75 + Math.sin(a) * .25))); } break;
    case 'question': { const p = (t % 2600) / 2600; out.push(P('question', 240, 52 - smooth(p / .25) * 10 + Math.sin(t / 380) * 3, 1, Math.sin(t / 520) * 10, fade(p, .12, .12))); break; }
    case 'exclaim': { const pop = smooth(t / 180), sh = t < 600 ? Math.sin(t / 25) * (1 - t / 600) * 8 : 0; out.push(P('exclaim', 238, 50, pop * (1 + Math.max(0, .35 - t / 1000)), sh, t > 2400 ? smooth(1 - (t - 2400) / 400) : 1)); break; }
    case 'sweat': emit(t, 1800, 1600, (i, p) => P('sweat', 236, 72 + smooth(p) * 26, .9 + Math.sin(p * Math.PI) * .2, 0, fade(p, .2, .25)), out); break;
    case 'tear': {
      const e = G?.eyes[0], ex = e ? e.x : -34, ey = e ? e.y + e.eh / 2 : 26;
      emit(t, 1500, 1400, (i, p) => P('tear', 150 + ex * .5 + (i % 2 ? 6 : -4), 150 + ey * .5 + 6 + p * p * 70, .8, 0, fade(p, .15, .3)), out); break;
    }
    case 'notes': emit(t, 600, 2200, (i, p) => { const side = i % 2 ? 1 : -1; return P('notes', 150 + side * (100 + p * 30) + Math.sin(p * 8 + i) * 6, 110 - p * 90, .8 + hash(i) * .3, side * (10 + Math.sin(p * 6) * 12), fade(p), i % 2); }, out); break;
    case 'steam': emit(t, 260, 1100, (i, p) => { const side = i % 2 ? 1 : -1; return P('steam', 150 + side * (88 + p * 26), 48 - p * 34, .5 + p * 1.1, 0, fade(p, .1, .5) * .8); }, out); break;
    case 'dots': { const n = Math.floor((t % 2400) / 500); for (let k = 0; k < 3; k++) if (k < n || n >= 4) out.push(P('dots', 222 + k * 14, 44, 1, 0, smooth(((t % 2400) - k * 500) / 160))); break; }
    case 'thought': { const n = (t % 3000) / 3000; for (let k = 0; k < 3; k++) { const on = smooth((n - k * .18) / .12) * smooth((1 - n) / .1); out.push(P('thought', 220 + k * 16, 62 - k * 14, (.5 + k * .35) * on, 0, on)); } break; }
    case 'confetti': emit(t, 70, 1700, (i, p) => { const s = hash(i), x0 = 40 + s * 220, vy = -1 + hash(i, 1) * .4; const y = 60 + vy * 120 * p + 220 * p * p; return P('confetti', x0 + Math.sin(p * 9 + i) * 10, y, .9, p * 720 * (hash(i, 2) - .5), fade(p, .05, .2), i % 5); }, out); break;
    case 'waves': emit(t, 700, 2100, (i, p) => P('waves', 64 - p * 30, 140, .6 + p * .9, 0, fade(p, .1, .6)), out); break;
    case 'sob': for (const k of [0, 1]) {
      const e = G?.eyes[k], ex = e ? e.x : (k ? 34 : -34), ey = e ? e.y + e.eh / 2 : 26;
      emit(t, 380, 1000, (i, p) => P('tear', 150 + ex * .5 + (k ? 8 : -8) + p * (k ? 14 : -14), 150 + ey * .5 + 4 + p * 60, .7 + p * .3, 0, fade(p, .1, .3)), out, k * 190);
    } break;
    case 'snow': emit(t, 260, 2600, (i, p) => P('snow', 30 + hash(i) * 240 + Math.sin(p * 6 + i) * 8, 24 + p * 250, .5 + hash(i, 1) * .6, p * 120, fade(p, .08, .2)), out); break;
    case 'flame': for (let k = 0; k < 3; k++) { const fl = Math.sin(t / 85 + k * 2.1) * .5 + Math.sin(t / 47 + k) * .5; out.push(P('flame', 112 + k * 38, 38 - (k === 1 ? 8 : 0), (k === 1 ? 1.15 : .9) * (1 + fl * .12), fl * 6, smooth(t / 250), k)); } break;
    case 'rain': {
      out.push(P('rain', 150, 26 + Math.sin(t / 900) * 2, 1, 0, smooth(t / 300), 0));
      emit(t, 110, 520, (i, p) => P('rain', 116 + hash(i) * 68, 40 + p * 70, .8, 0, fade(p, .05, .3) * smooth(t / 400), 1), out); break;
    }
    case 'bulb': { const pop = smooth(t / 220); out.push(P('bulb', 238, 50 + Math.sin(t / 500) * 2, pop * (1 + Math.max(0, .25 - t / 1200)), Math.sin(t / 700) * 6, 1, Math.floor(t / 600) % 2)); break; }
    case 'spinner': out.push(P('spinner', 238, 52, smooth(t / 200), t * .36, 1)); break;
    case 'check': case 'cross': { const pop = smooth(t / 200); out.push(P(fx, 238, 50, pop * (1 + Math.max(0, .3 - t / 900)), fx === 'cross' && t < 500 ? Math.sin(t / 30) * (1 - t / 500) * 10 : 0, 1)); break; }
    case 'bubbles': emit(t, 420, 1900, (i, p) => P('bubbles', 226 + hash(i) * 30 + Math.sin(p * 7 + i) * 6, 90 - p * 70, .4 + hash(i, 1) * .5 + p * .3, 0, fade(p, .1, .25)), out); break;
    case 'bolt': for (const k of [0, 1]) { const on = ((t + k * 700) % 1400) < 160 ? 1 : ((t + k * 700) % 1400) < 320 ? .35 : 0; if (on) out.push(P('bolt', k ? 248 : 52, 56, .9 + (k ? .1 : 0), k ? 12 : -12, on)); } break;
  }
  return out;
}

export interface DecorPlayer {
  /** Expression override (null = the state's own). */
  setLook(look: DecorLook | null): void;
  setStyle(s: DecorStyle): void;
  /** Make the mouth talk, whatever the state (for speech). */
  setTalking(on: boolean): void;
  step(G: Geometry, now: number): Decor;
}

/** Keeps blush and mouth soft between states (critically damped, so no overshoot) and starts the effects. */
export function createDecor(style: DecorStyle = {}): DecorPlayer {
  let st: Required<DecorStyle> = { mouth: false, blush: 'auto', effects: true, shadow: false, ...style };
  let look: DecorLook | null = null, talking = false;
  let last: number | null = null, fx: Effect = 'none', fxStart = 0, prevFx: Effect = 'none', prevStart = 0, prevEnd = 0;
  const v = { blush: 0, mouth: .25, open: 0, mouthWidth: 1 };
  let primed = false;
  return {
    setLook(l) { look = l; },
    setStyle(s) { st = { ...st, ...s }; },
    setTalking(on) { talking = on; },
    step(G, now) {
      const dt = last === null ? 0 : clamp((now - last) / 1000, 0, .1); last = now;
      const base = STATE_DECOR[G.cur] ?? STATE_DECOR.idle;
      const want = { ...base, ...(look ?? {}) };
      const k = primed ? 1 - Math.exp(-dt * 10) : 1; primed = true;
      v.blush += (want.blush - v.blush) * k; v.mouth += (want.mouth - v.mouth) * k;
      v.open += (want.open - v.open) * k; v.mouthWidth += (want.mouthWidth - v.mouthWidth) * k;
      const target: Effect = st.effects ? want.fx : 'none';
      if (target !== fx) { prevFx = fx; prevStart = fxStart; prevEnd = now; fx = target; fxStart = now; }

      const L = G.eyes[0], R = G.eyes[1];
      const cx = (L.x + R.x) / 2, cy = (L.y + R.y) / 2, sep = (R.x - L.x) / 2, low = Math.max(L.eh, R.eh) / 2;
      let open = v.open;
      if (talking || G.cur === 'talking') { const s = now / 1000; open = clamp(.12 + .6 * Math.abs(Math.sin(s * 9.3) * Math.sin(s * 2.4 + 1)), 0, 1); }
      const mouth: Mouth | null = st.mouth ? { x: cx * .7, y: cy * .5 + low + 18, curve: v.mouth, open, width: v.mouthWidth } : null;
      const b = st.blush === 'off' ? 0 : st.blush === 'always' ? Math.max(.6, v.blush) : v.blush;
      const blush: Blush[] = b > .01 ? [-1, 1].map(s => ({ x: cx * .6 + s * (sep + 22), y: cy * .4 + low * .62 + 6, opacity: b })) : [];
      const lift = clamp((260 - G.body.ty) / 40, 0, 1);
      const shadow = st.shadow ? { cx: G.body.tx, rx: 92 * (1 - lift * .35), opacity: .16 * (1 - lift * .5) } : null;

      const particles = effectAt(fx, now - fxStart, G);
      const fadeOut = 1 - (now - prevEnd) / 350;
      if (fadeOut > 0 && prevFx !== 'none') for (const p of effectAt(prevFx, now - prevStart, G)) particles.push({ ...p, opacity: p.opacity * fadeOut });
      return { mouth, blush, shadow, particles };
    },
  };
}

// ---- drawing (strings, shared by the live renderer and the static export)

const f = (v: number) => v.toFixed(2);
export interface DecorColors { mouth: string; blush: string; accent: string; glyph: string }
const CONFETTI = ['#ff5c7a', '#ffc94a', '#4ad1a0', '#5b8cff', '#b77bff'];

/** The mouth and blush, drawn in face space (inside the face group, under the eyes). */
export function faceDecorSvg(D: Decor, c: DecorColors): string {
  let s = '';
  for (const b of D.blush) s += `<ellipse cx="${f(b.x)}" cy="${f(b.y)}" rx="14" ry="7.5" fill="${c.blush}" opacity="${f(b.opacity * .6)}"/>`;
  const m = D.mouth;
  if (m) {
    const w = 13 * m.width, cv = m.curve * 9, op = m.open * 15;
    if (op < 1.2) s += `<path d="M${f(m.x - w)} ${f(m.y - cv * .3)} Q${f(m.x)} ${f(m.y + cv)} ${f(m.x + w)} ${f(m.y - cv * .3)}" fill="none" stroke="${c.mouth}" stroke-width="5" stroke-linecap="round"/>`;
    else {
      const top = m.y - cv * .3 - op * .25, bot = m.y + cv + op;
      s += `<path d="M${f(m.x - w)} ${f(m.y - cv * .3)} Q${f(m.x)} ${f(top + cv * .4)} ${f(m.x + w)} ${f(m.y - cv * .3)} Q${f(m.x)} ${f(bot + op * .3)} ${f(m.x - w)} ${f(m.y - cv * .3)}Z" fill="${c.mouth}" stroke="${c.mouth}" stroke-width="4" stroke-linejoin="round"/>`;
    }
  }
  return s;
}

/** The ground shadow, in body space, drawn before the body. */
export function shadowSvg(D: Decor, c: { glyph: string }): string {
  const s = D.shadow;
  return s ? `<ellipse cx="${f(s.cx)}" cy="268" rx="${f(s.rx)}" ry="7" fill="${c.glyph}" opacity="${f(s.opacity)}"/>` : '';
}

const SHAPES: Record<Particle['kind'], (c: DecorColors, v: number) => string> = {
  zzz: c => `<path d="M-7 -7H7L-7 7H7" fill="none" stroke="${c.glyph}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  hearts: c => `<path d="M0 8C-10 1-12-4-9-8C-6-11-2-10 0-6C2-10 6-11 9-8C12-4 10 1 0 8Z" fill="${c.accent}"/>`,
  sparkles: c => `<path d="M0-11Q1.5-1.5 11 0Q1.5 1.5 0 11Q-1.5 1.5-11 0Q-1.5-1.5 0-11Z" fill="${c.accent}"/>`,
  stars: c => `<path d="M0-9L2.6-3.2L9-2.8L4.2 1.4L5.6 7.6L0 4.4L-5.6 7.6L-4.2 1.4L-9-2.8L-2.6-3.2Z" fill="${c.accent}"/>`,
  question: c => `<path d="M-7-8C-7-16 7-16 7-8C7-2 0-2 0 4" fill="none" stroke="${c.glyph}" stroke-width="4" stroke-linecap="round"/><circle cy="11" r="2.6" fill="${c.glyph}"/>`,
  exclaim: c => `<path d="M0-14V3" stroke="${c.glyph}" stroke-width="5" stroke-linecap="round"/><circle cy="11" r="3" fill="${c.glyph}"/>`,
  sweat: () => `<path d="M0-9C3-4 6-1 6 3A6 6 0 0 1-6 3C-6-1-3-4 0-9Z" fill="#7cc4ff" stroke="#3b8fd6" stroke-width="1.2"/>`,
  tear: () => `<path d="M0-6C2-3 4-1 4 2A4 4 0 0 1-4 2C-4-1-2-3 0-6Z" fill="#7cc4ff"/>`,
  notes: (c, v) => v ? `<path d="M-4 6V-9L7-12V3" fill="none" stroke="${c.glyph}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="-7" cy="6" rx="3.6" ry="2.8" fill="${c.glyph}"/><ellipse cx="4" cy="3" rx="3.6" ry="2.8" fill="${c.glyph}"/>`
    : `<path d="M2 6V-10Q6-7 8-3" fill="none" stroke="${c.glyph}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="-1" cy="6" rx="3.8" ry="3" fill="${c.glyph}"/>`,
  steam: c => `<circle r="7" fill="${c.glyph}" opacity=".35"/>`,
  dots: c => `<circle r="3.6" fill="${c.glyph}"/>`,
  thought: c => `<circle r="7" fill="#fff" stroke="${c.glyph}" stroke-width="2"/>`,
  confetti: (_, v) => `<rect x="-3" y="-5" width="6" height="10" rx="1" fill="${CONFETTI[v % CONFETTI.length]}"/>`,
  waves: c => `<path d="M0-12A16 16 0 0 1 0 12" fill="none" stroke="${c.glyph}" stroke-width="3" stroke-linecap="round"/>`,
  sob: () => `<path d="M0-6C2-3 4-1 4 2A4 4 0 0 1-4 2C-4-1-2-3 0-6Z" fill="#7cc4ff"/>`,
  snow: () => `<path d="M0-7V7M-6-3.5L6 3.5M-6 3.5L6-3.5" stroke="#9ccfff" stroke-width="2" stroke-linecap="round"/>`,
  flame: () => `<path d="M0-16C6-8 11-3 9 5A9 9 0 0 1-9 5C-10-1-5-4-3-9C-2-5 0-4 1-5C2-8 1-12 0-16Z" fill="#ff7a1a"/><path d="M0-5C3-1 5 2 4 5A4.5 4.5 0 0 1-4 5C-4 2-2 0 0-5Z" fill="#ffd23f"/>`,
  rain: (c, v) => v ? `<path d="M0-5V5" stroke="#5aa8f0" stroke-width="2.4" stroke-linecap="round"/>`
    : `<path d="M-34 6A12 12 0 0 1-24-12A16 16 0 0 1 4-18A13 13 0 0 1 26-8A11 11 0 0 1 32 10H-30A9 9 0 0 1-34 6Z" fill="#c6cfd8" stroke="${c.glyph}" stroke-opacity=".25" stroke-width="1.5"/>`,
  bulb: (_, v) => `${v ? '<circle cy="-3" r="17" fill="#ffd23f" opacity=".25"/>' : ''}<path d="M-8 4C-12 0-13-5-12-9A12 12 0 0 1 12-9C13-5 12 0 8 4V8H-8Z" fill="#ffd23f" stroke="#c99400" stroke-width="1.5"/><rect x="-6" y="9" width="12" height="5" rx="1.5" fill="#8a96a3"/>`,
  spinner: c => `<circle r="11" fill="none" stroke="${c.glyph}" stroke-opacity=".18" stroke-width="4"/><path d="M0-11A11 11 0 0 1 11 0" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`,
  check: () => `<circle r="13" fill="#22b573"/><path d="M-6 0L-1.5 5L7-4" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: () => `<circle r="13" fill="#e5484d"/><path d="M-5-5L5 5M5-5L-5 5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`,
  bubbles: () => `<circle r="7" fill="#b6e3a0" stroke="#6fb24f" stroke-width="1.5"/><circle cx="-2.5" cy="-2.5" r="1.8" fill="#fff" opacity=".8"/>`,
  bolt: () => `<path d="M3-16L-8 2H0L-4 16L9-4H1Z" fill="#ffcf2e" stroke="#c99400" stroke-width="1.2" stroke-linejoin="round"/>`,
};

/** The effects, in body space, drawn after the body. `dx, dy` moves them with the body (not its rotation). */
export function particlesSvg(D: Decor, c: DecorColors, dx = 0, dy = 0): string {
  let s = '';
  for (const p of D.particles) {
    if (p.opacity <= .01 || p.scale <= .01) continue;
    s += `<g transform="translate(${f(p.x + dx)} ${f(p.y + dy)}) rotate(${f(p.rot)}) scale(${f(p.scale)})" opacity="${f(Math.min(1, p.opacity))}">${SHAPES[p.kind](c, p.v)}</g>`;
  }
  return s;
}
