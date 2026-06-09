import { BadRequestException, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CompanySettingsRepository } from './company-settings.repository';
import { SecretCryptoService } from './secret-crypto.service';
import type {
  CompanySettingsResponseDto,
  EmailProviderSecretResponseDto,
  UpdateCompanySettingsRequestDto,
  UpdateEmailProviderSecretRequestDto
} from './company-settings.types';

@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly companySettingsRepository: CompanySettingsRepository,
    private readonly secretCryptoService: SecretCryptoService
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

  async updateEmailProviderSecret(
    sessionToken: string,
    request: UpdateEmailProviderSecretRequestDto
  ): Promise<EmailProviderSecretResponseDto> {
    const actor = await this.authorize(sessionToken, 'companySettings:configure');
    const apiKey = request.apiKey.trim();
    if (!apiKey) {
      throw new BadRequestException('Email provider API key is required.');
    }
    const encryptedSecret = this.secretCryptoService.encryptSecret(apiKey);
    return {
      emailProvider: await this.companySettingsRepository.upsertEmailProviderSecret(
        request.provider,
        encryptedSecret,
        actor
      )
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
  const customerFacingSenderName = request.customerFacingSenderName.trim();
  const customerFacingFromEmail = request.customerFacingFromEmail.trim().toLowerCase();
  const replyToEmail = request.replyToEmail?.trim().toLowerCase();
  const estimateEmailSubject = request.estimateEmailSubject.trim();
  const estimateEmailBody = request.estimateEmailBody.trim();

  if (!companyName) {
    throw new BadRequestException('Company name is required.');
  }
  if (!customerFacingSenderName) {
    throw new BadRequestException('Sender name is required.');
  }
  if (!estimateEmailSubject) {
    throw new BadRequestException('Estimate email subject is required.');
  }
  if (!estimateEmailBody) {
    throw new BadRequestException('Estimate email body is required.');
  }

  return {
    companyName,
    customerFacingSenderName,
    customerFacingFromEmail,
    replyToEmail: replyToEmail || undefined,
    estimateEmailSubject,
    estimateEmailBody
  };
}
