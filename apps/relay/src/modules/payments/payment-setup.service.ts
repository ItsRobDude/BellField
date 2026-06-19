import { Inject, Injectable } from '@nestjs/common';
import type {
  RelayPaymentSetupLinkResponse,
  RelayPaymentSetupStatus,
  RelayPaymentSetupStatusResponse
} from '@bellfield/contracts';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { log } from '../../common/logger';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import type {
  RelayPaymentSetupStore,
  RelayShopPaymentSetupRecord,
  StripeConnectedAccountReadiness
} from './payment-setup.types';
import { StripePaymentsService } from './stripe-payments.service';

export const RELAY_PAYMENT_SETUP_STORE = 'RELAY_PAYMENT_SETUP_STORE';

@Injectable()
export class RelayPaymentSetupService {
  private readonly runtimeConfig = getRelayRuntimeConfig();

  constructor(
    @Inject(RELAY_PAYMENT_SETUP_STORE) private readonly setupStore: RelayPaymentSetupStore,
    private readonly stripePaymentsService: StripePaymentsService
  ) {}

  async getSetupStatus(shop: AuthenticatedRelayShop): Promise<RelayPaymentSetupStatusResponse> {
    if (!this.stripePaymentsService.isConfigured) {
      return providerError('BellField Payments is not configured.');
    }

    return this.setupStore.withShopPaymentSetupLock(shop.shopId, async () => {
      const setup = await this.setupStore.findShopPaymentSetup(shop.shopId);
      if (!setup) {
        return providerError('Online payments setup could not be found for this shop.');
      }
      if (!setup.stripeConnectedAccountId) {
        return {
          status: setup.paymentsSetupStatus === 'disabled' ? 'disabled' : 'notStarted',
          message:
            setup.paymentsSetupStatus === 'disabled'
              ? 'Online payments are disabled for this shop.'
              : undefined
        };
      }

      return this.refreshStatusFromStripe(setup);
    });
  }

  async createSetupLink(shop: AuthenticatedRelayShop): Promise<RelayPaymentSetupLinkResponse> {
    return this.createOrRefreshSetupLink(shop);
  }

  async refreshSetupLink(shop: AuthenticatedRelayShop): Promise<RelayPaymentSetupLinkResponse> {
    return this.createOrRefreshSetupLink(shop);
  }

  async refreshSetupStatusForConnectedAccount(connectedAccountId: string): Promise<void> {
    if (!this.stripePaymentsService.isConfigured) {
      return;
    }

    const setup =
      await this.setupStore.findShopPaymentSetupByConnectedAccountId(connectedAccountId);
    if (!setup) {
      log('warn', 'Stripe account update did not match a BellField relay shop.', {
        connectedAccountId
      });
      return;
    }

    let readiness: StripeConnectedAccountReadiness;
    try {
      readiness = await this.stripePaymentsService.retrieveConnectedAccount(connectedAccountId);
    } catch (error) {
      log('error', 'Stripe connected account status retrieval failed for account update.', {
        shopId: setup.shopId,
        connectedAccountId,
        error
      });
      throw error;
    }

    await this.setupStore.withShopPaymentSetupLock(setup.shopId, async () => {
      const lockedSetup = await this.setupStore.findShopPaymentSetup(setup.shopId);
      if (!lockedSetup || lockedSetup.stripeConnectedAccountId !== connectedAccountId) {
        log('warn', 'Stripe account update ignored because the shop account changed.', {
          shopId: setup.shopId,
          connectedAccountId
        });
        return;
      }
      await this.persistReadinessStatus(lockedSetup, readiness);
    });
  }

