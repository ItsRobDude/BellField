import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { log } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);

  log('info', 'API started.', { port, environment: process.env.NODE_ENV ?? 'development' });
}

void bootstrap();
