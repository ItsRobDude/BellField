import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusMessage } from './status-message';

describe('StatusMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing without a message', () => {
    const { container } = render(
      <StatusMessage kind="notice" message={null} onDismiss={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a notice that the user can dismiss and that dismisses itself', () => {
    const onDismiss = vi.fn();
    render(<StatusMessage kind="notice" message="Invoice posted." onDismiss={onDismiss} />);

    expect(screen.getByRole('status')).toHaveTextContent('Invoice posted.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('keeps an error until the user dismisses it', () => {
    const onDismiss = vi.fn();
    render(<StatusMessage kind="error" message="Unable to post." onDismiss={onDismiss} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to post.');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('restarts the clock when the notice text changes and calls the latest handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <StatusMessage kind="notice" message="Saved." onDismiss={first} autoDismissMs={1_000} />
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender(
      <StatusMessage
        kind="notice"
        message="Saved again."
        onDismiss={second}
        autoDismissMs={1_000}
      />
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
