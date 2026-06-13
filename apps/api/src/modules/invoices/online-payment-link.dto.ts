import { IsEmail, IsOptional } from 'class-validator';
import type { CreateOnlinePaymentLinkRequest } from '@bellfield/contracts';

export class CreateOnlinePaymentLinkRequestBodyDto implements CreateOnlinePaymentLinkRequest {
  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}
