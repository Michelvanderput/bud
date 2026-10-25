import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashy, type DashyState } from '../src/core';
import { RULES, initialDriverState, nextWakeAt, reduce, resolve, type DriverEvent, type DriverState, type RuleName } from '../src/driver';

const MIN = 60_000, T0 = 1_000_000;
const run = (events: [number, DriverEvent][], start = T0): DriverState =>
  events.reduce((s, [t, e]) => reduce(s, e, t), initialDriverState(start));
const at = (s: DriverState, t: number) => resolve(s, t);

test('a fresh driver is idle', () => {
  assert.deepEqual(at(initialDriverState(T0), T0), { state: 'idle', rule: 'idle' });
});

test('new task is received for 650 ms, then falls through', () => {
  const s = run([[T0, { type: 'taskAdded', id: 'a' }]]);
  assert.equal(at(s, T0).state, 'received');
  assert.equal(at(s, T0 + 649).state, 'received');
  assert.equal(at(s, T0 + 650).state, 'idle');
});

test('task checked off is done for 3.6 s, then falls through', () => {
  const s = run([[T0, { type: 'taskAdded', id: 'a' }], [T0 + 5000, { type: 'taskDone', id: 'a' }]]);
  assert.equal(at(s, T0 + 5000).state, 'done');
  assert.equal(at(s, T0 + 5000 + 3599).state, 'done');
  assert.equal(at(s, T0 + 5000 + 3600).state, 'idle');
});

test('waiting and blocked follow their flag', () => {
  let s = run([[T0, { type: 'waiting', value: true }]]);
  assert.equal(at(s, T0).state, 'waiting');
  s = reduce(s, { type: 'waiting', value: false }, T0 + 1);
  assert.equal(at(s, T0 + 1).state, 'idle');
  s = reduce(s, { type: 'blocked', value: true }, T0 + 2);
  assert.equal(at(s, T0 + 2).state, 'blocked');
});

test('deadline thresholds: strict within 1 hour, angry within 15 minutes (inclusive)', () => {
  const due = T0 + 90 * MIN;
  const s = run([[T0, { type: 'taskAdded', id: 'a', dueAt: due }]]);
  const after = T0 + 2000; // past the received window
  assert.equal(at(s, after).state, 'idle');
  assert.equal(at(s, due - 61 * MIN).state, 'idle');
  assert.equal(at(s, due - 60 * MIN).state, 'strict');
  assert.equal(at(s, due - 16 * MIN).state, 'strict');
  assert.equal(at(s, due - 15 * MIN).state, 'angry');
  assert.equal(at(s, due).state, 'angry');
});

test('overdue stays angry for 15 minutes, then the task is ignored (no endless nagging)', () => {
  const due = T0 + 20 * MIN;
  const s = run([[T0, { type: 'taskAdded', id: 'a', dueAt: due }]]);
  assert.equal(at(s, due + 15 * MIN).state, 'angry');
  assert.equal(at(s, due + 15 * MIN + 1).state, 'idle');
});

test('the nearest deadline counts; finishing it moves on to the next one', () => {
  const s0 = run([
    [T0, { type: 'taskAdded', id: 'soon', dueAt: T0 + 10 * MIN }],
    [T0, { type: 'taskAdded', id: 'later', dueAt: T0 + 50 * MIN }],
  ]);
  assert.equal(at(s0, T0 + 5000).state, 'angry');
  const s1 = reduce(s0, { type: 'taskDone', id: 'soon' }, T0 + 5000);
  assert.equal(at(s1, T0 + 5000 + 4000).state, 'strict');
  const s2 = reduce(s1, { type: 'taskRemoved', id: 'later' }, T0 + 20000);
  assert.equal(at(s2, T0 + 20000).state, 'idle');
});

test('changing a due date re-evaluates; unknown ids are ignored', () => {
  let s = run([[T0, { type: 'taskAdded', id: 'a', dueAt: T0 + 10 * MIN }]]);
  s = reduce(s, { type: 'taskDueChanged', id: 'a', dueAt: T0 + 5 * 60 * MIN }, T0 + 3000);
  assert.equal(at(s, T0 + 3000).state, 'idle');
  assert.equal(reduce(s, { type: 'taskDueChanged', id: 'nope', dueAt: 1 }, T0 + 4000), s);
});

test('an hour of nothing is sad; activity resets the timer', () => {
  const s = initialDriverState(T0);
  assert.equal(at(s, T0 + 60 * MIN - 1).state, 'idle');
  assert.equal(at(s, T0 + 60 * MIN).state, 'sad');
  const s2 = reduce(s, { type: 'activity' }, T0 + 59 * MIN);
  assert.equal(at(s2, T0 + 60 * MIN).state, 'idle');
  assert.equal(at(s2, T0 + 119 * MIN).state, 'sad');
});

test('a break is sleepy, is never sad, and returning from it resets the quiet timer', () => {
  let s = run([[T0, { type: 'break', value: true }]]);
  assert.equal(at(s, T0 + 5 * 60 * MIN).state, 'sleepy');
  s = reduce(s, { type: 'break', value: false }, T0 + 5 * 60 * MIN);
  assert.equal(at(s, T0 + 5 * 60 * MIN).state, 'idle');
  assert.equal(at(s, T0 + 6 * 60 * MIN).state, 'sad');
});

