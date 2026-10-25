/**
 * Dashy Studio: see Dashy in every state, rig him (shape, colours, face, motion), build expressions and sequences,
 * and export the lot for a project. Everything here drives the same runtime a project gets (src/), so what you see
 * is what you ship.
 */
import { DEFAULT_COLORS, DEFAULT_LABELS, EFFECTS, LOOK_RANGE, STATE_DECOR, STATE_KEYS, createDashy, mountDashy, parseDefinition,
  recordFrames, renderAnimatedSvg, renderPng, renderSvg, settledFrame, stepAt, validateDefinition,
  type Colors, type DashyHandle, type DashyState, type DecorLook, type Effect, type Look, type Motion, type Sequence, type Style } from '../../src/index';
import type { Background } from '../../src/photo';
import { esm as RUNTIME_ESM, iife as RUNTIME_IIFE } from 'virtual:runtime';
import { zip, type ZipEntry } from './zip';

// ---------- state

interface CustomExpression { state: DashyState; look: Look; decor: DecorLook }
interface Studio {
  name: string;
  state: string;          // a built-in state or a custom expression key
  colors: Colors;
  style: Required<Omit<Style, 'blush'>> & { blush: 'auto' | 'always' | 'off' };
  motion: Required<Omit<Motion, 'blink'>> & { blink: { enabled: boolean; minMs: number; maxMs: number } };
  expressions: Record<string, CustomExpression>;
  sequences: Record<string, Sequence>;
  seq: string;
  stage: { bg: 'grid' | 'solid' | 'none'; color: string };
  draft: CustomExpression;
}

const ORIGINAL_STYLE: Studio['style'] = { roundness: .2, outlineWidth: 1, eyeWidth: 34, eyeSpacing: 34, eyeScale: +(55 / 66).toFixed(3), eyeRoundness: 1, shine: 0, mouth: false, blush: 'auto', effects: true, shadow: false };
const ORIGINAL_MOTION: Studio['motion'] = { ambient: 1, perspective: 1, speed: 1, bounce: 1, followPointer: true, blink: { enabled: true, minMs: 2000, maxMs: 5200 } };
const SAMPLE_SEQUENCES: Record<string, Sequence> = {
  hallo: { mode: 'once', steps: [
    { expression: 'surprised', holdMs: 500, transitionMs: 150, ease: 'snappy' },
    { expression: 'happy', holdMs: 900, transitionMs: 250, ease: 'spring' },
    { expression: 'wink', holdMs: 700, transitionMs: 200, ease: 'snappy' },
    { expression: 'idle', holdMs: 400, transitionMs: 300, ease: 'smooth' }] },
  denkpauze: { mode: 'loop', steps: [
    { expression: 'thinking', holdMs: 1400, transitionMs: 300, ease: 'smooth' },
    { expression: 'confused', holdMs: 900, transitionMs: 250, ease: 'spring' },
    { expression: 'curious', holdMs: 900, transitionMs: 250, ease: 'spring' }] },
};
const fresh = (): Studio => ({
  name: 'Dashy', state: 'idle', colors: { ...DEFAULT_COLORS, body: '#ffffff' }, style: { ...ORIGINAL_STYLE, shadow: true }, motion: structuredClone(ORIGINAL_MOTION),
  expressions: { smug: { state: 'idle', look: { cover: .45, lidA: -6, low: .2, sd: 0, eh: 62, tilt: 0, asym: .15 }, decor: { mouth: .5, blush: .2, fx: 'none' } } },
  sequences: structuredClone(SAMPLE_SEQUENCES), seq: 'hallo', stage: { bg: 'grid', color: '#dfe9f0' },
  draft: { state: 'idle', look: { sd: 0, eh: 66, cover: .05, lidA: 0, low: 0, tilt: 0, asym: 0 }, decor: { blush: 0, mouth: .25, open: 0, mouthWidth: 1, fx: 'none' } },
});

const KEY = 'dashy-studio-v1';
let S: Studio = fresh();
try { const raw = localStorage.getItem(KEY); if (raw) S = { ...fresh(), ...JSON.parse(raw) }; } catch { /* no storage: start fresh */ }
let persistT = 0;
const persist = () => { clearTimeout(persistT); persistT = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* fine */ } }, 300); };

const names = createDashy().states as Record<DashyState, { n: string }>;
const STATUS: DashyState[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done'];
const isBuiltIn = (k: string): k is DashyState => (STATE_KEYS as readonly string[]).includes(k);

// ---------- small DOM helpers

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}
let toastT = 0;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = window.setTimeout(() => { t.hidden = true; }, 2600); }
const svgFrag = (svg: string) => { const d = document.createElement('div'); d.innerHTML = svg; return d.firstElementChild as SVGSVGElement; };

// ---------- the live avatar

let handle: DashyHandle | null = null, paused = false, talking = false, seqStart = 0;
const systemReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
paused = systemReduced;

function definition() {
  return {
    schema: 'dashy/avatar-definition' as const, schemaVersion: 2 as const, name: S.name.slice(0, 120) || 'Dashy',
    shape: (S.style.roundness >= .99 ? 'circle' : 'square') as 'circle' | 'square',
    colors: { ...S.colors }, style: { ...S.style }, motion: structuredClone(S.motion),
    expressions: Object.fromEntries(Object.entries(S.expressions).map(([k, e]) => [k, { state: e.state, look: { ...e.look }, decor: { ...e.decor } }])),
    sequences: structuredClone(S.sequences),
  };
}
function mount(play?: string) {
  handle?.destroy();
  const v = validateDefinition(definition());
  const def = v.ok ? v.value : undefined;
  if (!v.ok) toast(`Definitie klopt niet: ${v.errors[0].path} ${v.errors[0].message}`);
  handle = mountDashy($('#avatar'), {
    definition: def, reducedMotion: paused, talking,
    initialState: isBuiltIn(S.state) ? S.state : S.expressions[S.state]?.state ?? 'idle',
    onSequenceEnd: () => { seqStart = 0; markCell(-1); },
  });
  if (play) { handle.play(play); seqStart = performance.now(); }
  else showCurrent();
}
function showCurrent() {
  if (!handle) return;
  const ex = S.expressions[S.state];
  if (ex) { handle.setState(ex.state); handle.setLook(ex.look, ex.decor); }
  else if (isBuiltIn(S.state)) { handle.setLook(null, null); handle.setState(S.state); }
  updateHud();
}
function applyLive() {
  if (!handle) return;
  handle.setStyle({ ...S.style });
  handle.setMotion({ ...S.motion, blink: { ...S.motion.blink } });
  try { handle.setColors({ ...S.colors }); } catch (e) { toast((e as Error).message); }
  persist(); scheduleThumbs();
}

