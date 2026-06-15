import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { RelayCreateRefundRequest } from '@bellfield/contracts';

export class CreateRefundRequestDto implements RelayCreateRefundRequest {
  @IsString()
  @MaxLength(200)
  idempotencyKey!: string;

  @IsString()
  @MaxLength(200)
  providerSessionId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
