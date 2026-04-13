'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useState } from 'react';
import { loginToOfficeApi, type EmployeeSummary } from '@/lib/identity-api';
import { OfficeWorkspaceShell } from '@/modules/operations/office-workspace-shell';

const demoAccounts = [
  { email: 'owner@bellfield.local', password: 'bellfield-owner', label: 'Owner' },
  { email: 'admin@bellfield.local', password: 'bellfield-admin', label: 'Admin' },
  { email: 'dispatcher@bellfield.local', password: 'bellfield-dispatch', label: 'Dispatcher' }
];

export function OfficeAuthShell() {
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await loginToOfficeApi({
        email,
        password,
        deviceLabel: 'Office Browser',
        apiBaseUrl
      });

      setSessionToken(response.sessionToken);
      setEmployee(response.employee);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
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
          setSessionToken(null);
          setEmployee(null);
          setErrorMessage(null);
        }}
      />
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>Milestone foundation</div>
        <h1 style={styles.title}>BellField Office Sign In</h1>
        <p style={styles.muted}>
          This office shell now leads into employee, equipment, and jobs/appointments foundations using the same API
          session.
        </p>
        <form onSubmit={handleLogin} style={styles.form}>
          <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} style={styles.input} />
          <input value={email} onChange={(event) => setEmail(event.target.value)} style={styles.input} />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" style={styles.input} />
          <button type="submit" disabled={isSubmitting} style={styles.button}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div style={styles.demoList}>
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
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f1e8', color: '#1f2933', display: 'grid', fontFamily: 'Arial, sans-serif', placeItems: 'center', padding: '2rem' },
  card: { background: '#fffdf7', border: '1px solid #e5dcc8', borderRadius: 24, maxWidth: '34rem', padding: '2rem', width: '100%' },
  form: { display: 'grid', gap: '0.75rem', marginTop: '1rem' },
  input: { background: '#ffffff', border: '1px solid #d9c8ad', borderRadius: 14, fontSize: '1rem', padding: '0.85rem 1rem' },
  button: { background: '#1c6b57', border: 'none', borderRadius: 999, color: '#ffffff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, padding: '0.9rem 1.25rem' },
  demoList: { display: 'grid', gap: '0.5rem', marginTop: '1rem' },
  demoButton: { background: '#faf5e8', border: '1px solid #e6d6ba', borderRadius: 12, cursor: 'pointer', fontSize: '0.95rem', padding: '0.75rem 0.9rem', textAlign: 'left' },
  title: { fontSize: '2.2rem', lineHeight: 1.1, margin: '0 0 0.75rem' },
  kicker: { color: '#9a6b2f', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.14em', marginBottom: '0.75rem', textTransform: 'uppercase' },
  muted: { color: '#52606d', margin: 0 },
  error: { color: '#b42318', marginTop: '0.75rem' }
};