// ---------- library (thumbnails are real stills from the same runtime, redrawn when the look changes)

function thumbSvg(state: DashyState, id: string, opts: { look?: Look; decor?: DecorLook; style?: Style; colors?: Partial<Colors> } = {}) {
  const style = opts.style ?? S.style;
  const F = settledFrame(state, { style, look: opts.look, decorLook: opts.decor });
  return renderSvg(F.G, { idPrefix: id, style, colors: opts.colors ?? S.colors, decor: F.D, margin: 4, title: DEFAULT_LABELS[state] });
}
function stateButton(key: string, label: string, sub: string) {
  const b = h('button', { class: 'st', type: 'button', 'aria-pressed': String(S.state === key), 'data-key': key, onclick: () => select(key) },
    h('span', { class: 'th' }), h('b', { text: label }), h('i', { text: sub }));
  return b;
}
function buildLibrary() {
  const status = $('#states-status'), mood = $('#states-mood'), custom = $('#states-custom');
  status.replaceChildren(...STATUS.map(s => stateButton(s, names[s].n, s)));
  mood.replaceChildren(...STATE_KEYS.filter(s => !STATUS.includes(s)).map(s => stateButton(s, names[s].n, s)));
  const keys = Object.keys(S.expressions);
  custom.replaceChildren(...keys.map(k => stateButton(k, k, `op ${S.expressions[k].state}`)));
  $('#custom-title').hidden = keys.length === 0;
  $('#count').textContent = `${STATE_KEYS.length} + ${keys.length} eigen`;
  scheduleThumbs(0);
}
let thumbT = 0;
function scheduleThumbs(delay = 160) {
  clearTimeout(thumbT);
  thumbT = window.setTimeout(() => {
    document.querySelectorAll<HTMLButtonElement>('.st').forEach((b, i) => {
      const k = b.dataset.key!, ex = S.expressions[k];
      const svg = ex ? thumbSvg(ex.state, `th${i}_`, { look: ex.look, decor: ex.decor }) : thumbSvg(k as DashyState, `th${i}_`);
      b.querySelector('.th')!.replaceChildren(svgFrag(svg));
    });
    drawSizes(); drawPresets();
  }, delay);
}
function select(key: string) {
  S.state = key; persist();
  document.querySelectorAll<HTMLButtonElement>('.st').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
  if (seqStart) { seqStart = 0; markCell(-1); handle?.stop(); }
  showCurrent(); drawSizes();
}
function currentBase(): { state: DashyState; look?: Look; decor?: DecorLook } {
  const ex = S.expressions[S.state];
  return ex ? { state: ex.state, look: ex.look, decor: ex.decor } : { state: isBuiltIn(S.state) ? S.state : 'idle' };
}
function drawSizes() {
  const b = currentBase(), F = settledFrame(b.state, { style: S.style, look: b.look, decorLook: b.decor });
  const sizes = [16, 24, 32, 48, 72];
  $('#sizes').replaceChildren(...sizes.map((px, i) => {
    const svg = svgFrag(renderSvg(F.G, { idPrefix: `sz${i}_`, variant: px <= 32 ? 'small' : 'full', margin: px <= 32 ? 10 : 20, style: S.style, colors: S.colors, decor: px > 32 ? { ...F.D, particles: [] } : undefined }));
    svg.setAttribute('width', String(px)); svg.setAttribute('height', String(px));
    return h('figure', {}, svg, h('figcaption', { text: `${px}px` }));
  }));
}
function updateHud() {
  const ex = S.expressions[S.state];
  $('#hud-state').textContent = S.state;
  $('#hud-name').textContent = ex ? `eigen expressie op ${names[ex.state].n}` : isBuiltIn(S.state) ? names[S.state].n : '';
}

// ---------- rig controls

type Num = { label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void; fmt?: (v: number) => string };
let uid = 0;
function slider(o: Num) {
  const id = `r${++uid}`, out = h('output', { for: id, text: (o.fmt ?? String)(o.get()) });
  const inp = h('input', { id, type: 'range', min: o.min, max: o.max, step: o.step, value: o.get(),
    oninput: () => { o.set(+inp.value); out.textContent = (o.fmt ?? String)(+inp.value); } }) as HTMLInputElement;
  const row = h('div', { class: 'row' }, h('label', { for: id, text: o.label }), inp, out);
  (row as any).sync = () => { inp.value = String(o.get()); out.textContent = (o.fmt ?? String)(o.get()); };
  return row;
}
function check(label: string, get: () => boolean, set: (v: boolean) => void) {
  const id = `c${++uid}`, inp = h('input', { id, type: 'checkbox', onchange: () => set(inp.checked) }) as HTMLInputElement;
  inp.checked = get();
  const l = h('label', { class: 'chk', for: id }, inp, label);
  (l as any).sync = () => { inp.checked = get(); };
  return l;
}
function seg<T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const sync = () => wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
  for (const [v, t] of opts) wrap.append(h('button', { type: 'button', 'data-v': v, onclick: () => { set(v); sync(); } }, t));
  sync(); (wrap as any).sync = sync;
  return h('div', { class: 'row', style: 'grid-template-columns:112px 1fr' }, h('span', { text: label }), wrap);
}
const sec = (title: string, ...kids: (Node | null)[]) => h('div', { class: 'sec' }, h('h3', { text: title }), ...kids);
const f2 = (v: number) => v.toFixed(2), f0 = (v: number) => v.toFixed(0), pct = (v: number) => `${Math.round(v * 100)}%`, times = (v: number) => `${v.toFixed(2)}×`;
const syncAll = () => document.querySelectorAll<HTMLElement>('.tabpanels *').forEach(e => (e as any).sync?.());

const set = <K extends keyof Studio['style']>(k: K) => (v: Studio['style'][K]) => { S.style[k] = v; applyLive(); };
const setM = <K extends keyof Studio['motion']>(k: K) => (v: Studio['motion'][K]) => { S.motion[k] = v; applyLive(); };

