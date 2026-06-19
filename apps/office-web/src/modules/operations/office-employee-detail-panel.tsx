'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  resetOfficeEmployeePassword,
  revokeOfficeEmployeeSession,
  updateOfficeEmployee,
  type EmployeeAdminDetailResponse,
  type EmployeeRoleId,
  type PermissionKey,
  type RoleTemplate
} from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  computeEffectivePermissions,
  groupByArea,
  pickablePermissionKeys
} from './office-employee-permissions';

const minimumPasswordLength = 12;
const passwordMinimumCopy = 'At least 12 characters.';

export type OfficeEmployeeDetailPanelProps = {
  detail: EmployeeAdminDetailResponse;
  roles: RoleTemplate[];
  canConfigure: boolean;
  actorId: string;
  actorRoleId: EmployeeRoleId;
  apiBaseUrl: string;
  sessionToken: string;
  /** Reload the list + this detail after a successful mutation. */
  onChanged: () => void;
  onError: (message: string | null) => void;
};

const sectionStyle: CSSProperties = { marginTop: 16 };
const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: '#5b6672',
  fontWeight: 700,
  marginBottom: 6
};
const listRowSubStyle: CSSProperties = { fontSize: 12, color: '#5b6672', marginTop: 2 };
const badgeStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 10,
  padding: '1px 8px'
};
const activeBadge: CSSProperties = { ...badgeStyle, color: '#176b5b', background: '#e3f3ee' };
const inactiveBadge: CSSProperties = { ...badgeStyle, color: '#8a5a00', background: '#fdf2dc' };
const fieldRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap'
};
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: '#33455c' };
const inputStyle: CSSProperties = {
  border: '1px solid #cdd6cd',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13
};
const chipBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  borderRadius: 8,
  padding: '1px 6px 1px 8px',
  margin: '0 4px 4px 0'
};
const grantChip: CSSProperties = { ...chipBase, color: '#176b5b', background: '#e3f3ee' };
const revokeChip: CSSProperties = { ...chipBase, color: '#b42318', background: '#fbe9e7' };
const chipRemoveStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  color: 'inherit'
};
const areaGroupStyle: CSSProperties = { marginBottom: 8 };
const noteStyle: CSSProperties = { ...listRowSubStyle, color: '#8a5a00' };

