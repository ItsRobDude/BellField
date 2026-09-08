import { useCallback, useRef, useState } from 'react';

/**
 * Runs an async handler at most once at a time: a second click while it is in flight is
 * ignored, and `isBusy` drives the button's busy state. The handler keeps its own try/catch;
 * an error it lets through is re-thrown after the busy flag clears.
 */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown> | unknown
): { run: (...args: Args) => Promise<void>; isBusy: boolean } {
  const [isBusy, setIsBusy] = useState(false);
  const inFlightRef = useRef(false);
  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: Args) => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsBusy(true);
    try {
      await actionRef.current(...args);
    } finally {
      inFlightRef.current = false;
      setIsBusy(false);
    }
  }, []);

  return { run, isBusy };
}
