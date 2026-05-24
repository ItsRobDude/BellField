import { describe, expect, it } from 'vitest';
import {
  resolveInitialLoginCredentials,
  shouldShowDemoLoginAccounts,
  type DemoLoginAccount
} from '../demo-login';

const demoAccounts: DemoLoginAccount[] = [
  { label: 'Technician', email: 'tech@bellfield.local', password: 'bellfield-tech' }
];

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
});
