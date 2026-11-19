import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { JsonLogger } from './json-logger';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? new JsonLogger() : undefined,
  });
  setupApp(app);
  await app.listen(env.port);
  Logger.log(`Tedix API listening on port ${env.port}`, 'Bootstrap');
}

void bootstrap();
