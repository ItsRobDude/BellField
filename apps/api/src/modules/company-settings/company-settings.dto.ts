import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import type { UpdateCompanySettingsRequestDto } from './company-settings.types';

export class UpdateCompanySettingsRequestBodyDto implements UpdateCompanySettingsRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  companyName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  replyToEmail?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  estimateEmailSubject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  estimateEmailBody!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  invoiceEmailSubject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  invoiceEmailBody!: string;

  @IsInt()
  @Min(7)
  @Max(90)
  acceptanceLinkExpiryDays!: number;

  @IsBoolean()
  chargesSalesTax!: boolean;

  @IsInt()
  @Min(0)
  @Max(2500)
  defaultSalesTaxBasisPoints!: number;

  @IsBoolean()
  includeInvoicePaymentLink!: boolean;

  @IsBoolean()
  sendPaymentReceipts!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  paymentReceiptEmailSubject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  paymentReceiptEmailBody!: string;

  @IsBoolean()
  sendRefundReceipts!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  refundReceiptEmailSubject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  refundReceiptEmailBody!: string;
}
