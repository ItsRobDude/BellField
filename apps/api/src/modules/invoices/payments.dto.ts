import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type {
  RecordPaymentRequest,
  RecordRefundRequest,
  VoidPaymentRequest
} from '@bellfield/contracts';
import { paymentMethods, type PaymentMethodValue } from './payments.types';

export class RecordPaymentRequestBodyDto implements RecordPaymentRequest {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(paymentMethods)
  method!: PaymentMethodValue;

  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class VoidPaymentRequestBodyDto implements VoidPaymentRequest {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RecordRefundRequestBodyDto implements RecordRefundRequest {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
