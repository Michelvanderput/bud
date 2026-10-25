import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashy, type DashyState, type Geometry, type Shape } from '../src/core';
import { smallGeometry } from '../src/small';

const STATES: DashyState[] = ['idle','received','working','thinking','waiting','blocked','done','happy','sad','angry','strict','dancing','sleepy'];
const rot = (p: number[], deg: number) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0]*c - p[1]*s, p[0]*s + p[1]*c]; };
const corners = (e: Geometry['eyes'][number]) => [[-e.ew/2,-e.eh/2],[e.ew/2,-e.eh/2],[e.ew/2,e.eh/2],[-e.ew/2,e.eh/2]].map(p => { const r = rot(p, e.tilt); return [r[0]+e.x, r[1]+e.y]; });
const toFace = (G: Geometry, p: number[]) => { const f = G.face; const q = rot([p[0]*f.sx, p[1]*f.sy], f.rot); return [q[0]+f.tx, q[1]+f.ty]; };
const PX24 = 24 / 300; // body units -> pixels at 24 px

for (const shape of ['square', 'circle'] as Shape[]) for (const state of STATES) {
  test(`small variant 30s: ${state} (${shape}) keeps eyes inside, apart, legible, and the body still`, () => {
    const d = createDashy({ seed: 7 }); d.setShape(shape); d.setState(state, 0);
    let maxEdge = -1e9, minGap = 1e9, prev: Geometry | null = null, maxJump = 0;
    for (let ms = 0; ms < 30000; ms += 16.67) {
      const a = ms / 1000; d.pointer(Math.sin(a*1.3)*1.4, Math.cos(a*.9)*1.4, ms);
      const full = d.step(ms), G = smallGeometry(full);
      assert.ok(!/NaN|null|Infinity/.test(JSON.stringify(G)));
      assert.deepEqual(G.body, { tx: 150, ty: 260, rot: 0, sx: 1, sy: 1 }, 'no spring physics on the body');
      assert.equal(G.face.rot, 0); assert.equal(G.face.sx, G.face.sy);
      assert.equal(G.cur, full.cur);
      for (const e of G.eyes) {
        assert.equal(e.tilt, 0);
        for (const c of corners(e)) { const p = toFace(G, c), dx = p[0]-150, dy = p[1]-150; maxEdge = Math.max(maxEdge, shape === 'circle' ? Math.hypot(dx, dy) - 110 : Math.max(Math.abs(dx), Math.abs(dy)) - 110); }
        // a lid that is shown must be at least 1 px thick at 24 px; the happy arcs too (not mid-blink, when the eye itself is nearly shut)
        if (e.blink > 0.05) continue;
        if (e.cov > 0) assert.ok(e.cov * e.eh * PX24 >= 1, `${state} lid ${(e.cov * e.eh * PX24).toFixed(2)}px`);
        if (e.low > 0.001) assert.ok(e.low * e.eh * PX24 >= 1, `${state} lower lid`);
      }
      const L = corners(G.eyes[0]), R = corners(G.eyes[1]);
      minGap = Math.min(minGap, Math.min(...R.map(p => p[0])) - Math.max(...L.map(p => p[0])));
      if (prev) maxJump = Math.max(maxJump, Math.abs(G.eyes[0].x - prev.eyes[0].x) + Math.abs(G.eyes[0].y - prev.eyes[0].y));
      prev = G;
    }
    assert.ok(maxEdge < -10, `eyes keep >=10 units from the edge (${maxEdge.toFixed(1)})`);
    assert.ok(minGap > 12, `eyes never touch (gap ${minGap.toFixed(1)})`);
    assert.ok(maxJump < 9, `no teleporting eyes (${maxJump.toFixed(1)})`);
  });
}

test('small variant keeps what makes the moods different', () => {
  const settle = (s: DashyState) => { const d = createDashy({ seed: 9 }); d.setState(s, 0); let G!: Geometry; for (let ms = 0; ms < 3000; ms += 16.67) G = smallGeometry(d.step(ms)); return G.eyes[0]; };
  assert.ok(settle('angry').lidA > 15 && settle('sad').lidA < -10, 'slant direction survives');
  assert.ok(settle('angry').cov > settle('idle').cov && settle('sleepy').cov > settle('strict').cov, 'lid order survives');
  assert.ok(settle('happy').low >= .4 && settle('idle').low === 0, 'happy arcs only when happy');
  assert.ok(settle('idle').cov === 0, 'a barely-there idle lid is dropped, not thickened');
});
