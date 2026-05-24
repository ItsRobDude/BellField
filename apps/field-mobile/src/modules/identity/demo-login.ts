export type DemoLoginAccount = {
  email: string;
  label: string;
  password: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export function shouldShowDemoLoginAccounts(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  return nodeEnv !== 'production';
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
