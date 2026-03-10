import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configService } from '@smart-schedule/config';

async function bootstrap() {
  const config = configService.all;
  const app = await NestFactory.create(AppModule);
  await app.listen(3002); // Scheduler health check port
}
bootstrap();
