import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';

function setup(env: Record<string, string | undefined>, rows: any[] = []) {
  const configService = { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService;
  const qb: any = {
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(async () => rows.length),
    getMany: jest.fn(async () => rows),
  };
  const repo: any = { createQueryBuilder: jest.fn(() => qb) };
  return new MediaService(configService, repo);
}

const row = {
  id: 'm1',
  name: 'a.png',
  storageKey: 'abc-a.png',
  mimeType: 'image/png',
  size: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('MediaService.findAll', () => {
  it('builds public URLs without needing SUPABASE_SERVICE_ROLE_KEY', async () => {
    const service = setup({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_STORAGE_BUCKET: 'media' }, [row]);
    const res = await service.findAll({} as any);
    expect(res.data[0].url).toBe('https://x.supabase.co/storage/v1/object/public/media/abc-a.png');
    expect(res).toMatchObject({ total: 1, page: 1, limit: 25, totalPages: 1 });
  });

  it.each([[[row]], [[]]])('fails the same way (503) when URL/bucket are missing, regardless of rows', async (rows) => {
    const service = setup({ SUPABASE_SERVICE_ROLE_KEY: 'k' }, rows);
    await expect(service.findAll({} as any)).rejects.toMatchObject({
      status: 503,
      response: { errorCode: 1601, message: expect.stringContaining('SUPABASE_URL, SUPABASE_STORAGE_BUCKET') },
    });
  });
});
