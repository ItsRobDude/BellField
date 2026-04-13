'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  getCurrentOfficeSession,
  getOfficeEmployees,
  getOfficeRoles,
  loginToOfficeApi,
  updateOfficeEmployee,
  type EmployeeRoleId,
  type EmployeeSummary,
  type RoleTemplate
} from '@/lib/identity-api';

const plannedOfficeAreas = [
  'Dashboard',
  'Search',
  'Accounts',
  'Locations',
  'Jobs',
  'Dispatch',
  'Estimates',
  'Invoices',
  'Inventory',
  'Purchasing',
  'Reports',
  'Settings'
];

const demoAccounts = [
  { email: 'owner@bellfield.local', password: 'bellfield-owner', label: 'Owner' },
  { email: 'admin@bellfield.local', password: 'bellfield-admin', label: 'Admin' },
  { email: 'csr@bellfield.local', password: 'bellfield-csr', label: 'CSR' },
  { email: 'dispatcher@bellfield.local', password: 'bellfield-dispatch', label: 'Dispatcher' },
  { email: 'bookkeeping@bellfield.local', password: 'bellfield-books', label: 'Book Keeping' },
  { email: 'tech@bellfield.local', password: 'bellfield-tech', label: 'Technician' }
];

function hasEmployeeManagementAccess(employee: EmployeeSummary | null): boolean {
  return employee?.effectivePermissions.includes('employeesPermissions:view') ?? false;
}

