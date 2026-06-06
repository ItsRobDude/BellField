import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { HistoryQuery, HistoryRecordType } from '@bellfield/contracts';

const RECORD_TYPES: HistoryRecordType[] = [
  'jobTimeline',
  'registerEntry',
  'inventoryMovement',
  'jobCostEvent',
  'payment',
  'equipmentHistory'
];

export class HistoryQueryDto implements HistoryQuery {
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  actorEmployeeId?: string;

  @IsOptional()
  @IsIn(RECORD_TYPES)
  recordType?: HistoryRecordType;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  // Upper bound is clamped server-side (MAX_LIMIT); here we only enforce a positive integer.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
