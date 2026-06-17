import { getRelayRuntimeConfig } from './runtime-config';

describe('getRelayRuntimeConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows zero payment platform fee basis points for free accounts', () => {
    process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = '0';

    expect(getRelayRuntimeConfig().paymentsPlatformFeeBasisPoints).toBe(0);
  });

  it('rejects negative payment platform fee basis points', () => {
    process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = '-1';

    expect(() => getRelayRuntimeConfig()).toThrow(
      'BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS must be a non-negative integer.'
    );
  });
});
