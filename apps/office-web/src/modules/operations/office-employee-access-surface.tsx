'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  getEmployeeDetail,
  getOfficeEmployees,
  type EmployeeAdminDetailResponse,
  type EmployeeSummary
} from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeEmployeeAccessSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
};

const layoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 280px) 1fr',
  gap: 16,
  marginTop: 12,
  alignItems: 'start'
};
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const listRowStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #dfe6df',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  textAlign: 'left'
};
const listRowActiveStyle: CSSProperties = {
  ...listRowStyle,
  // Override the full `border` shorthand (not borderColor) — mixing shorthand + longhand triggers
  // React's "removing a style property during rerender" warning when the selection toggles.
  border: '1px solid #176b5b',
  background: '#eef6f3'
};
const listRowSubStyle: CSSProperties = { fontSize: 12, color: '#5b6672', marginTop: 2 };
const sectionStyle: CSSProperties = { marginTop: 16 };
const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: '#5b6672',
  fontWeight: 700,
  marginBottom: 6
};
const badgeStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 10,
  padding: '1px 8px'
};
const activeBadge: CSSProperties = { ...badgeStyle, color: '#176b5b', background: '#e3f3ee' };
const inactiveBadge: CSSProperties = { ...badgeStyle, color: '#8a5a00', background: '#fdf2dc' };
const chipBase: CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  borderRadius: 8,
  padding: '1px 8px',
  margin: '0 4px 4px 0'
};
const grantChip: CSSProperties = { ...chipBase, color: '#176b5b', background: '#e3f3ee' };
const revokeChip: CSSProperties = { ...chipBase, color: '#b42318', background: '#fbe9e7' };
const areaGroupStyle: CSSProperties = { marginBottom: 8 };
const areaNameStyle: CSSProperties = { fontWeight: 600, fontSize: 13 };
const actionListStyle: CSSProperties = { color: '#33455c', fontSize: 13 };

/** Group `area:action` permission keys by area, returning sorted actions per area. */
function groupByArea(keys: string[]): Array<{ area: string; actions: string[] }> {
  const groups = new Map<string, string[]>();
  for (const key of [...keys].sort()) {
    const [area, action] = key.split(':');
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(action ?? key);
  }
  return [...groups.entries()].map(([area, actions]) => ({ area, actions }));
}

function overrideCount(employee: EmployeeSummary): number {
  return (
    employee.permissionOverrides.grantedPermissions.length +
    employee.permissionOverrides.revokedPermissions.length
  );
}

// Top-level Employees surface (M10 slice 4D). Read path: list + detail + effective permissions +
// overrides (read-only) + device sessions. Gated employeesPermissions:view. Mutations land in 4D-ii.
export function OfficeEmployeeAccessSurface({
  apiBaseUrl,
  sessionToken
}: OfficeEmployeeAccessSurfaceProps) {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeAdminDetailResponse | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsListLoading(true);
    setErrorMessage(null);
    getOfficeEmployees({ apiBaseUrl, sessionToken })
      .then((result) => {
        if (active) setEmployees(result.employees);
      })
      .catch((error) => {
        if (active)
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load employees.');
      })
      .finally(() => {
        if (active) setIsListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    // Clear any previously-shown detail immediately so a stale employee can never linger while the
    // new one loads — or if its load fails.
    setDetail(null);
    if (!selectedId) {
      return;
    }
    let active = true;
    setIsDetailLoading(true);
    setErrorMessage(null);
    getEmployeeDetail({ employeeId: selectedId, apiBaseUrl, sessionToken })
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((error) => {
        if (active) {
          setDetail(null);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load employee.');
        }
      })
      .finally(() => {
        if (active) setIsDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, apiBaseUrl, sessionToken]);

  return (
    <section style={styles.workspacePanel} aria-label="Employees">
      <h1 style={styles.heading}>Employees</h1>
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      <div style={layoutStyle}>
        <div style={listStyle}>
          {isListLoading ? (
            <p style={styles.notice}>Loading…</p>
          ) : employees.length === 0 ? (
            <p style={styles.notice}>No employees.</p>
          ) : (
            employees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                aria-pressed={employee.id === selectedId}
                style={employee.id === selectedId ? listRowActiveStyle : listRowStyle}
                onClick={() => setSelectedId(employee.id)}
              >
                <div style={{ fontWeight: 600 }}>{employee.displayName}</div>
                <div style={listRowSubStyle}>
                  {employee.roleName} · {employee.isActive ? 'Active' : 'Inactive'} ·{' '}
                  {overrideCount(employee)} override{overrideCount(employee) === 1 ? '' : 's'}
                </div>
              </button>
            ))
          )}
        </div>

        <div>
          {!selectedId ? (
            <p style={styles.notice}>Select an employee to view their access.</p>
          ) : isDetailLoading ? (
            <p style={styles.notice}>Loading…</p>
          ) : detail ? (
            <EmployeeDetailView detail={detail} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EmployeeDetailView({ detail }: { detail: EmployeeAdminDetailResponse }) {
  const { employee, sessions } = detail;
  const granted = [...employee.permissionOverrides.grantedPermissions].sort();
  const revoked = [...employee.permissionOverrides.revokedPermissions].sort();

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1.05rem' }}>{employee.displayName}</h2>
        <span style={employee.isActive ? activeBadge : inactiveBadge}>
          {employee.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div style={listRowSubStyle}>
        {employee.email} · {employee.roleName}
      </div>

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Permission overrides</div>
        {granted.length === 0 && revoked.length === 0 ? (
          <p style={styles.notice}>
            No overrides — this employee uses the {employee.roleName} role.
          </p>
        ) : (
          <div>
            {granted.map((key) => (
              <span key={`g:${key}`} style={grantChip}>
                + {key}
              </span>
            ))}
            {revoked.map((key) => (
              <span key={`r:${key}`} style={revokeChip}>
                − {key}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Effective permissions</div>
        {groupByArea(employee.effectivePermissions).map(({ area, actions }) => (
          <div key={area} style={areaGroupStyle}>
            <span style={areaNameStyle}>{area}</span>{' '}
            <span style={actionListStyle}>{actions.join(', ')}</span>
          </div>
        ))}
      </div>

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Device sessions</div>
        {sessions.length === 0 ? (
          <p style={styles.notice}>No active sessions.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Device</th>
                <th style={styles.tableHeadCell}>Surface</th>
                <th style={styles.tableHeadCell}>Signed in</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td style={styles.tableCell}>{session.deviceLabel ?? '—'}</td>
                  <td style={styles.tableCell}>{session.surface}</td>
                  <td style={styles.tableCell}>{new Date(session.issuedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
