import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error(`Failed to start application: ${error.message}`, 'Bootstrap');
  process.exit(1);
});
