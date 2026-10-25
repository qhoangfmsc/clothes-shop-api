import { buildProductQueryKit } from '../shared/product.test-utils';
import { ProductCatalogQueryService } from './product-catalog-query.service';

export function setup() {
  const { productRepo, calls } = buildProductQueryKit();
  return { service: new ProductCatalogQueryService(productRepo, { getVndPerUsd: async () => 25000 } as any), calls, productRepo };
}
