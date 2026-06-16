import { IsBoolean, IsEmail, IsNumber, IsOptional, Min } from 'class-validator';
import type {
  CreateDepositPaymentLinkRequest,
  CreateOnlinePaymentLinkRequest
} from '@bellfield/contracts';

export class CreateOnlinePaymentLinkRequestBodyDto implements CreateOnlinePaymentLinkRequest {
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsBoolean()
  confirmSameAmountCharge?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmActiveLinkOverage?: boolean;
}

export class CreateDepositPaymentLinkRequestBodyDto implements CreateDepositPaymentLinkRequest {
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  confirmSameAmountCharge?: boolean;
}
