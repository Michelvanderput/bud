import { useRef, type CSSProperties } from 'react';
import type { DashyState } from '../core';
import { useDashyBody } from './useDashyBody';

export interface DashyBodyProps {
  state?: DashyState;
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
  className?: string;
  /** The block fills its container by default; give it a size here or on the parent. */
  style?: CSSProperties;
}

/**
 * Dashy in his own block: the white block IS his body and it stands still, like any other block. All the life is in his face:
 * the eyes look around and blink and take his mood, and the face moves, tilts and squashes inside the block (never outside it).
 * A tap on the block startles him. Screen readers get his state as an image label.
 */
export function DashyBody({ state = 'idle', reducedMotion, className, style }: DashyBodyProps) {
  const host = useRef<HTMLDivElement>(null);
  useDashyBody(host, state, reducedMotion);
  return <div ref={host} className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'clamp(22px,3.4vmin,32px)', background: '#fff', boxShadow: 'inset 0 0 0 1px rgba(23,24,26,.06)', touchAction: 'manipulation', ...style }} />;
}
