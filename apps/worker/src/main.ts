import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configService } from '@smart-schedule/config';
import { runtimeServices } from '@smart-schedule/contracts';
import { AppModule } from './app.module';

async function bootstrap() {
  const config = configService.all;
  const app = await NestFactory.create(AppModule);
  await app.listen(config.PORT, config.HOST);
  Logger.log(
    `${runtimeServices.worker.displayName} is running on: ${await app.getUrl()}`,
  );
}
void bootstrap();
