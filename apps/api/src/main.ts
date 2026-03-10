import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApiApp } from './app.factory';
import { configService } from '@smart-schedule/config';
import { runtimeServices } from '@smart-schedule/contracts';

async function bootstrap() {
  const config = configService.all;
  const app = await NestFactory.create(AppModule);
  configureApiApp(app);
  await app.listen(config.PORT, config.HOST);
  Logger.log(
    `${runtimeServices.api.displayName} is running on: ${await app.getUrl()}`,
  );
}
void bootstrap();