export function OfficeAuthShell() {
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const roleLookup = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);

  async function refreshDashboard(activeSessionToken = sessionToken) {
    if (!activeSessionToken) {
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const currentSession = await getCurrentOfficeSession({ sessionToken: activeSessionToken, apiBaseUrl });
      setEmployee(currentSession.employee);

      const roleResponse = await getOfficeRoles({ sessionToken: activeSessionToken, apiBaseUrl });
      setRoles(roleResponse.roles);

      if (hasEmployeeManagementAccess(currentSession.employee)) {
        const employeeResponse = await getOfficeEmployees({ sessionToken: activeSessionToken, apiBaseUrl });
        setEmployees(employeeResponse.employees);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      setSessionToken(null);
      setEmployee(null);
      setEmployees([]);
      setRoles([]);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the current session.');
    } finally {
      setIsRefreshing(false);
    }
  }

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
      await refreshDashboard(response.sessionToken);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmployeeUpdate(employeeId: string, nextRoleId: EmployeeRoleId, nextIsActive: boolean) {
    if (!sessionToken) {
      return;
    }

    setErrorMessage(null);

    try {
      await updateOfficeEmployee({
        employeeId,
        roleId: nextRoleId,
        isActive: nextIsActive,
        sessionToken,
        apiBaseUrl
      });

      await refreshDashboard(sessionToken);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update employee.');
    }
  }

  if (!employee || !sessionToken) {
    return (
      <main style={styles.page}>
        <section style={styles.heroCard}>
          <span style={styles.kicker}>Milestone 1 foundation</span>
          <h1 style={styles.title}>BellField Office Sign In</h1>
          <p style={styles.subtitle}>
            This first pass wires the office shell to a real API-backed employee and role foundation.
            Sessions are currently in-memory so the shape is real even though persistence is still deferred.
          </p>
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>
              API base URL
              <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                style={styles.input}
              />
            </label>
            <button type="submit" disabled={isSubmitting} style={styles.primaryButton}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          {errorMessage ? <p style={styles.errorText}>{errorMessage}</p> : null}
          <section style={styles.demoCard}>
            <h2 style={styles.sectionTitle}>Demo accounts</h2>
            <ul style={styles.demoList}>
              {demoAccounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    style={styles.demoButton}
                  >
                    {account.label}: {account.email}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.heroCard}>
        <div style={styles.heroHeader}>
          <div>
            <span style={styles.kicker}>BellField Office</span>
            <h1 style={styles.title}>Welcome back, {employee.displayName}</h1>
            <p style={styles.subtitle}>
              Logged in as {employee.roleName}. This office shell now knows who the user is, what their role
              template grants, and whether they can manage employee access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSessionToken(null);
              setEmployee(null);
              setEmployees([]);
              setRoles([]);
              setErrorMessage(null);
            }}
            style={styles.secondaryButton}
          >
            Sign out
          </button>
        </div>
        <div style={styles.infoGrid}>
          <article style={styles.infoCard}>
            <h2 style={styles.sectionTitle}>Current session</h2>
            <p>{employee.email}</p>
            <p>Effective permissions: {employee.effectivePermissions.length}</p>
            <p>Session storage: in-memory foundation</p>
          </article>
          <article style={styles.infoCard}>
            <h2 style={styles.sectionTitle}>Planned office areas</h2>
            <ul style={styles.simpleList}>
              {plannedOfficeAreas.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          </article>
          <article style={styles.infoCard}>
            <h2 style={styles.sectionTitle}>Role templates</h2>
            <ul style={styles.simpleList}>
              {roles.map((role) => (
                <li key={role.id}>
                  {role.name}: {role.permissions.length} permissions
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {errorMessage ? <p style={styles.errorText}>{errorMessage}</p> : null}

      {hasEmployeeManagementAccess(employee) ? (
        <section style={styles.managementCard}>
          <div style={styles.heroHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Employee foundation</h2>
              <p style={styles.mutedText}>
                Owner and admin roles can review seeded employees, role assignments, and active status.
              </p>
            </div>
            <button type="button" onClick={() => void refreshDashboard()} style={styles.secondaryButton}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div style={styles.employeeGrid}>
            {employees.map((managedEmployee) => (
              <article key={managedEmployee.id} style={styles.employeeCard}>
                <div style={styles.employeeHeader}>
                  <div>
                    <h3 style={styles.employeeName}>{managedEmployee.displayName}</h3>
                    <p style={styles.mutedText}>{managedEmployee.email}</p>
                  </div>
                  <span style={managedEmployee.isActive ? styles.activePill : styles.inactivePill}>
                    {managedEmployee.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <label style={styles.label}>
                  Role template
                  <select
                    value={managedEmployee.roleId}
                    onChange={(event) =>
                      void handleEmployeeUpdate(
                        managedEmployee.id,
                        event.target.value as EmployeeRoleId,
                        managedEmployee.isActive
                      )
                    }
                    style={styles.select}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={managedEmployee.isActive}
                    onChange={(event) =>
                      void handleEmployeeUpdate(managedEmployee.id, managedEmployee.roleId, event.target.checked)
                    }
                  />
                  Employee can sign in
                </label>
                <p style={styles.mutedText}>
                  Role template description: {roleLookup.get(managedEmployee.roleId)?.description ?? 'Not available'}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section style={styles.managementCard}>
          <h2 style={styles.sectionTitle}>Employee management</h2>
          <p style={styles.mutedText}>
            Your current role does not include employee-permission viewing rights. This mirrors the backend
            permission foundation rather than only hiding the feature in the UI.
          </p>
        </section>
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f4f1e8 0%, #ffffff 52%)',
    color: '#1f2933',
    fontFamily: 'Arial, sans-serif',
    padding: '2rem'
  },
  heroCard: {
    background: '#fffdf7',
    border: '1px solid #e5dcc8',
    borderRadius: '24px',
    boxShadow: '0 24px 60px rgba(61, 52, 42, 0.08)',
    margin: '0 auto 1.5rem',
    maxWidth: '74rem',
    padding: '2rem'
  },
  heroHeader: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: '1rem',
    justifyContent: 'space-between'
  },
  kicker: {
    color: '#9a6b2f',
    display: 'inline-block',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.14em',
    marginBottom: '0.75rem',
    textTransform: 'uppercase'
  },
  title: {
    fontSize: '2.4rem',
    lineHeight: 1.1,
    margin: '0 0 0.75rem'
  },
  subtitle: {
    color: '#52606d',
    fontSize: '1rem',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '42rem'
  },
  form: {
    display: 'grid',
    gap: '1rem',
    marginTop: '1.5rem',
    maxWidth: '28rem'
  },
  label: {
    color: '#1f2933',
    display: 'grid',
    fontSize: '0.95rem',
    fontWeight: 600,
    gap: '0.45rem'
  },
  input: {
    background: '#ffffff',
    border: '1px solid #d9c8ad',
    borderRadius: '14px',
    fontSize: '1rem',
    padding: '0.85rem 1rem'
  },
  select: {
    background: '#ffffff',
    border: '1px solid #d9c8ad',
    borderRadius: '14px',
    fontSize: '0.95rem',
    padding: '0.75rem 0.9rem'
  },
  primaryButton: {
    background: '#1c6b57',
    border: 'none',
    borderRadius: '999px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 700,
    padding: '0.9rem 1.25rem'
  },
  secondaryButton: {
    background: '#ffffff',
    border: '1px solid #cdbfa6',
    borderRadius: '999px',
    color: '#1f2933',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 600,
    padding: '0.8rem 1rem'
  },
  demoCard: {
    borderTop: '1px solid #eee2cf',
    marginTop: '1.5rem',
    paddingTop: '1.25rem'
  },
  sectionTitle: {
    fontSize: '1.2rem',
    margin: '0 0 0.75rem'
  },
  demoList: {
    display: 'grid',
    gap: '0.5rem',
    listStyle: 'none',
    margin: 0,
    padding: 0
  },
  demoButton: {
    background: '#faf5e8',
    border: '1px solid #e6d6ba',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    padding: '0.75rem 0.9rem',
    textAlign: 'left',
    width: '100%'
  },
  infoGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
    marginTop: '1.5rem'
  },
  infoCard: {
    background: '#ffffff',
    border: '1px solid #ebdec6',
    borderRadius: '18px',
    padding: '1rem'
  },
  simpleList: {
    margin: 0,
    paddingInlineStart: '1.1rem'
  },
  managementCard: {
    background: '#ffffff',
    border: '1px solid #e3d7c0',
    borderRadius: '24px',
    margin: '0 auto',
    maxWidth: '74rem',
    padding: '1.75rem'
  },
  employeeGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
    marginTop: '1rem'
  },
  employeeCard: {
    background: '#fffdf9',
    border: '1px solid #eee2cf',
    borderRadius: '18px',
    display: 'grid',
    gap: '0.85rem',
    padding: '1rem'
  },
  employeeHeader: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: '1rem',
    justifyContent: 'space-between'
  },
  employeeName: {
    fontSize: '1rem',
    margin: '0 0 0.25rem'
  },
  checkboxLabel: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: 600
  },
  activePill: {
    background: '#e7f8ef',
    borderRadius: '999px',
    color: '#1f7a57',
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.35rem 0.65rem'
  },
  inactivePill: {
    background: '#fce8e6',
    borderRadius: '999px',
    color: '#9b2c2c',
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.35rem 0.65rem'
  },
  mutedText: {
    color: '#52606d',
    margin: 0
  },
  errorText: {
    color: '#b42318',
    margin: '1rem auto',
    maxWidth: '74rem'
  }
};
