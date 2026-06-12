import { Module } from '@nestjs/common';
import { getRelayRuntimeConfig } from '../../common/config/runtime-config';
import { IdentityModule } from '../identity/identity.module';
import { ReleasesController } from './releases.controller';
import { RelayReleasesRepository } from './releases.repository';
import { RELAY_RELEASES_STORE, ReleasesService } from './releases.service';
import type { RelayReleasesStore } from './releases.types';

@Module({
  imports: [IdentityModule],
  controllers: [ReleasesController],
  providers: [
    RelayReleasesRepository,
    { provide: RELAY_RELEASES_STORE, useExisting: RelayReleasesRepository },
    {
      provide: ReleasesService,
      useFactory: (store: RelayReleasesStore) =>
        new ReleasesService(store, getRelayRuntimeConfig().artifactsRoot),
      inject: [RELAY_RELEASES_STORE]
    }
  ]
})
export class ReleasesModule {}
