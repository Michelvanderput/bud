import { useEffect, useRef, type CSSProperties } from 'react';
import type { DashyState, Shape } from '../core';
import { DEFAULT_LABELS, mountDashy, type DashyHandle, type MountOptions } from '../svg';

export interface DashyProps {
  state?: DashyState;
  shape?: Shape;
  /** Pixels (number) or any CSS length. The avatar is square. Default 96. */
  size?: number | string;
  /** Screen reader texts per state. Read when Dashy mounts. Default: Dutch. */
  labels?: MountOptions['labels'];
  /** Also announce state changes to screen readers (polite). Default false: the label is on the image itself. */
  announce?: boolean;
  /** 'auto' (default) uses the small drawing at 32 px and below. */
  variant?: 'full' | 'small' | 'auto';
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
  /** Look, custom expressions and sequences (see definition.ts). Read when Dashy mounts. */
  definition?: unknown;
  /** Name of a sequence from the definition to play; changing it plays the new one, undefined stops. */
  sequence?: string;
  /** Body, eye and outline colours. */
  colors?: MountOptions['colors'];
  /** Ambient life and head turn, both default on. */
  ambient?: boolean | number;
  perspective?: boolean | number;
  /** Seed for blink timing and glances. Read when Dashy mounts. */
  seed?: number;
  className?: string;
  style?: CSSProperties;
}

const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** Dashy as a React component. All motion comes from core.ts; this only mounts it and passes props through. */
export function Dashy({ state = 'idle', shape = 'square', size = 96, labels, announce = false, variant = 'auto', reducedMotion, seed, definition, sequence, colors, ambient, perspective, className, style }: DashyProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<DashyHandle | null>(null);
  const latest = useRef({ state, shape, labels, definition, colors, sequence });
  latest.current = { state, shape, labels, definition, colors, sequence };

  // Mount once (and again only if reducedMotion or seed change). labels are read from `latest`, so an inline object does not remount.
  useEffect(() => {
    const { state: s0, shape: sh0, labels: l0, definition: d0, colors: c0, sequence: q0 } = latest.current;
    const h = mountDashy(host.current!, { shape: sh0, labels: l0, definition: d0, colors: c0, initialState: s0, variant, reducedMotion, seed, ambient, perspective });
    handle.current = h;
    if (q0) h.play(q0);
    return () => { h.destroy(); handle.current = null; };
  }, [variant, reducedMotion, seed, ambient, perspective]);

  useEffect(() => { const h = handle.current; if (h && h.getState() !== state) h.setState(state); }, [state]);
  useEffect(() => { handle.current?.setShape(shape); }, [shape]);
  useEffect(() => { const h = handle.current; if (!h) return; if (sequence) h.play(sequence); else h.stop(); }, [sequence]);
  useEffect(() => { if (colors) handle.current?.setColors(colors); }, [colors?.body, colors?.eyes, colors?.outline]);

  const dim = typeof size === 'number' ? `${size}px` : size;
  const text = { ...DEFAULT_LABELS, ...labels }[state];
  return (
    <div ref={host} className={className} style={{ position: 'relative', display: 'inline-block', width: dim, height: dim, ...style }}>
      {announce && <span aria-live="polite" style={SR_ONLY}>{text}</span>}
    </div>
  );
}
