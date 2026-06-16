import { BadRequestException, Injectable } from '@nestjs/common';
import { relayAcceptanceExpiryDays, type PermissionKey } from '@bellfield/contracts';
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
  const invoiceEmailSubject = request.invoiceEmailSubject.trim();
  const invoiceEmailBody = request.invoiceEmailBody.trim();
  const acceptanceLinkExpiryDays = request.acceptanceLinkExpiryDays;
  const chargesSalesTax = request.chargesSalesTax === true;
  const defaultSalesTaxBasisPoints = request.defaultSalesTaxBasisPoints;
  const includeInvoicePaymentLink = request.includeInvoicePaymentLink === true;
  const sendPaymentReceipts = request.sendPaymentReceipts === true;
  const paymentReceiptEmailSubject = request.paymentReceiptEmailSubject.trim();
  const paymentReceiptEmailBody = request.paymentReceiptEmailBody.trim();
  const sendRefundReceipts = request.sendRefundReceipts === true;
  const refundReceiptEmailSubject = request.refundReceiptEmailSubject.trim();
  const refundReceiptEmailBody = request.refundReceiptEmailBody.trim();

  if (!companyName) {
    throw new BadRequestException('Company name is required.');
  }
  if (!estimateEmailSubject) {
    throw new BadRequestException('Estimate email subject is required.');
  }
  if (!estimateEmailBody) {
    throw new BadRequestException('Estimate email body is required.');
  }
  if (!invoiceEmailSubject) {
    throw new BadRequestException('Invoice email subject is required.');
  }
  if (!invoiceEmailBody) {
    throw new BadRequestException('Invoice email body is required.');
  }
  if (
    !Number.isInteger(acceptanceLinkExpiryDays) ||
    acceptanceLinkExpiryDays < relayAcceptanceExpiryDays.min ||
    acceptanceLinkExpiryDays > relayAcceptanceExpiryDays.max
  ) {
    throw new BadRequestException(
      `Approval link expiry must be between ${relayAcceptanceExpiryDays.min} and ${relayAcceptanceExpiryDays.max} days.`
    );
  }
  if (
    !Number.isInteger(defaultSalesTaxBasisPoints) ||
    defaultSalesTaxBasisPoints < 0 ||
    defaultSalesTaxBasisPoints > 2500
  ) {
    throw new BadRequestException('Default sales tax rate must be between 0% and 25%.');
  }
  if (!paymentReceiptEmailSubject) {
    throw new BadRequestException('Payment receipt email subject is required.');
  }
  if (!paymentReceiptEmailBody) {
    throw new BadRequestException('Payment receipt email body is required.');
  }
  if (!refundReceiptEmailSubject) {
    throw new BadRequestException('Refund receipt email subject is required.');
  }
  if (!refundReceiptEmailBody) {
    throw new BadRequestException('Refund receipt email body is required.');
  }

  return {
    companyName,
    replyToEmail: replyToEmail || undefined,
    estimateEmailSubject,
    estimateEmailBody,
    invoiceEmailSubject,
    invoiceEmailBody,
    acceptanceLinkExpiryDays,
    chargesSalesTax,
    defaultSalesTaxBasisPoints,
    includeInvoicePaymentLink,
    sendPaymentReceipts,
    paymentReceiptEmailSubject,
    paymentReceiptEmailBody,
    sendRefundReceipts,
    refundReceiptEmailSubject,
    refundReceiptEmailBody
  };
}
