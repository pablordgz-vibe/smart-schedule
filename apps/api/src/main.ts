import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configService } from '@smart-schedule/config';

async function bootstrap() {
  // Validate env vars before starting
  const config = configService.all;
  const app = await NestFactory.create(AppModule);
  await app.listen(config.PORT);
  Logger.log(`API is running on: ${await app.getUrl()}`);
}
void bootstrap();
