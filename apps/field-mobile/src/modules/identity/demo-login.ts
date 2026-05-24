export type DemoLoginAccount = {
  email: string;
  label: string;
  password: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

const fieldDemoLoginAccounts: DemoLoginAccount[] =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        { label: 'Technician', email: 'tech@bellfield.local', password: 'bellfield-tech' },
        {
          label: 'Dispatcher',
          email: 'dispatcher@bellfield.local',
          password: 'bellfield-dispatch'
        },
        { label: 'Owner', email: 'owner@bellfield.local', password: 'bellfield-owner' }
      ];

export function shouldShowDemoLoginAccounts(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  return nodeEnv !== 'production';
}

export function getFieldDemoLoginAccounts(): readonly DemoLoginAccount[] {
  return fieldDemoLoginAccounts;
}

export function resolveInitialLoginCredentials(
  accounts: readonly DemoLoginAccount[],
  nodeEnv: string | undefined = process.env.NODE_ENV
): LoginCredentials {
  if (!shouldShowDemoLoginAccounts(nodeEnv)) {
    return { email: '', password: '' };
  }

  const defaultAccount = accounts[0];

  return {
    email: defaultAccount?.email ?? '',
    password: defaultAccount?.password ?? ''
  };
}
