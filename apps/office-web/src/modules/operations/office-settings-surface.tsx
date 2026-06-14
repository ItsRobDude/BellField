'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CompanySettings } from '@bellfield/contracts';
import {
  getOfficeCompanySettings,
  updateOfficeCompanySettings
} from '@/lib/operations-company-settings-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeSettingsSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canConfigure: boolean;
};

type SettingsDraft = {
  companyName: string;
  replyToEmail: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  acceptanceLinkExpiryDays: string;
  chargesSalesTax: boolean;
  defaultSalesTaxRatePercent: string;
  includeInvoicePaymentLink: boolean;
};

const emptyDraft: SettingsDraft = {
  companyName: '',
  replyToEmail: '',
  estimateEmailSubject: '',
  estimateEmailBody: '',
  invoiceEmailSubject: '',
  invoiceEmailBody: '',
  acceptanceLinkExpiryDays: '30',
  chargesSalesTax: false,
  defaultSalesTaxRatePercent: '0',
  includeInvoicePaymentLink: false
};

export function OfficeSettingsSurface({
  apiBaseUrl,
  sessionToken,
  canConfigure
}: OfficeSettingsSurfaceProps) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeCompanySettings({ apiBaseUrl, sessionToken });
      setSettings(response.settings);
      setDraft(toDraft(response.settings));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load settings.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    const parsedTaxRate = parsePercentToBasisPoints(draft.defaultSalesTaxRatePercent);
    if (parsedTaxRate.kind !== 'ok') {
      setErrorMessage(
        parsedTaxRate.kind === 'empty'
          ? 'Enter a default sales tax rate (use 0 if the company does not charge tax).'
          : parsedTaxRate.kind === 'tooPrecise'
            ? 'Default sales tax rate supports up to two decimal places (e.g. 8.25).'
            : 'Default sales tax rate must be between 0% and 25%.'
      );
      return;
    }
    const defaultSalesTaxBasisPoints = parsedTaxRate.basisPoints;

    const acceptanceLinkExpiryDays = Number(draft.acceptanceLinkExpiryDays.trim());
    if (
      !Number.isInteger(acceptanceLinkExpiryDays) ||
      acceptanceLinkExpiryDays < 7 ||
      acceptanceLinkExpiryDays > 90
    ) {
      setErrorMessage('Approval link expiry must be a whole number between 7 and 90 days.');
      return;
    }

    setIsSaving(true);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const response = await updateOfficeCompanySettings({
        apiBaseUrl,
        sessionToken,
        companyName: draft.companyName,
        replyToEmail: draft.replyToEmail.trim() || undefined,
        estimateEmailSubject: draft.estimateEmailSubject,
        estimateEmailBody: draft.estimateEmailBody,
        invoiceEmailSubject: draft.invoiceEmailSubject,
        invoiceEmailBody: draft.invoiceEmailBody,
        acceptanceLinkExpiryDays,
        chargesSalesTax: draft.chargesSalesTax,
        defaultSalesTaxBasisPoints,
        includeInvoicePaymentLink: draft.includeInvoicePaymentLink
      });
      setSettings(response.settings);
      setDraft(toDraft(response.settings));
      setNoticeMessage('Settings saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section style={styles.workspacePanel} aria-label="Settings">
      <div style={styles.row}>
        <div>
          <p style={styles.kicker}>Admin</p>
          <h1 style={styles.heading}>Settings</h1>
        </div>
        <button
          type="button"
          style={styles.button}
          disabled={isLoading}
          onClick={() => void load()}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      {settings ? (
        <div style={styles.splitGrid}>
          <section style={styles.panel} aria-label="Company email settings">
            <h2 style={styles.sectionHeading}>Company email</h2>
            <label style={styles.fieldLabel}>
              Company name
              <input
                aria-label="Company name"
                value={draft.companyName}
                disabled={!canConfigure}
                onChange={(event) => setDraftValue(setDraft, 'companyName', event.target.value)}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              Reply-to email
              <input
                aria-label="Reply-to email"
                value={draft.replyToEmail}
                disabled={!canConfigure}
                onChange={(event) => setDraftValue(setDraft, 'replyToEmail', event.target.value)}
                style={styles.input}
              />
            </label>
          </section>

          <section style={styles.panel} aria-label="Estimate email defaults">
            <h2 style={styles.sectionHeading}>Estimate email</h2>
            <label style={styles.fieldLabel}>
              Subject
              <input
                aria-label="Estimate email subject"
                value={draft.estimateEmailSubject}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'estimateEmailSubject', event.target.value)
                }
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              Body
              <textarea
                aria-label="Estimate email body"
                value={draft.estimateEmailBody}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'estimateEmailBody', event.target.value)
                }
                style={{ ...styles.textarea, minHeight: '12rem' }}
              />
            </label>
            <label style={styles.fieldLabel}>
              Approval link expiry (days)
              <input
                aria-label="Approval link expiry days"
                type="number"
                min="7"
                max="90"
                step="1"
                value={draft.acceptanceLinkExpiryDays}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'acceptanceLinkExpiryDays', event.target.value)
                }
                style={styles.input}
              />
            </label>
          </section>
          <section style={styles.panel} aria-label="Invoice email defaults">
            <h2 style={styles.sectionHeading}>Invoice email</h2>
            <label style={styles.fieldLabel}>
              Subject
              <input
                aria-label="Invoice email subject"
                value={draft.invoiceEmailSubject}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'invoiceEmailSubject', event.target.value)
                }
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              Body
              <textarea
                aria-label="Invoice email body"
                value={draft.invoiceEmailBody}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'invoiceEmailBody', event.target.value)
                }
                style={{ ...styles.textarea, minHeight: '10rem' }}
              />
            </label>
          </section>
          <section style={styles.panel} aria-label="Billing and tax settings">
            <h2 style={styles.sectionHeading}>Billing & tax</h2>
            <label style={styles.inlineLabel}>
              <input
                aria-label="Charge sales tax"
                type="checkbox"
                checked={draft.chargesSalesTax}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    chargesSalesTax: event.target.checked
                  }))
                }
              />
              Charge sales tax
            </label>
            <label style={styles.fieldLabel}>
              Default sales tax rate (%)
              <input
                aria-label="Default sales tax rate"
                type="number"
                min="0"
                max="25"
                step="0.01"
                value={draft.defaultSalesTaxRatePercent}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'defaultSalesTaxRatePercent', event.target.value)
                }
                style={styles.input}
              />
            </label>
            <label style={styles.inlineLabel}>
              <input
                aria-label="Include a pay-now link in invoice emails"
                type="checkbox"
                checked={draft.includeInvoicePaymentLink}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includeInvoicePaymentLink: event.target.checked
                  }))
                }
              />
              Include a pay-now link in invoice emails (posted invoices with a balance)
            </label>
          </section>
        </div>
      ) : isLoading ? (
        <p style={styles.notice}>Loading settings...</p>
      ) : null}
      {settings && canConfigure ? (
        <button
          type="button"
          style={styles.primaryButton}
          disabled={isSaving}
          onClick={() => void saveSettings()}
        >
          {isSaving ? 'Saving...' : 'Save settings'}
        </button>
      ) : null}
    </section>
  );
}

