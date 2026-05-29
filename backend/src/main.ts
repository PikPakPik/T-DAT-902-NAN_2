import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  const port = process.env.PORT || 3000;

  app.setGlobalPrefix(globalPrefix);
  await app.listen(port);

  if (process.env.NODE_ENV === 'development') {
    Logger.warn(
      'Running in development mode. Do not forget to set NODE_ENV to production when deploying.',
    );
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
void bootstrap();