function panelLook() {
  return [
    sec('Lijf',
      seg('Vorm', [['square', 'Vierkant'], ['squircle', 'Zacht'], ['circle', 'Rond']] as [string, string][], () => S.style.roundness >= .99 ? 'circle' : S.style.roundness >= .45 ? 'squircle' : 'square',
        v => { S.style.roundness = v === 'circle' ? 1 : v === 'squircle' ? .5 : .2; applyLive(); syncAll(); }),
      slider({ label: 'Hoekronding', min: 0, max: 1, step: .01, get: () => S.style.roundness, set: set('roundness'), fmt: pct }),
      slider({ label: 'Omlijning', min: 0, max: 6, step: .25, get: () => S.style.outlineWidth, set: set('outlineWidth'), fmt: f2 }),
      check('Schaduw op de grond', () => S.style.shadow, set('shadow'))),
    sec('Ogen',
      slider({ label: 'Breedte', min: 16, max: 60, step: 1, get: () => S.style.eyeWidth, set: set('eyeWidth'), fmt: f0 }),
      slider({ label: 'Hoogte', min: .5, max: 1.4, step: .01, get: () => S.style.eyeScale, set: set('eyeScale'), fmt: times }),
      slider({ label: 'Afstand', min: 24, max: 46, step: 1, get: () => S.style.eyeSpacing, set: set('eyeSpacing'), fmt: f0 }),
      slider({ label: 'Rondheid', min: 0, max: 1, step: .01, get: () => S.style.eyeRoundness, set: set('eyeRoundness'), fmt: pct }),
      slider({ label: 'Glans', min: 0, max: 1, step: .01, get: () => S.style.shine, set: set('shine'), fmt: pct }),
      h('p', { class: 'hint', text: 'Ogen worden nooit zo breed dat ze elkaar raken: de kern houdt minstens 22 eenheden tussenruimte.' })),
  ];
}

