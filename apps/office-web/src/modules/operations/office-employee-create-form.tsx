'use client';

import { useState, type CSSProperties } from 'react';
import {
  createOfficeEmployee,
  type EmployeeRoleId,
  type EmployeeSummary,
  type RoleTemplate
} from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

const minimumPasswordLength = 12;
const passwordMinimumCopy = 'At least 12 characters.';

export type OfficeEmployeeCreateFormProps = {
  roles: RoleTemplate[];
  actorRoleId: EmployeeRoleId;
  apiBaseUrl: string;
  sessionToken: string;
  onCreated: (employee: EmployeeSummary) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
};

const panelStyle: CSSProperties = {
  border: '1px solid #dfe6df',
  borderRadius: 8,
  padding: 16,
  marginTop: 12,
  maxWidth: 520
};
const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 10
};
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: '#33455c' };
const inputStyle: CSSProperties = {
  border: '1px solid #cdd6cd',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13
};
const noteStyle: CSSProperties = { fontSize: 12, color: '#8a5a00' };
const rowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 };

export function OfficeEmployeeCreateForm({
  roles,
  actorRoleId,
  apiBaseUrl,
  sessionToken,
  onCreated,
  onCancel,
  onError
}: OfficeEmployeeCreateFormProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleId, setRoleId] = useState<EmployeeRoleId>(
    roles.find((role) => role.id !== 'owner')?.id ?? roles[0]?.id ?? 'csr'
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const hasRoleOptions = roles.length > 0;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const tooShort = password.length < minimumPasswordLength;
  const mismatch = password !== confirm;
  const submitDisabled =
    isCreating ||
    !hasRoleOptions ||
    !emailValid ||
    displayName.trim().length === 0 ||
    tooShort ||
    mismatch;

  async function handleCreate() {
    onError(null);
    setIsCreating(true);
    try {
      const created = await createOfficeEmployee({
        sessionToken,
        apiBaseUrl,
        email: email.trim(),
        displayName: displayName.trim(),
        roleId,
        password,
        isActive
      });
      onCreated(created);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to create employee.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section style={panelStyle} aria-label="Create employee">
      <h2 style={{ ...styles.heading, fontSize: '1.05rem' }}>New employee</h2>

      {!hasRoleOptions ? (
        <p style={noteStyle}>
          Role reference data isn&apos;t loaded yet — close and reopen this form to try again.
        </p>
      ) : null}

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="new-employee-email">
          Email
        </label>
        <input
          id="new-employee-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="new-employee-name">
          Display name
        </label>
        <input
          id="new-employee-name"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="new-employee-role">
          Role
        </label>
        <select
          id="new-employee-role"
          value={roleId}
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
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="new-employee-password">
          Temporary password
        </label>
        <input
          id="new-employee-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="new-employee-confirm">
          Confirm password
        </label>
        <input
          id="new-employee-confirm"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          style={inputStyle}
        />
      </div>

      <label style={labelStyle}>
        <input
          type="checkbox"
          aria-label="Active"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />{' '}
        Active
      </label>

      <div style={rowStyle}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={submitDisabled}
          onClick={handleCreate}
        >
          {isCreating ? 'Creating…' : 'Create employee'}
        </button>
        <button type="button" style={styles.button} onClick={onCancel}>
          Cancel
        </button>
        {password.length > 0 && tooShort ? (
          <span style={noteStyle}>{passwordMinimumCopy}</span>
        ) : confirm.length > 0 && mismatch ? (
          <span style={noteStyle}>Passwords don&apos;t match.</span>
        ) : null}
      </div>
    </section>
  );
}
