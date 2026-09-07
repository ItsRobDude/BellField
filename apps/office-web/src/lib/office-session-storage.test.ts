import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredOfficeSession,
  readStoredOfficeServerUrl,
  readStoredOfficeSession,
  writeStoredOfficeSession
} from './office-session-storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('office session storage', () => {
  it('round-trips a session and remembers the server address', () => {
    writeStoredOfficeSession({ sessionToken: 'session-1', apiBaseUrl: 'http://office-pc:3001' });

    expect(readStoredOfficeSession()).toEqual({
      sessionToken: 'session-1',
      apiBaseUrl: 'http://office-pc:3001'
    });
    expect(readStoredOfficeServerUrl()).toBe('http://office-pc:3001');
  });

  it('clearing the session keeps the remembered server address', () => {
    writeStoredOfficeSession({ sessionToken: 'session-1', apiBaseUrl: 'http://office-pc:3001' });

    clearStoredOfficeSession();

    expect(readStoredOfficeSession()).toBeNull();
    expect(readStoredOfficeServerUrl()).toBe('http://office-pc:3001');
  });

  it('ignores malformed or incomplete stored sessions', () => {
    window.localStorage.setItem('bellfield.office.session', 'not json');
    expect(readStoredOfficeSession()).toBeNull();

    window.localStorage.setItem('bellfield.office.session', JSON.stringify({ sessionToken: '' }));
    expect(readStoredOfficeSession()).toBeNull();

    window.localStorage.setItem(
      'bellfield.office.session',
      JSON.stringify({ sessionToken: 'session-1' })
    );
    expect(readStoredOfficeSession()).toBeNull();
  });

  it('treats unavailable storage as nothing remembered', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() =>
      writeStoredOfficeSession({ sessionToken: 'session-1', apiBaseUrl: 'http://api.test' })
    ).not.toThrow();
    expect(readStoredOfficeSession()).toBeNull();
    expect(readStoredOfficeServerUrl()).toBeNull();
    expect(() => clearStoredOfficeSession()).not.toThrow();
  });
});
