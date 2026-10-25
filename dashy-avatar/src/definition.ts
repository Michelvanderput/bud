/**
 * Dashy definition: one portable JSON file that holds a look (shape, colours, eye proportion), custom expressions and
 * named sequences. Same file for every renderer. No dependencies: the validator is plain TypeScript.
 *
 * {
 *   "schema": "dashy/avatar-definition", "schemaVersion": 1, "name": "Dashy",
 *   "shape": "square", "colors": { "body": "#fff", "eyes": "#101214", "outline": "#c9c9c4" }, "eyeScale": 0.83,
 *   "expressions": { "smug": { "state": "idle", "look": { "cover": 0.45, "lidA": -6, "low": 0.2 } } },
 *   "sequences": { "hello": { "mode": "once", "steps": [ { "expression": "happy", "holdMs": 900, "transitionMs": 250, "ease": "snappy" } ] } }
 * }
 */
import type { DashyState, Shape } from './core';
import { LOOK_RANGE, type BlinkConfig, type Ease, type Expression, type Look, type PlaybackMode, type Sequence } from './timeline';

export const DEFINITION_SCHEMA = 'dashy/avatar-definition';
export const DEFINITION_MAX_BYTES = 262_144;
export const DEFINITION_MAX_DEPTH = 16;
export const KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STATES: readonly string[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface Colors { body: string; eyes: string; outline: string }
export const DEFAULT_COLORS: Readonly<Colors> = { body: '#fff', eyes: '#101214', outline: '#c9c9c4' };

export interface DashyDefinition {
  schema: typeof DEFINITION_SCHEMA;
  schemaVersion: 1;
  name?: string;
  shape?: Shape;
  colors?: Partial<Colors>;
  eyeScale?: number;
  expressions: Record<string, Expression>;
  sequences: Record<string, Sequence>;
}
export interface DefinitionError { path: string; message: string }
export type DefinitionResult = { ok: true; value: Readonly<DashyDefinition> } | { ok: false; errors: DefinitionError[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const depthOf = (v: unknown, d = 0): number => (isObj(v) || Array.isArray(v)) && d <= DEFINITION_MAX_DEPTH ? Math.max(d, ...Object.values(v as object).map(x => depthOf(x, d + 1))) : d;

/** Validates a value that is already parsed. Never throws, never mutates; the result is deeply frozen. */
export function validateDefinition(input: unknown): DefinitionResult {
  const errors: DefinitionError[] = [];
  const bad = (path: string, message: string) => { errors.push({ path, message }); };
  if (!isObj(input)) return { ok: false, errors: [{ path: '', message: 'must be an object' }] };
  if (depthOf(input) > DEFINITION_MAX_DEPTH) return { ok: false, errors: [{ path: '', message: `nested deeper than ${DEFINITION_MAX_DEPTH} levels` }] };
  const known = (o: Record<string, unknown>, keys: string[], path: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) bad(`${path}/${esc(k)}`, 'unknown property'); };
  const num = (v: unknown, path: string, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) { bad(path, `must be a number from ${min} to ${max}`); return false; } return true; };

  known(input, ['schema', 'schemaVersion', 'name', 'shape', 'colors', 'eyeScale', 'expressions', 'sequences'], '');
  if (input.schema !== DEFINITION_SCHEMA) bad('/schema', `must be "${DEFINITION_SCHEMA}"`);
  if (input.schemaVersion !== 1) bad('/schemaVersion', 'must be 1');
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 120)) bad('/name', 'must be a text of at most 120 characters');
  if (input.shape !== undefined && input.shape !== 'square' && input.shape !== 'circle') bad('/shape', 'must be "square" or "circle"');
  if (input.eyeScale !== undefined) num(input.eyeScale, '/eyeScale', .5, 1.4);
  if (input.colors !== undefined) {
    if (!isObj(input.colors)) bad('/colors', 'must be an object');
    else { known(input.colors, ['body', 'eyes', 'outline'], '/colors'); for (const [k, v] of Object.entries(input.colors)) if (typeof v !== 'string' || !HEX.test(v)) bad(`/colors/${esc(k)}`, 'must be a hex colour like #fff or #101214'); }
  }

  const expressions = input.expressions, sequences = input.sequences;
  if (!isObj(expressions)) bad('/expressions', 'must be an object (can be empty)');
  else {
    if (Object.keys(expressions).length > 64) bad('/expressions', 'at most 64 expressions');
    for (const [key, ex] of Object.entries(expressions)) {
      const p = `/expressions/${esc(key)}`;
      if (!KEY_PATTERN.test(key) || key.length > 64) bad(p, 'key must be lowercase words joined by dashes, like "smug-look"');
      else if (STATES.includes(key)) bad(p, 'key is the name of a built-in state; pick another');
      if (!isObj(ex)) { bad(p, 'must be an object'); continue; }
      known(ex, ['state', 'look'], p);
      if (ex.state !== undefined && !STATES.includes(ex.state as string)) bad(`${p}/state`, `must be one of: ${STATES.join(', ')}`);
      if (ex.look !== undefined) {
        if (!isObj(ex.look)) bad(`${p}/look`, 'must be an object');
        else { known(ex.look, Object.keys(LOOK_RANGE), `${p}/look`); for (const [k, v] of Object.entries(ex.look)) { const r = LOOK_RANGE[k as keyof Look]; if (r) num(v, `${p}/look/${esc(k)}`, r[0], r[1]); } }
      }
      if (ex.state === undefined && ex.look === undefined) bad(p, 'needs a state, a look, or both');
    }
  }
  if (!isObj(sequences)) bad('/sequences', 'must be an object (can be empty)');
  else {
    if (Object.keys(sequences).length > 64) bad('/sequences', 'at most 64 sequences');
    for (const [key, sq] of Object.entries(sequences)) {
      const p = `/sequences/${esc(key)}`;
      if (!KEY_PATTERN.test(key) || key.length > 64) bad(p, 'key must be lowercase words joined by dashes');
      if (!isObj(sq)) { bad(p, 'must be an object'); continue; }
      known(sq, ['mode', 'steps', 'blink'], p);
      if (!(['loop', 'once', 'pingPong'] as PlaybackMode[]).includes(sq.mode as PlaybackMode)) bad(`${p}/mode`, 'must be "loop", "once" or "pingPong"');
      if (!Array.isArray(sq.steps) || sq.steps.length < 1 || sq.steps.length > 64) bad(`${p}/steps`, 'must be a list of 1 to 64 steps');
      else sq.steps.forEach((s: unknown, i: number) => {
        const sp = `${p}/steps/${i}`;
        if (!isObj(s)) return bad(sp, 'must be an object');
        known(s, ['expression', 'holdMs', 'transitionMs', 'ease'], sp);
        const ref = s.expression;
        if (typeof ref !== 'string') bad(`${sp}/expression`, 'must be a text');
        else if (!STATES.includes(ref) && !(isObj(expressions) && Object.prototype.hasOwnProperty.call(expressions, ref))) bad(`${sp}/expression`, `"${ref}" is not a built-in state or a defined expression`);
        num(s.holdMs, `${sp}/holdMs`, 0, 60_000); num(s.transitionMs, `${sp}/transitionMs`, 0, 10_000);
        if (s.ease !== undefined && !(['spring', 'smooth', 'snappy'] as Ease[]).includes(s.ease as Ease)) bad(`${sp}/ease`, 'must be "spring", "smooth" or "snappy"');
        if (sq.mode === 'loop' && sq.steps && (sq.steps as unknown[]).length >= 1 && (s.holdMs as number) + (s.transitionMs as number) < 50) bad(sp, 'a loop step needs at least 50 ms in total');
      });
      if (sq.blink !== undefined) {
        if (!isObj(sq.blink)) bad(`${p}/blink`, 'must be an object');
        else {
          known(sq.blink, ['enabled', 'minMs', 'maxMs', 'durationMs'], `${p}/blink`);
          const b = sq.blink as BlinkConfig;
          if (b.enabled !== undefined && typeof b.enabled !== 'boolean') bad(`${p}/blink/enabled`, 'must be true or false');
          if (b.minMs !== undefined) num(b.minMs, `${p}/blink/minMs`, 300, 30_000);
          if (b.maxMs !== undefined) num(b.maxMs, `${p}/blink/maxMs`, 300, 60_000);
          if (b.durationMs !== undefined) num(b.durationMs, `${p}/blink/durationMs`, 60, 600);
          if (b.minMs !== undefined && b.maxMs !== undefined && b.minMs > b.maxMs) bad(`${p}/blink`, 'minMs must not be larger than maxMs');
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: deepFreeze(structuredClone(input)) as unknown as Readonly<DashyDefinition> };
}

/** For text from outside (a file, a form): checks the size, parses, then validates. */
export function parseDefinition(text: string): DefinitionResult {
  if (new TextEncoder().encode(text).length > DEFINITION_MAX_BYTES) return { ok: false, errors: [{ path: '', message: `larger than ${DEFINITION_MAX_BYTES / 1024} KiB` }] };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ path: '', message: `not valid JSON: ${(e as Error).message}` }] }; }
  return validateDefinition(raw);
}

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null) { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
}

export function isBuiltInState(k: string): k is DashyState { return STATES.includes(k); }
