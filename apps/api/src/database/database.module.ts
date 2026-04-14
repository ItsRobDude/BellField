import { Global, Module } from '@nestjs/common';
import { DatabaseBootstrapService } from './database-bootstrap.service';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService, DatabaseBootstrapService],
  exports: [DatabaseService]
})
export class DatabaseModule {}
