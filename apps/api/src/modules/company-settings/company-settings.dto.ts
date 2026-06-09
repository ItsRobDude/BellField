import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateCompanySettingsRequestDto } from './company-settings.types';

export class UpdateCompanySettingsRequestBodyDto implements UpdateCompanySettingsRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  companyName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  replyToEmail?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  estimateEmailSubject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  estimateEmailBody!: string;
}
