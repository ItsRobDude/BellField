import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyOfficeUnauthorized, setOfficeUnauthorizedListener } from './office-session-events';

afterEach(() => {
  setOfficeUnauthorizedListener(null);
});

describe('office session events', () => {
  it('delivers unauthorized notices to the registered listener only', () => {
    const listener = vi.fn();

    notifyOfficeUnauthorized('nobody listening');
    setOfficeUnauthorizedListener(listener);
    notifyOfficeUnauthorized('Session expired. Please sign in again.');
    setOfficeUnauthorizedListener(null);
    notifyOfficeUnauthorized('after unregister');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('Session expired. Please sign in again.');
  });
});
