'use client';

import type { CrmSearchResult } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmSearchPanelProps = {
  isSearching: boolean;
  onNewContact: () => void;
  onNewCustomer: () => void;
  onNewLocation: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectResult: (result: CrmSearchResult) => void;
  searchQuery: string;
  searchResults: CrmSearchResult[];
};

export function CrmSearchPanel({
  isSearching,
  onNewContact,
  onNewCustomer,
  onNewLocation,
  onSearchQueryChange,
  onSelectResult,
  searchQuery,
  searchResults
}: CrmSearchPanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>Find customers, locations, and contacts</h3>
        <div style={styles.inlineActionBar}>
          <button type="button" onClick={onNewCustomer} style={styles.primaryButton}>
            New customer
          </button>
          <button type="button" onClick={onNewLocation} style={styles.button}>
            New location
          </button>
          <button type="button" onClick={onNewContact} style={styles.button}>
            New contact
          </button>
        </div>
      </div>
      <label style={styles.fieldLabel}>
        <span>Search</span>
        <input
          aria-label="Customer, location, or contact search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search by name, address, phone"
          style={styles.input}
        />
      </label>
      {isSearching ? <p style={styles.tinyMuted}>Searching...</p> : null}
      {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 ? (
        <p style={styles.tinyMuted}>Type at least 2 characters.</p>
      ) : null}
      <div style={styles.list}>
        {searchResults.map((result) => (
          <button
            key={`${result.kind}-${result.id}`}
            type="button"
            onClick={() => onSelectResult(result)}
            style={styles.cardButton}
          >
            <strong>
              {result.title} {result.badges.includes('DNU') ? '(DNU)' : ''}
            </strong>
            <span style={styles.tinyMuted}>
              {result.kind} - {result.subtitle}
            </span>
            {result.badges.length > 0 ? (
              <span style={styles.badgeRow}>
                {result.badges.map((badge) => (
                  <span key={badge} style={badge === 'DNU' ? styles.dangerBadge : styles.badge}>
                    {badge}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
