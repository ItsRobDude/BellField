import { classifyAccountReadiness, RelayPaymentSetupService } from './payment-setup.service';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import type {
  RelayPaymentSetupStore,
  RelayShopPaymentSetupRecord,
  StripeConnectedAccountReadiness
} from './payment-setup.types';

const shop: AuthenticatedRelayShop = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  monthlySendQuota: 1000,
  tokenId: 'token_1',
  instanceId: 'instance-a'
};

function makeSetup(overrides?: Partial<RelayShopPaymentSetupRecord>): RelayShopPaymentSetupRecord {
  return {
    shopId: 'shop_1',
    paymentsStatus: 'disabled',
    stripeConnectedAccountId: null,
    paymentsSetupStatus: 'notStarted',
    paymentsSetupUrlExpiresAt: null,
    paymentsEnabledAt: null,
    paymentsSetupCreatedAt: null,
    paymentsReadyAt: null,
    ...overrides
  };
}

function readiness(
  overrides?: Partial<StripeConnectedAccountReadiness>
): StripeConnectedAccountReadiness {
  return {
    connectedAccountId: 'acct_1',
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    cardPaymentsCapability: 'pending',
    transfersCapability: 'pending',
    currentlyDue: ['business_profile.url'],
    pastDue: [],
    disabledReason: null,
    ...overrides
  };
}

function makeService(overrides?: {
  setup?: RelayShopPaymentSetupRecord;
  setupByConnectedAccount?: RelayShopPaymentSetupRecord | null;
  retrieve?: StripeConnectedAccountReadiness;
  createAccountThrows?: boolean;
  retrieveThrows?: boolean;
}) {
  let setup = overrides?.setup ?? makeSetup();
  const savedAccounts: string[] = [];
  const updates: Parameters<RelayPaymentSetupStore['updateShopPaymentSetup']>[0][] = [];
  const store: RelayPaymentSetupStore = {
    withShopPaymentSetupLock: async <T>(_shopId: string, callback: () => Promise<T>) => callback(),
    findShopPaymentSetup: async () => setup,
    findShopPaymentSetupByConnectedAccountId: async (connectedAccountId) => {
      if (overrides && 'setupByConnectedAccount' in overrides) {
        return overrides.setupByConnectedAccount ?? null;
      }
      return setup.stripeConnectedAccountId === connectedAccountId ? setup : null;
    },
    saveStripeConnectedAccount: async (input) => {
      savedAccounts.push(input.stripeConnectedAccountId);
      setup = {
        ...setup,
        stripeConnectedAccountId: input.stripeConnectedAccountId,
        paymentsSetupStatus: input.setupStatus,
        paymentsSetupCreatedAt: input.occurredAt
      };
    },
    updateShopPaymentSetup: async (input) => {
      updates.push(input);
      setup = {
        ...setup,
        paymentsStatus: input.paymentsEnabled ? 'enabled' : 'disabled',
        paymentsSetupStatus: input.setupStatus,
        paymentsSetupUrlExpiresAt: input.setupUrlExpiresAt ?? null,
        paymentsEnabledAt: input.paymentsEnabled ? input.occurredAt : null,
        paymentsReadyAt: input.paymentsEnabled
          ? (setup.paymentsReadyAt ?? input.occurredAt)
          : setup.paymentsReadyAt
      };
    }
  };
  const stripe = {
    isConfigured: true,
    createConnectedAccount: jest.fn().mockImplementation(async () => {
      if (overrides?.createAccountThrows) {
        throw new Error('stripe create failed');
      }
      return { connectedAccountId: 'acct_1' };
    }),
    retrieveConnectedAccount: jest.fn().mockImplementation(async () => {
      if (overrides?.retrieveThrows) {
        throw new Error('stripe retrieve failed');
      }
      return overrides?.retrieve ?? readiness();
    }),
    createAccountOnboardingLink: jest.fn().mockResolvedValue({
      onboardingUrl: 'https://connect.stripe.test/setup',
      expiresAt: new Date('2026-06-18T12:00:00.000Z')
    })
  };

  process.env.BELLFIELD_RELAY_PUBLIC_BASE_URL = 'https://relay.example';
  const service = new RelayPaymentSetupService(store, stripe as never);
  return {
    service,
    stripe,
    getSavedAccounts: () => savedAccounts,
    getUpdates: () => updates
  };
}