  private async createOrRefreshSetupLink(
    shop: AuthenticatedRelayShop
  ): Promise<RelayPaymentSetupLinkResponse> {
    if (!this.stripePaymentsService.isConfigured) {
      return providerError('BellField Payments is not configured.');
    }

    return this.setupStore.withShopPaymentSetupLock(shop.shopId, async () => {
      const setup = await this.setupStore.findShopPaymentSetup(shop.shopId);
      if (!setup) {
        return providerError('Online payments setup could not be found for this shop.');
      }

      const accountId = await this.ensureConnectedAccount(shop, setup);
      if (!accountId) {
        return providerError('Stripe could not create the online payments account.');
      }

      const currentStatus = await this.refreshStatusFromStripe({
        ...setup,
        stripeConnectedAccountId: accountId
      });
      if (currentStatus.status === 'ready') {
        return currentStatus;
      }
      if (currentStatus.status === 'disabled' || currentStatus.status === 'providerError') {
        return currentStatus;
      }

      try {
        const onboardingLink = await this.stripePaymentsService.createAccountOnboardingLink({
          connectedAccountId: accountId,
          refreshUrl: `${this.runtimeConfig.publicBaseUrl}/payments/setup/refresh`,
          returnUrl: `${this.runtimeConfig.publicBaseUrl}/payments/setup/return`
        });
        const occurredAt = new Date();
        await this.setupStore.updateShopPaymentSetup({
          shopId: shop.shopId,
          setupStatus:
            currentStatus.status === 'pendingReview' ? 'pendingReview' : 'actionRequired',
          paymentsEnabled: false,
          setupUrlExpiresAt: onboardingLink.expiresAt,
          occurredAt
        });
        return {
          status: currentStatus.status === 'pendingReview' ? 'pendingReview' : 'actionRequired',
          onboardingUrl: onboardingLink.onboardingUrl,
          onboardingUrlExpiresAt: onboardingLink.expiresAt.toISOString(),
          message:
            currentStatus.status === 'pendingReview'
              ? 'Online payments are almost ready. We are finishing verification.'
              : 'Online payments setup needs to be completed.'
        };
      } catch (error) {
        log('error', 'Stripe onboarding link creation failed.', {
          shopId: shop.shopId,
          error
        });
        await this.setupStore.updateShopPaymentSetup({
          shopId: shop.shopId,
          setupStatus: 'providerError',
          paymentsEnabled: false,
          setupUrlExpiresAt: null,
          occurredAt: new Date()
        });
        return providerError('Stripe could not create the online payments setup link.');
      }
    });
  }

  private async ensureConnectedAccount(
    shop: AuthenticatedRelayShop,
    setup: RelayShopPaymentSetupRecord
  ): Promise<string | null> {
    if (setup.stripeConnectedAccountId) {
      return setup.stripeConnectedAccountId;
    }
    try {
      const account = await this.stripePaymentsService.createConnectedAccount({
        shopId: shop.shopId,
        displayName: shop.displayName
      });
      await this.setupStore.saveStripeConnectedAccount({
        shopId: shop.shopId,
        stripeConnectedAccountId: account.connectedAccountId,
        setupStatus: 'actionRequired',
        occurredAt: new Date()
      });
      return account.connectedAccountId;
    } catch (error) {
      log('error', 'Stripe connected account creation failed.', {
        shopId: shop.shopId,
        error
      });
      await this.setupStore.updateShopPaymentSetup({
        shopId: shop.shopId,
        setupStatus: 'providerError',
        paymentsEnabled: false,
        setupUrlExpiresAt: null,
        occurredAt: new Date()
      });
      return null;
    }
  }

  private async refreshStatusFromStripe(
    setup: RelayShopPaymentSetupRecord
  ): Promise<RelayPaymentSetupStatusResponse> {
    if (!setup.stripeConnectedAccountId) {
      return { status: 'notStarted' };
    }

    let readiness: StripeConnectedAccountReadiness;
    try {
      readiness = await this.stripePaymentsService.retrieveConnectedAccount(
        setup.stripeConnectedAccountId
      );
    } catch (error) {
      log('error', 'Stripe connected account status retrieval failed.', {
        shopId: setup.shopId,
        error
      });
      return providerError('Stripe could not report the online payments setup status.');
    }

    return this.persistReadinessStatus(setup, readiness);
  }

