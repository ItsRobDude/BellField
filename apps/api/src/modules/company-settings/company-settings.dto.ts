import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type {
  UpdateCompanySettingsRequestDto,
  UpdateEmailProviderSecretRequestDto
} from './company-settings.types';

export class UpdateCompanySettingsRequestBodyDto implements UpdateCompanySettingsRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  customerFacingSenderName!: string;

  @IsEmail()
  @MaxLength(254)
  customerFacingFromEmail!: string;

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

export class UpdateEmailProviderSecretRequestBodyDto
  implements UpdateEmailProviderSecretRequestDto
{
  @IsIn(['resend'])
  provider!: 'resend';

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  apiKey!: string;
}
