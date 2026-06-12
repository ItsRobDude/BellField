import { parseRelayAdminArgs } from './relay-admin-args';

describe('parseRelayAdminArgs', () => {
  it('parses create-shop with name and license id', () => {
    const result = parseRelayAdminArgs([
      'create-shop',
      '--name=Acme HVAC',
      '--license-id=lic_20260611_acme'
    ]);
    expect(result).toEqual({
      ok: true,
      parsed: {
        command: 'create-shop',
        displayName: 'Acme HVAC',
        licenseId: 'lic_20260611_acme'
      }
    });
  });

  it('parses create-shop with an explicit quota', () => {
    const result = parseRelayAdminArgs([
      'create-shop',
      '--name=Acme HVAC',
      '--license-id=lic_1',
      '--quota=250'
    ]);
    expect(result).toEqual({
      ok: true,
      parsed: {
        command: 'create-shop',
        displayName: 'Acme HVAC',
        licenseId: 'lic_1',
        monthlySendQuota: 250
      }
    });
  });

  it('rejects create-shop without required flags', () => {
    expect(parseRelayAdminArgs(['create-shop', '--name=Acme'])).toMatchObject({ ok: false });
    expect(parseRelayAdminArgs(['create-shop', '--license-id=lic_1'])).toMatchObject({
      ok: false
    });
  });

  it('rejects a non-positive quota', () => {
    expect(
      parseRelayAdminArgs(['create-shop', '--name=A', '--license-id=l', '--quota=0'])
    ).toMatchObject({ ok: false });
    expect(
      parseRelayAdminArgs(['create-shop', '--name=A', '--license-id=l', '--quota=ten'])
    ).toMatchObject({ ok: false });
  });

  it.each(['issue-token', 'revoke-token', 'reactivate-shop', 'inspect'] as const)(
    'parses %s with --shop-id',
    (command) => {
      expect(parseRelayAdminArgs([command, '--shop-id=shop_abc123'])).toEqual({
        ok: true,
        parsed: { command, shopId: 'shop_abc123' }
      });
      expect(parseRelayAdminArgs([command])).toMatchObject({ ok: false });
    }
  );

  it('rejects unknown or missing commands', () => {
    expect(parseRelayAdminArgs(['frobnicate'])).toMatchObject({ ok: false });
    expect(parseRelayAdminArgs([])).toMatchObject({ ok: false });
  });
});
