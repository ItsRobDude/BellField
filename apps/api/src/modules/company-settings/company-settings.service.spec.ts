import { BadRequestException } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import type { UpdateCompanySettingsRequestDto } from './company-settings.types';

const validSettings: UpdateCompanySettingsRequestDto = {
  companyName: 'BellField HVAC',
  replyToEmail: 'Office@Example.COM',
  estimateEmailSubject: 'Estimate from {companyName}',
  estimateEmailBody: 'Attached is your estimate.',
  acceptanceLinkExpiryDays: 30,
  chargesSalesTax: true,
  defaultSalesTaxBasisPoints: 825
};

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'employee-1',
      displayName: 'Olivia Owner',
      effectivePermissions: ['companySettings:configure'],
      sessionSurface: 'office-web'
    })
  };
  const companySettingsRepository = {
    getSettings: jest.fn(),
    upsertSettings: jest
      .fn()
      .mockImplementation(async (input: UpdateCompanySettingsRequestDto) => ({
        ...input,
        updatedAt: '2026-06-10T00:00:00.000Z',
        updatedByName: 'Olivia Owner'
      }))
  };
  const emailProviderService = {
    getEstimateEmailDeliveryStatus: jest.fn()
  };

  return {
    service: new CompanySettingsService(
      identityAccessService as never,
      companySettingsRepository as never,
      emailProviderService as never
    ),
    companySettingsRepository
  };
}

describe('CompanySettingsService', () => {
  it('preserves the configured default sales tax rate when sales tax is disabled', async () => {
    const { service, companySettingsRepository } = createService();

    await service.updateSettings('token', {
      ...validSettings,
      chargesSalesTax: false,
      defaultSalesTaxBasisPoints: 825
    });

    expect(companySettingsRepository.upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        chargesSalesTax: false,
        defaultSalesTaxBasisPoints: 825
      }),
      expect.objectContaining({ id: 'employee-1' })
    );
  });

  it('rejects a default sales tax rate outside the supported range', async () => {
    const { service, companySettingsRepository } = createService();

    await expect(
      service.updateSettings('token', {
        ...validSettings,
        defaultSalesTaxBasisPoints: 2501
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(companySettingsRepository.upsertSettings).not.toHaveBeenCalled();
  });

  it('accepts acceptance-link expiry only within the 7-90 day bounds', async () => {
    const { service, companySettingsRepository } = createService();

    for (const invalid of [6, 91, 30.5]) {
      await expect(
        service.updateSettings('token', {
          ...validSettings,
          acceptanceLinkExpiryDays: invalid
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(companySettingsRepository.upsertSettings).not.toHaveBeenCalled();

    await service.updateSettings('token', { ...validSettings, acceptanceLinkExpiryDays: 7 });
    await service.updateSettings('token', { ...validSettings, acceptanceLinkExpiryDays: 90 });
    expect(companySettingsRepository.upsertSettings).toHaveBeenCalledTimes(2);
  });
});