const PRESETS: { name: string; colors: Partial<Colors>; style: Partial<Studio['style']> }[] = [
  { name: 'Origineel', colors: { ...DEFAULT_COLORS }, style: { ...ORIGINAL_STYLE } },
  { name: 'Nacht', colors: { body: '#1d2229', eyes: '#eaf3ff', outline: '#323b46', mouth: '#eaf3ff', blush: '#ff6f91', accent: '#7cc4ff' }, style: { shine: 0, eyeRoundness: 1, roundness: .3 } },
  { name: 'Munt', colors: { body: '#c9f2e1', eyes: '#0f3b2e', outline: '#9fd9c2', mouth: '#0f3b2e', blush: '#ff9fb0', accent: '#2fb37f' }, style: { roundness: .55, shine: .5, mouth: true } },
  { name: 'Perzik', colors: { body: '#ffd9c4', eyes: '#3a1d12', outline: '#f2b89a', mouth: '#3a1d12', blush: '#ff7b8f', accent: '#ff7b5a' }, style: { roundness: 1, shine: .7, mouth: true, blush: 'always' } },
  { name: 'Robot', colors: { body: '#d7dde3', eyes: '#1b8cff', outline: '#8a97a3', mouth: '#1b8cff', blush: '#ff5c7a', accent: '#1b8cff' }, style: { roundness: .06, eyeRoundness: .12, eyeWidth: 42, eyeScale: .7, outlineWidth: 3, shine: 0 } },
  { name: 'Spookje', colors: { body: '#f4f0ff', eyes: '#3b2a6b', outline: '#d9cff7', mouth: '#3b2a6b', blush: '#ffa3c4', accent: '#9b7bff' }, style: { roundness: 1, eyeScale: 1.1, eyeWidth: 30, shine: .9, mouth: true } },
  { name: 'Citroen', colors: { body: '#fff1a6', eyes: '#2b2410', outline: '#e8d46a', mouth: '#2b2410', blush: '#ff9a7a', accent: '#ff8a00' }, style: { roundness: .38, eyeRoundness: .8, shine: .4 } },
  { name: 'Kool', colors: { body: '#101214', eyes: '#ffffff', outline: '#101214', mouth: '#ffffff', blush: '#ff5c7a', accent: '#ff5c7a' }, style: { roundness: .2, outlineWidth: 0, shine: 0 } },
];
function applyPreset(p: typeof PRESETS[number]) {
  S.colors = { ...DEFAULT_COLORS, ...p.colors }; S.style = { ...ORIGINAL_STYLE, shadow: S.style.shadow, effects: S.style.effects, ...p.style };
  applyLive(); syncAll(); toast(`Stijl: ${p.name}`);
}
function drawPresets() {
  const host = document.querySelector('.presets'); if (!host) return;
  if (host.childElementCount) return;
  PRESETS.forEach((p, i) => host.append(h('button', { class: 'preset', type: 'button', onclick: () => applyPreset(p) },
    svgFrag(thumbSvg('happy', `pr${i}_`, { style: { ...ORIGINAL_STYLE, ...p.style }, colors: { ...DEFAULT_COLORS, ...p.colors } })), p.name)));
}
function panelColor() {
  const COLOR_LABELS: [keyof Colors, string][] = [['body', 'Lijf'], ['eyes', 'Ogen'], ['outline', 'Omlijning'], ['mouth', 'Mond'], ['blush', 'Blosjes'], ['accent', 'Effecten']];
  const swatch = (k: keyof Colors, label: string) => {
    const id = `col-${k}`, inp = h('input', { id, type: 'color', value: toHex6(S.colors[k]), oninput: () => { S.colors[k] = inp.value; applyLive(); } }) as HTMLInputElement;
    const l = h('label', { class: 'sw', for: id }, label, inp); (l as any).sync = () => { inp.value = toHex6(S.colors[k]); }; return l;
  };
  const stageId = 'col-stage', stage = h('input', { id: stageId, type: 'color', value: S.stage.color, oninput: () => { S.stage.color = stage.value; paintStage(); persist(); } }) as HTMLInputElement;
  return [
    sec('Stijlen', h('div', { class: 'presets' }), h('p', { class: 'hint', text: 'Een stijl zet kleuren en vorm in één keer; daarna kun je alles los bijstellen.' })),
    sec('Kleuren', h('div', { class: 'swatches' }, ...COLOR_LABELS.map(([k, l]) => swatch(k, l)))),
    sec('Podium', h('label', { class: 'sw', for: stageId }, 'Achtergrond bij "Kleur"', stage)),
  ];
}
function toHex6(c: string) { if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'; }

function panelFace() {
  return [
    sec('Mond en blosjes',
      check('Mond tonen', () => S.style.mouth, set('mouth')),
      seg('Blosjes', [['auto', 'Per toestand'], ['always', 'Altijd'], ['off', 'Uit']], () => S.style.blush, set('blush')),
      h('p', { class: 'hint', text: 'Elke toestand heeft zijn eigen mond (lach, frons, open) en blos. Verliefd en verlegen blozen het meest.' })),
    sec('Effecten',
      check('Effecten rond Dashy', () => S.style.effects, set('effects')),
      h('p', { class: 'hint', text: 'Zzz bij slaperig, hartjes bij verliefd, confetti bij opgewonden, een vraagteken bij verward, stoom bij boos, muzieknoten bij dansen, en meer.' })),
  ];
}
function panelMotion() {
  return [
    sec('Tempo',
      slider({ label: 'Snelheid', min: .25, max: 3, step: .05, get: () => S.motion.speed, set: setM('speed'), fmt: times }),
      slider({ label: 'Verende', min: .4, max: 2.5, step: .05, get: () => S.motion.bounce, set: setM('bounce'), fmt: times }),
      h('p', { class: 'hint', text: 'Verende: hoger laat zijn lijf langer natrillen na een sprong of por.' })),
    sec('Leven',
      slider({ label: 'Ademhaling', min: 0, max: 2, step: .05, get: () => S.motion.ambient, set: setM('ambient'), fmt: times }),
      slider({ label: 'Kopdraai (3D)', min: 0, max: 2, step: .05, get: () => S.motion.perspective, set: setM('perspective'), fmt: times }),
      check('Ogen volgen de muis', () => S.motion.followPointer, setM('followPointer'))),
    sec('Knipperen',
      check('Knipperen', () => S.motion.blink.enabled, v => { S.motion.blink.enabled = v; applyLive(); }),
      slider({ label: 'Minstens elke', min: 300, max: 8000, step: 100, get: () => S.motion.blink.minMs, set: v => { S.motion.blink.minMs = v; S.motion.blink.maxMs = Math.max(v, S.motion.blink.maxMs); applyLive(); syncAll(); }, fmt: v => `${(v / 1000).toFixed(1)}s` }),
      slider({ label: 'Hooguit elke', min: 300, max: 12000, step: 100, get: () => S.motion.blink.maxMs, set: v => { S.motion.blink.maxMs = v; S.motion.blink.minMs = Math.min(v, S.motion.blink.minMs); applyLive(); syncAll(); }, fmt: v => `${(v / 1000).toFixed(1)}s` })),
  ];
}

// expression editor: sliders over the same eye and decor parameters the states use
const LOOK_LABELS: Record<keyof Look, string> = { sd: 'Oogafstand', eh: 'Ooghoogte', cover: 'Ooglid', lidA: 'Lidhoek', low: 'Lachboog', tilt: 'Kanteling', asym: 'Scheefheid' };
function previewDraft() { if (!handle) return; handle.setState(S.draft.state); handle.setLook(S.draft.look, S.draft.decor); persist(); }
function panelExpr() {
  const base = h('select', { id: 'draft-base', onchange: () => { S.draft.state = base.value as DashyState; previewDraft(); } }) as HTMLSelectElement;
  STATE_KEYS.forEach(s => base.append(h('option', { value: s, text: `${names[s].n} (${s})`, selected: S.draft.state === s })));
  (base as any).sync = () => { base.value = S.draft.state; };
  const fx = h('select', { id: 'draft-fx', onchange: () => { S.draft.decor.fx = fx.value as Effect; previewDraft(); } }) as HTMLSelectElement;
  EFFECTS.forEach(e => fx.append(h('option', { value: e, text: e, selected: S.draft.decor.fx === e })));
  (fx as any).sync = () => { fx.value = S.draft.decor.fx ?? 'none'; };
  const name = h('input', { id: 'draft-name', type: 'text', placeholder: 'naam, bv. trots-knipoog', maxlength: 64 }) as HTMLInputElement;
  const err = h('p', { class: 'err' });
  const savedList = h('div', { class: 'saved' });
  const refreshSaved = () => savedList.replaceChildren(...Object.keys(S.expressions).map(k => h('span', { class: 'chip' },
    h('span', { class: 'go', role: 'button', tabindex: 0, title: 'Bewerk', onclick: () => { S.draft = structuredClone(S.expressions[k]); name.value = k; syncAll(); previewDraft(); } }, k),
    h('button', { type: 'button', 'aria-label': `Verwijder ${k}`, onclick: () => { delete S.expressions[k]; if (S.state === k) S.state = 'idle'; refreshSaved(); buildLibrary(); persist(); } }, '×'))));
  refreshSaved();
  const fromState = () => {
    const s = S.draft.state, row = BASE_LOOK[s]; S.draft.look = { ...row }; S.draft.decor = { ...STATE_DECOR[s] };
    syncAll(); previewDraft();
  };
  const lookSliders = (Object.keys(LOOK_LABELS) as (keyof Look)[]).map(k => slider({ label: LOOK_LABELS[k], min: LOOK_RANGE[k][0], max: LOOK_RANGE[k][1], step: k === 'eh' || k === 'lidA' || k === 'tilt' || k === 'sd' ? 1 : .01,
    get: () => S.draft.look[k] ?? 0, set: v => { S.draft.look[k] = v; previewDraft(); }, fmt: k === 'eh' || k === 'lidA' || k === 'tilt' || k === 'sd' ? f0 : f2 }));
  return [
    sec('Basis', h('div', { class: 'row', style: 'grid-template-columns:112px 1fr' }, h('label', { for: 'draft-base', text: 'Lijf van' }), base),
      h('div', { class: 'controls' }, h('button', { class: 'btn small', type: 'button', onclick: fromState }, 'Neem ogen van deze toestand over'), h('button', { class: 'btn small', type: 'button', onclick: previewDraft }, 'Bekijk op podium')),
      h('p', { class: 'hint', text: 'De basistoestand geeft de lichaamsbeweging (springen, trillen, deinen); hieronder zet je de ogen en het gezicht zelf.' })),
    sec('Ogen', ...lookSliders),
    sec('Gezicht',
      slider({ label: 'Blos', min: 0, max: 1, step: .01, get: () => S.draft.decor.blush ?? 0, set: v => { S.draft.decor.blush = v; previewDraft(); }, fmt: pct }),
      slider({ label: 'Mondlijn', min: -1, max: 1, step: .01, get: () => S.draft.decor.mouth ?? 0, set: v => { S.draft.decor.mouth = v; previewDraft(); }, fmt: f2 }),
      slider({ label: 'Mond open', min: 0, max: 1, step: .01, get: () => S.draft.decor.open ?? 0, set: v => { S.draft.decor.open = v; previewDraft(); }, fmt: pct }),
      slider({ label: 'Mondbreedte', min: .3, max: 1.6, step: .01, get: () => S.draft.decor.mouthWidth ?? 1, set: v => { S.draft.decor.mouthWidth = v; previewDraft(); }, fmt: times }),
      h('div', { class: 'row', style: 'grid-template-columns:112px 1fr' }, h('label', { for: 'draft-fx', text: 'Effect' }), fx),
      h('p', { class: 'hint', text: 'Mondlijn en blos zie je alleen als de mond en blosjes aan staan (tab Gezicht).' })),
    sec('Bewaren',
      h('div', { class: 'controls' }, name, h('button', { class: 'btn small primary', type: 'button', onclick: () => {
        const k = name.value.trim().toLowerCase().replace(/\s+/g, '-');
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(k)) { err.textContent = 'Gebruik kleine letters en streepjes, bv. "trots-knipoog".'; return; }
        if (isBuiltIn(k)) { err.textContent = `"${k}" is al een ingebouwde toestand; kies een andere naam.`; return; }
        err.textContent = ''; S.expressions[k] = structuredClone(S.draft); persist(); refreshSaved(); buildLibrary(); refreshSeqOptions(); toast(`Expressie "${k}" bewaard`);
      } }, 'Bewaar expressie')), err, savedList),
  ];
}
/** The eyes of every state, from core.ts's own table (read through a throwaway look-free step). */
const BASE_LOOK: Record<DashyState, Required<Look>> = (() => {
  const T: Record<string, number[]> = { idle: [0, 66, .05, 0, 0, 0, 0], received: [0, 66, .05, 0, 0, 0, 0], working: [-1, 60, .2, 4, 0, 0, 0], thinking: [0, 64, .12, 8, 0, 0, .22],
    waiting: [2, 72, .08, -14, 0, 0, 0], blocked: [3, 68, .26, -30, 0, 0, 0], done: [0, 62, 0, 0, .42, 7, 0], happy: [0, 68, 0, 0, .26, 6, 0], sad: [3, 54, .4, -16, 0, 0, 0],
    angry: [-2, 62, .44, 24, 0, 0, 0], strict: [0, 66, .5, 3, 0, 0, 0], dancing: [0, 68, 0, 0, .44, 7, 0], sleepy: [2, 62, .6, -6, 0, 0, 0], surprised: [3, 84, 0, 0, 0, 0, 0],
    love: [-1, 74, 0, 0, .42, -4, 0], confused: [0, 64, .14, -10, 0, -5, .35], excited: [1, 74, 0, 0, .3, 3, 0], scared: [-3, 74, .06, -22, 0, 0, 0], curious: [0, 70, .04, 0, 0, 0, -.3],
    proud: [0, 62, .4, 7, 0, 0, -.1], dizzy: [0, 62, .1, 0, 0, 0, .2], bored: [1, 58, .52, -4, 0, 0, 0], wink: [0, 68, 0, 0, .34, 5, .5], talking: [0, 66, .06, 0, 0, 0, 0],
    listening: [0, 70, 0, -6, 0, 0, 0], shy: [-1, 60, 0, 0, .32, -3, 0] };
  return Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { sd: v[0], eh: v[1], cover: v[2], lidA: v[3], low: v[4], tilt: v[5], asym: v[6] }])) as Record<DashyState, Required<Look>>;
})();

