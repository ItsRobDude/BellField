import { Module } from '@nestjs/common';
import { CompanyDataModule } from '../company-data/company-data.module';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { MediaConfigService } from './media-config.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MediaTokenService } from './media-token.service';

@Module({
  imports: [CompanyDataModule, IdentityAccessModule],
  controllers: [MediaController],
  providers: [MediaConfigService, MediaStorageService, MediaTokenService, MediaService]
})
export class MediaModule {}
