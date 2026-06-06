import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOfficeEmployee,
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
      json: async () => ({ message: 'Only an owner can do that.' })
    });
    await expect(
      updateOfficeEmployee({ employeeId: 'e1', sessionToken: 'tok', apiBaseUrl: 'http://api.test' })
    ).rejects.toThrow('Only an owner can do that.');
  });
});
