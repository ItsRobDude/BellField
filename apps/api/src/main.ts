import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { log } from './common/logger';
import { getApiRuntimeConfig } from './common/config/runtime-config';

async function bootstrap() {
  // rawBody: true preserves the raw request body buffer on `req.rawBody`
  // alongside the normal parsed body. JSON parsing for every other route is
  // unchanged. The MediaController reads `req.rawBody` only on the media
  // blob upload path; no other route consumes it.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const runtimeConfig = getApiRuntimeConfig();

  // Keep local app-to-api wiring simple while the persistent auth/session layer is still forming.
  app.enableCors({ origin: true });
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

  log('info', 'API started.', { port: runtimeConfig.port, environment: runtimeConfig.nodeEnv });
}

void bootstrap();
