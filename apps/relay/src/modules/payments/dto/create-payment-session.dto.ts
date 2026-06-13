import {
  IsEmail,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';
import type { RelayCreatePaymentSessionRequest } from '@bellfield/contracts';

export class CreatePaymentSessionRequestDto implements RelayCreatePaymentSessionRequest {
  @IsString()
  @MaxLength(200)
  idempotencyKey!: string;

  @IsString()
  @MaxLength(200)
  jobRef!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceRef?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsISO4217CurrencyCode()
  currency!: string;

  @IsString()
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}
