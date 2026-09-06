// Keep this import first: it seeds process.env from local .env files (development only).
import './common/config/load-local-env';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { log } from './common/logger';
import { getRelayRuntimeConfig } from './common/config/runtime-config';

async function bootstrap() {
  const runtimeConfig = getRelayRuntimeConfig();

  // rawBody: true preserves the original request bytes on req.rawBody, which
  // provider webhook signature verification needs.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true
  });

  // A base64-encoded PDF at the shared attachment cap is ~20 MB of JSON; the
  // Express default 100 kb limit would reject every real send.
  app.useBodyParser('json', { limit: 25_000_000 });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
      }
    })
  );

  await app.listen(runtimeConfig.port);

  log('info', 'Relay started.', { port: runtimeConfig.port, environment: runtimeConfig.nodeEnv });
}

void bootstrap();
