import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashy, type DashyState, type Geometry, type Shape } from '../src/core';

const STATES: DashyState[] = ['idle','received','working','thinking','waiting','blocked','done','happy','sad','angry','strict','dancing','sleepy'];
const rot = (p: number[], deg: number) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0]*c - p[1]*s, p[0]*s + p[1]*c]; };
function eyeCorners(e: Geometry['eyes'][number]) {
  return [[-e.ew/2,-e.eh/2],[e.ew/2,-e.eh/2],[e.ew/2,e.eh/2],[-e.ew/2,e.eh/2]].map(p => { const r = rot(p, e.tilt); return [r[0]+e.x, r[1]+e.y]; });
}
function toFace(G: Geometry, p: number[]) { const f = G.face; const q = rot([p[0]*f.sx, p[1]*f.sy], f.rot); return [q[0]+f.tx, q[1]+f.ty]; }

for (const shape of ['square','circle'] as Shape[]) for (const state of STATES) {
  test(`simulation 30s: ${state} (${shape}) stays finite, smooth, inside the body`, () => {
    const d = createDashy({ seed: 7 }); d.setShape(shape); d.setState(state, 0);
    let prev: Geometry | null = null, maxEdge = -1e9, maxJump = 0, minGap = 1e9;
    for (let ms = 0; ms < 30000; ms += 16.67) {
      const a = ms / 1000; d.pointer(Math.sin(a*1.3)*1.4, Math.cos(a*.9)*1.4, ms);
      const G = d.step(ms);
      assert.ok(!/NaN|null|Infinity/.test(JSON.stringify(G)), 'no NaN/Infinity');
      for (const e of G.eyes) for (const c of eyeCorners(e)) {
        const p = toFace(G, c), dx = p[0]-150, dy = p[1]-150;
        maxEdge = Math.max(maxEdge, shape === 'circle' ? Math.hypot(dx, dy) - 110 : Math.max(Math.abs(dx), Math.abs(dy)) - 110);
      }
      const L = eyeCorners(G.eyes[0]), R = eyeCorners(G.eyes[1]);
      minGap = Math.min(minGap, (Math.min(...R.map(p => p[0])) - Math.max(...L.map(p => p[0]))) * G.face.sx);
      if (prev) maxJump = Math.max(maxJump, Math.abs(G.eyes[0].x - prev.eyes[0].x) + Math.abs(G.eyes[0].y - prev.eyes[0].y));
      prev = G;
    }
    assert.ok(maxEdge < -10, `eyes keep >=10px from the body edge (got ${maxEdge.toFixed(1)})`);
    assert.ok(minGap > 18, `eyes never touch (gap ${minGap.toFixed(1)})`);
    assert.ok(maxJump < 9, `no teleporting eyes (${maxJump.toFixed(1)}px/frame)`);
  });
}

test('four pokes within 3s make Dashy angry, then he returns to his previous state', () => {
  const d = createDashy({ seed: 1 }); d.setState('happy', 0);
  let ms = 0; for (; ms < 500; ms += 16.67) d.step(ms);
  for (const t of [500, 800, 1100, 1400]) { while (ms < t) { d.step(ms); ms += 16.67; } d.poke(t); }
  while (ms < 2000) { d.step(ms); ms += 16.67; }
  assert.equal(d.getState(), 'angry');
  while (ms < 6500) { d.step(ms); ms += 16.67; }
  assert.equal(d.getState(), 'happy');
});

test('received -> working automatically, done -> idle automatically', () => {
  const d = createDashy({ seed: 2 }); d.setState('idle', 0);
  let ms = 0; for (; ms < 300; ms += 16.67) d.step(ms);
  d.setState('received', ms); let t0 = ms; for (; ms < t0 + 900; ms += 16.67) d.step(ms);
  assert.equal(d.getState(), 'working');
  d.setState('done', ms); t0 = ms; for (; ms < t0 + 3800; ms += 16.67) d.step(ms);
  assert.equal(d.getState(), 'idle');
});

test('blinking: idle blinks 10-30 times per minute; angry and sleepy never blink', () => {
  const count = (state: DashyState) => { const d = createDashy({ seed: 3 }); d.setState(state, 0); let n = 0, inb = false; for (let ms = 0; ms < 60000; ms += 16.67) { const b = d.step(ms).eyes[0].blink > .5; if (b && !inb) n++; inb = b; } return n; };
  const idle = count('idle'); assert.ok(idle >= 10 && idle <= 30, `idle blinks ${idle}`);
  assert.equal(count('angry'), 0); assert.equal(count('sleepy'), 0);
});

test('shape morph settles to exact radii', () => {
  const d = createDashy({ seed: 5 }); let ms = 0, G!: Geometry;
  d.setShape('circle'); for (; ms < 2000; ms += 16.67) G = d.step(ms); assert.ok(Math.abs(G.rx - 110) < .5);
  d.setShape('square'); for (; ms < 4000; ms += 16.67) G = d.step(ms); assert.ok(Math.abs(G.rx - 22) < .5);
});

test('a long pause (background tab) does not blow up the simulation', () => {
  const d = createDashy({ seed: 7 }); d.setState('dancing', 0); let ms = 0; for (; ms < 1000; ms += 16.67) d.step(ms);
  const G = d.step(ms + 30000); assert.ok(Number.isFinite(G.body.ty) && Math.abs(G.body.ty - 260) < 60);
});

test('lid slant direction: angry is inner-lower (positive on left eye), sad is inner-higher', () => {
  const settle = (s: DashyState) => { const d = createDashy({ seed: 9 }); d.setState(s, 0); let G!: Geometry; for (let ms = 0; ms < 3000; ms += 16.67) G = d.step(ms); return G; };
  assert.ok(settle('angry').eyes[0].lidA > 10, 'angry left lid > 10deg');
  assert.ok(settle('sad').eyes[0].lidA < -8, 'sad left lid < -8deg');
  const a = settle('angry'); assert.ok(a.eyes[0].lidA * a.eyes[1].lidA < 0, 'eyes mirror each other');
});

test('golden ratio default: idle eye is 34 x 55', () => {
  const d = createDashy({ seed: 4 }); let G!: Geometry; for (let ms = 0; ms < 3000; ms += 16.67) { d.pointer(0, 0, ms); G = d.step(ms); }
  const open = G.eyes[0]; assert.ok(Math.abs(open.eh / open.ew - 1.618) < .12, `ratio ${(open.eh / open.ew).toFixed(2)}`);
});

test('unknown state throws a clear error', () => {
  assert.throws(() => createDashy().setState('banana' as DashyState, 0), /Unknown state/);
});
