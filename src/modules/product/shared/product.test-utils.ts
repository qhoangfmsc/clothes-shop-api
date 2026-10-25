export function buildProductQueryKit() {
  const calls: { where: [string, any?][]; orderBy?: unknown[]; addOrderBy?: unknown[] } = { where: [] };
  const qb: any = {
    leftJoinAndSelect: () => qb,
    where: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    andWhere: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    orderBy: (...args: unknown[]) => {
      calls.orderBy = args;
      return qb;
    },
    addOrderBy: (...args: unknown[]) => {
      calls.addOrderBy = args;
      return qb;
    },
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => [[], 0],
  };
  const productRepo: any = { createQueryBuilder: () => qb, findAndCount: jest.fn(async () => [[], 0]) };
  return { productRepo, calls };
}