  private async persistReadinessStatus(
    setup: RelayShopPaymentSetupRecord,
    readiness: StripeConnectedAccountReadiness
  ): Promise<RelayPaymentSetupStatusResponse> {
    const status = classifyAccountReadiness(readiness);
    const paymentsEnabled = status === 'ready';
    const occurredAt = new Date();
    await this.persistStatusIfChanged({
      setup,
      status,
      paymentsEnabled,
      setupUrlExpiresAt: paymentsEnabled ? null : setup.paymentsSetupUrlExpiresAt,
      occurredAt
    });

    return {
      status,
      onboardingUrlExpiresAt: paymentsEnabled
        ? undefined
        : setup.paymentsSetupUrlExpiresAt?.toISOString(),
      paymentsEnabledAt:
        paymentsEnabled && setup.paymentsEnabledAt
          ? setup.paymentsEnabledAt.toISOString()
          : paymentsEnabled
            ? occurredAt.toISOString()
            : undefined,
      message: statusMessage(status)
    };
  }

  private async persistStatusIfChanged(input: {
    setup: RelayShopPaymentSetupRecord;
    status: RelayPaymentSetupStatus;
    paymentsEnabled: boolean;
    setupUrlExpiresAt: Date | null;
    occurredAt: Date;
  }): Promise<void> {
    const nextPaymentsStatus = input.paymentsEnabled ? 'enabled' : 'disabled';
    const currentExpiry = input.setup.paymentsSetupUrlExpiresAt?.getTime() ?? null;
    const nextExpiry = input.setupUrlExpiresAt?.getTime() ?? null;
    const needsEnabledTimestamp = input.paymentsEnabled && !input.setup.paymentsEnabledAt;
    if (
      input.setup.paymentsStatus === nextPaymentsStatus &&
      input.setup.paymentsSetupStatus === input.status &&
      currentExpiry === nextExpiry &&
      !needsEnabledTimestamp
    ) {
      return;
    }

    await this.setupStore.updateShopPaymentSetup({
      shopId: input.setup.shopId,
      setupStatus: input.status,
      paymentsEnabled: input.paymentsEnabled,
      setupUrlExpiresAt: input.setupUrlExpiresAt,
      occurredAt: input.occurredAt
    });
  }
}

export function classifyAccountReadiness(
  readiness: StripeConnectedAccountReadiness
): RelayPaymentSetupStatus {
  // "ready" must mean the shop can both charge a customer and actually receive
  // the money: card charges enabled, payouts enabled, and the requested
  // card_payments/transfers capabilities active. currently_due/past_due are
  // deadline-driven remediation Stripe surfaces while the account is still
  // live, so they only split actionRequired vs pendingReview below — they never
  // gate "ready" when the account can charge, transfer, and pay out today.
  const canCharge = readiness.chargesEnabled && readiness.cardPaymentsCapability === 'active';
  const canReceivePayouts = readiness.payoutsEnabled;
  const canUseTransfers = readiness.transfersCapability === 'active';
  if (canCharge && canReceivePayouts && canUseTransfers) {
    return 'ready';
  }
  if (isTerminalDisabledReason(readiness.disabledReason)) {
    return 'disabled';
  }
  if (
    !readiness.detailsSubmitted ||
    readiness.currentlyDue.length > 0 ||
    readiness.pastDue.length > 0
  ) {
    return 'actionRequired';
  }
  return 'pendingReview';
}

function isTerminalDisabledReason(disabledReason: string | null): boolean {
  if (!disabledReason) {
    return false;
  }
  return (
    disabledReason.startsWith('rejected') ||
    disabledReason === 'listed' ||
    disabledReason === 'platform_paused'
  );
}

function statusMessage(status: RelayPaymentSetupStatus): string | undefined {
  switch (status) {
    case 'notStarted':
      return undefined;
    case 'actionRequired':
      return 'Online payments setup needs to be completed.';
    case 'pendingReview':
      return 'Online payments are almost ready. We are finishing verification.';
    case 'ready':
      return 'Online payments ready.';
    case 'disabled':
      return 'Online payments are disabled for this shop.';
    case 'providerError':
      return 'Online payments setup is not available right now.';
  }
}

function providerError(message: string): RelayPaymentSetupStatusResponse {
  return { status: 'providerError', message };
}
