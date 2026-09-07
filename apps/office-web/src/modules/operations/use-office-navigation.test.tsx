import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOfficeNavigation } from './use-office-navigation';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useOfficeNavigation', () => {
  it('reads the current browser location as a route', () => {
    window.history.replaceState(null, '', '/jobs/job-1/invoice');

    const { result } = renderHook(() => useOfficeNavigation());

    expect(result.current.location).toBe('/jobs/job-1/invoice');
    expect(result.current.route).toEqual({
      view: 'jobDetail',
      jobId: 'job-1',
      tab: 'invoice',
      appointmentId: null
    });
  });

  it('pushes a history entry that remembers where it came from', () => {
    const { result } = renderHook(() => useOfficeNavigation());

    act(() => {
      result.current.navigate({ view: 'jobs' });
    });

    expect(window.location.pathname).toBe('/jobs');
    expect(result.current.route).toEqual({ view: 'jobs' });
    expect(window.history.state).toEqual({ officeNavigation: { fromLocation: '/' } });
  });

  it('replaces the current entry without losing its origin marker', () => {
    const { result } = renderHook(() => useOfficeNavigation());

    act(() => {
      result.current.navigate({
        view: 'jobDetail',
        jobId: 'job-1',
        tab: 'overview',
        appointmentId: null
      });
      result.current.navigate(
        { view: 'jobDetail', jobId: 'job-1', tab: 'invoice', appointmentId: null },
        { replace: true }
      );
    });

    expect(window.location.pathname).toBe('/jobs/job-1/invoice');
    expect(window.history.state).toEqual({ officeNavigation: { fromLocation: '/' } });
  });

  it('ignores navigation to the location already shown', () => {
    const { result } = renderHook(() => useOfficeNavigation());
    const pushCount = window.history.length;

    act(() => {
      result.current.navigate({ view: 'dispatch', date: null });
      result.current.navigate({ view: 'dispatch', date: null });
    });

    expect(window.location.pathname).toBe('/dispatch');
    expect(window.history.length).toBe(pushCount + 1);
  });

  it('goBack uses browser history for entries reached in-app', async () => {
    const { result } = renderHook(() => useOfficeNavigation());

    act(() => {
      result.current.navigate({ view: 'customers', target: null });
      result.current.navigate({ view: 'jobIntake' });
    });
    expect(window.location.pathname).toBe('/jobs/new');

    act(() => {
      result.current.goBack({ view: 'jobs' });
    });

    await waitFor(() => expect(result.current.route).toEqual({ view: 'customers', target: null }));
  });

  it('goBack replaces a deep-linked entry with the fallback', () => {
    window.history.replaceState(null, '', '/jobs/new');
    const { result } = renderHook(() => useOfficeNavigation());
    const historyLength = window.history.length;

    act(() => {
      result.current.goBack({ view: 'jobs' });
    });

    expect(window.location.pathname).toBe('/jobs');
    expect(result.current.route).toEqual({ view: 'jobs' });
    expect(window.history.length).toBe(historyLength);
  });

  it('follows browser Back and Forward', async () => {
    const { result } = renderHook(() => useOfficeNavigation());

    act(() => {
      result.current.navigate({ view: 'jobs' });
    });

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(result.current.route).toEqual({ view: 'dispatch', date: null }));

    act(() => {
      window.history.forward();
    });
    await waitFor(() => expect(result.current.route).toEqual({ view: 'jobs' }));
  });
});
