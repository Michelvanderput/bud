import { useCallback, useEffect, useRef, useState } from 'react';
import { initialDriverState, nextWakeAt, reduce, resolve, type DriverConfig, type DriverEvent, type Resolution } from '../driver';

/**
 * Connects the pure driver to React: keeps the driver state, and sets exactly one timeout for the next
 * moment the answer can change by itself (deadline thresholds, done/received windows, one quiet hour).
 */
export function useStateDriver(config: Partial<DriverConfig> = {}, clock: () => number = Date.now): Resolution & { dispatch: (e: DriverEvent) => void } {
  const cfg = useRef(config); cfg.current = config;
  const [driver, setDriver] = useState(() => initialDriverState(clock()));
  const [now, setNow] = useState(() => clock());

  const dispatch = useCallback((e: DriverEvent) => {
    const t = clock();
    setDriver(s => reduce(s, e, t));
    setNow(t);
  }, [clock]);

  useEffect(() => {
    const wake = nextWakeAt(driver, now, cfg.current);
    if (wake === null) return;
    // setTimeout overflows above ~24.8 days; waking early is harmless, we just look again.
    const id = setTimeout(() => setNow(clock()), Math.min(2 ** 31 - 1, Math.max(0, wake - clock()) + 1));
    return () => clearTimeout(id);
  }, [driver, now, clock]);

  return { ...resolve(driver, now, cfg.current), dispatch };
}
