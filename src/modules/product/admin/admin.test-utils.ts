import { buildProductQueryKit } from '../shared/product.test-utils';
import { ProductAdminQueryService } from './product-admin-query.service';

export function setup() {
  const { productRepo, calls } = buildProductQueryKit();
  return { service: new ProductAdminQueryService(productRepo, {} as any, { getVndPerUsd: async () => 25000 } as any), calls, productRepo };
}
