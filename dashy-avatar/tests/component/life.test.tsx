import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashy } from '../../src/react';
import { mountDashy } from '../../src/svg';

let queue: Map<number, FrameRequestCallback>, nextId: number;
const frame = (t: number) => { const cbs = [...queue.values()]; queue.clear(); cbs.forEach(cb => cb(t)); };
beforeEach(() => {
  queue = new Map(); nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(nextId, cb); return nextId++; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue.delete(id); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const definition = {
  schema: 'dashy/avatar-definition', schemaVersion: 1, colors: { body: '#ffeeaa', eyes: '#223344' },
  expressions: { smug: { state: 'idle', look: { cover: .5 } } },
  sequences: { hello: { mode: 'once', steps: [{ expression: 'smug', holdMs: 300, transitionMs: 100 }, { expression: 'happy', holdMs: 300, transitionMs: 100 }] } },
};
const host = () => { const el = document.createElement('div'); document.body.append(el); return el; };

describe('mountDashy with a definition', () => {
  it('applies colours from the definition and refuses unsafe ones', () => {
    const el = host(), h = mountDashy(el, { definition, reducedMotion: false });
    expect(el.querySelector('.outline')!.getAttribute('fill')).toBe('#ffeeaa');
    expect(el.querySelector('.eyeL rect')!.getAttribute('fill')).toBe('#223344');
    expect(() => h.setColors({ body: '"/><script>' })).toThrow(/Invalid colour/);
    expect(el.querySelector('script')).toBeNull();
    h.destroy();
  });
  it('takes the shape from the definition unless one is given', () => {
    const el = host(), h = mountDashy(el, { definition: { ...definition, shape: 'circle' }, reducedMotion: true });
    expect(h.dashy.step(performance.now() + 2000).rx).toBeGreaterThan(22);
    h.destroy();
  });
  it('throws on an invalid definition and names the first problem', () => {
    expect(() => mountDashy(host(), { definition: { ...definition, schemaVersion: 2 } })).toThrow(/\/schemaVersion/);
  });
  it('plays a once-sequence, reports its end and holds the last expression', () => {
    const el = host(), ended = vi.fn(), h = mountDashy(el, { definition, onSequenceEnd: ended, reducedMotion: false });
    expect(h.play('nope')).toBe(false);
    expect(h.play('hello')).toBe(true);
    const t0 = performance.now();
    act(() => { frame(t0 + 10); });
    expect(h.getState()).toBe('idle');
    act(() => { frame(t0 + 450); });
    expect(h.getState()).toBe('happy');
    act(() => { frame(t0 + 1000); frame(t0 + 1016); });
    expect(ended).toHaveBeenCalledWith('hello');
    expect(ended).toHaveBeenCalledTimes(1);
    h.destroy();
  });
  it('with reduced motion a sequence jumps to its end as one still', () => {
    const el = host(), h = mountDashy(el, { definition, reducedMotion: true });
    h.play('hello');
    expect(h.getState()).toBe('happy');
    h.destroy();
  });
  it('express() shows a custom expression or a built-in state and refuses unknown ones', () => {
    const h = mountDashy(host(), { definition, reducedMotion: true });
    expect(h.express('sad')).toBe(true); expect(h.getState()).toBe('sad');
    expect(h.express('smug')).toBe(true); expect(h.getState()).toBe('idle');
    expect(h.express('constructor')).toBe(false);
    h.destroy();
  });
});

describe('snapshot (photo mode)', () => {
  it('gives a self-contained SVG with the colours and a gradient background', async () => {
    const h = mountDashy(host(), { definition, reducedMotion: true });
    const svg = await h.snapshot({ background: { type: 'radial', from: '#fff', to: '#ccd' } }) as string;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('radialGradient')).not.toBeNull();
    expect(svg).toContain('fill="#ffeeaa"'); expect(svg).toContain('fill="#223344"');
    expect(svg).not.toMatch(/<script|href=/);
    h.destroy();
  });
  it('escapes hostile background text', async () => {
    const h = mountDashy(host(), { reducedMotion: true });
    const svg = await h.snapshot({ background: '"><script>alert(1)</script>' }) as string;
    expect(svg).not.toContain('<script');
    h.destroy();
  });
});

describe('<Dashy /> props', () => {
  it('plays the sequence prop and recolours without remounting', () => {
    const { container, rerender } = render(<Dashy definition={definition} sequence="hello" reducedMotion />);
    const svgBefore = container.querySelector('svg');
    expect(container.querySelector('svg title')!.textContent).toBe('Dashy is blij');
    rerender(<Dashy definition={definition} sequence="hello" reducedMotion colors={{ body: '#111111' }} />);
    expect(container.querySelector('svg')).toBe(svgBefore);
    expect(container.querySelector('.outline')!.getAttribute('fill')).toBe('#111111');
  });
});
