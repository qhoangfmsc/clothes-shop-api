import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { getMetadataStorage } from 'class-validator';
import { listFiles, ROOT } from '../architecture/source-scan.test-utils';

type DtoClass = new () => object;

// Mọi cặp Create<X>Dto / Update<X>Dto trong thư mục dtos/ bất kỳ cấp nào của modules/: update phải giữ ràng buộc của create và không có khoá "ma" (xem spec common/0007)
const exported = listFiles('src/modules', (file) => file.includes('/dtos/') && file.endsWith('.dto.ts')).flatMap(
  (file) =>
    Object.entries(require(join(ROOT, file)) as Record<string, unknown>).filter(([, value]) => typeof value === 'function') as [
      string,
      DtoClass,
    ][],
);

const byName = new Map(exported);
const pairs = exported
  .map(([name]) => /^Create(\w+)Dto$/.exec(name)?.[1])
  .filter((base): base is string => !!base && byName.has(`Update${base}Dto`))
  .map((base): [string, DtoClass, DtoClass] => [
    base,
    byName.get(`Create${base}Dto`) as DtoClass,
    byName.get(`Update${base}Dto`) as DtoClass,
  ]);

// Chữ ký ổn định của một validator: không tính điều kiện (`@IsOptional`/`@ValidateIf`) vì update cố ý nới điều kiện đó
const signatures = (dto: DtoClass, property: string) =>
  getMetadataStorage()
    .getTargetValidationMetadatas(dto, '', true, false)
    .filter((metadata) => metadata.propertyName === property && metadata.type !== 'conditionalValidation')
    .map(
      (metadata) =>
        `${metadata.type}:${metadata.name ?? ''}:${JSON.stringify(metadata.constraints ?? [], (_k, v) => (typeof v === 'function' ? v.name : v))}`,
    );

const properties = (dto: DtoClass) => [
  ...new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', true, false)
      .map((metadata) => metadata.propertyName),
  ),
];

describe('Update DTOs', () => {
  it('finds the Create/Update pairs', () => {
    expect(pairs.map(([base]) => base)).toEqual(expect.arrayContaining(['Product', 'Category', 'Collection', 'Address', 'Review']));
  });

  describe.each(pairs)('%s', (_base, Create, Update) => {
    it('has no property that the client did not send (no phantom keys)', () => {
      expect(Object.keys(plainToInstance(Update, {}))).toEqual([]);
      expect(Object.keys(plainToInstance(Update, { unrelated: 1 }))).not.toContain('slug');
    });

    it('keeps every constraint of the create DTO on the properties they share', () => {
      const shared = properties(Create).filter((property) => properties(Update).includes(property));
      expect(shared.length).toBeGreaterThan(0);
      for (const property of shared) {
        const updateSignatures = signatures(Update, property);
        for (const signature of signatures(Create, property))
          expect({ property, signature, kept: updateSignatures.includes(signature) }).toEqual({ property, signature, kept: true });
      }
    });
  });
});
