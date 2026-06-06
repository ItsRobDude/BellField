import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [IdentityAccessModule],
  controllers: [HistoryController],
  providers: [HistoryService]
})
export class HistoryModule {}
