import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFirstOwner,
  createOfficeEmployee,
  getOfficeSetupStatus,
  isOfficeSessionExpiredError,
  OfficeIdentityApiError,
  resetOfficeEmployeePassword,
  revokeOfficeEmployeeSession,
  updateOfficeEmployee
} from './identity-api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function firstCall() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  };
}

describe('identity-api employee admin helpers', () => {
  it('getOfficeSetupStatus GETs the unauthenticated setup status route', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ setupRequired: true }) });
    const result = await getOfficeSetupStatus({ apiBaseUrl: 'http://api.test' });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/setup/status');
    expect(call.method).toBeUndefined();
    expect(result.setupRequired).toBe(true);
  });

  it('createFirstOwner POSTs the one-time setup token without returning it locally', async () => {
    await createFirstOwner({
      apiBaseUrl: 'http://api.test',
      setupToken: 'setup-token',
      email: 'owner@example.com',
      displayName: 'First Owner',
      password: 'owner-password'
    });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/setup/first-owner');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({
      setupToken: 'setup-token',
      email: 'owner@example.com',
      displayName: 'First Owner',
      password: 'owner-password'
    });
  });

  it('updateOfficeEmployee PATCHes role/active/overrides to the employee route', async () => {
    await updateOfficeEmployee({
      employeeId: 'e1',
      sessionToken: 'tok',
      apiBaseUrl: 'http://api.test',
      roleId: 'csr',
      isActive: false,
      grantedPermissions: ['inventory:view'],
      revokedPermissions: ['jobs:view']
    });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/employees/e1');
    expect(call.method).toBe('PATCH');
    expect(call.headers.Authorization).toBe('Bearer tok');
    expect(call.body).toEqual({
      roleId: 'csr',
      isActive: false,
      grantedPermissions: ['inventory:view'],
      revokedPermissions: ['jobs:view']
    });
  });

  it('createOfficeEmployee POSTs to /identity/employees', async () => {
    await createOfficeEmployee({
      sessionToken: 'tok',
      apiBaseUrl: 'http://api.test',
      email: 'new.person@bellfield.local',
      displayName: 'New Person',
      roleId: 'csr',
      password: 'supersecret1',
      isActive: true
    });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/employees');
    expect(call.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer tok');
    expect(call.body).toEqual({
      email: 'new.person@bellfield.local',
      displayName: 'New Person',
      roleId: 'csr',
      password: 'supersecret1',
      isActive: true
    });
  });

  it('resetOfficeEmployeePassword POSTs to the password-reset route and returns the count', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ revokedSessionCount: 3 }) });
    const result = await resetOfficeEmployeePassword({
      employeeId: 'e1',
      sessionToken: 'tok',
      apiBaseUrl: 'http://api.test',
      password: 'brandnew123'
    });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/employees/e1/password-reset');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ password: 'brandnew123' });
    expect(result.revokedSessionCount).toBe(3);
  });

  it('revokeOfficeEmployeeSession POSTs to the scoped session revoke route', async () => {
    await revokeOfficeEmployeeSession({
      employeeId: 'e1',
      sessionId: 's9',
      sessionToken: 'tok',
      apiBaseUrl: 'http://api.test'
    });
    const call = firstCall();
    expect(call.url).toBe('http://api.test/identity/employees/e1/sessions/s9/revoke');
    expect(call.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer tok');
  });

  it('throws the server-provided message on a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        message: 'Session expired. Please sign in again.',
        code: 'sessionExpired'
      })
    });
    let capturedError: unknown;

    try {
      await updateOfficeEmployee({
        employeeId: 'e1',
        sessionToken: 'tok',
        apiBaseUrl: 'http://api.test'
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(OfficeIdentityApiError);
    expect(capturedError).toMatchObject({
      message: 'Session expired. Please sign in again.',
      status: 401,
      code: 'sessionExpired'
    });
    expect(isOfficeSessionExpiredError(capturedError)).toBe(true);
  });

  it('does not classify a non-401 response as session expiry just because it has a code', () => {
    expect(
      isOfficeSessionExpiredError(
        new OfficeIdentityApiError('Only an owner can do that.', 403, 'sessionExpired')
      )
    ).toBe(false);
  });
});
