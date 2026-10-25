/**
 * Records the TypeScript simulation for the Swift golden tests: `npm run swift:reference`.
 * Writes swift/DashyKit/Tests/DashyKitTests/Resources/reference.json. The simulations are recorded fresh for every
 * state and shape; `extras` and `driver` are recomputed where that is deterministic, the driver storm is kept as recorded.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createDashy, STATE_KEYS, type DashyState, type Geometry, type Shape } from '../src/core';
import { smallGeometry } from '../src/small';

const FILE = 'swift/DashyKit/Tests/DashyKitTests/Resources/reference.json';
const flat = (G: Geometry) => [G.rx, G.body.tx, G.body.ty, G.body.rot, G.body.sx, G.body.sy, G.face.tx, G.face.ty, G.face.rot, G.face.sx, G.face.sy,
  ...G.eyes.flatMap(e => [e.x, e.y, e.tilt, e.ew, e.eh, e.cov, e.lidA, e.low, e.blink])];

const simulations = [];
for (const shape of ['square', 'circle'] as Shape[]) for (const state of STATE_KEYS) {
  const d = createDashy({ seed: 7 }); d.setShape(shape); d.setState(state, 0);
  const frames = []; let i = 0;
  for (let ms = 0; ms < 30000; ms += 16.67) {
    const a = ms / 1000; d.pointer(Math.sin(a * 1.3) * 1.4, Math.cos(a * .9) * 1.4, ms);
    const G = d.step(ms);
    if (i % 30 === 0) frames.push({ t: ms, cur: G.cur, g: flat(G), small: flat(smallGeometry(G)) });
    i++;
  }
  simulations.push({ state, shape, seed: 7, frames });
}

const blinks = (state: DashyState) => { const d = createDashy({ seed: 3 }); d.setState(state, 0); let n = 0, inb = false; for (let t = 0; t < 60000; t += 16.67) { const b = d.step(t).eyes[0].blink > .5; if (b && !inb) n++; inb = b; } return n; };
const old = JSON.parse(readFileSync(FILE, 'utf8'));
const extras = { ...old.extras, blinks: Object.fromEntries(Object.keys(old.extras.blinks).map(k => [k, blinks(k as DashyState)])) };
writeFileSync(FILE, JSON.stringify({ note: old.note, simulations, extras, driver: old.driver }));
console.log(`${simulations.length} simulations`);