describe('RelayPaymentSetupService', () => {
  it('creates one connected account and returns an onboarding URL', async () => {
    const ctx = makeService();

    const response = await ctx.service.createSetupLink(shop);

    expect(response.status).toBe('actionRequired');
    expect(response.onboardingUrl).toBe('https://connect.stripe.test/setup');
    expect(ctx.stripe.createConnectedAccount).toHaveBeenCalledTimes(1);
    expect(ctx.getSavedAccounts()).toEqual(['acct_1']);
    expect(ctx.stripe.createAccountOnboardingLink).toHaveBeenCalledWith({
      connectedAccountId: 'acct_1',
      refreshUrl: 'https://relay.example/payments/setup/refresh',
      returnUrl: 'https://relay.example/payments/setup/return'
    });
  });

  it('reuses an existing connected account on repeated setup-link calls', async () => {
    const ctx = makeService({
      setup: makeSetup({
        stripeConnectedAccountId: 'acct_existing',
        paymentsSetupStatus: 'actionRequired'
      })
    });

    await ctx.service.createSetupLink(shop);

    expect(ctx.stripe.createConnectedAccount).not.toHaveBeenCalled();
    expect(ctx.stripe.createAccountOnboardingLink).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: 'acct_existing' })
    );
  });

  it('returns ready only when Stripe reports card-charge and payout readiness', async () => {
    const ctx = makeService({
      setup: makeSetup({ stripeConnectedAccountId: 'acct_1' }),
      retrieve: readiness({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        cardPaymentsCapability: 'active',
        currentlyDue: []
      })
    });

    const response = await ctx.service.getSetupStatus(shop);

    expect(response.status).toBe('ready');
    expect(ctx.getUpdates().at(-1)).toEqual(expect.objectContaining({ paymentsEnabled: true }));
  });

  it('returns providerError without enabling payments when Stripe status fails', async () => {
    const ctx = makeService({
      setup: makeSetup({ stripeConnectedAccountId: 'acct_1' }),
      retrieveThrows: true
    });

    const response = await ctx.service.getSetupStatus(shop);

    expect(response.status).toBe('providerError');
    expect(ctx.getUpdates()).toEqual([]);
  });

  it('disables a ready shop when account.updated reports action required', async () => {
    const ctx = makeService({
      setup: makeSetup({
        paymentsStatus: 'enabled',
        paymentsSetupStatus: 'ready',
        stripeConnectedAccountId: 'acct_1',
        paymentsEnabledAt: new Date('2026-06-18T10:00:00.000Z'),
        paymentsReadyAt: new Date('2026-06-18T10:00:00.000Z')
      }),
      retrieve: readiness({
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        cardPaymentsCapability: 'pending',
        currentlyDue: ['external_account']
      })
    });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_1');

    expect(ctx.getUpdates().at(-1)).toEqual(
      expect.objectContaining({ paymentsEnabled: false, setupStatus: 'actionRequired' })
    );
  });

  it('disables a ready shop when account.updated reports pending review', async () => {
    const ctx = makeService({
      setup: makeSetup({
        paymentsStatus: 'enabled',
        paymentsSetupStatus: 'ready',
        stripeConnectedAccountId: 'acct_1',
        paymentsEnabledAt: new Date('2026-06-18T10:00:00.000Z'),
        paymentsReadyAt: new Date('2026-06-18T10:00:00.000Z')
      }),
      retrieve: readiness({
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        cardPaymentsCapability: 'active',
        currentlyDue: []
      })
    });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_1');

    expect(ctx.getUpdates().at(-1)).toEqual(
      expect.objectContaining({ paymentsEnabled: false, setupStatus: 'pendingReview' })
    );
  });

  it('re-enables a disabled shop when account.updated reports ready', async () => {
    const ctx = makeService({
      setup: makeSetup({
        paymentsStatus: 'disabled',
        paymentsSetupStatus: 'actionRequired',
        stripeConnectedAccountId: 'acct_1'
      }),
      retrieve: readiness({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        cardPaymentsCapability: 'active',
        currentlyDue: []
      })
    });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_1');

    expect(ctx.getUpdates().at(-1)).toEqual(
      expect.objectContaining({ paymentsEnabled: true, setupStatus: 'ready' })
    );
  });

  it('does not persist duplicate account.updated events when status is unchanged', async () => {
    const readyAt = new Date('2026-06-18T10:00:00.000Z');
    const ctx = makeService({
      setup: makeSetup({
        paymentsStatus: 'enabled',
        paymentsSetupStatus: 'ready',
        stripeConnectedAccountId: 'acct_1',
        paymentsEnabledAt: readyAt,
        paymentsReadyAt: readyAt
      }),
      retrieve: readiness({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        cardPaymentsCapability: 'active',
        currentlyDue: []
      })
    });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_1');
    await ctx.service.refreshSetupStatusForConnectedAccount('acct_1');

    expect(ctx.getUpdates()).toEqual([]);
  });

  it('ignores account.updated for an unknown connected account', async () => {
    const ctx = makeService({ setupByConnectedAccount: null });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_missing');

    expect(ctx.stripe.retrieveConnectedAccount).not.toHaveBeenCalled();
    expect(ctx.getUpdates()).toEqual([]);
  });

  it('ignores account.updated when the shop was relinked before the lock was taken', async () => {
    const ctx = makeService({
      setupByConnectedAccount: makeSetup({
        shopId: 'shop_1',
        stripeConnectedAccountId: 'acct_old'
      }),
      setup: makeSetup({
        shopId: 'shop_1',
        stripeConnectedAccountId: 'acct_new'
      })
    });

    await ctx.service.refreshSetupStatusForConnectedAccount('acct_old');

    expect(ctx.stripe.retrieveConnectedAccount).not.toHaveBeenCalled();
    expect(ctx.getUpdates()).toEqual([]);
  });
});

