import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { buildOpenApiDocument } from './openapi.document';

export const openApiDocumentPath = '/openapi/v1.json';

export function configureOpenApi(app: NestFastifyApplication) {
  const document = buildOpenApiDocument();
  const fastify = app.getHttpAdapter().getInstance();

  fastify.get(openApiDocumentPath, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('content-type', 'application/json; charset=utf-8');
    return document;
  });

  fastify.get('/openapi.json', async (_request, reply) => {
    reply.redirect(openApiDocumentPath);
  });

  return document;
}
