'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CompanySettings } from '@bellfield/contracts';
import {
  getOfficeCompanySettings,
  updateOfficeCompanySettings,
  updateOfficeEmailProviderSecret
} from '@/lib/operations-company-settings-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeSettingsSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canConfigure: boolean;
};

type SettingsDraft = {
  companyName: string;
  customerFacingSenderName: string;
  customerFacingFromEmail: string;
  replyToEmail: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
};

const emptyDraft: SettingsDraft = {
  companyName: '',
  customerFacingSenderName: '',
  customerFacingFromEmail: '',
  replyToEmail: '',
  estimateEmailSubject: '',
  estimateEmailBody: ''
};

export function OfficeSettingsSurface({
  apiBaseUrl,
  sessionToken,
  canConfigure
}: OfficeSettingsSurfaceProps) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSecret, setIsSavingSecret] = useState(false);
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
    setIsSaving(true);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const response = await updateOfficeCompanySettings({
        apiBaseUrl,
        sessionToken,
        companyName: draft.companyName,
        customerFacingSenderName: draft.customerFacingSenderName,
        customerFacingFromEmail: draft.customerFacingFromEmail,
        replyToEmail: draft.replyToEmail.trim() || undefined,
        estimateEmailSubject: draft.estimateEmailSubject,
        estimateEmailBody: draft.estimateEmailBody
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

  async function saveProviderSecret() {
    setIsSavingSecret(true);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const response = await updateOfficeEmailProviderSecret({
        apiBaseUrl,
        sessionToken,
        provider: 'resend',
        apiKey
      });
      setSettings((current) =>
        current ? { ...current, emailProvider: response.emailProvider } : current
      );
      setApiKey('');
      setNoticeMessage('Email provider key saved.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the email provider key.'
      );
    } finally {
      setIsSavingSecret(false);
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
              Sender name
              <input
                aria-label="Sender name"
                value={draft.customerFacingSenderName}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'customerFacingSenderName', event.target.value)
                }
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              From email
              <input
                aria-label="From email"
                value={draft.customerFacingFromEmail}
                disabled={!canConfigure}
                onChange={(event) =>
                  setDraftValue(setDraft, 'customerFacingFromEmail', event.target.value)
                }
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
            {canConfigure ? (
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

          <section style={styles.panel} aria-label="Email provider">
            <h2 style={styles.sectionHeading}>Email provider</h2>
            <p style={styles.muted}>
              Resend is {settings.emailProvider.configured ? 'configured' : 'not configured'}.
            </p>
            {settings.emailProvider.lastConfiguredAt ? (
              <p style={styles.tinyMuted}>
                Last updated by {settings.emailProvider.lastConfiguredByName ?? 'Unknown'} on{' '}
                {new Date(settings.emailProvider.lastConfiguredAt).toLocaleString()}
              </p>
            ) : null}
            {canConfigure ? (
              <>
                <label style={styles.fieldLabel}>
                  Resend API key
                  <input
                    aria-label="Resend API key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    style={styles.input}
                  />
                </label>
                <button
                  type="button"
                  style={styles.button}
                  disabled={isSavingSecret || apiKey.trim().length < 20}
                  onClick={() => void saveProviderSecret()}
                >
                  {isSavingSecret ? 'Saving...' : 'Save provider key'}
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : isLoading ? (
        <p style={styles.notice}>Loading settings...</p>
      ) : null}
    </section>
  );
}

function toDraft(settings: CompanySettings): SettingsDraft {
  return {
    companyName: settings.companyName,
    customerFacingSenderName: settings.customerFacingSenderName,
    customerFacingFromEmail: settings.customerFacingFromEmail,
    replyToEmail: settings.replyToEmail ?? '',
    estimateEmailSubject: settings.estimateEmailSubject,
    estimateEmailBody: settings.estimateEmailBody
  };
}

function setDraftValue(
  setDraft: (update: (current: SettingsDraft) => SettingsDraft) => void,
  key: keyof SettingsDraft,
  value: string
) {
  setDraft((current) => ({ ...current, [key]: value }));
}
