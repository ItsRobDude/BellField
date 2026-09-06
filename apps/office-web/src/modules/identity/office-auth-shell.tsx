'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  createBellFieldTranslator,
  defaultBellFieldLocale,
  getBellFieldLocaleLabel,
  resolveBellFieldLocale,
  supportedBellFieldLocales,
  type BellFieldLocale
} from '@bellfield/i18n';
import { getInitialOfficeApiBaseUrl } from '@/lib/api-base-url';
import {
  createFirstOwner,
  getCurrentOfficeSession,
  getOfficeSetupStatus,
  loginToOfficeApi,
  OfficeIdentityApiError,
  type EmployeeSummary
} from '@/lib/identity-api';
import {
  clearStoredOfficeSession,
  readStoredOfficeServerUrl,
  readStoredOfficeSession,
  writeStoredOfficeSession
} from '@/lib/office-session-storage';
import { OfficeWorkspaceShell } from '@/modules/operations/office-workspace-shell';
import {
  resolveInitialLoginCredentials,
  shouldShowDemoLoginAccounts,
  type DemoLoginAccount
} from './demo-login';

const demoAccounts: DemoLoginAccount[] =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        { email: 'owner@bellfield.local', password: 'bellfield-owner', label: 'Owner' },
        { email: 'admin@bellfield.local', password: 'bellfield-admin', label: 'Admin' },
        {
          email: 'dispatcher@bellfield.local',
          password: 'bellfield-dispatch',
          label: 'Dispatcher'
        }
      ];

const minimumPasswordLength = 12;

