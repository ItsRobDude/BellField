'use client';

import { useState, type ReactNode } from 'react';
import { officeWorkspaceStyles as styles } from '@/modules/operations/office-workspace-styles';
import { SubmitButton, type ButtonVariant } from './submit-button';
import { useAsyncAction } from './use-async-action';

type ConfirmPanelProps = {
  /** The question, e.g. "Post this invoice?" */
  title: string;
  /** What going ahead means, when that is not obvious from the question. */
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  isBusy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The confirmation itself: the question, what it means, and two buttons. `ConfirmAction` shows
 * it in place of its trigger; use it directly when the trigger is not a button (a status
 * select, or a server reply that asks before going on).
 */
export function ConfirmPanel({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  isBusy = false,
  busyLabel,
  onConfirm,
  onCancel
}: ConfirmPanelProps) {
  return (
    <div role="group" aria-label={title} style={styles.subpanel}>
      <strong>{title}</strong>
      {description ? <div style={styles.muted}>{description}</div> : null}
      <div style={styles.row}>
        <SubmitButton
          variant={confirmVariant}
          isBusy={isBusy}
          busyLabel={busyLabel}
          onClick={onConfirm}
        >
          {confirmLabel}
        </SubmitButton>
        <button type="button" style={styles.button} disabled={isBusy} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

type ConfirmActionProps = {
  /** The button the user sees first. */
  label: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  'aria-label'?: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busyLabel?: string;
  /** Runs once the user confirms; the confirm button is busy until it settles. */
  onConfirm: () => Promise<unknown> | unknown;
};

/**
 * A button for a money-moving or destructive action. It asks first, in the app's own style and
 * right where the user clicked, instead of the browser's "localhost says…" dialog. The action
 * runs at most once while in flight, and the question closes when it settles.
 */
export function ConfirmAction({
  label,
  variant = 'secondary',
  disabled = false,
  'aria-label': ariaLabel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busyLabel,
  onConfirm
}: ConfirmActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const confirm = useAsyncAction(async () => {
    try {
      await onConfirm();
    } finally {
      setIsOpen(false);
    }
  });

  if (!isOpen) {
    return (
      <SubmitButton
        variant={variant}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setIsOpen(true)}
      >
        {label}
      </SubmitButton>
    );
  }

  return (
    <ConfirmPanel
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmVariant={variant === 'secondary' ? 'primary' : variant}
      isBusy={confirm.isBusy}
      busyLabel={busyLabel}
      onConfirm={() => void confirm.run()}
      onCancel={() => setIsOpen(false)}
    />
  );
}
