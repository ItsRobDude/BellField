'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getOfficeInvoiceNumbering,
  updateOfficeInvoiceNumbering
} from '@/lib/operations-company-settings-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeInvoiceNumberingPanelProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canConfigure: boolean;
};

/**
 * Owner control for the shared invoice-number counter: shows the number that will
 * be issued next and lets the owner set it (e.g. to continue a series migrated
 * from another system). Loads/saves independently of company settings — it has
 * its own endpoint and forward-only guard server-side.
 */
export function OfficeInvoiceNumberingPanel({
  apiBaseUrl,
  sessionToken,
  canConfigure
}: OfficeInvoiceNumberingPanelProps) {
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeInvoiceNumbering({ apiBaseUrl, sessionToken });
      setDraft(String(response.numbering.nextNumber));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load invoice numbering.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const parsed = Number(draft.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      setErrorMessage('Next invoice number must be a whole number of at least 1.');
      return;
    }
    setIsSaving(true);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const response = await updateOfficeInvoiceNumbering({
        nextNumber: parsed,
        apiBaseUrl,
        sessionToken
      });
      setDraft(String(response.numbering.nextNumber));
      setNoticeMessage('Invoice numbering saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save invoice numbering.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={styles.panel} aria-label="Invoice numbering">
      <h2 style={styles.sectionHeading}>Invoice numbering</h2>
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      <label style={styles.fieldLabel}>
        Next invoice number
        <input
          aria-label="Next invoice number"
          type="number"
          min="1"
          step="1"
          value={draft}
          disabled={!canConfigure || isLoading}
          onChange={(event) => setDraft(event.target.value)}
          style={styles.input}
        />
      </label>
      <p style={{ ...styles.muted, fontSize: '0.75rem', marginTop: '0.35rem' }}>
        Posted invoices share one running number with kind prefixes (INV- for invoices, ADJ- for
        adjustments, CR- for credits). Set this to continue an existing series; it can only move
        forward, past numbers already issued.
      </p>
      {canConfigure ? (
        <button
          type="button"
          style={styles.primaryButton}
          disabled={isSaving || isLoading}
          onClick={() => void save()}
        >
          {isSaving ? 'Saving...' : 'Save numbering'}
        </button>
      ) : null}
    </section>
  );
}
