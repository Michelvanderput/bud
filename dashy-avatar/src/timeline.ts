/**
 * Sequences: a timeline of expressions (a built-in state, or a custom look) with hold time and transition per step,
 * played once, looped or ping-pong. Pure like driver.ts: you pass the time in, it tells you which step is on.
 */
import type { DashyState } from './core';

/** The eye settings an expression can change. Same names and meaning as the table in core.ts. */
export interface Look {
  /** change of the distance between the eyes (core units) */ sd?: number;
  /** eye height */ eh?: number;
  /** upper lid, 0..1 */ cover?: number;
  /** lid slant in degrees, + angry, - sad */ lidA?: number;
  /** curved lower lid (happy arcs), 0..1 */ low?: number;
  /** eye tilt in degrees */ tilt?: number;
  /** left/right difference in lid height */ asym?: number;
}
export interface Expression {
  /** Built-in state to take the body motion from. Omit to keep the current one. */
  state?: DashyState;
  look?: Look;
}
export type Ease = 'spring' | 'smooth' | 'snappy';
export interface BlinkConfig { enabled?: boolean; minMs?: number; maxMs?: number; durationMs?: number }
export interface Step {
  /** Key of a custom expression, or the name of a built-in state. */
  expression: string;
  holdMs: number;
  transitionMs: number;
  ease?: Ease;
}
export type PlaybackMode = 'loop' | 'once' | 'pingPong';
export interface Sequence { mode: PlaybackMode; steps: Step[]; blink?: BlinkConfig }

export const LOOK_RANGE: Record<keyof Look, [number, number]> = {
  sd: [-10, 10], eh: [20, 100], cover: [0, 1], lidA: [-45, 45], low: [0, 1], tilt: [-20, 20], asym: [-.5, 1],
};

/** Spring constants (stiffness k, damping d, as in core.ts) that settle in about `transitionMs`. */
export function springFor(transitionMs: number, ease: Ease = 'spring'): { k: number; d: number } {
  const T = Math.max(60, transitionMs) / 1000;
  const w = (ease === 'snappy' ? 3.4 : 4.6) / T; // natural frequency: snappy settles earlier
  const zeta = ease === 'smooth' ? 1 : ease === 'snappy' ? .85 : .72; // 1 = no overshoot
  return { k: w * w, d: 2 * zeta * w };
}

/** Index of the step on screen `elapsed` ms after the start, or done when a once-sequence has finished (it holds its last step). */
export function stepAt(seq: Sequence, elapsed: number): { index: number; done: boolean } {
  const n = seq.steps.length;
  if (n === 0) return { index: 0, done: true };
  const len = seq.steps.map(s => Math.max(1, s.holdMs + s.transitionMs));
  const order = seq.mode === 'pingPong' && n > 2 ? [...seq.steps.keys(), ...[...seq.steps.keys()].slice(1, -1).reverse()] : [...seq.steps.keys()];
  const total = order.reduce((a, i) => a + len[i], 0);
  let t = Math.max(0, elapsed);
  if (seq.mode === 'once') { if (t >= total) return { index: n - 1, done: true }; }
  else t %= total;
  for (const i of order) { if (t < len[i]) return { index: i, done: false }; t -= len[i]; }
  return { index: order[order.length - 1], done: false };
}

export interface SequencePlayer {
  /** Start (or restart) at `now`. */
  start(now: number): void;
  /** Call every frame. `changed` is true on the first call of each new step (apply `step` then); `done` once a once-sequence ended. */
  tick(now: number): { changed: boolean; step: Step; done: boolean };
}
export function createSequencePlayer(seq: Sequence): SequencePlayer {
  let t0 = 0, last = -1;
  return {
    start(now) { t0 = now; last = -1; },
    tick(now) {
      const { index, done } = stepAt(seq, now - t0);
      const changed = index !== last || (last === -1);
      last = index;
      return { changed, step: seq.steps[index], done };
    },
  };
}
