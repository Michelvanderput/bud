import { faceMotion, layout, type FaceMotionOptions, type Motion, type Style } from './render';
import { createDecor, faceDecorSvg, particlesSvg, shadowSvg, type Decor, type DecorLook } from './decor';
import { smallGeometry, SMALL_MAX_PX, type Variant } from './small';
import { DEFAULT_COLORS, validateDefinition, isBuiltInState, type Colors, type DashyDefinition } from './definition';
import { createSequencePlayer, springFor, type Expression, type Look, type Sequence, type SequencePlayer } from './timeline';
import { applyStyle, renderSvg, stillGeometry, type StaticOptions } from './static';
import { renderPng } from './photo';
import { createDashy, type Dashy, type DashyOptions, type DashyState, type Geometry, type Shape } from './core';

export interface MountOptions extends DashyOptions {
  shape?: Shape;
  initialState?: DashyState;
  /** Dutch/English labels for screen readers. Default: Dutch. */
  labels?: Partial<Record<DashyState, string>>;
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
  /** 'small' = simpler drawing for 24 to 32 px. 'auto' (default) picks it from the rendered size. */
  variant?: Variant;
  /**
   * Body mode: `container` itself is Dashy's body (a block of any shape). It stays exactly where it is: only the eyes are drawn,
   * as an overlay filling the block, and all the life is in the face (it moves, tilts and squashes inside the block, the eyes look
   * around and blink). The eyes are guaranteed to stay inside the block.
   */
  body?: FaceMotionOptions;
  /** Body, eye and outline colours. Default: white body, near-black eyes. */
  colors?: Partial<Colors>;
  /** A Dashy definition (look, custom expressions, sequences). Validated on mount; an invalid one throws with the first problem. */
  definition?: unknown;
  /** Ambient life: micro-saccades and slow drift. Default true. Not shown with reduced motion. */
  ambient?: boolean | number;
  /** Head turn: a little 3D when he looks sideways. Default true. */
  perspective?: boolean | number;
  /** Called when a `once` sequence has played its last step (he then holds that expression until `stop()`). */
  onSequenceEnd?: (key: string) => void;
  /** Body corners, eyes, mouth, blush, effects, shadow. Overrides the definition's style. */
  style?: Style;
  /** Ambient, head turn, speed, bounce, pointer, blink. Overrides the definition's motion (and `ambient`/`perspective`). */
  motion?: Motion;
  /** Start talking (the mouth moves, when it is shown). */
  talking?: boolean;
}
export interface SnapshotOptions extends Omit<StaticOptions, 'variant'> {
  format?: 'svg' | 'png';
  /** PNG size in px. Default 512. */
  size?: number;
  /** Hold the body still and keep the expression (what app icons need). Default false: the exact frame on screen. */
  still?: boolean;
}
export interface DashyHandle {
  dashy: Dashy;
  setState(s: DashyState): void;
  getState(): DashyState;
  setShape(s: Shape): void;
  poke(): void;
  /** Look towards (nx, ny) in -1..1 relative to the centre, like a pointer would. */
  look(nx: number, ny: number): void;
  /** Play a named sequence from the definition. Returns false when there is no such sequence. */
  play(key: string): boolean;
  /** Stop a running sequence and go back to the state that was set. */
  stop(): void;
  /** Show one named expression (custom, from the definition) or built-in state, and keep it. Returns false when unknown. */
  express(key: string): boolean;
  setColors(c: Partial<Colors>): void;
  /** Change the look live (merged with what is set). */
  setStyle(s: Partial<Style>): void;
  /** Change the motion live (merged with what is set). */
  setMotion(m: Partial<Motion>): void;
  /** Make the mouth talk, whatever the state: for speech or a voice assistant. */
  setTalking(on: boolean): void;
  /** Show a custom expression without a definition: eyes (look) and/or decor. null = the state's own. */
  setLook(look: Look | null, decor?: DecorLook | null): void;
  /** The style and motion in use right now. */
  getStyle(): Style;
  getMotion(): Motion;
  /** A still of what is on screen right now. SVG as text, PNG as a Blob. */
  snapshot(o?: SnapshotOptions): Promise<string | Blob>;
  destroy(): void;
}