export function OfficeAuthShell() {
  const showDemoAccounts = shouldShowDemoLoginAccounts() && demoAccounts.length > 0;
  const initialCredentials = resolveInitialLoginCredentials(demoAccounts);
  const [apiBaseUrl, setApiBaseUrl] = useState(getInitialOfficeApiBaseUrl());
  const [email, setEmail] = useState(initialCredentials.email);
  const [password, setPassword] = useState(initialCredentials.password);
  const [displayName, setDisplayName] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locale, setLocale] = useState<BellFieldLocale>(defaultBellFieldLocale);
  const [sessionRestoreState, setSessionRestoreState] = useState<'pending' | 'done'>('pending');
  const [isServerUnreachableForRestore, setIsServerUnreachableForRestore] = useState(false);
  const t = createBellFieldTranslator(locale);
  const setupPasswordTooShort =
    setupRequired && password.length > 0 && password.length < minimumPasswordLength;
  const setupPasswordInvalid = setupRequired && password.length < minimumPasswordLength;

  useEffect(() => {
    const browserLanguages =
      typeof navigator === 'undefined'
        ? undefined
        : navigator.languages.length > 0
          ? navigator.languages
          : navigator.language;

    setLocale(resolveBellFieldLocale(browserLanguages));
  }, []);

  useEffect(() => {
    // A remembered session survives refreshes and new tabs; the server decides whether it is
    // still valid before the workspace opens.
    const rememberedServerUrl = readStoredOfficeServerUrl();

    if (rememberedServerUrl !== null) {
      setApiBaseUrl(rememberedServerUrl);
    }

    const storedSession = readStoredOfficeSession();

    if (!storedSession) {
      setSessionRestoreState('done');
      return;
    }

    let isCurrent = true;
    setApiBaseUrl(storedSession.apiBaseUrl);

    getCurrentOfficeSession({
      sessionToken: storedSession.sessionToken,
      apiBaseUrl: storedSession.apiBaseUrl
    })
      .then((currentSession) => {
        if (!isCurrent) {
          return;
        }

        setSessionToken(storedSession.sessionToken);
        setEmployee(currentSession.employee);
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }

        if (
          error instanceof OfficeIdentityApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          // The server no longer honours this session: forget it and ask for a fresh sign-in.
          clearStoredOfficeSession();
          setErrorMessage(error.message);
          return;
        }

        // Unreachable server: keep the remembered session so the next load can try again.
        setIsServerUnreachableForRestore(true);
      })
      .finally(() => {
        if (isCurrent) {
          setSessionRestoreState('done');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setIsCheckingSetup(true);

    getOfficeSetupStatus({ apiBaseUrl })
      .then((status) => {
        if (isCurrent) {
          setSetupRequired(status.setupRequired);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSetupRequired(false);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingSetup(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [apiBaseUrl]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setIsServerUnreachableForRestore(false);

    try {
      const response = await loginToOfficeApi({
        email,
        password,
        deviceLabel: 'Office Browser',
        apiBaseUrl
      });

      writeStoredOfficeSession({ sessionToken: response.sessionToken, apiBaseUrl });
      setSessionToken(response.sessionToken);
      setEmployee(response.employee);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.unableToSignIn'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateFirstOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setIsServerUnreachableForRestore(false);

    try {
      const response = await createFirstOwner({
        setupToken,
        displayName,
        email,
        password,
        apiBaseUrl
      });

      setSetupRequired(false);
      setSetupToken('');
      writeStoredOfficeSession({ sessionToken: response.sessionToken, apiBaseUrl });
      setSessionToken(response.sessionToken);
      setEmployee(response.employee);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('officeAuth.unableToCreateOwner'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sessionToken && employee) {
    return (
      <OfficeWorkspaceShell
        apiBaseUrl={apiBaseUrl}
        initialEmployee={employee}
        sessionToken={sessionToken}
        onSignOut={() => {
          clearStoredOfficeSession();
          setSessionToken(null);
          setEmployee(null);
          setErrorMessage(null);
        }}
        onSessionExpired={(message) => {
          clearStoredOfficeSession();
          setSessionToken(null);
          setEmployee(null);
          setErrorMessage(message);
        }}
      />
    );
  }

  if (sessionRestoreState === 'pending') {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>{t('officeAuth.productName')}</div>
          <p style={styles.muted}>{t('officeAuth.restoringSession')}</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>{t('officeAuth.productName')}</div>
        <h1 style={styles.title}>
          {setupRequired ? t('officeAuth.createOwnerAccount') : t('common.signIn')}
        </h1>
        <p style={styles.muted}>
          {setupRequired ? t('officeAuth.startOwnerIntro') : t('officeAuth.signInIntro')}
        </p>
        <form onSubmit={setupRequired ? handleCreateFirstOwner : handleLogin} style={styles.form}>
          <label style={styles.fieldLabel}>
            <span>{t('common.serverUrl')}</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="https://office-pc:3001"
              style={styles.input}
            />
          </label>
          <p style={styles.helperText}>{t('officeAuth.serverUrlHelp')}</p>
          <label style={styles.fieldLabel}>
            <span>{t('common.languageLabel')}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(resolveBellFieldLocale(event.target.value))}
              style={styles.input}
            >
              {supportedBellFieldLocales.map((optionLocale) => (
                <option key={optionLocale} value={optionLocale}>
                  {getBellFieldLocaleLabel(optionLocale, locale)}
                </option>
              ))}
            </select>
          </label>
          {setupRequired ? (
            <>
              <input
                aria-label={t('officeAuth.setupToken')}
                placeholder={t('officeAuth.setupToken')}
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                style={styles.input}
                type="password"
              />
              <input
                aria-label={t('officeAuth.displayName')}
                placeholder={t('officeAuth.displayName')}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                style={styles.input}
              />
            </>
          ) : null}
          <input
            aria-label={t('common.email')}
            placeholder={t('common.email')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={styles.input}
          />
          <input
            aria-label={t('common.password')}
            placeholder={t('common.password')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            style={styles.input}
          />
          {setupPasswordTooShort ? (
            <p style={styles.helperText}>{t('officeAuth.passwordMinimum')}</p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || setupPasswordInvalid}
            style={styles.button}
          >
            {setupRequired
              ? isSubmitting
                ? t('officeAuth.creatingOwner')
                : t('officeAuth.createOwner')
              : isSubmitting
                ? t('common.signingIn')
                : t('common.signIn')}
          </button>
        </form>
        {isCheckingSetup ? (
          <p style={styles.helperText}>{t('officeAuth.serverSetupStatus')}</p>
        ) : null}
        {showDemoAccounts && !setupRequired ? (
          <div style={styles.demoList}>
            <p style={styles.helperText}>{t('common.demoAccounts')}</p>
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                style={styles.demoButton}
              >
                {account.label}: {account.email}
              </button>
            ))}
          </div>
        ) : null}
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        {!errorMessage && isServerUnreachableForRestore ? (
          <p style={styles.error}>{t('officeAuth.sessionRestoreUnavailable')}</p>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f4f1e8',
    color: '#1f2933',
    display: 'grid',
    fontFamily: 'Arial, sans-serif',
    placeItems: 'center',
    padding: '2rem'
  },
  card: {
    background: '#fffdf7',
    border: '1px solid #e5dcc8',
    borderRadius: 24,
    maxWidth: '34rem',
    padding: '2rem',
    width: '100%'
  },
  fieldLabel: {
    color: '#1f2933',
    display: 'grid',
    fontSize: '0.95rem',
    fontWeight: 600,
    gap: '0.5rem'
  },
  form: { display: 'grid', gap: '0.75rem', marginTop: '1rem' },
  helperText: { color: '#52606d', fontSize: '0.9rem', margin: '-0.25rem 0 0' },
  input: {
    background: '#ffffff',
    border: '1px solid #d9c8ad',
    borderRadius: 14,
    fontSize: '1rem',
    padding: '0.85rem 1rem'
  },
  button: {
    background: '#1c6b57',
    border: 'none',
    borderRadius: 999,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 700,
    padding: '0.9rem 1.25rem'
  },
  demoList: { display: 'grid', gap: '0.5rem', marginTop: '1rem' },
  demoButton: {
    background: '#faf5e8',
    border: '1px solid #e6d6ba',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: '0.95rem',
    padding: '0.75rem 0.9rem',
    textAlign: 'left'
  },
  title: { fontSize: '2.2rem', lineHeight: 1.1, margin: '0 0 0.75rem' },
  kicker: {
    color: '#9a6b2f',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.14em',
    marginBottom: '0.75rem',
    textTransform: 'uppercase'
  },
  muted: { color: '#52606d', margin: 0 },
  error: { color: '#b42318', marginTop: '0.75rem' }
};
