/**
 * Ambient life: the tiny movements a living thing never stops making.
 * Pure like core.ts: no DOM, no timers, no randomness. Everything is a function of time, so it replays exactly.
 * - eyes: micro-saccades (the eyes jump a hair, rest, jump again)
 * - body: slow drift (a hair of float and sway, never still)
 * Units are core units (the 300 x 300 coordinate system), amplitudes stay around one or two units on purpose.
 */
import type { DashyState } from './core';

export interface Ambient { eyeX: number; eyeY: number; bodyX: number; bodyY: number; bodyRot: number }
export interface AmbientWeights { eye: number; body: number }

/**
 * How much of each ambient layer a state gets (0..1). States that already have their own strong motion
 * (working scans, angry and blocked shake, dancing bounces) get none, so two movements never fight.
 */
export const AMBIENT_WEIGHTS: Record<DashyState, AmbientWeights> = {
  idle: { eye: 1, body: 1 }, thinking: { eye: .5, body: .8 }, waiting: { eye: 1, body: .8 }, happy: { eye: .8, body: .6 },
  done: { eye: .6, body: .6 }, sad: { eye: .4, body: 1 }, sleepy: { eye: 0, body: 1.2 }, strict: { eye: .25, body: 0 },
  received: { eye: 0, body: 0 }, working: { eye: 0, body: 0 }, blocked: { eye: 0, body: 0 }, angry: { eye: 0, body: 0 }, dancing: { eye: 0, body: 0 },
};

const smooth = (x: number) => x * x * (3 - 2 * x);
/** Deterministic value in -1..1 for an integer lattice point. */
function lattice(n: number, axis: number): number {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(axis + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** Smooth value noise in -1..1 with one new target every `period` ms. */
function drift(ms: number, period: number, axis: number): number {
  const p = ms / period, i = Math.floor(p);
  return lattice(i, axis) + (lattice(i + 1, axis) - lattice(i, axis)) * smooth(p - i);
}
/** Hold, then a quick (JUMP ms) glide to the next target. Targets change every INTERVAL ms. */
function saccade(ms: number, axis: number): number {
  const INTERVAL = 1150, JUMP = 150;
  const i = Math.floor(ms / INTERVAL), into = ms - i * INTERVAL;
  const from = lattice(i - 1, axis + 7), to = lattice(i, axis + 7);
  return from + (to - from) * smooth(Math.min(1, into / JUMP));
}

/** Offsets at time `ms`. `w` scales each layer (use AMBIENT_WEIGHTS[state], smoothed), `strength` scales everything (1 = default). */
export function ambientAt(ms: number, w: AmbientWeights, strength = 1): Ambient {
  const e = w.eye * strength, b = w.body * strength;
  return {
    eyeX: saccade(ms, 0) * 1.5 * e, eyeY: saccade(ms, 1) * .9 * e,
    bodyX: drift(ms, 3100, 0) * 1.3 * b, bodyY: drift(ms, 3900, 1) * 1.0 * b,
    bodyRot: drift(ms, 4700, 2) * .7 * b,
  };
}
