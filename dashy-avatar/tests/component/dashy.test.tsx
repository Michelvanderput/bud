import { StrictMode } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashy } from '../../src/react';
import { useStateDriver } from '../../src/react';

// A manual animation-frame queue so tests control exactly which frames run.
let queue: Map<number, FrameRequestCallback>, nextId: number, requested: number;
const frame = (t: number) => { const cbs = [...queue.values()]; queue.clear(); cbs.forEach(cb => cb(t)); };
beforeEach(() => {
  queue = new Map(); nextId = 1; requested = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { requested++; queue.set(nextId, cb); return nextId++; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue.delete(id); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });

const img = (c: HTMLElement) => c.querySelector('svg[role="img"]')!;
const label = (c: HTMLElement) => img(c).querySelector('title')!.textContent;

describe('<Dashy />', () => {
  it('is an image with a Dutch text label for the current state', () => {
    const { container } = render(<Dashy state="working" />);
    expect(label(container)).toBe('Dashy is aan het werk');
  });

  it('updates the label when the state prop changes, without remounting', () => {
    const { container, rerender } = render(<Dashy state="idle" />);
    const svg = img(container);
    rerender(<Dashy state="blocked" />);
    expect(label(container)).toBe('Dashy zit vast en heeft hulp nodig');
    expect(img(container)).toBe(svg);
  });

  it('follows core when it moves on by itself: received -> working', () => {
    const { container } = render(<Dashy state="received" />);
    expect(label(container)).toBe('Dashy heeft een taak gekregen');
    act(() => { frame(performance.now() + 100); frame(performance.now() + 1200); });
    expect(label(container)).toBe('Dashy is aan het werk');
  });

  it('accepts custom labels, and an inline labels object does not remount', () => {
    const { container, rerender } = render(<Dashy state="happy" labels={{ happy: 'Yay' }} />);
    const svg = img(container);
    expect(label(container)).toBe('Yay');
    rerender(<Dashy state="happy" labels={{ happy: 'Yay' }} />);
    expect(img(container)).toBe(svg);
  });

  it('applies size (px for numbers, CSS lengths as given)', () => {
    const { container, rerender } = render(<Dashy size={32} />);
    const box = container.firstElementChild as HTMLElement;
    expect([box.style.width, box.style.height]).toEqual(['32px', '32px']);
    rerender(<Dashy size="4rem" />);
    expect(box.style.width).toBe('4rem');
  });

  it('switches shape without remounting', () => {
    const { container, rerender } = render(<Dashy shape="square" />);
    const svg = img(container);
    rerender(<Dashy shape="circle" />);
    expect(img(container)).toBe(svg);
  });

  it('mounts once under StrictMode and cleans up on unmount', () => {
    const { container, unmount } = render(<StrictMode><Dashy /></StrictMode>);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    unmount();
    expect(document.querySelectorAll('svg')).toHaveLength(0);
    expect(queue.size).toBe(0);
  });

  it('reduced motion: draws a still frame and never starts the animation loop', () => {
    render(<Dashy state="dancing" reducedMotion />);
    expect(requested).toBe(0);
  });

  it('animates normally when motion is allowed', () => {
    render(<Dashy state="dancing" reducedMotion={false} />);
    expect(queue.size).toBe(1);
    frame(16); expect(queue.size).toBe(1);
  });

  it('pauses when the window is hidden and resumes when it is visible again', () => {
    render(<Dashy state="idle" reducedMotion={false} />);
    expect(queue.size).toBe(1);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(queue.size).toBe(0);
    const before = requested;
    frame(100);
    expect(requested).toBe(before);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(queue.size).toBe(1);
  });

  it('pauses while scrolled out of view', () => {
    let notify!: (e: { isIntersecting: boolean }[]) => void;
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { notify = cb; } observe() {} disconnect() {} });
    render(<Dashy reducedMotion={false} />);
    expect(queue.size).toBe(1);
    act(() => notify([{ isIntersecting: false }]));
    expect(queue.size).toBe(0);
    act(() => notify([{ isIntersecting: true }]));
    expect(queue.size).toBe(1);
  });

  it('announce adds a polite live region with the label; off by default', () => {
    const { container, rerender } = render(<Dashy state="waiting" />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    rerender(<Dashy state="waiting" announce />);
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe('Dashy wacht op jou');
  });
});

describe('useStateDriver', () => {
  const MIN = 60_000;
  it('re-evaluates by itself at the right moments, without events', () => {
    vi.useFakeTimers();
    let t = 1_000_000; const clock = () => t;
    const advance = (ms: number) => act(() => { t += ms; vi.advanceTimersByTime(ms); });
    const { result } = renderHook(() => useStateDriver({}, clock));
    expect(result.current.state).toBe('idle');
    act(() => result.current.dispatch({ type: 'taskAdded', id: 'a', dueAt: t + 90 * MIN }));
    expect(result.current.state).toBe('received');
    advance(1000);
    expect(result.current.state).toBe('idle');
    advance(29 * MIN);
    expect(result.current.state).toBe('idle');
    advance(MIN);
    expect(result.current.state).toBe('strict');
    advance(45 * MIN);
    expect(result.current.state).toBe('angry');
    act(() => result.current.dispatch({ type: 'taskDone', id: 'a' }));
    expect(result.current.state).toBe('done');
    advance(4000);
    expect(result.current.state).toBe('idle');
  });

  it('clears its timer on unmount', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useStateDriver({}, () => Date.now()));
    act(() => result.current.dispatch({ type: 'taskAdded', id: 'a', dueAt: Date.now() + 3 * 60 * MIN }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('small variant', () => {
  const stroke = (c: HTMLElement) => c.querySelector('.outline')!.getAttribute('stroke-width');
  it('auto: thicker outline at 24 px, normal when the element is large', () => {
    const rects = new Map<Element, number>();
    vi.stubGlobal('ResizeObserver', class { cb: any; constructor(cb: any) { this.cb = cb; } observe() {} disconnect() {} });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { const w = rects.get(this) ?? 100; return { width: w, height: w, left: 0, top: 0, right: w, bottom: w, x: 0, y: 0, toJSON() {} }; });
    const { container } = render(<Dashy reducedMotion={false} />);
    const svg = img(container);
    act(() => frame(16)); expect(stroke(container)).toBe('1');
    rects.set(svg, 28); // simulate being resized to menu-bar size
    const { container: c2 } = render(<Dashy variant="small" reducedMotion={false} />);
    act(() => frame(32)); expect(stroke(c2)).toBe('8');
    vi.restoreAllMocks();
  });
});

describe('<DashyBody />', () => {
  it('is a block that stays where it is: only the eyes are drawn on it, labelled for screen readers, and it follows the state', async () => {
    const { DashyBody } = await import('../../src/react');
    const { container, rerender } = render(<DashyBody state="happy" reducedMotion />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.style.background).toMatch(/#fff|255, 255, 255/);
    expect(host.querySelector('.outline')).toBeNull(); // no body of its own: the block is the body
    expect(host.querySelector('svg[role="img"] title')!.textContent).toBe('Dashy is blij');
    rerender(<DashyBody state="angry" reducedMotion />);
    expect(host.querySelector('svg[role="img"] title')!.textContent).toBe('Dashy is boos');
  });
});
