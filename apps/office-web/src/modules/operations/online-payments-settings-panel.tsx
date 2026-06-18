'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  OnlinePaymentsSetupLinkResponse,
  OnlinePaymentsSetupStatus,
  OnlinePaymentsSetupStatusResponse
} from '@bellfield/contracts';
import {
  createOfficeOnlinePaymentsSetupLink,
  getOfficeOnlinePaymentsSetupStatus,
  refreshOfficeOnlinePaymentsSetupLink
} from '@/lib/operations-company-settings-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OnlinePaymentsSettingsPanelProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canConfigure: boolean;
};

export function OnlinePaymentsSettingsPanel({
  apiBaseUrl,
  sessionToken,
  canConfigure
}: OnlinePaymentsSettingsPanelProps) {
  const [setup, setSetup] = useState<OnlinePaymentsSetupStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningSetup, setIsOpeningSetup] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeOnlinePaymentsSetupStatus({ apiBaseUrl, sessionToken });
      setSetup(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load payment setup.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openSetup() {
    setIsOpeningSetup(true);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const request =
        status === 'notStarted'
          ? createOfficeOnlinePaymentsSetupLink
          : refreshOfficeOnlinePaymentsSetupLink;
      const response = await request({ apiBaseUrl, sessionToken });
      handleSetupLinkResponse(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open payment setup.');
    } finally {
      setIsOpeningSetup(false);
    }
  }

  function handleSetupLinkResponse(response: OnlinePaymentsSetupLinkResponse) {
    setSetup(response);
    if (response.onboardingUrl) {
      const openedWindow = window.open(response.onboardingUrl, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        setErrorMessage('Online payments setup could not open. Allow pop-ups and try again.');
        return;
      }
      setNoticeMessage('Online payments setup opened.');
      return;
    }
    if (response.status === 'ready') {
      setNoticeMessage('Online payments ready.');
      return;
    }
    setNoticeMessage(null);
    setErrorMessage(response.message ?? setupCopy(response.status));
  }

  const status = setup?.status ?? 'notStarted';
  const primaryAction = primaryActionForStatus(status);

  return (
    <section style={styles.panel} aria-label="Online payments settings">
      <div style={styles.row}>
        <div>
          <h2 style={styles.sectionHeading}>Online payments</h2>
          <p style={styles.muted}>{isLoading ? 'Checking setup...' : setupCopy(status)}</p>
        </div>
        <span style={statusBadgeStyle(status)}>{statusBadge(status)}</span>
      </div>

      {setup?.message && status !== 'ready' && setup.message !== setupCopy(status) ? (
        <p style={styles.warning}>{setup.message}</p>
      ) : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      <div style={styles.inlineActionBar}>
        {primaryAction ? (
          <button
            type="button"
            style={styles.primaryButton}
            disabled={!canConfigure || isOpeningSetup || isLoading}
            onClick={() => void openSetup()}
          >
            {isOpeningSetup ? 'Opening...' : primaryAction}
          </button>
        ) : null}
        {status !== 'notStarted' ? (
          <button
            type="button"
            style={styles.button}
            disabled={isOpeningSetup || isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Checking...' : 'Refresh status'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function primaryActionForStatus(status: OnlinePaymentsSetupStatus): string | null {
  if (status === 'notStarted') {
    return 'Set up online payments';
  }
  if (status === 'actionRequired') {
    return 'Continue setup';
  }
  return null;
}

function statusBadgeStyle(status: OnlinePaymentsSetupStatus) {
  if (status === 'disabled' || status === 'providerError') {
    return styles.dangerBadge;
  }
  if (status === 'ready') {
    return styles.badge;
  }
  return {
    ...styles.badge,
    background: '#fffbeb',
    color: '#92400e'
  };
}

function statusBadge(status: OnlinePaymentsSetupStatus): string {
  switch (status) {
    case 'notStarted':
      return 'Not set up';
    case 'actionRequired':
      return 'Action required';
    case 'pendingReview':
      return 'Pending review';
    case 'ready':
      return 'Ready';
    case 'disabled':
      return 'Disabled';
    case 'providerError':
      return 'Unavailable';
  }
}

function setupCopy(status: OnlinePaymentsSetupStatus): string {
  switch (status) {
    case 'notStarted':
      return 'Online payments are not set up yet.';
    case 'actionRequired':
      return 'Continue setup so invoice and deposit payment links can be used.';
    case 'pendingReview':
      return 'Online payments are almost ready. We are finishing verification.';
    case 'ready':
      return 'Online payments ready.';
    case 'disabled':
      return 'Online payments are disabled.';
    case 'providerError':
      return 'Online payments setup is not available right now.';
  }
}