const NS = 'http://www.w3.org/2000/svg';
export const DEFAULT_LABELS: Record<DashyState, string> = {
  idle: 'Dashy wacht rustig', received: 'Dashy heeft een taak gekregen', working: 'Dashy is aan het werk',
  thinking: 'Dashy denkt na', waiting: 'Dashy wacht op jou', blocked: 'Dashy zit vast en heeft hulp nodig',
  done: 'Dashy is klaar', happy: 'Dashy is blij', sad: 'Dashy is sip', angry: 'Dashy is boos',
  strict: 'Dashy is streng', dancing: 'Dashy danst', sleepy: 'Dashy is slaperig',
  surprised: 'Dashy is verrast', love: 'Dashy is verliefd', confused: 'Dashy snapt het niet', excited: 'Dashy is door het dolle heen',
  scared: 'Dashy is bang', curious: 'Dashy is nieuwsgierig', proud: 'Dashy is trots', dizzy: 'Dashy is duizelig',
  bored: 'Dashy verveelt zich', wink: 'Dashy knipoogt', talking: 'Dashy praat', listening: 'Dashy luistert', shy: 'Dashy is verlegen',
};
let uid = 0;
const f = (v: number) => v.toFixed(2);

export function mountDashy(container: HTMLElement, opts: MountOptions = {}): DashyHandle {
  const id = 'dashy' + ++uid;
  let def: Readonly<DashyDefinition> | null = null;
  if (opts.definition !== undefined) {
    const v = validateDefinition(opts.definition);
    if (!v.ok) throw new Error(`Invalid Dashy definition at ${v.errors[0].path || '/'}: ${v.errors[0].message}`);
    def = v.value;
  }
  let colors: Colors = { ...DEFAULT_COLORS };
  let style: Style = { ...def?.style, ...opts.style };
  let motion: Motion = { ambient: typeof opts.ambient === 'number' ? opts.ambient : opts.ambient === false ? 0 : 1,
    perspective: typeof opts.perspective === 'number' ? opts.perspective : opts.perspective === false ? 0 : 1, ...def?.motion, ...opts.motion };
  const dashy = createDashy({ seed: opts.seed ?? Math.floor(Math.random() * 1e6) + 1, eyeScale: style.eyeScale ?? opts.eyeScale ?? def?.eyeScale,
    ambient: motion.ambient, perspective: motion.perspective, bounce: motion.bounce, blink: motion.blink, eyeWidth: style.eyeWidth, eyeSpacing: style.eyeSpacing });
  const decor = createDecor(style);
  if (opts.talking) decor.setTalking(true);
  let lastD: Decor | null = null;
  const labels = { ...DEFAULT_LABELS, ...opts.labels };
  const reduced = () => opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const bodyMode = !!opts.body;
  const maskDefs = (['L', 'R'] as const).map(s => `<mask id="${id}m${s}" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect fill="#fff"/><rect fill="#000"/><ellipse fill="#000"/></mask>`).join('');
  const eyeRects = (['L', 'R'] as const).map(s => `<g class="eye${s}"><rect x="-80" y="-100" width="160" height="200" fill="#101214" mask="url(#${id}m${s})"/><circle class="shine" r="0" fill="#fff" mask="url(#${id}m${s})"/></g>`).join('');
  container.insertAdjacentHTML('beforeend', bodyMode ? `
<svg viewBox="0 0 300 300" role="img" style="position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible;pointer-events:none;shape-rendering:geometricPrecision">
  <title></title>
  <defs>${maskDefs}</defs>
  <g class="face"><g class="fdecor"></g>${eyeRects}</g>
  <g class="fx"></g>
</svg>` : `
<svg viewBox="0 0 300 300" role="img" style="display:block;width:100%;height:100%;overflow:visible;shape-rendering:geometricPrecision;touch-action:manipulation">
  <title></title>
  <defs>
    <clipPath id="${id}c"><rect x="40" y="40" width="220" height="220" rx="22"/></clipPath>
    ${maskDefs}
  </defs>
  <g class="shadow"></g>
  <g class="body">
    <rect class="outline" x="40.5" y="40.5" width="219" height="219" rx="22" fill="#fff" stroke="#c9c9c4" stroke-width="1"/>
    <g clip-path="url(#${id}c)"><g class="face"><g class="fdecor"></g>${eyeRects}</g></g>
  </g>
  <g class="fx"></g>
</svg>`);
  const svg = container.querySelector<SVGSVGElement>('svg:last-of-type')!;
  const q = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!;
  const face = q<SVGGElement>('.face');
  const body = bodyMode ? null : q<SVGGElement>('.body'), outline = bodyMode ? null : q<SVGRectElement>('.outline');
  const clip = bodyMode ? null : svg.querySelector<SVGRectElement>(`#${id}c rect`)!;
  const title = q<SVGTitleElement>('title');
  const eyes = (['L', 'R'] as const).map(s => {
    const m = svg.querySelector(`#${id}m${s}`)!;
    const [pill, lid] = Array.from(m.querySelectorAll('rect')) as SVGRectElement[];
    return { g: q<SVGGElement>(`.eye${s}`), pill, lid, low: m.querySelector('ellipse')!, shine: q<SVGCircleElement>(`.eye${s} .shine`) };
  });
  const fdecor = q<SVGGElement>('.fdecor'), fxG = q<SVGGElement>('.fx'), shadowG = svg.querySelector<SVGGElement>('.shadow');
  const html = (el: Element | null, v: string) => { if (el && (el as any)._h !== v) { (el as any)._h = v; el.innerHTML = v; } };

  const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([0-9 ,.%/-]+\))$/i;
  function applyColors(c: Partial<Colors>) {
    for (const [k, v] of Object.entries(c)) if (v !== undefined && (typeof v !== 'string' || !COLOR.test(v))) throw new Error(`Invalid colour for ${k}: ${v}`);
    colors = { ...colors, ...c };
    eyes.forEach(e => e.g.querySelector('rect')!.setAttribute('fill', colors.eyes));
    if (outline) { outline.setAttribute('fill', colors.body); outline.setAttribute('stroke', colors.outline); }
  }
  applyColors({ ...def?.colors, ...opts.colors });

  let small = opts.variant === 'small';
  let lastG: Geometry | null = null;
  let seqKey: string | null = null, player: SequencePlayer | null = null;
  const set = (el: Element, attrs: Record<string, string>) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };
  // body mode: size of the card in px, and px per core unit (the body is 220 units wide in core.ts)
  let W = 0, H = 0, u = 1;
  function measure() {
    W = container.offsetWidth; H = container.offsetHeight;
    if (!W || !H) { W = H = 220; u = 1; } else u = Math.min(W, H) / 220;
    svg.setAttribute('viewBox', `${f(150 - W / (2 * u))} ${f(150 - H / (2 * u))} ${f(W / u)} ${f(H / u)}`);
  }
  function draw(G0: Geometry, t: number) {
    lastG = G0;
    const D = decor.step(G0, t); lastD = D;
    const tiny = small && !bodyMode;
    const L = layout(tiny ? smallGeometry(G0) : G0, tiny, style);
    const dc = { mouth: colors.mouth, blush: colors.blush, accent: colors.accent, glyph: colors.eyes };
    html(fdecor, tiny ? '' : faceDecorSvg(D, dc));
    html(fxG, tiny ? '' : particlesSvg(D, dc, bodyMode ? 0 : G0.body.tx - 150, bodyMode ? 0 : G0.body.ty - 260));
    html(shadowG, tiny ? '' : shadowSvg(D, dc));
    if (!bodyMode) {
      outline!.setAttribute('stroke-width', L.outlineWidth); outline!.setAttribute('rx', L.outlineRx); clip!.setAttribute('rx', L.clipRx);
      body!.setAttribute('transform', L.body);
    }
    if (bodyMode) { const m = faceMotion(G0, W, H, opts.body); face.setAttribute('transform', `translate(${f(m.tx)} ${f(m.ty)}) rotate(${f(m.rot)}) scale(${f(m.sx)} ${f(m.sy)})`); }
    else face.setAttribute('transform', L.face);
    L.eyes.forEach((e, i) => {
      const E = eyes[i];
      E.g.setAttribute('transform', e.group); set(E.pill, e.pill); set(E.lid, e.lid); set(E.low, e.low); set(E.shine, e.shine);
    });
  }

  const pickVariant = () => { if (bodyMode) return; if (opts.variant === 'auto' || opts.variant === undefined) small = svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().width <= SMALL_MAX_PX; };
  let raf = 0, destroyed = false, offscreen = false;
  // Virtual clock, so playback speed can change without a jump: real time since the last speed change, times the speed.
  let vBase = performance.now(), rBase = vBase, speed = Math.max(.25, Math.min(3, motion.speed ?? 1));
  const toV = (real: number) => vBase + (real - rBase) * speed;
  const now = () => toV(performance.now());
  const setSpeed = (sp: number) => { const r = performance.now(); vBase = toV(r); rBase = r; speed = Math.max(.25, Math.min(3, sp)); };
  const setTitle = () => { title.textContent = labels[dashy.getState()]; };
  // No frames while the window is hidden or the avatar is scrolled out of view.
  const paused = () => offscreen || (typeof document !== 'undefined' && document.hidden);
  function settleAndDraw() { // reduced motion: simulate ~1.5s instantly, draw one still frame
    let t = now(); let G!: Geometry;
    for (let i = 0; i < 90; i++) { t += 16.7; G = dashy.step(t); }
    draw(G, t);
  }
  const ownExpr = (key: string): Expression | undefined => (def && Object.prototype.hasOwnProperty.call(def.expressions, key) ? def.expressions[key] : undefined);
  /** Shows one expression: a custom one from the definition (state and/or look), or a built-in state by name. */
  function applyExpression(key: string, spring?: { k: number; d: number }): boolean {
    const ex = ownExpr(key);
    if (!ex && !isBuiltInState(key)) return false;
    const target = ex ? ex.state : (key as DashyState);
    if (target && target !== dashy.getState()) dashy.setState(target, now());
    dashy.setLook(ex?.look ?? null, spring);
    decor.setLook((ex as { decor?: DecorLook } | undefined)?.decor ?? null);
    setTitle();
    return true;
  }
  function tickSequence(t: number) {
    const r = player!.tick(t);
    if (r.changed) applyExpression(r.step.expression, springFor(r.step.transitionMs, r.step.ease));
    if (r.done) { const k = seqKey!; player = null; seqKey = null; opts.onSequenceEnd?.(k); }
  }
  function loop(rt: number) {
    if (destroyed) return;
    const t = toV(rt);
    if (player) tickSequence(t);
    const G = dashy.step(t);
    draw(G, t);
    if (title.textContent !== labels[G.cur]) setTitle(); // keeps the label right when core moves on by itself (received -> working, done -> idle)
    raf = requestAnimationFrame(loop);
  }
  function applyMotionPreference() {
    cancelAnimationFrame(raf); raf = 0;
    dashy.setAmbient(reduced() ? 0 : motion.ambient ?? 1);
    if (reduced()) { settleAndDraw(); setTitle(); } else if (!paused()) raf = requestAnimationFrame(loop);
  }

  if (opts.shape ?? def?.shape) dashy.setShape((opts.shape ?? def?.shape)!);
  if (style.roundness !== undefined) dashy.setCornerRadius(style.roundness * 110);
  if (opts.initialState) dashy.setState(opts.initialState, now());
  setTitle();

  const onMove = (e: PointerEvent) => {
    if (reduced() || motion.followPointer === false) return;
    const r = svg.getBoundingClientRect();
    dashy.pointer((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height / 2)) / (r.height / 2), now());
  };
  const onDown = () => { if (!reduced()) { dashy.poke(now()); setTitle(); } };
  // body mode: a tap on the body (not on a button or link on top of it) is a poke
  const pokeTarget: HTMLElement | SVGSVGElement = bodyMode ? container : svg;
  const onTap = () => onDown();
  window.addEventListener('pointermove', onMove, { passive: true });
  pokeTarget.addEventListener('pointerdown', onTap);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', applyMotionPreference);
  const ro = typeof ResizeObserver === 'function' && (bodyMode || (opts.variant ?? 'auto') === 'auto') ? new ResizeObserver(() => { if (bodyMode) measure(); else pickVariant(); if (reduced()) settleAndDraw(); }) : null;
  ro?.observe(bodyMode ? container : svg); pickVariant(); if (bodyMode) measure();
  const onVisibility = () => applyMotionPreference();
  document.addEventListener('visibilitychange', onVisibility);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => { offscreen = !entries[entries.length - 1].isIntersecting; applyMotionPreference(); })
    : null;
  io?.observe(svg);
  applyMotionPreference();

  return {
    dashy,
    setState(s) { dashy.setState(s, now()); setTitle(); if (reduced()) settleAndDraw(); },
    getState: () => dashy.getState(),
    setShape(s) { dashy.setShape(s); if (reduced()) settleAndDraw(); },
    poke: onDown,
    look(nx, ny) { if (!reduced()) dashy.pointer(nx, ny, now()); },
    play(key) {
      if (!def || !Object.prototype.hasOwnProperty.call(def.sequences, key)) return false;
      const sq: Sequence = def.sequences[key];
      seqKey = key; player = createSequencePlayer(sq); player.start(now());
      dashy.setBlink(sq.blink ?? motion.blink ?? null);
      if (reduced()) { // no motion: show the end of a once-sequence, the first step of the others, as one still
        const step = sq.mode === 'once' ? sq.steps[sq.steps.length - 1] : sq.steps[0];
        applyExpression(step.expression); player = null; seqKey = null; settleAndDraw();
      } else if (!raf && !paused()) raf = requestAnimationFrame(loop);
      return true;
    },
    stop() { player = null; seqKey = null; dashy.setBlink(motion.blink ?? null); dashy.setLook(null); decor.setLook(null); if (reduced()) settleAndDraw(); },
    express(key) { player = null; seqKey = null; const ok = applyExpression(key); if (ok && reduced()) settleAndDraw(); return ok; },
    setColors(c) { applyColors(c); if (reduced()) settleAndDraw(); },
    setStyle(s) {
      style = { ...style, ...s };
      applyStyle(dashy, s);
      if (s.roundness === undefined && 'roundness' in s) dashy.setShape(opts.shape ?? def?.shape ?? 'square');
      decor.setStyle(s);
      if (reduced()) settleAndDraw();
    },
    setMotion(m) {
      motion = { ...motion, ...m };
      if (m.speed !== undefined) setSpeed(m.speed);
      if (m.perspective !== undefined) dashy.setPerspective(m.perspective);
      if (m.bounce !== undefined) dashy.setBounce(m.bounce);
      if ('blink' in m && !player) dashy.setBlink(m.blink ?? null);
      if (m.ambient !== undefined) dashy.setAmbient(reduced() ? 0 : m.ambient);
    },
    setTalking(on) { decor.setTalking(on); },
    setLook(look, dl) { player = null; seqKey = null; dashy.setLook(look); decor.setLook(dl ?? null); if (reduced()) settleAndDraw(); },
    getStyle: () => ({ ...style }),
    getMotion: () => ({ ...motion }),
    async snapshot(o = {}) {
      const { format = 'svg', size = 512, still = false, ...rest } = o;
      if (!lastG) throw new Error('Nothing drawn yet');
      const svgText = renderSvg(still ? stillGeometry(lastG) : lastG, { variant: small ? 'small' : 'full', colors, idPrefix: id + 's', style, decor: lastD && !still ? lastD : lastD ? { ...lastD, particles: [] } : undefined, ...rest });
      return format === 'png' ? renderPng(svgText, size) : svgText;
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility); io?.disconnect(); ro?.disconnect();
      window.removeEventListener('pointermove', onMove); mq?.removeEventListener('change', applyMotionPreference);
      pokeTarget.removeEventListener('pointerdown', onTap);
      svg.remove();
    },
  };
}
