// X-Ray must be imported first to capture all HTTP clients
import { AWSXRay } from './xray';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from './logger/logger.service';
import { CacheService } from './cache/cache.service';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

async function bootstrap() {
  // Create Express app with X-Ray middleware
  const expressApp = express();
  expressApp.use(AWSXRay.express.openSegment('magician-props-api'));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
  });

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Resolve CacheService and explicitly initialize (onModuleInit doesn't work with request-scoped deps)
  const cacheService = await app.resolve(CacheService);
  cacheService.initializeCache().catch((err) => logger.error('Cache init failed', err, 'Bootstrap'));

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Close segment must be registered after all routes
  app.use(AWSXRay.express.closeSegment());

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0', () => {
    logger.log(`Server running on http://0.0.0.0:${port}`, 'Bootstrap');
  });
}
bootstrap();
