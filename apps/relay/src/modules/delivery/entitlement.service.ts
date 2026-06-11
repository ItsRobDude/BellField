import { Inject, Injectable, Optional } from '@nestjs/common';
import type { RelayEntitlementResponse } from '@bellfield/contracts';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';
import { RELAY_MESSAGES_STORE } from './send-estimate.service';
import type { RelayMessagesStore } from './relay-delivery.types';

@Injectable()
export class EntitlementService {
  constructor(
    @Inject(RELAY_MESSAGES_STORE) private readonly messagesStore: RelayMessagesStore,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  // Suspended shops never reach this service — the auth guard rejects them
  // with 403 and the install maps that to its suspended readiness state.
  async getEntitlement(shop: AuthenticatedRelayShop): Promise<RelayEntitlementResponse> {
    const now = this.now();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sentThisMonth = await this.messagesStore.countSendsSince(shop.shopId, monthStart);
    const remainingThisMonth = Math.max(0, shop.monthlySendQuota - sentThisMonth);

    return {
      shopId: shop.shopId,
      sendingState: remainingThisMonth > 0 ? 'ready' : 'quotaExhausted',
      monthlySendQuota: shop.monthlySendQuota,
      remainingThisMonth
    };
  }
}