describe('classifyAccountReadiness', () => {
  it('returns actionRequired while requirements are due', () => {
    expect(classifyAccountReadiness(readiness())).toBe('actionRequired');
  });

  it('returns pendingReview after details are submitted but charges are not ready', () => {
    expect(
      classifyAccountReadiness(
        readiness({ detailsSubmitted: true, currentlyDue: [], cardPaymentsCapability: 'pending' })
      )
    ).toBe('pendingReview');
  });

  it('returns disabled for terminal Stripe disabled reasons', () => {
    expect(
      classifyAccountReadiness(
        readiness({
          detailsSubmitted: true,
          currentlyDue: [],
          disabledReason: 'rejected.fraud'
        })
      )
    ).toBe('disabled');
  });

  it('stays ready when charges and payouts are live even with future requirements due', () => {
    expect(
      classifyAccountReadiness(
        readiness({
          chargesEnabled: true,
          payoutsEnabled: true,
          cardPaymentsCapability: 'active',
          detailsSubmitted: true,
          currentlyDue: ['business_profile.url']
        })
      )
    ).toBe('ready');
  });

  it('returns pendingReview when charges are live but payouts are not yet enabled', () => {
    expect(
      classifyAccountReadiness(
        readiness({
          chargesEnabled: true,
          payoutsEnabled: false,
          cardPaymentsCapability: 'active',
          detailsSubmitted: true,
          currentlyDue: []
        })
      )
    ).toBe('pendingReview');
  });

  it('returns actionRequired when payouts still need bank details', () => {
    expect(
      classifyAccountReadiness(
        readiness({
          chargesEnabled: true,
          payoutsEnabled: false,
          cardPaymentsCapability: 'active',
          detailsSubmitted: true,
          currentlyDue: ['external_account']
        })
      )
    ).toBe('actionRequired');
  });
});