// Priority: every rule must beat every rule below it, whatever else is true.
const SCENE: Record<RuleName, [number, DriverEvent][]> = {
  done: [[T0 + 10, { type: 'taskDone', id: 'x' }]],
  received: [[T0 + 10, { type: 'taskAdded', id: 'y' }]],
  blocked: [[T0 + 10, { type: 'blocked', value: true }]],
  deadlineNear: [[T0 - 5000, { type: 'taskAdded', id: 'near', dueAt: T0 + 10 * MIN }]],
  deadlineSoon: [[T0 - 5000, { type: 'taskAdded', id: 'soon', dueAt: T0 + 40 * MIN }]],
  waiting: [[T0 + 10, { type: 'waiting', value: true }]],
  break: [[T0 + 10, { type: 'break', value: true }]],
  working: [[T0 + 10, { type: 'working', value: true }]],
  quiet: [],
  idle: [],
};
test('priority: every rule beats all rules below it', () => {
  const NOW = T0 + 100; // inside the done and received windows; deadline tasks were added earlier so they do not trigger `received`
  // `quiet` needs old activity; build it by evaluating much later with long-lived flags instead.
  for (let i = 0; i < RULES.length - 2; i++) {
    for (let j = i + 1; j < RULES.length - 2; j++) {
      const hi = RULES[i], lo = RULES[j];
      const s = run([...SCENE[hi.rule], ...SCENE[lo.rule]].sort((a, b) => a[0] - b[0]));
      assert.equal(at(s, NOW).rule, hi.rule, `${hi.rule} should beat ${lo.rule}`);
    }
  }
});
test('priority: quiet loses to everything above it and beats idle', () => {
  const late = T0 + 10 * 60 * MIN;
  for (const hi of RULES.slice(0, 8).filter(r => r.rule !== 'done' && r.rule !== 'received')) {
    let s = initialDriverState(T0);
    s = SCENE[hi.rule].reduce((acc, [, e]) => reduce(acc, e, T0), s);
    if (hi.rule === 'deadlineNear') s = reduce(s, { type: 'taskDueChanged', id: 'near', dueAt: late + 5 * MIN }, T0);
    if (hi.rule === 'deadlineSoon') s = reduce(s, { type: 'taskDueChanged', id: 'soon', dueAt: late + 40 * MIN }, T0);
    s = { ...s, lastActivityAt: T0 };
    assert.equal(at(s, late).rule, hi.rule, `${hi.rule} should beat quiet`);
  }
  assert.equal(at(initialDriverState(T0), late).rule, 'quiet');
});
test('priority: done beats a deadline so a finished task is always celebrated', () => {
  const s = run([[T0, { type: 'taskAdded', id: 'a', dueAt: T0 + 5 * MIN }], [T0 + 3000, { type: 'taskAdded', id: 'b', dueAt: T0 + 5 * MIN }], [T0 + 4000, { type: 'taskDone', id: 'a' }]]);
  assert.equal(at(s, T0 + 4000).state, 'done');
  assert.equal(at(s, T0 + 4000 + 3600).state, 'angry');
});

test('reduce never mutates its input', () => {
  const s = Object.freeze(run([[T0, { type: 'taskAdded', id: 'a', dueAt: T0 + MIN }]]));
  const before = JSON.stringify(s);
  for (const e of [{ type: 'taskDone', id: 'a' }, { type: 'taskAdded', id: 'b' }, { type: 'waiting', value: true }, { type: 'activity' }] as DriverEvent[]) reduce(s, e, T0 + 1);
  assert.equal(JSON.stringify(s), before);
});

test('nextWakeAt: stepping to it always changes the answer; between events nothing changes earlier', () => {
  const s = run([[T0, { type: 'taskAdded', id: 'a', dueAt: T0 + 2 * 60 * MIN }]]);
  let now = T0 + 1, last = at(s, now).rule;
  for (let guard = 0; guard < 20; guard++) {
    const wake = nextWakeAt(s, now);
    if (wake === null) break;
    assert.ok(wake > now);
    assert.equal(at(s, wake - 1).rule, last, 'nothing changes before the wake time');
    const next = at(s, wake).rule;
    assert.notEqual(next, last, `wake at ${wake - T0} ms should change the state`);
    last = next; now = wake;
  }
  assert.equal(last, 'quiet'); // received -> idle -> strict -> angry -> quiet (deadline ignored after the grace period)
});

test('nextWakeAt is null when nothing can change by itself', () => {
  const s = run([[T0, { type: 'break', value: true }]]);
  assert.equal(nextWakeAt(s, T0 + 5), null);
});

test('random event storm: always a valid Dashy state that core.ts accepts, never throws', () => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const ids = ['a', 'b', 'c'];
  const make = (): DriverEvent => {
    const id = ids[Math.floor(rnd() * 3)], r = rnd();
    if (r < .2) return { type: 'taskAdded', id, dueAt: rnd() < .7 ? T0 + Math.floor(rnd() * 180) * MIN : null };
    if (r < .35) return { type: 'taskDone', id };
    if (r < .4) return { type: 'taskRemoved', id };
    if (r < .5) return { type: 'taskDueChanged', id, dueAt: T0 + Math.floor(rnd() * 180) * MIN };
    const flag = ['waiting', 'blocked', 'break', 'working'][Math.floor(rnd() * 4)] as 'waiting';
    return r < .9 ? { type: flag, value: rnd() < .5 } : { type: 'activity' };
  };
  const core = createDashy();
  let s = initialDriverState(T0), now = T0;
  for (let i = 0; i < 5000; i++) {
    now += Math.floor(rnd() * 5 * MIN);
    s = reduce(s, make(), now);
    const r = resolve(s, now);
    assert.ok(RULES.some(x => x.rule === r.rule && x.state === r.state));
    core.setState(r.state as DashyState, now);
  }
});
