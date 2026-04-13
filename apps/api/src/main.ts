import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { log } from './common/logger';
import { getApiRuntimeConfig } from './common/config/runtime-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const runtimeConfig = getApiRuntimeConfig();

  // Keep local app-to-api wiring simple while the persistent auth/session layer is still forming.
  app.enableCors({ origin: true });
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(runtimeConfig.port);

  log('info', 'API started.', { port: runtimeConfig.port, environment: runtimeConfig.nodeEnv });
}

void bootstrap();
