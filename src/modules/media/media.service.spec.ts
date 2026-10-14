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

describe('MediaService review images', () => {
  const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_STORAGE_BUCKET: 'media', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const PUBLIC = 'https://x.supabase.co/storage/v1/object/public/media/';
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const file = (over: Partial<Express.Multer.File> = {}) =>
    ({ originalname: 'Áo đẹp.png', buffer: PNG, size: PNG.length, ...over }) as Express.Multer.File;

  function build(opts: { recentUploads?: number; found?: { storageKey: string }[] } = {}) {
    const configService = { get: jest.fn((key: string) => (ENV as Record<string, string>)[key]) } as unknown as ConfigService;
    const countQb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => opts.recentUploads ?? 0),
    };
    const repo: any = {
      createQueryBuilder: jest.fn(() => countQb),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (data: any) => ({ id: 'm1', createdAt: new Date('2026-01-01T00:00:00Z'), ...data })),
      find: jest.fn(async () => opts.found ?? []),
      findOne: jest.fn(async () => null),
    };
    return { service: new MediaService(configService, repo), repo, countQb };
  }

  beforeEach(() => {
    global.fetch = jest.fn(async () => new Response(null, { status: 200 })) as any;
  });

  it('the admin library only lists LIBRARY files', async () => {
    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => 0),
      getMany: jest.fn(async () => []),
    };
    const service = new MediaService(
      { get: (k: string) => (ENV as Record<string, string>)[k] } as any,
      { createQueryBuilder: () => qb } as any,
    );
    await service.findAll({} as any);
    expect(qb.andWhere).toHaveBeenCalledWith('m.purpose = :purpose', { purpose: 'LIBRARY' });
  });

  it('upload stores a REVIEW image with its owner; admin uploads stay LIBRARY with no owner', async () => {
    const review = build();
    await review.service.upload(file(), { purpose: 'REVIEW', uploadedBy: 'u1' });
    expect(review.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'REVIEW', uploadedBy: 'u1', mimeType: 'image/png' }),
    );

    const admin = build();
    await admin.service.upload(file());
    expect(admin.repo.create).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'LIBRARY', uploadedBy: null }));
    expect(admin.countQb.getCount).not.toHaveBeenCalled();
  });

  it('review uploads are limited per user per 24 hours (429, nothing sent to storage)', async () => {
    const { service, repo, countQb } = build({ recentUploads: 30 });
    await expect(service.upload(file(), { purpose: 'REVIEW', uploadedBy: 'u1' })).rejects.toMatchObject({
      status: 429,
      response: { errorCode: 1607 },
    });
    expect(countQb.where).toHaveBeenCalledWith('m.uploadedBy = :userId', { userId: 'u1' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();

    const under = build({ recentUploads: 29 });
    await expect(under.service.upload(file(), { purpose: 'REVIEW', uploadedBy: 'u1' })).resolves.toBeDefined();
  });

  it('only LIBRARY files can be deleted through the admin API', async () => {
    const { service, repo } = build();
    await expect(service.delete('m1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1604 } });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'm1', purpose: 'LIBRARY' } });
  });

  describe('resolveReviewImageUrls', () => {
    it('returns canonical URLs, in order, for images the user uploaded for reviews', async () => {
      const { service, repo } = build({ found: [{ storageKey: 'a.png' }, { storageKey: 'b c.png' }] });
      const urls = [`${PUBLIC}b%20c.png`, `${PUBLIC}a.png`];
      expect(await service.resolveReviewImageUrls('u1', urls)).toEqual([`${PUBLIC}b%20c.png`, `${PUBLIC}a.png`]);
      const where = repo.find.mock.calls[0][0].where;
      expect(where).toMatchObject({ purpose: 'REVIEW', uploadedBy: 'u1' });
    });

    it('returns null when any URL is not in this bucket, is malformed, or is not an owned REVIEW image', async () => {
      const found = build({ found: [{ storageKey: 'a.png' }] });
      expect(await found.service.resolveReviewImageUrls('u1', [`${PUBLIC}a.png`, `${PUBLIC}other.png`])).toBeNull();
      expect(await found.service.resolveReviewImageUrls('u1', ['https://evil.test/a.png'])).toBeNull();
      expect(await found.service.resolveReviewImageUrls('u1', [`${PUBLIC}%E0%A4%A`])).toBeNull();
      expect(
        await found.service.resolveReviewImageUrls('u1', ['https://x.supabase.co/storage/v1/object/public/other-bucket/a.png']),
      ).toBeNull();
    });

    it('an empty list needs no lookup', async () => {
      const { service, repo } = build();
      expect(await service.resolveReviewImageUrls('u1', [])).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});
