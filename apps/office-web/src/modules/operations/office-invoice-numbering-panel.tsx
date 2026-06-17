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

// Mirrors maxInvoiceNumber in @bellfield/contracts for a client-side hint only.
// The API is the authoritative bound (DTO @Max + service). Kept as a local value
// so office-web keeps importing contracts as types only — a runtime value import
// would pull the contracts barrel into the bundle (its .js ESM re-exports don't
// resolve under next build without transpilePackages).
const MAX_INVOICE_NUMBER = 999_999_999;

/**
 * Owner control for the shared invoice-number counter: shows the number that will
 * be issued next and lets the owner set it (e.g. to continue a series migrated
 * from another system). Loads/saves independently of company settings — it has
 * its own endpoint and issued-number guard server-side.
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
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_INVOICE_NUMBER) {
      setErrorMessage(
        `Next invoice number must be a whole number from 1 to ${MAX_INVOICE_NUMBER.toLocaleString('en-US')}.`
      );
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
          max={MAX_INVOICE_NUMBER}
          step="1"
          value={draft}
          disabled={!canConfigure || isLoading}
          onChange={(event) => setDraft(event.target.value)}
          style={styles.input}
        />
      </label>
      <p style={{ ...styles.muted, fontSize: '0.75rem', marginTop: '0.35rem' }}>
        Posted invoices share one running number with kind prefixes (INV- for invoices, ADJ- for
        adjustments, CR- for credits). Set this to continue an existing series; it cannot be set to
        a number already issued or below the highest issued number.
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
