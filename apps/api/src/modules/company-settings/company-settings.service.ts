import { BadRequestException, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CompanySettingsRepository } from './company-settings.repository';
import type {
  CompanySettingsResponseDto,
  UpdateCompanySettingsRequestDto
} from './company-settings.types';

@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly companySettingsRepository: CompanySettingsRepository
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

  if (!companyName) {
    throw new BadRequestException('Company name is required.');
  }
  if (!estimateEmailSubject) {
    throw new BadRequestException('Estimate email subject is required.');
  }
  if (!estimateEmailBody) {
    throw new BadRequestException('Estimate email body is required.');
  }

  return {
    companyName,
    replyToEmail: replyToEmail || undefined,
    estimateEmailSubject,
    estimateEmailBody
  };
}
