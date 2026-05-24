import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveInitialLoginCredentials,
  shouldShowDemoLoginAccounts,
  type DemoLoginAccount
} from '../demo-login';

const demoAccounts: DemoLoginAccount[] = [
  { label: 'Technician', email: 'tech@bellfield.local', password: 'bellfield-tech' }
];

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('field demo login helpers', () => {
  it('hides demo shortcuts and starts blank in production', () => {
    expect(shouldShowDemoLoginAccounts('production')).toBe(false);
    expect(resolveInitialLoginCredentials(demoAccounts, 'production')).toEqual({
      email: '',
      password: ''
    });
  });

  it('keeps demo shortcuts and default credentials outside production', () => {
    expect(shouldShowDemoLoginAccounts('development')).toBe(true);
    expect(resolveInitialLoginCredentials(demoAccounts, 'development')).toEqual({
      email: 'tech@bellfield.local',
      password: 'bellfield-tech'
    });
  });

  it('does not expose field demo account shortcuts when loaded in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();

    const { getFieldDemoLoginAccounts } = await import('../demo-login');

    expect(getFieldDemoLoginAccounts()).toEqual([]);
  });
});