function toDraft(settings: CompanySettings): SettingsDraft {
  return {
    companyName: settings.companyName,
    replyToEmail: settings.replyToEmail ?? '',
    estimateEmailSubject: settings.estimateEmailSubject,
    estimateEmailBody: settings.estimateEmailBody,
    invoiceEmailSubject: settings.invoiceEmailSubject,
    invoiceEmailBody: settings.invoiceEmailBody,
    acceptanceLinkExpiryDays: String(settings.acceptanceLinkExpiryDays),
    chargesSalesTax: settings.chargesSalesTax,
    defaultSalesTaxRatePercent: basisPointsToPercentString(settings.defaultSalesTaxBasisPoints),
    includeInvoicePaymentLink: settings.includeInvoicePaymentLink
  };
}

function setDraftValue(
  setDraft: (update: (current: SettingsDraft) => SettingsDraft) => void,
  key: keyof SettingsDraft,
  value: string
) {
  setDraft((current) => ({ ...current, [key]: value }));
}

type ParsedTaxRate =
  | { kind: 'ok'; basisPoints: number }
  | { kind: 'empty' }
  | { kind: 'outOfRange' }
  | { kind: 'tooPrecise' };

function parsePercentToBasisPoints(value: string): ParsedTaxRate {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { kind: 'empty' };
  }
  const percent = Number(trimmedValue);
  if (!Number.isFinite(percent) || percent < 0 || percent > 25) {
    return { kind: 'outOfRange' };
  }
  const basisPoints = percent * 100;
  // Reject sub-basis-point input ("8.255") rather than silently rounding the
  // user's rate to 8.26%.
  if (!Number.isInteger(Number(basisPoints.toFixed(6)))) {
    return { kind: 'tooPrecise' };
  }
  return { kind: 'ok', basisPoints: Math.round(basisPoints) };
}

function basisPointsToPercentString(basisPoints: number): string {
  return String(basisPoints / 100);
}