// ---------- sequences (the dope sheet)

function refreshSeqOptions() {
  const pick = $<HTMLSelectElement>('#seq-pick');
  pick.replaceChildren(...Object.keys(S.sequences).map(k => h('option', { value: k, text: k, selected: k === S.seq })));
  if (!S.sequences[S.seq]) S.seq = Object.keys(S.sequences)[0] ?? '';
  $<HTMLSelectElement>('#seq-mode').value = S.sequences[S.seq]?.mode ?? 'once';
  drawTrack();
}
function exprOptions(selected: string) {
  const sel = h('select', {}) as HTMLSelectElement;
  const g1 = h('optgroup', { label: 'Toestanden' }); STATE_KEYS.forEach(s => g1.append(h('option', { value: s, text: s, selected: s === selected })));
  sel.append(g1);
  const keys = Object.keys(S.expressions);
  if (keys.length) { const g2 = h('optgroup', { label: 'Eigen' }); keys.forEach(k => g2.append(h('option', { value: k, text: k, selected: k === selected }))); sel.append(g2); }
  return sel;
}
function drawTrack() {
  const sq = S.sequences[S.seq], track = $('#track');
  if (!sq) { track.replaceChildren(h('p', { class: 'hint', text: 'Nog geen sequentie. Klik op Nieuw.' })); return; }
  const total = sq.steps.reduce((a, s) => a + s.holdMs + s.transitionMs, 0) || 1;
  track.replaceChildren(...sq.steps.map((st, i) => {
    const ex = exprOptions(st.expression); ex.onchange = () => { st.expression = ex.value; persist(); };
    const num = (k: 'holdMs' | 'transitionMs', max: number) => { const n = h('input', { type: 'number', min: 0, max, step: 50, value: st[k] }) as HTMLInputElement; n.onchange = () => { st[k] = Math.max(0, Math.min(max, Math.round(+n.value || 0))); if (sq.mode === 'loop' && st.holdMs + st.transitionMs < 50) st.holdMs = 50; persist(); drawTrack(); }; return n; };
    const ease = h('select', {}) as HTMLSelectElement; (['spring', 'smooth', 'snappy'] as const).forEach(e => ease.append(h('option', { value: e, text: { spring: 'verend', smooth: 'zacht', snappy: 'kordaat' }[e], selected: (st.ease ?? 'spring') === e })));
    ease.onchange = () => { st.ease = ease.value as 'spring'; persist(); };
    const w = (st.holdMs + st.transitionMs) / total;
    return h('div', { class: 'cell', 'data-i': i },
      h('span', { class: 'num', text: `stap ${String(i + 1).padStart(2, '0')}` }),
      h('button', { class: 'x', type: 'button', 'aria-label': `Verwijder stap ${i + 1}`, onclick: () => { if (sq.steps.length > 1) { sq.steps.splice(i, 1); persist(); drawTrack(); } else toast('Een sequentie heeft minstens één stap.'); } }, '×'),
      ex, h('label', {}, 'houd', num('holdMs', 60000)), h('label', {}, 'overg.', num('transitionMs', 10000)), h('label', {}, 'gevoel', ease),
      h('div', { class: 'ruler', title: `${Math.round(w * 100)}% van de sequentie` }, h('i', { class: 't', style: `left:0;width:${(st.transitionMs / (st.holdMs + st.transitionMs || 1)) * 100}%` }), h('i', { style: `left:${(st.transitionMs / (st.holdMs + st.transitionMs || 1)) * 100}%;right:0` })));
  }));
}
function markCell(i: number) { document.querySelectorAll('.cell').forEach(c => c.classList.toggle('now', +(c as HTMLElement).dataset.i! === i)); }

// ---------- export

