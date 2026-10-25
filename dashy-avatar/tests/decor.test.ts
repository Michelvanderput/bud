import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashy, STATE_KEYS } from '../src/core';
import { createDecor, effectAt, EFFECTS, particlesSvg, faceDecorSvg, STATE_DECOR } from '../src/decor';
import { recordFrames, renderAnimatedSvg, renderSvg, settledFrame } from '../src/static';
import { validateDefinition } from '../src/definition';

const C = { mouth: '#111', blush: '#f8a', accent: '#f57', glyph: '#111' };

test('every state has decor, and every effect is drawable, finite and deterministic', () => {
  assert.deepEqual(Object.keys(STATE_DECOR).sort(), [...STATE_KEYS].sort());
  for (const fx of EFFECTS) for (let t = 0; t < 8000; t += 97) {
    const a = effectAt(fx, t), b = effectAt(fx, t);
    assert.deepEqual(a, b, fx);
    assert.ok(!/NaN|Infinity/.test(JSON.stringify(a)), fx);
    assert.ok(a.length < 80, `${fx} keeps the particle count small (${a.length})`);
    if (fx === 'none') assert.equal(a.length, 0);
  }
  for (const fx of EFFECTS.filter(f => f !== 'none')) {
    let seen = 0; for (let t = 0; t < 4000; t += 50) seen += effectAt(fx, t).filter(p => p.opacity > .05 && p.scale > .05).length;
    assert.ok(seen > 0, `${fx} shows something within 4 s`);
  }
});

test('decor follows the state, eases between states and honours the style switches', () => {
  const d = createDashy({ seed: 2 }), dec = createDecor({ mouth: true });
  d.setState('happy', 0);
  let D = dec.step(d.step(0), 0);
  for (let t = 0; t < 2000; t += 16.67) D = dec.step(d.step(t), t);
  assert.ok(D.mouth && D.mouth.curve > .7, 'happy smiles');
  d.setState('sad', 2000);
  D = dec.step(d.step(2016), 2016);
  assert.ok(D.mouth!.curve > 0, 'no jump: one frame later still smiling a bit');
  for (let t = 2016; t < 4000; t += 16.67) D = dec.step(d.step(t), t);
  assert.ok(D.mouth!.curve < -.6, 'then frowns');
  dec.setStyle({ mouth: false, blush: 'off', effects: false });
  D = dec.step(d.step(4016), 4016);
  assert.equal(D.mouth, null); assert.equal(D.blush.length, 0);
  for (let t = 4016; t < 5000; t += 16.67) D = dec.step(d.step(t), t);
  assert.equal(D.particles.length, 0, 'effects off');
});

test('talking moves the mouth', () => {
  const d = createDashy({ seed: 2 }), dec = createDecor({ mouth: true }); dec.setTalking(true);
  const opens = new Set<string>();
  for (let t = 0; t < 2000; t += 16.67) opens.add(dec.step(d.step(t), t).mouth!.open.toFixed(2));
  assert.ok(opens.size > 20);
});

test('decor SVG is plain markup: no scripts, no references', () => {
  for (const s of STATE_KEYS) {
    const F = settledFrame(s, { style: { mouth: true, shadow: true, shine: 1 } });
    const svg = renderSvg(F.G, { style: { shine: 1 }, decor: F.D }) + particlesSvg(F.D, C) + faceDecorSvg(F.D, C);
    assert.ok(!/<script|href=|on\w+=|NaN/.test(svg), s);
  }
});

test('animated SVG: one group per frame, SMIL only, unique ids', () => {
  const frames = recordFrames('dancing', { durationMs: 500, fps: 10, style: { mouth: true } });
  assert.equal(frames.length, 5);
  const svg = renderAnimatedSvg(frames, 10, { style: { mouth: true } });
  assert.equal((svg.match(/<animate /g) ?? []).length, 5);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!/<script|on\w+=/.test(svg));
});

test('style options change the drawing and keep the eyes apart', () => {
  const d = createDashy({ seed: 1, eyeWidth: 60, eyeSpacing: 24 });
  const G = d.step(0); d.step(500);
  assert.ok(G.eyes[1].x - G.eyes[0].x - G.eyes[0].ew > 18, 'eye width is capped so they never touch');
  const round = renderSvg(settledFrame('idle').G, { style: { eyeRoundness: 0 } });
  assert.match(round, /rx="0.00"/);
  const c = createDashy(); c.setCornerRadius(0); let g = c.step(0); for (let t = 0; t < 3000; t += 16) g = c.step(t);
  assert.ok(g.rx < 1);
});

test('definition v2: style, motion, decor and new colours validate; v1 stays strict', () => {
  const v2 = { schema: 'dashy/avatar-definition', schemaVersion: 2, colors: { body: '#fff', accent: '#ff0066' },
    style: { roundness: .5, mouth: true, blush: 'always', shine: .4, eyeWidth: 30 }, motion: { speed: 1.5, bounce: 1.2, followPointer: false, blink: { minMs: 900, maxMs: 2000 } },
    expressions: { smitten: { state: 'love', decor: { fx: 'hearts', blush: 1 } } }, sequences: {} };
  assert.ok(validateDefinition(v2).ok);
  const bad = validateDefinition({ ...v2, style: { roundness: 3, blush: 'yes' }, motion: { speed: 9 }, expressions: { x: { decor: { fx: 'fireworks' } } } });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(bad.errors.map(e => e.path).sort(), ['/expressions/x/decor/fx', '/motion/speed', '/style/blush', '/style/roundness']);
  const v1 = validateDefinition({ ...v2, schemaVersion: 1 });
  assert.ok(!v1.ok, 'style and motion are version 2');
});
