import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashy, type DashyState, type Geometry, type Shape } from '../src/core';
import { ambientAt, AMBIENT_WEIGHTS } from '../src/ambient';
import { eyePerspective } from '../src/perspective';
import { createSequencePlayer, springFor, stepAt, type Sequence } from '../src/timeline';
import { parseDefinition, validateDefinition } from '../src/definition';

const STATES = Object.keys(AMBIENT_WEIGHTS) as DashyState[];
const run = (d: ReturnType<typeof createDashy>, ms: number, from = 0, ptr = true) => {
  let G!: Geometry;
  for (let t = from; t < from + ms; t += 16.67) { if (ptr) d.pointer(Math.sin(t / 700) * 1.4, Math.cos(t / 900) * 1.4, t); G = d.step(t); }
  return G;
};

// ---- ambient
test('ambient is a pure function of time and stays small', () => {
  const w = { eye: 1, body: 1 };
  for (let ms = 0; ms < 60000; ms += 37) {
    const a = ambientAt(ms, w), b = ambientAt(ms, w);
    assert.deepEqual(a, b);
    assert.ok(Math.abs(a.eyeX) <= 1.5 && Math.abs(a.eyeY) <= .9 && Math.abs(a.bodyX) <= 1.3 && Math.abs(a.bodyY) <= 1 && Math.abs(a.bodyRot) <= .7);
  }
  assert.deepEqual(ambientAt(1234, { eye: 0, body: 0 }), { eyeX: 0, eyeY: 0, bodyX: 0, bodyY: 0, bodyRot: 0 });
});
test('ambient actually moves: idle is never perfectly still, and eyes rest between saccades', () => {
  const xs = new Set<string>(); let rest = 0;
  for (let ms = 0; ms < 20000; ms += 50) { const a = ambientAt(ms, { eye: 1, body: 1 }); xs.add(a.bodyX.toFixed(3)); if (Math.abs(ambientAt(ms + 50, { eye: 1, body: 1 }).eyeX - a.eyeX) < 1e-9) rest++; }
  assert.ok(xs.size > 200);
  assert.ok(rest > 200, 'eyes hold still most of the time');
});
test('ambient off (default) leaves the recorded simulation untouched; on changes the pose but not the state', () => {
  const a = createDashy({ seed: 4 }), b = createDashy({ seed: 4, ambient: true });
  const A = run(a, 3000), B = run(b, 3000);
  assert.notDeepEqual(A.body, B.body);
  assert.equal(A.cur, B.cur);
  assert.deepEqual(run(createDashy({ seed: 4 }), 3000), A);
});

// ---- perspective
test('perspective: straight ahead is symmetric, sideways narrows the far eye and never grows past the near limit', () => {
  const l0 = eyePerspective(0, 0, -34), r0 = eyePerspective(0, 0, 34);
  assert.ok(Math.abs(l0.fw - r0.fw) < 1e-9 && l0.fw > .95 && l0.fw <= 1.01);
  const right = { l: eyePerspective(1, 0, -34), r: eyePerspective(1, 0, 34) };
  assert.ok(right.r.fw < right.l.fw, 'looking right: the right eye is the far one... turned away');
  assert.ok(Math.min(right.l.fw, right.r.fw) > .6 && Math.max(right.l.fw, right.r.fw) < 1.1);
  const left = { l: eyePerspective(-1, 0, -34), r: eyePerspective(-1, 0, 34) };
  assert.ok(Math.abs(left.l.fw - right.r.fw) < 1e-9, 'mirror symmetric');
  assert.ok(eyePerspective(0, 1, 34).fh < .99 && eyePerspective(0, -1, 34).fh < .99);
  assert.deepEqual(eyePerspective(1, 1, 34, 0), { fw: 1, fh: 1 });
});