let downloadsP: Promise<any> | null = null;
const claudeRt = (window as any).claude;
if (claudeRt?.use) downloadsP = claudeRt.use('downloads').catch(() => null);
async function save(filename: string, data: Blob | string) {
  const dl = downloadsP ? await downloadsP : null;
  if (dl) {
    try { await dl.save({ filename, data }); toast(`Opgeslagen: ${filename}`); }
    catch (e: any) { if (e?.code !== 'declined') toast(`Opslaan lukte niet (${e?.code ?? 'fout'}). Probeer het nog eens.`); }
    return;
  }
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data]) : data);
  const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); toast(`Gedownload: ${filename}`);
}
const slug = () => (S.name || 'dashy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashy';
function exportBackground(kind: string): Background | undefined {
  if (kind === 'stage') return S.stage.color;
  if (kind === 'body') return S.colors.eyes;
  if (kind === 'gradient') return { type: 'radial', from: S.stage.color, to: S.colors.accent };
  return undefined;
}
function defJson() { return JSON.stringify(definition(), null, 2) + '\n'; }
function animFor(state: string, seconds = 2, fps = 20) {
  const ex = S.expressions[state], base = ex ? ex.state : (isBuiltIn(state) ? state : 'idle');
  return recordFrames(base, { style: S.style, look: ex?.look, decorLook: ex?.decor, durationMs: seconds * 1000, fps, bounce: S.motion.bounce, ambient: S.motion.ambient, perspective: S.motion.perspective,
    blink: S.motion.blink });
}
function embedHtml(state: string) {
  const ex = S.expressions[state];
  const start = ex ? `dashy.setState(${JSON.stringify(ex.state)}); dashy.express(${JSON.stringify(state)});` : `dashy.setState(${JSON.stringify(isBuiltIn(state) ? state : 'idle')});`;
  return `<!doctype html>
<html lang="nl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${S.name.replace(/[<&"]/g, '')}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${S.stage.color}}#dashy{width:240px;height:240px}</style>
<div id="dashy"></div>
<script>${RUNTIME_IIFE.replace(/<\/script/gi, '<\\/script')}</script>
<script>
  // Dashy: ${STATE_KEYS.length} toestanden (${STATE_KEYS.join(', ')})
  const definition = ${JSON.stringify(definition())};
  const dashy = DashyAvatar.mountDashy(document.getElementById('dashy'), { definition });
  ${start}
  // dashy.setState('happy'); dashy.play('${Object.keys(S.sequences)[0] ?? 'hallo'}'); dashy.setTalking(true); dashy.poke();
</script>
</html>
`;
}
function snippet(kind: 'react' | 'vanilla' | 'json') {
  const seq = Object.keys(S.sequences)[0];
  if (kind === 'react') return `import { Dashy } from 'dashy-avatar/react';
import definition from './${slug()}.json';

export function Buddy({ state = 'idle', talking = false }) {
  // state: ${STATE_KEYS.join(' | ')}
  return <Dashy size={160} state={state} talking={talking} definition={definition}${seq ? ` sequence={undefined /* of '${seq}' */}` : ''} />;
}`;
  if (kind === 'vanilla') return `import { mountDashy } from './dashy.js';
import definition from './${slug()}.json' with { type: 'json' };

const dashy = mountDashy(document.getElementById('avatar'), { definition });
dashy.setState('${isBuiltIn(S.state) ? S.state : 'idle'}');${seq ? `\ndashy.play('${seq}');` : ''}
dashy.setTalking(true);          // mond beweegt (bij spraak)
dashy.setStyle({ shine: 0.6 });  // alles uit de studio kan ook live
const png = await dashy.snapshot({ format: 'png', size: 512 });`;
  return defJson();
}
async function pngBytes(svg: string, size: number) { return new Uint8Array(await (await renderPng(svg, size)).arrayBuffer()); }
async function spriteSheet(state: string, cell = 256, fps = 20, seconds = 2) {
  const frames = animFor(state, seconds, fps), cols = 8, rows = Math.ceil(frames.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * cell; canvas.height = rows * cell;
  const g = canvas.getContext('2d')!;
  for (let i = 0; i < frames.length; i++) {
    const svg = renderSvg(frames[i].G, { style: S.style, colors: S.colors, decor: frames[i].D, idPrefix: `sp${i}_`, margin: 0 });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try { const img = new Image(); img.src = url; await img.decode(); g.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell); } finally { URL.revokeObjectURL(url); }
  }
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('PNG lukt niet'))), 'image/png'));
  return { blob, meta: { image: `${slug()}-${state}-sprites.png`, frameWidth: cell, frameHeight: cell, columns: cols, rows, frames: frames.length, fps, loop: true } };
}
async function zipAll(progress: (p: number) => void) {
  const entries: ZipEntry[] = [], list = [...STATE_KEYS, ...Object.keys(S.expressions)];
  const name = slug();
  entries.push({ name: `${name}/${name}.json`, data: defJson() });
  entries.push({ name: `${name}/dashy.js`, data: RUNTIME_ESM });
  entries.push({ name: `${name}/dashy.global.js`, data: RUNTIME_IIFE });
  entries.push({ name: `${name}/embed.html`, data: embedHtml(isBuiltIn(S.state) ? S.state : 'idle') });
  entries.push({ name: `${name}/README.md`, data: readme(list) });
  for (let i = 0; i < list.length; i++) {
    const k = list[i], ex = S.expressions[k], base = ex ? ex.state : k as DashyState;
    const F = settledFrame(base, { style: S.style, look: ex?.look, decorLook: ex?.decor });
    const svg = renderSvg(F.G, { style: S.style, colors: S.colors, decor: F.D, title: `${S.name}: ${ex ? k : names[base].n}` });
    entries.push({ name: `${name}/svg/${k}.svg`, data: svg });
    entries.push({ name: `${name}/png/${k}-512.png`, data: await pngBytes(svg, 512) });
    entries.push({ name: `${name}/png/${k}-128.png`, data: await pngBytes(svg, 128) });
    const small = renderSvg(F.G, { colors: S.colors, variant: 'small', margin: 10, style: S.style });
    entries.push({ name: `${name}/icon/${k}-32.png`, data: await pngBytes(small, 32) });
    entries.push({ name: `${name}/animated/${k}.svg`, data: renderAnimatedSvg(animFor(k, 1.6, 16), 16, { style: S.style, colors: S.colors, title: `${S.name}: ${k}` }) });
    progress((i + 1) / list.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return zip(entries);
}
function readme(list: string[]) {
  return `# ${S.name}

Geëxporteerd uit Dashy Studio.

| Map / bestand | Wat |
|---|---|
| \`${slug()}.json\` | De definitie: vorm, kleuren, gezicht, beweging, eigen expressies en sequenties (schema dashy/avatar-definition v2). |
| \`dashy.js\` | De runtime als ES-module (\`mountDashy\`, \`createDashy\`, \`renderSvg\`...), zonder dependencies. |
| \`dashy.global.js\` | Dezelfde runtime voor een gewone \`<script>\`: \`window.DashyAvatar\`. |
| \`embed.html\` | Werkend voorbeeld: alles in één bestand. |
| \`svg/\`, \`png/\` | Stills van elke toestand (${list.length}). |
| \`animated/\` | Geanimeerde SVG per toestand (SMIL, geen scripts; loopt in browsers). |
| \`icon/\` | 32 px, vereenvoudigd voor kleine formaten. |

## Gebruik

\`\`\`js
${snippet('vanilla')}
\`\`\`

React (met het dashy-avatar pakket):

\`\`\`tsx
${snippet('react')}
\`\`\`

Toestanden: ${STATE_KEYS.join(', ')}.
${Object.keys(S.expressions).length ? `Eigen expressies: ${Object.keys(S.expressions).join(', ')} (\`dashy.express('naam')\`).\n` : ''}${Object.keys(S.sequences).length ? `Sequenties: ${Object.keys(S.sequences).join(', ')} (\`dashy.play('naam')\`).\n` : ''}`;
}

function panelExport() {
  const bg = h('select', { id: 'ex-bg', 'aria-label': 'Achtergrond' }, h('option', { value: 'none', text: 'transparant' }), h('option', { value: 'stage', text: 'podiumkleur' }), h('option', { value: 'gradient', text: 'verloop' }), h('option', { value: 'body', text: 'oogkleur (app-icoon)' })) as HTMLSelectElement;
  const size = h('select', { id: 'ex-size', 'aria-label': 'Formaat' }, ...[128, 256, 512, 1024].map(s => h('option', { value: s, text: `${s} px`, selected: s === 512 }))) as HTMLSelectElement;
  const bar = h('i'), prog = h('div', { class: 'progress', hidden: true }, bar);
  const pre = h('pre', { class: 'code' }), tabsRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Codevoorbeeld' });
  let codeKind: 'react' | 'vanilla' | 'json' = 'vanilla';
  const showCode = () => { pre.textContent = snippet(codeKind); tabsRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === codeKind))); };
  (pre as any).sync = showCode;
  for (const [v, t] of [['vanilla', 'JavaScript'], ['react', 'React'], ['json', 'JSON']] as const) tabsRow.append(h('button', { type: 'button', 'data-v': v, onclick: () => { codeKind = v; showCode(); } }, t));
  showCode();
  const copy = async () => { try { await navigator.clipboard.writeText(pre.textContent ?? ''); toast('Gekopieerd'); } catch { const r = document.createRange(); r.selectNodeContents(pre); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); toast('Geselecteerd: kopieer met Ctrl/Cmd + C'); } };
  const ex = (title: string, desc: string, btn: string, run: () => Promise<void> | void, extra?: Node) =>
    h('div', { class: 'ex' }, h('b', { text: title }), h('button', { class: 'btn small', type: 'button', onclick: async (e: Event) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; try { await run(); } catch (err) { toast(`Export mislukt: ${(err as Error).message}`); } finally { b.disabled = false; } } }, btn), h('p', {}, desc, extra ?? ''));
  const cur = () => S.state;
  const imp = h('textarea', { class: 'code', id: 'import-json', placeholder: 'Plak hier een dashy.json om hem te laden', spellcheck: 'false' }) as HTMLTextAreaElement;
  const impErr = h('p', { class: 'err' });
  return [
    sec('Instellingen', h('div', { class: 'controls' }, h('label', { class: 'label', for: 'ex-bg', text: 'Achtergrond' }), bg, h('label', { class: 'label', for: 'ex-size', text: 'PNG' }), size),
      h('div', { class: 'row', style: 'grid-template-columns:112px 1fr' }, h('label', { for: 'av-name', text: 'Naam' }), h('input', { id: 'av-name', type: 'text', value: S.name, maxlength: 120, oninput: (e: Event) => { S.name = (e.target as HTMLInputElement).value; persist(); } }))),
    sec('Bestanden', h('div', { class: 'exports' },
      ex('Alles in één pakket', 'Definitie, runtime, embed.html, en van elke toestand SVG, PNG (128/512), 32 px icoon en een animatie.', '.zip', async () => {
        prog.hidden = false; const blob = await zipAll(p => { bar.style.width = `${p * 100}%`; }); prog.hidden = true; await save(`${slug()}-pakket.zip`, blob);
      }, prog),
      ex('Definitie', 'Eén JSON met alles wat je hier instelt. Laad hem met mountDashy of <Dashy definition>.', '.json', () => save(`${slug()}.json`, defJson())),
      ex('Still van nu', 'Precies wat op het podium staat, als SVG.', '.svg', async () => save(`${slug()}-${cur()}.svg`, await handle!.snapshot({ format: 'svg', background: exportBackground(bg.value) }) as string)),
      ex('PNG van nu', 'Formaat en achtergrond zie je hierboven.', '.png', async () => save(`${slug()}-${cur()}-${size.value}.png`, await handle!.snapshot({ format: 'png', size: +size.value, background: exportBackground(bg.value) }) as Blob)),
      ex('Animatie', 'Twee seconden van deze toestand als geanimeerde SVG, loopt eindeloos.', '.svg', () => save(`${slug()}-${cur()}-animated.svg`, renderAnimatedSvg(animFor(cur()), 20, { style: S.style, colors: S.colors, background: exportBackground(bg.value), title: `${S.name}: ${cur()}` }))),
      ex('Spritesheet', '40 frames van 256 px in 8 kolommen, 20 fps: voor games en Lottie-loze apps.', '.png', async () => { const r = await spriteSheet(cur()); await save(r.meta.image, r.blob); }),
      ex('Losse webpagina', 'Eén HTML-bestand met runtime en definitie erin: openen en hij leeft.', '.html', () => save(`${slug()}-embed.html`, embedHtml(cur()))),
    )),
    sec('Code', tabsRow, pre, h('div', { class: 'controls' }, h('button', { class: 'btn small', type: 'button', onclick: copy }, 'Kopieer'))),
    sec('Importeren', imp, impErr, h('div', { class: 'controls' }, h('button', { class: 'btn small', type: 'button', onclick: () => {
      const r = parseDefinition(imp.value);
      if (!r.ok) { impErr.textContent = `${r.errors[0].path || '/'}: ${r.errors[0].message}`; return; }
      impErr.textContent = ''; loadDefinition(r.value as any); imp.value = ''; toast('Definitie geladen');
    } }, 'Laden'))),
  ];
}
function loadDefinition(d: any) {
  const n = fresh();
  S.name = d.name ?? 'Dashy';
  S.colors = { ...DEFAULT_COLORS, ...d.colors };
  S.style = { ...ORIGINAL_STYLE, ...(d.shape === 'circle' ? { roundness: 1 } : {}), ...(d.eyeScale ? { eyeScale: d.eyeScale } : {}), ...d.style };
  S.motion = { ...ORIGINAL_MOTION, ...d.motion, blink: { ...ORIGINAL_MOTION.blink, ...d.motion?.blink } };
  S.expressions = Object.fromEntries(Object.entries(d.expressions ?? {}).map(([k, e]: [string, any]) => [k, { state: e.state ?? 'idle', look: { ...e.look }, decor: { ...e.decor } }]));
  S.sequences = structuredClone(d.sequences ?? {}); S.seq = Object.keys(S.sequences)[0] ?? '';
  S.state = 'idle'; S.draft = n.draft;
  rebuildAll();
}

// ---------- wiring

function buildPanels() {
  const P: Record<string, () => Node[]> = { look: panelLook, color: panelColor, face: panelFace, motion: panelMotion, expr: panelExpr, export: panelExport };
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(p => p.replaceChildren(...P[p.dataset.panel!]()));
}
function rebuildAll() { buildPanels(); buildLibrary(); refreshSeqOptions(); mount(); paintStage(); persist(); }
function paintStage() {
  const st = $('#stage');
  st.className = `stage bg-${S.stage.bg}`;
  st.style.background = S.stage.bg === 'solid' ? S.stage.color : '';
  document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bg === S.stage.bg)));
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  if (t.dataset.tab === 'expr' && !S.expressions[S.state]) previewDraft();
  if (t.dataset.tab === 'export') (document.querySelector('pre.code') as any)?.sync?.();
}));
document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach(b => b.addEventListener('click', () => { S.stage.bg = b.dataset.bg as Studio['stage']['bg']; paintStage(); persist(); }));
$('#poke').onclick = () => handle?.poke();
$('#talk').onclick = () => {
  talking = !talking; handle?.setTalking(talking);
  $('#talk').classList.toggle('on', talking); $('#talk').setAttribute('aria-pressed', String(talking));
  if (talking && !S.style.mouth) { S.style.mouth = true; applyLive(); syncAll(); toast('Mond aangezet, zodat je hem ziet praten'); }
};
$('#pause').onclick = () => {
  paused = !paused; $('#pause').textContent = paused ? 'Speel af' : 'Pauzeer'; $('#pause').setAttribute('aria-pressed', String(paused)); mount();
};
$('#pause').textContent = paused ? 'Speel af' : 'Pauzeer';
$<HTMLSelectElement>('#seq-pick').onchange = e => { S.seq = (e.target as HTMLSelectElement).value; persist(); refreshSeqOptions(); };
$<HTMLSelectElement>('#seq-mode').onchange = e => { const sq = S.sequences[S.seq]; if (sq) { sq.mode = (e.target as HTMLSelectElement).value as Sequence['mode']; for (const st of sq.steps) if (sq.mode === 'loop' && st.holdMs + st.transitionMs < 50) st.holdMs = 50; persist(); } };
$('#seq-add').onclick = () => { const sq = S.sequences[S.seq]; if (!sq) return; if (sq.steps.length >= 64) return toast('Hooguit 64 stappen.'); sq.steps.push({ expression: isBuiltIn(S.state) || S.expressions[S.state] ? S.state : 'idle', holdMs: 600, transitionMs: 200, ease: 'spring' }); persist(); drawTrack(); };
$('#seq-new').onclick = () => { let i = 1; while (S.sequences[`sequentie-${i}`]) i++; const k = `sequentie-${i}`; S.sequences[k] = { mode: 'once', steps: [{ expression: 'idle', holdMs: 600, transitionMs: 200, ease: 'spring' }] }; S.seq = k; persist(); refreshSeqOptions(); };
$('#seq-del').onclick = () => { if (!S.sequences[S.seq]) return; delete S.sequences[S.seq]; S.seq = Object.keys(S.sequences)[0] ?? ''; persist(); refreshSeqOptions(); };
$('#seq-play').onclick = () => {
  if (!S.sequences[S.seq]) return;
  if (paused) { paused = false; $('#pause').textContent = 'Pauzeer'; $('#pause').setAttribute('aria-pressed', 'false'); }
  mount(S.seq); toast(`Speelt "${S.seq}"`);
};
$('#random').onclick = () => {
  const pal = PRESETS[1 + Math.floor(Math.random() * (PRESETS.length - 1))], r = (a: number, b: number) => +(a + Math.random() * (b - a)).toFixed(2);
  S.colors = { ...DEFAULT_COLORS, ...pal.colors };
  S.style = { ...S.style, roundness: r(0, 1), eyeWidth: Math.round(r(24, 46)), eyeScale: r(.65, 1.2), eyeSpacing: Math.round(r(28, 40)), eyeRoundness: r(.3, 1), shine: r(0, 1), mouth: Math.random() < .6, outlineWidth: r(0, 3) };
  const moods = STATE_KEYS.filter(s => !STATUS.includes(s)); select(moods[Math.floor(Math.random() * moods.length)]);
  applyLive(); syncAll(); toast(`Verrassing: ${pal.name}-kleuren op ${names[S.state as DashyState].n}`);
};
$('#reset').onclick = () => { const keep = { expressions: S.expressions, sequences: S.sequences, seq: S.seq }; S = { ...fresh(), ...keep, style: { ...ORIGINAL_STYLE }, colors: { ...DEFAULT_COLORS } }; rebuildAll(); toast('Terug naar het origineel (je expressies en sequenties blijven)'); };
$('#quick-export').onclick = async () => {
  const b = $<HTMLButtonElement>('#quick-export'); b.disabled = true; const t = b.textContent; b.textContent = 'Bezig...';
  try { await save(`${slug()}-pakket.zip`, await zipAll(p => { b.textContent = `Bezig... ${Math.round(p * 100)}%`; })); } catch (e) { toast(`Export mislukt: ${(e as Error).message}`); }
  finally { b.disabled = false; b.textContent = t; }
};

// frame counter and sequence playhead, like a dope sheet
function tick(t: number) {
  $('#hud-frame').textContent = String(Math.floor(t / (1000 / 24)) % 10000).padStart(4, '0');
  const sq = S.sequences[S.seq];
  if (seqStart && sq) { const r = stepAt(sq, (t - seqStart) * S.motion.speed); markCell(r.done ? -1 : r.index); if (r.done) seqStart = 0; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

rebuildAll();
