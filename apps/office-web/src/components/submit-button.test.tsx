import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubmitButton } from './submit-button';

describe('SubmitButton', () => {
  it('shows the busy label, disables itself, and swallows clicks while busy', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <SubmitButton onClick={onClick} busyLabel="Creating…">
        Create customer
      </SubmitButton>
    );

    const button = screen.getByRole('button', { name: 'Create customer' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <SubmitButton onClick={onClick} busyLabel="Creating…" isBusy>
        Create customer
      </SubmitButton>
    );

    const busyButton = screen.getByRole('button', { name: 'Creating…' });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busyButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('stays disabled when the caller disables it and keeps the submit type when asked', () => {
    render(
      <SubmitButton type="submit" disabled variant="danger">
        Delete
      </SubmitButton>
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).not.toHaveAttribute('aria-busy');
  });
});
