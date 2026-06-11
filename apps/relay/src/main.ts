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
