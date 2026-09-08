import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmAction, ConfirmPanel } from './confirm-action';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ConfirmAction', () => {
  it('asks in place of the button and only acts once the user confirms', async () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <ConfirmAction
        label="Post invoice"
        variant="primary"
        title="Post this invoice?"
        description="Once posted it can no longer be edited."
        confirmLabel="Post it"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Post invoice' }));

    const question = screen.getByRole('group', { name: 'Post this invoice?' });
    expect(question).toHaveTextContent('Once posted it can no longer be edited.');
    expect(screen.queryByRole('button', { name: 'Post invoice' })).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Post invoice' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Post invoice' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Post it' }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Post invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('runs the action once while it is in flight and shows the busy label', async () => {
    const pending = deferred();
    const onConfirm = vi.fn(() => pending.promise);
    render(
      <ConfirmAction
        label="Remove"
        variant="danger"
        title="Remove this line?"
        confirmLabel="Remove line"
        busyLabel="Removing…"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove line' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Removing…' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('keeps a disabled trigger disabled and carries its accessible name', () => {
    render(
      <ConfirmAction
        label="Revoke"
        aria-label="Revoke session s1"
        disabled
        title="Revoke this session?"
        confirmLabel="Revoke session"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Revoke session s1' })).toBeDisabled();
  });
});

describe('ConfirmPanel', () => {
  it('renders the question with its two choices for callers that own the trigger', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmPanel
        title="Cancel this appointment?"
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        confirmVariant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep appointment' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Cancel this appointment?' })).toBeInTheDocument();
  });
});
