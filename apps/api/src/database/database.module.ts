import { Global, Module } from '@nestjs/common';
import { DatabaseBootstrapService } from './database-bootstrap.service';
import { DatabaseService } from './database.service';
import { MigrationReadinessService } from './migration-readiness.service';

@Global()
@Module({
  providers: [DatabaseService, DatabaseBootstrapService, MigrationReadinessService],
  exports: [DatabaseService, MigrationReadinessService]
})
export class DatabaseModule {}
