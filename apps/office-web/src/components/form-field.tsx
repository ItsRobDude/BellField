'use client';

import type { CSSProperties, ReactNode } from 'react';
import { officeWorkspaceStyles as styles } from '@/modules/operations/office-workspace-styles';

type FormFieldProps = {
  /** Always visible; a placeholder is not a label once the field has a value. */
  label: string;
  /** The input, select, or textarea. It is wrapped by the label, so no ids are needed. */
  children: ReactNode;
  hint?: string;
  /** Shown under the control and announced to screen readers. */
  error?: string | null;
};

// The hint and error sit beside the label rather than inside it, so the control's accessible
// name stays exactly the label text.
const fieldStyle: CSSProperties = { display: 'grid', gap: '0.25rem' };

export function FormField({ label, children, hint, error }: FormFieldProps) {
  return (
    <div style={fieldStyle}>
      <label style={styles.fieldLabel}>
        <span>{label}</span>
        {children}
      </label>
      {hint ? <span style={styles.fieldHint}>{hint}</span> : null}
      {error ? (
        <span role="alert" style={styles.fieldError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
