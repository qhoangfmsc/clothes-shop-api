import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AllExceptionFilter } from './common/filter/exception.filter';
import { setupSwagger } from './core/swagger/swagger.config';
import { MainModule } from './main.module';

class FilteredLogger extends ConsoleLogger {
  private readonly filteredContexts = ['InstanceLoader', 'RouterExplorer', 'RoutesResolver'];

  log(message: unknown, context?: string): void {
    if (context && this.filteredContexts.includes(context)) {
      return;
    }
    super.log(message, context);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(MainModule, {
    logger: new FilteredLogger(),
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
  });

  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new AllExceptionFilter());

  app.enableShutdownHooks();

  await setupSwagger(app);

  const port = process.env.APP_PORT || 7001;
  await app.listen(port, '0.0.0.0', () => {
    console.log(`🛍️  Clothes Shop API listening on port ${port}`);
    console.log(`📚 Swagger: http://localhost:${port}/api-docs`);
  });

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}

declare const module: any;
void bootstrap();
