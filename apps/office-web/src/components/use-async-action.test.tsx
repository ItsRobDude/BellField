import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncAction } from './use-async-action';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useAsyncAction', () => {
  it('ignores a second call while the first is still running', async () => {
    const pending = deferred();
    const action = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useAsyncAction(action));

    let first!: Promise<void>;
    act(() => {
      first = result.current.run();
      void result.current.run();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(true);

    await act(async () => {
      pending.resolve();
      await first;
    });

    expect(result.current.isBusy).toBe(false);

    await act(async () => {
      await result.current.run();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('passes arguments through and clears the busy flag when the action throws', async () => {
    const action = vi.fn(async (id: string) => {
      if (id === 'bad') {
        throw new Error('nope');
      }
    });
    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await result.current.run('good');
    });
    expect(action).toHaveBeenCalledWith('good');

    await expect(
      act(async () => {
        await result.current.run('bad');
      })
    ).rejects.toThrow('nope');
    expect(result.current.isBusy).toBe(false);
  });

  it('always runs the latest handler, not the one from the first render', async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const { result, rerender } = renderHook(({ action }) => useAsyncAction(action), {
      initialProps: { action: first }
    });

    rerender({ action: second });
    await act(async () => {
      await result.current.run();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
