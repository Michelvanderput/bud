import { useEffect, useRef, type RefObject } from 'react';
import type { DashyState } from '../core';
import { mountDashy, type DashyHandle } from '../svg';

/**
 * Makes the `host` element Dashy's body: it stays still, his eyes are drawn on it and all the life is in his face (core.ts).
 * Returns `look` to make him glance towards something.
 */
export function useDashyBody(host: RefObject<HTMLElement | null>, state: DashyState, reducedMotion?: boolean) {
  const handle = useRef<DashyHandle | null>(null);
  const latest = useRef(state); latest.current = state;
  useEffect(() => {
    const h = mountDashy(host.current!, { body: {}, initialState: latest.current, reducedMotion });
    handle.current = h;
    return () => { h.destroy(); handle.current = null; };
  }, [host, reducedMotion]);
  useEffect(() => { const h = handle.current; if (h && h.getState() !== state) h.setState(state); }, [state]);
  return { look: (nx: number, ny: number) => handle.current?.look(nx, ny) };
}
