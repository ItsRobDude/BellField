import { EntitlementService } from './entitlement.service';
import type { RelayMessagesStore } from './relay-delivery.types';
import type { AuthenticatedRelayShop } from '../identity/relay-identity.types';

const shop: AuthenticatedRelayShop = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  monthlySendQuota: 100,
  tokenId: 'token_1',
  instanceId: 'instance-a'
};

function makeService(sentThisMonth: number) {
  const store = {
    countSendsSince: jest.fn().mockResolvedValue(sentThisMonth)
  } as unknown as RelayMessagesStore;
  return {
    store,
    service: new EntitlementService(store, () => new Date('2026-06-11T12:00:00Z'))
  };
}

describe('EntitlementService', () => {
  it('reports ready with remaining quota', async () => {
    const { service, store } = makeService(25);

    const entitlement = await service.getEntitlement(shop);

    expect(entitlement).toEqual({
      shopId: 'shop_1',
      sendingState: 'ready',
      monthlySendQuota: 100,
      remainingThisMonth: 75
    });
    expect(store.countSendsSince).toHaveBeenCalledWith('shop_1', new Date(Date.UTC(2026, 5, 1)));
  });

  it('reports quotaExhausted at or past the quota', async () => {
    const { service } = makeService(100);

    const entitlement = await service.getEntitlement(shop);

    expect(entitlement.sendingState).toBe('quotaExhausted');
    expect(entitlement.remainingThisMonth).toBe(0);
  });

  it('never reports negative remaining quota', async () => {
    const { service } = makeService(140);

    const entitlement = await service.getEntitlement(shop);

    expect(entitlement.remainingThisMonth).toBe(0);
  });
});
