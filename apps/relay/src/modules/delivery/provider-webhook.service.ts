import { Inject, Injectable, Optional } from '@nestjs/common';
import { log } from '../../common/logger';
import { RelayIdentityRepository } from '../identity/relay-identity.repository';
import { RELAY_MESSAGES_STORE } from './send-estimate.service';
import type { RelayMessagesStore } from './relay-delivery.types';

// Reputation autothrottle: suspend a shop before its bounce/complaint rate
// damages the shared sending domain (delivery-relay-plan.md §8).
const REPUTATION_WINDOW_DAYS = 7;
const REPUTATION_MIN_SENDS = 20;
const REPUTATION_MAX_HARD_FAILURE_RATE = 0.05;
const REPUTATION_SUSPENSION_REASON = 'delivery-reputation';

export type ProviderWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
  };
};

export interface ShopSuspender {
  findActiveTokenIdForShop(shopId: string): Promise<string | null>;
  suspendShop(input: {
    shopId: string;
    tokenId: string;
    reason: string;
    instanceId: string | null;
    occurredAt: Date;
  }): Promise<void>;
}

export const SHOP_SUSPENDER = 'SHOP_SUSPENDER';

@Injectable()
export class ProviderWebhookService {
  constructor(
    @Inject(RELAY_MESSAGES_STORE) private readonly messagesStore: RelayMessagesStore,
    @Inject(SHOP_SUSPENDER) private readonly shopSuspender: ShopSuspender,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  async handleEvent(event: ProviderWebhookEvent): Promise<void> {
    const status = mapEventType(event.type);
    const providerMessageId = event.data?.email_id;
    if (!status || !providerMessageId) {
      return;
    }

    const occurredAt = this.now();
    const applied = await this.messagesStore.applyDeliveryEvent({
      providerMessageId,
      status,
      occurredAt
    });
    if (!applied) {
      return;
    }

    if (status === 'bounced' || status === 'complained') {
      const message = await this.messagesStore.findByProviderMessageId(providerMessageId);
      if (!message) {
        return;
      }
      await this.messagesStore.addSuppression({
        shopId: message.shopId,
        email: message.recipientEmail,
        reason: status === 'bounced' ? 'bounce' : 'complaint',
        occurredAt
      });
      await this.applyReputationThrottle(message.shopId, occurredAt);
    }
  }

  private async applyReputationThrottle(shopId: string, occurredAt: Date): Promise<void> {
    const windowStart = new Date(
      occurredAt.getTime() - REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const counts = await this.messagesStore.getReputationCounts(shopId, windowStart);
    if (counts.attempted < REPUTATION_MIN_SENDS) {
      return;
    }
    const hardFailureRate = counts.hardFailures / counts.attempted;
    if (hardFailureRate < REPUTATION_MAX_HARD_FAILURE_RATE) {
      return;
    }

    const tokenId = await this.shopSuspender.findActiveTokenIdForShop(shopId);
    if (!tokenId) {
      return;
    }
    await this.shopSuspender.suspendShop({
      shopId,
      tokenId,
      reason: REPUTATION_SUSPENSION_REASON,
      instanceId: null,
      occurredAt
    });
    log('warn', 'Relay shop suspended for delivery reputation.', {
      shopId,
      attempted: counts.attempted,
      hardFailures: counts.hardFailures
    });
  }
}

function mapEventType(type: string): 'delivered' | 'bounced' | 'complained' | null {
  if (type === 'email.delivered') {
    return 'delivered';
  }
  if (type === 'email.bounced') {
    return 'bounced';
  }
  if (type === 'email.complained') {
    return 'complained';
  }
  return null;
}

export const shopSuspenderProvider = {
  provide: SHOP_SUSPENDER,
  useExisting: RelayIdentityRepository
};
