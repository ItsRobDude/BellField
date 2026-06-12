import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { homeownerNoteMaxLength } from '../acceptance.service';

export class AcceptanceDecisionRequestDto {
  @IsIn(['approve', 'decline'])
  decision!: 'approve' | 'decline';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  optionId?: string;

  // Code values are validated against the fixed reason list in the service;
  // the DTO only bounds the shape.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  declineReasons?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(homeownerNoteMaxLength)
  note?: string;
}
