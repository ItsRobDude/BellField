'use client';

import { useEffect, useRef, useState } from 'react';
import type { CrmSearchResult } from '@/lib/operations-api';
import { searchOfficeCrm } from '@/lib/operations-api';
import type { CrmPanelMode } from './crm-panel-types';

type UseCrmSearchInput = {
  apiBaseUrl: string;
  mode: CrmPanelMode;
  onErrorMessage: (message: string | null) => void;
  searchQuery: string;
  sessionToken: string;
};

const crmSearchDebounceMs = 250;

export function useCrmSearch({
  apiBaseUrl,
  mode,
  onErrorMessage,
  searchQuery,
  sessionToken
}: UseCrmSearchInput) {
  const [searchResults, setSearchResults] = useState<CrmSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    const query = searchQuery.trim();

    if (mode !== 'search' || query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await searchOfficeCrm({ sessionToken, apiBaseUrl, query });

          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          setSearchResults(response.results);
        } catch (error) {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          onErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to search customers, locations, and contacts.'
          );
          setSearchResults([]);
        } finally {
          if (searchRequestIdRef.current === requestId) {
            setIsSearching(false);
          }
        }
      })();
    }, crmSearchDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [apiBaseUrl, mode, onErrorMessage, searchQuery, sessionToken]);

  return { isSearching, searchResults };
}
