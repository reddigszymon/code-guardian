import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  Logger.error(`Failed to start application: ${msg}`, 'Bootstrap');
  process.exit(1);
});
