import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export async function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Clothes Shop API')
    .setDescription('Ori Baebi — Backend API for the fashion e-commerce store')
    .setVersion('1.0')
    .addTag('Products', 'Product listing and detail')
    .addTag('Categories', 'Category and subcategory management')
    .addTag('Collections', 'Curated product collections')
    .addTag('Reviews', 'Product reviews')
    .addTag('Shipping', 'Shipping methods and return policy')
    .addTag('Size Guides', 'Size guide by category')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: -1,
      docExpansion: 'none',
      displayRequestDuration: true,
      tryItOutEnabled: true,
      syntaxHighlight: {
        theme: 'agate',
      },
    },
    customSiteTitle: 'Clothes Shop API Documentation',
  });
}