function sameKeys(left: PermissionKey[], right: PermissionKey[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function OfficeEmployeeDetailPanel({
  detail,
  roles,
  canConfigure,
  actorId,
  actorRoleId,
  apiBaseUrl,
  sessionToken,
  onChanged,
  onError
}: OfficeEmployeeDetailPanelProps) {
  const { employee, sessions } = detail;
  const isSelf = actorId === employee.id;
  const ownerProtected = employee.roleId === 'owner' && actorRoleId !== 'owner';
  const mutationsAllowed = canConfigure && !ownerProtected;

  const [roleId, setRoleId] = useState<EmployeeRoleId>(employee.roleId);
  const [isActive, setIsActive] = useState(employee.isActive);
  const [granted, setGranted] = useState<PermissionKey[]>(
    employee.permissionOverrides.grantedPermissions
  );
  const [revoked, setRevoked] = useState<PermissionKey[]>(
    employee.permissionOverrides.revokedPermissions
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Reset the draft whenever a different employee (or a refreshed copy) loads.
  useEffect(() => {
    setRoleId(employee.roleId);
    setIsActive(employee.isActive);
    setGranted(employee.permissionOverrides.grantedPermissions);
    setRevoked(employee.permissionOverrides.revokedPermissions);
    setSavedNotice(null);
  }, [employee]);

  const pickable = useMemo(() => pickablePermissionKeys(roles), [roles]);
  const rolePermissions = useMemo(
    () => roles.find((role) => role.id === roleId)?.permissions ?? [],
    [roles, roleId]
  );

  const isDirty =
    roleId !== employee.roleId ||
    isActive !== employee.isActive ||
    !sameKeys(granted, employee.permissionOverrides.grantedPermissions) ||
    !sameKeys(revoked, employee.permissionOverrides.revokedPermissions);

  // Self-protection: don't let the actor strip their own employee-management authority.
  const selfWouldLoseConfigure =
    isSelf &&
    !computeEffectivePermissions(rolePermissions, granted, revoked).has(
      'employeesPermissions:configure'
    );

  const saveDisabled =
    !mutationsAllowed || !isDirty || isSaving || (isSelf && (!isActive || selfWouldLoseConfigure));

  async function handleSave() {
    onError(null);
    setSavedNotice(null);
    setIsSaving(true);
    try {
      await updateOfficeEmployee({
        employeeId: employee.id,
        sessionToken,
        apiBaseUrl,
        roleId,
        isActive,
        grantedPermissions: granted,
        revokedPermissions: revoked
      });
      setSavedNotice('Saved.');
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to save changes.');
    } finally {
      setIsSaving(false);
    }
  }

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

      {ownerProtected ? (
        <p style={noteStyle}>Only an owner can modify another owner.</p>
      ) : !canConfigure ? (
        <p style={noteStyle}>You have view-only access to employees.</p>
      ) : null}

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Role &amp; status</div>
        <div style={fieldRowStyle}>
          <label style={labelStyle}>
            Role{' '}
            <select
              aria-label="Role"
              value={roleId}
              disabled={!mutationsAllowed}
              onChange={(event) => setRoleId(event.target.value as EmployeeRoleId)}
              style={inputStyle}
            >
              {roles.map((role) => (
                <option
                  key={role.id}
                  value={role.id}
                  disabled={role.id === 'owner' && actorRoleId !== 'owner'}
                >
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <input
              type="checkbox"
              aria-label="Active"
              checked={isActive}
              disabled={!mutationsAllowed || isSelf}
              onChange={(event) => setIsActive(event.target.checked)}
            />{' '}
            Active
          </label>
        </div>
        {isSelf ? (
          <p style={noteStyle}>
            You can&apos;t deactivate or remove the access of your own account.
          </p>
        ) : null}
      </div>

      <OverridesEditor
        granted={granted}
        revoked={revoked}
        pickable={pickable}
        disabled={!mutationsAllowed}
        onChange={(next) => {
          setGranted(next.granted);
          setRevoked(next.revoked);
        }}
      />

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Effective permissions</div>
        {groupByArea([...computeEffectivePermissions(rolePermissions, granted, revoked)]).map(
          ({ area, actions }) => (
            <div key={area} style={areaGroupStyle}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{area}</span>{' '}
              <span style={{ color: '#33455c', fontSize: 13 }}>{actions.join(', ')}</span>
            </div>
          )
        )}
      </div>

      {mutationsAllowed ? (
        <div style={sectionStyle}>
          <div style={fieldRowStyle}>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={saveDisabled}
              onClick={handleSave}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
            {savedNotice ? <span style={styles.notice}>{savedNotice}</span> : null}
          </div>
        </div>
      ) : null}

      {mutationsAllowed ? (
        <PasswordResetPanel
          employeeId={employee.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}

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
                {mutationsAllowed ? <th style={styles.tableHeadCell} /> : null}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td style={styles.tableCell}>{session.deviceLabel ?? '—'}</td>
                  <td style={styles.tableCell}>{session.surface}</td>
                  <td style={styles.tableCell}>{new Date(session.issuedAt).toLocaleString()}</td>
                  {mutationsAllowed ? (
                    <td style={styles.tableCell}>
                      <SessionRevokeButton
                        employeeId={employee.id}
                        sessionId={session.id}
                        apiBaseUrl={apiBaseUrl}
                        sessionToken={sessionToken}
                        onChanged={onChanged}
                        onError={onError}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OverridesEditor({
  granted,
  revoked,
  pickable,
  disabled,
  onChange
}: {
  granted: PermissionKey[];
  revoked: PermissionKey[];
  pickable: PermissionKey[];
  disabled: boolean;
  onChange: (next: { granted: PermissionKey[]; revoked: PermissionKey[] }) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('');

  const filtered = useMemo(
    () => pickable.filter((key) => key.toLowerCase().includes(search.trim().toLowerCase())),
    [pickable, search]
  );
  const grouped = useMemo(() => groupByArea(filtered), [filtered]);

  function addOverride(kind: 'grant' | 'revoke') {
    if (!selected) return;
    const key = selected as PermissionKey;
    // A key can be granted XOR revoked — adding to one clears it from the other.
    const nextGranted = granted.filter((value) => value !== key);
    const nextRevoked = revoked.filter((value) => value !== key);
    if (kind === 'grant') nextGranted.push(key);
    else nextRevoked.push(key);
    onChange({ granted: nextGranted, revoked: nextRevoked });
  }

  function removeOverride(key: PermissionKey) {
    onChange({
      granted: granted.filter((value) => value !== key),
      revoked: revoked.filter((value) => value !== key)
    });
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Permission overrides</div>
      {!disabled ? (
        <div style={fieldRowStyle}>
          <input
            type="search"
            aria-label="Search permissions"
            placeholder="Search permissions…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={inputStyle}
          />
          <select
            aria-label="Permission to override"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select a permission…</option>
            {grouped.map(({ area, actions }) => (
              <optgroup key={area} label={area}>
                {actions.map((action) => (
                  <option key={`${area}:${action}`} value={`${area}:${action}`}>
                    {area}:{action}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            style={styles.button}
            disabled={!selected}
            onClick={() => addOverride('grant')}
          >
            Grant
          </button>
          <button
            type="button"
            style={styles.button}
            disabled={!selected}
            onClick={() => addOverride('revoke')}
          >
            Revoke
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        {granted.length === 0 && revoked.length === 0 ? (
          <p style={styles.notice}>No overrides — this employee uses their role defaults.</p>
        ) : (
          <div>
            {[...granted].sort().map((key) => (
              <span key={`g:${key}`} style={grantChip}>
                + {key}
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={`Remove override ${key}`}
                    style={chipRemoveStyle}
                    onClick={() => removeOverride(key)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {[...revoked].sort().map((key) => (
              <span key={`r:${key}`} style={revokeChip}>
                − {key}
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={`Remove override ${key}`}
                    style={chipRemoveStyle}
                    onClick={() => removeOverride(key)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordResetPanel({
  employeeId,
  apiBaseUrl,
  sessionToken,
  onChanged,
  onError
}: {
  employeeId: string;
  apiBaseUrl: string;
  sessionToken: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const tooShort = password.length < minimumPasswordLength;
  const mismatch = password !== confirm;
  const submitDisabled = isResetting || tooShort || mismatch;

  async function handleReset() {
    onError(null);
    setNotice(null);
    setIsResetting(true);
    try {
      const result = await resetOfficeEmployeePassword({
        employeeId,
        sessionToken,
        apiBaseUrl,
        password
      });
      setPassword('');
      setConfirm('');
      setOpen(false);
      setNotice(`Password reset. Revoked ${result.revokedSessionCount} session(s).`);
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Password</div>
      {notice ? <p style={styles.notice}>{notice}</p> : null}
      {!open ? (
        <button type="button" style={styles.button} onClick={() => setOpen(true)}>
          Reset password
        </button>
      ) : (
        <div style={fieldRowStyle}>
          <label style={labelStyle}>
            New password{' '}
            <input
              type="password"
              aria-label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Confirm{' '}
            <input
              type="password"
              aria-label="Confirm new password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            style={styles.primaryButton}
            disabled={submitDisabled}
            onClick={handleReset}
          >
            {isResetting ? 'Resetting…' : 'Reset password'}
          </button>
          <button
            type="button"
            style={styles.button}
            onClick={() => {
              setOpen(false);
              setPassword('');
              setConfirm('');
            }}
          >
            Cancel
          </button>
          {password.length > 0 && tooShort ? (
            <span style={noteStyle}>{passwordMinimumCopy}</span>
          ) : confirm.length > 0 && mismatch ? (
            <span style={noteStyle}>Passwords don&apos;t match.</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SessionRevokeButton({
  employeeId,
  sessionId,
  apiBaseUrl,
  sessionToken,
  onChanged,
  onError
}: {
  employeeId: string;
  sessionId: string;
  apiBaseUrl: string;
  sessionToken: string;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [isRevoking, setIsRevoking] = useState(false);

  async function handleRevoke() {
    // Revoking is destructive (the actor can be looking at their own sessions) — confirm first.
    if (!window.confirm('Revoke this session? The employee will need to sign in again.')) {
      return;
    }
    onError(null);
    setIsRevoking(true);
    try {
      await revokeOfficeEmployeeSession({ employeeId, sessionId, sessionToken, apiBaseUrl });
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to revoke session.');
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={`Revoke session ${sessionId}`}
      style={styles.button}
      disabled={isRevoking}
      onClick={handleRevoke}
    >
      {isRevoking ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
