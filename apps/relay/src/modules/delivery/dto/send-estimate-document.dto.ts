import { Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';
import type { RelaySendEstimateDocumentRequest } from '@bellfield/contracts';

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

export class SendEstimateDocumentRequestDto implements RelaySendEstimateDocumentRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey!: string;

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
}
