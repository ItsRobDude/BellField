'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { formatOfficeRoute, parseOfficeRoute, type OfficeRoute } from './office-route';

// In-app navigation is plain browser history. Every office screen has a URL, moving between
// screens pushes a history entry (so browser Back/Forward work), and each entry remembers
// whether it was reached from inside the app so an in-app "Back" can fall back sensibly when
// the user arrived on a deep link. Next's app router integrates with native
// pushState/replaceState, so it follows along without a server round trip.

const officeNavigationEventName = 'bellfield:office-navigation';

type OfficeHistoryState = {
  officeNavigation?: {
    fromLocation: string;
  };
};

export type OfficeNavigateOptions = {
  /** Replace the current history entry instead of adding one (tab switches, date changes). */
  replace?: boolean;
};

export type OfficeNavigation = {
  location: string;
  route: OfficeRoute | null;
  navigate: (route: OfficeRoute, options?: OfficeNavigateOptions) => void;
  /** Browser Back when this entry was reached in-app; otherwise replace it with the fallback. */
  goBack: (fallback: OfficeRoute) => void;
};

function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(officeNavigationEventName, onChange);

  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(officeNavigationEventName, onChange);
  };
}

function readBrowserLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function readServerLocation(): string {
  return '/';
}

function readHistoryState(): OfficeHistoryState | null {
  const state: unknown = window.history.state;
  return state && typeof state === 'object' ? (state as OfficeHistoryState) : null;
}

export function useOfficeNavigation(): OfficeNavigation {
  const location = useSyncExternalStore(
    subscribeToLocation,
    readBrowserLocation,
    readServerLocation
  );
  const route = useMemo(() => parseOfficeRoute(location), [location]);

  const navigate = useCallback((nextRoute: OfficeRoute, options: OfficeNavigateOptions = {}) => {
    const nextLocation = formatOfficeRoute(nextRoute);
    const currentLocation = readBrowserLocation();

    if (nextLocation === currentLocation) {
      return;
    }

    if (options.replace) {
      const nextState: OfficeHistoryState = {
        officeNavigation: readHistoryState()?.officeNavigation
      };
      window.history.replaceState(nextState, '', nextLocation);
    } else {
      const nextState: OfficeHistoryState = {
        officeNavigation: { fromLocation: currentLocation }
      };
      window.history.pushState(nextState, '', nextLocation);
    }

    window.dispatchEvent(new Event(officeNavigationEventName));
  }, []);

  const goBack = useCallback(
    (fallback: OfficeRoute) => {
      if (readHistoryState()?.officeNavigation) {
        window.history.back();
        return;
      }

      navigate(fallback, { replace: true });
    },
    [navigate]
  );

  return { location, route, navigate, goBack };
}
