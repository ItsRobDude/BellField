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

  it('defaults to the fixed 1% payment platform fee', () => {
    expect(getRelayRuntimeConfig().paymentsPlatformFeeBasisPoints).toBe(100);
  });

  it('allows the fixed 1% payment platform fee to be explicit', () => {
    process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = '100';

    expect(getRelayRuntimeConfig().paymentsPlatformFeeBasisPoints).toBe(100);
  });

  it('rejects disabling the fixed payment platform fee', () => {
    process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = '0';

    expect(() => getRelayRuntimeConfig()).toThrow(
      'BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS must be exactly 100 basis points (1%).'
    );
  });

  it('rejects non-policy payment platform fee basis points', () => {
    process.env.BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = '250';

    expect(() => getRelayRuntimeConfig()).toThrow(
      'BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS must be exactly 100 basis points (1%).'
    );
  });
});
