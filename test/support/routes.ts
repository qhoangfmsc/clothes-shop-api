import { PERMISSIONS_KEY } from '@common/decorator/permissions.decorator';
import { IS_PUBLIC_KEY } from '@common/decorator/public.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, Reflector } from '@nestjs/core';

export interface RouteInfo {
  /** `GET`, `POST`, `PATCH`... */
  method: string;
  /** Đường dẫn đầy đủ dạng Express, vd `/api/orders/:orderId` (không có `/` cuối, trừ route gốc `/`) */
  path: string;
  isPublic: boolean;
  /** Quyền khai báo bằng `@Permissions(...)`; user cần ít nhất một trong số này. Rỗng với route public */
  permissions: number[];
  /** `ControllerName.methodName`, để thông báo lỗi chỉ thẳng tới code */
  handler: string;
}

const toArray = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : [value ?? '']);

export const routeKey = (route: Pick<RouteInfo, 'method' | 'path'>) => `${route.method} ${route.path}`;

const normalizePath = (...parts: string[]): string => {
  const path = `/${parts.join('/')}`.replace(/\/+/g, '/');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
};

/**
 * Tự phát hiện mọi route từ metadata của Nest (không đọc file controller): nguồn sự thật là chính app đang chạy,
 * nên route/quyền thêm sau này tự được kiểm. Kết quả sắp theo `path` rồi `method` để ổn định giữa các lần chạy.
 */
export function discoverRoutes(app: INestApplication): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const basePaths = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
    if (basePaths === undefined) continue;

    // Duyệt cả chuỗi prototype để không sót handler của controller kế thừa
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

/** Tên quyền đọc được: `ORDER_VIEW_LIST(3000)`; mã không có trong enum hiện là `UNKNOWN(1234)` để lộ ra ở snapshot */
export const permissionLabel = (code: number): string => `${(Permission as unknown as Record<number, string>)[code] ?? 'UNKNOWN'}(${code})`;

/** Bảng route–quyền dạng text để làm snapshot: đổi quyền hay thêm/bớt route nào thì diff nêu đúng dòng đó */
export function formatRouteTable(routes: RouteInfo[]): string {
  return routes
    .map((route) => {
      const access = route.isPublic ? 'PUBLIC' : `AUTH   ${route.permissions.map(permissionLabel).join(' | ') || '(none)'}`;
      return `${route.method.padEnd(6)} ${route.path.padEnd(48)} ${access}`;
    })
    .join('\n');
}
