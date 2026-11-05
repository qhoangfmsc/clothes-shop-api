import { createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 23 (size-guide): bảng size tĩnh theo nhóm, công khai. */
describe('Flow: size guides', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const guide = (category: string) => t.api.get(`/api/size-guides/${encodeURIComponent(category)}`);

  it.each([
    ['tops', ['Size', 'Bust', 'Waist', 'Length'], ['XS', 'S', 'M', 'L', 'XL']],
    ['skirts', ['Size', 'Waist', 'Hips', 'Length'], ['XS', 'S', 'M', 'L', 'XL']],
    ['bags', ['Size', 'Width', 'Height', 'Depth'], ['Mini', 'Small', 'Medium', 'Large']],
    ['jewelry', ['Size', 'Circumference'], ['5', '6', '7', '8', '9']],
  ])('returns the %s guide with its columns, size rows and tips, without a token', async (category, columns, sizes) => {
    const res = await guide(category).expect(200);

    expect(res.body.data).toMatchObject({ category, unit: 'cm', columns, title: expect.any(String), description: expect.any(String) });
    expect(res.body.data.rows.map((row: { size: string }) => row.size)).toEqual(sizes);
    expect(res.body.data.tips).toHaveLength(3);
    for (const row of res.body.data.rows) expect(Object.keys(row).sort()).toEqual(columns.map((c) => c.toLowerCase()).sort());
  });

  it('gives measurement ranges as strings for the tops guide', async () => {
    const res = await guide('tops').expect(200);

    expect(res.body.data.rows[0]).toEqual({ size: 'XS', bust: '80-84', waist: '60-64', length: '58' });
  });

  it.each([
    'shoes',
    'TOPS',
    'Tops',
    'khong-co',
    'a'.repeat(300),
  ])('answers 200 with data: null for the unknown category %s', async (category) => {
    const res = await guide(category).expect(200);

    expect(res.body).toEqual({ data: null });
  });
});
