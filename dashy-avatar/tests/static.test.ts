import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createDashy } from '../src/core';
import { ALL_STATES, renderSvg, settledGeometry, stillGeometry } from '../src/static';

const names = createDashy().states;

test('ALL_STATES covers every state core.ts knows, and only those', () => {
  assert.deepEqual([...ALL_STATES].sort(), Object.keys(names).sort());
});

test('settledGeometry is deterministic, finite, and never a half blink', () => {
  for (const s of ALL_STATES) {
    const a = settledGeometry(s), b = settledGeometry(s);
    assert.deepEqual(a, b, `${s} is reproducible`);
    assert.ok(!/NaN|null|Infinity/.test(JSON.stringify(a)));
    assert.equal(a.eyes[0].blink, 0, `${s} eyes open`);
    assert.equal(a.cur, s === 'received' ? 'received' : s, 'sampled in the requested state');
  }
});

test('received is photographed before core hands over to working; done before it falls back to idle', () => {
  assert.equal(settledGeometry('received').cur, 'received');
  assert.equal(settledGeometry('done').cur, 'done');
});

test('stillGeometry holds the body still but keeps the expression', () => {
  const G = settledGeometry('angry'), S = stillGeometry(G);
  assert.deepEqual(S.body, { tx: 150, ty: 260, rot: 0, sx: 1, sy: 1 });
  assert.equal(S.face.rot, 0);
  assert.deepEqual(S.eyes.map(e => e.lidA), G.eyes.map(e => e.lidA));
  assert.ok(stillGeometry(settledGeometry('idle')).eyes.every(e => e.cov === 0), 'idle: no flat-topped eyes in icons');
});

test('static SVG is self-contained: no scripts, no external references, titled, unique ids per prefix', () => {
  for (const s of ALL_STATES) {
    const svg = renderSvg(settledGeometry(s), { idPrefix: 'x', title: `Dashy & <${s}>` });
    assert.ok(!/<script|href=|<image|<foreignObject|on\w+=/.test(svg), s);
    assert.match(svg, /<title>Dashy &amp; &lt;/);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(i => i.startsWith('x')));
  }
});

// The committed exports must be exactly what the generator makes today: change core.ts, forget `npm run export`, and this fails.
test('committed SVG exports are up to date with core.ts', () => {
  for (const s of ALL_STATES) {
    const title = `Dashy: ${names[s].n}`, G = settledGeometry(s);
    assert.equal(readFileSync(`exports/svg/${s}.svg`, 'utf8'), renderSvg(G, { title }), `exports/svg/${s}.svg is stale; run npm run export`);
    assert.equal(readFileSync(`exports/svg/small/${s}.svg`, 'utf8'), renderSvg(G, { title, variant: 'small', margin: 10 }), `small/${s}.svg is stale`);
  }
});

const dims = (f: string) => { const b = readFileSync(f); assert.equal(b.subarray(1, 4).toString(), 'PNG', f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };
test('PNG exports exist for every state, with the size in their name', () => {
  for (const s of ALL_STATES) {
    for (const [dir, px] of [['png', 512], ['png', 128], ['app-icon', 1024], ['favicon', 32], ['favicon', 16]] as const) {
      const f = `exports/${dir}/${s}-${px}.png`; assert.ok(existsSync(f), f);
      const d = dims(f); assert.deepEqual([d.w, d.h], [px, px], f);
    }
  }
});
test('app icons have no transparency (iOS rejects it); favicons and plain PNGs keep it', () => {
  for (const s of ALL_STATES) {
    assert.equal(dims(`exports/app-icon/${s}-1024.png`).colorType, 2, 'RGB');
    assert.equal(dims(`exports/favicon/${s}-32.png`).colorType, 6, 'RGBA');
  }
  assert.deepEqual(dims('exports/app-icon/apple-touch-icon.png'), { w: 180, h: 180, colorType: 2 });
});
test('favicon.ico holds 16, 32 and 48 px images', () => {
  const b = readFileSync('exports/favicon/favicon.ico');
  assert.equal(b.readUInt16LE(2), 1); assert.equal(b.readUInt16LE(4), 3);
  assert.deepEqual([0, 1, 2].map(i => b[6 + 16 * i]), [16, 32, 48]);
  for (let i = 0; i < 3; i++) { const off = b.readUInt32LE(6 + 16 * i + 12); assert.equal(b.subarray(off + 1, off + 4).toString(), 'PNG'); }
  assert.equal(readdirSync('exports/favicon').filter(f => f === 'favicon.svg').length, 1);
});
