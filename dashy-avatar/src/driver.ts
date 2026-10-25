/**
 * Dashy state driver: translates app events into one Dashy state.
 * Pure like core.ts: no DOM, no timers, no Date.now(). You pass the time in (ms) and ask
 * `nextWakeAt` when to look again, so the same rules can be ported to Swift and tested with fake time.
 */
import type { DashyState } from './core';

export type RuleName =
  | 'done' | 'received' | 'blocked' | 'deadlineSoon' | 'deadlineNear'
  | 'waiting' | 'break' | 'working' | 'quiet' | 'idle';

/**
 * Highest priority first. The first rule that applies wins, so two rules never fight.
 * - done/received are short celebrations (a few seconds): they always get seen, then the next rule takes over.
 * - blocked outranks deadlines: Dashy needs help before he can nag.
 * - a deadline (angry, then strict) outranks waiting and a break: the director stays strict.
 */
export const RULES: readonly { rule: RuleName; state: DashyState }[] = [
  { rule: 'done', state: 'done' },
  { rule: 'received', state: 'received' },
  { rule: 'blocked', state: 'blocked' },
  { rule: 'deadlineNear', state: 'angry' },
  { rule: 'deadlineSoon', state: 'strict' },
  { rule: 'waiting', state: 'waiting' },
  { rule: 'break', state: 'sleepy' },
  { rule: 'working', state: 'working' },
  { rule: 'quiet', state: 'sad' },
  { rule: 'idle', state: 'idle' },
];

export interface DriverConfig {
  /** Deadline within this many ms: strict. Default 1 hour. */
  strictWithinMs: number;
  /** Deadline within this many ms: angry. Default 15 minutes. */
  angryWithinMs: number;
  /** A deadline stays angry this long after it passed, then it is ignored. Default 15 minutes. */
  overdueGraceMs: number;
  /** Nothing done for this long: sad. Default 1 hour. */
  quietAfterMs: number;
  /** How long `done` shows. Matches core.ts (done falls back to idle after 3600 ms). */
  doneMs: number;
  /** How long `received` shows. Matches core.ts (received continues to working after 650 ms). */
  receivedMs: number;
}
export const DEFAULT_CONFIG: DriverConfig = {
  strictWithinMs: 60 * 60_000, angryWithinMs: 15 * 60_000, overdueGraceMs: 15 * 60_000,
  quietAfterMs: 60 * 60_000, doneMs: 3600, receivedMs: 650,
};

export type DriverEvent =
  | { type: 'taskAdded'; id: string; dueAt?: number | null }
  | { type: 'taskDone'; id: string }
  | { type: 'taskRemoved'; id: string }
  | { type: 'taskDueChanged'; id: string; dueAt: number | null }
  /** The app waits for an answer from the user. */
  | { type: 'waiting'; value: boolean }
  /** The app cannot continue. */
  | { type: 'blocked'; value: boolean }
  | { type: 'break'; value: boolean }
  | { type: 'working'; value: boolean }
  /** Any sign of life (typing, clicking, finishing something) that resets the "nothing done" timer. */
  | { type: 'activity' };

export interface DriverState {
  /** Open tasks: id -> due time (ms) or null. */
  readonly tasks: Readonly<Record<string, number | null>>;
  readonly receivedAt: number | null;
  readonly doneAt: number | null;
  readonly waiting: boolean;
  readonly blocked: boolean;
  readonly onBreak: boolean;
  readonly working: boolean;
  readonly lastActivityAt: number;
}
export interface Resolution { state: DashyState; rule: RuleName }

export function initialDriverState(now: number): DriverState {
  return { tasks: {}, receivedAt: null, doneAt: null, waiting: false, blocked: false, onBreak: false, working: false, lastActivityAt: now };
}

/** Returns a new state; never mutates the old one. */
export function reduce(s: DriverState, e: DriverEvent, now: number): DriverState {
  switch (e.type) {
    case 'taskAdded': return { ...s, tasks: { ...s.tasks, [e.id]: e.dueAt ?? null }, receivedAt: now, lastActivityAt: now };
    case 'taskDone': { const { [e.id]: _gone, ...rest } = s.tasks; return { ...s, tasks: rest, doneAt: now, lastActivityAt: now }; }
    case 'taskRemoved': { const { [e.id]: _gone, ...rest } = s.tasks; return { ...s, tasks: rest }; }
    case 'taskDueChanged': return e.id in s.tasks ? { ...s, tasks: { ...s.tasks, [e.id]: e.dueAt }, lastActivityAt: now } : s;
    case 'waiting': return { ...s, waiting: e.value };
    case 'blocked': return { ...s, blocked: e.value };
    // Coming back from a break counts as activity, so Dashy is not sad the moment you return.
    case 'break': return { ...s, onBreak: e.value, lastActivityAt: e.value ? s.lastActivityAt : now };
    case 'working': return { ...s, working: e.value, lastActivityAt: e.value ? now : s.lastActivityAt };
    case 'activity': return { ...s, lastActivityAt: now };
  }
}

/** Earliest due time among open tasks that still count (not overdue beyond the grace period). */
function nearestDue(s: DriverState, now: number, c: DriverConfig): number | null {
  let best: number | null = null;
  for (const id in s.tasks) {
    const due = s.tasks[id];
    if (due == null || now - due > c.overdueGraceMs) continue;
    if (best === null || due < best) best = due;
  }
  return best;
}

export function resolve(s: DriverState, now: number, config: Partial<DriverConfig> = {}): Resolution {
  const c = { ...DEFAULT_CONFIG, ...config };
  const due = nearestDue(s, now, c);
  const left = due === null ? Infinity : due - now;
  const applies: Record<RuleName, boolean> = {
    done: s.doneAt !== null && now - s.doneAt < c.doneMs,
    received: s.receivedAt !== null && now - s.receivedAt < c.receivedMs,
    blocked: s.blocked,
    deadlineNear: left <= c.angryWithinMs,
    deadlineSoon: left <= c.strictWithinMs,
    waiting: s.waiting,
    break: s.onBreak,
    working: s.working,
    quiet: now - s.lastActivityAt >= c.quietAfterMs,
    idle: true,
  };
  const hit = RULES.find(r => applies[r.rule])!;
  return { state: hit.state, rule: hit.rule };
}

/**
 * The next moment (ms) at which the result may change by itself, or null when it only changes on an event.
 * Schedule one timeout for this instead of polling.
 */
export function nextWakeAt(s: DriverState, now: number, config: Partial<DriverConfig> = {}): number | null {
  const c = { ...DEFAULT_CONFIG, ...config };
  const t: number[] = [];
  if (s.doneAt !== null) t.push(s.doneAt + c.doneMs);
  if (s.receivedAt !== null) t.push(s.receivedAt + c.receivedMs);
  for (const id in s.tasks) {
    const due = s.tasks[id];
    if (due == null) continue;
    t.push(due - c.strictWithinMs, due - c.angryWithinMs, due + c.overdueGraceMs + 1);
  }
  if (!s.onBreak) t.push(s.lastActivityAt + c.quietAfterMs);
  const later = t.filter(x => x > now);
  return later.length ? Math.min(...later) : null;
}