// ---- the existing safety guarantees must still hold with everything on
const corners = (e: Geometry['eyes'][number]) => [[-e.ew / 2, -e.eh / 2], [e.ew / 2, -e.eh / 2], [e.ew / 2, e.eh / 2], [-e.ew / 2, e.eh / 2]].map(p => { const a = e.tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s + e.x, p[0] * s + p[1] * c + e.y]; });
for (const shape of ['square', 'circle'] as Shape[]) for (const state of STATES) {
  test(`ambient + perspective: ${state} (${shape}) keeps the eyes inside the body and apart`, () => {
    const d = createDashy({ seed: 9, ambient: true, perspective: true }); d.setShape(shape); d.setState(state, 0);
    let maxEdge = -1e9, minGap = 1e9;
    for (let ms = 0; ms < 30000; ms += 16.67) {
      d.pointer(Math.sin(ms / 700) * 1.6, Math.cos(ms / 900) * 1.6, ms);
      const G = d.step(ms);
      assert.ok(!/NaN|null|Infinity/.test(JSON.stringify(G)));
      for (const e of G.eyes) for (const c of corners(e)) {
        const f = G.face, x = c[0] * f.sx, y = c[1] * f.sy, r = f.rot * Math.PI / 180;
        const dx = x * Math.cos(r) - y * Math.sin(r) + f.tx - 150, dy = x * Math.sin(r) + y * Math.cos(r) + f.ty - 150;
        maxEdge = Math.max(maxEdge, shape === 'circle' ? Math.hypot(dx, dy) - 110 : Math.max(Math.abs(dx), Math.abs(dy)) - 110);
      }
      const L = corners(G.eyes[0]), R = corners(G.eyes[1]);
      minGap = Math.min(minGap, (Math.min(...R.map(p => p[0])) - Math.max(...L.map(p => p[0]))) * G.face.sx);
    }
    assert.ok(maxEdge < -9, `eyes keep >=9px from the edge (got ${maxEdge.toFixed(1)})`);
    assert.ok(minGap > 16, `eyes never touch (gap ${minGap.toFixed(1)})`);
  });
}

// ---- look + blink
test('setLook overrides the eyes of the current state and null returns them', () => {
  const d = createDashy({ seed: 3 }); d.setState('idle', 0);
  const base = run(d, 1500, 0, false).eyes[0].cov;
  d.setLook({ cover: .8 }); const covered = run(d, 1500, 1500, false).eyes[0].cov;
  d.setLook(null); const back = run(d, 2000, 3000, false).eyes[0].cov;
  assert.ok(covered > .7 && base < .2 && back < .2, `${base} ${covered} ${back}`);
});
test('blink can be switched off, and its rhythm set', () => {
  const blinks = (cfg: Parameters<ReturnType<typeof createDashy>['setBlink']>[0]) => {
    const d = createDashy({ seed: 5, blink: cfg ?? undefined }); let n = 0, was = false;
    for (let t = 0; t < 30000; t += 16.67) { const b = d.step(t).eyes[0].blink > .5; if (b && !was) n++; was = b; }
    return n;
  };
  assert.equal(blinks({ enabled: false }), 0);
  assert.ok(blinks({ minMs: 600, maxMs: 900 }) > blinks(null) * 2);
});

