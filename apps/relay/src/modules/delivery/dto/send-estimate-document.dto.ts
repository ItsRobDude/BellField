import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import type {
  CustomerDocumentType,
  RelayAcceptanceOptionInput,
  RelayAcceptancePayload,
  RelaySendEstimateDocumentRequest
} from '@bellfield/contracts';

export class SendEstimateDocumentFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @Equals('application/pdf')
  contentType!: 'application/pdf';

  @IsString()
  @IsNotEmpty()
  bytesBase64!: string;
}

export class AcceptanceOptionDto implements RelayAcceptanceOptionInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label!: string;

  @IsInt()
  @Min(0)
  totalCents!: number;
}

export class AcceptancePayloadDto implements RelayAcceptancePayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  estimateRef!: string;

  @IsInt()
  @Min(0)
  estimateVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcceptanceOptionDto)
  options!: AcceptanceOptionDto[];

  // Out-of-range values are clamped to the 7-90 day bounds in the service,
  // not rejected; the DTO only requires a sane integer.
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}

const relayDocumentTypes: readonly CustomerDocumentType[] = ['estimate', 'invoice'];

export class SendEstimateDocumentRequestDto
  implements Omit<RelaySendEstimateDocumentRequest, 'documentType'>
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey!: string;

  // Optional at the DTO boundary so older estimate-only clients continue to
  // work; the controller normalizes missing values to "estimate".
  @ValidateIf((_input, value) => value !== undefined)
  @IsIn(relayDocumentTypes)
  documentType?: CustomerDocumentType;

  @IsEmail()
  recipientEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fromName!: string;

  @IsOptional()
  @IsEmail()
  replyToEmail?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  bodyText!: string;

  @ValidateNested()
  @Type(() => SendEstimateDocumentFileDto)
  document!: SendEstimateDocumentFileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcceptancePayloadDto)
  acceptance?: AcceptancePayloadDto;
}
