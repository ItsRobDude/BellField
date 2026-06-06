'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  getEmployeeDetail,
  getOfficeEmployees,
  getOfficeRoles,
  type EmployeeAdminDetailResponse,
  type EmployeeRoleId,
  type EmployeeSummary,
  type RoleTemplate
} from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { OfficeEmployeeDetailPanel } from './office-employee-detail-panel';
import { OfficeEmployeeCreateForm } from './office-employee-create-form';

export type OfficeEmployeeAccessSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canConfigure: boolean;
  canCreate: boolean;
  actorId: string;
  actorRoleId: EmployeeRoleId;
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

function overrideCount(employee: EmployeeSummary): number {
  return (
    employee.permissionOverrides.grantedPermissions.length +
    employee.permissionOverrides.revokedPermissions.length
  );
}

// Top-level Employees surface (M10 slice 4D). 4D-i added the read path; 4D-ii adds the mutations
// (role/active/override save, password reset, session revoke, create) — all gated and with the server
// authoritative for every guard.
export function OfficeEmployeeAccessSurface({
  apiBaseUrl,
  sessionToken,
  canConfigure,
  canCreate,
  actorId,
  actorRoleId
}: OfficeEmployeeAccessSurfaceProps) {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeAdminDetailResponse | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsListLoading(true);
    setErrorMessage(null);
    Promise.all([
      getOfficeEmployees({ apiBaseUrl, sessionToken }),
      getOfficeRoles({ apiBaseUrl, sessionToken })
    ])
      .then(([employeeResult, roleResult]) => {
        if (active) {
          setEmployees(employeeResult.employees);
          setRoles(roleResult.roles);
        }
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

  // Reload the list (and the open detail) after a mutation so the UI reflects the server state.
  const reload = useCallback(async () => {
    try {
      const employeeResult = await getOfficeEmployees({ apiBaseUrl, sessionToken });
      setEmployees(employeeResult.employees);
      if (selectedId) {
        setDetail(await getEmployeeDetail({ employeeId: selectedId, apiBaseUrl, sessionToken }));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh employees.');
    }
  }, [apiBaseUrl, sessionToken, selectedId]);

  return (
    <section style={styles.workspacePanel} aria-label="Employees">
      <div style={styles.row}>
        <h1 style={styles.heading}>Employees</h1>
        {canCreate && !isCreating ? (
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => {
              setIsCreating(true);
              setErrorMessage(null);
            }}
          >
            New employee
          </button>
        ) : null}
      </div>
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
                aria-pressed={employee.id === selectedId && !isCreating}
                style={
                  employee.id === selectedId && !isCreating ? listRowActiveStyle : listRowStyle
                }
                onClick={() => {
                  setIsCreating(false);
                  setSelectedId(employee.id);
                }}
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
          {isCreating ? (
            <OfficeEmployeeCreateForm
              roles={roles}
              actorRoleId={actorRoleId}
              apiBaseUrl={apiBaseUrl}
              sessionToken={sessionToken}
              onError={setErrorMessage}
              onCancel={() => setIsCreating(false)}
              onCreated={async (created) => {
                setIsCreating(false);
                await reload();
                setSelectedId(created.id);
              }}
            />
          ) : !selectedId ? (
            <p style={styles.notice}>Select an employee to view their access.</p>
          ) : isDetailLoading ? (
            <p style={styles.notice}>Loading…</p>
          ) : detail ? (
            <OfficeEmployeeDetailPanel
              detail={detail}
              roles={roles}
              canConfigure={canConfigure}
              actorId={actorId}
              actorRoleId={actorRoleId}
              apiBaseUrl={apiBaseUrl}
              sessionToken={sessionToken}
              onChanged={reload}
              onError={setErrorMessage}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
