import { useEffect, useState } from 'react';

const dispatchAutoRefreshIntervalMs = 60_000;

export const dispatchAutoRefreshFailedMessage =
  'Automatic refresh failed. The board still shows the last refresh; use Refresh to try again.';

/**
 * Refreshes the dispatch board on a timer without touching what the user is reading: the shell's
 * message slot is left alone, a failed background refresh is reported beside the board's own
 * "Refreshed" stamp, and the next success clears it.
 */
export function useDispatchAutoRefresh(
  refresh: (options: { background: true }) => Promise<boolean>
): string | null {
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refresh({ background: true }).then((succeeded) => {
        setRefreshError(succeeded ? null : dispatchAutoRefreshFailedMessage);
      });
    }, dispatchAutoRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [refresh]);

  return refreshError;
}
