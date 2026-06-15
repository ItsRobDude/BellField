import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { OnlineRefundRequest } from '@bellfield/contracts';

export class RequestOnlineRefundBodyDto implements OnlineRefundRequest {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
