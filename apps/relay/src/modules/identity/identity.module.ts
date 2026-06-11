import { Module } from '@nestjs/common';
import { RelayAuthGuard } from './relay-auth.guard';
import { RelayAuthService, relayIdentityStoreProvider } from './relay-auth.service';
import { RelayIdentityRepository } from './relay-identity.repository';

@Module({
  providers: [
    RelayIdentityRepository,
    relayIdentityStoreProvider,
    RelayAuthService,
    RelayAuthGuard
  ],
  exports: [RelayIdentityRepository, RelayAuthService, RelayAuthGuard]
})
export class IdentityModule {}
