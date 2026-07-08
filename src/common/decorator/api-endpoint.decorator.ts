import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface ApiEndpointOptions {
  /** HTTP method — 'post' sẽ dùng @ApiCreatedResponse, còn lại dùng @ApiOkResponse. Default: 'get' */
  method?: HttpMethod;
  /** Show Bearer auth lock icon on Swagger UI */
  auth?: boolean;
}

/**
 * Gộp @ApiOperation + @ApiOkResponse/@ApiCreatedResponse thành 1 decorator gọn.
 *
 * @example
 * @ApiEndpoint('List all namespaces')
 * @ApiEndpoint('Create feature', { method: 'post' })
 */
export function ApiEndpoint(summary: string, options?: ApiEndpointOptions): MethodDecorator {
  const method = options?.method ?? 'get';

  const decorators: (MethodDecorator | ClassDecorator)[] = [
    ApiOperation({ summary }),
    method === 'post' ? ApiCreatedResponse() : ApiOkResponse(),
  ];

  if (options?.auth) {
    decorators.push(ApiBearerAuth());
  }

  return applyDecorators(...decorators);
}
