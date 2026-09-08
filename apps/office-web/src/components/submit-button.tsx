'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { officeWorkspaceStyles as styles } from '@/modules/operations/office-workspace-styles';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

type SubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'children'> & {
  /** While true the button is disabled and shows `busyLabel`, so a second click cannot land. */
  isBusy?: boolean;
  busyLabel?: string;
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantStyles = {
  primary: styles.primaryButton,
  secondary: styles.button,
  danger: styles.dangerButton
};

/**
 * The button for anything that writes. Pair it with `useAsyncAction` so the same handler
 * cannot run twice: two fast clicks on a plain button created two customers.
 */
export function SubmitButton({
  isBusy = false,
  busyLabel = 'Saving…',
  variant = 'primary',
  disabled = false,
  type = 'button',
  children,
  ...buttonProps
}: SubmitButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      aria-busy={isBusy || undefined}
      disabled={disabled || isBusy}
      style={variantStyles[variant]}
    >
      {isBusy ? busyLabel : children}
    </button>
  );
}
