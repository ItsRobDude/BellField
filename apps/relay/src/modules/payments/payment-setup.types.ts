import type { RelayPaymentSetupLinkResponse, RelayPaymentSetupStatus } from '@bellfield/contracts';

export type RelayShopPaymentSetupRecord = {
  shopId: string;
  paymentsStatus: 'disabled' | 'enabled';
  stripeConnectedAccountId: string | null;
  paymentsSetupStatus: RelayPaymentSetupStatus;
  paymentsSetupUrlExpiresAt: Date | null;
  paymentsEnabledAt: Date | null;
  paymentsSetupCreatedAt: Date | null;
  paymentsReadyAt: Date | null;
};

export type StripeConnectedAccountReadiness = {
  connectedAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  cardPaymentsCapability: string | null;
  transfersCapability: string | null;
  currentlyDue: string[];
  pastDue: string[];
  disabledReason: string | null;
};

export type StripeConnectedAccountCreateResult = {
  connectedAccountId: string;
};

export type StripeAccountOnboardingLinkResult = {
  onboardingUrl: string;
  expiresAt: Date;
};

export type RelayPaymentSetupLinkResult = RelayPaymentSetupLinkResponse;

export interface RelayPaymentSetupStore {
  withShopPaymentSetupLock<T>(shopId: string, callback: () => Promise<T>): Promise<T>;
  findShopPaymentSetup(shopId: string): Promise<RelayShopPaymentSetupRecord | null>;
  findShopPaymentSetupByConnectedAccountId(
    connectedAccountId: string
  ): Promise<RelayShopPaymentSetupRecord | null>;
  saveStripeConnectedAccount(input: {
    shopId: string;
    stripeConnectedAccountId: string;
    setupStatus: Exclude<RelayPaymentSetupStatus, 'notStarted'>;
    occurredAt: Date;
  }): Promise<void>;
  updateShopPaymentSetup(input: {
    shopId: string;
    setupStatus: RelayPaymentSetupStatus;
    paymentsEnabled: boolean;
    setupUrlExpiresAt?: Date | null;
    occurredAt: Date;
  }): Promise<void>;
}
