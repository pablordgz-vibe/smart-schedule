import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApiApp, createApiAdapter } from './app.factory';
import { configService } from '@smart-schedule/config';
import { runtimeServices } from '@smart-schedule/contracts';

async function bootstrap() {
  const config = configService.all;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createApiAdapter(),
  );
  configureApiApp(app);
  await app.listen({
    host: config.HOST,
    port: config.PORT,
  });
  Logger.log(
    `${runtimeServices.api.displayName} is running on: ${await app.getUrl()}`,
  );
}
void bootstrap();
