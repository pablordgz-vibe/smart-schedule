import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApiApp(app: INestApplication) {
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as {
    set?: (setting: string, value: unknown) => void;
  };

  instance.set?.('trust proxy', 1);
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  return app;
}
