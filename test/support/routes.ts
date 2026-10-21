import { PERMISSIONS_KEY } from '@common/decorator/permissions.decorator';
import { IS_PUBLIC_KEY } from '@common/decorator/public.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { normalizePath } from './route-path';

export interface RouteInfo {
  method: string;
  /** Dạng Express, vd `/api/orders/:orderId`, không có `/` cuối */
  path: string;
  isPublic: boolean;
  /** Cần ít nhất một trong các quyền này; rỗng với route public */
  permissions: number[];
  /** `ControllerName.methodName` */
  handler: string;
}

const toArray = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : [value ?? '']);

export const routeKey = (route: Pick<RouteInfo, 'method' | 'path'>) => `${route.method} ${route.path}`;

/** Tự phát hiện route từ metadata của Nest; sắp theo path rồi method để ổn định. */
export function discoverRoutes(app: INestApplication): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const basePaths = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
    if (basePaths === undefined) continue;

    // cả chuỗi prototype để không sót handler kế thừa
    const handlers = new Set<string>();
    for (let proto = Object.getPrototypeOf(instance); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) if (name !== 'constructor') handlers.add(name);
    }

    for (const name of handlers) {
      const handler = instance[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;

      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) === true;
      const permissions = reflector.getAllAndOverride<number[]>(PERMISSIONS_KEY, [handler, metatype]) ?? [];
      const handlerPaths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;

      for (const base of toArray(basePaths)) {
        for (const sub of toArray(handlerPaths)) {
          routes.push({
            method: RequestMethod[method],
            path: normalizePath(base, sub),
            isPublic,
            permissions: [...permissions],
            handler: `${metatype.name}.${name}`,
          });
        }
      }
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export const SAMPLE_ID = 'aaaaaaaaaaaaaaaa';

/** Thay mọi `:param` bằng id mẫu để gọi thử route. */
export const concretePath = (path: string): string => path.replace(/:[A-Za-z]+/g, SAMPLE_ID);

/** `ORDER_VIEW_LIST(3000)`; mã không có trong enum hiện là `UNKNOWN(...)`. */
export const permissionLabel = (code: number): string => `${(Permission as unknown as Record<number, string>)[code] ?? 'UNKNOWN'}(${code})`;

/** Bảng route–quyền dạng text cho snapshot. */
export function formatRouteTable(routes: RouteInfo[]): string {
  return routes
    .map((route) => {
      const access = route.isPublic ? 'PUBLIC' : `AUTH   ${route.permissions.map(permissionLabel).join(' | ') || '(none)'}`;
      return `${route.method.padEnd(6)} ${route.path.padEnd(48)} ${access}`;
    })
    .join('\n');
}
