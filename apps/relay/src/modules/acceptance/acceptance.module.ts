import { Module } from '@nestjs/common';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { IdentityModule } from '../identity/identity.module';
import { AcceptanceDecisionsController } from './acceptance-decisions.controller';
import { AcceptanceLinksRepository } from './acceptance-links.repository';
import { AcceptancePageController } from './acceptance-page.controller';
import {
  ACCEPTANCE_LINKS_STORE,
  ACCEPTANCE_PUBLIC_BASE_URL,
  AcceptanceLinksService
} from './acceptance.service';

@Module({
  imports: [IdentityModule],
  controllers: [AcceptancePageController, AcceptanceDecisionsController],
  providers: [
    AcceptanceLinksRepository,
    { provide: ACCEPTANCE_LINKS_STORE, useExisting: AcceptanceLinksRepository },
    {
      provide: ACCEPTANCE_PUBLIC_BASE_URL,
      useFactory: () => getRelayRuntimeConfig().publicBaseUrl
    },
    AcceptanceLinksService
  ],
  exports: [AcceptanceLinksService]
})
export class AcceptanceModule {}
