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
};

const emptyDraft: SettingsDraft = {
  companyName: '',
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
