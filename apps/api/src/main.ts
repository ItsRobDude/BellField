import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { log } from './common/logger';
import { getApiRuntimeConfig } from './common/config/runtime-config';
import { MediaConfigService } from './modules/media/media-config.service';

async function bootstrap() {
  // rawBody: true lets registered body parsers preserve the original buffer on
  // `req.rawBody`. JSON parsing stays unchanged; the explicit raw parser below
  // is needed for application/octet-stream media blob uploads.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true
  });
  const runtimeConfig = getApiRuntimeConfig();
  const mediaConfig = app.get(MediaConfigService);

  // Dev/test stay permissive; production uses the configured office-web origin allowlist.
  app.enableCors({ origin: runtimeConfig.officeOrigins });
  app.useBodyParser('raw', {
    type: 'application/octet-stream',
    limit: mediaConfig.getMaxByteSize()
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

  log('info', 'API started.', { port: runtimeConfig.port, environment: runtimeConfig.nodeEnv });
}

void bootstrap();