// ---- timeline
const seq = (mode: Sequence['mode'], n = 3): Sequence => ({ mode, steps: Array.from({ length: n }, (_, i) => ({ expression: 's' + i, holdMs: 80, transitionMs: 20 })) });
test('stepAt: loop wraps, once holds the last step and is done, pingPong goes there and back', () => {
  assert.deepEqual([0, 99, 100, 250, 299, 300, 650].map(t => stepAt(seq('loop'), t).index), [0, 0, 1, 2, 2, 0, 0]);
  assert.deepEqual(stepAt(seq('once'), 299), { index: 2, done: false });
  assert.deepEqual(stepAt(seq('once'), 300), { index: 2, done: true });
  assert.deepEqual([0, 100, 200, 300, 400, 500].map(t => stepAt(seq('pingPong'), t).index), [0, 1, 2, 1, 0, 1]);
  assert.deepEqual(stepAt({ mode: 'loop', steps: [] }, 5), { index: 0, done: true });
});
test('player reports each new step once', () => {
  const p = createSequencePlayer(seq('once')); p.start(1000);
  const seen: string[] = []; let done = false;
  for (let t = 1000; t < 1500 && !done; t += 16) { const r = p.tick(t); if (r.changed) seen.push(r.step.expression); done = r.done; }
  assert.deepEqual(seen, ['s0', 's1', 's2']); assert.ok(done);
});
test('springFor: longer transition is softer, smooth never overshoots (critical damping)', () => {
  assert.ok(springFor(600).k < springFor(150).k);
  const s = springFor(300, 'smooth'); assert.ok(Math.abs(s.d * s.d - 4 * s.k) < 1e-6);
  assert.ok(springFor(300, 'spring').d ** 2 < 4 * springFor(300, 'spring').k);
});

// ---- definition
const good = () => ({ schema: 'dashy/avatar-definition', schemaVersion: 1, name: 'Test', shape: 'circle', colors: { body: '#ffd', eyes: '#123456' }, eyeScale: .9,
  expressions: { smug: { state: 'idle', look: { cover: .4, lidA: -6 } } },
  sequences: { hello: { mode: 'once', steps: [{ expression: 'smug', holdMs: 500, transitionMs: 200, ease: 'snappy' }, { expression: 'happy', holdMs: 800, transitionMs: 200 }], blink: { minMs: 800, maxMs: 1500 } } } });
test('definition: a good one passes and comes back frozen and copied', () => {
  const input = good(), r = validateDefinition(input);
  assert.ok(r.ok); if (r.ok) { assert.ok(Object.isFrozen(r.value) && Object.isFrozen(r.value.sequences.hello.steps[0])); assert.notEqual(r.value, input); }
  assert.ok(parseDefinition(JSON.stringify(good())).ok);
});
test('definition: bad ones are refused with a pointer to the first problem', () => {
  const bad = (mut: (d: any) => void, path: string) => { const d: any = good(); mut(d); const r = validateDefinition(d); assert.ok(!r.ok, path); if (!r.ok) assert.ok(r.errors.some(e => e.path === path), `${path} in ${JSON.stringify(r.errors)}`); };
  bad(d => { d.schema = 'x'; }, '/schema');
  bad(d => { d.colors.body = 'javascript:alert(1)'; }, '/colors/body');
  bad(d => { d.eyeScale = 5; }, '/eyeScale');
  bad(d => { d.expressions.smug.look.cover = 2; }, '/expressions/smug/look/cover');
  bad(d => { d.expressions.smug.look.nope = 1; }, '/expressions/smug/look/nope');
  bad(d => { d.expressions.idle = { look: { cover: 0 } }; }, '/expressions/idle');
  bad(d => { d.expressions['Bad Key'] = { look: { cover: 0 } }; }, '/expressions/Bad Key');
  bad(d => { d.sequences.hello.steps[0].expression = 'ghost'; }, '/sequences/hello/steps/0/expression');
  bad(d => { d.sequences.hello.steps[0].expression = 'constructor'; }, '/sequences/hello/steps/0/expression');
  bad(d => { d.sequences.hello.steps = []; }, '/sequences/hello/steps');
  bad(d => { d.sequences.hello.steps[1].holdMs = -1; }, '/sequences/hello/steps/1/holdMs');
  bad(d => { d.sequences.hello.blink.minMs = 5000; }, '/sequences/hello/blink');
  bad(d => { d.extra = 1; }, '/extra');
  assert.ok(!parseDefinition('{nope').ok);
  assert.ok(!parseDefinition(' '.repeat(300000) + '{}').ok);
  assert.ok(!validateDefinition(null).ok);
});
