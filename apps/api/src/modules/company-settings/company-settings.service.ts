import { BadRequestException, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { EmailProviderService } from '../customer-delivery/email-provider.service';
import { CompanySettingsRepository } from './company-settings.repository';
import type {
  CompanySettingsResponseDto,
  EstimateEmailDeliveryStatusResponseDto,
  UpdateCompanySettingsRequestDto
} from './company-settings.types';

@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly companySettingsRepository: CompanySettingsRepository,
    private readonly emailProviderService: EmailProviderService
  ) {}

  async getSettings(sessionToken: string): Promise<CompanySettingsResponseDto> {
    await this.authorize(sessionToken, 'companySettings:view');
    return { settings: await this.companySettingsRepository.getSettings() };
  }

  async updateSettings(
    sessionToken: string,
    request: UpdateCompanySettingsRequestDto
  ): Promise<CompanySettingsResponseDto> {
    const actor = await this.authorize(sessionToken, 'companySettings:configure');
    const normalized = normalizeSettings(request);
    return {
      settings: await this.companySettingsRepository.upsertSettings(normalized, actor)
    };
  }

  async getEstimateEmailDeliveryStatus(
    sessionToken: string
  ): Promise<EstimateEmailDeliveryStatusResponseDto> {
    await this.authorize(sessionToken, 'companySettings:view');
    return {
      deliveryStatus: await this.emailProviderService.getEstimateEmailDeliveryStatus()
    };
  }

  private authorize(sessionToken: string, permission: PermissionKey) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
  }
}

function normalizeSettings(
  request: UpdateCompanySettingsRequestDto
): UpdateCompanySettingsRequestDto {
  const companyName = request.companyName.trim();
  const replyToEmail = request.replyToEmail?.trim().toLowerCase();
  const estimateEmailSubject = request.estimateEmailSubject.trim();
  const estimateEmailBody = request.estimateEmailBody.trim();
  const chargesSalesTax = request.chargesSalesTax === true;
  const defaultSalesTaxBasisPoints = chargesSalesTax ? request.defaultSalesTaxBasisPoints : 0;

  if (!companyName) {
    throw new BadRequestException('Company name is required.');
  }
  if (!estimateEmailSubject) {
    throw new BadRequestException('Estimate email subject is required.');
  }
  if (!estimateEmailBody) {
    throw new BadRequestException('Estimate email body is required.');
  }
  if (
    !Number.isInteger(defaultSalesTaxBasisPoints) ||
    defaultSalesTaxBasisPoints < 0 ||
    defaultSalesTaxBasisPoints > 2500
  ) {
    throw new BadRequestException('Default sales tax rate must be between 0% and 25%.');
  }

  return {
    companyName,
    replyToEmail: replyToEmail || undefined,
    estimateEmailSubject,
    estimateEmailBody,
    chargesSalesTax,
    defaultSalesTaxBasisPoints
  };
}
