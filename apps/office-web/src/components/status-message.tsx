'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { officeWorkspaceStyles as styles } from '@/modules/operations/office-workspace-styles';

export type StatusMessageKind = 'notice' | 'warning' | 'error';

type StatusMessageProps = {
  kind: StatusMessageKind;
  message: string | null | undefined;
  /** Runs when the user dismisses the message, or when a notice dismisses itself. */
  onDismiss: () => void;
  /** Notices clear themselves after this long; warnings and errors stay until dismissed. */
  autoDismissMs?: number;
};

const noticeAutoDismissMs = 6_000;

const boxStyles: Record<StatusMessageKind, CSSProperties> = {
  notice: styles.notice,
  warning: styles.warning,
  error: styles.errorBox
};

const rowStyle: CSSProperties = {
  alignItems: 'start',
  display: 'flex',
  gap: '0.75rem',
  justifyContent: 'space-between'
};

const dismissStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 800,
  padding: 0
};

/**
 * One message box for the outcome of an action, rendered where the action happened. A notice
 * ("Invoice posted.") goes away on its own; a warning or error stays until the user dismisses it
 * or the next action replaces it, so nothing that needs reading can vanish underneath them.
 */
export function StatusMessage({ kind, message, onDismiss, autoDismissMs }: StatusMessageProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dismissAfterMs = autoDismissMs ?? (kind === 'notice' ? noticeAutoDismissMs : 0);

  useEffect(() => {
    if (!message || dismissAfterMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => onDismissRef.current(), dismissAfterMs);
    return () => window.clearTimeout(timer);
  }, [message, dismissAfterMs]);

  if (!message) {
    return null;
  }

  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ ...boxStyles[kind], ...rowStyle }}>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" style={dismissStyle} onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
